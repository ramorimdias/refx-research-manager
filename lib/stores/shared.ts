'use client'

import { bootstrapDesktop } from '@/lib/services/desktop-service'
import { dbDocumentToUi } from '@/lib/utils/document-mapper'
import { normalizeErrorMessage } from '@/lib/utils/error'
import { DEFAULT_LIBRARY_ICON } from '@/lib/library-icons'
import { toast } from 'sonner'
import * as repo from '@/lib/repositories/local-db'
import type {
  CitationMatchMethod,
  Document,
  DocumentRelation,
  DocumentRelationLinkOrigin,
  DocumentRelationLinkType,
  DocumentRelationStatus,
  GraphView,
  GraphViewNodeLayout,
  Library,
  LibraryMetadataState,
  PersistentSearchState,
} from '@/lib/types'
import { hasUsableMetadataTitle } from '@/lib/services/document-metadata-service'
import { hydrateRemoteVaultSyncState } from '@/lib/remote-storage-state'

export type AppNote = repo.DbNote
export type AppAnnotation = repo.DbAnnotation

export const DEFAULT_LIBRARY_ID = 'lib-default'

export function showStoreActionError(prefix: string, error: unknown) {
  toast.error(`${prefix}: ${normalizeErrorMessage(error)}`)
}

export function defaultLibrary(): Library {
  const now = new Date()
  return {
    id: DEFAULT_LIBRARY_ID,
    name: 'My Library',
    description: 'Default local library',
    color: '#3b82f6',
    icon: DEFAULT_LIBRARY_ICON,
    type: 'local',
    documentCount: 0,
    createdAt: now,
    updatedAt: now,
  }
}

export function withDerivedCounts(documents: Document[], libraries: repo.DbLibrary[]): Library[] {
  const counts = documents.reduce<Record<string, number>>((acc, document) => {
    acc[document.libraryId] = (acc[document.libraryId] ?? 0) + 1
    return acc
  }, {})

  const mapped = libraries.map((library) => ({
    id: library.id,
    name: library.name,
    description: library.description,
    color: library.color,
    icon: library.icon || DEFAULT_LIBRARY_ICON,
    type: 'local' as const,
    documentCount: counts[library.id] ?? 0,
    createdAt: new Date(library.createdAt),
    updatedAt: new Date(library.updatedAt),
  }))

  return mapped.length > 0 ? mapped : [defaultLibrary()]
}

export function previewLibraries() {
  return [defaultLibrary()]
}

export function previewDocuments() {
  return [] as Document[]
}

export function defaultPersistentSearch(): PersistentSearchState {
  return {
    query: '',
    keywords: [],
    keywordGroups: [],
    groupJoinOperator: 'AND',
    selectedLibraryIds: [],
    readingStage: [],
    metadataStatus: [],
    favoriteOnly: false,
    flexibility: 35,
  }
}

export function toUiRelation(relation: repo.DbDocumentRelation): DocumentRelation {
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

export function toUiGraphView(view: repo.DbGraphView): GraphView {
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

export function toUiGraphViewNodeLayout(layout: repo.DbGraphViewNodeLayout): GraphViewNodeLayout {
  const normalizeCoordinate = (value: number) => (
    Number.isFinite(value)
      ? Math.max(-12000, Math.min(12000, value))
      : 0
  )

  return {
    graphViewId: layout.graphViewId,
    documentId: layout.documentId,
    x: normalizeCoordinate(layout.positionX),
    y: normalizeCoordinate(layout.positionY),
    pinned: layout.pinned,
    hidden: layout.hidden,
    updatedAt: new Date(layout.updatedAt),
  }
}

export async function fetchDesktopData(options: { pullRemote?: boolean, acquireLease?: boolean } = {}) {
  await bootstrapDesktop()
  await hydrateRemoteVaultSyncState()
  let remoteVaultStatus = await repo.getRemoteVaultStatus({ acquireLease: options.acquireLease ?? false }).catch(() => null)
  if (options.pullRemote && remoteVaultStatus?.enabled && !remoteVaultStatus.isOffline) {
    try {
      const pulled = await repo.pullRemoteVault()
      remoteVaultStatus = pulled.status ?? remoteVaultStatus
    } catch (error) {
      console.warn('Remote vault startup pull failed:', error)
    }
  }

  const libraries = await repo.listLibraries()
  const [documents, notes, annotations, relationGroups, graphViewGroups] = await Promise.all([
    repo.listAllDocuments(),
    repo.listNotes(),
    repo.listAllAnnotations(),
    Promise.all(libraries.map((library) => repo.listRelationsForLibrary(library.id))),
    Promise.all(libraries.map((library) => repo.listGraphViews(library.id))),
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
    dbDocumentToUi(document, {
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
    remoteVaultStatus,
  }
}

export function toUiDocumentWithExistingCounts(d: repo.DbDocument, existing?: Document): Document {
  return dbDocumentToUi(d, {
    commentCount: existing?.commentCount,
    notesCount: existing?.notesCount,
  })
}

export function updateLocalDocument(documents: Document[], id: string, updates: Partial<Document>) {
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

export function getLibraryMetadataFilterState(document: Document): LibraryMetadataState {
  const hasTitle = hasUsableMetadataTitle(document.title)
  const hasAuthors = document.authors.length > 0
  const hasYear = typeof document.year === 'number'
  const hasDoi = (document.doi ?? '').trim().length > 0

  if (hasTitle && hasAuthors && hasYear && hasDoi) return 'complete'
  if (hasTitle && hasAuthors && hasYear && !hasDoi) return 'missing_doi'
  if (hasDoi) return 'fetch_possible'
  return 'missing'
}
