'use client'

import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { isTauri } from '@/lib/tauri/client'

type RawUpdate = Awaited<ReturnType<typeof check>>

export type AppUpdateSummary = {
  version: string
  currentVersion?: string
  notes: string
  publishedAt?: string | null
}

export type AppUpdateCheckResult =
  | { supported: false; reason: string; update: null }
  | { supported: true; reason?: string; update: AppUpdateSummary | null }

let pendingUpdate: RawUpdate = null

function summarizeUpdate(update: NonNullable<RawUpdate>): AppUpdateSummary {
  return {
    version: update.version,
    currentVersion: update.currentVersion,
    notes: update.body?.trim() || '',
    publishedAt: update.date ?? null,
  }
}

export async function checkForAppUpdate(): Promise<AppUpdateCheckResult> {
  if (!isTauri()) {
    pendingUpdate = null
    return {
      supported: false,
      reason: 'Updates are only available in the desktop app.',
      update: null,
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    pendingUpdate = null
    return {
      supported: false,
      reason: 'Update checks are available in installed builds.',
      update: null,
    }
  }

  const update = await check()
  pendingUpdate = update

  return {
    supported: true,
    update: update ? summarizeUpdate(update) : null,
  }
}

export async function downloadAndInstallAppUpdate(
  onProgress?: (messageKey: string, params?: Record<string, string | number>) => void,
) {
  let update = pendingUpdate

  if (!update) {
    const result = await checkForAppUpdate()
    if (!result.supported || !result.update) {
      return false
    }
    update = pendingUpdate
  }

  if (!update) return false

  let totalBytes = 0
  let downloadedBytes = 0

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case 'Started':
        totalBytes = event.data.contentLength ?? 0
        downloadedBytes = 0
        onProgress?.('updateDialog.downloading')
        break
      case 'Progress':
        downloadedBytes += event.data.chunkLength
        if (totalBytes > 0) {
          onProgress?.('updateDialog.downloadingProgress', {
            downloaded: Math.max(1, Math.round(downloadedBytes / 1024)),
            total: Math.max(1, Math.round(totalBytes / 1024)),
          })
          break
        }
        onProgress?.('updateDialog.downloadingKb', {
          size: Math.max(1, Math.round(downloadedBytes / 1024)),
        })
        break
      case 'Finished':
        onProgress?.('updateDialog.installingStatus')
        break
      default:
        break
    }
  })

  pendingUpdate = null
  onProgress?.('updateDialog.restarting')
  await relaunch()
  return true
}

export function dismissPendingAppUpdate() {
  pendingUpdate = null
}
