'use client'

import { invoke } from '@/lib/tauri/client'

export type RemoteStorageMode = 'local' | 'remoteWriter' | 'remoteReader' | 'remoteOfflineCache'
export type RemoteVaultSyncPhase = 'idle' | 'pulling' | 'pushing'
export type RemoteVaultSyncPriority = 'none' | 'low' | 'medium' | 'high'
export type RemoteVaultSyncKind = 'background' | 'manual'

export type RemoteVaultLease = {
  deviceId: string
  hostname: string
  createdAt: string
  expiresAt: string
}

export type RemoteVaultStatus = {
  enabled: boolean
  mode: RemoteStorageMode
  isWritable: boolean
  isOffline: boolean
  path?: string | null
  vaultId?: string | null
  deviceId: string
  revision?: number | null
  remoteUpdatedAt?: string | null
  remoteLastPulledAt?: string | null
  remoteLastPushedAt?: string | null
  activeLease?: RemoteVaultLease | null
  message: string
  cacheBytes: number
}

export type RemoteVaultDirtyDomains = {
  snapshotTablesDirty: boolean
  blobPdfDirty: boolean
  blobTextDirty: boolean
  blobThumbnailDirty: boolean
  readerStateDirty: boolean
}

export type RemoteVaultSyncQueueState = {
  dirty: RemoteVaultDirtyDomains
  highestPriority: RemoteVaultSyncPriority
  hasPendingSync: boolean
  pendingRerun: boolean
  activeKind: RemoteVaultSyncKind | null
  longRunning: boolean
}

export type MarkRemoteVaultDirtyOptions = {
  priority: Exclude<RemoteVaultSyncPriority, 'none'>
  domains?: Partial<RemoteVaultDirtyDomains>
}

type PersistedRemoteVaultSyncState = {
  dirty?: Partial<RemoteVaultDirtyDomains>
  highestPriority?: RemoteVaultSyncPriority
  hasPendingSync?: boolean
}

const LOCAL_STATUS: RemoteVaultStatus = {
  enabled: false,
  mode: 'local',
  isWritable: true,
  isOffline: false,
  deviceId: '',
  message: 'Using local library storage.',
  cacheBytes: 0,
}

const CLEAN_DIRTY_DOMAINS: RemoteVaultDirtyDomains = {
  snapshotTablesDirty: false,
  blobPdfDirty: false,
  blobTextDirty: false,
  blobThumbnailDirty: false,
  readerStateDirty: false,
}

const DEFAULT_QUEUE_STATE: RemoteVaultSyncQueueState = {
  dirty: CLEAN_DIRTY_DOMAINS,
  highestPriority: 'none',
  hasPendingSync: false,
  pendingRerun: false,
  activeKind: null,
  longRunning: false,
}

const PRIORITY_ORDER: Record<RemoteVaultSyncPriority, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
}

const PRIORITY_DELAY_MS: Record<Exclude<RemoteVaultSyncPriority, 'none'>, number> = {
  high: 30_000,
  medium: 60_000,
  low: 5 * 60_000,
}

const LONG_RUNNING_SYNC_THRESHOLD_MS = 2_000

let currentRemoteVaultStatus: RemoteVaultStatus = LOCAL_STATUS
const statusListeners = new Set<(status: RemoteVaultStatus) => void>()
let currentRemoteVaultSyncPhase: RemoteVaultSyncPhase = 'idle'
const syncPhaseListeners = new Set<(phase: RemoteVaultSyncPhase) => void>()
let currentRemoteVaultSyncQueueState: RemoteVaultSyncQueueState = DEFAULT_QUEUE_STATE
const queueListeners = new Set<(state: RemoteVaultSyncQueueState) => void>()
let pendingPushTimer: number | null = null
let persistTimer: number | null = null
let suspendDepth = 0
let hydrated = false
let activePushPromise: Promise<unknown> | null = null
let longRunningTimer: number | null = null

function cloneDirtyDomains(value?: Partial<RemoteVaultDirtyDomains>): RemoteVaultDirtyDomains {
  return {
    snapshotTablesDirty: Boolean(value?.snapshotTablesDirty),
    blobPdfDirty: Boolean(value?.blobPdfDirty),
    blobTextDirty: Boolean(value?.blobTextDirty),
    blobThumbnailDirty: Boolean(value?.blobThumbnailDirty),
    readerStateDirty: Boolean(value?.readerStateDirty),
  }
}

function cloneQueueState(state: RemoteVaultSyncQueueState): RemoteVaultSyncQueueState {
  return {
    ...state,
    dirty: cloneDirtyDomains(state.dirty),
  }
}

function mergePriority(
  left: RemoteVaultSyncPriority,
  right: RemoteVaultSyncPriority,
): RemoteVaultSyncPriority {
  return PRIORITY_ORDER[right] > PRIORITY_ORDER[left] ? right : left
}

function hasDirtyDomains(domains: RemoteVaultDirtyDomains) {
  return Object.values(domains).some(Boolean)
}

function setRemoteVaultSyncQueueState(next: RemoteVaultSyncQueueState) {
  currentRemoteVaultSyncQueueState = cloneQueueState(next)
  queueListeners.forEach((listener) => listener(currentRemoteVaultSyncQueueState))
}

function schedulePersistSyncState() {
  if (typeof window === 'undefined') return
  if (persistTimer) {
    window.clearTimeout(persistTimer)
  }

  persistTimer = window.setTimeout(() => {
    persistTimer = null
    const payload: PersistedRemoteVaultSyncState = {
      dirty: currentRemoteVaultSyncQueueState.dirty,
      highestPriority: currentRemoteVaultSyncQueueState.highestPriority,
      hasPendingSync: currentRemoteVaultSyncQueueState.hasPendingSync,
    }
    void invoke('set_remote_vault_sync_state', { input: payload }).catch((error) => {
      console.warn('Could not persist remote vault sync state:', error)
    })
  }, 400)
}

function clearPendingPushTimer() {
  if (pendingPushTimer && typeof window !== 'undefined') {
    window.clearTimeout(pendingPushTimer)
    pendingPushTimer = null
  }
}

function clearLongRunningTimer() {
  if (longRunningTimer && typeof window !== 'undefined') {
    window.clearTimeout(longRunningTimer)
    longRunningTimer = null
  }
}

function setSyncActivity(
  phase: RemoteVaultSyncPhase,
  kind: RemoteVaultSyncKind | null,
  options?: { longRunning?: boolean },
) {
  currentRemoteVaultSyncPhase = phase
  syncPhaseListeners.forEach((listener) => listener(currentRemoteVaultSyncPhase))
  setRemoteVaultSyncQueueState({
    ...currentRemoteVaultSyncQueueState,
    activeKind: kind,
    longRunning: options?.longRunning ?? false,
  })
}

function beginSyncActivity(phase: Exclude<RemoteVaultSyncPhase, 'idle'>, kind: RemoteVaultSyncKind) {
  clearLongRunningTimer()
  setSyncActivity(phase, kind, {
    longRunning: kind === 'manual',
  })

  if (kind === 'background' && typeof window !== 'undefined') {
    longRunningTimer = window.setTimeout(() => {
      longRunningTimer = null
      if (
        currentRemoteVaultSyncPhase === phase
        && currentRemoteVaultSyncQueueState.activeKind === kind
      ) {
        setRemoteVaultSyncQueueState({
          ...currentRemoteVaultSyncQueueState,
          longRunning: true,
        })
      }
    }, LONG_RUNNING_SYNC_THRESHOLD_MS)
  }

  return () => {
    clearLongRunningTimer()
    setSyncActivity('idle', null, { longRunning: false })
  }
}

function canScheduleBackgroundPush() {
  return (
    currentRemoteVaultStatus.enabled
    && currentRemoteVaultStatus.mode === 'remoteWriter'
    && !currentRemoteVaultStatus.isOffline
    && suspendDepth === 0
  )
}

function scheduleBackgroundPush() {
  clearPendingPushTimer()
  if (!canScheduleBackgroundPush()) return
  if (!hasDirtyDomains(currentRemoteVaultSyncQueueState.dirty)) return

  const priority = currentRemoteVaultSyncQueueState.highestPriority
  if (priority === 'none' || typeof window === 'undefined') return

  pendingPushTimer = window.setTimeout(() => {
    pendingPushTimer = null
    void flushRemoteVaultSync({ kind: 'background' })
  }, PRIORITY_DELAY_MS[priority])
}

function clearPersistedSyncState() {
  void invoke('set_remote_vault_sync_state', {
    input: {
      dirty: CLEAN_DIRTY_DOMAINS,
      highestPriority: 'none',
      hasPendingSync: false,
    } satisfies PersistedRemoteVaultSyncState,
  }).catch((error) => {
    console.warn('Could not clear remote vault sync state:', error)
  })
}

export function getRemoteVaultStatusSnapshot() {
  return currentRemoteVaultStatus
}

export function setRemoteVaultStatus(status: RemoteVaultStatus | null | undefined) {
  currentRemoteVaultStatus = status ?? LOCAL_STATUS
  statusListeners.forEach((listener) => listener(currentRemoteVaultStatus))
  if (canScheduleBackgroundPush()) {
    scheduleBackgroundPush()
  }
}

export function subscribeRemoteVaultStatus(listener: (status: RemoteVaultStatus) => void) {
  statusListeners.add(listener)
  listener(currentRemoteVaultStatus)
  return () => {
    statusListeners.delete(listener)
  }
}

export function getRemoteVaultSyncPhaseSnapshot() {
  return currentRemoteVaultSyncPhase
}

export function subscribeRemoteVaultSyncPhase(listener: (phase: RemoteVaultSyncPhase) => void) {
  syncPhaseListeners.add(listener)
  listener(currentRemoteVaultSyncPhase)
  return () => {
    syncPhaseListeners.delete(listener)
  }
}

export function getRemoteVaultSyncQueueSnapshot() {
  return currentRemoteVaultSyncQueueState
}

export function subscribeRemoteVaultSyncQueue(listener: (state: RemoteVaultSyncQueueState) => void) {
  queueListeners.add(listener)
  listener(currentRemoteVaultSyncQueueState)
  return () => {
    queueListeners.delete(listener)
  }
}

export async function hydrateRemoteVaultSyncState() {
  if (hydrated) return currentRemoteVaultSyncQueueState
  hydrated = true
  try {
    const persisted = await invoke<PersistedRemoteVaultSyncState | null>('get_remote_vault_sync_state')
    const nextState: RemoteVaultSyncQueueState = {
      ...DEFAULT_QUEUE_STATE,
      dirty: cloneDirtyDomains(persisted?.dirty),
      highestPriority: persisted?.highestPriority ?? 'none',
      hasPendingSync: Boolean(persisted?.hasPendingSync),
    }
    setRemoteVaultSyncQueueState(nextState)
    if (canScheduleBackgroundPush()) {
      scheduleBackgroundPush()
    }
    return nextState
  } catch (error) {
    console.warn('Could not hydrate remote vault sync state:', error)
    return currentRemoteVaultSyncQueueState
  }
}

export function assertRemoteWriteAllowed() {
  const status = currentRemoteVaultStatus
  if (!status.enabled || status.isWritable) return
  throw new Error(status.message || 'This remote vault is currently read-only.')
}

export function markRemoteVaultDirty(options: MarkRemoteVaultDirtyOptions) {
  if (!currentRemoteVaultStatus.enabled) {
    return
  }

  const dirty = {
    ...currentRemoteVaultSyncQueueState.dirty,
    ...Object.fromEntries(
      Object.entries(options.domains ?? {}).map(([key, value]) => [key, Boolean(value)]),
    ),
  } as RemoteVaultDirtyDomains

  const nextState: RemoteVaultSyncQueueState = {
    ...currentRemoteVaultSyncQueueState,
    dirty,
    highestPriority: mergePriority(currentRemoteVaultSyncQueueState.highestPriority, options.priority),
    hasPendingSync: hasDirtyDomains(dirty),
  }

  if (activePushPromise) {
    nextState.pendingRerun = true
  }

  setRemoteVaultSyncQueueState(nextState)
  schedulePersistSyncState()

  if (!activePushPromise) {
    scheduleBackgroundPush()
  }
}

export function suspendRemoteVaultSyncDuringBatch() {
  suspendDepth += 1
  clearPendingPushTimer()

  return () => {
    suspendDepth = Math.max(0, suspendDepth - 1)
    if (suspendDepth === 0) {
      scheduleBackgroundPush()
    }
  }
}

function queueStateToPushInput(state: RemoteVaultSyncQueueState) {
  return {
    snapshotTablesDirty: state.dirty.snapshotTablesDirty,
    blobPdfDirty: state.dirty.blobPdfDirty,
    blobTextDirty: state.dirty.blobTextDirty,
    blobThumbnailDirty: state.dirty.blobThumbnailDirty,
    readerStateDirty: state.dirty.readerStateDirty,
  }
}

export async function flushRemoteVaultSync(options?: { kind?: RemoteVaultSyncKind, force?: boolean }) {
  const kind = options?.kind ?? 'manual'

  if (activePushPromise) {
    if (kind === 'background') {
      setRemoteVaultSyncQueueState({
        ...currentRemoteVaultSyncQueueState,
        pendingRerun: true,
      })
      schedulePersistSyncState()
      return
    }

    await activePushPromise
  }

  if (!currentRemoteVaultStatus.enabled || currentRemoteVaultStatus.mode !== 'remoteWriter' || currentRemoteVaultStatus.isOffline) {
    return
  }

  const shouldPush = options?.force || hasDirtyDomains(currentRemoteVaultSyncQueueState.dirty)
  if (!shouldPush) return

  clearPendingPushTimer()
  const dirtySnapshot = cloneQueueState(currentRemoteVaultSyncQueueState)
  const finishActivity = beginSyncActivity('pushing', kind)

  activePushPromise = (async () => {
    try {
      const result = await invoke<{
        status?: RemoteVaultStatus
        message?: string
        copiedFileCount?: number
        copiedByteCount?: number
      }>('push_remote_vault', {
        input: {
          dirtyState: queueStateToPushInput(dirtySnapshot),
        },
      })
      if (result.status) {
        setRemoteVaultStatus(result.status)
      }

      const normalizedResult = {
        message: result.message ?? '',
        copiedFileCount: result.copiedFileCount ?? 0,
        copiedByteCount: result.copiedByteCount ?? 0,
        status: result.status ?? currentRemoteVaultStatus,
      }

      if (currentRemoteVaultSyncQueueState.pendingRerun) {
        setRemoteVaultSyncQueueState({
          ...currentRemoteVaultSyncQueueState,
          pendingRerun: false,
          hasPendingSync: hasDirtyDomains(currentRemoteVaultSyncQueueState.dirty),
        })
        schedulePersistSyncState()
      } else {
        setRemoteVaultSyncQueueState({
          ...DEFAULT_QUEUE_STATE,
        })
        clearPersistedSyncState()
      }
      return normalizedResult
    } catch (error) {
      console.warn('Remote vault push failed:', error)
      setRemoteVaultSyncQueueState({
        ...currentRemoteVaultSyncQueueState,
        hasPendingSync: hasDirtyDomains(currentRemoteVaultSyncQueueState.dirty),
        pendingRerun: false,
      })
      schedulePersistSyncState()
      throw error
    } finally {
      activePushPromise = null
      finishActivity()
    }
  })()

  const result = await activePushPromise

  if (hasDirtyDomains(currentRemoteVaultSyncQueueState.dirty)) {
    scheduleBackgroundPush()
  }

  return result
}

export async function runRemoteVaultPull(options?: { kind?: RemoteVaultSyncKind }) {
  const kind = options?.kind ?? 'manual'
  const finishActivity = beginSyncActivity('pulling', kind)
  try {
    const result = await invoke<{
      status?: RemoteVaultStatus
      message?: string
      copiedFileCount?: number
      copiedByteCount?: number
    }>('pull_remote_vault')
    if (result.status) {
      setRemoteVaultStatus(result.status)
    }
    return {
      message: result.message ?? '',
      copiedFileCount: result.copiedFileCount ?? 0,
      copiedByteCount: result.copiedByteCount ?? 0,
      status: result.status ?? currentRemoteVaultStatus,
    }
  } finally {
    finishActivity()
  }
}

export function scheduleRemoteVaultPush() {
  scheduleBackgroundPush()
}
