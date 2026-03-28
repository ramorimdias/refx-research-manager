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
export type ProcessingStatus = 'pending' | 'queued' | 'processing' | 'complete' | 'failed' | 'skipped'
export type OcrStatus = 'pending' | 'processing' | 'complete' | 'failed' | 'not_needed'
export type MetadataStatus = 'missing' | 'partial' | 'complete'
export type DocumentType = 'pdf' | 'physical_book'
export type TextExtractionStatus = ProcessingStatus
export type IndexingStatus = ProcessingStatus
export type TagSuggestionStatus = ProcessingStatus
export type ClassificationStatus = ProcessingStatus
export type SemanticClassificationMode = 'off' | 'local_heuristic'
export type SemanticClassificationProvider = 'local_heuristic'
export type DocumentMetadataField = 'title' | 'authors' | 'year' | 'doi' | 'pageCount'
export type EditableMetadataField = 'title' | 'authors' | 'year' | 'doi' | 'abstract' | 'isbn' | 'publisher' | 'citationKey'
export type MetadataFieldSource =
  | 'embedded_pdf_metadata'
  | 'first_page_heuristic'
  | 'doi_regex'
  | 'filename_fallback'
  | 'crossref'
  | 'semantic_scholar'
  | 'user'
export type DocumentProcessingStage =
  | 'import_pdf'
  | 'local_metadata_extraction'
  | 'text_extraction'
  | 'ocr_fallback'
  | 'save_document'
  | 'indexing'
  | 'citation_linking'
  | 'tag_suggestion'
  | 'semantic_classification'
  | 'online_metadata_enrichment'
export type DocumentProcessingStageStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export interface DocumentProcessingStageState {
  stage: DocumentProcessingStage
  status: DocumentProcessingStageStatus
  detail?: string
  error?: string
  startedAt?: Date
  completedAt?: Date
}

export interface DocumentMetadataProvenanceEntry {
  source: MetadataFieldSource
  extractedAt: Date
  confidence?: number
  detail?: string
}

export type DocumentMetadataProvenance = Partial<Record<DocumentMetadataField, DocumentMetadataProvenanceEntry>>
export type DocumentMetadataUserEditedFields = Partial<Record<EditableMetadataField, boolean>>

export interface SuggestedTag {
  name: string
  confidence?: number
}

export interface DocumentEphemeralUiFlags {
  isNewlyAdded?: boolean
}

export interface DocumentClassification {
  category: string
  topic: string
  confidence: number
  provider: SemanticClassificationProvider
  model: string
  classifiedAt: Date
  matchedKeywords?: string[]
  suggestedTags?: SuggestedTag[]
}

export interface Document {
  id: string
  libraryId: string
  documentType: DocumentType
  title: string
  subtitle?: string
  abstract?: string
  authors: string[]
  year?: number
  venue?: string
  doi?: string
  isbn?: string
  publisher?: string
  url?: string
  citationKey: string
  sourcePath?: string
  importedFilePath?: string
  extractedTextPath?: string
  filePath?: string
  fileUrl?: string
  searchText?: string
  textHash?: string
  textExtractedAt?: Date
  textExtractionStatus: TextExtractionStatus
  pageCount?: number
  hasExtractedText: boolean
  hasOcrText: boolean
  hasOcr: boolean
  ocrStatus: OcrStatus
  metadataStatus: MetadataStatus
  metadataProvenance?: DocumentMetadataProvenance
  metadataUserEditedFields?: DocumentMetadataUserEditedFields
  indexingStatus: IndexingStatus
  suggestedTags?: SuggestedTag[]
  rejectedSuggestedTags?: string[]
  tagSuggestionTextHash?: string
  tagSuggestionStatus: TagSuggestionStatus
  classification?: DocumentClassification
  classificationTextHash?: string
  classificationStatus: ClassificationStatus
  processingError?: string
  processingUpdatedAt?: Date
  lastProcessedAt?: Date
  readingStage: ReadingStage
  rating: number
  favorite: boolean
  tags: string[]
  commentCount: number
  notesCount: number
  commentaryText?: string
  commentaryUpdatedAt?: Date
  addedAt: Date
  lastOpenedAt?: Date
  lastReadPage?: number
  createdAt: Date
  updatedAt: Date
}

export type DocumentRelationLinkType =
  | 'citation'
  | 'manual'
  | 'related'
  | 'supports'
  | 'contradicts'
  | 'same_topic'

export type DocumentRelationLinkOrigin = 'auto' | 'user'
export type DocumentRelationStatus = 'proposed' | 'confirmed' | 'rejected' | 'auto_confirmed'
export type CitationMatchMethod =
  | 'doi_exact'
  | 'title_exact'
  | 'title_year'
  | 'title_firstauthor_year'
  | 'fuzzy_title'

export interface DocumentRelation {
  id: string
  sourceDocumentId: string
  targetDocumentId: string
  linkType: DocumentRelationLinkType
  linkOrigin: DocumentRelationLinkOrigin
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
  createdAt: Date
  updatedAt: Date
}

export interface GraphView {
  id: string
  libraryId: string
  name: string
  description?: string
  relationFilter: 'all' | 'manual' | 'citations' | 'confirmed_citations' | 'proposed_citations'
  colorMode: 'library' | 'year' | 'density' | 'status' | 'component'
  sizeMode: 'uniform' | 'inbound_citations' | 'total_degree'
  scopeMode: 'mapped' | 'library'
  neighborhoodDepth: 'full' | '1' | '2'
  focusMode: boolean
  hideOrphans: boolean
  confidenceThreshold: number
  yearMin?: number
  yearMax?: number
  selectedDocumentId?: string
  documentIds: string[]
  createdAt: Date
  updatedAt: Date
}

export interface GraphViewNodeLayout {
  graphViewId: string
  documentId: string
  x: number
  y: number
  pinned: boolean
  hidden: boolean
  updatedAt: Date
}

export interface ParsedDocumentReference {
  rawReferenceText: string
  normalizedReferenceText: string
  doi?: string
  normalizedTitle?: string
  title?: string
  authors: string[]
  normalizedFirstAuthor?: string
  year?: number
  journal?: string
  parseConfidence: number
  parseWarnings: string[]
  sourceDocumentId: string
  referenceIndex: number
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
  hasComments?: boolean
  hasNotes?: boolean
}

export type SortField = 'title' | 'authors' | 'year' | 'addedAt' | 'lastOpenedAt' | 'rating'
export type SortDirection = 'asc' | 'desc'

export interface DocumentSort {
  field: SortField
  direction: SortDirection
}

export type ViewMode = 'table' | 'grid' | 'list'

export interface KeywordGroup {
  id: string
  operator: 'AND' | 'OR'
  keywords: string[]
}

export interface PersistentSearchState {
  query: string
  keywords: string[]
  keywordGroups: KeywordGroup[]
  groupJoinOperator: 'AND' | 'OR'
  selectedLibraryId: string | 'all'
  readingStage: ReadingStage | 'all'
  metadataStatus: MetadataStatus | 'all'
  favoriteOnly: boolean
  flexibility: number
}

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
  totalComments: number
  totalNotes: number
  byReadingStage: Record<ReadingStage, number>
  byYear: { year: number; count: number }[]
  byTag: { tag: string; count: number }[]
  recentlyAdded: number
  ocrPending: number
  metadataIncomplete: number
}
