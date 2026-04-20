'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Cloud, DownloadCloud, Eye, PencilLine, Search, Settings, Unplug, UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppTour } from '@/components/refx/app-tour-provider'
import { useUiStore } from '@/lib/stores/ui-store'
import { useT } from '@/lib/localization'
import { cn } from '@/lib/utils'
import { getRemoteVaultDisplayMessage } from '@/lib/remote-vault-copy'
import {
  getRemoteVaultStatusSnapshot,
  getRemoteVaultSyncPhaseSnapshot,
  getRemoteVaultSyncQueueSnapshot,
  subscribeRemoteVaultStatus,
  subscribeRemoteVaultSyncPhase,
  subscribeRemoteVaultSyncQueue,
  type RemoteVaultStatus,
  type RemoteVaultSyncPhase,
  type RemoteVaultSyncQueueState,
} from '@/lib/remote-storage-state'

function getRemoteVaultBadge(
  status: RemoteVaultStatus,
  syncPhase: RemoteVaultSyncPhase,
  syncState: RemoteVaultSyncQueueState,
  t: ReturnType<typeof useT>,
) {
  const showExplicitActivity = syncState.activeKind === 'manual' || syncState.longRunning

  if (showExplicitActivity && syncPhase === 'pulling') {
    return {
      Icon: DownloadCloud,
      loading: true,
      pending: false,
      label: t('topBar.remoteVaultReceiving'),
      tooltip: t('topBar.remoteVaultReceivingTooltip'),
      className: 'border-sky-300/80 bg-sky-50 text-sky-800 dark:border-sky-500/40 dark:bg-sky-950/50 dark:text-sky-200',
    }
  }

  if (showExplicitActivity && syncPhase === 'pushing') {
    return {
      Icon: UploadCloud,
      loading: true,
      pending: false,
      label: t('topBar.remoteVaultSending'),
      tooltip: t('topBar.remoteVaultSendingTooltip'),
      className: 'border-sky-300/80 bg-sky-50 text-sky-800 dark:border-sky-500/40 dark:bg-sky-950/50 dark:text-sky-200',
    }
  }

  if (status.mode === 'remoteOfflineCache') {
    return {
      Icon: Unplug,
      loading: false,
      pending: false,
      label: t('topBar.remoteVaultOffline'),
      tooltip: getRemoteVaultDisplayMessage(t, status),
      className: 'border-red-300/80 bg-red-50 text-red-900 dark:border-red-500/40 dark:bg-red-950/50 dark:text-red-200',
    }
  }

  if (status.mode === 'remoteWriter') {
    return {
      Icon: PencilLine,
      loading: false,
      pending: syncState.hasPendingSync,
      label: t('topBar.remoteVaultWriter'),
      tooltip: getRemoteVaultDisplayMessage(t, status),
      className: 'border-emerald-300/80 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-950/50 dark:text-emerald-200',
    }
  }

  if (status.mode === 'remoteReader') {
    return {
      Icon: Eye,
      loading: false,
      pending: syncState.hasPendingSync,
      label: t('topBar.remoteVaultReadOnly'),
      tooltip: getRemoteVaultDisplayMessage(t, status),
      className: 'border-slate-300/80 bg-slate-50 text-slate-800 dark:border-slate-500/40 dark:bg-slate-900/70 dark:text-slate-200',
    }
  }

  return {
    Icon: Cloud,
    loading: false,
    pending: syncState.hasPendingSync,
    label: t('topBar.remoteVaultConnected'),
    tooltip: getRemoteVaultDisplayMessage(t, status),
    className: 'border-border bg-muted/60 text-muted-foreground',
  }
}

export function TopBar() {
  const t = useT()
  const router = useRouter()
  const {
    canStartCurrentPageTour,
    closeCurrentPageTour,
    currentPageTourUnavailableReason,
    startCurrentPageTour,
  } = useAppTour()
  const inputRef = useRef<HTMLInputElement>(null)
  const [remoteVaultStatus, setRemoteVaultStatus] = useState(getRemoteVaultStatusSnapshot)
  const [remoteVaultSyncPhase, setRemoteVaultSyncPhase] = useState(getRemoteVaultSyncPhaseSnapshot)
  const [remoteVaultSyncState, setRemoteVaultSyncState] = useState(getRemoteVaultSyncQueueSnapshot)
  const globalSearchQuery = useUiStore((state) => state.globalSearchQuery)
  const setGlobalSearchQuery = useUiStore((state) => state.setGlobalSearchQuery)
  const setPersistentSearch = useUiStore((state) => state.setPersistentSearch)

  const submitGlobalSearch = () => {
    setPersistentSearch({ query: globalSearchQuery.trim() })
    router.push(`/search?q=${encodeURIComponent(globalSearchQuery.trim())}`)
  }

  useEffect(() => subscribeRemoteVaultStatus(setRemoteVaultStatus), [])
  useEffect(() => subscribeRemoteVaultSyncPhase(setRemoteVaultSyncPhase), [])
  useEffect(() => subscribeRemoteVaultSyncQueue(setRemoteVaultSyncState), [])

  const remoteVaultBadge = remoteVaultStatus.enabled
    ? getRemoteVaultBadge(remoteVaultStatus, remoteVaultSyncPhase, remoteVaultSyncState, t)
    : null

  return (
    <header className="flex h-16 items-center justify-between gap-4 border-b border-border/80 bg-background/92 px-5 backdrop-blur">
      <div className="relative w-full max-w-xl" data-tour-id="shell-search">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={globalSearchQuery}
          onChange={(event) => setGlobalSearchQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              submitGlobalSearch()
            }
          }}
          className="h-10 rounded-full border-border/80 bg-card pl-9 pr-4"
          placeholder={t('topBar.searchPlaceholder')}
        />
      </div>

      <div className="flex items-center gap-2">
        {remoteVaultBadge ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'relative flex h-9 w-9 items-center justify-center',
                )}
                aria-label={remoteVaultBadge.label}
                role="status"
              >
                {remoteVaultBadge.loading ? (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-[-3px] rounded-full border-2 border-sky-200/70 border-t-sky-500 animate-spin dark:border-sky-900/80 dark:border-t-sky-400"
                  />
                ) : null}
                {!remoteVaultBadge.loading && remoteVaultBadge.pending ? (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute right-0 top-0 h-2.5 w-2.5 rounded-full border border-background bg-sky-500"
                  />
                ) : null}
                <span
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full border text-base shadow-sm',
                    remoteVaultBadge.className,
                  )}
                >
                  <remoteVaultBadge.Icon className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {remoteVaultBadge.tooltip}
            </TooltipContent>
          </Tooltip>
        ) : null}

        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                variant="outline"
                size="icon"
                className="rounded-full text-sm font-semibold"
                onClick={() => startCurrentPageTour()}
                aria-label={t('topBar.openPageGuide')}
                disabled={!canStartCurrentPageTour}
              >
                ?
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {canStartCurrentPageTour
              ? t('topBar.openPageGuide')
              : (currentPageTourUnavailableReason ?? t('topBar.pageGuideUnavailable'))}
          </TooltipContent>
        </Tooltip>

        <Button
          variant="outline"
          size="icon"
          className="rounded-full"
          onClick={() => {
            closeCurrentPageTour()
            router.push('/settings')
          }}
          aria-label={t('topBar.openSettings')}
          data-tour-id="shell-settings"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}
