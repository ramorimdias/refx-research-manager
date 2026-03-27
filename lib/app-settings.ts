'use client'

import * as repo from '@/lib/repositories/local-db'

export type StoredAppSettings = {
  theme: 'light' | 'dark' | 'system'
  fontSize: '14' | '16' | '18'
  autoOcr: boolean
  autoMetadata: boolean
  autoOnlineMetadataEnrichment: boolean
  advancedClassificationMode: 'off' | 'local_heuristic'
  crossrefContactEmail: string
  semanticScholarApiKey: string
}

export const DEFAULT_APP_SETTINGS: StoredAppSettings = {
  theme: 'system',
  fontSize: '16',
  autoOcr: true,
  autoMetadata: true,
  autoOnlineMetadataEnrichment: false,
  advancedClassificationMode: 'off',
  crossrefContactEmail: '',
  semanticScholarApiKey: '',
}

const SETTINGS_STORAGE_KEY = 'refx-settings'

function parseValue<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export async function loadAppSettings(isDesktopApp: boolean): Promise<StoredAppSettings> {
  if (!isDesktopApp) {
    if (typeof window === 'undefined') return DEFAULT_APP_SETTINGS
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return DEFAULT_APP_SETTINGS
    return {
      ...DEFAULT_APP_SETTINGS,
      ...parseValue<Partial<StoredAppSettings>>(raw, {}),
    }
  }

  const stored = await repo.getSettings()
  return {
    theme: parseValue(stored.theme, DEFAULT_APP_SETTINGS.theme),
    fontSize: parseValue(stored.fontSize, DEFAULT_APP_SETTINGS.fontSize),
    autoOcr: parseValue(stored.autoOcr, DEFAULT_APP_SETTINGS.autoOcr),
    autoMetadata: parseValue(stored.autoMetadata, DEFAULT_APP_SETTINGS.autoMetadata),
    autoOnlineMetadataEnrichment: parseValue(
      stored.autoOnlineMetadataEnrichment,
      DEFAULT_APP_SETTINGS.autoOnlineMetadataEnrichment,
    ),
    advancedClassificationMode: parseValue(
      stored.advancedClassificationMode,
      DEFAULT_APP_SETTINGS.advancedClassificationMode,
    ),
    crossrefContactEmail: parseValue(stored.crossrefContactEmail, DEFAULT_APP_SETTINGS.crossrefContactEmail),
    semanticScholarApiKey: parseValue(stored.semanticScholarApiKey, DEFAULT_APP_SETTINGS.semanticScholarApiKey),
  }
}

export async function saveAppSettings(isDesktopApp: boolean, settings: StoredAppSettings) {
  if (!isDesktopApp) {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
    }
    return
  }

  await repo.setSettings({
    theme: JSON.stringify(settings.theme),
    fontSize: JSON.stringify(settings.fontSize),
    autoOcr: JSON.stringify(settings.autoOcr),
    autoMetadata: JSON.stringify(settings.autoMetadata),
    autoOnlineMetadataEnrichment: JSON.stringify(settings.autoOnlineMetadataEnrichment),
    advancedClassificationMode: JSON.stringify(settings.advancedClassificationMode),
    crossrefContactEmail: JSON.stringify(settings.crossrefContactEmail),
    semanticScholarApiKey: JSON.stringify(settings.semanticScholarApiKey),
  })
}
