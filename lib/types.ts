// Core data types for Refx Research Manager

export type LibraryType = 'local' | 'synced' | 'shared' | 'bundle'

export interface Library {
  id: string
  name: string
  description: string
  color: string
  icon: string
  type: LibraryType
  documentCount: number
  createdAt: Date
  updatedAt: Date
}

export type ReadingStage = 'unread' | 'reading' | 'skimmed' | 'read' | 'archived'
export type OcrStatus = 'pending' | 'processing' | 'complete' | 'failed' | 'not_needed'
export type MetadataStatus = 'incomplete' | 'partial' | 'complete' | 'verified'

export interface Document {
  id: string
  libraryId: string
  title: string
  subtitle?: string
  abstract?: string
  authors: string[]
  year?: number
  venue?: string
  doi?: string
  url?: string
  citationKey: string
  filePath?: string
  fileUrl?: string
  searchText?: string
  pageCount?: number
  hasOcr: boolean
  ocrStatus: OcrStatus
  metadataStatus: MetadataStatus
  readingStage: ReadingStage
  rating: number
  favorite: boolean
  tags: string[]
  annotationCount: number
  notesCount: number
  addedAt: Date
  lastOpenedAt?: Date
  lastReadPage?: number
  createdAt: Date
  updatedAt: Date
}

export interface Author {
  id: string
  displayName: string
  normalizedName: string
  orcid?: string
  documentCount: number
}

export type TagType = 'manual' | 'auto' | 'system'

export interface Tag {
  id: string
  name: string
  color: string
  type: TagType
  documentCount: number
}

export type AnnotationType = 'highlight' | 'note' | 'bookmark' | 'area'

export interface Annotation {
  id: string
  documentId: string
  type: AnnotationType
  page: number
  textQuote?: string
  comment?: string
  color: string
  rect?: { x: number; y: number; width: number; height: number }
  createdAt: Date
  updatedAt: Date
}

export interface Note {
  id: string
  title: string
  content: string
  linkedDocumentIds: string[]
  linkedAnnotationIds: string[]
  tags: string[]
  pinned: boolean
  createdAt: Date
  updatedAt: Date
}

export type ReferenceItemType = 'article' | 'book' | 'inproceedings' | 'thesis' | 'report' | 'misc'

export interface Reference {
  id: string
  documentId?: string
  rawBibtex?: string
  itemType: ReferenceItemType
  fields: Record<string, string>
  doi?: string
  citationKey: string
  source?: string
  metadataConfidence: number
  createdAt: Date
  updatedAt: Date
}

export interface SavedSearch {
  id: string
  name: string
  query: string
  filters: Record<string, unknown>
  resultCount?: number
  lastRun?: Date
  createdAt: Date
}

export interface TopicCluster {
  id: string
  name: string
  description: string
  keywords: string[]
  documentIds: string[]
  color: string
}

// UI State Types
export interface DocumentFilters {
  search?: string
  libraryId?: string
  tags?: string[]
  readingStage?: ReadingStage[]
  metadataStatus?: MetadataStatus[]
  year?: { min?: number; max?: number }
  favorite?: boolean
  hasAnnotations?: boolean
}

export type SortField = 'title' | 'authors' | 'year' | 'addedAt' | 'lastOpenedAt' | 'rating'
export type SortDirection = 'asc' | 'desc'

export interface DocumentSort {
  field: SortField
  direction: SortDirection
}

export type ViewMode = 'table' | 'grid' | 'list'

// Graph/Map Types
export type GraphNodeType = 'document' | 'author' | 'tag' | 'topic'

export interface GraphNode {
  id: string
  type: GraphNodeType
  label: string
  data: Document | Author | Tag | TopicCluster
  x?: number
  y?: number
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  type: 'cites' | 'authored' | 'tagged' | 'related'
  weight?: number
}

// Stats Types
export interface LibraryStats {
  totalDocuments: number
  totalAnnotations: number
  totalNotes: number
  byReadingStage: Record<ReadingStage, number>
  byYear: { year: number; count: number }[]
  byTag: { tag: string; count: number }[]
  recentlyAdded: number
  ocrPending: number
  metadataIncomplete: number
}
