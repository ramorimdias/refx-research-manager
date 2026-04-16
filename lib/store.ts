'use client'

import { create } from 'zustand'
import { isTauri } from '@/lib/tauri/client'
import {
  importPdfs,
  type ImportDocumentsResult,
  type ImportProgressUpdate,
} from '@/lib/services/desktop-service'
import {
  deriveMetadataStatus,
  markMetadataFieldProvenanceAsUser,
  markMetadataFieldsAsUserEdited,
  mergeExtractedMetadataIntoDocument,
  type LocalPdfMetadata,
} from '@/lib/services/document-metadata-service'
import { resumeDocumentIngestion } from '@/lib/services/document-ingestion-service'
import {
  rebuildCitationRelationsForDocument,
  rebuildCitationRelationsForLibrary,
} from '@/lib/services/document-citation-relation-service'
import {
  buildManualTagUpdates,
  buildRejectedSuggestionUpdates,
  normalizeDocumentTagName,
  serializeRejectedSuggestedTags,
  serializeSuggestedTags,
} from '@/lib/services/document-tag-suggestion-service'
import { clearDocumentSearchIndex, indexDocument, removeDocumentFromIndex } from '@/lib/services/document-search-service'
import * as repo from '@/lib/repositories/local-db'
import { useUiStore } from '@/lib/stores/ui-store'
import { useLibraryStore } from '@/lib/stores/library-store'
import { useDocumentStore } from '@/lib/stores/document-store'
import { useRelationStore } from '@/lib/stores/relation-store'
import { useGraphStore } from '@/lib/stores/graph-store'
import {
  DEFAULT_LIBRARY_ID,
  type AppAnnotation,
  type AppNote,
  fetchDesktopData,
  getLibraryMetadataFilterState,
  previewDocuments,
  previewLibraries,
  showStoreActionError,
  toUiDocumentWithExistingCounts,
  toUiRelation,
  updateLocalDocument,
} from '@/lib/stores/shared'
import { dbDocumentToUi } from '@/lib/utils/document-mapper'
import type {
  RemoteVaultStatus,
  RemoteStorageMode,
} from '@/lib/remote-storage-state'
import {
  setRemoteVaultStatus,
} from '@/lib/remote-storage-state'
import type {
  Document,
  DocumentRelation,
  GraphView,
  GraphViewNodeLayout,
  DocumentFilters,
  EditableMetadataField,
  DocumentSort,
  Library,
  PersistentSearchState,
  SemanticClassificationMode,
  ViewMode,
} from './types'

const DESKTOP_BOOTSTRAP_TIMEOUT_MS = 12000

interface RuntimeStoreState {
  initialized: boolean
  isDesktopApp: boolean
  annotations: AppAnnotation[]
  notes: AppNote[]
  remoteStorageMode: RemoteStorageMode
  remoteVaultStatus: RemoteVaultStatus | null
  setInitialized: (initialized: boolean) => void
  setIsDesktopApp: (isDesktopApp: boolean) => void
  setAnnotations: (annotations: AppAnnotation[]) => void
  setNotes: (notes: AppNote[]) => void
  setRemoteVaultStatus: (status: RemoteVaultStatus | null) => void
  resetRuntime: (isDesktopApp?: boolean) => void
}

interface AppState {
  initialized: boolean
  isDesktopApp: boolean
  libraries: Library[]
  documents: Document[]
  annotations: AppAnnotation[]
  notes: AppNote[]
  remoteStorageMode: RemoteStorageMode
  remoteVaultStatus: RemoteVaultStatus | null
  relations: DocumentRelation[]
  graphViews: GraphView[]
  graphViewLayouts: GraphViewNodeLayout[]
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
  importDocuments: (
    paths?: string[],
    onProgress?: (update: ImportProgressUpdate) => void,
  ) => Promise<ImportDocumentsResult>
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
  deleteDocument: (id: string) => Promise<boolean>
  removeDocumentsFromLibrary: (documentIds: string[]) => Promise<number>
  moveDocumentsToLibrary: (documentIds: string[], targetLibraryId: string) => Promise<number>
  loadNotes: () => Promise<void>
  loadRelations: (libraryId?: string | null) => Promise<void>
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

const useRuntimeStore = create<RuntimeStoreState>((set) => ({
  initialized: false,
  isDesktopApp: false,
  annotations: [],
  notes: [],
  remoteStorageMode: 'local',
  remoteVaultStatus: null,
  setInitialized: (initialized) => set({ initialized }),
  setIsDesktopApp: (isDesktopApp) => set({ isDesktopApp }),
  setAnnotations: (annotations) => set({ annotations }),
  setNotes: (notes) => set({ notes }),
  setRemoteVaultStatus: (remoteVaultStatus) => {
    setRemoteVaultStatus(remoteVaultStatus)
    set({
      remoteVaultStatus,
      remoteStorageMode: remoteVaultStatus?.mode ?? 'local',
    })
  },
  resetRuntime: (isDesktopApp = false) => set({
    initialized: true,
    isDesktopApp,
    annotations: [],
    notes: [],
    remoteStorageMode: 'local',
    remoteVaultStatus: null,
  }),
}))

function resetPreviewData(isDesktopApp = false) {
  useLibraryStore.setState({
    libraries: previewLibraries(),
    activeLibraryId: DEFAULT_LIBRARY_ID,
  })
  useDocumentStore.setState({
    documents: previewDocuments(),
    activeDocumentId: null,
  })
  useRelationStore.setState({ relations: [] })
  useGraphStore.setState({ graphViews: [], graphViewLayouts: [] })
  useRuntimeStore.getState().resetRuntime(isDesktopApp)
}

export function forceSafeDesktopFallback() {
  resetPreviewData(true)
}

function syncDesktopData(data: Awaited<ReturnType<typeof fetchDesktopData>>) {
  const currentActiveLibraryId = useLibraryStore.getState().activeLibraryId
  const nextActiveLibraryId = data.libraries.some((library) => library.id === currentActiveLibraryId)
    ? currentActiveLibraryId
    : data.libraries[0]?.id ?? null
  const currentActiveDocumentId = useDocumentStore.getState().activeDocumentId
  const nextActiveDocumentId = data.documents.some((document) => document.id === currentActiveDocumentId)
    ? currentActiveDocumentId
    : null

  useRuntimeStore.setState({
    initialized: true,
    isDesktopApp: true,
    notes: data.notes,
    annotations: data.annotations,
    remoteStorageMode: data.remoteVaultStatus?.mode ?? 'local',
    remoteVaultStatus: data.remoteVaultStatus,
  })
  setRemoteVaultStatus(data.remoteVaultStatus)
  useLibraryStore.setState({
    libraries: data.libraries,
    activeLibraryId: nextActiveLibraryId,
  })
  useDocumentStore.setState({
    documents: data.documents,
    activeDocumentId: nextActiveDocumentId,
  })
  useRelationStore.setState({ relations: data.relations })
  useGraphStore.setState({
    graphViews: data.graphViews,
    graphViewLayouts: [],
  })
}

const appActions = {} as Pick<AppState,
  | 'initialize'
  | 'refreshData'
  | 'setSidebarCollapsed'
  | 'setActiveLibrary'
  | 'setActiveDocument'
  | 'setViewMode'
  | 'setSort'
  | 'setFilters'
  | 'setGlobalSearchQuery'
  | 'setPersistentSearch'
  | 'setCurrentPage'
  | 'setZoom'
  | 'setAnnotationMode'
  | 'toggleRightPanel'
  | 'toggleSidebar'
  | 'toggleCommandPalette'
  | 'importDocuments'
  | 'createDocumentRecord'
  | 'deleteDocument'
  | 'removeDocumentsFromLibrary'
  | 'moveDocumentsToLibrary'
  | 'loadNotes'
  | 'loadRelations'
  | 'rebuildAutoCitationRelations'
  | 'rebuildAutoCitationRelationsForDocument'
  | 'toggleFavorite'
  | 'addDocumentTag'
  | 'removeDocumentTag'
  | 'acceptSuggestedTag'
  | 'rejectSuggestedTag'
  | 'updateDocument'
  | 'fetchOnlineMetadataForDocument'
  | 'applyFetchedMetadataCandidate'
  | 'scanDocumentsOcr'
  | 'classifyDocuments'
  | 'refreshTagSuggestionsForDocuments'
  | 'clearLocalData'
>

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    promise.then(
      (value) => {
        window.clearTimeout(timeoutId)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timeoutId)
        reject(error)
      },
    )
  })
}

appActions.initialize = async () => {
  if (!isTauri()) {
    resetPreviewData(false)
    return
  }

  try {
    syncDesktopData(await withTimeout(fetchDesktopData({ pullRemote: true, acquireLease: true }), DESKTOP_BOOTSTRAP_TIMEOUT_MS, 'Desktop bootstrap'))
  } catch (error) {
    console.error('Desktop bootstrap failed; starting with a safe empty workspace.', error)
    resetPreviewData(true)
  }
}

appActions.refreshData = async () => {
  if (!useRuntimeStore.getState().isDesktopApp) {
    resetPreviewData(false)
    return
  }

  syncDesktopData(await fetchDesktopData())
}

appActions.setSidebarCollapsed = (collapsed) => useUiStore.getState().setSidebarCollapsed(collapsed)
appActions.setActiveDocument = (id) => useDocumentStore.getState().setActiveDocument(id)
appActions.setViewMode = (mode) => useUiStore.getState().setViewMode(mode)
appActions.setSort = (sort) => useUiStore.getState().setSort(sort)
appActions.setFilters = (filters) => useUiStore.getState().setFilters(filters)
appActions.setGlobalSearchQuery = (query) => useUiStore.getState().setGlobalSearchQuery(query)
appActions.setPersistentSearch = (search) => useUiStore.getState().setPersistentSearch(search)
appActions.setCurrentPage = (page) => useUiStore.getState().setCurrentPage(page)
appActions.setZoom = (zoom) => useUiStore.getState().setZoom(zoom)
appActions.setAnnotationMode = (mode) => useUiStore.getState().setAnnotationMode(mode)
appActions.toggleRightPanel = () => useUiStore.getState().toggleRightPanel()
appActions.toggleSidebar = () => useUiStore.getState().toggleSidebar()
appActions.toggleCommandPalette = (force) => useUiStore.getState().toggleCommandPalette(force)

appActions.importDocuments = async (paths, onProgress) => {
  try {
    const runtime = useRuntimeStore.getState()
    const library = useLibraryStore.getState()
    const targetLibraryId = library.activeLibraryId ?? library.libraries[0]?.id ?? null
    if (!runtime.isDesktopApp || !targetLibraryId) {
      return { imported: [], skipped: [] }
    }

    let refreshInFlight: Promise<void> | null = null
    let refreshQueued = false
    const refreshRelevantStages = new Set([
      'import_pdf',
      'local_metadata_extraction',
      'text_extraction',
      'ocr_fallback',
      'online_metadata_enrichment',
    ])

    const queueRefresh = async () => {
      if (refreshInFlight) {
        refreshQueued = true
        return refreshInFlight
      }

      refreshInFlight = appActions.refreshData()
        .catch((error) => {
          console.error('Import refresh failed:', error)
        })
        .finally(async () => {
          refreshInFlight = null
          if (refreshQueued) {
            refreshQueued = false
            await queueRefresh()
          }
        })

      return refreshInFlight
    }

    const scheduleBackgroundRefresh = () => {
      void (async () => {
        for (let attempt = 0; attempt < 12; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 750))
          await queueRefresh()
        }
      })()
    }

    const result = await importPdfs(targetLibraryId, paths, async (update) => {
      onProgress?.(update)
      if (
        (!update.stage && update.status === 'completed')
        || (update.stage && update.status === 'completed' && refreshRelevantStages.has(update.stage))
      ) {
        await queueRefresh()
        if (!update.stage && update.status === 'completed') {
          scheduleBackgroundRefresh()
        }
      }
    })
    await appActions.refreshData()
    return result
  } catch (error) {
    showStoreActionError('Could not import documents', error)
    return { imported: [], skipped: [] }
  }
}

appActions.createDocumentRecord = async (input) => {
  if (!useRuntimeStore.getState().isDesktopApp) return null

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

  const nextDocument = dbDocumentToUi(created, { commentCount: 0, notesCount: 0 })
  useDocumentStore.setState((state) => ({
    documents: [nextDocument, ...state.documents],
  }))
  useLibraryStore.setState((state) => ({
    libraries: state.libraries.map((library) =>
      library.id === nextDocument.libraryId
        ? { ...library, documentCount: library.documentCount + 1 }
        : library),
  }))

  return nextDocument
}

appActions.deleteDocument = async (id) => {
  try {
    if (!useRuntimeStore.getState().isDesktopApp) {
      useDocumentStore.setState((state) => ({
        documents: state.documents.filter((document) => document.id !== id),
        activeDocumentId: state.activeDocumentId === id ? null : state.activeDocumentId,
      }))
      return true
    }

    const deleted = await repo.deleteDocument(id)
    if (!deleted) throw new Error('Document not found')
    await removeDocumentFromIndex(id)
    await appActions.refreshData()
    return true
  } catch (error) {
    showStoreActionError('Could not delete document', error)
    return false
  }
}

appActions.removeDocumentsFromLibrary = async (documentIds) => {
  const uniqueDocumentIds = Array.from(new Set(documentIds))
  if (uniqueDocumentIds.length === 0) return 0

  if (!useRuntimeStore.getState().isDesktopApp) {
    useDocumentStore.setState((state) => ({
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
  const removedIds = removalResults.filter((result) => result.removed).map((result) => result.documentId)
  if (removedIds.length === 0) return 0
  await Promise.all(removedIds.map((documentId) => removeDocumentFromIndex(documentId)))
  await appActions.refreshData()
  return removedIds.length
}

appActions.moveDocumentsToLibrary = async (documentIds, targetLibraryId) => {
  const uniqueDocumentIds = Array.from(new Set(documentIds))
  if (uniqueDocumentIds.length === 0 || !targetLibraryId) return 0

  const existingDocuments = useDocumentStore.getState().documents.filter((document) => uniqueDocumentIds.includes(document.id))
  if (existingDocuments.length === 0) return 0

  const movableDocumentIds = existingDocuments
    .filter((document) => document.libraryId !== targetLibraryId)
    .map((document) => document.id)
  if (movableDocumentIds.length === 0) return 0

  if (!useRuntimeStore.getState().isDesktopApp) {
    useDocumentStore.setState((state) => ({
      documents: state.documents.map((document) =>
        movableDocumentIds.includes(document.id)
          ? { ...document, libraryId: targetLibraryId, updatedAt: new Date() }
          : document),
    }))
    return movableDocumentIds.length
  }

  const movedDocuments = await repo.moveDocumentsToLibrary(movableDocumentIds, targetLibraryId)
  if (movedDocuments.length === 0) return 0
  await appActions.refreshData()
  return movedDocuments.length
}

appActions.loadNotes = async () => {
  if (!useRuntimeStore.getState().isDesktopApp) {
    useRuntimeStore.setState({ notes: [] })
    return
  }

  const notes = await repo.listNotes()
  const noteCounts = notes.reduce<Record<string, number>>((acc, note) => {
    if (note.documentId) {
      acc[note.documentId] = (acc[note.documentId] ?? 0) + 1
    }
    return acc
  }, {})

  useRuntimeStore.setState({ notes })
  useDocumentStore.setState((state) => ({
    documents: state.documents.map((document) => ({
      ...document,
      notesCount: noteCounts[document.id] ?? 0,
    })),
  }))
}

appActions.loadRelations = async (libraryId) => {
  if (!useRuntimeStore.getState().isDesktopApp) {
    useRelationStore.setState({ relations: [] })
    return
  }

  const targetLibraryId = libraryId ?? useLibraryStore.getState().activeLibraryId
  if (!targetLibraryId) {
    useRelationStore.setState({ relations: [] })
    return
  }

  const relationRows = await repo.listRelationsForLibrary(targetLibraryId)
  const targetDocumentIds = new Set(
    useDocumentStore.getState().documents
      .filter((document) => document.libraryId === targetLibraryId)
      .map((document) => document.id),
  )

  useRelationStore.setState((state) => ({
    relations: [
      ...state.relations.filter(
        (relation) =>
          !targetDocumentIds.has(relation.sourceDocumentId)
          && !targetDocumentIds.has(relation.targetDocumentId),
      ),
      ...relationRows.map(toUiRelation),
    ],
  }))
}

appActions.rebuildAutoCitationRelations = async (libraryId) => {
  try {
    if (!useRuntimeStore.getState().isDesktopApp) return

    const targetLibraryId = libraryId ?? useLibraryStore.getState().activeLibraryId
    if (!targetLibraryId) return

    const libraryDocuments = useDocumentStore.getState().documents.filter((document) => document.libraryId === targetLibraryId)
    await rebuildCitationRelationsForLibrary(targetLibraryId, libraryDocuments)
    await appActions.loadRelations(targetLibraryId)
  } catch (error) {
    showStoreActionError('Could not rebuild citation links', error)
  }
}

appActions.rebuildAutoCitationRelationsForDocument = async (documentId) => {
  if (!useRuntimeStore.getState().isDesktopApp) return

  const sourceDocument = useDocumentStore.getState().documents.find((document) => document.id === documentId)
  if (!sourceDocument) return

  const libraryDocuments = useDocumentStore.getState().documents.filter(
    (document) => document.libraryId === sourceDocument.libraryId,
  )
  await rebuildCitationRelationsForDocument(sourceDocument, libraryDocuments)
  await appActions.loadRelations(sourceDocument.libraryId)
}

appActions.toggleFavorite = async (id) => {
  try {
    const current = useDocumentStore.getState().documents.find((document) => document.id === id)
    if (!current) return
    await appActions.updateDocument(id, { favorite: !current.favorite })
  } catch (error) {
    showStoreActionError('Could not update favorite', error)
  }
}

appActions.addDocumentTag = async (id, tagName) => {
  const document = useDocumentStore.getState().documents.find((entry) => entry.id === id)
  if (!document) return
  const normalizedTag = normalizeDocumentTagName(tagName)
  if (!normalizedTag) return

  const nextTags = Array.from(new Set([...document.tags, normalizedTag])).sort((left, right) => left.localeCompare(right))
  const nextSuggestionState = buildManualTagUpdates(document, normalizedTag)

  useDocumentStore.setState((state) => ({
    documents: updateLocalDocument(state.documents, id, {
      rejectedSuggestedTags: nextSuggestionState.rejectedSuggestedTags,
      suggestedTags: nextSuggestionState.suggestedTags,
      tags: nextTags,
    }),
  }))

  try {
    if (!useRuntimeStore.getState().isDesktopApp) return

    await repo.addTagToDocument(id, normalizedTag)
    const saved = await repo.updateDocumentMetadata(id, {
      rejectedTagSuggestions: serializeRejectedSuggestedTags(nextSuggestionState.rejectedSuggestedTags),
      tagSuggestions: serializeSuggestedTags(nextSuggestionState.suggestedTags),
    })
    if (saved) {
      useDocumentStore.setState((state) => ({
        documents: updateLocalDocument(
          state.documents,
          id,
          toUiDocumentWithExistingCounts(saved, state.documents.find((entry) => entry.id === id)),
        ),
      }))
    }
  } catch (error) {
    useDocumentStore.setState((state) => ({
      documents: updateLocalDocument(state.documents, id, document),
    }))
    showStoreActionError('Could not add tag', error)
  }
}

appActions.removeDocumentTag = async (id, tagName) => {
  const document = useDocumentStore.getState().documents.find((entry) => entry.id === id)
  if (!document) return
  const normalizedTag = normalizeDocumentTagName(tagName)
  if (!normalizedTag) return

  useDocumentStore.setState((state) => ({
    documents: updateLocalDocument(state.documents, id, {
      tags: document.tags.filter((entry) => entry !== normalizedTag),
    }),
  }))

  try {
    if (!useRuntimeStore.getState().isDesktopApp) return

    await repo.removeTagFromDocument(id, normalizedTag)
    const saved = await repo.getDocumentById(id)
    if (saved) {
      useDocumentStore.setState((state) => ({
        documents: updateLocalDocument(
          state.documents,
          id,
          toUiDocumentWithExistingCounts(saved, state.documents.find((entry) => entry.id === id)),
        ),
      }))
    }
  } catch (error) {
    useDocumentStore.setState((state) => ({
      documents: updateLocalDocument(state.documents, id, document),
    }))
    showStoreActionError('Could not remove tag', error)
  }
}

appActions.acceptSuggestedTag = async (id, tagName) => {
  await appActions.addDocumentTag(id, tagName)
}

appActions.rejectSuggestedTag = async (id, tagName) => {
  const document = useDocumentStore.getState().documents.find((entry) => entry.id === id)
  if (!document) return
  const normalizedTag = normalizeDocumentTagName(tagName)
  if (!normalizedTag) return

  const nextSuggestionState = buildRejectedSuggestionUpdates(document, normalizedTag)

  useDocumentStore.setState((state) => ({
    documents: updateLocalDocument(state.documents, id, {
      rejectedSuggestedTags: nextSuggestionState.rejectedSuggestedTags,
      suggestedTags: nextSuggestionState.suggestedTags,
    }),
  }))

  if (!useRuntimeStore.getState().isDesktopApp) return

  const saved = await repo.updateDocumentMetadata(id, {
    rejectedTagSuggestions: serializeRejectedSuggestedTags(nextSuggestionState.rejectedSuggestedTags),
    tagSuggestions: serializeSuggestedTags(nextSuggestionState.suggestedTags),
  })

  if (saved) {
    useDocumentStore.setState((state) => ({
      documents: updateLocalDocument(
        state.documents,
        id,
        toUiDocumentWithExistingCounts(saved, state.documents.find((entry) => entry.id === id)),
      ),
    }))
  }
}

appActions.updateDocument = async (id, updates) => {
  const existing = useDocumentStore.getState().documents.find((document) => document.id === id)
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

  useDocumentStore.setState((state) => ({
    documents: updateLocalDocument(state.documents, id, optimistic),
  }))

  try {
    if (!useRuntimeStore.getState().isDesktopApp) return

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
    if (!saved) throw new Error('Document not found')

    useDocumentStore.setState((state) => ({
      documents: updateLocalDocument(state.documents, id, toUiDocumentWithExistingCounts(saved, existing)),
    }))
    if ('searchText' in updates) {
      await indexDocument(id)
    }
  } catch (error) {
    useDocumentStore.setState((state) => ({
      documents: updateLocalDocument(state.documents, id, existing),
    }))
    showStoreActionError('Could not update document', error)
  }
}

appActions.fetchOnlineMetadataForDocument = async (documentId) => {
  try {
    const document = useDocumentStore.getState().documents.find((entry) => entry.id === documentId)
    if (!document || !useRuntimeStore.getState().isDesktopApp) return

    await resumeDocumentIngestion(documentId, {
      enableOnlineMetadataEnrichment: true,
      forceStages: ['online_metadata_enrichment'],
    })

    const refreshed = await repo.getDocumentById(documentId)
    if (refreshed) {
      useDocumentStore.setState((state) => ({
        documents: updateLocalDocument(
          state.documents,
          documentId,
          toUiDocumentWithExistingCounts(refreshed, state.documents.find((entry) => entry.id === documentId)),
        ),
      }))
    }
  } catch (error) {
    showStoreActionError('Could not fetch online metadata', error)
  }
}

appActions.applyFetchedMetadataCandidate = async (documentId, metadata, mode = 'replace_unlocked') => {
  try {
    const document = await repo.getDocumentById(documentId)
    if (!document || !useRuntimeStore.getState().isDesktopApp) return

    const saved = await repo.updateDocumentMetadata(
      documentId,
      mergeExtractedMetadataIntoDocument(document, metadata, mode),
    )

    if (saved) {
      useDocumentStore.setState((state) => ({
        documents: updateLocalDocument(
          state.documents,
          documentId,
          toUiDocumentWithExistingCounts(saved, state.documents.find((entry) => entry.id === documentId)),
        ),
      }))
    }
  } catch (error) {
    showStoreActionError('Could not apply metadata candidate', error)
  }
}

appActions.scanDocumentsOcr = async (documentIds) => {
  try {
    const candidates = useDocumentStore.getState().documents.filter((document) =>
      document.filePath
      && (!documentIds || documentIds.includes(document.id))
      && (documentIds
        ? true
        : !document.hasOcrText && (document.ocrStatus === 'pending' || document.ocrStatus === 'failed' || !document.hasExtractedText)),
    )

    for (const document of candidates) {
      if (!document.filePath) continue

      useDocumentStore.setState((state) => ({
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
          useDocumentStore.setState((state) => ({
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
          useDocumentStore.setState((state) => ({
            documents: updateLocalDocument(state.documents, document.id, toUiDocumentWithExistingCounts(failed, document)),
          }))
        }
      }
    }
  } catch (error) {
    showStoreActionError('Could not scan documents with OCR', error)
  }
}

appActions.classifyDocuments = async (documentIds, mode) => {
  try {
    if (mode === 'off') return
    const candidates = useDocumentStore.getState().documents.filter((document) =>
      documentIds.includes(document.id)
      && document.documentType !== 'my_work'
      && (document.hasExtractedText || document.hasOcrText),
    )

    for (const document of candidates) {
      useDocumentStore.setState((state) => ({
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
          useDocumentStore.setState((state) => ({
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
          useDocumentStore.setState((state) => ({
            documents: updateLocalDocument(state.documents, document.id, toUiDocumentWithExistingCounts(failed, document)),
          }))
        }
      }
    }
  } catch (error) {
    showStoreActionError('Could not classify documents', error)
  }
}

appActions.refreshTagSuggestionsForDocuments = async (documentIds) => {
  const documents = useDocumentStore.getState().documents.filter((document) => documentIds.includes(document.id))
  if (documents.length === 0) return

  for (const document of documents) {
    if (!useRuntimeStore.getState().isDesktopApp) continue
    await resumeDocumentIngestion(document.id, {
      enableTagSuggestion: true,
      forceStages: ['tag_suggestion'],
    })
    const refreshed = await repo.getDocumentById(document.id)
    if (refreshed) {
      useDocumentStore.setState((state) => ({
        documents: updateLocalDocument(state.documents, document.id, toUiDocumentWithExistingCounts(refreshed, document)),
      }))
    }
  }
}

appActions.clearLocalData = async () => {
  if (!useRuntimeStore.getState().isDesktopApp) {
    resetPreviewData(false)
    useUiStore.getState().resetUiState()
    return
  }

  await repo.clearLocalData()
  await clearDocumentSearchIndex()
  syncDesktopData(await fetchDesktopData())
  useDocumentStore.setState({ activeDocumentId: null })
  useUiStore.getState().resetUiState()
}

function getAppState(): AppState {
  return {
    ...useRuntimeStore.getState(),
    ...useLibraryStore.getState(),
    ...useDocumentStore.getState(),
    ...useRelationStore.getState(),
    ...useGraphStore.getState(),
    ...useUiStore.getState(),
    ...appActions,
  }
}

type UseAppStoreHook = {
  (): AppState
  <T>(selector: (state: AppState) => T): T
  getState: () => AppState
}

export const useAppStore = ((selector?: (state: AppState) => unknown) => {
  const runtime = useRuntimeStore()
  const libraries = useLibraryStore()
  const documents = useDocumentStore()
  const relations = useRelationStore()
  const graph = useGraphStore()
  const ui = useUiStore()

  const state: AppState = {
    ...runtime,
    ...libraries,
    ...documents,
    ...relations,
    ...graph,
    ...ui,
    ...appActions,
  }

  return selector ? selector(state) : state
}) as UseAppStoreHook

useAppStore.getState = getAppState

export const useDocumentAnnotations = (documentId: string) => {
  const annotations = useRuntimeStore((state) => state.annotations)
  return annotations.filter((annotation) => annotation.documentId === documentId)
}
