'use client'

import { invoke } from '@/lib/tauri/client'

export type DbLibrary = {
  id: string
  name: string
  description: string
  color: string
  createdAt: string
  updatedAt: string
}

export type DbProcessingStatus = 'pending' | 'queued' | 'processing' | 'complete' | 'failed' | 'skipped'
export type DbOcrStatus = 'pending' | 'processing' | 'complete' | 'failed' | 'not_needed'
export type DbMetadataStatus = 'missing' | 'partial' | 'complete'

export type DbDocument = {
  id: string
  libraryId: string
  documentType?: string
  title: string
  authors: string
  tags: string[]
  year?: number
  abstractText?: string
  doi?: string
  isbn?: string
  publisher?: string
  citationKey?: string
  sourcePath?: string
  importedFilePath?: string
  extractedTextPath?: string
  searchText?: string
  textHash?: string
  textExtractedAt?: string
  textExtractionStatus: DbProcessingStatus
  pageCount?: number
  hasExtractedText: boolean
  hasOcrText: boolean
  hasOcr: boolean
  ocrStatus: DbOcrStatus
  metadataStatus: DbMetadataStatus
  metadataProvenance?: string
  metadataUserEditedFields?: string
  indexingStatus: DbProcessingStatus
  tagSuggestions?: string
  rejectedTagSuggestions?: string
  tagSuggestionTextHash?: string
  tagSuggestionStatus: DbProcessingStatus
  classificationResult?: string
  classificationTextHash?: string
  classificationStatus: DbProcessingStatus
  processingError?: string
  processingUpdatedAt?: string
  lastProcessedAt?: string
  readingStage: string
  rating: number
  favorite: boolean
  lastOpenedAt?: string
  lastReadPage?: number
  commentaryText?: string
  commentaryUpdatedAt?: string
  coverImagePath?: string
  createdAt: string
  updatedAt: string
}

export type DbCreateDocumentInput = {
  id?: string
  libraryId: string
  documentType?: string
  title: string
  authors?: string
  year?: number
  abstractText?: string
  doi?: string
  isbn?: string
  publisher?: string
  citationKey?: string
  sourcePath?: string
  importedFilePath?: string
  extractedTextPath?: string
  searchText?: string
  textHash?: string
  textExtractedAt?: string
  textExtractionStatus?: DbProcessingStatus
  pageCount?: number
  hasExtractedText?: boolean
  hasOcr?: boolean
  hasOcrText?: boolean
  ocrStatus?: DbOcrStatus
  metadataStatus?: DbMetadataStatus
  metadataProvenance?: string
  metadataUserEditedFields?: string
  indexingStatus?: DbProcessingStatus
  tagSuggestions?: string
  rejectedTagSuggestions?: string
  tagSuggestionTextHash?: string
  tagSuggestionStatus?: DbProcessingStatus
  classificationResult?: string
  classificationTextHash?: string
  classificationStatus?: DbProcessingStatus
  processingError?: string
  processingUpdatedAt?: string
  lastProcessedAt?: string
  commentaryText?: string
  commentaryUpdatedAt?: string
  coverImagePath?: string
}

export type DbMergeDocumentsInput = {
  primaryDocumentId: string
  duplicateDocumentIds: string[]
}

export type DbUpdateDocumentMetadataInput = {
  documentType?: string
  title?: string
  authors?: string
  sourcePath?: string
  importedFilePath?: string
  extractedTextPath?: string
  searchText?: string
  textHash?: string
  textExtractedAt?: string
  textExtractionStatus?: DbProcessingStatus
  pageCount?: number
  hasExtractedText?: boolean
  hasOcr?: boolean
  hasOcrText?: boolean
  ocrStatus?: DbOcrStatus
  year?: number
  abstractText?: string
  doi?: string
  isbn?: string
  publisher?: string
  citationKey?: string
  metadataStatus?: DbMetadataStatus
  metadataProvenance?: string
  metadataUserEditedFields?: string
  indexingStatus?: DbProcessingStatus
  tagSuggestions?: string
  rejectedTagSuggestions?: string
  tagSuggestionTextHash?: string
  tagSuggestionStatus?: DbProcessingStatus
  classificationResult?: string
  classificationTextHash?: string
  classificationStatus?: DbProcessingStatus
  processingError?: string
  processingUpdatedAt?: string
  lastProcessedAt?: string
  readingStage?: string
  rating?: number
  favorite?: boolean
  lastOpenedAt?: string
  lastReadPage?: number
  commentaryText?: string
  commentaryUpdatedAt?: string
  coverImagePath?: string
}

export type DbStartBookCoverUploadSessionResult = {
  token: string
  url: string
  urls: string[]
}

export type DbBookCoverUploadSessionStatus = {
  status: string
  imagePath?: string
}

export type DbDocumentDoiReference = {
  id: string
  sourceDocumentId: string
  doi: string
  matchedDocumentId?: string
  createdAt: string
  updatedAt: string
}

export type DbDocumentKeyword = {
  id: number
  documentId: string
  keyword: string
  score?: number
  summary?: string
  source: string
  apiMode: string
  createdAt: string
}

export type DbInsertDocumentKeywordInput = {
  keyword: string
  score?: number
  summary?: string
  source: string
  apiMode: string
}

export type DbUsageCounter = {
  key: string
  value: string
}

export type DbReplaceDocumentDoiReferencesInput = {
  sourceDocumentId: string
  dois: string[]
}

export type DbNote = {
  id: string
  documentId?: string
  pageNumber?: number
  locationHint?: string
  commentNumber?: number
  positionX?: number
  positionY?: number
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

export type DbAnnotation = {
  id: string
  documentId: string
  pageNumber: number
  kind: string
  content?: string
  createdAt: string
}

export type DbCreateAnnotationInput = {
  documentId: string
  pageNumber: number
  kind: string
  content?: string
}

export type DbDocumentRelation = {
  id: string
  sourceDocumentId: string
  targetDocumentId: string
  linkType: string
  linkOrigin: string
  relationStatus?: string
  confidence?: number
  label?: string
  notes?: string
  matchMethod?: string
  rawReferenceText?: string
  normalizedReferenceText?: string
  normalizedTitle?: string
  normalizedFirstAuthor?: string
  referenceIndex?: number
  parseConfidence?: number
  parseWarnings?: string
  matchDebugInfo?: string
  createdAt: string
  updatedAt: string
}

export type DbReference = {
  id: string
  documentId?: string
  type: string
  citationKey?: string
  title: string
  authors?: string
  year?: number
  journal?: string
  volume?: string
  issue?: string
  pages?: string
  publisher?: string
  booktitle?: string
  doi?: string
  url?: string
  abstract?: string
  keywords?: string
  bibtex?: string
  createdAt: string
  updatedAt: string
}

export type DbCreateReferenceInput = {
  documentId?: string
  type: string
  citationKey?: string
  title: string
  authors?: string
  year?: number
  journal?: string
  volume?: string
  issue?: string
  pages?: string
  publisher?: string
  booktitle?: string
  doi?: string
  url?: string
  abstract?: string
  keywords?: string
  bibtex?: string
}

export type DbUpdateReferenceInput = Partial<DbCreateReferenceInput>

export type DbWorkReference = {
  id: string
  workDocumentId: string
  referenceId: string
  sortOrder: number
  matchedDocumentId?: string
  matchMethod?: string
  matchConfidence?: number
  createdAt: string
  updatedAt: string
  reference: DbReference
}

export type DbCreateWorkReferenceInput = {
  workDocumentId: string
  referenceId: string
  matchedDocumentId?: string
  matchMethod?: string
  matchConfidence?: number
}

export type DbCreateDocumentRelationInput = {
  sourceDocumentId: string
  targetDocumentId: string
  linkType: string
  linkOrigin: string
  relationStatus?: string
  confidence?: number
  label?: string
  notes?: string
  matchMethod?: string
  rawReferenceText?: string
  normalizedReferenceText?: string
  normalizedTitle?: string
  normalizedFirstAuthor?: string
  referenceIndex?: number
  parseConfidence?: number
  parseWarnings?: string
  matchDebugInfo?: string
}

export type DbUpdateDocumentRelationInput = {
  linkType?: string
  relationStatus?: string
  confidence?: number
  label?: string
  notes?: string
}

export type DbGraphView = {
  id: string
  libraryId: string
  name: string
  description?: string
  relationFilter: string
  colorMode: string
  sizeMode: string
  scopeMode: string
  neighborhoodDepth: string
  focusMode: boolean
  hideOrphans: boolean
  confidenceThreshold: number
  yearMin?: number
  yearMax?: number
  selectedDocumentId?: string
  documentIdsJson?: string
  createdAt: string
  updatedAt: string
}

export type DbCreateGraphViewInput = {
  libraryId: string
  name: string
  description?: string
  relationFilter: string
  colorMode: string
  sizeMode: string
  scopeMode: string
  neighborhoodDepth: string
  focusMode: boolean
  hideOrphans: boolean
  confidenceThreshold: number
  yearMin?: number
  yearMax?: number
  selectedDocumentId?: string
  documentIdsJson?: string
}

export type DbUpdateGraphViewInput = {
  name?: string
  description?: string
  relationFilter?: string
  colorMode?: string
  sizeMode?: string
  scopeMode?: string
  neighborhoodDepth?: string
  focusMode?: boolean
  hideOrphans?: boolean
  confidenceThreshold?: number
  yearMin?: number
  yearMax?: number
  selectedDocumentId?: string
  documentIdsJson?: string
}

export type DbGraphViewNodeLayout = {
  graphViewId: string
  documentId: string
  positionX: number
  positionY: number
  pinned: boolean
  hidden: boolean
  updatedAt: string
}

export type DbBackupScope = 'full' | 'documents' | 'settings'

export type DbRestoreBackupResult = {
  safetyBackup: DbBackupFileMetadata
}

export type DbBackupFileMetadata = {
  id: string
  fileName: string
  path: string
  scope: DbBackupScope
  createdAt: string
  fileSize: number
  automatic: boolean
  documentCount: number
  noteCount: number
  relationCount: number
}

export type DbUpsertGraphViewNodeLayoutInput = {
  graphViewId: string
  documentId: string
  positionX: number
  positionY: number
  pinned?: boolean
  hidden?: boolean
}

export async function listLibraries() {
  return invoke<DbLibrary[]>('list_libraries')
}

export async function listAllDocuments() {
  return invoke<DbDocument[]>('list_all_documents')
}

export async function createLibrary(input: { name: string; description?: string; color?: string }) {
  return invoke<DbLibrary>('create_library', { input })
}

export async function updateLibrary(id: string, input: { name?: string; description?: string; color?: string }) {
  return invoke<DbLibrary | null>('update_library', { id, input })
}

export async function deleteLibrary(id: string) {
  return invoke<boolean>('delete_library', { id })
}

export async function listDocumentsByLibrary(libraryId: string) {
  return invoke<DbDocument[]>('list_documents_by_library', { libraryId })
}

export async function getDocumentById(id: string) {
  return invoke<DbDocument | null>('get_document_by_id', { id })
}

export async function createDocument(input: DbCreateDocumentInput) {
  return invoke<DbDocument>('create_document', { input })
}

export async function updateDocumentMetadata(id: string, input: DbUpdateDocumentMetadataInput) {
  return invoke<DbDocument | null>('update_document_metadata', { id, input })
}

export async function deleteDocument(id: string) {
  return invoke<boolean>('delete_document', { id })
}

export async function mergeDocuments(input: DbMergeDocumentsInput) {
  return invoke<DbDocument | null>('merge_documents', { input })
}

export async function moveDocumentsToLibrary(documentIds: string[], targetLibraryId: string) {
  return invoke<DbDocument[]>('move_documents_to_library', { documentIds, targetLibraryId })
}

export async function openDocumentFileLocation(path: string) {
  return invoke<void>('open_document_file_location', { path })
}

export async function importBookCover(sourcePath: string) {
  return invoke<string>('import_book_cover', { sourcePath })
}

export async function startBookCoverUploadSession() {
  return invoke<DbStartBookCoverUploadSessionResult>('start_book_cover_upload_session')
}

export async function getBookCoverUploadSessionStatus(token: string) {
  return invoke<DbBookCoverUploadSessionStatus>('get_book_cover_upload_session_status', { token })
}

export async function addTagToDocument(documentId: string, tagName: string) {
  return invoke<void>('add_tag_to_document', { documentId, tagName })
}

export async function removeTagFromDocument(documentId: string, tagName: string) {
  return invoke<void>('remove_tag_from_document', { documentId, tagName })
}

export async function listAnnotationsForDocument(documentId: string) {
  return invoke<DbAnnotation[]>('list_annotations_for_document', { documentId })
}

export async function listAllAnnotations() {
  return invoke<DbAnnotation[]>('list_all_annotations')
}

export async function createAnnotation(input: DbCreateAnnotationInput) {
  return invoke<DbAnnotation>('create_annotation', { input })
}

export async function deleteAnnotation(id: string) {
  return invoke<boolean>('delete_annotation', { id })
}

export async function createRelation(input: DbCreateDocumentRelationInput) {
  return invoke<DbDocumentRelation>('create_document_relation', { input })
}

export async function updateRelation(id: string, input: DbUpdateDocumentRelationInput) {
  return invoke<DbDocumentRelation | null>('update_document_relation', { id, input })
}

export async function deleteRelation(id: string) {
  return invoke<boolean>('delete_document_relation', { id })
}

export async function listRelationsForLibrary(libraryId: string) {
  return invoke<DbDocumentRelation[]>('list_document_relations_for_library', { libraryId })
}

export async function listReferences() {
  return invoke<DbReference[]>('list_references')
}

export async function createReference(input: DbCreateReferenceInput) {
  return invoke<DbReference>('create_reference', { input })
}

export async function updateReference(id: string, input: DbUpdateReferenceInput) {
  return invoke<DbReference | null>('update_reference', { id, input })
}

export async function listWorkReferences(workDocumentId: string) {
  return invoke<DbWorkReference[]>('list_work_references_for_document', { workDocumentId })
}

export async function createWorkReference(input: DbCreateWorkReferenceInput) {
  return invoke<DbWorkReference>('create_work_reference', { input })
}

export async function deleteWorkReference(id: string) {
  return invoke<boolean>('delete_work_reference', { id })
}

export async function reorderWorkReferences(workDocumentId: string, workReferenceIds: string[]) {
  return invoke<DbWorkReference[]>('reorder_work_references', { workDocumentId, workReferenceIds })
}

export async function recheckWorkReferenceMatches(workDocumentId?: string) {
  return invoke<DbWorkReference[]>('recheck_work_reference_matches', { workDocumentId })
}

export async function listDocumentDoiReferencesForDocument(documentId: string) {
  return invoke<DbDocumentDoiReference[]>('list_document_doi_references_for_document', { documentId })
}

export async function listDocumentDoiReferencesPointingToDocument(documentId: string) {
  return invoke<DbDocumentDoiReference[]>('list_document_doi_references_pointing_to_document', { documentId })
}

export async function listDocumentKeywords(documentId: string) {
  return invoke<DbDocumentKeyword[]>('list_document_keywords', { documentId })
}

export async function replaceDocumentKeywords(
  documentId: string,
  keywords: DbInsertDocumentKeywordInput[],
) {
  return invoke<void>('replace_document_keywords', { documentId, keywords })
}

export async function getUsageCounter(key: string) {
  return invoke<DbUsageCounter | null>('get_usage_counter', { key })
}

export async function setUsageCounter(key: string, value: string) {
  return invoke<void>('set_usage_counter', { key, value })
}

export async function replaceDocumentDoiReferences(input: DbReplaceDocumentDoiReferencesInput) {
  return invoke<DbDocumentDoiReference[]>('replace_document_doi_references', { input })
}

export async function recheckDocumentDoiReferences() {
  return invoke<DbDocumentDoiReference[]>('recheck_document_doi_references')
}

export async function rebuildAutoCitationRelations(libraryId: string) {
  return invoke<DbDocumentRelation[]>('rebuild_auto_citation_relations', {
    input: { libraryId },
  })
}

export async function rebuildAutoCitationRelationsForDocument(documentId: string) {
  return invoke<DbDocumentRelation[]>('rebuild_auto_citation_relations_for_document', {
    input: { documentId },
  })
}

export async function listGraphViews(libraryId: string) {
  return invoke<DbGraphView[]>('list_graph_views', { libraryId })
}

export async function createGraphView(input: DbCreateGraphViewInput) {
  return invoke<DbGraphView>('create_graph_view', { input })
}

export async function updateGraphView(id: string, input: DbUpdateGraphViewInput) {
  return invoke<DbGraphView | null>('update_graph_view', { id, input })
}

export async function deleteGraphView(id: string) {
  return invoke<boolean>('delete_graph_view', { id })
}

export async function duplicateGraphView(id: string) {
  return invoke<DbGraphView>('duplicate_graph_view', { id })
}

export async function listGraphViewNodeLayouts(graphViewId: string) {
  return invoke<DbGraphViewNodeLayout[]>('list_graph_view_node_layouts', { graphViewId })
}

export async function upsertGraphViewNodeLayout(input: DbUpsertGraphViewNodeLayoutInput) {
  return invoke<DbGraphViewNodeLayout>('upsert_graph_view_node_layout', { input })
}

export async function resetGraphViewNodeLayouts(graphViewId: string, documentId?: string) {
  return invoke<void>('reset_graph_view_node_layouts', { graphViewId, documentId })
}

export async function createNote(input: {
  documentId?: string
  pageNumber?: number
  locationHint?: string
  commentNumber?: number
  positionX?: number
  positionY?: number
  title: string
  content: string
}) {
  return invoke<DbNote>('create_note', { input })
}

export async function updateNote(id: string, input: {
  pageNumber?: number
  locationHint?: string
  commentNumber?: number
  positionX?: number
  positionY?: number
  title?: string
  content?: string
}) {
  return invoke<DbNote | null>('update_note', { id, input })
}

export async function listNotes() {
  return invoke<DbNote[]>('list_notes')
}

export async function deleteNote(id: string) {
  return invoke<boolean>('delete_note', { id })
}

export async function getSettings() {
  return invoke<Record<string, string>>('get_settings')
}

export async function setSettings(values: Record<string, string>) {
  return invoke<void>('set_settings', { input: { values } })
}

export async function getDefaultGeminiApiKey() {
  return invoke<string>('get_default_gemini_api_key')
}

export async function clearLocalData() {
  return invoke<void>('clear_local_data')
}

export async function createBackup(scope: DbBackupScope, automatic?: boolean, outputPath?: string) {
  return invoke<DbBackupFileMetadata>('create_backup', {
    input: { scope, automatic, outputPath },
  })
}

export async function listBackups() {
  return invoke<DbBackupFileMetadata[]>('list_backups')
}

export async function deleteBackup(path: string) {
  return invoke<boolean>('delete_backup', { path })
}

export async function restoreBackup(path: string) {
  return invoke<DbRestoreBackupResult>('restore_backup', {
    input: { path },
  })
}

export async function runScheduledBackupIfDue(scope: DbBackupScope, intervalDays: number, keepCount: number) {
  return invoke<DbBackupFileMetadata | null>('run_scheduled_backup_if_due', {
    input: { scope, intervalDays, keepCount },
  })
}
