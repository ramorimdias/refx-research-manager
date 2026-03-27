'use client'

import { WebviewWindow, getCurrentWindow, isTauri } from '@/lib/tauri/client'

export const DETACHED_READER_QUERY_VALUE = '1'
export const DETACHED_READER_WINDOW_PREFIX = 'reader-'

type BuildReaderRouteOptions = {
  documentId: string
  page?: number
  zoom?: number
  query?: string
  matchText?: string
  returnTo?: string
  detached?: boolean
}

type OpenDetachedReaderWindowOptions = {
  documentId: string
  title?: string
  page?: number
  zoom?: number
  query?: string
  matchText?: string
}

function normalizePositiveInteger(value: number | undefined) {
  if (!Number.isFinite(value) || !value) return undefined
  return Math.max(1, Math.round(value))
}

function normalizeZoom(value: number | undefined) {
  if (!Number.isFinite(value) || !value) return undefined
  return Math.min(250, Math.max(50, Math.round(value)))
}

function appendParam(params: URLSearchParams, key: string, value: string | number | undefined) {
  if (value === undefined) return
  const normalized = String(value).trim()
  if (!normalized) return
  params.set(key, normalized)
}

export function buildReaderViewRoute({
  documentId,
  page,
  zoom,
  query,
  matchText,
  returnTo,
  detached,
}: BuildReaderRouteOptions) {
  const params = new URLSearchParams()
  appendParam(params, 'id', documentId)
  appendParam(params, 'page', normalizePositiveInteger(page))
  appendParam(params, 'zoom', normalizeZoom(zoom))
  appendParam(params, 'query', query?.trim())
  appendParam(params, 'matchText', matchText?.trim())
  appendParam(params, 'returnTo', returnTo?.trim())

  if (detached) {
    params.set('detached', DETACHED_READER_QUERY_VALUE)
  }

  return `/reader/view?${params.toString()}`
}

function buildDetachedReaderWindowLabel(documentId: string) {
  const normalizedId = documentId.replace(/[^a-zA-Z0-9:_/-]/g, '-')
  return `${DETACHED_READER_WINDOW_PREFIX}${normalizedId}-${Date.now()}`
}

export async function openDetachedReaderWindow({
  documentId,
  title,
  page,
  zoom,
  query,
  matchText,
}: OpenDetachedReaderWindowOptions) {
  const route = buildReaderViewRoute({
    documentId,
    page,
    zoom,
    query,
    matchText,
    detached: true,
  })

  if (!isTauri()) {
    if (typeof window !== 'undefined') {
      window.open(route, '_blank', 'noopener,noreferrer')
    }
    return
  }

  const currentWindow = getCurrentWindow()
  const currentPosition = await currentWindow.outerPosition().catch(() => null)
  const nextX = currentPosition ? currentPosition.x + 48 : undefined
  const nextY = currentPosition ? currentPosition.y + 48 : undefined

  const detachedWindow = new WebviewWindow(buildDetachedReaderWindowLabel(documentId), {
    url: route,
    title: title?.trim() ? `Refx Reader - ${title.trim()}` : 'Refx Reader',
    width: 1180,
    height: 900,
    minWidth: 820,
    minHeight: 640,
    x: nextX,
    y: nextY,
    center: currentPosition ? false : true,
    resizable: true,
    focus: true,
  })

  detachedWindow.once('tauri://created', async () => {
    await detachedWindow.setFocus().catch(() => undefined)
  })

  detachedWindow.once('tauri://error', (event) => {
    console.error('Failed to open detached reader window:', event)
  })
}

