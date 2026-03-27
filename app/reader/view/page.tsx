'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Highlighter, Loader2, MapPin, MessageSquare, Search, SquareArrowOutUpRight, Trash2, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import * as repo from '@/lib/repositories/local-db'
import { appDataDir, convertFileSrc, copyFile, getCurrentWindow, isTauri, join, mkdir, open, readFile } from '@/lib/tauri/client'
import { useAppStore } from '@/lib/store'
import { buildDocumentCommentTitle, getDocumentPageComments, getNextDocumentCommentNumber } from '@/lib/services/document-comment-service'
import { extractPdfPageWords, extractSearchPreview, findPdfSearchOccurrences, type PdfWord, type SearchOccurrence } from '@/lib/services/document-processing'
import { findDocumentPageHits } from '@/lib/services/document-search-service'
import { DETACHED_READER_QUERY_VALUE, openDetachedReaderWindow } from '@/lib/services/reader-window-service'
import { cn } from '@/lib/utils'

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
          className={cn('h-8 w-8 text-muted-foreground hover:text-foreground', className)}
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
  const { documents, notes, scanDocumentsOcr, setActiveDocument, updateDocument, loadNotes, refreshData, isDesktopApp } = useAppStore()
  const document = useMemo(() => documents.find((entry) => entry.id === id) ?? null, [documents, id])
  const [page, setPage] = useState(Number.isFinite(pageFromRoute) && pageFromRoute > 0 ? pageFromRoute : 1)
  const [zoom, setZoom] = useState(normalizeZoomLevel(zoomFromRoute))
  const [commentDraftContent, setCommentDraftContent] = useState('')
  const [commentDraftPosition, setCommentDraftPosition] = useState<{ x: number; y: number } | null>(null)
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null)
  const [isSelectingCommentPosition, setIsSelectingCommentPosition] = useState(false)
  const [isSavingComment, setIsSavingComment] = useState(false)
  const [viewerError, setViewerError] = useState<string | null>(null)
  const [isPdfLoading, setIsPdfLoading] = useState(false)
  const [isPageRendering, setIsPageRendering] = useState(false)
  const [isRunningOcr, setIsRunningOcr] = useState(false)
  const [showHighlights, setShowHighlights] = useState(true)
  const [pdfDocument, setPdfDocument] = useState<{ numPages: number; getPage: (pageNumber: number) => Promise<unknown>; destroy?: () => Promise<void> } | null>(null)
  const [renderedPageSize, setRenderedPageSize] = useState({ width: 0, height: 0 })
  const [pageWords, setPageWords] = useState<PdfWord[]>([])
  const [searchQuery, setSearchQuery] = useState(queryFromRoute)
  const [activeOccurrenceIndex, setActiveOccurrenceIndex] = useState(0)
  const [searchOccurrences, setSearchOccurrences] = useState<SearchOccurrence[]>([])
  const occurrenceRefs = useRef<Array<HTMLButtonElement | null>>([])
  const commentCardRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const shouldAutoScrollOccurrenceRef = useRef(false)
  const shouldAutoScrollCommentRef = useRef(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const readerViewportRef = useRef<HTMLDivElement | null>(null)
  const pageScrollLockRef = useRef(false)
  const initializedDocumentIdRef = useRef<string | null>(null)
  const routeSelectionKeyRef = useRef<string | null>(null)

  const loadPdfJs = async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).toString()
    }
    return pdfjs
  }

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

    const loadPdf = async () => {
      if (!document?.filePath || !isTauri()) {
        setPdfDocument(null)
        setRenderedPageSize({ width: 0, height: 0 })
        setPageWords([])
        return
      }

      setIsPdfLoading(true)

      try {
        const pdfjs = await loadPdfJs()
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

        setPdfDocument(nextPdf)
        setViewerError(null)
        setPage((current) => Math.min(Math.max(1, current), nextPdf.numPages))
      } catch (error) {
        console.error('Failed to load PDF for embedded viewer:', error)
        setPdfDocument(null)
        setRenderedPageSize({ width: 0, height: 0 })
        setPageWords([])
        setViewerError('Embedded PDF preview is unavailable. Open this document in your system PDF app.')
      } finally {
        if (!cancelled) {
          setIsPdfLoading(false)
        }
      }
    }

    void loadPdf()

    return () => {
      cancelled = true
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

  const fileUrl = useMemo(() => {
    if (isTauri() && document?.filePath) return convertFileSrc(document.filePath)
    return ''
  }, [document?.filePath])

  useEffect(() => {
    let cancelled = false

    const loadOccurrences = async () => {
      if (!document || !searchQuery.trim()) {
        setSearchOccurrences([])
        return
      }

      if (document.filePath && isTauri()) {
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
  }, [document, searchQuery])

  useEffect(() => {
    let cancelled = false

    const loadPageWords = async () => {
      if (!document?.filePath || !isTauri()) {
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
  }, [document?.filePath, page])

  const activeOccurrence = searchOccurrences[activeOccurrenceIndex] ?? null
  const currentPageOccurrences = useMemo(
    () => searchOccurrences.filter((occurrence) => occurrence.estimatedPage === page),
    [page, searchOccurrences],
  )
  const currentPageHighlights = useMemo(
    () => currentPageOccurrences.filter((occurrence) => occurrence.rects?.length),
    [currentPageOccurrences],
  )
  const hasExactHighlightOverlay = currentPageHighlights.length > 0
  const currentPageComments = useMemo(
    () => (id ? getDocumentPageComments(notes, id, page) : []),
    [id, notes, page],
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

  useEffect(() => {
    if (selectedCommentId && !currentPageComments.some((comment) => comment.id === selectedCommentId)) {
      setSelectedCommentId(null)
    }
  }, [currentPageComments, selectedCommentId])

  useEffect(() => {
    if (selectedComment) {
      setCommentDraftContent(selectedComment.content)
      setCommentDraftPosition(
        typeof selectedComment.positionX === 'number' && typeof selectedComment.positionY === 'number'
          ? { x: selectedComment.positionX, y: selectedComment.positionY }
          : null,
      )
    } else {
      setCommentDraftContent('')
      setCommentDraftPosition(null)
    }
    setIsSelectingCommentPosition(false)
  }, [page, selectedComment?.content, selectedComment?.id, selectedComment?.positionX, selectedComment?.positionY])

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
    const viewport = readerViewportRef.current
    if (!viewport) return

    const releaseLock = () => {
      window.setTimeout(() => {
        pageScrollLockRef.current = false
      }, 160)
    }

    const handleWheel = (event: WheelEvent) => {
      if (pageScrollLockRef.current || !pdfDocument) return

      const { scrollTop, clientHeight, scrollHeight } = viewport
      const nearTop = scrollTop <= 4
      const nearBottom = scrollTop + clientHeight >= scrollHeight - 4

      if (event.deltaY > 0 && nearBottom && page < pdfDocument.numPages) {
        event.preventDefault()
        pageScrollLockRef.current = true
        setPage((current) => Math.min(pdfDocument.numPages, current + 1))
        viewport.scrollTop = 0
        releaseLock()
      } else if (event.deltaY < 0 && nearTop && page > 1) {
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
  }, [page, pdfDocument])

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

        const scale = zoom / 100
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
  }, [page, pdfDocument, zoom])

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

  const handlePageCommentSelection = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isSelectingCommentPosition || renderedPageSize.width <= 0 || renderedPageSize.height <= 0) return

    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return

    const x = clamp01((event.clientX - bounds.left) / bounds.width)
    const y = clamp01((event.clientY - bounds.top) / bounds.height)

    setCommentDraftPosition({ x, y })
    setIsSelectingCommentPosition(false)
  }

  const handleSelectComment = (commentId: string, options?: { scrollIntoView?: boolean }) => {
    if (options?.scrollIntoView) {
      shouldAutoScrollCommentRef.current = true
    }
    setSelectedCommentId(commentId)
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
          positionX: commentDraftPosition.x,
          positionY: commentDraftPosition.y,
        })
      } else {
        const created = await repo.createNote({
          documentId: id,
          pageNumber: page,
          title: buildDocumentCommentTitle(nextCommentNumber),
          content: commentDraftContent.trim(),
          positionX: commentDraftPosition.x,
          positionY: commentDraftPosition.y,
        })
        setSelectedCommentId(created.id)
      }

      await loadNotes()
    } finally {
      setIsSavingComment(false)
      setIsSelectingCommentPosition(false)
    }
  }

  const handleDeleteComment = async () => {
    if (!selectedComment || !isDesktopApp) return
    const confirmed = window.confirm(`Delete ${buildDocumentCommentTitle(selectedComment.commentNumber ?? nextCommentNumber)}?`)
    if (!confirmed) return

    await repo.deleteNote(selectedComment.id)
    await loadNotes()
    setSelectedCommentId(null)
    setCommentDraftContent('')
    setCommentDraftPosition(null)
    setIsSelectingCommentPosition(false)
  }

  if (!document) {
    return <div className="p-6">Document not found.</div>
  }

  const fallbackBackHref = returnTo === 'search' ? '/search' : '/libraries'
  const backLabel = isDetachedReaderWindow ? 'Close window' : returnTo === 'search' ? 'Back to Search' : 'Back'

  return (
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
            label={showHighlights ? 'Hide highlights' : 'Show highlights'}
            onClick={() => setShowHighlights((current) => !current)}
            disabled={!searchQuery.trim() || searchOccurrences.length === 0}
            aria-pressed={showHighlights}
            className={cn(showHighlights && 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary')}
          >
            <Highlighter className="h-4 w-4" />
          </ReaderToolbarIconButton>
          <div className="ml-2 flex min-w-[280px] flex-1 items-center gap-2 rounded-lg border border-border/80 bg-background px-2 py-1">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              aria-label="Search inside this document"
              placeholder="Search inside this document"
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
          {fileUrl && (
            <ReaderToolbarIconButton
              label="Detach into new window"
              onClick={() => void detachReaderWindow()}
              disabled={!isDesktopApp || !document.filePath}
            >
              <SquareArrowOutUpRight className="h-4 w-4" />
            </ReaderToolbarIconButton>
          )}
          {fileUrl && (
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
          {fileUrl && (
            <div className="ml-auto">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button asChild variant="ghost" size="icon" aria-label="Open external viewer" title="Open external viewer" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                    <a href={fileUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Open external viewer</TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
        <div ref={readerViewportRef} className="flex-1 overflow-auto bg-muted/30 p-4">
          {showHighlights && searchQuery.trim() && currentPageOccurrences.length > 0 && !hasExactHighlightOverlay && (
            <div className="mx-auto mb-3 max-w-5xl rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Page-level match navigation is active, but exact PDF highlight boxes are not available for this page yet.
            </div>
          )}
          {isSelectingCommentPosition && (
            <div className="mx-auto mb-3 max-w-5xl rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-foreground">
              Click on the page to place {selectedComment ? buildDocumentCommentTitle(selectedComment.commentNumber ?? nextCommentNumber) : buildDocumentCommentTitle(nextCommentNumber)}.
            </div>
          )}
          {pdfDocument ? (
            <div className="flex min-h-full items-start justify-center">
              <div
                className={cn(
                  'relative overflow-hidden rounded border bg-white shadow-sm',
                  isSelectingCommentPosition && 'cursor-crosshair ring-2 ring-primary/25',
                )}
                onClick={handlePageCommentSelection}
              >
                <canvas ref={canvasRef} className="block bg-white" />
                {renderedPageSize.width > 0 && (
                  <div className="absolute inset-0">
                    <div className="absolute inset-0 overflow-hidden">
                      {pageWords.map((word, wordIndex) => (
                        <span
                          key={`${wordIndex}-${word.left}-${word.top}`}
                          className="absolute select-text whitespace-pre text-transparent"
                          style={{
                            left: `${word.left * (zoom / 100)}px`,
                            top: `${word.top * (zoom / 100)}px`,
                            width: `${Math.max(6, word.width * (zoom / 100))}px`,
                            height: `${Math.max(10, word.height * (zoom / 100))}px`,
                            fontSize: `${Math.max(10, word.height * (zoom / 100) * 0.85)}px`,
                            lineHeight: `${Math.max(10, word.height * (zoom / 100))}px`,
                          }}
                        >
                          {word.text}
                        </span>
                      ))}
                    </div>
                    <div className="absolute inset-0 z-10 overflow-hidden">
                      {positionedPageComments.map((comment) => {
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
                              'absolute flex h-8 w-8 -translate-x-1/2 -translate-y-full items-center justify-center rounded-full border border-white text-xs font-semibold text-white shadow-lg transition hover:scale-105',
                              isActive ? 'z-20 bg-primary ring-2 ring-primary/30' : 'bg-amber-500 hover:bg-amber-600',
                            )}
                            style={{
                              left: `${(comment.positionX ?? 0) * renderedPageSize.width}px`,
                              top: `${(comment.positionY ?? 0) * renderedPageSize.height}px`,
                            }}
                            aria-label={`Open ${buildDocumentCommentTitle(comment.commentNumber ?? nextCommentNumber)}`}
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
                    {showHighlights && (
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
                    )}
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
          ) : (
            <div className="space-y-2 p-6">
              <p>{viewerError ?? 'PDF unavailable. Import a PDF in desktop mode.'}</p>
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
              {fileUrl && (
                <a className="text-sm text-primary underline" href={fileUrl} target="_blank" rel="noreferrer">
                  Open with system viewer
                </a>
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
            Document Search
          </div>
          <p className="text-xs text-muted-foreground">
            Phase 1 uses exact PDF word boxes when available. Otherwise it falls back to page-level hits from stored extracted text and cannot draw exact highlight rectangles.
          </p>
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
                <MessageSquare className="h-4 w-4" />
                Page comments
              </div>
              <div className="flex items-center gap-2">
                <ReaderToolbarIconButton
                  label={isSelectingCommentPosition ? 'Cancel position selection' : 'Choose comment position on page'}
                  onClick={() => setIsSelectingCommentPosition((current) => !current)}
                  disabled={!pdfDocument}
                  className={cn(isSelectingCommentPosition && 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary')}
                >
                  <MapPin className="h-4 w-4" />
                </ReaderToolbarIconButton>
                {selectedComment ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedCommentId(null)
                      setCommentDraftContent('')
                      setCommentDraftPosition(null)
                      setIsSelectingCommentPosition(false)
                    }}
                  >
                    New comment
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {selectedComment
                      ? buildDocumentCommentTitle(selectedComment.commentNumber ?? nextCommentNumber)
                      : buildDocumentCommentTitle(nextCommentNumber)}
                  </Badge>
                  {commentDraftPosition ? (
                    <span className="text-xs text-muted-foreground">
                      Positioned at {Math.round(commentDraftPosition.x * 100)}%, {Math.round(commentDraftPosition.y * 100)}%
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">No page position selected yet.</span>
                  )}
                </div>
                {selectedComment?.updatedAt ? (
                  <span className="text-xs text-muted-foreground">
                    Updated {new Date(selectedComment.updatedAt).toLocaleString()}
                  </span>
                ) : null}
              </div>
              <Textarea
                value={commentDraftContent}
                onChange={(event) => setCommentDraftContent(event.target.value)}
                placeholder="Add a page comment"
                className="mt-3 min-h-32"
              />
              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Click the location button, then click on the PDF page to place the comment marker.
                </p>
                <div className="flex items-center gap-2">
                  {selectedComment ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => void handleDeleteComment()}
                      disabled={!isDesktopApp || isSavingComment}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    onClick={() => void handleSaveComment()}
                    disabled={!isDesktopApp || !commentDraftContent.trim() || !commentDraftPosition || isSavingComment}
                  >
                    {isSavingComment
                      ? 'Saving...'
                      : selectedComment
                        ? 'Update comment'
                        : 'Save comment'}
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{currentPageComments.length} comment{currentPageComments.length === 1 ? '' : 's'} on this page</span>
                {currentPageComments.length > 0 ? <span>Click a balloon to focus its comment.</span> : null}
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
                              <span className="text-xs text-muted-foreground">
                                {hasMarker ? 'Marker placed on page' : 'No marker yet'}
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {new Date(comment.updatedAt).toLocaleString()}
                            </span>
                          </div>
                          <div className="mt-2 text-sm leading-6 text-foreground">
                            {comment.content || 'No comment text yet.'}
                          </div>
                        </button>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                  No comments on this page yet.
                </div>
              )}
            </div>
          </div>
        </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
