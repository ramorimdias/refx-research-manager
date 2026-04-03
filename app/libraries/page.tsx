'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Search,
  Grid3X3,
  List,
  Table2,
  SortAsc,
  SortDesc,
  Upload,
  FolderOpen,
  Pencil,
  Plus,
  Trash2,
  Filter,
  PanelLeftClose,
  PanelLeftOpen,
  BookMarked,
  Smartphone,
  ImagePlus,
  CopyX,
} from 'lucide-react'
import * as QRCode from 'qrcode'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { deriveMetadataStatus, serializeMetadataProvenance, serializeMetadataUserEditedFields } from '@/lib/services/document-metadata-service'
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
import { DocumentTable, DocumentTableColumnControls } from '@/components/refx/document-table'
import { FilterPanel } from '@/components/refx/filter-panel'
import { DocumentCard } from '@/components/refx/document-card'
import { useDocumentViewFlags } from '@/lib/hooks/use-document-view-flags'
import type { Document, SortField, ViewMode } from '@/lib/types'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import * as repo from '@/lib/repositories/local-db'
import type { ImportProgressUpdate } from '@/lib/services/desktop-service'
import { convertFileSrc, open as openFileDialog, stat } from '@/lib/tauri/client'
import { useT } from '@/lib/localization'
import { useDocumentActions, useDocumentStore } from '@/lib/stores/document-store'
import { useFilteredDocuments } from '@/lib/stores/document-selectors'
import { useLibraryActions, useLibraryStore } from '@/lib/stores/library-store'
import { useRuntimeState } from '@/lib/stores/runtime-store'
import { useUiStore } from '@/lib/stores/ui-store'

type LibraryFormState = {
  name: string
  description: string
  color: string
}

type PhysicalBookFormState = {
  title: string
  authors: string
  year: string
  publisher: string
  isbn: string
  description: string
  coverImagePath?: string
}

const LIBRARY_COLOR_OPTIONS = [
  '#3b82f6',
  '#2563eb',
  '#0f766e',
  '#10b981',
  '#65a30d',
  '#f59e0b',
  '#f97316',
  '#ef4444',
  '#db2777',
  '#7c3aed',
] as const

const DEFAULT_LIBRARY_FORM: LibraryFormState = {
  name: '',
  description: '',
  color: LIBRARY_COLOR_OPTIONS[0],
}

const DEFAULT_PHYSICAL_BOOK_FORM: PhysicalBookFormState = {
  title: '',
  authors: '',
  year: '',
  publisher: '',
  isbn: '',
  description: '',
  coverImagePath: undefined,
}

type BookCoverPhoneSession = {
  token: string
  url: string
  urls: string[]
  qrDataUrl: string
}

type DuplicateReason = 'doi' | 'filename' | 'fileSize'

type DuplicateGroup = {
  id: string
  reason: DuplicateReason
  signature: string
  documents: Document[]
}

const DOCUMENTS_PER_PAGE = 20
const PENDING_IMPORT_STORAGE_KEY = 'refx.pending-import-paths'

function buildPaginationItems(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, 'ellipsis', totalPages]
  }

  if (currentPage >= totalPages - 3) {
    return [1, 'ellipsis', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
  }

  return [1, 'ellipsis', currentPage - 1, currentPage, currentPage + 1, 'ellipsis', totalPages]
}

function fileNameFromPath(path?: string) {
  if (!path) return ''
  return path.split(/[\\/]/).pop() ?? path
}

const SORT_FIELD_LABELS: Record<SortField, string> = {
  addedAt: 'sortAdded',
  lastOpenedAt: 'sortOpened',
  title: 'sortTitle',
  authors: 'sortAuthors',
  year: 'sortYear',
  rating: 'sortRating',
}

function buildDuplicateGroups(
  documents: Document[],
  reason: DuplicateReason,
  resolveKey: (document: Document) => string | null,
) {
  const grouped = new Map<string, Document[]>()

  for (const document of documents) {
    const key = resolveKey(document)
    if (!key) continue
    const existing = grouped.get(key)
    if (existing) {
      existing.push(document)
    } else {
      grouped.set(key, [document])
    }
  }

  return Array.from(grouped.entries())
    .filter(([, groupedDocuments]) => groupedDocuments.length > 1)
    .map(([signature, groupedDocuments]) => ({
      id: `${reason}:${signature}`,
      reason,
      signature,
      documents: groupedDocuments.slice().sort((left, right) => left.title.localeCompare(right.title)),
    }))
}

async function findLibraryDuplicateGroups(documents: Document[], isDesktopApp: boolean) {
  const groups: DuplicateGroup[] = []

  groups.push(
    ...buildDuplicateGroups(documents, 'doi', (document) => {
      const doi = document.doi?.trim().toLowerCase()
      return doi && doi.length > 0 ? doi : null
    }),
  )

  groups.push(
    ...buildDuplicateGroups(documents, 'filename', (document) => {
      const fileName = fileNameFromPath(document.filePath).trim().toLowerCase()
      return fileName.length > 0 ? fileName : null
    }),
  )

  if (isDesktopApp) {
    const sizeEntries = await Promise.all(
      documents.map(async (document) => {
        if (!document.filePath) return null

        try {
          const fileInfo = await stat(document.filePath)
          const fileSize = typeof fileInfo.size === 'number' ? fileInfo.size : null
          if (!fileSize || fileSize <= 0) return null
          return { document, fileSize }
        } catch {
          return null
        }
      }),
    )

    const fileSizeMap = new Map<number, Document[]>()
    for (const entry of sizeEntries) {
      if (!entry) continue
      const existing = fileSizeMap.get(entry.fileSize)
      if (existing) {
        existing.push(entry.document)
      } else {
        fileSizeMap.set(entry.fileSize, [entry.document])
      }
    }

    groups.push(
      ...Array.from(fileSizeMap.entries())
        .filter(([, groupedDocuments]) => groupedDocuments.length > 1)
        .map(([fileSize, groupedDocuments]) => ({
          id: `fileSize:${fileSize}`,
          reason: 'fileSize' as const,
          signature: String(fileSize),
          documents: groupedDocuments.slice().sort((left, right) => left.title.localeCompare(right.title)),
        })),
    )
  }

  return groups.sort((left, right) => left.reason.localeCompare(right.reason) || left.signature.localeCompare(right.signature))
}

function duplicateDocumentScore(document: Document) {
  return [
    document.hasExtractedText ? 1 : 0,
    document.hasOcr ? 1 : 0,
    document.favorite ? 1 : 0,
    document.notesCount,
    document.commentCount,
    document.tags.length,
    document.authors.length,
    document.abstract ? 1 : 0,
    document.doi ? 1 : 0,
    document.year ? 1 : 0,
    document.rating,
    document.lastOpenedAt?.getTime() ?? 0,
    document.addedAt.getTime(),
  ].reduce((sum, value) => sum + value, 0)
}

function choosePrimaryDuplicateDocument(documents: Document[]) {
  return documents
    .slice()
    .sort((left, right) => {
      const scoreDifference = duplicateDocumentScore(right) - duplicateDocumentScore(left)
      if (scoreDifference !== 0) return scoreDifference
      return left.title.localeCompare(right.title)
    })[0]
}

export default function LibrariesPage() {
  const t = useT()
  const activeLibraryId = useLibraryStore((state) => state.activeLibraryId)
  const libraries = useLibraryStore((state) => state.libraries)
  const storedDocuments = useDocumentStore((state) => state.documents)
  const currentPage = useUiStore((state) => state.currentPage)
  const setCurrentPage = useUiStore((state) => state.setCurrentPage)
  const viewMode = useUiStore((state) => state.viewMode)
  const setViewMode = useUiStore((state) => state.setViewMode)
  const sort = useUiStore((state) => state.sort)
  const setSort = useUiStore((state) => state.setSort)
  const filters = useUiStore((state) => state.filters)
  const setFilters = useUiStore((state) => state.setFilters)
  const { isDesktopApp, refreshData } = useRuntimeState()
  const { setActiveLibrary, createLibrary, updateLibrary, deleteLibrary, loadLibraryDocuments } = useLibraryActions()
  const { importDocuments } = useDocumentActions()
  const documents = useFilteredDocuments()
  const [isImporting, setIsImporting] = useState(false)
  const [filtersCollapsed, setFiltersCollapsed] = useState(true)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isPhysicalBookDialogOpen, setIsPhysicalBookDialogOpen] = useState(false)
  const [isSavingLibrary, setIsSavingLibrary] = useState(false)
  const [libraryForm, setLibraryForm] = useState<LibraryFormState>(DEFAULT_LIBRARY_FORM)
  const [physicalBookForm, setPhysicalBookForm] = useState<PhysicalBookFormState>(DEFAULT_PHYSICAL_BOOK_FORM)
  const [deleteLibraryConfirmation, setDeleteLibraryConfirmation] = useState('')
  const [pendingImportCount, setPendingImportCount] = useState<number | null>(null)
  const [importProgress, setImportProgress] = useState<ImportProgressUpdate | null>(null)
  const [bookCoverPhoneSession, setBookCoverPhoneSession] = useState<BookCoverPhoneSession | null>(null)
  const [isPreparingBookCoverPhoneUpload, setIsPreparingBookCoverPhoneUpload] = useState(false)
  const [bookCoverPhoneStatus, setBookCoverPhoneStatus] = useState<string>('')
  const [isDuplicateDialogOpen, setIsDuplicateDialogOpen] = useState(false)
  const [isScanningDuplicates, setIsScanningDuplicates] = useState(false)
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([])
  const [duplicateScanError, setDuplicateScanError] = useState<string>('')
  const [mergingDuplicateGroupId, setMergingDuplicateGroupId] = useState<string | null>(null)
  const bookCoverQrSectionRef = useRef<HTMLDivElement | null>(null)

  const activeLibrary = libraries.find((lib) => lib.id === activeLibraryId)
  const visibleLibraryDocuments = useMemo(
    () => documents.filter((document) => document.documentType !== 'my_work'),
    [documents],
  )
  const activeLibraryDocuments = useMemo(
    () => (
      activeLibrary
        ? storedDocuments.filter((document) => document.libraryId === activeLibrary.id && document.documentType !== 'my_work')
        : []
    ),
    [activeLibrary, storedDocuments],
  )
  const paginationSessionKey = JSON.stringify({
    activeLibraryId,
    filters,
    sort,
  })
  const totalPages = Math.max(1, Math.ceil(visibleLibraryDocuments.length / DOCUMENTS_PER_PAGE))
  const paginatedDocuments = visibleLibraryDocuments.slice(
    (currentPage - 1) * DOCUMENTS_PER_PAGE,
    currentPage * DOCUMENTS_PER_PAGE,
  )
  const documentFlagsById = useDocumentViewFlags({
    currentPage,
    documentIds: paginatedDocuments.map((document) => document.id),
    sessionKey: paginationSessionKey,
  })
  const activeFilterCount = [
    filters.tags?.length || 0,
    filters.readingStage?.length || 0,
    filters.metadataStatus?.length || 0,
    filters.favorite ? 1 : 0,
    filters.hasComments ? 1 : 0,
    filters.hasNotes ? 1 : 0,
  ].reduce((sum, count) => sum + count, 0)

  useEffect(() => {
    void loadLibraryDocuments(activeLibraryId)
  }, [activeLibraryId, loadLibraryDocuments])

  useEffect(() => {
    if (!activeLibraryId && libraries.length > 0) {
      setActiveLibrary(libraries[0]?.id ?? null)
      return
    }

    if (activeLibraryId && libraries.every((library) => library.id !== activeLibraryId)) {
      setActiveLibrary(libraries[0]?.id ?? null)
    }
  }, [activeLibraryId, libraries, setActiveLibrary])

  useEffect(() => {
    setCurrentPage(1)
  }, [paginationSessionKey, setCurrentPage])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, setCurrentPage, totalPages])

  useEffect(() => {
    const stored = window.sessionStorage.getItem('refx-libraries-filters-collapsed')
    if (stored !== null) {
      setFiltersCollapsed(stored === 'true')
    }
  }, [])

  useEffect(() => {
    window.sessionStorage.setItem('refx-libraries-filters-collapsed', String(filtersCollapsed))
  }, [filtersCollapsed])

  useEffect(() => {
    const consumePendingImports = () => {
      if (typeof window === 'undefined') return
      const raw = window.sessionStorage.getItem(PENDING_IMPORT_STORAGE_KEY)
      if (!raw) return

      try {
        const parsed = JSON.parse(raw)
        const droppedPaths = Array.isArray(parsed)
          ? parsed.filter((value): value is string => typeof value === 'string' && value.toLowerCase().endsWith('.pdf'))
          : []

        if (droppedPaths.length > 0) {
          window.sessionStorage.removeItem(PENDING_IMPORT_STORAGE_KEY)
          void handleImport(droppedPaths)
        }
      } catch {
        window.sessionStorage.removeItem(PENDING_IMPORT_STORAGE_KEY)
      }
    }

    consumePendingImports()
    window.addEventListener('refx-import-drop-queued', consumePendingImports)
    return () => {
      window.removeEventListener('refx-import-drop-queued', consumePendingImports)
    }
  }, [isDesktopApp, activeLibraryId, isImporting])

  const handleImport = async (paths?: string[]) => {
    if (!isDesktopApp || isImporting) return
    setIsImporting(true)
    setPendingImportCount(paths?.length ?? null)
    setImportProgress(null)
    try {
      await importDocuments(paths, (update) => {
        setImportProgress(update)
      })
    } finally {
      setIsImporting(false)
      setPendingImportCount(null)
      setImportProgress(null)
    }
  }

  const resetLibraryForm = () => {
    setLibraryForm(DEFAULT_LIBRARY_FORM)
  }

  const resetPhysicalBookForm = () => {
    setPhysicalBookForm(DEFAULT_PHYSICAL_BOOK_FORM)
    setBookCoverPhoneSession(null)
    setBookCoverPhoneStatus('')
  }

  const openCreateDialog = () => {
    resetLibraryForm()
    setIsCreateDialogOpen(true)
  }

  const openPhysicalBookDialog = () => {
    resetPhysicalBookForm()
    setIsPhysicalBookDialogOpen(true)
  }

  const openRenameDialog = () => {
    if (!activeLibrary) return
    setLibraryForm({
      name: activeLibrary.name,
      description: activeLibrary.description,
      color: activeLibrary.color,
    })
    setIsRenameDialogOpen(true)
  }

  const getDocumentOpenHref = (document: Document) =>
    document.documentType === 'my_work'
      ? `/documents?id=${document.id}`
      : document.documentType === 'physical_book'
        ? `/books/notes?id=${document.id}`
        : `/reader/view?id=${document.id}`

  const formatDuplicateReason = (reason: DuplicateReason) => {
    switch (reason) {
      case 'doi':
        return t('libraries.duplicateDoi')
      case 'filename':
        return t('libraries.duplicateFilename')
      case 'fileSize':
        return t('libraries.duplicateFileSize')
      default:
        return reason
    }
  }

  const formatDuplicateSignature = (group: DuplicateGroup) => {
    if (group.reason === 'fileSize') {
      const bytes = Number(group.signature)
      return t('libraries.duplicateFileSizeValue', { size: Number.isFinite(bytes) ? bytes.toLocaleString() : group.signature })
    }
    return group.signature
  }

  const openDuplicateDialog = async (documentsOverride?: Document[]) => {
    if (!activeLibrary) return

    setIsDuplicateDialogOpen(true)
    setIsScanningDuplicates(true)
    setDuplicateScanError('')
    try {
      const groups = await findLibraryDuplicateGroups(documentsOverride ?? activeLibraryDocuments, isDesktopApp)
      setDuplicateGroups(groups)
    } catch (error) {
      console.error('Failed to scan library duplicates:', error)
      setDuplicateGroups([])
      setDuplicateScanError(t('libraries.duplicateScanFailed'))
    } finally {
      setIsScanningDuplicates(false)
    }
  }

  const handleMergeDuplicateGroup = async (group: DuplicateGroup) => {
    if (!activeLibrary) return

    const primaryDocument = choosePrimaryDuplicateDocument(group.documents)
    const duplicateDocumentIds = group.documents
      .filter((document) => document.id !== primaryDocument.id)
      .map((document) => document.id)
    const activeLibraryIdForScan = activeLibrary.id

    if (duplicateDocumentIds.length === 0) return

    setMergingDuplicateGroupId(group.id)
    try {
      await repo.mergeDocuments({
        primaryDocumentId: primaryDocument.id,
        duplicateDocumentIds,
      })
      await refreshData()
      const refreshedLibraryDocuments = useDocumentStore.getState().documents.filter(
        (document) => document.libraryId === activeLibraryIdForScan,
      )
      await openDuplicateDialog(refreshedLibraryDocuments)
    } finally {
      setMergingDuplicateGroupId(null)
    }
  }

  const handleCreateLibrary = async () => {
    const name = libraryForm.name.trim()
    if (!name) return

    setIsSavingLibrary(true)
    try {
      await createLibrary({
        name,
        description: libraryForm.description.trim(),
        color: libraryForm.color,
      })
      setIsCreateDialogOpen(false)
      resetLibraryForm()
    } finally {
      setIsSavingLibrary(false)
    }
  }

  const handleRenameLibrary = async () => {
    if (!activeLibrary) return
    const name = libraryForm.name.trim()
    if (!name) return

    setIsSavingLibrary(true)
    try {
      await updateLibrary(activeLibrary.id, {
        name,
        description: libraryForm.description.trim(),
        color: libraryForm.color,
      })
      setIsRenameDialogOpen(false)
      resetLibraryForm()
    } finally {
      setIsSavingLibrary(false)
    }
  }

  const handleDeleteLibrary = async () => {
    if (!activeLibrary) return

    setIsSavingLibrary(true)
    try {
      await deleteLibrary(activeLibrary.id)
      setDeleteLibraryConfirmation('')
      setIsRenameDialogOpen(false)
      setIsDeleteDialogOpen(false)
    } finally {
      setIsSavingLibrary(false)
    }
  }

  const handleSortFieldSelect = (field: SortField) => {
    setSort({
      field,
      direction:
        sort.field === field
          ? (sort.direction === 'asc' ? 'desc' : 'asc')
          : sort.direction,
    })
  }

  const handleCreatePhysicalBook = async () => {
    const title = physicalBookForm.title.trim()
    const libraryId = activeLibraryId ?? libraries[0]?.id
    if (!title || !libraryId) return

    setIsSavingLibrary(true)
    try {
      const authors = physicalBookForm.authors
        .split(',')
        .map((author) => author.trim())
        .filter(Boolean)
      const year = physicalBookForm.year ? Number(physicalBookForm.year) : undefined
      const publisher = physicalBookForm.publisher.trim() || undefined
      const isbn = physicalBookForm.isbn.trim() || undefined
      const abstractText = physicalBookForm.description.trim() || undefined
      const extractedAt = new Date()

      await repo.createDocument({
        libraryId,
        documentType: 'physical_book',
        title,
        authors: JSON.stringify(authors),
        year,
        publisher,
        isbn,
        abstractText,
        metadataStatus: deriveMetadataStatus({
          title,
          authors,
          year,
        }),
        metadataProvenance: serializeMetadataProvenance({
          title: { source: 'user', extractedAt, confidence: 1, detail: 'Created manually as a local physical book record.' },
          ...(authors.length > 0 ? { authors: { source: 'user', extractedAt, confidence: 1, detail: 'Created manually as a local physical book record.' } } : {}),
          ...(year ? { year: { source: 'user', extractedAt, confidence: 1, detail: 'Created manually as a local physical book record.' } } : {}),
        }),
        metadataUserEditedFields: serializeMetadataUserEditedFields({
          title: true,
          authors: authors.length > 0 || physicalBookForm.authors.trim().length > 0,
          year: Boolean(year),
          publisher: Boolean(publisher),
          isbn: Boolean(isbn),
          abstract: Boolean(abstractText),
        }),
        coverImagePath: physicalBookForm.coverImagePath,
        textExtractionStatus: 'skipped',
        ocrStatus: 'not_needed',
        indexingStatus: 'skipped',
        tagSuggestionStatus: 'pending',
        classificationStatus: 'pending',
      })
      await refreshData()
      setIsPhysicalBookDialogOpen(false)
      resetPhysicalBookForm()
    } finally {
      setIsSavingLibrary(false)
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
    setPhysicalBookForm((state) => ({ ...state, coverImagePath: importedCoverPath }))
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
    if (!isPhysicalBookDialogOpen || !bookCoverPhoneSession?.token) return

    const interval = window.setInterval(() => {
      void repo.getBookCoverUploadSessionStatus(bookCoverPhoneSession.token).then((status) => {
        if (status.status === 'completed' && status.imagePath) {
          setPhysicalBookForm((state) => ({ ...state, coverImagePath: status.imagePath }))
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
  }, [bookCoverPhoneSession?.token, isPhysicalBookDialogOpen])

  useEffect(() => {
    if (!isPhysicalBookDialogOpen || !bookCoverPhoneSession) return

    const timeoutId = window.setTimeout(() => {
      bookCoverQrSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      })
    }, 80)

    return () => window.clearTimeout(timeoutId)
  }, [bookCoverPhoneSession, isPhysicalBookDialogOpen])

  const physicalBookCoverPreviewUrl = physicalBookForm.coverImagePath
    ? isDesktopApp
      ? convertFileSrc(physicalBookForm.coverImagePath)
      : physicalBookForm.coverImagePath
    : ''

  return (
    <>
      <div className="flex h-full bg-muted/65">
        {!filtersCollapsed && <FilterPanel />}

        <div className="flex-1 flex min-w-0 flex-col bg-transparent">
          <div className="flex items-center justify-between gap-4 border-b border-transparent bg-muted/65 px-5 py-4 backdrop-blur">
            <div className="flex items-center gap-4 flex-1">
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => setFiltersCollapsed((current) => !current)}>
                {filtersCollapsed ? <PanelLeftOpen className="mr-2 h-4 w-4" /> : <PanelLeftClose className="mr-2 h-4 w-4" />}
                {t('libraries.filters')}
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-2 h-5 px-1.5">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>

              <Select
                value={activeLibraryId || libraries[0]?.id || ''}
                onValueChange={(val) => setActiveLibrary(val)}
              >
                <SelectTrigger className="w-60 border-transparent bg-card/90 shadow-sm">
                  <SelectValue placeholder={activeLibrary?.name ?? libraries[0]?.name ?? ''} />
                </SelectTrigger>
                <SelectContent>
                  {libraries.map((lib) => (
                    <SelectItem key={lib.id} value={lib.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: lib.color }}
                        />
                        {lib.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t('libraries.search')}
                  className="pl-9"
                  value={filters.search || ''}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value || undefined })}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="rounded-full" onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                {t('libraries.library')}
              </Button>
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => void handleImport()} disabled={!isDesktopApp || isImporting}>
                <Upload className="mr-2 h-4 w-4" />
                {isImporting ? t('libraries.importing') : t('libraries.import')}
              </Button>
              <Button variant="outline" size="sm" className="rounded-full" onClick={openPhysicalBookDialog}>
                <BookMarked className="mr-2 h-4 w-4" />
                {t('libraries.book')}
              </Button>

              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
                <TabsList>
                  <TabsTrigger value="table">
                    <Table2 className="h-4 w-4" />
                  </TabsTrigger>
                  <TabsTrigger value="grid">
                    <Grid3X3 className="h-4 w-4" />
                  </TabsTrigger>
                  <TabsTrigger value="list">
                    <List className="h-4 w-4" />
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>

          {filtersCollapsed && activeFilterCount > 0 && (
            <div className="border-b border-transparent bg-card/75 px-5 py-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Filter className="h-4 w-4" />
                <span>{t('libraries.activeFilters', { count: activeFilterCount, suffix: activeFilterCount > 1 ? 's' : '' })}</span>
              </div>
            </div>
          )}

          {activeLibrary && (
            <div className="flex items-center justify-between border-0 !bg-transparent px-5 py-3 shadow-none">
              <div className="flex items-center gap-3">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: activeLibrary.color }}
                />
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">{activeLibrary.name}</h2>
                  <p className="text-sm text-muted-foreground">{activeLibrary.description || t('libraries.localLibrary')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{t('libraries.documentsCount', { count: visibleLibraryDocuments.length })}</Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 min-w-[11rem] max-w-[16rem] justify-start rounded-full">
                      {sort.direction === 'asc' ? (
                        <SortDesc className="mr-2 h-4 w-4 shrink-0" />
                      ) : (
                        <SortAsc className="mr-2 h-4 w-4 shrink-0" />
                      )}
                      <span className="truncate">{t(`libraries.${SORT_FIELD_LABELS[sort.field]}`)}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    {(Object.entries(SORT_FIELD_LABELS) as Array<[SortField, keyof typeof SORT_FIELD_LABELS]>).map(([field, labelKey]) => (
                      <DropdownMenuItem
                        key={field}
                        onClick={() => handleSortFieldSelect(field)}
                        className="flex items-center justify-between gap-3"
                      >
                        <span>{t(`libraries.${labelKey}`)}</span>
                        {sort.field === field ? (
                          sort.direction === 'asc' ? (
                            <SortDesc className="h-4 w-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <SortAsc className="h-4 w-4 shrink-0 text-muted-foreground" />
                          )
                        ) : null}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                {viewMode === 'table' ? <DocumentTableColumnControls /> : null}
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => void openDuplicateDialog()}>
                  <CopyX className="mr-2 h-4 w-4" />
                  {t('libraries.deduplicate')}
                </Button>
                <Button variant="outline" size="sm" className="rounded-full" onClick={openRenameDialog}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              </div>
            </div>
          )}

          <div
            className={cn(
              'relative flex-1 overflow-x-auto overflow-y-scroll px-5 pb-0 pt-5 transition-colors',
              isImporting && 'bg-muted/20',
            )}
            style={{ scrollbarGutter: 'stable' }}
          >
            {isImporting && (
              <div className="absolute inset-x-5 top-5 z-10 flex items-start justify-center">
                <div className="w-full max-w-xl rounded-2xl border border-transparent bg-card/95 px-4 py-3 shadow-lg backdrop-blur">
                  <div className="flex items-center gap-3">
                    <Spinner className="size-4" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium">{t('libraries.importDocuments')}</span>
                        <span className="text-muted-foreground">
                          {importProgress?.current ?? 0}/{importProgress?.total ?? pendingImportCount ?? 0}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{
                            width: `${Math.max(
                              8,
                              Math.round(
                                (((importProgress?.current ?? 0) / Math.max(importProgress?.total ?? pendingImportCount ?? 1, 1)) * 100),
                              ),
                            )}%`,
                          }}
                        />
                      </div>
                      <p className="mt-2 truncate text-sm text-foreground/85">
                        {fileNameFromPath(importProgress?.currentFile) || 'Preparing import...'}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {importProgress?.error ?? importProgress?.detail ?? 'Preparing document import...'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div className="flex min-h-full flex-col">
              <div className="flex-1">
                {visibleLibraryDocuments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/70">
                      <FolderOpen className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="mb-2 text-lg font-semibold">{t('libraries.noDocuments')}</h3>
                    <p className="mb-6 max-w-sm text-sm text-muted-foreground">
                      {filters.search || Object.keys(filters).length > 1
                        ? t('libraries.noDocumentsFiltered')
                        : t('libraries.noDocumentsEmpty')}
                    </p>
                    <div className="flex gap-2">
                      <Button onClick={() => void handleImport()} disabled={!isDesktopApp || isImporting}>
                        <Upload className="mr-2 h-4 w-4" />
                        {isImporting ? t('libraries.importingPdfs') : t('libraries.importPdfs')}
                      </Button>
                    </div>
                  </div>
                ) : viewMode === 'table' ? (
                  <div className={cn('transition-opacity', isImporting && 'opacity-60')}>
                    <DocumentTable documents={paginatedDocuments} ephemeralFlagsById={documentFlagsById} />
                  </div>
                ) : viewMode === 'grid' ? (
                  <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4', isImporting && 'opacity-60')}>
                    {paginatedDocuments.map((doc) => (
                      <DocumentCard key={doc.id} document={doc} ephemeralFlags={documentFlagsById[doc.id]} />
                    ))}
                  </div>
                ) : (
                  <div className={cn('space-y-2', isImporting && 'opacity-60')}>
                    {paginatedDocuments.map((doc) => (
                      <DocumentCard key={doc.id} document={doc} ephemeralFlags={documentFlagsById[doc.id]} variant="list" />
                    ))}
                  </div>
                )}
              </div>

              {visibleLibraryDocuments.length > 0 && totalPages > 1 && (
                <div className="sticky bottom-0 mt-6 -mx-5 border-t border-transparent bg-muted px-5 py-4">
                <div className="flex flex-col gap-3">
                <div className="text-sm text-muted-foreground">
                  {t('libraries.showingRange', {
                    start: (currentPage - 1) * DOCUMENTS_PER_PAGE + 1,
                    end: Math.min(currentPage * DOCUMENTS_PER_PAGE, visibleLibraryDocuments.length),
                    total: visibleLibraryDocuments.length,
                  })}
                </div>
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(event) => {
                          event.preventDefault()
                          if (currentPage > 1) {
                            setCurrentPage(currentPage - 1)
                          }
                        }}
                        className={cn(currentPage <= 1 && 'pointer-events-none opacity-50')}
                      />
                    </PaginationItem>
                    {buildPaginationItems(currentPage, totalPages).map((item, index) => (
                      item === 'ellipsis' ? (
                        <PaginationItem key={`ellipsis-${index}`}>
                          <PaginationEllipsis />
                        </PaginationItem>
                      ) : (
                        <PaginationItem key={item}>
                          <PaginationLink
                            href="#"
                            isActive={item === currentPage}
                            onClick={(event) => {
                              event.preventDefault()
                              setCurrentPage(item as number)
                            }}
                          >
                            {item}
                          </PaginationLink>
                        </PaginationItem>
                      )
                    ))}
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(event) => {
                          event.preventDefault()
                          if (currentPage < totalPages) {
                            setCurrentPage(currentPage + 1)
                          }
                        }}
                        className={cn(currentPage >= totalPages && 'pointer-events-none opacity-50')}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
                </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Dialog
        open={isPhysicalBookDialogOpen}
        onOpenChange={(open) => {
          setIsPhysicalBookDialogOpen(open)
          if (!open) resetPhysicalBookForm()
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('libraries.registerPhysicalBook')}</DialogTitle>
            <DialogDescription>{t('libraries.registerPhysicalBookDescription')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="physical-book-title">{t('libraries.title')}</Label>
              <Input
                id="physical-book-title"
                value={physicalBookForm.title}
                onChange={(event) => setPhysicalBookForm((state) => ({ ...state, title: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="physical-book-authors">{t('libraries.authors')}</Label>
              <Input
                id="physical-book-authors"
                placeholder={t('libraries.authorsPlaceholder')}
                value={physicalBookForm.authors}
                onChange={(event) => setPhysicalBookForm((state) => ({ ...state, authors: event.target.value }))}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="physical-book-year">{t('libraries.year')}</Label>
                <Input
                  id="physical-book-year"
                  value={physicalBookForm.year}
                  onChange={(event) => setPhysicalBookForm((state) => ({ ...state, year: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="physical-book-isbn">{t('libraries.isbn')}</Label>
                <Input
                  id="physical-book-isbn"
                  value={physicalBookForm.isbn}
                  onChange={(event) => setPhysicalBookForm((state) => ({ ...state, isbn: event.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="physical-book-publisher">{t('libraries.publisher')}</Label>
              <Input
                id="physical-book-publisher"
                value={physicalBookForm.publisher}
                onChange={(event) => setPhysicalBookForm((state) => ({ ...state, publisher: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="physical-book-description">{t('libraries.description')}</Label>
              <Input
                id="physical-book-description"
                value={physicalBookForm.description}
                onChange={(event) => setPhysicalBookForm((state) => ({ ...state, description: event.target.value }))}
                placeholder={t('libraries.descriptionPlaceholder')}
              />
            </div>
            <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/20 p-4">
              <div className="space-y-1">
                <Label>{t('libraries.bookPhoto')}</Label>
                <p className="text-sm text-muted-foreground">
                  {t('libraries.bookPhotoDescription')}
                </p>
              </div>

              {physicalBookCoverPreviewUrl ? (
                <div className="overflow-hidden rounded-xl border border-border/70 bg-background">
                  <img
                    src={physicalBookCoverPreviewUrl}
                    alt="Book cover preview"
                    className="h-48 w-full object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border/70 bg-background text-sm text-muted-foreground">
                  {t('libraries.noPhoto')}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => void handleSelectBookCoverFromComputer()}>
                  <ImagePlus className="mr-2 h-4 w-4" />
                  {t('libraries.uploadFromPc')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handlePreparePhoneCoverUpload()}
                  disabled={isPreparingBookCoverPhoneUpload}
                >
                  <Smartphone className="mr-2 h-4 w-4" />
                  {isPreparingBookCoverPhoneUpload ? t('libraries.preparingQr') : t('libraries.addFromPhone')}
                </Button>
                {physicalBookForm.coverImagePath ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setPhysicalBookForm((state) => ({ ...state, coverImagePath: undefined }))
                      setBookCoverPhoneStatus('')
                    }}
                  >
                    {t('libraries.removePhoto')}
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
                    <p className="text-sm font-medium">{t('libraries.scanWithPhone')}</p>
                    <p className="text-sm text-muted-foreground">
                      {t('libraries.sameNetwork')}
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPhysicalBookDialogOpen(false)}>
              {t('libraries.cancel')}
            </Button>
            <Button onClick={() => void handleCreatePhysicalBook()} disabled={!physicalBookForm.title.trim() || isSavingLibrary}>
              {isSavingLibrary ? t('libraries.registering') : t('libraries.registerBook')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isDuplicateDialogOpen}
        onOpenChange={(open) => {
          setIsDuplicateDialogOpen(open)
          if (!open) {
            setDuplicateScanError('')
          }
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-[96vw] overflow-x-hidden overflow-y-auto xl:max-w-[1400px]">
          <DialogHeader>
            <DialogTitle>{t('libraries.deduplicateDialogTitle')}</DialogTitle>
            <DialogDescription>
              {activeLibrary
                ? t('libraries.deduplicateDialogDescription', { library: activeLibrary.name })
                : t('libraries.deduplicateDialogDescriptionFallback')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {isScanningDuplicates ? (
              <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
                <Spinner className="size-4" />
                <span className="text-sm text-muted-foreground">{t('libraries.scanningDuplicates')}</span>
              </div>
            ) : duplicateScanError ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {duplicateScanError}
              </div>
            ) : duplicateGroups.length === 0 ? (
              <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                {t('libraries.noDuplicatesFound')}
              </div>
            ) : (
              duplicateGroups.map((group) => (
                <div key={group.id} className="space-y-3 overflow-hidden rounded-2xl border border-border/70 bg-background p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{formatDuplicateReason(group.reason)}</Badge>
                    <span className="text-sm text-muted-foreground">{formatDuplicateSignature(group)}</span>
                    <Badge variant="outline">{t('libraries.duplicateDocumentsCount', { count: group.documents.length })}</Badge>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">{t('libraries.keepDocument')} </span>
                    <span
                      className="inline-block max-w-full truncate align-bottom font-medium"
                      title={choosePrimaryDuplicateDocument(group.documents).title}
                    >
                      {choosePrimaryDuplicateDocument(group.documents).title}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {group.documents.map((document) => (
                      <div key={`${group.id}:${document.id}`} className="flex min-w-0 items-center justify-between gap-3 overflow-hidden rounded-xl border border-border/60 bg-muted/15 px-3 py-2">
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <p className="truncate text-sm font-medium" title={document.title}>{document.title}</p>
                          <p
                            className="truncate text-xs text-muted-foreground"
                            title={[
                              document.authors.join(', ') || t('searchPage.unknownAuthor'),
                              document.year ? `(${document.year})` : '',
                              document.filePath ? fileNameFromPath(document.filePath) : '',
                            ].filter(Boolean).join(' · ')}
                          >
                            {document.authors.join(', ') || t('searchPage.unknownAuthor')}
                            {document.year ? ` (${document.year})` : ''}
                            {document.filePath ? ` · ${fileNameFromPath(document.filePath)}` : ''}
                          </p>
                        </div>
                        <Button asChild variant="outline" size="sm" className="rounded-full shrink-0">
                          <Link href={getDocumentOpenHref(document)} onClick={() => setIsDuplicateDialogOpen(false)}>
                            {t('libraries.openDocument')}
                          </Link>
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      className="rounded-full"
                      onClick={() => void handleMergeDuplicateGroup(group)}
                      disabled={mergingDuplicateGroupId === group.id}
                    >
                      {mergingDuplicateGroupId === group.id ? t('libraries.mergingDuplicates') : t('libraries.mergeDuplicates')}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDuplicateDialogOpen(false)}>
              {t('libraries.close')}
            </Button>
            <Button onClick={() => void openDuplicateDialog()} disabled={isScanningDuplicates}>
              {isScanningDuplicates ? t('libraries.scanning') : t('libraries.rescan')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isCreateDialogOpen}
        onOpenChange={(open) => {
          setIsCreateDialogOpen(open)
          if (!open) resetLibraryForm()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Library</DialogTitle>
            <DialogDescription>Add a new local library for organizing your documents.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="library-name">Name</Label>
              <Input
                id="library-name"
                value={libraryForm.name}
                onChange={(event) => setLibraryForm((state) => ({ ...state, name: event.target.value }))}
                placeholder="My Papers"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="library-description">Description</Label>
              <Input
                id="library-description"
                value={libraryForm.description}
                onChange={(event) => setLibraryForm((state) => ({ ...state, description: event.target.value }))}
                placeholder="Optional description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="library-color">Color</Label>
              <div id="library-color" className="flex flex-wrap gap-2">
                {LIBRARY_COLOR_OPTIONS.map((color) => {
                  const selected = libraryForm.color === color
                  return (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Select color ${color}`}
                      aria-pressed={selected}
                      onClick={() => setLibraryForm((state) => ({ ...state, color }))}
                      className={`h-8 w-8 rounded-full border-2 transition ${selected ? 'border-foreground scale-110' : 'border-transparent hover:scale-105'}`}
                      style={{ backgroundColor: color }}
                    />
                  )
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreateLibrary()} disabled={!libraryForm.name.trim() || isSavingLibrary}>
              {isSavingLibrary ? 'Creating...' : 'Create Library'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isRenameDialogOpen}
        onOpenChange={(open) => {
          setIsRenameDialogOpen(open)
          if (!open) {
            resetLibraryForm()
            setDeleteLibraryConfirmation('')
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Library</DialogTitle>
            <DialogDescription>Update the local library name, description, or color.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rename-library-name">Name</Label>
              <Input
                id="rename-library-name"
                value={libraryForm.name}
                onChange={(event) => setLibraryForm((state) => ({ ...state, name: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rename-library-description">Description</Label>
              <Input
                id="rename-library-description"
                value={libraryForm.description}
                onChange={(event) => setLibraryForm((state) => ({ ...state, description: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rename-library-color">Color</Label>
              <div id="rename-library-color" className="flex flex-wrap gap-2">
                {LIBRARY_COLOR_OPTIONS.map((color) => {
                  const selected = libraryForm.color === color
                  return (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Select color ${color}`}
                      aria-pressed={selected}
                      onClick={() => setLibraryForm((state) => ({ ...state, color }))}
                      className={`h-8 w-8 rounded-full border-2 transition ${selected ? 'border-foreground scale-110' : 'border-transparent hover:scale-105'}`}
                      style={{ backgroundColor: color }}
                    />
                  )
                })}
              </div>
            </div>

            {activeLibrary && (
              <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-destructive">Delete Library</p>
                  {libraries.length > 1 ? (
                    <p className="text-sm text-muted-foreground">
                      Type <span className="font-medium text-foreground">{activeLibrary.name}</span> to enable deletion.
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      At least one library must remain, so this library cannot be deleted right now.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="delete-library-confirmation">Library name</Label>
                  <Input
                    id="delete-library-confirmation"
                    value={deleteLibraryConfirmation}
                    onChange={(event) => setDeleteLibraryConfirmation(event.target.value)}
                    placeholder={activeLibrary.name}
                    disabled={libraries.length <= 1}
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            {activeLibrary && (
              <Button
                type="button"
                variant="destructive"
                className="sm:mr-auto"
                onClick={() => setIsDeleteDialogOpen(true)}
                disabled={libraries.length <= 1 || deleteLibraryConfirmation.trim() !== activeLibrary.name}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Library
              </Button>
            )}
            <Button variant="outline" onClick={() => setIsRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleRenameLibrary()} disabled={!libraryForm.name.trim() || isSavingLibrary}>
              {isSavingLibrary ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete library?</AlertDialogTitle>
            <AlertDialogDescription>
              {activeLibrary
                ? `This will remove "${activeLibrary.name}" and its local documents from the app. This action cannot be undone.`
                : 'This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSavingLibrary}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDeleteLibrary()} disabled={isSavingLibrary}>
              {isSavingLibrary ? 'Deleting...' : 'Delete Library'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
