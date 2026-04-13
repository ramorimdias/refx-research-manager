'use client'

import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { isTauri } from '@/lib/tauri/client'

type RawUpdate = Awaited<ReturnType<typeof check>>

const UPDATER_ENDPOINT = 'https://github.com/ramorimdias/refx-research-manager/releases/latest/download/latest.json'

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

type GithubReleaseMetadata = {
  body: string
  publishedAt: string | null
}

function inferGithubRepoFromEndpoint(endpoint: string): string | null {
  const match = endpoint.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/releases\/latest\/download\/latest\.json$/i)
  return match?.[1] ?? null
}

async function fetchGithubReleaseMetadata(version: string): Promise<GithubReleaseMetadata | null> {
  const repo = inferGithubRepoFromEndpoint(UPDATER_ENDPOINT)
  if (!repo) return null

  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases/tags/v${version}`, {
      headers: {
        Accept: 'application/vnd.github+json',
      },
    })

    if (!response.ok) {
      return null
    }

    const payload = await response.json() as { body?: string | null; published_at?: string | null }
    return {
      body: payload.body?.trim() || '',
      publishedAt: payload.published_at ?? null,
    }
  } catch (error) {
    console.warn('Failed to fetch GitHub release metadata for updater dialog:', error)
    return null
  }
}

async function summarizeUpdate(update: NonNullable<RawUpdate>): Promise<AppUpdateSummary> {
  const githubRelease = await fetchGithubReleaseMetadata(update.version)

  return {
    version: update.version,
    currentVersion: update.currentVersion,
    notes: githubRelease?.body || update.body?.trim() || '',
    publishedAt: githubRelease?.publishedAt ?? update.date ?? null,
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
    update: update ? await summarizeUpdate(update) : null,
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
        onProgress?.('updateDialog.finalizingQuiet')
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
