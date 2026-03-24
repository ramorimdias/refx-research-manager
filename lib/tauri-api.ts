/**
 * Tauri API wrapper for desktop functionality
 * Provides type-safe access to Tauri commands and plugins
 */

// Check if running in Tauri environment
export const isTauri = (): boolean => {
  if (typeof window === 'undefined') return false
  return '__TAURI__' in window || '__TAURI_INTERNALS__' in window
}

// Dynamic imports for Tauri APIs (only load when in Tauri environment)
let tauriInvoke: typeof import('@tauri-apps/api/core').invoke | null = null
let tauriPath: typeof import('@tauri-apps/api/path') | null = null
let tauriDialog: typeof import('@tauri-apps/plugin-dialog') | null = null
let tauriFs: typeof import('@tauri-apps/plugin-fs') | null = null
let tauriShell: typeof import('@tauri-apps/plugin-shell') | null = null

// Initialize Tauri APIs
export async function initTauriApis(): Promise<boolean> {
  if (!isTauri()) return false

  try {
    const [core, path, dialog, fs, shell] = await Promise.all([
      import('@tauri-apps/api/core'),
      import('@tauri-apps/api/path'),
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/plugin-fs'),
      import('@tauri-apps/plugin-shell'),
    ])

    tauriInvoke = core.invoke
    tauriPath = path
    tauriDialog = dialog
    tauriFs = fs
    tauriShell = shell

    return true
  } catch (error) {
    console.error('Failed to initialize Tauri APIs:', error)
    return false
  }
}

// Invoke Tauri command
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!tauriInvoke) {
    throw new Error('Tauri APIs not initialized. Call initTauriApis() first.')
  }
  return tauriInvoke(cmd, args)
}

// Path utilities
export async function getAppDataDir(): Promise<string> {
  if (!tauriPath) throw new Error('Tauri path API not initialized')
  return tauriPath.appDataDir()
}

export async function getDocumentDir(): Promise<string> {
  if (!tauriPath) throw new Error('Tauri path API not initialized')
  return tauriPath.documentDir()
}

export async function getDownloadDir(): Promise<string> {
  if (!tauriPath) throw new Error('Tauri path API not initialized')
  return tauriPath.downloadDir()
}

export async function joinPath(...paths: string[]): Promise<string> {
  if (!tauriPath) throw new Error('Tauri path API not initialized')
  return tauriPath.join(...paths)
}

// Dialog utilities
export async function openFileDialog(options?: {
  multiple?: boolean
  directory?: boolean
  filters?: Array<{ name: string; extensions: string[] }>
  defaultPath?: string
  title?: string
}): Promise<string | string[] | null> {
  if (!tauriDialog) throw new Error('Tauri dialog API not initialized')
  return tauriDialog.open(options)
}

export async function saveFileDialog(options?: {
  filters?: Array<{ name: string; extensions: string[] }>
  defaultPath?: string
  title?: string
}): Promise<string | null> {
  if (!tauriDialog) throw new Error('Tauri dialog API not initialized')
  return tauriDialog.save(options)
}

export async function messageDialog(
  message: string,
  options?: { title?: string; kind?: 'info' | 'warning' | 'error' }
): Promise<void> {
  if (!tauriDialog) throw new Error('Tauri dialog API not initialized')
  return tauriDialog.message(message, options)
}

export async function confirmDialog(
  message: string,
  options?: { title?: string; kind?: 'info' | 'warning' | 'error' }
): Promise<boolean> {
  if (!tauriDialog) throw new Error('Tauri dialog API not initialized')
  return tauriDialog.confirm(message, options)
}

// File system utilities
export async function readTextFile(path: string): Promise<string> {
  if (!tauriFs) throw new Error('Tauri fs API not initialized')
  return tauriFs.readTextFile(path)
}

export async function readBinaryFile(path: string): Promise<Uint8Array> {
  if (!tauriFs) throw new Error('Tauri fs API not initialized')
  return tauriFs.readFile(path)
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  if (!tauriFs) throw new Error('Tauri fs API not initialized')
  return tauriFs.writeTextFile(path, content)
}

export async function writeBinaryFile(path: string, content: Uint8Array): Promise<void> {
  if (!tauriFs) throw new Error('Tauri fs API not initialized')
  return tauriFs.writeFile(path, content)
}

export async function copyFile(source: string, destination: string): Promise<void> {
  if (!tauriFs) throw new Error('Tauri fs API not initialized')
  return tauriFs.copyFile(source, destination)
}

export async function removeFile(path: string): Promise<void> {
  if (!tauriFs) throw new Error('Tauri fs API not initialized')
  return tauriFs.remove(path)
}

export async function createDir(path: string, options?: { recursive?: boolean }): Promise<void> {
  if (!tauriFs) throw new Error('Tauri fs API not initialized')
  return tauriFs.mkdir(path, options)
}

export async function exists(path: string): Promise<boolean> {
  if (!tauriFs) throw new Error('Tauri fs API not initialized')
  return tauriFs.exists(path)
}

export async function readDir(path: string): Promise<Array<{ name: string; isDirectory: boolean; isFile: boolean }>> {
  if (!tauriFs) throw new Error('Tauri fs API not initialized')
  const entries = await tauriFs.readDir(path)
  return entries.map((entry) => ({
    name: entry.name,
    isDirectory: entry.isDirectory,
    isFile: entry.isFile,
  }))
}

// Shell utilities
export async function openUrl(url: string): Promise<void> {
  if (!tauriShell) throw new Error('Tauri shell API not initialized')
  return tauriShell.open(url)
}

export async function openPath(path: string): Promise<void> {
  if (!tauriShell) throw new Error('Tauri shell API not initialized')
  return tauriShell.open(path)
}

// Custom commands
export async function getAppDataDirCommand(): Promise<string> {
  return invoke<string>('get_app_data_dir')
}

export async function ensureAppDirectories(): Promise<void> {
  return invoke<void>('ensure_app_directories')
}

export async function generateDocumentId(): Promise<string> {
  return invoke<string>('generate_document_id')
}
