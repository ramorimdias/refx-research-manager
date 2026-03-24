'use client'

import { create } from 'zustand'
import { isTauri } from '@/lib/tauri/client'
import { bootstrapDesktop, importPdfs } from '@/lib/services/desktop-service'
import { deriveOcrState, extractPdfSearchText, extractTopKeywords, scoreDocumentMatch } from '@/lib/services/document-processing'
import * as repo from '@/lib/repositories/local-db'
import type {
  Document,
  DocumentFilters,
  DocumentSort,
  Library,
  MetadataStatus,
  ReadingStage,
  ViewMode,
} from './types'

type AppNote = repo.DbNote

interface AppState {
  initialized: boolean
  isDesktopApp: boolean
  libraries: Library[]
  documents: Document[]
  annotations: unknown[]
  notes: AppNote[]
  activeLibraryId: string | null
  activeDocumentId: string | null
  viewMode: ViewMode
  sort: DocumentSort
  filters: DocumentFilters
  globalSearchQuery: string
  commandPaletteOpen: boolean
  sidebarCollapsed: boolean
  currentPage: number
  zoom: number
  annotationMode: 'select' | 'highlight' | 'note' | 'bookmark' | null
  rightPanelOpen: boolean
  initialize: () => Promise<void>
  refreshData: () => Promise<void>
  setActiveLibrary: (id: string | null) => void
  setActiveDocument: (id: string | null) => void
  setViewMode: (mode: ViewMode) => void
  setSort: (sort: DocumentSort) => void
  setFilters: (filters: DocumentFilters) => void
  setGlobalSearchQuery: (query: string) => void
  setCurrentPage: (page: number) => void
  setZoom: (zoom: number) => void
  setAnnotationMode: (mode: AppState['annotationMode']) => void
  toggleRightPanel: () => void
  toggleSidebar: () => void
  toggleCommandPalette: (force?: boolean) => void
  loadLibraryDocuments: (_libraryId?: string | null) => Promise<void>
  importDocuments: (paths?: string[]) => Promise<number>
  loadNotes: () => Promise<void>
  toggleFavorite: (id: string) => Promise<void>
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
        | 'citationKey'
        | 'readingStage'
        | 'rating'
        | 'favorite'
        | 'searchText'
        | 'hasOcr'
        | 'ocrStatus'
      >
    >,
  ) => Promise<void>
  scanDocumentsOcr: (documentIds?: string[]) => Promise<void>
  generateKeywordsForDocuments: (documentIds: string[]) => Promise<void>
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

function toUiDocument(d: repo.DbDocument): Document {
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
    title: d.title,
    abstract: d.abstractText,
    authors: authorsParsed,
    year: d.year,
    doi: d.doi,
    citationKey: d.citationKey ?? '',
    filePath: d.importedFilePath ?? d.sourcePath,
    searchText: d.searchText,
    pageCount: d.pageCount,
    hasOcr: d.hasOcr ?? false,
    ocrStatus: (d.ocrStatus ?? 'pending') as Document['ocrStatus'],
    metadataStatus: (d.metadataStatus ?? 'incomplete') as MetadataStatus,
    readingStage: (d.readingStage ?? 'unread') as ReadingStage,
    rating: d.rating ?? 0,
    favorite: d.favorite ?? false,
    tags: d.tags ?? [],
    annotationCount: 0,
    notesCount: 0,
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
    annotations: [] as unknown[],
    notes: [] as AppNote[],
    activeLibraryId: DEFAULT_LIBRARY_ID,
    activeDocumentId: null,
  }
}

async function fetchDesktopData() {
  const libraries = await bootstrapDesktop()
  const [documents, notes] = await Promise.all([repo.listAllDocuments(), repo.listNotes()])
  const uiDocuments = documents.map(toUiDocument)
  return {
    libraries: withDerivedCounts(uiDocuments, libraries),
    documents: uiDocuments,
    notes,
  }
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

export const useAppStore = create<AppState>((set, get) => ({
  initialized: false,
  isDesktopApp: false,
  libraries: [],
  documents: [],
  annotations: [],
  notes: [],
  activeLibraryId: null,
  activeDocumentId: null,
  viewMode: 'table',
  sort: { field: 'addedAt', direction: 'desc' },
  filters: {},
  globalSearchQuery: '',
  commandPaletteOpen: false,
  sidebarCollapsed: false,
  currentPage: 1,
  zoom: 100,
  annotationMode: null,
  rightPanelOpen: true,

  initialize: async () => {
    if (!isTauri()) {
      set(previewState())
      return
    }

    const { libraries, documents, notes } = await fetchDesktopData()
    const currentActiveLibraryId = get().activeLibraryId
    const activeLibraryId = libraries.some((library) => library.id === currentActiveLibraryId)
      ? currentActiveLibraryId
      : libraries[0]?.id ?? null

    set({
      initialized: true,
      isDesktopApp: true,
      libraries,
      documents,
      annotations: [],
      notes,
      activeLibraryId,
      activeDocumentId: get().activeDocumentId,
    })
  },

  refreshData: async () => {
    if (!get().isDesktopApp) {
      set(previewState())
      return
    }

    const { libraries, documents, notes } = await fetchDesktopData()
    const activeLibraryId = libraries.some((library) => library.id === get().activeLibraryId)
      ? get().activeLibraryId
      : libraries[0]?.id ?? null
    const activeDocumentId = documents.some((document) => document.id === get().activeDocumentId)
      ? get().activeDocumentId
      : null

    set({
      libraries,
      documents,
      notes,
      activeLibraryId,
      activeDocumentId,
    })
  },

  setActiveLibrary: (id) => set({ activeLibraryId: id }),
  setActiveDocument: (id) => set({ activeDocumentId: id }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setSort: (sort) => set({ sort }),
  setFilters: (filters) => set({ filters }),
  setGlobalSearchQuery: (query) => set({ globalSearchQuery: query }),
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

  importDocuments: async (paths) => {
    const { isDesktopApp, activeLibraryId, libraries } = get()
    const targetLibraryId = activeLibraryId ?? libraries[0]?.id ?? null
    if (!isDesktopApp || !targetLibraryId) return 0

    const imported = await importPdfs(targetLibraryId, paths)
    await get().refreshData()
    return imported.length
  },

  loadNotes: async () => {
    if (!get().isDesktopApp) {
      set({ notes: [] })
      return
    }
    set({ notes: await repo.listNotes() })
  },

  toggleFavorite: async (id) => {
    const current = get().documents.find((document) => document.id === id)
    if (!current) return
    await get().updateDocument(id, { favorite: !current.favorite })
  },

  updateDocument: async (id, updates) => {
    const existing = get().documents.find((document) => document.id === id)
    if (!existing) return

    const optimistic: Partial<Document> = {
      ...updates,
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
      searchText: updates.searchText,
      readingStage: updates.readingStage,
      rating: updates.rating,
      favorite: updates.favorite,
      hasOcr: updates.hasOcr,
      ocrStatus: updates.ocrStatus,
    })

    if (!saved) {
      set((state) => ({
        documents: updateLocalDocument(state.documents, id, existing),
      }))
      return
    }

    set((state) => ({
      documents: updateLocalDocument(state.documents, id, toUiDocument(saved)),
    }))
  },

  scanDocumentsOcr: async (documentIds) => {
    const candidates = get().documents.filter((document) =>
      document.filePath && (!documentIds || documentIds.includes(document.id)),
    )

    for (const document of candidates) {
      if (!document.filePath) continue

      set((state) => ({
        documents: updateLocalDocument(state.documents, document.id, {
          ocrStatus: 'processing',
          updatedAt: new Date(),
        }),
      }))

      try {
        const searchText = await extractPdfSearchText(document.filePath)
        const ocrState = deriveOcrState(searchText)
        await get().updateDocument(document.id, {
          searchText,
          hasOcr: ocrState.hasOcr,
          ocrStatus: ocrState.ocrStatus,
        })
      } catch (error) {
        console.error('OCR scan failed:', error)
        await get().updateDocument(document.id, {
          searchText: '',
          hasOcr: false,
          ocrStatus: 'failed',
        })
      }
    }
  },

  generateKeywordsForDocuments: async (documentIds) => {
    const documents = get().documents.filter((document) => documentIds.includes(document.id))
    if (documents.length === 0) return

    for (const document of documents) {
      const keywords = extractTopKeywords(document, 5)
      for (const keyword of keywords) {
        if (get().isDesktopApp) {
          await repo.addTagToDocument(document.id, keyword)
        }
      }
    }

    await get().refreshData()
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
    const { libraries, documents, notes } = await fetchDesktopData()
    set({
      initialized: true,
      isDesktopApp: true,
      libraries,
      documents,
      notes,
      annotations: [],
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
    if (filters.hasAnnotations && document.annotationCount <= 0) return false
    if (filters.readingStage?.length && !filters.readingStage.includes(document.readingStage)) return false
    if (filters.metadataStatus?.length && !filters.metadataStatus.includes(document.metadataStatus)) return false
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
