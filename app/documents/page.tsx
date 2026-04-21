'use client'

import Link from 'next/link'
import { type ComponentProps, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronsUpDown,
  FileText,
  Globe,
  Link2,
  Loader2,
  Minus,
  Plus,
  Save,
  Search,
  Smartphone,
  Sparkles,
  Star,
  Tag,
  Trash2,
  X,
  ImagePlus,
} from 'lucide-react'
import * as QRCode from 'qrcode'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { EmptyState, MetadataStatusBadge, StarRating, TagChip } from '@/components/refx/common'
import {
  buildDocumentMetadataSeed,
  createMetadataCandidateFromBibtex,
  findDocumentMetadataCandidates,
  loadOnlineMetadataEnrichmentSettings,
  type MetadataCandidateProvider,
  type DocumentMetadataCandidate,
} from '@/lib/services/document-enrichment-service'
import { detectAndStoreDocumentKeywords } from '@/lib/services/document-keyword-service'
import { scanDocumentForDoiReferences } from '@/lib/services/document-doi-reference-service'
import { hasUsableMetadataTitle } from '@/lib/services/document-metadata-service'
import { loadPdfJsModule } from '@/lib/services/document-processing'
import { convertFileSrc, isTauri, open as openFileDialog, readFile } from '@/lib/tauri/client'
import type { Document as RefxDocument, ReadingStage } from '@/lib/types'
import { cn } from '@/lib/utils'
import * as repo from '@/lib/repositories/local-db'
import { normalizeErrorMessage } from '@/lib/utils/error'
import { useT } from '@/lib/localization'
import { DEFAULT_APP_SETTINGS, loadAppSettings, type StoredAppSettings } from '@/lib/app-settings'
import { useDocumentActions, useDocumentStore } from '@/lib/stores/document-store'
import { useLibraryStore } from '@/lib/stores/library-store'
import { useRelationActions, useRelationStore } from '@/lib/stores/relation-store'
import { useRuntimeState } from '@/lib/stores/runtime-store'

const readingStages: Array<{ value: ReadingStage; label: string }> = [
  { value: 'unread', label: 'Unread' },
  { value: 'reading', label: 'Reading' },
  { value: 'finished', label: 'Finished' },
]

type RelationListItem = {
  relationId: string
  relatedDocumentId: string
}

type DocumentDoiReferenceItem = repo.DbDocumentDoiReference

type BookCoverPhoneSession = {
  token: string
  url: string
  urls: string[]
  qrDataUrl: string
}

type PreviewPdfDocument = {
  numPages: number
  getPage: (pageNumber: number) => Promise<{
    getViewport: (args: { scale: number }) => { width: number; height: number }
    render: (args: {
      canvasContext: CanvasRenderingContext2D
      viewport: { width: number; height: number }
      transform?: number[]
    }) => { promise: Promise<void>; cancel?: () => void }
    cleanup?: () => void
  }>
  destroy?: () => Promise<void>
}

function DocumentPdfPreview({ document }: { document: RefxDocument }) {
  const t = useT()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<{
    pointerId: number
    startScrollLeft: number
    startScrollTop: number
    startX: number
    startY: number
  } | null>(null)
  const [pdfDocument, setPdfDocument] = useState<PreviewPdfDocument | null>(null)
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(100)
  const [isLoading, setIsLoading] = useState(false)
  const [isRendering, setIsRendering] = useState(false)
  const [error, setError] = useState('')
  const [renderedPageSize, setRenderedPageSize] = useState({ width: 0, height: 0 })
  const [isPanning, setIsPanning] = useState(false)

  useEffect(() => {
    setPage(1)
    setZoom(100)
  }, [document.id])

  useEffect(() => {
    dragStateRef.current = null
    setIsPanning(false)
  }, [page, zoom])

  useEffect(() => {
    let cancelled = false
    let loadedPdf: PreviewPdfDocument | null = null

    const loadDocument = async () => {
      if (!document.filePath || !isTauri()) return
      setIsLoading(true)
      setError('')

      try {
        const pdfjs = await loadPdfJsModule()
        const resolvedPath = await repo.ensureDocumentPdfInStorage(document.id)
        const bytes = await readFile(resolvedPath ?? document.filePath)
        const task = pdfjs.getDocument({
          data: new Uint8Array(bytes),
          disableWorker: false,
          useWorkerFetch: false,
          isEvalSupported: false,
          stopAtErrors: false,
        })

        const pdf = await task.promise as PreviewPdfDocument
        if (cancelled) {
          await pdf.destroy?.()
          return
        }

        loadedPdf = pdf
        setPdfDocument(pdf)
        setPage((current) => Math.min(Math.max(1, current), pdf.numPages))
      } catch (loadError) {
        if (!cancelled) {
          console.error('Failed to load PDF preview:', loadError)
          setError('Preview unavailable for this document.')
          setPdfDocument(null)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadDocument()

    return () => {
      cancelled = true
      setPdfDocument(null)
      void loadedPdf?.destroy?.()
    }
  }, [document.filePath, document.id])

  useEffect(() => {
    let cancelled = false
    let renderTask: { promise?: Promise<void>; cancel?: () => void } | null = null

    const renderCurrentPage = async () => {
      if (!pdfDocument || !canvasRef.current) return
      setIsRendering(true)

      try {
        const pdfPage = await pdfDocument.getPage(page)
        if (cancelled) return

        const viewport = pdfPage.getViewport({ scale: zoom / 100 })
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
      } catch (renderError) {
        if (!cancelled) {
          console.error('Failed to render PDF preview page:', renderError)
          setError('Preview unavailable for this page.')
        }
      } finally {
        if (!cancelled) {
          setIsRendering(false)
        }
      }
    }

    void renderCurrentPage()

    return () => {
      cancelled = true
      renderTask?.cancel?.()
    }
  }, [page, pdfDocument, zoom])

  const handleViewportPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current
    if (!viewport || !pdfDocument || event.button !== 0) return

    const canPanHorizontally = viewport.scrollWidth > viewport.clientWidth
    const canPanVertically = viewport.scrollHeight > viewport.clientHeight
    if (!canPanHorizontally && !canPanVertically) return

    dragStateRef.current = {
      pointerId: event.pointerId,
      startScrollLeft: viewport.scrollLeft,
      startScrollTop: viewport.scrollTop,
      startX: event.clientX,
      startY: event.clientY,
    }
    setIsPanning(true)
    viewport.setPointerCapture?.(event.pointerId)
    event.preventDefault()
  }

  const handleViewportPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current
    const dragState = dragStateRef.current
    if (!viewport || !dragState || dragState.pointerId !== event.pointerId) return

    viewport.scrollLeft = dragState.startScrollLeft - (event.clientX - dragState.startX)
    viewport.scrollTop = dragState.startScrollTop - (event.clientY - dragState.startY)
  }

  const endViewportPan = (pointerId?: number) => {
    if (pointerId !== undefined && dragStateRef.current?.pointerId !== pointerId) return
    dragStateRef.current = null
    setIsPanning(false)
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Document Preview</CardTitle>
          <span className="text-xs text-muted-foreground">
            {page} / {pdfDocument?.numPages ?? document.pageCount ?? 'â€”'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={!pdfDocument || page <= 1}>
            <ChevronLeft className="mr-1 h-4 w-4" />
            {t('common.previous')}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setPage((current) => Math.min(pdfDocument?.numPages ?? current, current + 1))} disabled={!pdfDocument || page >= (pdfDocument?.numPages ?? 1)}>
            {t('common.next')}
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" variant="outline" size="icon" onClick={() => setZoom((current) => Math.max(50, current - 10))} disabled={!pdfDocument}>
              <Minus className="h-4 w-4" />
            </Button>
            <span className="w-14 text-center text-sm text-muted-foreground">{zoom}%</span>
            <Button type="button" variant="outline" size="icon" onClick={() => setZoom((current) => Math.min(200, current + 10))} disabled={!pdfDocument}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div
          ref={viewportRef}
          className={cn(
            'max-h-[72vh] min-h-[420px] overflow-auto rounded-lg border bg-muted/20 p-4',
            pdfDocument ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : undefined,
          )}
          onPointerDown={handleViewportPointerDown}
          onPointerMove={handleViewportPointerMove}
          onPointerUp={(event) => endViewportPan(event.pointerId)}
          onPointerCancel={(event) => endViewportPan(event.pointerId)}
          onPointerLeave={() => {
            if (!isPanning) return
          }}
        >
          {error ? (
            <p className="text-sm text-muted-foreground">{error}</p>
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground">Loading previewâ€¦</p>
          ) : (
            <div className="flex min-h-full min-w-full items-start justify-start">
              <div
                className="relative"
                style={{
                  minHeight: renderedPageSize.height || 420,
                  minWidth: renderedPageSize.width || 280,
                }}
              >
                <canvas ref={canvasRef} className="block bg-white shadow-sm" />
                {isRendering ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/60 text-sm text-muted-foreground">
                    Renderingâ€¦
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function DocumentDetailTourDemo() {
  return (
    <div className="p-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/libraries">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>

          <div className="flex items-center gap-2">
            <Button variant="outline">
              <BookOpen className="mr-2 h-4 w-4" />
              Open Reader
            </Button>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[520px_minmax(0,1fr)]">
          <div className="xl:sticky xl:top-6 xl:self-start">
            <Card className="overflow-hidden">
              <CardHeader className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>Document Preview</CardTitle>
                  <span className="text-xs text-muted-foreground">1 / 2</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" disabled>
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Previous
                  </Button>
                  <Button type="button" variant="outline" size="sm" disabled>
                    Next
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                  <div className="ml-auto flex items-center gap-2">
                    <Button type="button" variant="outline" size="icon" disabled>
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-14 text-center text-sm text-muted-foreground">100%</span>
                    <Button type="button" variant="outline" size="icon" disabled>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="max-h-[72vh] min-h-[420px] overflow-hidden rounded-lg border bg-muted/20 p-4">
                  <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
                    <iframe
                      src="/tour-sample.pdf#toolbar=0&navpanes=0&scrollbar=0"
                      className="pointer-events-none h-[62vh] min-h-[420px] w-full border-0"
                      title="Tour sample PDF preview"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
          <Card data-tour-id="documents-information">
            <CardHeader>
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <CardTitle>Document Information</CardTitle>
                <MetadataStatusBadge status="partial" />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-end">
                <Button variant="outline" size="sm" data-tour-id="documents-fetch-metadata">
                  <Globe className="mr-2 h-4 w-4" />
                  Find Metadata Online
                </Button>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Label>Title</Label>
                  <Input className="mt-1.5" value="REFX Tour Sample PDF" readOnly />
                </div>
                <div className="md:col-span-2">
                  <Label>Authors</Label>
                  <Input className="mt-1.5" value="Refx Team, Demo Author" readOnly />
                </div>
                <div>
                  <Label>Year</Label>
                  <Input className="mt-1.5" value="2026" readOnly />
                </div>
                <div>
                  <Label>Reading Stage</Label>
                  <Input className="mt-1.5" value="Reading" readOnly />
                </div>
                <div>
                  <Label>DOI</Label>
                  <Input className="mt-1.5" value="10.0000/refx-tour-demo" readOnly />
                </div>
                <div>
                  <Label>Publisher</Label>
                  <Input className="mt-1.5" value="Refx Demo Press" readOnly />
                </div>
                <div className="md:col-span-2">
                  <Label>Abstract</Label>
                  <Textarea
                    className="mt-1.5 min-h-28"
                    value="This sample document is bundled only for the guided tour. It shows where to edit metadata, manage tags, inspect references, and open the reader without using a real library document."
                    readOnly
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-tour-id="documents-tags">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <CardTitle>Tags and Classification</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <TagChip name="tour" />
                <TagChip name="workflow" />
                <TagChip name="sample pdf" />
              </div>
              <div className="space-y-2 rounded-lg border border-border p-4">
                <Label className="text-sm font-medium">Suggested Tags</Label>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-300/70 bg-emerald-500/[0.06] p-2">
                    <Check className="h-4 w-4 text-emerald-600" />
                    <X className="h-4 w-4 text-red-600" />
                    <TagChip name="metadata review" />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
                    <Check className="h-4 w-4 text-emerald-600" />
                    <X className="h-4 w-4 text-red-600" />
                    <TagChip name="notes" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-tour-id="documents-references">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                <CardTitle>References & Citations</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-lg border border-border p-4">
                <Label className="text-sm font-medium">Makes reference to</Label>
                <div className="mt-3 rounded-md border border-border bg-muted/20 p-3">
                  <div className="font-medium">Literature Review Sample</div>
                  <div className="mt-1 text-xs text-muted-foreground">Demo Author • 2024 • Manual relation</div>
                </div>
              </section>
              <section className="rounded-lg border border-border p-4">
                <Label className="text-sm font-medium">Is referenced by</Label>
                <div className="mt-3 rounded-md border border-border bg-muted/20 p-3">
                  <div className="font-medium">Project Outline Example</div>
                  <div className="mt-1 text-xs text-muted-foreground">Refx Team • 2025 • DOI match</div>
                </div>
              </section>
            </CardContent>
          </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

function RealDocumentDetailPage({
  id,
  metadataMode,
  autoSearchMetadata,
  returnTo,
}: {
  id: string
  metadataMode: string | null
  autoSearchMetadata: boolean
  returnTo: string | null
}) {
  const params = useSearchParams()
  const router = useRouter()
  const t = useT()
  const documents = useDocumentStore((state) => state.documents)
  const libraries = useLibraryStore((state) => state.libraries)
  const relations = useRelationStore((state) => state.relations)
  const { initialized, isDesktopApp, refreshData, remoteVaultStatus } = useRuntimeState()
  const {
    addDocumentTag,
    removeDocumentTag,
    acceptSuggestedTag,
    rejectSuggestedTag,
    updateDocument,
    applyFetchedMetadataCandidate,
    classifyDocuments,
    setActiveDocument,
  } = useDocumentActions()
  const { createRelation, deleteRelation } = useRelationActions()

  const document = useMemo(() => documents.find((entry) => entry.id === id) ?? null, [documents, id])
  const documentById = useMemo(() => new Map(documents.map((entry) => [entry.id, entry])), [documents])
  const libraryNameById = useMemo(() => new Map(libraries.map((library) => [library.id, library.name])), [libraries])

  const [title, setTitle] = useState('')
  const [authors, setAuthors] = useState('')
  const [year, setYear] = useState('')
  const [doi, setDoi] = useState('')
  const [isbn, setIsbn] = useState('')
  const [publisher, setPublisher] = useState('')
  const [citationKey, setCitationKey] = useState('')
  const [abstract, setAbstract] = useState('')
  const [coverImagePath, setCoverImagePath] = useState('')
  const [readingStage, setReadingStage] = useState<ReadingStage>('unread')
  const [rating, setRating] = useState(0)
  const [favorite, setFavorite] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isFetchingOnlineMetadata, setIsFetchingOnlineMetadata] = useState(false)
  const [isMetadataDialogOpen, setIsMetadataDialogOpen] = useState(false)
  const [metadataCandidates, setMetadataCandidates] = useState<DocumentMetadataCandidate[]>([])
  const [metadataDialogError, setMetadataDialogError] = useState('')
  const [metadataDoiSearchFailed, setMetadataDoiSearchFailed] = useState(false)
  const [selectedMetadataCandidateId, setSelectedMetadataCandidateId] = useState('')
  const [isApplyingMetadataCandidate, setIsApplyingMetadataCandidate] = useState(false)
  const [metadataSearchField, setMetadataSearchField] = useState<'title' | 'doi' | 'title_author'>('title_author')
  const [metadataSearchValue, setMetadataSearchValue] = useState('')
  const [metadataSearchAuthorValue, setMetadataSearchAuthorValue] = useState('')
  const [bibtexInput, setBibtexInput] = useState('')
  const [metadataProviders, setMetadataProviders] = useState<MetadataCandidateProvider[]>([
    'semantic_scholar',
    'openalex',
    'crossref',
  ])
  const [bookCoverPhoneSession, setBookCoverPhoneSession] = useState<BookCoverPhoneSession | null>(null)
  const [isPreparingBookCoverPhoneUpload, setIsPreparingBookCoverPhoneUpload] = useState(false)
  const [bookCoverPhoneStatus, setBookCoverPhoneStatus] = useState('')
  const bookCoverQrSectionRef = useRef<HTMLDivElement | null>(null)

  const [outgoingRelationTargetId, setOutgoingRelationTargetId] = useState('')
  const [incomingRelationTargetId, setIncomingRelationTargetId] = useState('')
  const [isCreatingRelation, setIsCreatingRelation] = useState(false)
  const [isOutgoingRelationPickerOpen, setIsOutgoingRelationPickerOpen] = useState(false)
  const [isIncomingRelationPickerOpen, setIsIncomingRelationPickerOpen] = useState(false)
  const [doiReferences, setDoiReferences] = useState<DocumentDoiReferenceItem[]>([])
  const [incomingDoiReferences, setIncomingDoiReferences] = useState<DocumentDoiReferenceItem[]>([])
  const [isFindingReferences, setIsFindingReferences] = useState(false)
  const [doiReferenceStatus, setDoiReferenceStatus] = useState('')
  const [isFetchingAiTags, setIsFetchingAiTags] = useState(false)
  const [aiTagStatus, setAiTagStatus] = useState('')
  const [editingTagName, setEditingTagName] = useState('')
  const [editingTagValue, setEditingTagValue] = useState('')
  const [newSuggestedTagNames, setNewSuggestedTagNames] = useState<string[]>([])
  const [classificationMode, setClassificationMode] = useState<StoredAppSettings['advancedClassificationMode']>(DEFAULT_APP_SETTINGS.advancedClassificationMode)
  const [isClassifyingDocument, setIsClassifyingDocument] = useState(false)
  const [isClassifyingDocumentWithAi, setIsClassifyingDocumentWithAi] = useState(false)
  const [classificationStatusMessage, setClassificationStatusMessage] = useState('')

  const [detailsExpanded, setDetailsExpanded] = useState(true)
  const [tagsExpanded, setTagsExpanded] = useState(false)
  const [linksExpanded, setLinksExpanded] = useState(true)
  const [outgoingLinksExpanded, setOutgoingLinksExpanded] = useState(true)
  const [incomingLinksExpanded, setIncomingLinksExpanded] = useState(true)
  const [doiOnlyReferencesExpanded, setDoiOnlyReferencesExpanded] = useState(false)
  const [bibtexExpanded, setBibtexExpanded] = useState(false)
  const metadataAutoOpenHandledRef = useRef<string | null>(null)
  const metadataAutoSearchPendingRef = useRef<string | null>(null)
  const previousSuggestedTagNamesRef = useRef<string[]>([])

  useEffect(() => {
    if (!document) return

    setActiveDocument(document.id)
    setTitle(document.title)
    setAuthors(document.authors.join(', '))
    setYear(document.year ? String(document.year) : '')
    setDoi(document.doi ?? '')
    setIsbn(document.isbn ?? '')
    setPublisher(document.publisher ?? '')
    setCitationKey(document.citationKey ?? '')
    setAbstract(document.abstract ?? '')
    setCoverImagePath(document.coverImagePath ?? '')
    setReadingStage(document.readingStage)
    setRating(document.rating)
    setFavorite(document.favorite)
    setOutgoingRelationTargetId('')
    setIncomingRelationTargetId('')
    setIsOutgoingRelationPickerOpen(false)
    setIsIncomingRelationPickerOpen(false)
    setMetadataSearchField('title_author')
    setMetadataSearchValue(document.title || '')
    setMetadataSearchAuthorValue(document.authors[0] ?? '')
    setMetadataDoiSearchFailed(false)
    setBibtexInput('')
    setBibtexExpanded(false)
    setBookCoverPhoneSession(null)
    setBookCoverPhoneStatus('')
    setDoiReferences([])
    setIncomingDoiReferences([])
    setDoiReferenceStatus('')
    metadataAutoOpenHandledRef.current = null
    metadataAutoSearchPendingRef.current = null
    setEditingTagName('')
    setEditingTagValue('')
    setNewSuggestedTagNames([])
    previousSuggestedTagNamesRef.current = (document.suggestedTags ?? []).map((tag) => tag.name)
  }, [
    document?.id,
    document?.title,
    document?.authors?.join('|'),
    document?.year,
    document?.doi,
    document?.isbn,
    document?.publisher,
    document?.citationKey,
    document?.abstract,
    document?.coverImagePath,
    document?.readingStage,
    document?.rating,
    document?.favorite,
    setActiveDocument,
  ])

  useEffect(() => {
    setAiTagStatus('')
  }, [document?.id])

  useEffect(() => {
    let cancelled = false

    const loadSettings = async () => {
      const loaded = await loadAppSettings(isDesktopApp)
      if (!cancelled) {
        setClassificationMode(loaded.advancedClassificationMode)
      }
    }

    void loadSettings()

    return () => {
      cancelled = true
    }
  }, [isDesktopApp])

  useEffect(() => {
    setClassificationStatusMessage('')
  }, [document?.id])

  useEffect(() => {
    if (!document) {
      previousSuggestedTagNamesRef.current = []
      setNewSuggestedTagNames([])
      return
    }

    const nextSuggestedTagNames = (document.suggestedTags ?? []).map((tag) => tag.name)
    setNewSuggestedTagNames((current) => current.filter((tagName) => nextSuggestedTagNames.includes(tagName)))
    previousSuggestedTagNamesRef.current = nextSuggestedTagNames
  }, [document])

  useEffect(() => {
    if (!document) return

    let cancelled = false

    const loadDoiReferences = async () => {
      try {
        const [nextReferences, nextIncomingReferences] = await Promise.all([
          repo.listDocumentDoiReferencesForDocument(document.id),
          repo.listDocumentDoiReferencesPointingToDocument(document.id),
        ])
        if (!cancelled) {
          setDoiReferences(nextReferences)
          setIncomingDoiReferences(nextIncomingReferences)
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load document DOI references:', error)
        }
      }
    }

    void loadDoiReferences()

    return () => {
      cancelled = true
    }
  }, [document])

  useEffect(() => {
    if (!document || !autoSearchMetadata) return
    if (metadataAutoOpenHandledRef.current === document.id) return

    const nextMode = metadataMode === 'doi' ? 'doi' : 'title_author'
    setMetadataProviders(['semantic_scholar', 'openalex', 'crossref'])
    setMetadataSearchField(nextMode)
    setMetadataSearchValue(nextMode === 'doi' ? (document.doi ?? '') : document.title)
    setMetadataSearchAuthorValue(document.authors[0] ?? '')
    setMetadataDialogError('')
    setMetadataCandidates([])
    setSelectedMetadataCandidateId('')
    setIsMetadataDialogOpen(true)
    metadataAutoOpenHandledRef.current = document.id
    metadataAutoSearchPendingRef.current = document.id
    try {
  const currentSearch = new URLSearchParams(window.location.search)
  currentSearch.delete('autoSearchMetadata')
  const newSearch = currentSearch.toString()
  const newUrl = `${window.location.pathname}${newSearch ? `?${newSearch}` : ''}`
  router.replace(newUrl, { scroll: false })
} catch {}
  }, [autoSearchMetadata, document, metadataMode])

  useEffect(() => {
    if (!document || !isMetadataDialogOpen || !autoSearchMetadata) return
    if (metadataAutoSearchPendingRef.current !== document.id) return

    metadataAutoSearchPendingRef.current = null
    const timeoutId = window.setTimeout(() => {
      void runMetadataCandidateSearch()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document, isMetadataDialogOpen, autoSearchMetadata])

  const relationItems = useMemo(() => {
    if (!document) {
      return {
        outgoing: [] as RelationListItem[],
        incoming: [] as RelationListItem[],
      }
    }

    const outgoing = relations
      .filter((relation) => relation.sourceDocumentId === document.id)
      .map((relation) => ({ relationId: relation.id, relatedDocumentId: relation.targetDocumentId }))
      .filter((entry) => documentById.has(entry.relatedDocumentId))

    const incoming = relations
      .filter((relation) => relation.targetDocumentId === document.id)
      .map((relation) => ({ relationId: relation.id, relatedDocumentId: relation.sourceDocumentId }))
      .filter((entry) => documentById.has(entry.relatedDocumentId))

    return { outgoing, incoming }
  }, [document, documentById, relations])

  const availableRelationTargets = useMemo(() => {
    if (!document) return []

    return documents
      .filter((entry) => entry.id !== document.id)
      .sort((left, right) => left.title.localeCompare(right.title))
  }, [document, documents])

  const doiReferenceBuckets = useMemo(() => {
    const linkedTargetIds = new Set(relationItems.outgoing.map((item) => item.relatedDocumentId))
    const seenMatchedTargetIds = new Set<string>()
    const seenUnmatchedDois = new Set<string>()

    const matched = doiReferences.filter((reference) => {
      const targetId = reference.matchedDocumentId
      if (!targetId || !documentById.has(targetId)) return false
      if (linkedTargetIds.has(targetId)) return false
      if (seenMatchedTargetIds.has(targetId)) return false
      seenMatchedTargetIds.add(targetId)
      return true
    })

    const unmatched = doiReferences.filter((reference) => {
      const targetId = reference.matchedDocumentId
      if (targetId && documentById.has(targetId)) return false
      if (seenUnmatchedDois.has(reference.doi)) return false
      seenUnmatchedDois.add(reference.doi)
      return true
    })

    return { matched, unmatched }
  }, [documentById, doiReferences, relationItems.outgoing])

  const incomingDoiMatches = useMemo(() => {
    const linkedSourceIds = new Set(relationItems.incoming.map((item) => item.relatedDocumentId))
    const seenSourceIds = new Set<string>()

    return incomingDoiReferences.filter((reference) => {
      const sourceId = reference.sourceDocumentId
      if (!documentById.has(sourceId)) return false
      if (linkedSourceIds.has(sourceId)) return false
      if (seenSourceIds.has(sourceId)) return false
      seenSourceIds.add(sourceId)
      return true
    })
  }, [documentById, incomingDoiReferences, relationItems.incoming])

  const normalizedAuthors = useMemo(
    () =>
      authors
        .split(',')
        .map((author) => author.trim())
        .filter(Boolean),
    [authors],
  )

  const normalizedYear = useMemo(() => {
    const trimmedYear = year.trim()
    return trimmedYear ? Number(trimmedYear) : undefined
  }, [year])

  const savePayload = useMemo(
    () => ({
      title: title.trim() || document?.title || '',
      authors: normalizedAuthors,
      year: normalizedYear,
      doi: doi.trim() || undefined,
      isbn: isbn.trim() || undefined,
      publisher: publisher.trim() || undefined,
      citationKey: citationKey.trim() || '',
      abstract: abstract.trim() || undefined,
      coverImagePath: coverImagePath.trim() || undefined,
      readingStage,
      rating,
      favorite,
    }),
    [
      abstract,
      citationKey,
      coverImagePath,
      document?.title,
      doi,
      favorite,
      isbn,
      normalizedAuthors,
      normalizedYear,
      publisher,
      rating,
      readingStage,
      title,
    ],
  )

  const hasUnsavedChanges = useMemo(() => {
    if (!document) return false
    if (savePayload.title !== document.title) return true
    if (savePayload.authors.length !== document.authors.length) return true
    if (savePayload.authors.some((author, index) => author !== document.authors[index])) return true
    if (savePayload.year !== document.year) return true
    if ((savePayload.doi ?? '') !== (document.doi ?? '')) return true
    if ((savePayload.isbn ?? '') !== (document.isbn ?? '')) return true
    if ((savePayload.publisher ?? '') !== (document.publisher ?? '')) return true
    if (savePayload.citationKey !== (document.citationKey ?? '')) return true
    if ((savePayload.abstract ?? '') !== (document.abstract ?? '')) return true
    if ((savePayload.coverImagePath ?? '') !== (document.coverImagePath ?? '')) return true
    if (savePayload.readingStage !== document.readingStage) return true
    if (savePayload.rating !== document.rating) return true
    if (savePayload.favorite !== document.favorite) return true
    return false
  }, [document, savePayload])

  const libraryMetadataState = useMemo(() => {
    const hasTitle = hasUsableMetadataTitle(savePayload.title)
    const hasAuthors = savePayload.authors.length > 0
    const hasYear = typeof savePayload.year === 'number'
    const hasDoi = (savePayload.doi ?? '').trim().length > 0

    if (hasTitle && hasAuthors && hasYear && hasDoi) return 'complete'
    if (hasTitle && hasAuthors && hasYear && !hasDoi) return 'missing_doi'
    if (hasDoi) return 'fetch_possible'
    return 'missing'
  }, [savePayload])

  const documentCanBeClassified = useMemo(() => {
    if (!document) return false
    if (document.documentType === 'my_work') return false
    return document.hasExtractedText || document.hasOcrText
  }, [document])

  const classificationNeedsRefresh = useMemo(() => {
    if (!document || !documentCanBeClassified) return false
    if (document.classificationStatus !== 'complete') return true
    return !document.classificationTextHash || document.classificationTextHash !== document.textHash
  }, [document, documentCanBeClassified])

  const classificationStatusTone = useMemo(() => {
    if (!document) return 'secondary'
    switch (document.classificationStatus) {
      case 'complete':
        return 'secondary'
      case 'processing':
        return 'default'
      case 'failed':
        return 'destructive'
      default:
        return 'outline'
    }
  }, [document]) as ComponentProps<typeof Badge>['variant']

  const canWriteDocumentMetadata = !remoteVaultStatus?.enabled || (!remoteVaultStatus.isOffline && remoteVaultStatus.mode === 'remoteWriter')
  const documentMetadataWriteLockMessage = remoteVaultStatus?.enabled && !canWriteDocumentMetadata
    ? `${remoteVaultStatus.message} You can still search metadata candidates, but applying or saving metadata requires write access.`
    : ''

  if (!document) {
    if (!initialized) return <div className="p-6">Loading document...</div>
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={BookOpen}
          title="Document not found"
          description="This document is no longer available in your local library."
          action={
            <Button asChild>
              <Link href="/libraries">Back to Libraries</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const handleSave = async () => {
    if (!document || !hasUnsavedChanges) return
    setIsSaving(true)
    try {
      await updateDocument(document.id, savePayload)
      setTitle(savePayload.title)
      setAuthors(savePayload.authors.join(', '))
      setYear(savePayload.year ? String(savePayload.year) : '')
      setDoi(savePayload.doi ?? '')
      setIsbn(savePayload.isbn ?? '')
      setPublisher(savePayload.publisher ?? '')
      setCitationKey(savePayload.citationKey)
      setAbstract(savePayload.abstract ?? '')
      setCoverImagePath(savePayload.coverImagePath ?? '')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSelectBookCoverFromComputer = async () => {
    if (!isDesktopApp) return

    const selected = await openFileDialog({
      multiple: false,
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      title: 'Choose a book cover image',
    })

    if (!selected || Array.isArray(selected)) return

    const importedCoverPath = await repo.importBookCover(selected)
    setCoverImagePath(importedCoverPath)
    setBookCoverPhoneStatus('Cover selected from this computer.')
  }

  const handlePreparePhoneCoverUpload = async () => {
    if (!isDesktopApp) return

    setIsPreparingBookCoverPhoneUpload(true)
    setBookCoverPhoneStatus('')
    try {
      const session = await repo.startBookCoverUploadSession()
      const qrDataUrl = await QRCode.toDataURL(session.url, {
        margin: 1,
        width: 220,
      })
      setBookCoverPhoneSession({
        token: session.token,
        url: session.url,
        urls: session.urls,
        qrDataUrl,
      })
      setBookCoverPhoneStatus('Scan with your phone on the same local network.')
    } finally {
      setIsPreparingBookCoverPhoneUpload(false)
    }
  }

  useEffect(() => {
    if (!bookCoverPhoneSession?.token) return

    const interval = window.setInterval(() => {
      void repo.getBookCoverUploadSessionStatus(bookCoverPhoneSession.token).then((status) => {
        if (status.status === 'completed' && status.imagePath) {
          setCoverImagePath(status.imagePath)
          setBookCoverPhoneStatus('Cover uploaded from your phone.')
          setBookCoverPhoneSession(null)
          return
        }

        if (status.status === 'expired') {
          setBookCoverPhoneStatus('Phone upload expired. Start a new QR session if needed.')
          setBookCoverPhoneSession(null)
        }
      }).catch((error) => {
        console.error('Failed to poll book cover upload status:', error)
      })
    }, 1200)

    return () => {
      window.clearInterval(interval)
    }
  }, [bookCoverPhoneSession?.token])

  useEffect(() => {
    if (!bookCoverPhoneSession) return

    const timeoutId = window.setTimeout(() => {
      bookCoverQrSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      })
    }, 80)

    return () => window.clearTimeout(timeoutId)
  }, [bookCoverPhoneSession])

  const handleAddTag = async () => {
    if (!document || !tagInput.trim()) return
    await addDocumentTag(document.id, tagInput)
    setTagInput('')
  }

  const handleStartEditTag = (tag: string) => {
    setEditingTagName(tag)
    setEditingTagValue(tag)
  }

  const handleSaveEditedTag = async () => {
    if (!document || !editingTagName) return

    const nextTag = editingTagValue.trim()
    if (!nextTag) {
      await removeDocumentTag(document.id, editingTagName)
      setEditingTagName('')
      setEditingTagValue('')
      return
    }

    if (nextTag !== editingTagName) {
      await removeDocumentTag(document.id, editingTagName)
      await addDocumentTag(document.id, nextTag)
    }

    setEditingTagName('')
    setEditingTagValue('')
  }

  const handleCancelEditTag = () => {
    setEditingTagName('')
    setEditingTagValue('')
  }

  const handleFetchTagsWithAi = async () => {
    if (!document) return

    setTagsExpanded(true)
    setIsFetchingAiTags(true)
    setAiTagStatus('')
    const previousNames = new Set((document.suggestedTags ?? []).map((tag) => tag.name))
    try {
      const result = await detectAndStoreDocumentKeywords(document.id, { forceAi: true })
      await refreshData()
      const refreshedDocument = useDocumentStore.getState().documents.find((entry) => entry.id === document.id)
      const nextSuggestedTagNames = (refreshedDocument?.suggestedTags ?? []).map((tag) => tag.name)
      setNewSuggestedTagNames(nextSuggestedTagNames.filter((tagName) => !previousNames.has(tagName)))
      previousSuggestedTagNamesRef.current = nextSuggestedTagNames
      setAiTagStatus(
        result.keywords.length > 0
          ? `Stored ${result.keywords.length} AI tag suggestion${result.keywords.length === 1 ? '' : 's'}${result.classificationStored ? ' and updated semantic classification.' : '.'}`
          : 'No AI keywords were returned for this document.',
      )
    } catch (error) {
      setAiTagStatus(normalizeErrorMessage(error, 'Could not fetch AI tags.'))
    } finally {
      setIsFetchingAiTags(false)
    }
  }

  const handleRefreshLocalTags = async () => {
    if (!document) return

    setTagsExpanded(true)
    setIsFetchingAiTags(true)
    setAiTagStatus('')
    const previousNames = new Set((document.suggestedTags ?? []).map((tag) => tag.name))
    try {
      const result = await detectAndStoreDocumentKeywords(document.id, { forceLocal: true })
      await refreshData()
      const refreshedDocument = useDocumentStore.getState().documents.find((entry) => entry.id === document.id)
      const nextSuggestedTagNames = (refreshedDocument?.suggestedTags ?? []).map((tag) => tag.name)
      setNewSuggestedTagNames(nextSuggestedTagNames.filter((tagName) => !previousNames.has(tagName)))
      previousSuggestedTagNamesRef.current = nextSuggestedTagNames
      setAiTagStatus(
        result.keywords.length > 0
          ? `Stored ${result.keywords.length} local keyword suggestion${result.keywords.length === 1 ? '' : 's'}.`
          : 'No local keywords were returned for this document.',
      )
    } catch (error) {
      setAiTagStatus(normalizeErrorMessage(error, 'Could not refresh local tags.'))
    } finally {
      setIsFetchingAiTags(false)
    }
  }

  const handleClassifyDocument = async () => {
    if (!document || classificationMode === 'off') return

    setIsClassifyingDocument(true)
    setClassificationStatusMessage('')
    try {
      await classifyDocuments([document.id], classificationMode)
      const refreshedDocument = useDocumentStore.getState().documents.find((entry) => entry.id === document.id)
      if (!refreshedDocument) {
        setClassificationStatusMessage('Document classification finished.')
        return
      }

      if (refreshedDocument.classificationStatus === 'complete' && refreshedDocument.classification) {
        setClassificationStatusMessage(
          `${refreshedDocument.classification.category}: ${refreshedDocument.classification.topic} (${Math.round(refreshedDocument.classification.confidence * 100)}% confidence).`,
        )
      } else if (refreshedDocument.classificationStatus === 'failed') {
        setClassificationStatusMessage(refreshedDocument.processingError ?? 'Semantic classification failed.')
      } else if (refreshedDocument.classificationStatus === 'skipped') {
        setClassificationStatusMessage('Semantic classification was skipped for this document.')
      } else {
        setClassificationStatusMessage('Document classification finished.')
      }
    } finally {
      setIsClassifyingDocument(false)
    }
  }

  const handleClassifyDocumentWithAi = async () => {
    if (!document || !documentCanBeClassified) return

    setTagsExpanded(true)
    setIsClassifyingDocumentWithAi(true)
    setClassificationStatusMessage('')
    try {
      const result = await detectAndStoreDocumentKeywords(document.id, { forceAi: true })
      await refreshData()
      const refreshedDocument = useDocumentStore.getState().documents.find((entry) => entry.id === document.id)
      if (!refreshedDocument) {
        setClassificationStatusMessage(t('documentDetailPage.aiClassificationFinished'))
        return
      }

      if (refreshedDocument.classificationStatus === 'complete' && refreshedDocument.classification) {
        setClassificationStatusMessage(
          `${refreshedDocument.classification.category}: ${refreshedDocument.classification.topic} (${Math.round(refreshedDocument.classification.confidence * 100)}% confidence).`,
        )
      } else if (refreshedDocument.classificationStatus === 'failed') {
        setClassificationStatusMessage(refreshedDocument.processingError ?? t('documentDetailPage.aiClassificationFailed'))
      } else if (result.classificationStored) {
        setClassificationStatusMessage(t('documentDetailPage.aiClassificationFinished'))
      } else {
        setClassificationStatusMessage(t('documentDetailPage.aiClassificationNotSaved'))
      }
    } catch (error) {
      setClassificationStatusMessage(normalizeErrorMessage(error, 'Could not classify this document with AI.'))
    } finally {
      setIsClassifyingDocumentWithAi(false)
    }
  }

  const runMetadataCandidateSearch = async (override?: {
    field?: 'title' | 'doi' | 'title_author'
    value?: string
    authorValue?: string
  }) => {
    if (!document) return
    const searchField = override?.field ?? metadataSearchField
    const searchValue = override?.value ?? metadataSearchValue
    const authorSearchValue = override?.authorValue ?? metadataSearchAuthorValue
    setIsFetchingOnlineMetadata(true)
    setMetadataDialogError('')
    setMetadataDoiSearchFailed(false)
    setMetadataCandidates([])
    setSelectedMetadataCandidateId('')
    try {
      const settings = await loadOnlineMetadataEnrichmentSettings(isDesktopApp)
      const trimmedSearchValue = searchValue.trim()
      const trimmedAuthorSearchValue = authorSearchValue.trim()
      const candidates = await findDocumentMetadataCandidates(
        buildDocumentMetadataSeed({
          authors: JSON.stringify(
            searchField === 'title_author'
              ? (trimmedAuthorSearchValue ? [trimmedAuthorSearchValue] : [])
              : document.authors,
          ),
          citationKey: document.citationKey,
          doi: searchField === 'doi' ? (trimmedSearchValue || doi.trim() || document.doi) : undefined,
          title: searchField === 'doi'
            ? ''
            : (trimmedSearchValue || document.title),
          year: document.year,
        }),
        settings,
        { providers: metadataProviders },
      )
      setMetadataCandidates(candidates)
      setSelectedMetadataCandidateId(candidates[0]?.id ?? '')
      if (candidates.length === 0) {
        setMetadataDialogError('No metadata candidates were found for this document.')
        setMetadataDoiSearchFailed(searchField === 'doi')
      }
    } catch (error) {
      setMetadataDialogError(error instanceof Error ? error.message : 'Could not fetch metadata candidates.')
    } finally {
      setIsFetchingOnlineMetadata(false)
    }
  }

  const handleFetchOnlineMetadata = async () => {
    if (!document) return
    const hasDoi = doi.trim().length > 0
    const nextMode = hasDoi ? 'doi' : 'title_author'
    const nextSearchValue = hasDoi ? doi.trim() : title.trim()
    const nextAuthorValue = authors.split(',').map((entry) => entry.trim()).filter(Boolean)[0] ?? ''
    setMetadataSearchField(nextMode)
    setMetadataSearchValue(nextSearchValue)
    setMetadataSearchAuthorValue(nextAuthorValue)
    setMetadataDialogError('')
    setMetadataDoiSearchFailed(false)
    setMetadataCandidates([])
    setSelectedMetadataCandidateId('')
    setIsMetadataDialogOpen(true)
    metadataAutoOpenHandledRef.current = document.id
    metadataAutoSearchPendingRef.current = null
    window.setTimeout(() => {
      void runMetadataCandidateSearch({
        field: nextMode,
        value: nextSearchValue,
        authorValue: nextAuthorValue,
      })
    }, 0)
  }

  const selectedMetadataCandidate = metadataCandidates.find((candidate) => candidate.id === selectedMetadataCandidateId) ?? metadataCandidates[0] ?? null

  const handleApplyMetadataCandidate = async (
    mode: 'fill_missing' | 'replace_unlocked',
    candidateOverride?: DocumentMetadataCandidate | null,
  ) => {
    const candidate = candidateOverride ?? selectedMetadataCandidate
    if (!document || !candidate) return
    setIsApplyingMetadataCandidate(true)
    try {
      await applyFetchedMetadataCandidate(document.id, candidate.metadata, mode)
      setIsMetadataDialogOpen(false)
      if (returnTo?.startsWith('/')) {
        router.push(returnTo)
      }
    } finally {
      setIsApplyingMetadataCandidate(false)
    }
  }

  const handleImportBibtexCandidate = () => {
    const candidate = createMetadataCandidateFromBibtex(bibtexInput)
    if (!candidate) {
      setMetadataDialogError('Could not parse a usable BibTeX entry.')
      return
    }

    setMetadataDialogError('')
    setMetadataCandidates((current) => {
      const next = [candidate, ...current.filter((entry) => entry.id !== candidate.id)]
      return next
    })
    setSelectedMetadataCandidateId(candidate.id)
  }

  const toggleMetadataProvider = (provider: MetadataCandidateProvider) => {
    setMetadataProviders((current) => {
      if (current.includes(provider)) {
        return current.length > 1 ? current.filter((entry) => entry !== provider) : current
      }

      const next = [...current, provider]
      const orderedProviders: MetadataCandidateProvider[] = ['semantic_scholar', 'openalex', 'crossref']
      return orderedProviders.filter((entry) => next.includes(entry))
    })
  }

  const handleCreateRelation = async (direction: 'outbound' | 'inbound') => {
    if (!document) return

    const relationTargetId = direction === 'outbound' ? outgoingRelationTargetId : incomingRelationTargetId
    if (!relationTargetId) return

    const sourceDocumentId = direction === 'outbound' ? document.id : relationTargetId
    const targetDocumentId = direction === 'outbound' ? relationTargetId : document.id

    const alreadyExists = relations.some(
      (relation) =>
        relation.sourceDocumentId === sourceDocumentId
        && relation.targetDocumentId === targetDocumentId
        && relation.linkOrigin === 'user'
        && relation.linkType === 'manual',
    )

    if (alreadyExists) return

    setIsCreatingRelation(true)
    try {
      await createRelation({
        sourceDocumentId,
        targetDocumentId,
        linkType: 'manual',
        linkOrigin: 'user',
      })
      if (direction === 'outbound') {
        setOutgoingRelationTargetId('')
        setIsOutgoingRelationPickerOpen(false)
      } else {
        setIncomingRelationTargetId('')
        setIsIncomingRelationPickerOpen(false)
      }
    } finally {
      setIsCreatingRelation(false)
    }
  }

  const handleFindReferences = async () => {
    if (!document) return

    setIsFindingReferences(true)
    setDoiReferenceStatus('')
    try {
      const dois = await scanDocumentForDoiReferences(document)
      const nextReferences = await repo.replaceDocumentDoiReferences({
        sourceDocumentId: document.id,
        dois,
      })
      setDoiReferences(nextReferences)
      setDoiReferenceStatus(
        dois.length > 0
          ? `Found ${dois.length} DOI reference${dois.length === 1 ? '' : 's'}.`
          : 'No DOI references found in this document.',
      )
    } catch (error) {
      console.error('Failed to find DOI references:', error)
      setDoiReferenceStatus(error instanceof Error ? error.message : 'Could not scan DOI references.')
    } finally {
      setIsFindingReferences(false)
    }
  }

  const renderRelationList = (
    titleText: string,
    items: RelationListItem[],
    direction: 'outbound' | 'inbound',
  ) => {
    const isExpanded = direction === 'outbound' ? outgoingLinksExpanded : incomingLinksExpanded
    const matchedDoiItems = direction === 'outbound' ? doiReferenceBuckets.matched : incomingDoiMatches
    const unmatchedDoiItems = direction === 'outbound' ? doiReferenceBuckets.unmatched : []
    const totalItemsCount = items.length + matchedDoiItems.length + unmatchedDoiItems.length
    const toggleExpanded = () => {
      if (direction === 'outbound') {
        setOutgoingLinksExpanded((current) => !current)
      } else {
        setIncomingLinksExpanded((current) => !current)
      }
    }

    return (
    <section className="rounded-lg border border-border p-4">
      <button
        type="button"
        onClick={toggleExpanded}
        className="mb-3 flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-muted-foreground" />
          <Label className="cursor-pointer text-sm font-medium">
            {titleText} ({totalItemsCount})
          </Label>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </button>
      {isExpanded ? (
        <>
      <div className="mb-4 flex gap-2">
        <Popover
          open={direction === 'outbound' ? isOutgoingRelationPickerOpen : isIncomingRelationPickerOpen}
          onOpenChange={direction === 'outbound' ? setIsOutgoingRelationPickerOpen : setIsIncomingRelationPickerOpen}
        >
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={direction === 'outbound' ? isOutgoingRelationPickerOpen : isIncomingRelationPickerOpen}
              className="flex-1 justify-between font-normal"
            >
              <span className="truncate">
                {(direction === 'outbound' ? outgoingRelationTargetId : incomingRelationTargetId)
                  ? availableRelationTargets.find(
                    (targetDocument) =>
                      targetDocument.id === (direction === 'outbound' ? outgoingRelationTargetId : incomingRelationTargetId),
                  )?.title ?? 'Select a document'
                  : 'Select a document'}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search document titles..." />
              <CommandList>
                <CommandEmpty>No document found.</CommandEmpty>
                <CommandGroup>
                  {availableRelationTargets.map((targetDocument) => {
                    const selectedTargetId = direction === 'outbound' ? outgoingRelationTargetId : incomingRelationTargetId
                    return (
                      <CommandItem
                        key={`${direction}-${targetDocument.id}`}
                        value={[
                          targetDocument.title,
                          targetDocument.authors.join(' '),
                          targetDocument.year ? String(targetDocument.year) : '',
                        ].join(' ')}
                        onSelect={() => {
                          if (direction === 'outbound') {
                            setOutgoingRelationTargetId(targetDocument.id)
                            setIsOutgoingRelationPickerOpen(false)
                          } else {
                            setIncomingRelationTargetId(targetDocument.id)
                            setIsIncomingRelationPickerOpen(false)
                          }
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            selectedTargetId === targetDocument.id ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <div className="min-w-0">
                          <div className="truncate">{targetDocument.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {targetDocument.authors.join(', ') || 'Unknown author'}
                            {targetDocument.year ? ` â€¢ ${targetDocument.year}` : ''}
                          </div>
                        </div>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Button
          type="button"
          variant="outline"
          onClick={() => void handleCreateRelation(direction)}
          disabled={!(direction === 'outbound' ? outgoingRelationTargetId : incomingRelationTargetId) || isCreatingRelation}
        >
          {isCreatingRelation ? 'Adding...' : 'Add'}
        </Button>
      </div>
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item) => {
            const relatedDocument = documentById.get(item.relatedDocumentId)
            const relatedRelation = relations.find((relation) => relation.id === item.relationId)
            if (!relatedDocument || !relatedRelation) return null

            return (
              <div
                key={item.relationId}
                className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border bg-muted/20 p-3"
              >
                <div className="min-w-0 space-y-1">
                  <Link
                    href={`/documents?id=${relatedDocument.id}`}
                    className="block text-sm font-medium hover:underline"
                  >
                    {relatedDocument.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {relatedDocument.authors.join(', ') || 'Unknown author'}
                    {relatedDocument.year ? ` â€¢ ${relatedDocument.year}` : ''}
                    {libraryNameById.get(relatedDocument.libraryId)
                      ? ` â€¢ ${libraryNameById.get(relatedDocument.libraryId)}`
                      : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {relatedRelation.linkOrigin === 'auto' ? 'Automatic' : 'Manual'}
                    {relatedRelation.linkType !== 'manual'
                      ? ` â€¢ ${relatedRelation.linkType.replaceAll('_', ' ')}`
                      : ''}
                    {relatedRelation.label ? ` â€¢ ${relatedRelation.label}` : ''}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => void deleteRelation(item.relationId)}
                  aria-label="Remove link"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )
          })}
        </div>
      ) : null}
      {direction === 'outbound' && matchedDoiItems.length > 0 ? (
        <div className="mt-3 space-y-2">
          {matchedDoiItems.map((reference) => {
            const relatedDocument = reference.matchedDocumentId ? documentById.get(reference.matchedDocumentId) : null
            if (!relatedDocument) return null

            return (
              <div
                key={reference.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border bg-muted/20 p-3"
              >
                <div className="min-w-0 flex-1">
                  <Link href={`/documents?id=${relatedDocument.id}`} className="font-medium hover:text-primary">
                    {relatedDocument.title}
                  </Link>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {relatedDocument.authors.join(', ') || 'Unknown author'}
                    {relatedDocument.year ? ` - ${relatedDocument.year}` : ''}
                    {libraryNameById.get(relatedDocument.libraryId) ? ` - ${libraryNameById.get(relatedDocument.libraryId)}` : ''}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    DOI match: {reference.doi}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
      {direction === 'inbound' && matchedDoiItems.length > 0 ? (
        <div className="mt-3 space-y-2">
          {matchedDoiItems.map((reference) => {
            const sourceDocument = documentById.get(reference.sourceDocumentId)
            if (!sourceDocument) return null

            return (
              <div
                key={reference.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border bg-muted/20 p-3"
              >
                <div className="min-w-0 flex-1">
                  <Link href={`/documents?id=${sourceDocument.id}`} className="font-medium hover:text-primary">
                    {sourceDocument.title}
                  </Link>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {sourceDocument.authors.join(', ') || 'Unknown author'}
                    {sourceDocument.year ? ` - ${sourceDocument.year}` : ''}
                    {libraryNameById.get(sourceDocument.libraryId) ? ` - ${libraryNameById.get(sourceDocument.libraryId)}` : ''}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    DOI match: {reference.doi}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
      {direction === 'outbound' && doiReferenceBuckets.unmatched.length > 0 ? (
        <div className="mt-3 rounded-md border border-dashed border-border bg-muted/10">
          <button
            type="button"
            onClick={() => setDoiOnlyReferencesExpanded((current) => !current)}
            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
          >
            <span className="text-sm font-medium text-foreground">
              DOI-only references ({doiReferenceBuckets.unmatched.length})
            </span>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${doiOnlyReferencesExpanded ? 'rotate-180' : ''}`}
            />
          </button>
          {doiOnlyReferencesExpanded ? (
            <div className="space-y-2 border-t border-border/70 px-3 py-3">
              {doiReferenceBuckets.unmatched.map((reference) => (
                <div
                  key={reference.id}
                  className="rounded-md border border-dashed border-border bg-background/60 px-3 py-2 text-sm text-muted-foreground"
                >
                  {reference.doi}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
        </>
      ) : null}
    </section>
    )
  }

  const showPdfPreview = document.documentType === 'pdf' && Boolean(document.filePath)
  const bookCoverPreviewUrl = coverImagePath
    ? isDesktopApp
      ? convertFileSrc(coverImagePath)
      : coverImagePath
    : ''

  return (
    <div className="p-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/libraries">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>

          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link
                href={
                  document.documentType === 'physical_book'
                    ? `/books/notes?id=${document.id}`
                    : document.documentType === 'my_work'
                      ? `/documents?id=${document.id}`
                      : `/reader/view?id=${document.id}`
                }
              >
                <BookOpen className="mr-2 h-4 w-4" />
                {document.documentType === 'physical_book'
                  ? 'Open Notes'
                  : document.documentType === 'my_work'
                    ? 'Open Details'
                    : 'Open Reader'}
              </Link>
            </Button>
            {hasUnsavedChanges ? (
              <Button
                onClick={() => void handleSave()}
                disabled={isSaving || !canWriteDocumentMetadata}
                title={!canWriteDocumentMetadata ? documentMetadataWriteLockMessage : undefined}
              >
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            ) : null}
          </div>
        </div>

        <div
          className={cn(
            'grid gap-6',
            showPdfPreview ? 'xl:grid-cols-[520px_minmax(0,1fr)] 2xl:grid-cols-[580px_minmax(0,1fr)]' : '',
          )}
        >
          {showPdfPreview ? (
            <div className="xl:sticky xl:top-6 xl:self-start">
              <DocumentPdfPreview document={document} />
            </div>
          ) : null}

          <div className="space-y-6">
        <Card data-tour-id="documents-information">
          <Collapsible open={detailsExpanded} onOpenChange={setDetailsExpanded}>
            <CardHeader>
              <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 text-left">
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <CardTitle>{t('documentDetailPage.information')}</CardTitle>
                  <MetadataStatusBadge status={libraryMetadataState} />
                </div>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${detailsExpanded ? 'rotate-180' : ''}`} />
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent>
                <div className="mb-4 flex justify-end">
                  <Tooltip>
                    <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" onClick={() => void handleFetchOnlineMetadata()} disabled={isFetchingOnlineMetadata} data-tour-id="documents-fetch-metadata">
                      <Globe className="mr-2 h-4 w-4" />
                      {isFetchingOnlineMetadata ? 'Searchingâ€¦' : 'Find Metadata Online'}
                    </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={8}>
                      Try fetching cleaner metadata from Crossref or Semantic Scholar.
                    </TooltipContent>
                  </Tooltip>
                </div>
                {documentMetadataWriteLockMessage ? (
                  <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    {documentMetadataWriteLockMessage}
                  </div>
                ) : null}
                <div className="mb-4 rounded-lg border border-border">
                  <Collapsible open={bibtexExpanded} onOpenChange={setBibtexExpanded}>
                    <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                      <div>
                        <p className="text-sm font-medium">Paste BibTeX</p>
                        <p className="mt-1 text-xs text-muted-foreground">Import a manual metadata candidate from a BibTeX entry.</p>
                      </div>
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${bibtexExpanded ? 'rotate-180' : ''}`} />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="border-t border-border px-4 py-4">
                        <Textarea
                          className="min-h-32 font-mono text-xs"
                          value={bibtexInput}
                          onChange={(event) => setBibtexInput(event.target.value)}
                          placeholder="@article{key,...}"
                        />
                        <div className="mt-3 flex justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleImportBibtexCandidate}
                            disabled={bibtexInput.trim().length === 0}
                          >
                            Import BibTeX Candidate
                          </Button>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <Label htmlFor="title">Title</Label>
                    <Input id="title" className="mt-1.5" value={title} onChange={(event) => setTitle(event.target.value)} />
                  </div>

                  <div className="md:col-span-2">
                    <Label htmlFor="authors">Authors</Label>
                    <Input
                      id="authors"
                      className="mt-1.5"
                      value={authors}
                      onChange={(event) => setAuthors(event.target.value)}
                      placeholder="Comma-separated author names"
                    />
                  </div>

                  <div>
                    <Label htmlFor="year">Year</Label>
                    <Input id="year" className="mt-1.5" value={year} onChange={(event) => setYear(event.target.value)} />
                  </div>

                  <div>
                    <Label htmlFor="reading-stage">Reading Stage</Label>
                    <Select value={readingStage} onValueChange={(value) => setReadingStage(value as ReadingStage)}>
                      <SelectTrigger id="reading-stage" className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {readingStages.map((stage) => (
                          <SelectItem key={stage.value} value={stage.value}>
                            {stage.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="doi">DOI</Label>
                    <Input
                      id="doi"
                      className={cn(
                        'mt-1.5',
                        metadataDoiSearchFailed && 'border-destructive text-destructive focus-visible:ring-destructive/30',
                      )}
                      value={doi}
                      onChange={(event) => {
                        setDoi(event.target.value)
                        setMetadataDoiSearchFailed(false)
                      }}
                    />
                  </div>

                  <div>
                    <Label htmlFor="isbn">ISBN</Label>
                    <Input id="isbn" className="mt-1.5" value={isbn} onChange={(event) => setIsbn(event.target.value)} />
                  </div>

                  <div>
                    <Label htmlFor="publisher">Publisher</Label>
                    <Input id="publisher" className="mt-1.5" value={publisher} onChange={(event) => setPublisher(event.target.value)} />
                  </div>

                  <div>
                    <Label htmlFor="citation-key">Citation Key</Label>
                    <Input
                      id="citation-key"
                      className="mt-1.5"
                      value={citationKey}
                      onChange={(event) => setCitationKey(event.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Rating</Label>
                    <StarRating rating={rating} onChange={setRating} />
                  </div>

                  <div className="space-y-2">
                    <Label>Favorite</Label>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm"
                      onClick={() => setFavorite((current) => !current)}
                    >
                      <Star className="h-4 w-4" fill={favorite ? 'currentColor' : 'none'} />
                      {favorite ? 'Marked Favorite' : 'Mark Favorite'}
                    </button>
                  </div>

                  <div className="md:col-span-2">
                    <Label htmlFor="abstract">Abstract</Label>
                    <Textarea
                      id="abstract"
                      className="mt-1.5 min-h-40"
                      value={abstract}
                      onChange={(event) => setAbstract(event.target.value)}
                    />
                  </div>

                  {document.documentType === 'physical_book' ? (
                    <div className="md:col-span-2 space-y-3 rounded-2xl border border-border/70 bg-muted/20 p-4">
                      <div className="space-y-1">
                        <Label>Book photo</Label>
                        <p className="text-sm text-muted-foreground">
                          Add or change the physical book cover from this computer or from your phone.
                        </p>
                      </div>

                      {bookCoverPreviewUrl ? (
                        <div className="overflow-hidden rounded-xl border border-border/70 bg-background">
                          <img
                            src={bookCoverPreviewUrl}
                            alt="Book cover preview"
                            className="h-52 w-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border/70 bg-background text-sm text-muted-foreground">
                          No photo selected yet
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" onClick={() => void handleSelectBookCoverFromComputer()}>
                          <ImagePlus className="mr-2 h-4 w-4" />
                          Upload from PC
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void handlePreparePhoneCoverUpload()}
                          disabled={isPreparingBookCoverPhoneUpload}
                        >
                          <Smartphone className="mr-2 h-4 w-4" />
                          {isPreparingBookCoverPhoneUpload ? 'Preparing QR...' : 'Add from phone'}
                        </Button>
                        {coverImagePath ? (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              setCoverImagePath('')
                              setBookCoverPhoneStatus('')
                            }}
                          >
                            Remove photo
                          </Button>
                        ) : null}
                      </div>

                      {bookCoverPhoneStatus ? (
                        <p className="text-sm text-muted-foreground">{bookCoverPhoneStatus}</p>
                      ) : null}

                      {bookCoverPhoneSession ? (
                        <div ref={bookCoverQrSectionRef} className="grid gap-4 rounded-xl border border-border/70 bg-background p-4 md:grid-cols-[220px_minmax(0,1fr)]">
                          <div className="overflow-hidden rounded-lg border border-border/70 bg-white p-2">
                            <img src={bookCoverPhoneSession.qrDataUrl} alt="QR code for phone cover upload" className="h-auto w-full" />
                          </div>
                          <div className="space-y-2">
                            <p className="text-sm font-medium">Scan with your phone</p>
                            <p className="text-sm text-muted-foreground">
                              Keep the desktop app open. Your phone and computer need to be on the same local network.
                            </p>
                            <Input readOnly value={bookCoverPhoneSession.url} className="text-xs" />
                            {bookCoverPhoneSession.urls.length > 1 ? (
                              <div className="space-y-1 rounded-lg border border-border/70 bg-muted/30 p-2">
                                <p className="text-xs font-medium text-foreground/80">Alternate local URLs</p>
                                {bookCoverPhoneSession.urls.slice(1).map((candidateUrl) => (
                                  <Input key={candidateUrl} readOnly value={candidateUrl} className="text-xs" />
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        <Card data-tour-id="documents-tags">
          <Collapsible open={tagsExpanded} onOpenChange={setTagsExpanded}>
            <CardHeader className="gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Tag className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <CardTitle className="min-w-0">
                    {t('documentDetailPage.tagsAndClassification', { count: document.tags.length })}
                  </CardTitle>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 w-9 px-0"
                        onClick={() => void handleRefreshLocalTags()}
                        disabled={isFetchingAiTags || !isDesktopApp}
                      >
                        {isFetchingAiTags ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Search className="h-4 w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={8}>Refresh local tags</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 w-9 px-0"
                        onClick={() => void handleFetchTagsWithAi()}
                        disabled={isFetchingAiTags || !isDesktopApp}
                      >
                        {isFetchingAiTags ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={8}>Fetch tags with AI</TooltipContent>
                  </Tooltip>
                  <CollapsibleTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      aria-label={tagsExpanded ? 'Collapse tags card' : 'Expand tags card'}
                    >
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${tagsExpanded ? 'rotate-180' : ''}`} />
                    </Button>
                  </CollapsibleTrigger>
                </div>
              </div>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="space-y-4">
                {aiTagStatus ? (
                  <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                    {aiTagStatus}
                  </div>
                ) : null}
                <section className="rounded-lg border border-border p-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Tags</Label>
                    <div className="flex flex-wrap gap-2">
                      {document.tags.length > 0 ? (
                        document.tags.map((tag) => (
                          editingTagName === tag ? (
                            <div key={tag} className="flex items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-2 py-1">
                              <Input
                                value={editingTagValue}
                                onChange={(event) => setEditingTagValue(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    event.preventDefault()
                                    void handleSaveEditedTag()
                                  }
                                  if (event.key === 'Escape') {
                                    event.preventDefault()
                                    handleCancelEditTag()
                                  }
                                }}
                                className="h-7 w-44 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-0"
                                autoFocus
                              />
                              <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => void handleSaveEditedTag()}>
                                Save
                              </Button>
                              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={handleCancelEditTag}>
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <TagChip
                              key={tag}
                              name={tag}
                              onClick={() => handleStartEditTag(tag)}
                              removable
                              onRemove={() => void removeDocumentTag(document.id, tag)}
                              className="max-w-[220px]"
                            />
                          )
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">No tags added yet.</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={tagInput}
                        onChange={(event) => setTagInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            void handleAddTag()
                          }
                        }}
                        placeholder="Add a manual tag"
                      />
                      <Button type="button" variant="outline" onClick={() => void handleAddTag()} disabled={!tagInput.trim()}>
                        Add Tag
                      </Button>
                    </div>
                  </div>
                </section>

                <section className="rounded-lg border border-border p-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">
                      {t('documentDetailPage.suggestedTags', { count: document.suggestedTags?.length ?? 0 })}
                    </Label>
                    {document.suggestedTags && document.suggestedTags.length > 0 ? (
                      <div className="space-y-2">
                        {document.suggestedTags.map((tag) => (
                          <div
                            key={tag.name}
                            className={cn(
                              'flex flex-wrap items-center gap-2 rounded-md border border-border p-2 transition-colors',
                              newSuggestedTagNames.includes(tag.name) && 'border-emerald-300/70 bg-emerald-500/[0.06] dark:border-emerald-500/40 dark:bg-emerald-500/[0.10]',
                            )}
                          >
                            <div className="flex items-center gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 shrink-0 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700"
                                onClick={() => void acceptSuggestedTag(document.id, tag.name)}
                                aria-label="Accept suggested tag"
                                title="Accept suggested tag"
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 shrink-0 text-red-600 hover:bg-red-500/10 hover:text-red-700"
                                onClick={() => void rejectSuggestedTag(document.id, tag.name)}
                                aria-label="Discard suggested tag"
                                title="Discard suggested tag"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                            <TagChip name={tag.name} className="max-w-[260px]" />
                            {typeof tag.confidence === 'number' && (
                              <span className="text-xs text-muted-foreground">
                                {Math.round(tag.confidence * 100)}%
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No pending tag suggestions for this document.</p>
                    )}
                  </div>
                </section>

                <section className="rounded-lg border border-border p-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">{t('documentDetailPage.semanticClassification')}</Label>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={classificationStatusTone}>
                            {document.classificationStatus.replaceAll('_', ' ')}
                          </Badge>
                          {document.classification?.model ? (
                            <span className="text-xs text-muted-foreground">{document.classification.model}</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void handleClassifyDocument()}
                              disabled={
                                isClassifyingDocument
                                || classificationMode === 'off'
                                || !documentCanBeClassified
                                || document.classificationStatus === 'processing'
                              }
                            >
                              {isClassifyingDocument || document.classificationStatus === 'processing' ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Search className="h-4 w-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top" sideOffset={8}>
                            {classificationNeedsRefresh
                              ? t('documentDetailPage.classifyLocal')
                              : t('documentDetailPage.reclassifyLocal')}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void handleClassifyDocumentWithAi()}
                              disabled={
                                isClassifyingDocumentWithAi
                                || !documentCanBeClassified
                                || document.classificationStatus === 'processing'
                              }
                            >
                              {isClassifyingDocumentWithAi ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Sparkles className="h-4 w-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top" sideOffset={8}>{t('documentDetailPage.classifyAi')}</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                    {classificationMode === 'off' ? (
                      <p className="text-sm text-muted-foreground">{t('documentDetailPage.classificationDisabled')}</p>
                    ) : null}
                    {!documentCanBeClassified ? (
                      <p className="text-sm text-muted-foreground">{t('documentDetailPage.classificationNeedsText')}</p>
                    ) : null}
                    {classificationStatusMessage ? (
                      <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                        {classificationStatusMessage}
                      </div>
                    ) : null}
                    {document.classification ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{document.classification.category}</span>
                          <span className="text-xs text-muted-foreground">/</span>
                          <span className="text-sm">{document.classification.topic}</span>
                          <span className="text-xs text-muted-foreground">
                            {Math.round(document.classification.confidence * 100)}% confidence
                          </span>
                        </div>
                        {document.classification.matchedKeywords && document.classification.matchedKeywords.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {document.classification.matchedKeywords.map((keyword) => (
                              <TagChip key={keyword} name={keyword} className="max-w-[260px]" />
                            ))}
                          </div>
                        ) : null}
                        {document.classification.suggestedTags && document.classification.suggestedTags.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {document.classification.suggestedTags.map((tag) => (
                              <TagChip key={tag.name} name={tag.name} />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">{t('documentDetailPage.noClassificationSaved')}</p>
                    )}
                  </div>
                </section>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        <Card data-tour-id="documents-references">
          <Collapsible open={linksExpanded} onOpenChange={setLinksExpanded}>
            <CardHeader className="gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <CardTitle className="min-w-0">
                    {t('documentDetailPage.referencesAndCitations', {
                      outgoing: relationItems.outgoing.length + doiReferenceBuckets.matched.length + doiReferenceBuckets.unmatched.length,
                      incoming: relationItems.incoming.length + incomingDoiMatches.length,
                    })}
                  </CardTitle>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => void handleFindReferences()} disabled={isFindingReferences}>
                    {isFindingReferences ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Finding...
                      </>
                    ) : (
                      t('documentDetailPage.findReferences')
                    )}
                  </Button>
                  <CollapsibleTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      aria-label={linksExpanded ? 'Collapse references card' : 'Expand references card'}
                    >
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${linksExpanded ? 'rotate-180' : ''}`} />
                    </Button>
                  </CollapsibleTrigger>
                </div>
              </div>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="space-y-4">
                {doiReferenceStatus ? (
                  <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                    {doiReferenceStatus}
                  </div>
                ) : null}
                {renderRelationList(
                  'Makes reference to',
                  relationItems.outgoing,
                  'outbound',
                )}
                {renderRelationList(
                  'Is referenced by',
                  relationItems.incoming,
                  'inbound',
                )}
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
          </div>
        </div>
      </div>

      <Dialog open={isMetadataDialogOpen} onOpenChange={setIsMetadataDialogOpen}>
        <DialogContent className="right-4 left-auto top-1/2 max-h-[calc(100vh-2rem)] w-[min(520px,calc(100vw-2rem))] max-w-none translate-x-0 overflow-hidden rounded-[28px]">
          <DialogHeader>
            <DialogTitle>Find Metadata Online</DialogTitle>
            <DialogDescription>Search and apply metadata candidates from your selected providers.</DialogDescription>
          </DialogHeader>

          <div className="h-[calc(100vh-13rem)] min-h-[360px] overflow-y-auto pr-1">
            <div className="space-y-4">
              {documentMetadataWriteLockMessage ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {documentMetadataWriteLockMessage}
                </div>
              ) : null}
              <div className="rounded-lg border border-border p-4">
                <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
                  <div className="space-y-2">
                    <Label>Search by</Label>
                    <Select
                      value={metadataSearchField}
                      onValueChange={(value) => {
                        const nextField = value as 'title' | 'doi' | 'title_author'
                        setMetadataSearchField(nextField)
                        setMetadataSearchValue(nextField === 'doi' ? doi.trim() : title.trim())
                        setMetadataSearchAuthorValue(authors.split(',').map((entry) => entry.trim()).filter(Boolean)[0] ?? '')
                        setMetadataDoiSearchFailed(false)
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="title_author">Title & Author</SelectItem>
                        <SelectItem value="title">Title</SelectItem>
                        <SelectItem value="doi">DOI</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>{metadataSearchField === 'doi' ? 'DOI query' : 'Title query'}</Label>
                      <Input
                        className={cn(
                          metadataSearchField === 'doi'
                          && metadataDoiSearchFailed
                          && 'border-destructive text-destructive focus-visible:ring-destructive/30',
                        )}
                        value={metadataSearchValue}
                        onChange={(event) => {
                          setMetadataSearchValue(event.target.value)
                          if (metadataSearchField === 'doi') {
                            setMetadataDoiSearchFailed(false)
                          }
                        }}
                        placeholder={metadataSearchField === 'doi' ? '10.xxxx/...' : 'Document title'}
                      />
                    </div>
                    {metadataSearchField === 'title_author' ? (
                      <div className="space-y-2">
                        <Label>Author query</Label>
                        <Input
                          value={metadataSearchAuthorValue}
                          onChange={(event) => setMetadataSearchAuthorValue(event.target.value)}
                          placeholder="Optional author name"
                        />
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <Label>Providers</Label>
                  <div className="flex flex-wrap gap-2">
                    {([
                      ['semantic_scholar', 'Semantic Scholar'],
                      ['openalex', 'OpenAlex'],
                      ['crossref', 'Crossref'],
                    ] as Array<[MetadataCandidateProvider, string]>).map(([provider, label]) => (
                      <Button
                        key={provider}
                        type="button"
                        variant={metadataProviders.includes(provider) ? 'secondary' : 'outline'}
                        size="sm"
                        aria-pressed={metadataProviders.includes(provider)}
                        className={cn(
                          'rounded-full',
                          metadataProviders.includes(provider) && 'border border-primary/25 shadow-[0_8px_20px_color-mix(in_oklab,var(--accent)_24%,transparent)]',
                        )}
                        onClick={() => toggleMetadataProvider(provider)}
                      >
                        {metadataProviders.includes(provider) ? <Check className="h-3.5 w-3.5" /> : null}
                        {label}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Results are prioritized as Semantic Scholar, OpenAlex, then Crossref.
                  </p>
                </div>

                <div className="mt-4 flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void runMetadataCandidateSearch()}
                    disabled={
                      isFetchingOnlineMetadata
                      || metadataProviders.length === 0
                      || (
                        metadataSearchField === 'doi'
                          ? metadataSearchValue.trim().length === 0
                          : metadataSearchValue.trim().length === 0 && metadataSearchAuthorValue.trim().length === 0
                      )
                    }
                  >
                    <Globe className="mr-2 h-4 w-4" />
                    {isFetchingOnlineMetadata ? 'Searching…' : 'Search Metadata'}
                  </Button>
                </div>
              </div>

              {isFetchingOnlineMetadata ? (
                <div className="flex items-center justify-center rounded-lg border border-dashed border-border px-4 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : metadataCandidates.length > 0 ? (
                metadataCandidates.map((candidate) => (
                  <div
                    key={candidate.id}
                    className={cn(
                      'rounded-lg border px-4 py-4 transition-colors',
                      selectedMetadataCandidateId === candidate.id ? 'border-primary bg-primary/5' : 'border-border',
                    )}
                  >
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => setSelectedMetadataCandidateId(candidate.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">
                          {candidate.source === 'semantic_scholar'
                            ? 'Semantic Scholar'
                            : candidate.source === 'openalex'
                              ? 'OpenAlex'
                              : candidate.source === 'crossref'
                                ? 'Crossref'
                                : 'BibTeX'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {candidate.matchedBy === 'doi' ? 'DOI match' : 'Title match'}
                        </span>
                      </div>
                      <p className="mt-2 break-words text-sm font-medium leading-5">{candidate.title || 'Untitled result'}</p>
                      <p className="mt-1 break-words text-xs text-muted-foreground">
                        {candidate.authors.join(', ') || 'Unknown author'}
                        {candidate.year ? ` • ${candidate.year}` : ''}
                        {candidate.doi ? ` • ${candidate.doi}` : ''}
                      </p>
                    </button>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void handleApplyMetadataCandidate('fill_missing', candidate)}
                        disabled={isApplyingMetadataCandidate || !canWriteDocumentMetadata}
                        title={!canWriteDocumentMetadata ? documentMetadataWriteLockMessage : undefined}
                      >
                        {isApplyingMetadataCandidate && selectedMetadataCandidateId === candidate.id ? 'Applying…' : 'Fill Missing Fields'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void handleApplyMetadataCandidate('replace_unlocked', candidate)}
                        disabled={isApplyingMetadataCandidate || !canWriteDocumentMetadata}
                        title={!canWriteDocumentMetadata ? documentMetadataWriteLockMessage : undefined}
                      >
                        {isApplyingMetadataCandidate && selectedMetadataCandidateId === candidate.id ? 'Applying…' : 'Apply Candidate'}
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                  {metadataDialogError || 'No metadata candidates yet.'}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMetadataDialogOpen(false)} disabled={isApplyingMetadataCandidate}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function DocumentDetailPage() {
  const params = useSearchParams()
  const id = params.get('id')
  const metadataMode = params.get('metadata')
  const autoSearchMetadata = params.get('autoSearchMetadata') === '1'
  const returnTo = params.get('returnTo')

  if (!id) {
    return <div className="p-6">Missing document id.</div>
  }

  return (
    <RealDocumentDetailPage
      id={id}
      metadataMode={metadataMode}
      autoSearchMetadata={autoSearchMetadata}
      returnTo={returnTo}
    />
  )
}
