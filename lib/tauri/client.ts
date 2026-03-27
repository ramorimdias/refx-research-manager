'use client'

import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { copyFile, exists, mkdir, readFile, readTextFile, remove, writeTextFile } from '@tauri-apps/plugin-fs'
import { appDataDir, join } from '@tauri-apps/api/path'
import { convertFileSrc } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { WebviewWindow, getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'

export const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export {
  invoke,
  open,
  copyFile,
  exists,
  mkdir,
  readFile,
  readTextFile,
  remove,
  writeTextFile,
  appDataDir,
  join,
  convertFileSrc,
  getCurrentWindow,
  WebviewWindow,
  getCurrentWebviewWindow,
}
