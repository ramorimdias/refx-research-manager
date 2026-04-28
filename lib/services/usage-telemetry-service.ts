'use client'

import { getAppVersion } from '@/lib/app-version'
import type { StoredAppSettings } from '@/lib/app-settings'
import * as repo from '@/lib/repositories/local-db'
import { isTauri } from '@/lib/tauri/client'

const USAGE_TELEMETRY_ENDPOINT = (process.env.NEXT_PUBLIC_REFX_USAGE_TELEMETRY_URL ?? '').trim()
const REQUEST_TIMEOUT_MS = 7000

type UsageTelemetryEventName = 'app_started' | 'app_closed'

type UsageTelemetryPayload = {
  install_id: string
  app_version: string
  platform: string
  locale: string
  event: UsageTelemetryEventName
  session_started_at: string
  sent_at: string
}

function createInstallId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `refx-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
}

async function persistTelemetrySettingsPatch(values: Partial<Pick<StoredAppSettings, 'usageInstallId' | 'usageTelemetryLastSentAt'>>) {
  const encoded = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, JSON.stringify(value ?? '')]),
  )

  await repo.setSettings(encoded)
}

export function isUsageTelemetryConfigured() {
  return USAGE_TELEMETRY_ENDPOINT.length > 0
}

export async function ensureUsageTelemetryIdentity(
  settings: StoredAppSettings,
  isDesktopApp: boolean,
): Promise<StoredAppSettings> {
  if (!isDesktopApp || !isTauri() || settings.usageInstallId.trim().length > 0) {
    return settings
  }

  const usageInstallId = createInstallId()
  await persistTelemetrySettingsPatch({ usageInstallId })
  return { ...settings, usageInstallId }
}

function shouldSkipSend(settings: StoredAppSettings, event: UsageTelemetryEventName, sentAt: Date) {
  if (!settings.shareAnonymousUsageStats) return true
  if (!isUsageTelemetryConfigured()) return true
  if (!settings.usageInstallId.trim()) return true
  return false
}

function getPlatformLabel() {
  if (typeof navigator === 'undefined') return 'unknown'
  const navigatorWithPlatform = navigator as Navigator & {
    userAgentData?: { platform?: string }
  }
  return navigatorWithPlatform.userAgentData?.platform ?? navigator.platform ?? 'unknown'
}

export async function sendUsageTelemetryEvent(
  settings: StoredAppSettings,
  options: {
    event: UsageTelemetryEventName
    sessionStartedAt: string
  },
) {
  if (!isTauri()) return null

  const sentAt = new Date()
  if (shouldSkipSend(settings, options.event, sentAt)) return null

  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const payload: UsageTelemetryPayload = {
      install_id: settings.usageInstallId,
      app_version: await getAppVersion(),
      platform: getPlatformLabel(),
      locale: settings.locale,
      event: options.event,
      session_started_at: options.sessionStartedAt,
      sent_at: sentAt.toISOString(),
    }

    const response = await fetch(USAGE_TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      keepalive: options.event === 'app_closed',
    })

    if (!response.ok) {
      return null
    }

    const sentAtIso = sentAt.toISOString()
    await persistTelemetrySettingsPatch({
      usageTelemetryLastSentAt: sentAtIso,
    })
    return sentAtIso
  } catch (error) {
    console.warn('Usage telemetry request failed:', error)
    return null
  } finally {
    window.clearTimeout(timeoutId)
  }
}
