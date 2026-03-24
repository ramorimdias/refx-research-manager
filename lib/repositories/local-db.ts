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

export type DbDocument = {
  id: string
  libraryId: string
  title: string
  authors: string
  tags: string[]
  year?: number
  abstractText?: string
  doi?: string
  citationKey?: string
  sourcePath?: string
  importedFilePath?: string
  searchText?: string
  pageCount?: number
  hasOcr: boolean
  ocrStatus: string
  metadataStatus: string
  readingStage: string
  rating: number
  favorite: boolean
  lastOpenedAt?: string
  lastReadPage?: number
  createdAt: string
  updatedAt: string
}

export type DbNote = {
  id: string
  documentId?: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
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

export async function listDocumentsByLibrary(libraryId: string) {
  return invoke<DbDocument[]>('list_documents_by_library', { libraryId })
}

export async function getDocumentById(id: string) {
  return invoke<DbDocument | null>('get_document_by_id', { id })
}

export async function createDocument(input: {
  id?: string
  libraryId: string
  title: string
  authors?: string
  year?: number
  abstractText?: string
  doi?: string
  citationKey?: string
  sourcePath?: string
  importedFilePath?: string
}) {
  return invoke<DbDocument>('create_document', { input })
}

export async function updateDocumentMetadata(id: string, input: Record<string, unknown>) {
  return invoke<DbDocument | null>('update_document_metadata', { id, input })
}

export async function deleteDocument(id: string) {
  return invoke<boolean>('delete_document', { id })
}

export async function addTagToDocument(documentId: string, tagName: string) {
  return invoke<void>('add_tag_to_document', { documentId, tagName })
}

export async function removeTagFromDocument(documentId: string, tagId: string) {
  return invoke<void>('remove_tag_from_document', { documentId, tagId })
}

export async function listAnnotationsForDocument(documentId: string) {
  return invoke<Array<{ id: string; pageNumber: number; kind: string; content?: string; createdAt: string }>>('list_annotations_for_document', { documentId })
}

export async function createNote(input: { documentId?: string; title: string; content: string }) {
  return invoke<DbNote>('create_note', { input })
}

export async function listNotes() {
  return invoke<DbNote[]>('list_notes')
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
