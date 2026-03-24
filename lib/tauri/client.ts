'use client'

import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { copyFile, mkdir, readFile } from '@tauri-apps/plugin-fs'
import { appDataDir, join } from '@tauri-apps/api/path'
import { convertFileSrc } from '@tauri-apps/api/core'

export const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export { invoke, open, copyFile, mkdir, readFile, appDataDir, join, convertFileSrc }
