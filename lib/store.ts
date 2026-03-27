'use client'

import { create } from 'zustand'
import { isTauri } from '@/lib/tauri/client'
import { bootstrapDesktop, importPdfs } from '@/lib/services/desktop-service'
import { deriveMetadataStatus, markMetadataFieldProvenanceAsUser, markMetadataFieldsAsUserEdited, parseMetadataProvenance, parseMetadataUserEditedFields } from '@/lib/services/document-metadata-service'
import { parseDocumentClassification } from '@/lib/services/document-classification-service'
import { resumeDocumentIngestion } from '@/lib/services/document-ingestion-service'
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
  DocumentFilters,
  EditableMetadataField,
  DocumentSort,
  Library,
  MetadataStatus,
  PersistentSearchState,
  ReadingStage,
  ViewMode,
} from './types'

type AppNote = repo.DbNote
type AppAnnotation = repo.DbAnnotation

interface AppState {
  initialized: boolean
  isDesktopApp: boolean
  libraries: Library[]
  documents: Document[]
  annotations: AppAnnotation[]
  notes: AppNote[]
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
  importDocuments: (paths?: string[]) => Promise<number>
  createLibrary: (input: { name: string; description?: string; color?: string }) => Promise<void>
  updateLibrary: (id: string, updates: { name?: string; description?: string; color?: string }) => Promise<void>
  deleteLibrary: (id: string) => Promise<boolean>
  deleteDocument: (id: string) => Promise<boolean>
  removeDocumentsFromLibrary: (documentIds: string[]) => Promise<number>
  moveDocumentsToLibrary: (documentIds: string[], targetLibraryId: string) => Promise<number>
  loadNotes: () => Promise<void>
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
    documentType: d.documentType === 'physical_book' ? 'physical_book' : 'pdf',
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
    readingStage: (d.readingStage ?? 'unread') as ReadingStage,
    rating: d.rating ?? 0,
    favorite: d.favorite ?? false,
    tags: d.tags ?? [],
    commentCount: counts?.commentCount ?? 0,
    notesCount: counts?.notesCount ?? 0,
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
    activeLibraryId: DEFAULT_LIBRARY_ID,
    activeDocumentId: null,
  }
}

async function fetchDesktopData() {
  const libraries = await bootstrapDesktop()
  const [documents, notes, annotations] = await Promise.all([
    repo.listAllDocuments(),
    repo.listNotes(),
    repo.listAllAnnotations(),
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

function defaultPersistentSearch(): PersistentSearchState {
  return {
    query: '',
    keywords: [],
    keywordGroups: [],
    groupJoinOperator: 'AND',
    selectedLibraryId: 'all',
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
  activeLibraryId: null,
  activeDocumentId: null,
  viewMode: 'table',
  sort: { field: 'addedAt', direction: 'desc' },
  filters: {},
  globalSearchQuery: '',
  persistentSearch: defaultPersistentSearch(),
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

    const { libraries, documents, notes, annotations } = await fetchDesktopData()
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
      activeLibraryId,
      activeDocumentId: get().activeDocumentId,
    })
  },

  refreshData: async () => {
    if (!get().isDesktopApp) {
      set(previewState())
      return
    }

    const { libraries, documents, notes, annotations } = await fetchDesktopData()
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

  importDocuments: async (paths) => {
    const { isDesktopApp, activeLibraryId, libraries } = get()
    const targetLibraryId = activeLibraryId ?? libraries[0]?.id ?? null
    if (!isDesktopApp || !targetLibraryId) return 0

    const imported = await importPdfs(targetLibraryId, paths)
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
    const { libraries, documents, notes } = await fetchDesktopData()
    set({
      libraries,
      documents,
      notes,
      activeLibraryId: created.id,
    })
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
    const { libraries, documents, notes, annotations } = await fetchDesktopData()
    set({
      initialized: true,
      isDesktopApp: true,
      libraries,
      documents,
      notes,
      annotations,
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
