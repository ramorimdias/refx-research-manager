'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, ChevronLeft, ChevronRight, FilePenLine, Highlighter, Loader2, MapPin, Printer, Search, SquareArrowOutUpRight, StickyNote, Trash2, Type, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import * as repo from '@/lib/repositories/local-db'
import { appDataDir, convertFileSrc, copyFile, getCurrentWindow, isTauri, join, mkdir, open, readFile } from '@/lib/tauri/client'
import { useAppStore } from '@/lib/store'
import { buildDocumentCommentTitle, getDocumentPageComments, getNextDocumentCommentNumber } from '@/lib/services/document-comment-service'
import {
  extractPdfPageWords,
  extractSearchPreview,
  findPdfSearchOccurrences,
  loadPdfJsModule,
  type PdfWord,
  type SearchOccurrence,
} from '@/lib/services/document-processing'
import { findDocumentPageHits } from '@/lib/services/document-search-service'
import { DETACHED_READER_QUERY_VALUE, openDetachedReaderWindow } from '@/lib/services/reader-window-service'
import { parseAreaNoteAnchor, serializeAreaNoteAnchor, type NoteAreaRect } from '@/lib/services/document-note-anchor-service'
import { cn } from '@/lib/utils'

type ReaderAreaHighlight = {
  id: string
  pageNumber: number
  rect: { x: number; y: number; width: number; height: number }
  color: string
}

function highlightText(text: string, query: string) {
  const trimmed = query.trim()
  if (!trimmed) return text

  const terms = Array.from(new Set([
    trimmed,
    ...trimmed.split(/\s+/).map((term) => term.trim()).filter((term) => term.length >= 2),
  ]))
  const pattern = terms
    .sort((left, right) => right.length - left.length)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  if (!pattern) return text

  const segments = text.split(new RegExp(`(${pattern})`, 'gi'))

  return segments.map((segment, index) =>
    terms.some((term) => term.toLowerCase() === segment.toLowerCase()) ? (
      <mark key={`${segment}-${index}`} className="rounded bg-primary/20 px-0.5 text-foreground">
        {segment}
      </mark>
    ) : (
      <span key={`${segment}-${index}`}>{segment}</span>
    ),
  )
}

function firstNonEmptyText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = (value ?? '').trim()
    if (normalized) return normalized
  }

  return ''
}

function normalizeZoomLevel(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 100
  return Math.min(250, Math.max(50, Math.round(value)))
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function hasSelectedText() {
  if (typeof window === 'undefined') return false
  return Boolean(window.getSelection?.()?.toString().trim())
}

function parseAreaHighlight(annotation: repo.DbAnnotation): ReaderAreaHighlight | null {
  if (annotation.kind !== 'highlight') return null
  if (!annotation.content) return null

  try {
    const parsed = JSON.parse(annotation.content) as {
      rect?: { x?: number; y?: number; width?: number; height?: number }
      color?: string
    }

    if (
      typeof parsed.rect?.x !== 'number'
      || typeof parsed.rect?.y !== 'number'
      || typeof parsed.rect?.width !== 'number'
      || typeof parsed.rect?.height !== 'number'
    ) {
      return null
    }

    return {
      id: annotation.id,
      pageNumber: annotation.pageNumber,
      rect: {
        x: clamp01(parsed.rect.x),
        y: clamp01(parsed.rect.y),
        width: clamp01(parsed.rect.width),
        height: clamp01(parsed.rect.height),
      },
      color: parsed.color ?? '#facc15',
    }
  } catch {
    return null
  }
}

function ReaderToolbarIconButton({
  label,
  children,
  className,
  ...props
}: React.ComponentProps<typeof Button> & {
  label: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          title={label}
          className={cn(
            'h-9 w-9 rounded-full border border-transparent text-muted-foreground hover:border-border/70 hover:bg-muted/70 hover:text-foreground',
            className,
          )}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

export default function ReaderViewPage() {
  const router = useRouter()
  const params = useSearchParams()
  const id = params.get('id') ?? ''
  const queryFromRoute = params.get('query') ?? ''
  const matchTextFromRoute = params.get('matchText') ?? ''
  const pageFromRoute = Number(params.get('page') ?? '1')
  const zoomFromRoute = Number(params.get('zoom') ?? '100')
  const returnTo = params.get('returnTo') ?? ''
  const isDetachedReaderWindow = params.get('detached') === DETACHED_READER_QUERY_VALUE
  const { documents, notes, annotations, scanDocumentsOcr, setActiveDocument, updateDocument, loadNotes, refreshData, isDesktopApp } = useAppStore()
  const document = useMemo(() => documents.find((entry) => entry.id === id) ?? null, [documents, id])
  const [page, setPage] = useState(Number.isFinite(pageFromRoute) && pageFromRoute > 0 ? pageFromRoute : 1)
  const [zoom, setZoom] = useState(normalizeZoomLevel(zoomFromRoute))
  const [renderZoom, setRenderZoom] = useState(normalizeZoomLevel(zoomFromRoute))
  const [isTextSelectionMode, setIsTextSelectionMode] = useState(false)
  const [isTextSelectionGestureActive, setIsTextSelectionGestureActive] = useState(false)
  const [commentDraftContent, setCommentDraftContent] = useState('')
  const [commentDraftPosition, setCommentDraftPosition] = useState<{ x: number; y: number } | null>(null)
  const [commentDraftAreaRect, setCommentDraftAreaRect] = useState<NoteAreaRect | null>(null)
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null)
  const [isDeleteCommentDialogOpen, setIsDeleteCommentDialogOpen] = useState(false)
  const [isNoteEditorOpen, setIsNoteEditorOpen] = useState(false)
  const [isSelectingCommentPosition, setIsSelectingCommentPosition] = useState(false)
  const [isSavingComment, setIsSavingComment] = useState(false)
  const [viewerError, setViewerError] = useState<string | null>(null)
  const [isPdfLoading, setIsPdfLoading] = useState(false)
  const [hasViewerTimedOut, setHasViewerTimedOut] = useState(false)
  const [isPageRendering, setIsPageRendering] = useState(false)
  const [isRunningOcr, setIsRunningOcr] = useState(false)
  const [isHighlightMode, setIsHighlightMode] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  const [pdfDocument, setPdfDocument] = useState<{ numPages: number; getPage: (pageNumber: number) => Promise<unknown>; destroy?: () => Promise<void> } | null>(null)
  const [embeddedPdfUrl, setEmbeddedPdfUrl] = useState<string | null>(null)
  const [viewerMode, setViewerMode] = useState<'pdfjs' | 'native' | 'unavailable'>('pdfjs')
  const [renderedPageSize, setRenderedPageSize] = useState({ width: 0, height: 0 })
  const [pageWords, setPageWords] = useState<PdfWord[]>([])
  const [searchQuery, setSearchQuery] = useState(queryFromRoute)
  const [activeOccurrenceIndex, setActiveOccurrenceIndex] = useState(0)
  const [searchOccurrences, setSearchOccurrences] = useState<SearchOccurrence[]>([])
  const occurrenceRefs = useRef<Array<HTMLButtonElement | null>>([])
  const commentCardRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const noteEditorTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const shouldAutoScrollOccurrenceRef = useRef(false)
  const shouldAutoScrollCommentRef = useRef(false)
  const shouldAutoFocusNoteEditorRef = useRef(false)
  const skipNextTransientTextDismissRef = useRef(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const readerViewportRef = useRef<HTMLDivElement | null>(null)
  const pageScrollLockRef = useRef(false)
  const initializedDocumentIdRef = useRef<string | null>(null)
  const routeSelectionKeyRef = useRef<string | null>(null)
  const notePlacementStartRef = useRef<{ x: number; y: number } | null>(null)
  const highlightDragStartRef = useRef<{ x: number; y: number } | null>(null)
  const [draftHighlightRect, setDraftHighlightRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null)

  useEffect(() => {
    setSearchQuery(queryFromRoute)
  }, [queryFromRoute])

  useEffect(() => {
    if (Number.isFinite(pageFromRoute) && pageFromRoute > 0) {
      setPage(pageFromRoute)
    }
  }, [pageFromRoute])

  useEffect(() => {
    setZoom(normalizeZoomLevel(zoomFromRoute))
  }, [zoomFromRoute])

  useEffect(() => {
    const normalizedZoom = normalizeZoomLevel(zoom)
    if (normalizedZoom === renderZoom) return

    const timeout = window.setTimeout(() => {
      setRenderZoom(normalizedZoom)
    }, 500)

    return () => window.clearTimeout(timeout)
  }, [renderZoom, zoom])

  useEffect(() => {
    if (!document) return
    setActiveDocument(document.id)
    if (initializedDocumentIdRef.current !== document.id) {
      if (Number.isFinite(pageFromRoute) && pageFromRoute > 0) {
        setPage(pageFromRoute)
      } else if (document.lastReadPage) {
        setPage(document.lastReadPage)
      }
    }
    initializedDocumentIdRef.current = document.id
    if (document.readingStage === 'unread') {
      void updateDocument(document.id, { readingStage: 'reading' })
    }
  }, [document?.id, document?.lastReadPage, document?.readingStage, pageFromRoute, setActiveDocument, updateDocument])

  useEffect(() => {
    if (!isDetachedReaderWindow || !isTauri() || !document?.title) return

    void getCurrentWindow().setTitle(`Refx Reader - ${document.title}`)
  }, [document?.title, isDetachedReaderWindow])

  useEffect(() => {
    let cancelled = false
    let loadedPdf: { destroy?: () => Promise<void> } | null = null
    let settled = false
    const timeoutId = window.setTimeout(() => {
      if (!cancelled && !settled) {
        setHasViewerTimedOut(true)
        setIsPdfLoading(false)
      }
    }, 2500)

    const loadPdf = async () => {
      if (!document?.filePath || !isTauri()) {
        settled = true
        setPdfDocument(null)
        setEmbeddedPdfUrl(null)
        setViewerMode('unavailable')
        setRenderedPageSize({ width: 0, height: 0 })
        setPageWords([])
        setHasViewerTimedOut(false)
        return
      }

      setHasViewerTimedOut(false)
      setIsPdfLoading(true)

      try {
        const pdfjs = await loadPdfJsModule()
        const bytes = await readFile(document.filePath)
        const task = pdfjs.getDocument({
          data: new Uint8Array(bytes),
          useWorkerFetch: false,
          isEvalSupported: false,
          stopAtErrors: false,
        })

        const nextPdf = (await task.promise) as {
          numPages: number
          getPage: (pageNumber: number) => Promise<unknown>
          destroy?: () => Promise<void>
        }
        loadedPdf = nextPdf

        if (cancelled) {
          await nextPdf.destroy?.()
          return
        }

        settled = true
        window.clearTimeout(timeoutId)
        setPdfDocument(nextPdf)
        setEmbeddedPdfUrl(convertFileSrc(document.filePath))
        setViewerMode('pdfjs')
        setViewerError(null)
        setHasViewerTimedOut(false)
        setPage((current) => Math.min(Math.max(1, current), nextPdf.numPages))
      } catch (error) {
        console.error('Failed to load PDF for embedded viewer:', error)
        settled = true
        window.clearTimeout(timeoutId)
        setPdfDocument(null)
        setEmbeddedPdfUrl(convertFileSrc(document.filePath))
        setViewerMode('native')
        setRenderedPageSize({ width: 0, height: 0 })
        setPageWords([])
        setHasViewerTimedOut(false)
        setViewerError('Advanced PDF rendering is unavailable. Showing a basic PDF preview instead.')
      } finally {
        if (!cancelled) {
          setIsPdfLoading(false)
        }
      }
    }

    void loadPdf()

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
      void loadedPdf?.destroy?.()
    }
  }, [document?.filePath])

  useEffect(() => {
    if (!id || !document) return
    const timeout = window.setTimeout(() => {
      void updateDocument(id, {
        readingStage: document.readingStage === 'unread' ? 'reading' : document.readingStage,
      })
      void repo.updateDocumentMetadata(id, {
        lastReadPage: page,
        lastOpenedAt: new Date().toISOString(),
      })
    }, 150)

    return () => window.clearTimeout(timeout)
  }, [document, id, page, updateDocument])

  useEffect(() => {
    let cancelled = false

    const loadOccurrences = async () => {
      if (!document || !searchQuery.trim()) {
        setSearchOccurrences([])
        return
      }

      if (viewerMode === 'pdfjs' && document.filePath && isTauri()) {
        try {
          const results = await findPdfSearchOccurrences(document.filePath, searchQuery, document.pageCount)
          if (!cancelled) {
            setSearchOccurrences(results)
            return
          }
        } catch (error) {
          console.warn('PDF occurrence search failed, falling back to indexed text:', error)
        }
      }

      if (!cancelled) {
        const fallbackResults = await findDocumentPageHits(document.id, searchQuery)
        if (!cancelled) {
          setSearchOccurrences(fallbackResults)
        }
      }
    }

    void loadOccurrences()

    return () => {
      cancelled = true
    }
  }, [document, searchQuery, viewerMode])

  useEffect(() => {
    let cancelled = false

    const loadPageWords = async () => {
      if (
        !document?.filePath
        || !isTauri()
        || viewerMode !== 'pdfjs'
        || (!isTextSelectionMode && !isTextSelectionGestureActive)
      ) {
        setPageWords([])
        return
      }

      try {
        const pages = await extractPdfPageWords(document.filePath)
        if (cancelled) return
        setPageWords(pages.find((entry) => entry.pageNumber === page)?.words ?? [])
      } catch (error) {
        if (!cancelled) {
          console.warn('Failed to load page text layer:', error)
          setPageWords([])
        }
      }
    }

    void loadPageWords()

    return () => {
      cancelled = true
    }
  }, [document?.filePath, page, viewerMode, isTextSelectionGestureActive, isTextSelectionMode])

  const activeOccurrence = searchOccurrences[activeOccurrenceIndex] ?? null
  const zoomPreviewScale = renderZoom > 0 ? zoom / renderZoom : 1
  const currentPageOccurrences = useMemo(
    () => searchOccurrences.filter((occurrence) => occurrence.estimatedPage === page),
    [page, searchOccurrences],
  )
  const canUsePreciseViewer = viewerMode === 'pdfjs' && Boolean(pdfDocument)
  const showViewerLoading =
    Boolean(document?.filePath)
    && (isPdfLoading || (!canUsePreciseViewer && !embeddedPdfUrl && !hasViewerTimedOut))
  const currentPageHighlights = useMemo(
    () => currentPageOccurrences.filter((occurrence) => occurrence.rects?.length),
    [currentPageOccurrences],
  )
  const hasExactHighlightOverlay = currentPageHighlights.length > 0
  const currentPageComments = useMemo(
    () => (id ? getDocumentPageComments(notes, id, page) : []),
    [id, notes, page],
  )
  const currentPageAreaHighlights = useMemo(
    () =>
      (id
        ? annotations
            .filter((annotation) => annotation.documentId === id && annotation.pageNumber === page)
            .map(parseAreaHighlight)
            .filter((annotation): annotation is ReaderAreaHighlight => Boolean(annotation))
        : []),
    [annotations, id, page],
  )
  const nextCommentNumber = useMemo(
    () => (id ? getNextDocumentCommentNumber(notes, id) : 1),
    [id, notes],
  )
  const selectedComment = useMemo(
    () => currentPageComments.find((entry) => entry.id === selectedCommentId) ?? null,
    [currentPageComments, selectedCommentId],
  )
  const positionedPageComments = useMemo(
    () =>
      currentPageComments.filter(
        (comment) => typeof comment.positionX === 'number' && typeof comment.positionY === 'number',
      ),
    [currentPageComments],
  )
  const noteAreaComments = useMemo(
    () => positionedPageComments.filter((comment) => comment.areaRect),
    [positionedPageComments],
  )
  const notePointComments = useMemo(
    () => positionedPageComments.filter((comment) => !comment.areaRect),
    [positionedPageComments],
  )
  const draftNotePreview = useMemo(() => {
    if (selectedCommentId || !commentDraftPosition) return null

    return {
      position: commentDraftPosition,
      areaRect: commentDraftAreaRect,
      commentNumber: nextCommentNumber,
    }
  }, [commentDraftAreaRect, commentDraftPosition, nextCommentNumber, selectedCommentId])

  useEffect(() => {
    if (isSavingComment) return
    if (selectedCommentId && !currentPageComments.some((comment) => comment.id === selectedCommentId)) {
      setSelectedCommentId(null)
    }
  }, [currentPageComments, isSavingComment, selectedCommentId])

  useEffect(() => {
    if (selectedComment) {
      setCommentDraftContent(selectedComment.content)
      setCommentDraftPosition(
        typeof selectedComment.positionX === 'number' && typeof selectedComment.positionY === 'number'
          ? { x: selectedComment.positionX, y: selectedComment.positionY }
          : null,
      )
      setCommentDraftAreaRect(selectedComment.areaRect ?? null)
    } else {
      setCommentDraftContent('')
      setCommentDraftPosition(null)
      setCommentDraftAreaRect(null)
    }
  }, [page, selectedComment?.areaRect, selectedComment?.content, selectedComment?.id, selectedComment?.positionX, selectedComment?.positionY])

  useEffect(() => {
    setIsSelectingCommentPosition(false)
    setIsNoteEditorOpen(false)
    setCommentDraftAreaRect(null)
    notePlacementStartRef.current = null
    setIsHighlightMode(false)
    setIsTextSelectionGestureActive(false)
    setDraftHighlightRect(null)
    highlightDragStartRef.current = null
  }, [page])

  useEffect(() => {
    setActiveOccurrenceIndex(0)
    shouldAutoScrollOccurrenceRef.current = false
  }, [searchQuery, document?.id])

  useEffect(() => {
    if (shouldAutoScrollOccurrenceRef.current) {
      occurrenceRefs.current[activeOccurrenceIndex]?.scrollIntoView({ block: 'nearest' })
      shouldAutoScrollOccurrenceRef.current = false
    }
  }, [activeOccurrenceIndex])

  useEffect(() => {
    if (shouldAutoScrollCommentRef.current && selectedCommentId) {
      commentCardRefs.current[selectedCommentId]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      shouldAutoScrollCommentRef.current = false
    }
  }, [selectedCommentId])

  useEffect(() => {
    if (!isNoteEditorOpen || !shouldAutoFocusNoteEditorRef.current) return

    const rafId = window.requestAnimationFrame(() => {
      noteEditorTextareaRef.current?.focus()
      shouldAutoFocusNoteEditorRef.current = false
    })

    return () => window.cancelAnimationFrame(rafId)
  }, [isNoteEditorOpen])

  const isTextSelectionLayerVisible = isTextSelectionMode || isTextSelectionGestureActive

  const handleTextSelectionGestureStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canUsePreciseViewer || isHighlightMode || isSelectingCommentPosition) return
    if (event.button !== 0) return
    setIsTextSelectionGestureActive(true)
  }

  const handleTextSelectionGestureEnd = () => {
    if (isTextSelectionMode) return
    window.requestAnimationFrame(() => {
      skipNextTransientTextDismissRef.current = true
      setIsTextSelectionGestureActive(true)
    })
  }

  const handleTransientTextSelectionDismiss = () => {
    if (isTextSelectionMode || !isTextSelectionGestureActive) return
    if (skipNextTransientTextDismissRef.current) {
      skipNextTransientTextDismissRef.current = false
      return
    }
    if (!hasSelectedText()) {
      setIsTextSelectionGestureActive(false)
      return
    }
    window.getSelection?.()?.removeAllRanges()
    setIsTextSelectionGestureActive(false)
  }

  useEffect(() => {
    const viewport = readerViewportRef.current
    if (!viewport) return

    const releaseLock = () => {
      window.setTimeout(() => {
        pageScrollLockRef.current = false
      }, 160)
    }

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        const zoomStep = event.deltaY < 0 ? 2 : -2
        setZoom((current) => Math.max(50, Math.min(250, current + zoomStep)))
        return
      }

      if (pageScrollLockRef.current || !pdfDocument) return
      if (isSelectingCommentPosition) return

      const { scrollTop, clientHeight, scrollHeight } = viewport
      const nearTop = scrollTop <= 4
      const nearBottom = scrollTop + clientHeight >= scrollHeight - 4

      if (
        event.deltaY > 0 &&
        nearBottom &&
        page < pdfDocument.numPages
      ) {
        event.preventDefault()
        pageScrollLockRef.current = true
        setPage((current) => Math.min(pdfDocument.numPages, current + 1))
        viewport.scrollTop = 0
        releaseLock()
      } else if (
        event.deltaY < 0 &&
        nearTop &&
        page > 1
      ) {
        event.preventDefault()
        pageScrollLockRef.current = true
        setPage((current) => Math.max(1, current - 1))
        window.requestAnimationFrame(() => {
          viewport.scrollTop = viewport.scrollHeight
        })
        releaseLock()
      }
    }

    viewport.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      viewport.removeEventListener('wheel', handleWheel)
    }
  }, [page, pdfDocument, isSelectingCommentPosition])

  useEffect(() => {
    let cancelled = false
    let renderTask: { promise?: Promise<void>; cancel?: () => void } | null = null

    const renderCurrentPage = async () => {
      if (!pdfDocument || !canvasRef.current) return

      setIsPageRendering(true)

      try {
        const pdfPage = (await pdfDocument.getPage(page)) as {
          getViewport: (args: { scale: number }) => { width: number; height: number }
          render: (args: {
            canvasContext: CanvasRenderingContext2D
            viewport: { width: number; height: number }
            transform?: number[]
          }) => { promise: Promise<void>; cancel?: () => void }
          cleanup?: () => void
        }
        if (cancelled) return

        const scale = renderZoom / 100
        const viewport = pdfPage.getViewport({ scale })
        const canvas = canvasRef.current
        const context = canvas.getContext('2d')
        if (!context) return

        const devicePixelRatio = window.devicePixelRatio || 1
        canvas.width = Math.ceil(viewport.width * devicePixelRatio)
        canvas.height = Math.ceil(viewport.height * devicePixelRatio)
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`
        context.setTransform(1, 0, 0, 1, 0, 0)
        context.clearRect(0, 0, canvas.width, canvas.height)

        renderTask = pdfPage.render({
          canvasContext: context,
          viewport,
          transform: devicePixelRatio === 1 ? undefined : [devicePixelRatio, 0, 0, devicePixelRatio, 0, 0],
        })
        await renderTask.promise

        if (!cancelled) {
          setRenderedPageSize({ width: viewport.width, height: viewport.height })
        }

        pdfPage.cleanup?.()
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to render PDF page:', error)
          setViewerError('Embedded PDF preview is unavailable. Open this document in your system PDF app.')
        }
      } finally {
        if (!cancelled) {
          setIsPageRendering(false)
        }
      }
    }

    void renderCurrentPage()

    return () => {
      cancelled = true
      renderTask?.cancel?.()
    }
  }, [page, pdfDocument, renderZoom])

  const selectOccurrence = (index: number, options?: { jumpToPage?: boolean }) => {
    const occurrence = searchOccurrences[index]
    if (!occurrence) return

    shouldAutoScrollOccurrenceRef.current = true
    setActiveOccurrenceIndex(index)
    if (options?.jumpToPage) {
      setPage(occurrence.estimatedPage)
    }
  }

  const rotateOccurrence = (direction: 'next' | 'prev') => {
    if (searchOccurrences.length === 0) return
    const nextIndex =
      direction === 'next'
        ? (activeOccurrenceIndex + 1) % searchOccurrences.length
        : (activeOccurrenceIndex - 1 + searchOccurrences.length) % searchOccurrences.length
    selectOccurrence(nextIndex, { jumpToPage: true })
  }

  useEffect(() => {
    if (!searchQuery.trim() || searchOccurrences.length === 0) return
    if (searchQuery.trim() !== queryFromRoute.trim()) return

    const routeKey = `${document?.id ?? ''}:${queryFromRoute}:${pageFromRoute}:${matchTextFromRoute}`
    if (routeSelectionKeyRef.current === routeKey) return

    const normalizedRouteMatch = matchTextFromRoute.trim().toLowerCase()
    const targetPage = Number.isFinite(pageFromRoute) && pageFromRoute > 0 ? pageFromRoute : undefined
    let nextIndex = -1

    if (targetPage && normalizedRouteMatch) {
      nextIndex = searchOccurrences.findIndex((occurrence) =>
        occurrence.estimatedPage === targetPage
        && firstNonEmptyText(occurrence.matchedText, occurrence.snippet).toLowerCase().includes(normalizedRouteMatch),
      )
    }

    if (nextIndex < 0 && targetPage) {
      nextIndex = searchOccurrences.findIndex((occurrence) => occurrence.estimatedPage === targetPage)
    }

    if (nextIndex < 0 && normalizedRouteMatch) {
      nextIndex = searchOccurrences.findIndex((occurrence) =>
        firstNonEmptyText(occurrence.matchedText, occurrence.snippet).toLowerCase().includes(normalizedRouteMatch),
      )
    }

    if (nextIndex >= 0) {
      routeSelectionKeyRef.current = routeKey
      selectOccurrence(nextIndex, { jumpToPage: true })
    }
  }, [document?.id, matchTextFromRoute, pageFromRoute, queryFromRoute, searchOccurrences, searchQuery])

  const importPdfForDocument = async () => {
    if (!isTauri() || !document?.id || !document?.libraryId) return

    const selected = await open({
      multiple: false,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      title: 'Import PDF for this document',
    })

    if (!selected || Array.isArray(selected)) return

    const base = await appDataDir()
    const targetDir = await join(base, 'pdfs', document.libraryId)
    await mkdir(targetDir, { recursive: true })

    const destination = await join(targetDir, `${document.id}.pdf`)
    await copyFile(selected, destination)

    await repo.updateDocumentMetadata(document.id, {
      sourcePath: selected,
      importedFilePath: destination,
      textExtractionStatus: 'pending',
      ocrStatus: 'pending',
      indexingStatus: 'pending',
      tagSuggestionStatus: 'pending',
      classificationResult: '',
      classificationTextHash: '',
      classificationStatus: 'pending',
      processingError: '',
      processingUpdatedAt: new Date().toISOString(),
    })
    await refreshData()
  }

  const runOcrForDocument = async () => {
    if (!isDesktopApp || !document?.id || !document.filePath) return

    setIsRunningOcr(true)
    try {
      await scanDocumentsOcr([document.id])
    } finally {
      setIsRunningOcr(false)
    }
  }

  const detachReaderWindow = async () => {
    if (!document?.id) return

    await openDetachedReaderWindow({
      documentId: document.id,
      title: document.title,
      page,
      zoom,
      query: searchQuery.trim() || undefined,
      matchText: firstNonEmptyText(activeOccurrence?.matchedText, activeOccurrence?.snippet) || undefined,
    })
  }

  const handlePrintDocument = async () => {
    if (!document?.filePath || !isTauri()) return

    setIsPrinting(true)

    const printFrame = window.document.createElement('iframe')
    printFrame.setAttribute('aria-hidden', 'true')
    printFrame.style.position = 'fixed'
    printFrame.style.right = '0'
    printFrame.style.bottom = '0'
    printFrame.style.width = '1px'
    printFrame.style.height = '1px'
    printFrame.style.opacity = '0'
    printFrame.style.pointerEvents = 'none'
    printFrame.style.border = '0'
    window.document.body.appendChild(printFrame)

    const printWindow = printFrame.contentWindow
    if (!printWindow) {
      printFrame.remove()
      setIsPrinting(false)
      return
    }

    printWindow.document.open()
    printWindow.document.write(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${document.title} - Print</title>
    <style>
      :root { color-scheme: light; }
      * {
        box-sizing: border-box;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      @page {
        size: A4 portrait;
        margin: 4mm;
      }
      body {
        margin: 0;
        background: #f5f5f4;
        color: #111827;
        font-family: "Segoe UI", Arial, sans-serif;
      }
      .print-shell {
        padding: 24px;
      }
      .print-status {
        color: #6b7280;
        font-size: 14px;
      }
      .print-page {
        position: relative;
        display: block;
        width: 202mm;
        height: 289mm;
        margin: 0 auto 24px;
        background: white;
        box-shadow: 0 8px 28px rgba(15, 23, 42, 0.12);
        overflow: visible;
        font-size: 0;
        line-height: 0;
      }
      .print-page img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: contain;
        object-position: center;
      }
      .overlay {
        position: absolute;
        inset: 0;
        overflow: visible;
      }
      .search-highlight {
        position: absolute;
        border-radius: 2px;
      }
      @media print {
        body {
          background: white;
        }
        .print-shell {
          padding: 0;
        }
        .print-status {
          display: none;
        }
        .print-page {
          width: 202mm;
          height: 289mm;
          margin: 0;
          box-shadow: none;
          overflow: hidden;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .print-page:not(:last-child) {
          break-after: page;
          page-break-after: always;
        }
      }
    </style>
  </head>
  <body>
    <div class="print-shell">
      <div id="print-status" class="print-status">Preparing document for printing...</div>
      <div id="print-pages"></div>
    </div>
  </body>
</html>`)
    printWindow.document.close()

    const statusEl = printWindow.document.getElementById('print-status')
    const pagesRoot = printWindow.document.getElementById('print-pages')

    if (!statusEl || !pagesRoot) {
      printFrame.remove()
      setIsPrinting(false)
      return
    }

    try {
      const allAreaHighlights = annotations
        .filter((annotation) => annotation.documentId === document.id)
        .map(parseAreaHighlight)
        .filter((annotation): annotation is ReaderAreaHighlight => Boolean(annotation))

      const areaHighlightsByPage = new Map<number, ReaderAreaHighlight[]>()
      for (const highlight of allAreaHighlights) {
        const existing = areaHighlightsByPage.get(highlight.pageNumber) ?? []
        existing.push(highlight)
        areaHighlightsByPage.set(highlight.pageNumber, existing)
      }

      const noteOverlaysByPage = new Map<number, Array<{
        commentNumber: number
        positionX: number
        positionY: number
        areaRect: NoteAreaRect | null
      }>>()

      for (const note of notes) {
        if (note.documentId !== document.id) continue
        if (typeof note.pageNumber !== 'number') continue
        if (typeof note.positionX !== 'number' || typeof note.positionY !== 'number') continue

        const existing = noteOverlaysByPage.get(note.pageNumber) ?? []
        existing.push({
          commentNumber: note.commentNumber ?? nextCommentNumber,
          positionX: note.positionX,
          positionY: note.positionY,
          areaRect: parseAreaNoteAnchor(note.locationHint),
        })
        noteOverlaysByPage.set(note.pageNumber, existing)
      }

      const searchHighlightsByPage = new Map<number, Array<{
        occurrenceIndex: number
        rect: { left: number; top: number; width: number; height: number }
        isActive: boolean
      }>>()

      for (const occurrence of searchOccurrences) {
        if (!occurrence.rects?.length) continue
        const existing = searchHighlightsByPage.get(occurrence.estimatedPage) ?? []
        for (const rect of occurrence.rects) {
          existing.push({
            occurrenceIndex: occurrence.index,
            rect,
            isActive: occurrence.index === activeOccurrenceIndex,
          })
        }
        searchHighlightsByPage.set(occurrence.estimatedPage, existing)
      }

      const pdfjs = await loadPdfJsModule() as unknown as {
        getDocument: (source: Record<string, unknown>) => { promise: Promise<{
          numPages: number
          getPage: (pageNumber: number) => Promise<{
            getViewport: (args: { scale: number }) => { width: number; height: number }
            render: (args: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> }
            cleanup?: () => void
          }>
          destroy?: () => Promise<void>
        }> }
      }

      const bytes = await readFile(document.filePath)
      const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(bytes),
        useWorkerFetch: false,
        isEvalSupported: false,
        stopAtErrors: false,
      })

      const printablePdf = await loadingTask.promise

      try {
        for (let pageNumber = 1; pageNumber <= printablePdf.numPages; pageNumber += 1) {
          statusEl.textContent = `Preparing page ${pageNumber} of ${printablePdf.numPages}...`

          const pdfPage = await printablePdf.getPage(pageNumber)
          const baseViewport = pdfPage.getViewport({ scale: 1 })
          const renderViewport = pdfPage.getViewport({ scale: 2 })
          const renderCanvas = window.document.createElement('canvas')
          renderCanvas.width = Math.ceil(renderViewport.width)
          renderCanvas.height = Math.ceil(renderViewport.height)
          const renderContext = renderCanvas.getContext('2d')
          if (!renderContext) continue

          await pdfPage.render({
            canvasContext: renderContext,
            viewport: renderViewport,
          }).promise

          const pageSection = printWindow.document.createElement('section')
          pageSection.className = 'print-page'
          const scaleX = renderViewport.width / baseViewport.width
          const scaleY = renderViewport.height / baseViewport.height

          const searchHighlights = searchHighlightsByPage.get(pageNumber) ?? []
          for (const searchHighlight of searchHighlights) {
            const left = searchHighlight.rect.left * scaleX
            const top = searchHighlight.rect.top * scaleY
            const width = searchHighlight.rect.width * scaleX
            const height = Math.max(10 * scaleY, searchHighlight.rect.height * scaleY)
            renderContext.fillStyle = searchHighlight.isActive ? 'rgba(251, 191, 36, 0.42)' : 'rgba(125, 211, 252, 0.28)'
            renderContext.fillRect(left, top, width, height)
            if (searchHighlight.isActive) {
              renderContext.strokeStyle = 'rgba(245, 158, 11, 0.7)'
              renderContext.lineWidth = Math.max(1, scaleX)
              renderContext.strokeRect(left, top, width, height)
            }
          }

          const savedHighlights = areaHighlightsByPage.get(pageNumber) ?? []
          for (const highlight of savedHighlights) {
            const left = highlight.rect.x * renderViewport.width
            const top = highlight.rect.y * renderViewport.height
            const width = highlight.rect.width * renderViewport.width
            const height = highlight.rect.height * renderViewport.height
            renderContext.fillStyle = 'rgba(254, 240, 138, 0.38)'
            renderContext.fillRect(left, top, width, height)
            renderContext.strokeStyle = 'rgba(202, 138, 4, 0.22)'
            renderContext.lineWidth = Math.max(1, scaleX * 0.6)
            renderContext.strokeRect(left, top, width, height)
          }

          const noteOverlays = noteOverlaysByPage.get(pageNumber) ?? []
          for (const note of noteOverlays) {
            const badgeText = String(note.commentNumber)
            const badgeHeight = Math.max(24, 24 * scaleY)
            const badgeRadius = badgeHeight / 2
            renderContext.font = `${Math.max(11, 11 * scaleY)}px "Segoe UI", Arial, sans-serif`
            const textMetrics = renderContext.measureText(badgeText)
            const badgeWidth = Math.max(badgeHeight, textMetrics.width + 12 * scaleX)

            if (note.areaRect) {
              const left = note.areaRect.x * renderViewport.width
              const top = note.areaRect.y * renderViewport.height
              const width = note.areaRect.width * renderViewport.width
              const height = note.areaRect.height * renderViewport.height
              renderContext.fillStyle = 'rgba(254, 240, 138, 0.34)'
              renderContext.fillRect(left, top, width, height)
              renderContext.strokeStyle = 'rgba(202, 138, 4, 0.18)'
              renderContext.lineWidth = Math.max(1, scaleX * 0.6)
              renderContext.strokeRect(left, top, width, height)

              const badgeX = left + 6 * scaleX
              const badgeY = top + 6 * scaleY
              renderContext.fillStyle = '#f59e0b'
              renderContext.beginPath()
              renderContext.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, badgeRadius)
              renderContext.fill()
              renderContext.fillStyle = '#ffffff'
              renderContext.textAlign = 'center'
              renderContext.textBaseline = 'middle'
              renderContext.fillText(badgeText, badgeX + badgeWidth / 2, badgeY + badgeHeight / 2)
              continue
            }

            const centerX = note.positionX * renderViewport.width
            const centerY = note.positionY * renderViewport.height - badgeHeight / 2
            renderContext.fillStyle = '#f59e0b'
            renderContext.beginPath()
            renderContext.roundRect(centerX - badgeWidth / 2, centerY - badgeHeight / 2, badgeWidth, badgeHeight, badgeRadius)
            renderContext.fill()
            renderContext.fillStyle = '#ffffff'
            renderContext.textAlign = 'center'
            renderContext.textBaseline = 'middle'
            renderContext.fillText(badgeText, centerX, centerY)
          }

          const pageImage = printWindow.document.createElement('img')
          pageImage.src = renderCanvas.toDataURL('image/png')
          pageImage.alt = `${document.title} page ${pageNumber}`
          pageSection.appendChild(pageImage)
          pagesRoot.appendChild(pageSection)
          pdfPage.cleanup?.()
        }
      } finally {
        await printablePdf.destroy?.()
      }

      statusEl.remove()
      printWindow.focus()
      const cleanupPrintFrame = () => {
        window.setTimeout(() => {
          printFrame.remove()
        }, 400)
      }
      printWindow.addEventListener('afterprint', cleanupPrintFrame, { once: true })
      window.setTimeout(() => {
        printWindow.print()
      }, 120)
    } catch (error) {
      console.error('Failed to prepare printable document:', error)
      statusEl.textContent = 'Unable to prepare document for printing.'
      printFrame.remove()
    } finally {
      setIsPrinting(false)
    }
  }

  const handlePageCommentSelection = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isSelectingCommentPosition || renderedPageSize.width <= 0 || renderedPageSize.height <= 0) return

    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return

    const x = clamp01((event.clientX - bounds.left) / bounds.width)
    const y = clamp01((event.clientY - bounds.top) / bounds.height)

    setCommentDraftPosition({ x, y })
    setCommentDraftAreaRect(null)
    shouldAutoFocusNoteEditorRef.current = true
    setIsSelectingCommentPosition(false)
    setIsNoteEditorOpen(true)
  }

  const updateDraftNoteRect = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = notePlacementStartRef.current
    if (!start) return

    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return

    const currentX = clamp01((event.clientX - bounds.left) / bounds.width)
    const currentY = clamp01((event.clientY - bounds.top) / bounds.height)

    setCommentDraftAreaRect({
      x: Math.min(start.x, currentX),
      y: Math.min(start.y, currentY),
      width: Math.abs(currentX - start.x),
      height: Math.abs(currentY - start.y),
    })
  }

  const handleNotePlacementPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isSelectingCommentPosition) return
    if (event.button !== 0) return

    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return

    event.preventDefault()
    event.stopPropagation()

    const start = {
      x: clamp01((event.clientX - bounds.left) / bounds.width),
      y: clamp01((event.clientY - bounds.top) / bounds.height),
    }

    notePlacementStartRef.current = start
    setCommentDraftPosition(start)
    setCommentDraftAreaRect({
      x: start.x,
      y: start.y,
      width: 0,
      height: 0,
    })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleNotePlacementPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!notePlacementStartRef.current) return
    updateDraftNoteRect(event)
  }

  const handleNotePlacementPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = notePlacementStartRef.current
    if (!start) return

    event.preventDefault()
    event.stopPropagation()

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    updateDraftNoteRect(event)

    const nextRect = commentDraftAreaRect ?? {
      x: start.x,
      y: start.y,
      width: 0,
      height: 0,
    }

    notePlacementStartRef.current = null

    if (nextRect.width >= 0.01 && nextRect.height >= 0.01) {
      setCommentDraftPosition({ x: nextRect.x, y: nextRect.y })
      setCommentDraftAreaRect(nextRect)
    } else {
      setCommentDraftPosition(start)
      setCommentDraftAreaRect(null)
    }

    setIsSelectingCommentPosition(false)
    setIsNoteEditorOpen(true)
  }

  const updateDraftHighlightRect = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = highlightDragStartRef.current
    if (!start) return

    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return

    const currentX = clamp01((event.clientX - bounds.left) / bounds.width)
    const currentY = clamp01((event.clientY - bounds.top) / bounds.height)

    setDraftHighlightRect({
      x: Math.min(start.x, currentX),
      y: Math.min(start.y, currentY),
      width: Math.abs(currentX - start.x),
      height: Math.abs(currentY - start.y),
    })
  }

  const handleHighlightPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isHighlightMode || !canUsePreciseViewer) return
    if (event.button !== 0) return

    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return

    event.preventDefault()
    event.stopPropagation()

    const start = {
      x: clamp01((event.clientX - bounds.left) / bounds.width),
      y: clamp01((event.clientY - bounds.top) / bounds.height),
    }

    highlightDragStartRef.current = start
    setDraftHighlightRect({
      x: start.x,
      y: start.y,
      width: 0,
      height: 0,
    })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleHighlightPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!highlightDragStartRef.current) return
    updateDraftHighlightRect(event)
  }

  const handleHighlightPointerEnd = async (event: React.PointerEvent<HTMLDivElement>) => {
    const start = highlightDragStartRef.current
    if (!start) return

    event.preventDefault()
    event.stopPropagation()

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    updateDraftHighlightRect(event)

    const rect = draftHighlightRect
      ?? {
        x: start.x,
        y: start.y,
        width: 0,
        height: 0,
      }

    highlightDragStartRef.current = null
    setDraftHighlightRect(null)

    if (!id || !isDesktopApp) return
    if (rect.width < 0.01 || rect.height < 0.01) return

    await repo.createAnnotation({
      documentId: id,
      pageNumber: page,
      kind: 'highlight',
      content: JSON.stringify({
        rect,
        color: '#fde047',
      }),
    })
    await refreshData()
    setIsHighlightMode(false)
  }

  const handleDeleteAreaHighlight = async (highlightId: string) => {
    if (!isDesktopApp) return
    await repo.deleteAnnotation(highlightId)
    await refreshData()
  }

  const handleStartNewComment = () => {
    setSelectedCommentId(null)
    setCommentDraftContent('')
    setCommentDraftPosition(null)
    setCommentDraftAreaRect(null)
    setIsNoteEditorOpen(false)
    setIsSelectingCommentPosition(true)
  }

  const handleSelectComment = (commentId: string, options?: { scrollIntoView?: boolean }) => {
    if (options?.scrollIntoView) {
      shouldAutoScrollCommentRef.current = true
    }
    setIsSelectingCommentPosition(false)
    setIsNoteEditorOpen(false)
    setSelectedCommentId(commentId)
  }

  const handleOpenCommentEditor = () => {
    if (!selectedComment && !commentDraftPosition) return
    setIsSelectingCommentPosition(false)
    setIsNoteEditorOpen(true)
  }

  const handleCancelCommentEditor = () => {
    if (selectedComment) {
      setCommentDraftContent(selectedComment.content)
      setCommentDraftPosition(
        typeof selectedComment.positionX === 'number' && typeof selectedComment.positionY === 'number'
          ? { x: selectedComment.positionX, y: selectedComment.positionY }
          : null,
      )
      setCommentDraftAreaRect(selectedComment.areaRect ?? null)
    } else {
      setCommentDraftContent('')
      setCommentDraftPosition(null)
      setCommentDraftAreaRect(null)
    }

    setIsSelectingCommentPosition(false)
    setIsNoteEditorOpen(false)
  }

  const handleSaveComment = async () => {
    if (!id || !isDesktopApp || !commentDraftContent.trim() || !commentDraftPosition) return

    setIsSavingComment(true)
    try {
      if (selectedComment) {
        await repo.updateNote(selectedComment.id, {
          pageNumber: page,
          title: selectedComment.title || buildDocumentCommentTitle(selectedComment.commentNumber ?? nextCommentNumber),
          content: commentDraftContent.trim(),
          locationHint: commentDraftAreaRect ? serializeAreaNoteAnchor(commentDraftAreaRect) : '',
          positionX: commentDraftPosition.x,
          positionY: commentDraftPosition.y,
        })
      } else {
        const created = await repo.createNote({
          documentId: id,
          pageNumber: page,
          title: buildDocumentCommentTitle(nextCommentNumber),
          content: commentDraftContent.trim(),
          locationHint: commentDraftAreaRect ? serializeAreaNoteAnchor(commentDraftAreaRect) : undefined,
          positionX: commentDraftPosition.x,
          positionY: commentDraftPosition.y,
        })
        setSelectedCommentId(created.id)
      }

      await loadNotes()
      setIsNoteEditorOpen(false)
    } finally {
      setIsSavingComment(false)
      setIsSelectingCommentPosition(false)
      notePlacementStartRef.current = null
    }
  }

  const handleDeleteComment = async () => {
    if (!selectedComment || !isDesktopApp) return

    await repo.deleteNote(selectedComment.id)
    await loadNotes()
    setIsDeleteCommentDialogOpen(false)
    setSelectedCommentId(null)
    setCommentDraftContent('')
    setCommentDraftPosition(null)
    setCommentDraftAreaRect(null)
    setIsSelectingCommentPosition(false)
    setIsNoteEditorOpen(false)
  }

  if (!document) {
    return <div className="p-6">Document not found.</div>
  }

  const fallbackBackHref = returnTo === 'search' ? '/search' : '/libraries'
  const backLabel = isDetachedReaderWindow ? 'Close window' : returnTo === 'search' ? 'Back to Search' : 'Back'

  return (
    <>
      <ResizablePanelGroup direction="horizontal" className="h-full">
      <ResizablePanel defaultSize={74} minSize={45}>
        <div className="flex h-full flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <Button
            variant="ghost"
            size="sm"
            aria-label={backLabel}
            onClick={() => {
              if (isDetachedReaderWindow) {
                if (isTauri()) {
                  void getCurrentWindow().close()
                  return
                }
                window.close()
                return
              }

              if (typeof window !== 'undefined' && window.history.length > 1) {
                router.back()
                return
              }
              router.push(fallbackBackHref)
            }}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {backLabel}
          </Button>
          <ReaderToolbarIconButton
            label="Previous page"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </ReaderToolbarIconButton>
          <div className="relative min-w-[5.5rem]">
            <Input
              value={page}
              onChange={(event) => setPage(Math.max(1, Number(event.target.value) || 1))}
              aria-label="Current page"
              className="h-8 w-24 border-border/70 bg-background pr-8 text-center shadow-none"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              / {pdfDocument?.numPages ?? document.pageCount ?? '—'}
            </span>
          </div>
          <ReaderToolbarIconButton
            label="Next page"
            onClick={() => setPage((current) => current + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </ReaderToolbarIconButton>
          <div className="mx-1 h-5 w-px bg-border/80" aria-hidden="true" />
          <ReaderToolbarIconButton
            label="Zoom out"
            onClick={() => setZoom((current) => Math.max(50, current - 10))}
          >
            <ZoomOut className="h-4 w-4" />
          </ReaderToolbarIconButton>
          <span className="min-w-[3rem] text-center text-sm text-muted-foreground">{zoom}%</span>
          <ReaderToolbarIconButton
            label="Zoom in"
            onClick={() => setZoom((current) => Math.min(250, current + 10))}
          >
            <ZoomIn className="h-4 w-4" />
          </ReaderToolbarIconButton>
          <ReaderToolbarIconButton
            label={isHighlightMode ? 'Exit highlight mode' : 'Highlight mode'}
            onClick={() => {
              setIsTextSelectionMode(false)
              setIsSelectingCommentPosition(false)
              setIsNoteEditorOpen(false)
              setIsHighlightMode((current) => !current)
              setDraftHighlightRect(null)
              highlightDragStartRef.current = null
            }}
            disabled={!canUsePreciseViewer}
            aria-pressed={isHighlightMode}
            className={cn(isHighlightMode && 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary')}
          >
            <Highlighter className="h-4 w-4" />
          </ReaderToolbarIconButton>
          <ReaderToolbarIconButton
            label={isTextSelectionLayerVisible ? 'Exit text selection' : 'Select text'}
            onClick={() => {
              setIsHighlightMode(false)
              setDraftHighlightRect(null)
              highlightDragStartRef.current = null
              setIsSelectingCommentPosition(false)
              if (isTextSelectionLayerVisible) {
                window.getSelection?.()?.removeAllRanges()
                skipNextTransientTextDismissRef.current = false
                setIsTextSelectionGestureActive(false)
                setIsTextSelectionMode(false)
              } else {
                setIsTextSelectionMode(true)
              }
            }}
            disabled={!canUsePreciseViewer}
            aria-pressed={isTextSelectionLayerVisible}
            className={cn(isTextSelectionLayerVisible && 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary')}
          >
            <Type className="h-4 w-4" />
          </ReaderToolbarIconButton>
          <div className="ml-2 flex min-w-[280px] flex-1 items-center gap-2 rounded-lg border border-border/80 bg-background px-2 py-1">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              aria-label="Search inside this document"
                placeholder="Search document"
                className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
              />
            <ReaderToolbarIconButton
              label="Previous match"
              onClick={() => rotateOccurrence('prev')}
              disabled={searchOccurrences.length === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </ReaderToolbarIconButton>
            <ReaderToolbarIconButton
              label="Next match"
              onClick={() => rotateOccurrence('next')}
              disabled={searchOccurrences.length === 0}
            >
              <ChevronRight className="h-4 w-4" />
            </ReaderToolbarIconButton>
            <span className="min-w-[3.5rem] text-right text-xs text-muted-foreground">
              {searchOccurrences.length === 0 ? '0 results' : `${activeOccurrenceIndex + 1}/${searchOccurrences.length}`}
            </span>
          </div>
          {document.filePath && (
            <ReaderToolbarIconButton
              label="Print document"
              onClick={() => void handlePrintDocument()}
              disabled={!isDesktopApp || !document.filePath || isPrinting}
            >
              {isPrinting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            </ReaderToolbarIconButton>
          )}
          {document.filePath && (
              <ReaderToolbarIconButton
               label="Open in window"
                onClick={() => void detachReaderWindow()}
                disabled={!isDesktopApp || !document.filePath}
              >
              <SquareArrowOutUpRight className="h-4 w-4" />
            </ReaderToolbarIconButton>
          )}
          {document.filePath && (
            <Button
              variant="outline"
              size="sm"
              className="border-border/80"
              onClick={() => void runOcrForDocument()}
              disabled={!isDesktopApp || !document.filePath || isRunningOcr || document.ocrStatus === 'processing'}
              aria-label={
                isRunningOcr || document.ocrStatus === 'processing'
                  ? 'Running OCR'
                  : document.hasOcrText
                    ? 'Re-run OCR'
                    : 'Run OCR'
              }
            >
              <Loader2 className={`mr-2 h-4 w-4 ${isRunningOcr || document.ocrStatus === 'processing' ? 'animate-spin' : 'hidden'}`} />
              {isRunningOcr || document.ocrStatus === 'processing'
                ? 'Running OCR...'
                : document.hasOcrText
                  ? 'Re-run OCR'
                  : 'Run OCR'}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="border-border/80"
            onClick={() => router.push(`/documents?id=${document.id}`)}
          >
            <FilePenLine className="mr-2 h-4 w-4" />
            Edit Details
          </Button>
        </div>
        <div ref={readerViewportRef} className="flex-1 overflow-auto bg-muted/30 p-4">
          {searchQuery.trim() && currentPageOccurrences.length > 0 && !hasExactHighlightOverlay && viewerMode === 'pdfjs' && (
                <div className="mx-auto mb-3 max-w-5xl rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                 Showing page-level matches for this page.
                </div>
              )}
              {isHighlightMode && canUsePreciseViewer && (
                <div className="mx-auto mb-3 max-w-5xl rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-foreground">
                 Drag a box on the page to create one highlight. Right-click an existing highlight to remove it.
                </div>
              )}
              {isSelectingCommentPosition && canUsePreciseViewer && (
                <div className="mx-auto mb-3 max-w-5xl rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-foreground">
                 Select where {selectedComment ? buildDocumentCommentTitle(selectedComment.commentNumber ?? nextCommentNumber) : buildDocumentCommentTitle(nextCommentNumber)} belongs on the page.
                </div>
              )}
            {canUsePreciseViewer ? (
              <div className="flex min-h-full items-start justify-center">
              <div
                className={cn(
                  'relative overflow-hidden rounded border bg-white shadow-sm',
                  (isSelectingCommentPosition || isHighlightMode) && 'cursor-crosshair ring-2 ring-primary/25',
                )}
                onClick={isSelectingCommentPosition ? handlePageCommentSelection : undefined}
                onClickCapture={() => {
                  if (!isHighlightMode && !isSelectingCommentPosition) {
                    handleTransientTextSelectionDismiss()
                  }
                }}
                onPointerDownCapture={handleTextSelectionGestureStart}
                onPointerUpCapture={handleTextSelectionGestureEnd}
                onPointerCancel={handleTextSelectionGestureEnd}
                style={{
                  width: renderedPageSize.width > 0 ? `${renderedPageSize.width * zoomPreviewScale}px` : undefined,
                  height: renderedPageSize.height > 0 ? `${renderedPageSize.height * zoomPreviewScale}px` : undefined,
                }}
              >
                <div
                  className="relative origin-top-left"
                  style={{
                    width: renderedPageSize.width > 0 ? `${renderedPageSize.width}px` : undefined,
                    height: renderedPageSize.height > 0 ? `${renderedPageSize.height}px` : undefined,
                    transform: `scale(${zoomPreviewScale})`,
                  }}
                >
                <canvas ref={canvasRef} className="block bg-white" />
                {renderedPageSize.width > 0 && (
                  <div className="absolute inset-0">
                    {isTextSelectionLayerVisible ? (
                    <div className="absolute inset-0 z-30 overflow-hidden select-text cursor-text">
                      {pageWords.map((word, wordIndex) => (
                        <span
                          key={`${wordIndex}-${word.left}-${word.top}`}
                          className="absolute cursor-text select-text whitespace-pre"
                          style={{
                            left: `${word.left * (renderZoom / 100)}px`,
                            top: `${word.top * (renderZoom / 100)}px`,
                            width: `${Math.max(6, word.width * (renderZoom / 100))}px`,
                            height: `${Math.max(10, word.height * (renderZoom / 100))}px`,
                            fontSize: `${Math.max(10, word.height * (renderZoom / 100) * 0.85)}px`,
                            lineHeight: `${Math.max(10, word.height * (renderZoom / 100))}px`,
                            color: 'rgba(0, 0, 0, 0.01)',
                            userSelect: 'text',
                            WebkitUserSelect: 'text',
                          }}
                        >
                          {word.text}
                        </span>
                      ))}
                    </div>
                    ) : null}
                    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
                      {notePointComments.map((comment) => {
                        const isActive = comment.id === selectedCommentId
                        return (
                          <button
                            key={comment.id}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              handleSelectComment(comment.id, { scrollIntoView: true })
                            }}
                            className={cn(
                              'pointer-events-auto absolute flex h-8 w-8 -translate-x-1/2 -translate-y-full items-center justify-center rounded-full border border-white text-xs font-semibold text-white shadow-lg transition hover:scale-105',
                              isActive ? 'z-20 bg-primary ring-2 ring-primary/30' : 'bg-amber-500 hover:bg-amber-600',
                            )}
                            style={{
                              left: `${(comment.positionX ?? 0) * renderedPageSize.width}px`,
                              top: `${(comment.positionY ?? 0) * renderedPageSize.height}px`,
                            }}
                            aria-label={`Select ${buildDocumentCommentTitle(comment.commentNumber ?? nextCommentNumber)}`}
                            title={buildDocumentCommentTitle(comment.commentNumber ?? nextCommentNumber)}
                          >
                            {comment.commentNumber}
                            <span
                              className={cn(
                                'absolute left-1/2 top-full h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border-r border-b border-white',
                                isActive ? 'bg-primary' : 'bg-amber-500',
                              )}
                              aria-hidden="true"
                            />
                          </button>
                        )
                      })}
                    </div>
                    <div className="pointer-events-none absolute inset-0 z-10 overflow-visible">
                      {noteAreaComments.map((comment) => {
                        const isActive = comment.id === selectedCommentId
                        if (!comment.areaRect) return null

                        return (
                          <button
                            key={comment.id}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              handleSelectComment(comment.id, { scrollIntoView: true })
                            }}
                            className={cn(
                              'pointer-events-auto absolute rounded-sm bg-yellow-200/35 transition hover:bg-yellow-200/45',
                              isActive && 'bg-yellow-200/45 ring-2 ring-yellow-400/55',
                            )}
                            style={{
                              left: `${comment.areaRect.x * renderedPageSize.width}px`,
                              top: `${comment.areaRect.y * renderedPageSize.height}px`,
                              width: `${comment.areaRect.width * renderedPageSize.width}px`,
                              height: `${comment.areaRect.height * renderedPageSize.height}px`,
                            }}
                            aria-label={`Select ${buildDocumentCommentTitle(comment.commentNumber ?? nextCommentNumber)}`}
                            title={buildDocumentCommentTitle(comment.commentNumber ?? nextCommentNumber)}
                          >
                            <span
                              className={cn(
                                'absolute left-0 top-0 flex h-6 min-w-6 -translate-x-[calc(100%+0.375rem)] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold text-white shadow-sm',
                                isActive ? 'bg-primary' : 'bg-amber-500',
                              )}
                            >
                              {comment.commentNumber}
                            </span>
                          </button>
                        )
                      })}
                      {draftNotePreview?.areaRect && !isSelectingCommentPosition ? (
                        <div
                          className="pointer-events-none absolute rounded-sm bg-yellow-200/60 ring-2 ring-dashed ring-amber-400/70"
                          style={{
                            left: `${draftNotePreview.areaRect.x * renderedPageSize.width}px`,
                            top: `${draftNotePreview.areaRect.y * renderedPageSize.height}px`,
                            width: `${draftNotePreview.areaRect.width * renderedPageSize.width}px`,
                            height: `${draftNotePreview.areaRect.height * renderedPageSize.height}px`,
                          }}
                        >
                          <span className="absolute left-0 top-0 flex h-6 min-w-6 -translate-x-[calc(100%+0.375rem)] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold text-white shadow-sm">
                            {draftNotePreview.commentNumber}
                          </span>
                        </div>
                      ) : null}
                    </div>
                    {
                      <div className="pointer-events-none absolute inset-0">
                        {currentPageHighlights.flatMap((occurrence) =>
                          (occurrence.rects ?? []).map((rect, rectIndex) => {
                            const isActive = occurrence.index === activeOccurrenceIndex
                            return (
                              <div
                                key={`${occurrence.index}-${rectIndex}`}
                                className={`absolute rounded-sm ${
                                  isActive ? 'bg-amber-400/45 ring-1 ring-amber-500/70' : 'bg-sky-300/30'
                                }`}
                                style={{
                                  left: `${rect.left * (zoom / 100)}px`,
                                  top: `${rect.top * (zoom / 100)}px`,
                                  width: `${rect.width * (zoom / 100)}px`,
                                  height: `${Math.max(10, rect.height * (zoom / 100))}px`,
                                }}
                              />
                            )
                          }),
                        )}
                      </div>
                    }
                    {draftNotePreview?.position && !draftNotePreview.areaRect && !isSelectingCommentPosition ? (
                      <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
                        <div
                          className="absolute flex h-8 w-8 -translate-x-1/2 -translate-y-full items-center justify-center rounded-full border border-white bg-amber-500 text-xs font-semibold text-white shadow-lg opacity-85"
                          style={{
                            left: `${draftNotePreview.position.x * renderedPageSize.width}px`,
                            top: `${draftNotePreview.position.y * renderedPageSize.height}px`,
                          }}
                        >
                          {draftNotePreview.commentNumber}
                          <span
                            className="absolute left-1/2 top-full h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border-r border-b border-white bg-amber-500"
                            aria-hidden="true"
                          />
                        </div>
                      </div>
                    ) : null}
                    <div
                      className={cn(
                        'absolute inset-0 z-20',
                        isSelectingCommentPosition ? 'pointer-events-auto' : 'pointer-events-none',
                      )}
                      onPointerDown={handleNotePlacementPointerDown}
                      onPointerMove={handleNotePlacementPointerMove}
                      onPointerUp={handleNotePlacementPointerEnd}
                      onPointerCancel={() => {
                        notePlacementStartRef.current = null
                        setCommentDraftAreaRect(null)
                      }}
                    >
                      {isSelectingCommentPosition && commentDraftAreaRect ? (
                        <div
                          className="pointer-events-none absolute rounded-sm bg-yellow-200/35"
                          style={{
                            left: `${commentDraftAreaRect.x * renderedPageSize.width}px`,
                            top: `${commentDraftAreaRect.y * renderedPageSize.height}px`,
                            width: `${commentDraftAreaRect.width * renderedPageSize.width}px`,
                            height: `${commentDraftAreaRect.height * renderedPageSize.height}px`,
                          }}
                        >
                          <span className="absolute left-0 top-0 flex h-6 min-w-6 -translate-x-[calc(100%+0.375rem)] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold text-white shadow-sm">
                            {selectedComment?.commentNumber ?? nextCommentNumber}
                          </span>
                        </div>
                      ) : null}
                    </div>
                    <div
                      className={cn(
                        'absolute inset-0 z-20',
                        isHighlightMode ? 'pointer-events-auto' : 'pointer-events-none',
                      )}
                      onPointerDown={handleHighlightPointerDown}
                      onPointerMove={handleHighlightPointerMove}
                      onPointerUp={(event) => {
                        void handleHighlightPointerEnd(event)
                      }}
                      onPointerCancel={() => {
                        highlightDragStartRef.current = null
                        setDraftHighlightRect(null)
                      }}
                    >
                      {currentPageAreaHighlights.map((highlight) => (
                        <button
                          key={highlight.id}
                          type="button"
                          className="pointer-events-auto absolute rounded-sm bg-yellow-200/32 transition hover:bg-yellow-200/42"
                          style={{
                            left: `${highlight.rect.x * renderedPageSize.width}px`,
                            top: `${highlight.rect.y * renderedPageSize.height}px`,
                            width: `${highlight.rect.width * renderedPageSize.width}px`,
                            height: `${highlight.rect.height * renderedPageSize.height}px`,
                          }}
                          onContextMenu={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            void handleDeleteAreaHighlight(highlight.id)
                          }}
                          title="Right-click to remove highlight"
                        />
                      ))}
                      {draftHighlightRect ? (
                        <div
                          className="pointer-events-none absolute rounded-sm bg-yellow-200/36"
                          style={{
                            left: `${draftHighlightRect.x * renderedPageSize.width}px`,
                            top: `${draftHighlightRect.y * renderedPageSize.height}px`,
                            width: `${draftHighlightRect.width * renderedPageSize.width}px`,
                            height: `${draftHighlightRect.height * renderedPageSize.height}px`,
                          }}
                        />
                      ) : null}
                    </div>
                  </div>
                )}
                {(isPdfLoading || isPageRendering) && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/35 backdrop-blur-[1px]">
                    <div className="flex items-center gap-2 rounded-full border bg-background/95 px-3 py-2 text-sm shadow-sm">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      {isPdfLoading ? 'Loading PDF...' : `Rendering page ${page}...`}
                    </div>
                  </div>
                )}
                </div>
              </div>
            </div>
            ) : showViewerLoading ? (
              <div className="flex min-h-[calc(100vh-13rem)] items-center justify-center">
                <div className="flex items-center gap-2 rounded-full border bg-background/95 px-3 py-2 text-sm shadow-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Opening PDF...
                </div>
              </div>
            ) : embeddedPdfUrl ? (
              <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-3">
                {viewerError ? (
                  <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    {viewerError}
                  </div>
                ) : null}
                <div className="overflow-hidden rounded border bg-white shadow-sm">
                  <object
                    key={`${embeddedPdfUrl}-${page}-${zoom}`}
                    data={`${embeddedPdfUrl}#page=${page}&zoom=${zoom}`}
                    type="application/pdf"
                    aria-label={document?.title ?? 'PDF preview'}
                    className="h-[calc(100vh-13rem)] w-full bg-white"
                  >
                    <div className="flex h-[calc(100vh-13rem)] items-center justify-center p-6 text-sm text-muted-foreground">
                      PDF preview unavailable. Open the file externally from the toolbar if needed.
                    </div>
                  </object>
                </div>
              </div>
            ) : (
              <div className="space-y-2 p-6">
               <p>{hasViewerTimedOut ? 'PDF unavailable.' : viewerError ?? 'PDF unavailable.'}</p>
                {isDesktopApp && document.id && (
                  <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => void importPdfForDocument()}>
                    Import PDF...
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void runOcrForDocument()}
                    disabled={!document.filePath || isRunningOcr || document.ocrStatus === 'processing'}
                  >
                    {isRunningOcr || document.ocrStatus === 'processing' ? 'Running OCR...' : 'Run OCR'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={26} minSize={18} maxSize={45}>
        <div className="flex h-full flex-col border-l">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Search className="h-4 w-4" />
             Search
            </div>
          <div className="space-y-2">
            <Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Keyword or phrase" />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{searchOccurrences.length} occurrence{searchOccurrences.length === 1 ? '' : 's'}</span>
              {searchOccurrences.length > 0 && <span>Selected {activeOccurrenceIndex + 1}</span>}
            </div>
            {searchOccurrences.length > 0 ? (
              <div className="max-h-72 space-y-2 overflow-auto pr-1">
                {searchOccurrences.map((occurrence, index) => (
                  <button
                    key={`${occurrence.start}-${index}`}
                    ref={(element) => {
                      occurrenceRefs.current[index] = element
                    }}
                    type="button"
                    onClick={() => {
                      selectOccurrence(index, { jumpToPage: true })
                    }}
                    className={`w-full rounded-md border p-2 text-left text-sm transition ${
                      index === activeOccurrenceIndex ? 'border-primary bg-primary/8' : 'border-border bg-muted/40 hover:bg-muted/70'
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Occurrence {index + 1}</span>
                      <span>{occurrence.rects?.length ? 'Page' : 'Approx page'} {occurrence.estimatedPage}</span>
                    </div>
                    {occurrence.rects?.length ? (
                      <Badge variant="outline" className="mb-2">
                        Exact region highlight
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="mb-2">
                        Page-level fallback
                      </Badge>
                    )}
                    <div className="leading-6">{highlightText(occurrence.snippet, searchQuery)}</div>
                  </button>
                ))}
              </div>
            ) : searchQuery.trim() ? (
              <div className="rounded-md bg-muted/50 p-2 text-sm text-muted-foreground">
                No matches found for this keyword.
              </div>
            ) : (
              <div className="rounded-md bg-muted/50 p-2 text-sm text-muted-foreground">
                {extractSearchPreview(document, document.title, 80)}
              </div>
            )}
          </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <StickyNote className="h-4 w-4" />
                 Notes
                </div>
              {isSelectingCommentPosition ? (
                <Button variant="outline" size="sm" onClick={handleCancelCommentEditor}>
                  Cancel
                </Button>
              ) : !isNoteEditorOpen ? (
                <Button size="sm" onClick={handleStartNewComment} disabled={!canUsePreciseViewer}>
                  New Note
                </Button>
              ) : null
              }
            </div>

              {isSelectingCommentPosition ? (
                <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 text-sm text-foreground">
                 Select where {selectedComment ? buildDocumentCommentTitle(selectedComment.commentNumber ?? nextCommentNumber) : buildDocumentCommentTitle(nextCommentNumber)} belongs on the page.
                </div>
              ) : null}

            {isNoteEditorOpen ? (
              <div className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">
                        {selectedComment
                          ? buildDocumentCommentTitle(selectedComment.commentNumber ?? nextCommentNumber)
                          : buildDocumentCommentTitle(nextCommentNumber)}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsSelectingCommentPosition(true)}
                    disabled={!canUsePreciseViewer}
                  >
                    <MapPin className="mr-2 h-4 w-4" />
                    {commentDraftPosition ? 'Move Balloon' : 'Choose Position'}
                  </Button>
                </div>
                <Textarea
                  ref={noteEditorTextareaRef}
                  value={commentDraftContent}
                  onChange={(event) => setCommentDraftContent(event.target.value)}
                  placeholder="Write your note"
                  className="mt-3 min-h-32"
                />
                <div className="mt-3 flex items-center justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={handleCancelCommentEditor}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void handleSaveComment()}
                    disabled={!isDesktopApp || !commentDraftContent.trim() || !commentDraftPosition || isSavingComment}
                  >
                    {isSavingComment
                      ? 'Saving...'
                      : selectedComment
                        ? 'Save Note'
                        : 'Create Note'}
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{currentPageComments.length} note{currentPageComments.length === 1 ? '' : 's'} on this page</span>
              </div>
              {currentPageComments.length > 0 ? (
                <div className="space-y-2">
                  {currentPageComments.map((comment) => {
                    const isActive = comment.id === selectedCommentId
                    const hasMarker = typeof comment.positionX === 'number' && typeof comment.positionY === 'number'

                    return (
                      <div
                        key={comment.id}
                        ref={(element) => {
                          commentCardRefs.current[comment.id] = element
                        }}
                        className={cn(
                          'rounded-md border p-3 transition',
                          isActive ? 'border-primary bg-primary/5' : 'border-border bg-muted/30',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => handleSelectComment(comment.id)}
                          className="w-full text-left"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Badge variant={isActive ? 'default' : 'secondary'}>
                                {buildDocumentCommentTitle(comment.commentNumber ?? nextCommentNumber)}
                              </Badge>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {new Date(comment.updatedAt).toLocaleString()}
                            </span>
                          </div>
                          <div className="mt-2 text-sm leading-6 text-foreground">
                            {comment.content || 'No note text yet.'}
                          </div>
                        </button>
                        {isActive ? (
                          <div className="mt-3 flex items-center justify-end gap-2 border-t pt-3">
                            <Button variant="outline" size="sm" onClick={handleOpenCommentEditor}>
                              Edit
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => setIsDeleteCommentDialogOpen(true)}
                              disabled={!isDesktopApp || isSavingComment}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                  No notes on this page yet.
                </div>
              )}
            </div>
          </div>
        </div>
        </div>
      </ResizablePanel>
      </ResizablePanelGroup>
      <AlertDialog open={isDeleteCommentDialogOpen} onOpenChange={setIsDeleteCommentDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete note?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedComment
                ? `This will permanently remove ${buildDocumentCommentTitle(selectedComment.commentNumber ?? nextCommentNumber)} from this document.`
                : 'This will permanently remove this note from the document.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => void handleDeleteComment()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
