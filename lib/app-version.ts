import { getVersion } from '@tauri-apps/api/app'
import { isTauri } from '@/lib/tauri/client'

export const APP_VERSION = '0.6.1'

export async function getAppVersion(): Promise<string> {
  if (!isTauri()) {
    return APP_VERSION
  }

  try {
    return await getVersion()
  } catch (error) {
    console.warn('Failed to read runtime app version, falling back to bundled version:', error)
    return APP_VERSION
  }
}
