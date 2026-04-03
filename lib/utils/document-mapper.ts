import * as repo from '@/lib/repositories/local-db'
import { parseDocumentClassification } from '@/lib/services/document-classification-service'
import {
  parseMetadataProvenance,
  parseMetadataUserEditedFields,
} from '@/lib/services/document-metadata-service'
import { normalizeReadingStage } from '@/lib/services/document-reading-stage'
import {
  getDocumentRejectedSuggestedTags,
  getDocumentSuggestedTags,
} from '@/lib/services/document-tag-suggestion-service'
import type { Document, MetadataStatus } from '@/lib/types'

export function dbDocumentToUi(
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
