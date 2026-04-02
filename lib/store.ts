'use client'

import { create } from 'zustand'
import { isTauri } from '@/lib/tauri/client'
import { bootstrapDesktop, importPdfs, type ImportProgressUpdate } from '@/lib/services/desktop-service'
import { deriveMetadataStatus, hasUsableMetadataTitle, markMetadataFieldProvenanceAsUser, markMetadataFieldsAsUserEdited, parseMetadataProvenance, parseMetadataUserEditedFields } from '@/lib/services/document-metadata-service'
import { mergeExtractedMetadataIntoDocument, type LocalPdfMetadata } from '@/lib/services/document-metadata-service'
import { normalizeReadingStage } from '@/lib/services/document-reading-stage'
import { parseDocumentClassification } from '@/lib/services/document-classification-service'
import { resumeDocumentIngestion } from '@/lib/services/document-ingestion-service'
import {
  rebuildCitationRelationsForDocument,
  rebuildCitationRelationsForLibrary,
} from '@/lib/services/document-citation-relation-service'
import {
  buildAcceptedSuggestionUpdates,
  buildManualTagUpdates,
  buildRejectedSuggestionUpdates,
  getDocumentRejectedSuggestedTags,
  getDocumentSuggestedTags,
  normalizeDocumentTagName,
  serializeRejectedSuggestedTags,
  serializeSuggestedTags,
} from '@/lib/services/document-tag-suggestion-service'
import { scoreDocumentMatch } from '@/lib/services/document-processing'
import { clearDocumentSearchIndex, indexDocument, removeDocumentFromIndex } from '@/lib/services/document-search-service'
import * as repo from '@/lib/repositories/local-db'
import type {
  Document,
  DocumentRelation,
  DocumentRelationStatus,
  DocumentRelationLinkOrigin,
  DocumentRelationLinkType,
  CitationMatchMethod,
  GraphView,
  GraphViewNodeLayout,
  DocumentFilters,
  EditableMetadataField,
  DocumentSort,
  Library,
  MetadataStatus,
  LibraryMetadataState,
  PersistentSearchState,
  ReadingStage,
  SemanticClassificationMode,
  ViewMode,
} from './types'

type AppNote = repo.DbNote
type AppAnnotation = repo.DbAnnotation
type AppRelation = DocumentRelation
type AppGraphView = GraphView
type AppGraphViewNodeLayout = GraphViewNodeLayout

interface AppState {
  initialized: boolean
  isDesktopApp: boolean
  libraries: Library[]
  documents: Document[]
  annotations: AppAnnotation[]
  notes: AppNote[]
  relations: AppRelation[]
  graphViews: AppGraphView[]
  graphViewLayouts: AppGraphViewNodeLayout[]
  activeLibraryId: string | null
  activeDocumentId: string | null
  viewMode: ViewMode
  sort: DocumentSort
  filters: DocumentFilters
  globalSearchQuery: string
  persistentSearch: PersistentSearchState
  commandPaletteOpen: boolean
  sidebarCollapsed: boolean
  currentPage: number
  zoom: number
  annotationMode: 'select' | 'highlight' | 'note' | 'bookmark' | null
  rightPanelOpen: boolean
  initialize: () => Promise<void>
  refreshData: () => Promise<void>
  setSidebarCollapsed: (collapsed: boolean) => void
  setActiveLibrary: (id: string | null) => void
  setActiveDocument: (id: string | null) => void
  setViewMode: (mode: ViewMode) => void
  setSort: (sort: DocumentSort) => void
  setFilters: (filters: DocumentFilters) => void
  setGlobalSearchQuery: (query: string) => void
  setPersistentSearch: (search: Partial<PersistentSearchState>) => void
  setCurrentPage: (page: number) => void
  setZoom: (zoom: number) => void
  setAnnotationMode: (mode: AppState['annotationMode']) => void
  toggleRightPanel: () => void
  toggleSidebar: () => void
  toggleCommandPalette: (force?: boolean) => void
  loadLibraryDocuments: (_libraryId?: string | null) => Promise<void>
  importDocuments: (paths?: string[], onProgress?: (update: ImportProgressUpdate) => void) => Promise<number>
  createLibrary: (input: { name: string; description?: string; color?: string }) => Promise<void>
  createDocumentRecord: (input: {
    libraryId: string
    title: string
    documentType?: Document['documentType']
    authors?: string[]
    year?: number
    abstract?: string
    doi?: string
    citationKey?: string
  }) => Promise<Document | null>
  updateLibrary: (id: string, updates: { name?: string; description?: string; color?: string }) => Promise<void>
  deleteLibrary: (id: string) => Promise<boolean>
  deleteDocument: (id: string) => Promise<boolean>
  removeDocumentsFromLibrary: (documentIds: string[]) => Promise<number>
  moveDocumentsToLibrary: (documentIds: string[], targetLibraryId: string) => Promise<number>
  loadNotes: () => Promise<void>
  loadRelations: (libraryId?: string | null) => Promise<void>
  loadGraphViews: (libraryId?: string | null) => Promise<void>
  loadGraphViewLayouts: (graphViewId: string | null) => Promise<void>
  createGraphView: (input: {
    libraryId: string
    name: string
    description?: string
    relationFilter: GraphView['relationFilter']
    colorMode: GraphView['colorMode']
    sizeMode: GraphView['sizeMode']
    scopeMode: GraphView['scopeMode']
    neighborhoodDepth: GraphView['neighborhoodDepth']
    focusMode: boolean
    hideOrphans: boolean
    confidenceThreshold: number
    yearMin?: number
    yearMax?: number
    selectedDocumentId?: string
    documentIds: string[]
  }) => Promise<GraphView | null>
  updateGraphView: (id: string, input: {
    name?: string
    description?: string
    relationFilter?: GraphView['relationFilter']
    colorMode?: GraphView['colorMode']
    sizeMode?: GraphView['sizeMode']
    scopeMode?: GraphView['scopeMode']
    neighborhoodDepth?: GraphView['neighborhoodDepth']
    focusMode?: boolean
    hideOrphans?: boolean
    confidenceThreshold?: number
    yearMin?: number
    yearMax?: number
    selectedDocumentId?: string
    documentIds?: string[]
  }) => Promise<GraphView | null>
  duplicateGraphView: (id: string) => Promise<GraphView | null>
  deleteGraphView: (id: string) => Promise<boolean>
  upsertGraphViewNodeLayout: (input: {
    graphViewId: string
    documentId: string
    x: number
    y: number
    pinned?: boolean
    hidden?: boolean
  }) => Promise<GraphViewNodeLayout | null>
  resetGraphViewNodeLayouts: (graphViewId: string, documentId?: string) => Promise<void>
  createRelation: (input: {
    sourceDocumentId: string
    targetDocumentId: string
    linkType?: DocumentRelationLinkType
    linkOrigin?: DocumentRelationLinkOrigin
    relationStatus?: DocumentRelationStatus
    confidence?: number
    label?: string
    notes?: string
    matchMethod?: CitationMatchMethod
    rawReferenceText?: string
    normalizedReferenceText?: string
    normalizedTitle?: string
    normalizedFirstAuthor?: string
    referenceIndex?: number
    parseConfidence?: number
    parseWarnings?: string[]
    matchDebugInfo?: string
  }) => Promise<DocumentRelation | null>
  updateRelation: (id: string, input: {
    linkType?: DocumentRelationLinkType
    relationStatus?: DocumentRelationStatus
    confidence?: number
    label?: string
    notes?: string
  }) => Promise<DocumentRelation | null>
  deleteRelation: (id: string) => Promise<boolean>
  rebuildAutoCitationRelations: (libraryId?: string | null) => Promise<void>
  rebuildAutoCitationRelationsForDocument: (documentId: string) => Promise<void>
  toggleFavorite: (id: string) => Promise<void>
  addDocumentTag: (id: string, tagName: string) => Promise<void>
  removeDocumentTag: (id: string, tagName: string) => Promise<void>
  acceptSuggestedTag: (id: string, tagName: string) => Promise<void>
  rejectSuggestedTag: (id: string, tagName: string) => Promise<void>
  updateDocument: (
    id: string,
    updates: Partial<
      Pick<
        Document,
        | 'title'
        | 'authors'
        | 'year'
        | 'abstract'
        | 'doi'
        | 'isbn'
        | 'publisher'
        | 'documentType'
        | 'citationKey'
        | 'coverImagePath'
        | 'readingStage'
        | 'rating'
        | 'favorite'
        | 'searchText'
        | 'hasOcr'
        | 'ocrStatus'
      >
    >,
  ) => Promise<void>
  fetchOnlineMetadataForDocument: (documentId: string) => Promise<void>
  applyFetchedMetadataCandidate: (
    documentId: string,
    metadata: LocalPdfMetadata,
    mode?: 'fill_missing' | 'replace_unlocked',
  ) => Promise<void>
  scanDocumentsOcr: (documentIds?: string[]) => Promise<void>
  classifyDocuments: (documentIds: string[], mode: SemanticClassificationMode) => Promise<void>
  refreshTagSuggestionsForDocuments: (documentIds: string[]) => Promise<void>
  clearLocalData: () => Promise<void>
}

const DEFAULT_LIBRARY_ID = 'lib-default'

function defaultLibrary(): Library {
  const now = new Date()
  return {
    id: DEFAULT_LIBRARY_ID,
    name: 'My Library',
    description: 'Default local library',
    color: '#3b82f6',
    icon: 'folder',
    type: 'local',
    documentCount: 0,
    createdAt: now,
    updatedAt: now,
  }
}

function toUiDocument(
  d: repo.DbDocument,
  counts?: {
    commentCount?: number
    notesCount?: number
  },
): Document {
  const authorsParsed = (() => {
    if (Array.isArray(d.authors)) return d.authors
    if (typeof d.authors !== 'string') return []
    try {
      const parsed = JSON.parse(d.authors)
      return Array.isArray(parsed) ? parsed : [d.authors]
    } catch {
      return d.authors ? [d.authors] : []
    }
  })()

  return {
    id: d.id,
    libraryId: d.libraryId,
    documentType: d.documentType === 'physical_book'
      ? 'physical_book'
      : d.documentType === 'my_work'
        ? 'my_work'
        : 'pdf',
    title: d.title,
    abstract: d.abstractText,
    authors: authorsParsed,
    year: d.year,
    doi: d.doi,
    isbn: d.isbn,
    publisher: d.publisher,
    citationKey: d.citationKey ?? '',
    sourcePath: d.sourcePath,
    importedFilePath: d.importedFilePath,
    extractedTextPath: d.extractedTextPath,
    filePath: d.importedFilePath ?? d.sourcePath,
    searchText: d.searchText,
    textHash: d.textHash,
    textExtractedAt: d.textExtractedAt ? new Date(d.textExtractedAt) : undefined,
    textExtractionStatus: d.textExtractionStatus ?? 'pending',
    pageCount: d.pageCount,
    hasExtractedText: d.hasExtractedText ?? Boolean(d.searchText || d.extractedTextPath),
    hasOcrText: d.hasOcrText ?? false,
    hasOcr: d.hasOcr ?? false,
    ocrStatus: (d.ocrStatus ?? 'pending') as Document['ocrStatus'],
    metadataStatus: (d.metadataStatus ?? 'missing') as MetadataStatus,
    metadataProvenance: parseMetadataProvenance(d.metadataProvenance),
    metadataUserEditedFields: parseMetadataUserEditedFields(d.metadataUserEditedFields),
    indexingStatus: d.indexingStatus ?? 'pending',
    suggestedTags: getDocumentSuggestedTags(d),
    rejectedSuggestedTags: getDocumentRejectedSuggestedTags(d),
    tagSuggestionTextHash: d.tagSuggestionTextHash,
    tagSuggestionStatus: d.tagSuggestionStatus ?? 'pending',
    classification: parseDocumentClassification(d),
    classificationTextHash: d.classificationTextHash,
    classificationStatus: d.classificationStatus ?? 'pending',
    processingError: d.processingError ?? undefined,
    processingUpdatedAt: d.processingUpdatedAt ? new Date(d.processingUpdatedAt) : undefined,
    lastProcessedAt: d.lastProcessedAt ? new Date(d.lastProcessedAt) : undefined,
    readingStage: normalizeReadingStage(d.readingStage),
    rating: d.rating ?? 0,
    favorite: d.favorite ?? false,
    tags: d.tags ?? [],
    commentCount: counts?.commentCount ?? 0,
    notesCount: counts?.notesCount ?? 0,
    commentaryText: d.commentaryText,
    commentaryUpdatedAt: d.commentaryUpdatedAt ? new Date(d.commentaryUpdatedAt) : undefined,
    coverImagePath: d.coverImagePath,
    addedAt: d.createdAt ? new Date(d.createdAt) : new Date(),
    createdAt: d.createdAt ? new Date(d.createdAt) : new Date(),
    updatedAt: d.updatedAt ? new Date(d.updatedAt) : new Date(),
    lastOpenedAt: d.lastOpenedAt ? new Date(d.lastOpenedAt) : undefined,
    lastReadPage: d.lastReadPage,
  }
}

function withDerivedCounts(documents: Document[], libraries: repo.DbLibrary[]): Library[] {
  const counts = documents.reduce<Record<string, number>>((acc, document) => {
    acc[document.libraryId] = (acc[document.libraryId] ?? 0) + 1
    return acc
  }, {})

  const mapped = libraries.map((library) => ({
    id: library.id,
    name: library.name,
    description: library.description,
    color: library.color,
    icon: 'folder',
    type: 'local' as const,
    documentCount: counts[library.id] ?? 0,
    createdAt: new Date(library.createdAt),
    updatedAt: new Date(library.updatedAt),
  }))

  return mapped.length > 0 ? mapped : [defaultLibrary()]
}

function previewState() {
  return {
    initialized: true,
    isDesktopApp: false,
    libraries: [defaultLibrary()],
    documents: [] as Document[],
    annotations: [] as AppAnnotation[],
    notes: [] as AppNote[],
    relations: [] as AppRelation[],
    graphViews: [] as AppGraphView[],
    graphViewLayouts: [] as AppGraphViewNodeLayout[],
    activeLibraryId: DEFAULT_LIBRARY_ID,
    activeDocumentId: null,
  }
}

function toUiRelation(relation: repo.DbDocumentRelation): DocumentRelation {
  const parseWarnings = (() => {
    if (!relation.parseWarnings) return undefined
    try {
      return JSON.parse(relation.parseWarnings) as string[]
    } catch {
      return undefined
    }
  })()

  return {
    id: relation.id,
    sourceDocumentId: relation.sourceDocumentId,
    targetDocumentId: relation.targetDocumentId,
    linkType: relation.linkType as DocumentRelationLinkType,
    linkOrigin: relation.linkOrigin as DocumentRelationLinkOrigin,
    relationStatus: relation.relationStatus as DocumentRelationStatus | undefined,
    confidence: relation.confidence,
    label: relation.label,
    notes: relation.notes,
    matchMethod: relation.matchMethod as CitationMatchMethod | undefined,
    rawReferenceText: relation.rawReferenceText,
    normalizedReferenceText: relation.normalizedReferenceText,
    normalizedTitle: relation.normalizedTitle,
    normalizedFirstAuthor: relation.normalizedFirstAuthor,
    referenceIndex: relation.referenceIndex,
    parseConfidence: relation.parseConfidence,
    parseWarnings,
    matchDebugInfo: relation.matchDebugInfo,
    createdAt: new Date(relation.createdAt),
    updatedAt: new Date(relation.updatedAt),
  }
}

function toUiGraphView(view: repo.DbGraphView): GraphView {
  const documentIds = (() => {
    if (!view.documentIdsJson) return []
    try {
      const parsed = JSON.parse(view.documentIdsJson)
      return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
    } catch {
      return []
    }
  })()

  return {
    id: view.id,
    libraryId: view.libraryId,
    name: view.name,
    description: view.description,
    relationFilter: view.relationFilter as GraphView['relationFilter'],
    colorMode: view.colorMode as GraphView['colorMode'],
    sizeMode: view.sizeMode as GraphView['sizeMode'],
    scopeMode: view.scopeMode as GraphView['scopeMode'],
    neighborhoodDepth: view.neighborhoodDepth as GraphView['neighborhoodDepth'],
    focusMode: view.focusMode,
    hideOrphans: view.hideOrphans,
    confidenceThreshold: view.confidenceThreshold,
    yearMin: view.yearMin,
    yearMax: view.yearMax,
    selectedDocumentId: view.selectedDocumentId,
    documentIds,
    createdAt: new Date(view.createdAt),
    updatedAt: new Date(view.updatedAt),
  }
}

function toUiGraphViewNodeLayout(layout: repo.DbGraphViewNodeLayout): GraphViewNodeLayout {
  return {
    graphViewId: layout.graphViewId,
    documentId: layout.documentId,
    x: layout.positionX,
    y: layout.positionY,
    pinned: layout.pinned,
    hidden: layout.hidden,
    updatedAt: new Date(layout.updatedAt),
  }
}

async function fetchDesktopData() {
  const libraries = await bootstrapDesktop()
  const [documents, notes, annotations, relationGroups, graphViewGroups] = await Promise.all([
    repo.listAllDocuments(),
    repo.listNotes(),
    repo.listAllAnnotations(),
    Promise.all(
      libraries.map((library) => repo.listRelationsForLibrary(library.id)),
    ),
    Promise.all(
      libraries.map((library) => repo.listGraphViews(library.id)),
    ),
  ])
  const noteCounts = notes.reduce<Record<string, number>>((acc, note) => {
    if (note.documentId) {
      acc[note.documentId] = (acc[note.documentId] ?? 0) + 1
    }
    return acc
  }, {})
  const commentCounts = annotations.reduce<Record<string, number>>((acc, annotation) => {
    acc[annotation.documentId] = (acc[annotation.documentId] ?? 0) + 1
    return acc
  }, {})
  const uiDocuments = documents.map((document) =>
    toUiDocument(document, {
      commentCount: commentCounts[document.id] ?? 0,
      notesCount: noteCounts[document.id] ?? 0,
    }),
  )
  return {
    libraries: withDerivedCounts(uiDocuments, libraries),
    documents: uiDocuments,
    notes,
    annotations,
    relations: relationGroups.flat().map(toUiRelation),
    graphViews: graphViewGroups.flat().map(toUiGraphView),
  }
}

function toUiDocumentWithExistingCounts(d: repo.DbDocument, existing?: Document): Document {
  return toUiDocument(d, {
    commentCount: existing?.commentCount,
    notesCount: existing?.notesCount,
  })
}

function updateLocalDocument(documents: Document[], id: string, updates: Partial<Document>) {
  return documents.map((document) =>
    document.id === id
      ? {
          ...document,
          ...updates,
          updatedAt: updates.updatedAt ?? new Date(),
        }
      : document,
  )
}

function compareValues(a: Document, b: Document, field: DocumentSort['field']) {
  switch (field) {
    case 'addedAt':
      return a.addedAt.getTime() - b.addedAt.getTime()
    case 'lastOpenedAt':
      return (a.lastOpenedAt?.getTime() ?? 0) - (b.lastOpenedAt?.getTime() ?? 0)
    case 'year':
      return (a.year ?? 0) - (b.year ?? 0)
    case 'rating':
      return a.rating - b.rating
    case 'authors':
      return a.authors.join(', ').localeCompare(b.authors.join(', '))
    case 'title':
    default:
      return a.title.localeCompare(b.title)
  }
}

function getLibraryMetadataFilterState(document: Document): LibraryMetadataState {
  const hasTitle = hasUsableMetadataTitle(document.title)
  const hasAuthors = document.authors.length > 0
  const hasYear = typeof document.year === 'number'
  const hasDoi = (document.doi ?? '').trim().length > 0

  if (hasTitle && hasAuthors && hasYear && hasDoi) return 'complete'
  if (hasTitle && hasAuthors && hasYear && !hasDoi) return 'missing_doi'
  if (hasDoi) return 'fetch_possible'
  return 'missing'
}

function defaultPersistentSearch(): PersistentSearchState {
  return {
    query: '',
    keywords: [],
    keywordGroups: [],
    groupJoinOperator: 'AND',
    selectedLibraryIds: [],
    readingStage: 'all',
    metadataStatus: 'all',
    favoriteOnly: false,
    flexibility: 35,
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  initialized: false,
  isDesktopApp: false,
  libraries: [],
  documents: [],
  annotations: [],
  notes: [],
  relations: [],
  graphViews: [],
  graphViewLayouts: [],
  activeLibraryId: null,
  activeDocumentId: null,
  viewMode: 'table',
  sort: { field: 'addedAt', direction: 'desc' },
  filters: {},
  globalSearchQuery: '',
  persistentSearch: defaultPersistentSearch(),
  commandPaletteOpen: false,
  sidebarCollapsed: true,
  currentPage: 1,
  zoom: 100,
  annotationMode: null,
  rightPanelOpen: true,

  initialize: async () => {
    if (!isTauri()) {
      set(previewState())
      return
    }

    try {
      const { libraries, documents, notes, annotations, relations, graphViews } = await fetchDesktopData()
      const currentActiveLibraryId = get().activeLibraryId
      const activeLibraryId = libraries.some((library) => library.id === currentActiveLibraryId)
        ? currentActiveLibraryId
        : libraries[0]?.id ?? null

      set({
        initialized: true,
        isDesktopApp: true,
        libraries,
        documents,
        annotations,
        notes,
        relations,
        graphViews,
        graphViewLayouts: [],
        activeLibraryId,
        activeDocumentId: get().activeDocumentId,
      })
    } catch (error) {
      console.error('Desktop bootstrap failed; starting with a safe empty workspace.', error)
      set({
        ...previewState(),
        initialized: true,
        isDesktopApp: true,
      })
    }
  },

  refreshData: async () => {
    if (!get().isDesktopApp) {
      set(previewState())
      return
    }

    const { libraries, documents, notes, annotations, relations, graphViews } = await fetchDesktopData()
    const activeLibraryId = libraries.some((library) => library.id === get().activeLibraryId)
      ? get().activeLibraryId
      : libraries[0]?.id ?? null
    const activeDocumentId = documents.some((document) => document.id === get().activeDocumentId)
      ? get().activeDocumentId
      : null

    set({
      libraries,
      documents,
      annotations,
      notes,
      relations,
      graphViews,
      activeLibraryId,
      activeDocumentId,
    })
  },

  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setActiveLibrary: (id) => set({ activeLibraryId: id }),
  setActiveDocument: (id) => set({ activeDocumentId: id }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setSort: (sort) => set({ sort }),
  setFilters: (filters) => set({ filters }),
  setGlobalSearchQuery: (query) => set({ globalSearchQuery: query }),
  setPersistentSearch: (search) =>
    set((state) => ({
      persistentSearch: {
        ...state.persistentSearch,
        ...search,
      },
    })),
  setCurrentPage: (page) => set({ currentPage: page }),
  setZoom: (zoom) => set({ zoom }),
  setAnnotationMode: (mode) => set({ annotationMode: mode }),
  toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  toggleCommandPalette: (force) =>
    set((state) => ({
      commandPaletteOpen: typeof force === 'boolean' ? force : !state.commandPaletteOpen,
    })),

  loadLibraryDocuments: async () => {
    await get().refreshData()
  },

  importDocuments: async (paths, onProgress) => {
    const { isDesktopApp, activeLibraryId, libraries } = get()
    const targetLibraryId = activeLibraryId ?? libraries[0]?.id ?? null
    if (!isDesktopApp || !targetLibraryId) return 0

    const imported = await importPdfs(targetLibraryId, paths, async (update) => {
      onProgress?.(update)
      if (update.status === 'completed') {
        await get().refreshData()
      }
    })
    await get().refreshData()
    return imported.length
  },

  createLibrary: async (input) => {
    if (!get().isDesktopApp) {
      const now = new Date()
      const library: Library = {
        id: `lib-${crypto.randomUUID?.() ?? Date.now()}`,
        name: input.name,
        description: input.description ?? '',
        color: input.color ?? '#3b82f6',
        icon: 'folder',
        type: 'local',
        documentCount: 0,
        createdAt: now,
        updatedAt: now,
      }

      set((state) => ({
        libraries: [...state.libraries, library],
        activeLibraryId: library.id,
      }))
      return
    }

    const created = await repo.createLibrary(input)
    const { libraries, documents, notes, relations, graphViews } = await fetchDesktopData()
    set({
      libraries,
      documents,
      notes,
      relations,
      graphViews,
      activeLibraryId: created.id,
    })
  },

  createDocumentRecord: async (input) => {
    if (!get().isDesktopApp) return null

    const created = await repo.createDocument({
      libraryId: input.libraryId,
      documentType: input.documentType,
      title: input.title,
      authors: JSON.stringify(input.authors ?? []),
      year: input.year,
      abstractText: input.abstract,
      doi: input.doi,
      citationKey: input.citationKey,
      searchText: input.title,
      textExtractionStatus: input.documentType === 'my_work' ? 'skipped' : 'pending',
      indexingStatus: input.documentType === 'my_work' ? 'skipped' : 'pending',
      tagSuggestionStatus: input.documentType === 'my_work' ? 'skipped' : 'pending',
      classificationStatus: input.documentType === 'my_work' ? 'skipped' : 'pending',
      ocrStatus: input.documentType === 'my_work' ? 'not_needed' : 'pending',
      hasExtractedText: false,
      hasOcr: false,
      hasOcrText: false,
      metadataStatus: deriveMetadataStatus({
        title: input.title,
        authors: input.authors ?? [],
        year: input.year,
        doi: input.doi,
      }),
    })

    const nextDocument = toUiDocument(created, { commentCount: 0, notesCount: 0 })
    set((state) => ({
      documents: [nextDocument, ...state.documents],
      libraries: state.libraries.map((library) =>
        library.id === nextDocument.libraryId
          ? { ...library, documentCount: library.documentCount + 1 }
          : library),
    }))

    return nextDocument
  },

  updateLibrary: async (id, updates) => {
    if (!get().isDesktopApp) {
      set((state) => ({
        libraries: state.libraries.map((library) =>
          library.id === id
            ? {
                ...library,
                ...updates,
                updatedAt: new Date(),
              }
            : library,
        ),
      }))
      return
    }

    await repo.updateLibrary(id, updates)
    await get().refreshData()
  },

  deleteLibrary: async (id) => {
    if (!get().isDesktopApp) {
      const remainingLibraries = get().libraries.filter((library) => library.id !== id)
      if (remainingLibraries.length === 0) return false

      set((state) => ({
        libraries: remainingLibraries,
        documents: state.documents.filter((document) => document.libraryId !== id),
        activeLibraryId:
          state.activeLibraryId === id ? remainingLibraries[0]?.id ?? null : state.activeLibraryId,
      }))
      return true
    }

    const libraryDocumentIds = get().documents.filter((document) => document.libraryId === id).map((document) => document.id)
    const deleted = await repo.deleteLibrary(id)
    if (!deleted) return false
    await Promise.all(libraryDocumentIds.map((documentId) => removeDocumentFromIndex(documentId)))
    await get().refreshData()
    return true
  },

  deleteDocument: async (id) => {
    if (!get().isDesktopApp) {
      set((state) => ({
        documents: state.documents.filter((document) => document.id !== id),
        activeDocumentId: state.activeDocumentId === id ? null : state.activeDocumentId,
      }))
      return true
    }

    const deleted = await repo.deleteDocument(id)
    if (!deleted) return false
    await removeDocumentFromIndex(id)
    await get().refreshData()
    return true
  },

  removeDocumentsFromLibrary: async (documentIds) => {
    const uniqueDocumentIds = Array.from(new Set(documentIds))
    if (uniqueDocumentIds.length === 0) return 0

    if (!get().isDesktopApp) {
      set((state) => ({
        documents: state.documents.filter((document) => !uniqueDocumentIds.includes(document.id)),
        activeDocumentId: state.activeDocumentId && uniqueDocumentIds.includes(state.activeDocumentId)
          ? null
          : state.activeDocumentId,
      }))
      return uniqueDocumentIds.length
    }

    const removalResults = await Promise.all(
      uniqueDocumentIds.map(async (documentId) => ({
        documentId,
        removed: await repo.deleteDocument(documentId),
      })),
    )
    const removedIds = removalResults
      .filter((result) => result.removed)
      .map((result) => result.documentId)

    if (removedIds.length === 0) return 0

    await Promise.all(removedIds.map((documentId) => removeDocumentFromIndex(documentId)))
    await get().refreshData()
    return removedIds.length
  },

  moveDocumentsToLibrary: async (documentIds, targetLibraryId) => {
    const uniqueDocumentIds = Array.from(new Set(documentIds))
    if (uniqueDocumentIds.length === 0 || !targetLibraryId) return 0

    const existingDocuments = get().documents.filter((document) => uniqueDocumentIds.includes(document.id))
    if (existingDocuments.length === 0) return 0

    const movableDocumentIds = existingDocuments
      .filter((document) => document.libraryId !== targetLibraryId)
      .map((document) => document.id)

    if (movableDocumentIds.length === 0) return 0

    if (!get().isDesktopApp) {
      set((state) => ({
        documents: state.documents.map((document) =>
          movableDocumentIds.includes(document.id)
            ? { ...document, libraryId: targetLibraryId, updatedAt: new Date() }
            : document,
        ),
      }))
      return movableDocumentIds.length
    }

    const movedDocuments = await repo.moveDocumentsToLibrary(movableDocumentIds, targetLibraryId)
    if (movedDocuments.length === 0) return 0

    await get().refreshData()
    return movedDocuments.length
  },

  loadNotes: async () => {
    if (!get().isDesktopApp) {
      set({ notes: [] })
      return
    }

    const notes = await repo.listNotes()
    const noteCounts = notes.reduce<Record<string, number>>((acc, note) => {
      if (note.documentId) {
        acc[note.documentId] = (acc[note.documentId] ?? 0) + 1
      }
      return acc
    }, {})

    set((state) => ({
      notes,
      documents: state.documents.map((document) => ({
        ...document,
        notesCount: noteCounts[document.id] ?? 0,
      })),
    }))
  },

  loadRelations: async (libraryId) => {
    if (!get().isDesktopApp) {
      set({ relations: [] })
      return
    }

    const targetLibraryId = libraryId ?? get().activeLibraryId
    if (!targetLibraryId) {
      set({ relations: [] })
      return
    }

    const relationRows = await repo.listRelationsForLibrary(targetLibraryId)
    const targetDocumentIds = new Set(
      get().documents
        .filter((document) => document.libraryId === targetLibraryId)
        .map((document) => document.id),
    )

    set((state) => ({
      relations: [
        ...state.relations.filter(
          (relation) =>
            !targetDocumentIds.has(relation.sourceDocumentId)
            && !targetDocumentIds.has(relation.targetDocumentId),
        ),
        ...relationRows.map(toUiRelation),
      ],
    }))
  },

  loadGraphViews: async (libraryId) => {
    if (!get().isDesktopApp) {
      set({ graphViews: [] })
      return
    }

    const targetLibraryId = libraryId ?? get().activeLibraryId
    if (!targetLibraryId) {
      set({ graphViews: [] })
      return
    }

    const viewRows = await repo.listGraphViews(targetLibraryId)
    set((state) => ({
      graphViews: [
        ...state.graphViews.filter((view) => view.libraryId !== targetLibraryId),
        ...viewRows.map(toUiGraphView),
      ],
    }))
  },

  loadGraphViewLayouts: async (graphViewId) => {
    if (!get().isDesktopApp || !graphViewId) {
      set({ graphViewLayouts: [] })
      return
    }

    const layoutRows = await repo.listGraphViewNodeLayouts(graphViewId)
    set({
      graphViewLayouts: layoutRows.map(toUiGraphViewNodeLayout),
    })
  },

  createGraphView: async (input) => {
    if (!get().isDesktopApp) return null

    const created = await repo.createGraphView({
      libraryId: input.libraryId,
      name: input.name,
      description: input.description,
      relationFilter: input.relationFilter,
      colorMode: input.colorMode,
      sizeMode: input.sizeMode,
      scopeMode: input.scopeMode,
      neighborhoodDepth: input.neighborhoodDepth,
      focusMode: input.focusMode,
      hideOrphans: input.hideOrphans,
      confidenceThreshold: input.confidenceThreshold,
      yearMin: input.yearMin,
      yearMax: input.yearMax,
      selectedDocumentId: input.selectedDocumentId,
      documentIdsJson: JSON.stringify(input.documentIds),
    })

    const nextView = toUiGraphView(created)
    set((state) => ({
      graphViews: [...state.graphViews.filter((view) => view.id !== nextView.id), nextView],
    }))
    return nextView
  },

  updateGraphView: async (id, input) => {
    if (!get().isDesktopApp) return null

    const updated = await repo.updateGraphView(id, {
      name: input.name,
      description: input.description,
      relationFilter: input.relationFilter,
      colorMode: input.colorMode,
      sizeMode: input.sizeMode,
      scopeMode: input.scopeMode,
      neighborhoodDepth: input.neighborhoodDepth,
      focusMode: input.focusMode,
      hideOrphans: input.hideOrphans,
      confidenceThreshold: input.confidenceThreshold,
      yearMin: input.yearMin,
      yearMax: input.yearMax,
      selectedDocumentId: input.selectedDocumentId,
      documentIdsJson: input.documentIds ? JSON.stringify(input.documentIds) : undefined,
    })

    if (!updated) return null

    const nextView = toUiGraphView(updated)
    set((state) => ({
      graphViews: state.graphViews.map((view) => (view.id === id ? nextView : view)),
    }))
    return nextView
  },

  duplicateGraphView: async (id) => {
    if (!get().isDesktopApp) return null

    const duplicated = await repo.duplicateGraphView(id)
    const nextView = toUiGraphView(duplicated)
    set((state) => ({
      graphViews: [...state.graphViews, nextView],
    }))
    return nextView
  },

  deleteGraphView: async (id) => {
    if (!get().isDesktopApp) return false

    const deleted = await repo.deleteGraphView(id)
    if (!deleted) return false

    set((state) => ({
      graphViews: state.graphViews.filter((view) => view.id !== id),
      graphViewLayouts: state.graphViewLayouts.filter((layout) => layout.graphViewId !== id),
    }))
    return true
  },

  upsertGraphViewNodeLayout: async (input) => {
    if (!get().isDesktopApp) return null

    const updated = await repo.upsertGraphViewNodeLayout({
      graphViewId: input.graphViewId,
      documentId: input.documentId,
      positionX: input.x,
      positionY: input.y,
      pinned: input.pinned,
      hidden: input.hidden,
    })

    const nextLayout = toUiGraphViewNodeLayout(updated)
    set((state) => ({
      graphViewLayouts: [
        ...state.graphViewLayouts.filter(
          (layout) =>
            !(layout.graphViewId === nextLayout.graphViewId && layout.documentId === nextLayout.documentId),
        ),
        nextLayout,
      ],
    }))
    return nextLayout
  },

  resetGraphViewNodeLayouts: async (graphViewId, documentId) => {
    if (!get().isDesktopApp) return

    await repo.resetGraphViewNodeLayouts(graphViewId, documentId)
    if (!documentId) {
      set((state) => ({
        graphViewLayouts: state.graphViewLayouts.filter((layout) => layout.graphViewId !== graphViewId),
      }))
      return
    }

    set((state) => ({
      graphViewLayouts: state.graphViewLayouts.filter(
        (layout) => !(layout.graphViewId === graphViewId && layout.documentId === documentId),
      ),
    }))
  },

  createRelation: async (input) => {
    if (!get().isDesktopApp) return null

    const created = await repo.createRelation({
      sourceDocumentId: input.sourceDocumentId,
      targetDocumentId: input.targetDocumentId,
      linkType: input.linkType ?? 'manual',
      linkOrigin: input.linkOrigin ?? 'user',
      relationStatus: input.relationStatus,
      confidence: input.confidence,
      label: input.label,
      notes: input.notes,
      matchMethod: input.matchMethod,
      rawReferenceText: input.rawReferenceText,
      normalizedReferenceText: input.normalizedReferenceText,
      normalizedTitle: input.normalizedTitle,
      normalizedFirstAuthor: input.normalizedFirstAuthor,
      referenceIndex: input.referenceIndex,
      parseConfidence: input.parseConfidence,
      parseWarnings: input.parseWarnings ? JSON.stringify(input.parseWarnings) : undefined,
      matchDebugInfo: input.matchDebugInfo,
    })
    const nextRelation = toUiRelation(created)

    set((state) => ({
      relations: [
        ...state.relations.filter((relation) => relation.id !== nextRelation.id),
        nextRelation,
      ],
    }))

    return nextRelation
  },

  updateRelation: async (id, input) => {
    if (!get().isDesktopApp) return null

    const updated = await repo.updateRelation(id, {
      linkType: input.linkType,
      relationStatus: input.relationStatus,
      confidence: input.confidence,
      label: input.label,
      notes: input.notes,
    })

    if (!updated) return null

    const nextRelation = toUiRelation(updated)
    set((state) => ({
      relations: state.relations.map((relation) => (relation.id === id ? nextRelation : relation)),
    }))

    return nextRelation
  },

  deleteRelation: async (id) => {
    if (!get().isDesktopApp) {
      set((state) => ({
        relations: state.relations.filter((relation) => relation.id !== id),
      }))
      return true
    }

    const deleted = await repo.deleteRelation(id)
    if (!deleted) return false

    set((state) => ({
      relations: state.relations.filter((relation) => relation.id !== id),
    }))
    return true
  },

  rebuildAutoCitationRelations: async (libraryId) => {
    if (!get().isDesktopApp) return

    const targetLibraryId = libraryId ?? get().activeLibraryId
    if (!targetLibraryId) return

    const libraryDocuments = get().documents.filter((document) => document.libraryId === targetLibraryId)
    await rebuildCitationRelationsForLibrary(targetLibraryId, libraryDocuments)
    await get().loadRelations(targetLibraryId)
  },

  rebuildAutoCitationRelationsForDocument: async (documentId) => {
    if (!get().isDesktopApp) return

    const sourceDocument = get().documents.find((document) => document.id === documentId)
    if (!sourceDocument) return

    const libraryDocuments = get().documents.filter(
      (document) => document.libraryId === sourceDocument.libraryId,
    )

    await rebuildCitationRelationsForDocument(sourceDocument, libraryDocuments)
    await get().loadRelations(sourceDocument.libraryId)
  },

  toggleFavorite: async (id) => {
    const current = get().documents.find((document) => document.id === id)
    if (!current) return
    await get().updateDocument(id, { favorite: !current.favorite })
  },

  addDocumentTag: async (id, tagName) => {
    const document = get().documents.find((entry) => entry.id === id)
    if (!document) return

    const normalizedTag = normalizeDocumentTagName(tagName)
    if (!normalizedTag) return

    const nextTags = Array.from(new Set([...document.tags, normalizedTag])).sort((left, right) => left.localeCompare(right))
    const nextSuggestionState = buildManualTagUpdates(document, normalizedTag)

    set((state) => ({
      documents: updateLocalDocument(state.documents, id, {
        rejectedSuggestedTags: nextSuggestionState.rejectedSuggestedTags,
        suggestedTags: nextSuggestionState.suggestedTags,
        tags: nextTags,
      }),
    }))

    if (!get().isDesktopApp) return

    await repo.addTagToDocument(id, normalizedTag)
    const saved = await repo.updateDocumentMetadata(id, {
      rejectedTagSuggestions: serializeRejectedSuggestedTags(nextSuggestionState.rejectedSuggestedTags),
      tagSuggestions: serializeSuggestedTags(nextSuggestionState.suggestedTags),
    })

    if (saved) {
      set((state) => ({
        documents: updateLocalDocument(
          state.documents,
          id,
          toUiDocumentWithExistingCounts(saved, state.documents.find((entry) => entry.id === id)),
        ),
      }))
    }
  },

  removeDocumentTag: async (id, tagName) => {
    const document = get().documents.find((entry) => entry.id === id)
    if (!document) return

    const normalizedTag = normalizeDocumentTagName(tagName)
    if (!normalizedTag) return

    set((state) => ({
      documents: updateLocalDocument(state.documents, id, {
        tags: document.tags.filter((entry) => entry !== normalizedTag),
      }),
    }))

    if (!get().isDesktopApp) return

    await repo.removeTagFromDocument(id, normalizedTag)
    const saved = await repo.getDocumentById(id)
    if (saved) {
      set((state) => ({
        documents: updateLocalDocument(
          state.documents,
          id,
          toUiDocumentWithExistingCounts(saved, state.documents.find((entry) => entry.id === id)),
        ),
      }))
    }
  },

  acceptSuggestedTag: async (id, tagName) => {
    await get().addDocumentTag(id, tagName)
  },

  rejectSuggestedTag: async (id, tagName) => {
    const document = get().documents.find((entry) => entry.id === id)
    if (!document) return

    const normalizedTag = normalizeDocumentTagName(tagName)
    if (!normalizedTag) return

    const nextSuggestionState = buildRejectedSuggestionUpdates(document, normalizedTag)

    set((state) => ({
      documents: updateLocalDocument(state.documents, id, {
        rejectedSuggestedTags: nextSuggestionState.rejectedSuggestedTags,
        suggestedTags: nextSuggestionState.suggestedTags,
      }),
    }))

    if (!get().isDesktopApp) return

    const saved = await repo.updateDocumentMetadata(id, {
      rejectedTagSuggestions: serializeRejectedSuggestedTags(nextSuggestionState.rejectedSuggestedTags),
      tagSuggestions: serializeSuggestedTags(nextSuggestionState.suggestedTags),
    })

    if (saved) {
      set((state) => ({
        documents: updateLocalDocument(
          state.documents,
          id,
          toUiDocumentWithExistingCounts(saved, state.documents.find((entry) => entry.id === id)),
        ),
      }))
    }
  },

  updateDocument: async (id, updates) => {
    const existing = get().documents.find((document) => document.id === id)
    if (!existing) return

    const editedMetadataFields: EditableMetadataField[] = [
      updates.title !== undefined ? 'title' : null,
      updates.authors !== undefined ? 'authors' : null,
      updates.year !== undefined ? 'year' : null,
      updates.doi !== undefined ? 'doi' : null,
      updates.abstract !== undefined ? 'abstract' : null,
      updates.isbn !== undefined ? 'isbn' : null,
      updates.publisher !== undefined ? 'publisher' : null,
      updates.citationKey !== undefined ? 'citationKey' : null,
    ].filter((field): field is EditableMetadataField => field !== null)
    const nextTitle = updates.title ?? existing.title
    const nextAuthors = updates.authors ?? existing.authors
    const nextYear = updates.year ?? existing.year
    const nextDoi = updates.doi ?? existing.doi
    const nextMetadataStatus = deriveMetadataStatus({
      title: nextTitle,
      authors: nextAuthors,
      year: nextYear,
      doi: nextDoi,
    })

    const optimistic: Partial<Document> = {
      ...updates,
      metadataStatus: nextMetadataStatus,
      metadataUserEditedFields: editedMetadataFields.length > 0
        ? {
            ...(existing.metadataUserEditedFields ?? {}),
            ...Object.fromEntries(editedMetadataFields.map((field) => [field, true])),
          }
        : existing.metadataUserEditedFields,
      metadataProvenance: editedMetadataFields.length > 0
        ? {
            ...(existing.metadataProvenance ?? {}),
            ...Object.fromEntries(
              editedMetadataFields
                .filter((field) => field === 'title' || field === 'authors' || field === 'year' || field === 'doi')
                .map((field) => [field, { source: 'user', extractedAt: new Date(), confidence: 1, detail: 'Edited manually in the document details view.' }]),
            ),
          }
        : existing.metadataProvenance,
      updatedAt: new Date(),
    }

    set((state) => ({
      documents: updateLocalDocument(state.documents, id, optimistic),
    }))

    if (!get().isDesktopApp) return

    const saved = await repo.updateDocumentMetadata(id, {
      title: updates.title,
      authors: updates.authors ? JSON.stringify(updates.authors) : undefined,
      year: updates.year,
      abstractText: updates.abstract,
      doi: updates.doi,
      citationKey: updates.citationKey,
      coverImagePath: updates.coverImagePath,
      searchText: updates.searchText,
      readingStage: updates.readingStage,
      rating: updates.rating,
      favorite: updates.favorite,
      hasOcr: updates.hasOcr,
      ocrStatus: updates.ocrStatus,
      metadataStatus: nextMetadataStatus,
      metadataUserEditedFields: editedMetadataFields.length > 0
        ? markMetadataFieldsAsUserEdited(
            existing.metadataUserEditedFields ? JSON.stringify(existing.metadataUserEditedFields) : undefined,
            editedMetadataFields,
          )
        : undefined,
      metadataProvenance: editedMetadataFields.length > 0
        ? markMetadataFieldProvenanceAsUser(
            existing.metadataProvenance ? JSON.stringify(existing.metadataProvenance) : undefined,
            editedMetadataFields,
          )
        : undefined,
    })

    if (!saved) {
      set((state) => ({
        documents: updateLocalDocument(state.documents, id, existing),
      }))
      return
    }

    set((state) => ({
      documents: updateLocalDocument(state.documents, id, toUiDocumentWithExistingCounts(saved, existing)),
    }))

    if ('searchText' in updates) {
      await indexDocument(id)
    }
  },

  fetchOnlineMetadataForDocument: async (documentId) => {
    const document = get().documents.find((entry) => entry.id === documentId)
    if (!document || !get().isDesktopApp) return

    await resumeDocumentIngestion(documentId, {
      enableOnlineMetadataEnrichment: true,
      forceStages: ['online_metadata_enrichment'],
    })

    const refreshed = await repo.getDocumentById(documentId)
    if (refreshed) {
      set((state) => ({
        documents: updateLocalDocument(
          state.documents,
          documentId,
          toUiDocumentWithExistingCounts(refreshed, state.documents.find((entry) => entry.id === documentId)),
        ),
      }))
    }
  },

  applyFetchedMetadataCandidate: async (documentId, metadata, mode = 'replace_unlocked') => {
    const document = await repo.getDocumentById(documentId)
    if (!document || !get().isDesktopApp) return

    const saved = await repo.updateDocumentMetadata(
      documentId,
      mergeExtractedMetadataIntoDocument(document, metadata, mode),
    )

    if (saved) {
      set((state) => ({
        documents: updateLocalDocument(
          state.documents,
          documentId,
          toUiDocumentWithExistingCounts(saved, state.documents.find((entry) => entry.id === documentId)),
        ),
      }))
    }
  },

  scanDocumentsOcr: async (documentIds) => {
    const candidates = get().documents.filter((document) =>
      document.filePath
      && (!documentIds || documentIds.includes(document.id))
      && (documentIds
        ? true
        : !document.hasOcrText && (document.ocrStatus === 'pending' || document.ocrStatus === 'failed' || !document.hasExtractedText)),
    )

    for (const document of candidates) {
      if (!document.filePath) continue

      set((state) => ({
        documents: updateLocalDocument(state.documents, document.id, {
          ocrStatus: 'processing',
          processingUpdatedAt: new Date(),
          updatedAt: new Date(),
        }),
      }))

      try {
        await resumeDocumentIngestion(document.id, {
          enableOcrFallback: true,
          forceStages: ['ocr_fallback', 'save_document', 'indexing'],
        })
        const refreshed = await repo.getDocumentById(document.id)
        if (refreshed) {
          set((state) => ({
            documents: updateLocalDocument(state.documents, document.id, toUiDocumentWithExistingCounts(refreshed, document)),
          }))
        }
      } catch (error) {
        console.error('OCR scan failed:', error)
        const failed = await repo.updateDocumentMetadata(document.id, {
          indexingStatus: 'pending',
          processingError: error instanceof Error ? error.message : 'OCR failed.',
          processingUpdatedAt: new Date().toISOString(),
          lastProcessedAt: new Date().toISOString(),
          hasOcr: false,
          hasOcrText: false,
          ocrStatus: 'failed',
        })
        if (failed) {
          set((state) => ({
            documents: updateLocalDocument(state.documents, document.id, toUiDocumentWithExistingCounts(failed, document)),
          }))
        }
      }
    }
  },

  classifyDocuments: async (documentIds, mode) => {
    if (mode === 'off') return

    const candidates = get().documents.filter((document) =>
      documentIds.includes(document.id)
      && document.documentType !== 'my_work'
      && (document.hasExtractedText || document.hasOcrText)
    )

    for (const document of candidates) {
      set((state) => ({
        documents: updateLocalDocument(state.documents, document.id, {
          classificationStatus: 'processing',
          processingUpdatedAt: new Date(),
          updatedAt: new Date(),
        }),
      }))

      try {
        await resumeDocumentIngestion(document.id, {
          enableSemanticClassification: true,
          semanticClassificationMode: mode,
          forceStages: ['semantic_classification'],
        })
        const refreshed = await repo.getDocumentById(document.id)
        if (refreshed) {
          set((state) => ({
            documents: updateLocalDocument(state.documents, document.id, toUiDocumentWithExistingCounts(refreshed, document)),
          }))
        }
      } catch (error) {
        console.error('Semantic classification failed:', error)
        const failed = await repo.updateDocumentMetadata(document.id, {
          classificationStatus: 'failed',
          processingError: error instanceof Error ? error.message : 'Semantic classification failed.',
          processingUpdatedAt: new Date().toISOString(),
          lastProcessedAt: new Date().toISOString(),
        })
        if (failed) {
          set((state) => ({
            documents: updateLocalDocument(state.documents, document.id, toUiDocumentWithExistingCounts(failed, document)),
          }))
        }
      }
    }
  },

  refreshTagSuggestionsForDocuments: async (documentIds) => {
    const documents = get().documents.filter((document) => documentIds.includes(document.id))
    if (documents.length === 0) return

    for (const document of documents) {
      if (!get().isDesktopApp) continue
      await resumeDocumentIngestion(document.id, {
        enableTagSuggestion: true,
        forceStages: ['tag_suggestion'],
      })
      const refreshed = await repo.getDocumentById(document.id)
      if (refreshed) {
        set((state) => ({
          documents: updateLocalDocument(state.documents, document.id, toUiDocumentWithExistingCounts(refreshed, document)),
        }))
      }
    }
  },

  clearLocalData: async () => {
    if (!get().isDesktopApp) {
      set({
        ...previewState(),
        filters: {},
        globalSearchQuery: '',
        commandPaletteOpen: false,
      })
      return
    }

    await repo.clearLocalData()
    await clearDocumentSearchIndex()
    const { libraries, documents, notes, annotations, relations, graphViews } = await fetchDesktopData()
    set({
      initialized: true,
      isDesktopApp: true,
      libraries,
      documents,
      notes,
      annotations,
      relations,
      graphViews,
      graphViewLayouts: [],
      activeLibraryId: libraries[0]?.id ?? null,
      activeDocumentId: null,
      filters: {},
      globalSearchQuery: '',
      commandPaletteOpen: false,
    })
  },
}))

export const useFilteredDocuments = () => {
  const { activeLibraryId, documents, filters, sort } = useAppStore()
  const search = (filters.search ?? '').trim().toLowerCase()

  const filtered = documents.filter((document) => {
    if (activeLibraryId && document.libraryId !== activeLibraryId) return false

    if (search) {
      const haystack = [document.title, document.authors.join(' '), document.doi, document.citationKey, document.abstract, document.searchText]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(search)) return false
    }

    if (filters.favorite && !document.favorite) return false
    if (filters.hasComments && document.commentCount <= 0) return false
    if (filters.hasNotes && document.notesCount <= 0) return false
    if (filters.readingStage?.length && !filters.readingStage.includes(document.readingStage)) return false
    if (
      filters.metadataStatus?.length
      && !filters.metadataStatus.includes(getLibraryMetadataFilterState(document))
    ) return false
    if (filters.tags?.length && !filters.tags.some((tag) => document.tags.includes(tag))) return false

    if (filters.year?.min && (document.year ?? 0) < filters.year.min) return false
    if (filters.year?.max && (document.year ?? 0) > filters.year.max) return false

    return true
  })

  return filtered.sort((left, right) => {
    if (search) {
      const relevance = scoreDocumentMatch(right, search).rawScore - scoreDocumentMatch(left, search).rawScore
      if (relevance !== 0) return relevance
    }
    const comparison = compareValues(left, right, sort.field)
    return sort.direction === 'asc' ? comparison : -comparison
  })
}

export const useDocumentAnnotations = (documentId: string) => {
  const { annotations } = useAppStore()
  return annotations.filter((annotation: any) => annotation.documentId === documentId)
}
