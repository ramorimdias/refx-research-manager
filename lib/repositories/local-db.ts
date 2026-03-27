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

export async function initializeDatabase() {
  return invoke<void>('initialize_database')
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

export async function moveDocumentsToLibrary(documentIds: string[], targetLibraryId: string) {
  return invoke<DbDocument[]>('move_documents_to_library', { documentIds, targetLibraryId })
}

export async function openDocumentFileLocation(path: string) {
  return invoke<void>('open_document_file_location', { path })
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

export async function clearLocalData() {
  return invoke<void>('clear_local_data')
}
