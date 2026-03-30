'use client'

import { appDataDir, copyFile, join, mkdir } from '@/lib/tauri/client'
import * as repo from '@/lib/repositories/local-db'
import { loadAppSettings } from '@/lib/app-settings'
import { buildDocumentMetadataSeed, enrichDocumentMetadataOnline } from '@/lib/services/document-enrichment-service'
import { rebuildCitationRelationsForDocument } from '@/lib/services/document-citation-relation-service'
import { classifyDocumentSemantics } from '@/lib/services/document-classification-service'
import { extractLocalPdfMetadata, mergeExtractedMetadataIntoDocument, type LocalPdfMetadata } from '@/lib/services/document-metadata-service'
import { runDocumentOcr } from '@/lib/services/document-ocr-service'
import { generateDocumentTagSuggestions } from '@/lib/services/document-tag-suggestion-service'
import { extractDocumentText, indexDocument } from '@/lib/services/document-search-service'
import type { Document, DocumentProcessingStage, DocumentProcessingStageState, SemanticClassificationMode } from '@/lib/types'
import { normalizeErrorMessage } from '@/lib/utils/error'

type ProcessingContext = {
  document: repo.DbDocument | null
  documentId?: string
  importedFilePath?: string
  localMetadata?: LocalPdfMetadata
  sourcePath: string
}

export type DocumentIngestionOptions = {
  enableOcrFallback?: boolean
  enableOnlineMetadataEnrichment?: boolean
  enableSemanticClassification?: boolean
  semanticClassificationMode?: SemanticClassificationMode
  enableTagSuggestion?: boolean
  forceStages?: DocumentProcessingStage[]
  onStageUpdate?: (stage: DocumentProcessingStageState) => void
}

type ResolvedDocumentIngestionOptions =
  Omit<Required<DocumentIngestionOptions>, 'onStageUpdate'>
  & Pick<DocumentIngestionOptions, 'onStageUpdate'>

export type ImportPdfDocumentInput = {
  libraryId: string
  sourcePath: string
}

export type DocumentIngestionResult = {
  document: repo.DbDocument | null
  documentId?: string
  stages: DocumentProcessingStageState[]
  success: boolean
  error?: string
}

const DEFAULT_PIPELINE_OPTIONS: ResolvedDocumentIngestionOptions = {
  enableOcrFallback: true,
  enableOnlineMetadataEnrichment: false,
  enableSemanticClassification: false,
  semanticClassificationMode: 'off',
  enableTagSuggestion: true,
  forceStages: [],
  onStageUpdate: undefined,
}

export const DOCUMENT_INGESTION_STAGE_ORDER: DocumentProcessingStage[] = [
  'import_pdf',
  'local_metadata_extraction',
  'text_extraction',
  'ocr_fallback',
  'save_document',
  'indexing',
  'citation_linking',
  'tag_suggestion',
  'semantic_classification',
  'online_metadata_enrichment',
]

function titleFromPath(filePath: string) {
  const name = filePath.split(/[\\/]/).pop() ?? 'Untitled'
  return name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim()
}

function toAppDocument(document: repo.DbDocument): Document {
  const authors = (() => {
    if (Array.isArray(document.authors)) return document.authors
    if (typeof document.authors !== 'string') return []
    try {
      const parsed = JSON.parse(document.authors)
      return Array.isArray(parsed) ? parsed : [document.authors]
    } catch {
      return document.authors ? [document.authors] : []
    }
  })()

  return {
    id: document.id,
    libraryId: document.libraryId,
    documentType: document.documentType === 'physical_book' ? 'physical_book' : 'pdf',
    title: document.title,
    authors,
    year: document.year,
    abstract: document.abstractText,
    doi: document.doi,
    isbn: document.isbn,
    publisher: document.publisher,
    citationKey: document.citationKey ?? '',
    sourcePath: document.sourcePath,
    importedFilePath: document.importedFilePath,
    extractedTextPath: document.extractedTextPath,
    filePath: document.importedFilePath ?? document.sourcePath,
    searchText: document.searchText,
    textHash: document.textHash,
    textExtractedAt: document.textExtractedAt ? new Date(document.textExtractedAt) : undefined,
    textExtractionStatus: document.textExtractionStatus ?? 'pending',
    pageCount: document.pageCount,
    hasExtractedText: document.hasExtractedText ?? Boolean(document.searchText || document.extractedTextPath),
    hasOcrText: document.hasOcrText ?? false,
    hasOcr: document.hasOcr ?? false,
    ocrStatus: (document.ocrStatus ?? 'pending') as Document['ocrStatus'],
    metadataStatus: (document.metadataStatus ?? 'missing') as Document['metadataStatus'],
    indexingStatus: document.indexingStatus ?? 'pending',
    tagSuggestionTextHash: document.tagSuggestionTextHash,
    tagSuggestionStatus: document.tagSuggestionStatus ?? 'pending',
    classificationTextHash: document.classificationTextHash,
    classificationStatus: document.classificationStatus ?? 'pending',
    processingError: document.processingError ?? undefined,
    processingUpdatedAt: document.processingUpdatedAt ? new Date(document.processingUpdatedAt) : undefined,
    lastProcessedAt: document.lastProcessedAt ? new Date(document.lastProcessedAt) : undefined,
    readingStage: (document.readingStage ?? 'unread') as Document['readingStage'],
    rating: document.rating ?? 0,
    favorite: document.favorite ?? false,
    tags: document.tags ?? [],
    commentCount: 0,
    notesCount: 0,
    commentaryText: document.commentaryText,
    commentaryUpdatedAt: document.commentaryUpdatedAt ? new Date(document.commentaryUpdatedAt) : undefined,
    addedAt: document.createdAt ? new Date(document.createdAt) : new Date(),
    lastOpenedAt: document.lastOpenedAt ? new Date(document.lastOpenedAt) : undefined,
    lastReadPage: document.lastReadPage,
    createdAt: document.createdAt ? new Date(document.createdAt) : new Date(),
    updatedAt: document.updatedAt ? new Date(document.updatedAt) : new Date(),
  }
}

function mergePipelineOptions(options?: DocumentIngestionOptions) {
  const semanticClassificationMode =
    options?.semanticClassificationMode
    ?? (options?.enableSemanticClassification ? 'local_heuristic' : DEFAULT_PIPELINE_OPTIONS.semanticClassificationMode)

  return {
    ...DEFAULT_PIPELINE_OPTIONS,
    ...options,
    enableSemanticClassification:
      options?.enableSemanticClassification
      ?? semanticClassificationMode !== 'off',
    semanticClassificationMode,
    forceStages: options?.forceStages ?? [],
  }
}

function isForced(stage: DocumentProcessingStage, options: ResolvedDocumentIngestionOptions) {
  return options.forceStages.includes(stage)
}

function nowIso() {
  return new Date().toISOString()
}

function stageLabel(stage: DocumentProcessingStage) {
  return stage.replace(/_/g, ' ')
}

function stageCompleted(stage: DocumentProcessingStage, startedAt: Date, detail?: string): DocumentProcessingStageState {
  return {
    stage,
    status: 'completed',
    detail,
    startedAt,
    completedAt: new Date(),
  }
}

function stageSkipped(stage: DocumentProcessingStage, detail?: string): DocumentProcessingStageState {
  const timestamp = new Date()
  return {
    stage,
    status: 'skipped',
    detail,
    startedAt: timestamp,
    completedAt: timestamp,
  }
}

function stageFailed(stage: DocumentProcessingStage, startedAt: Date, error: string): DocumentProcessingStageState {
  return {
    stage,
    status: 'failed',
    error,
    startedAt,
    completedAt: new Date(),
  }
}

async function refreshContextDocument(context: ProcessingContext) {
  if (!context.documentId) return null
  context.document = await repo.getDocumentById(context.documentId)
  return context.document
}

async function updateStageStart(documentId: string, stage: DocumentProcessingStage) {
  const timestamp = nowIso()

  switch (stage) {
    case 'text_extraction':
      await repo.updateDocumentMetadata(documentId, {
        processingError: '',
        processingUpdatedAt: timestamp,
        textExtractionStatus: 'processing',
      })
      return
    case 'indexing':
      await repo.updateDocumentMetadata(documentId, {
        indexingStatus: 'processing',
        processingError: '',
        processingUpdatedAt: timestamp,
      })
      return
    case 'tag_suggestion':
      await repo.updateDocumentMetadata(documentId, {
        tagSuggestionStatus: 'processing',
        processingError: '',
        processingUpdatedAt: timestamp,
      })
      return
    case 'semantic_classification':
      await repo.updateDocumentMetadata(documentId, {
        classificationStatus: 'processing',
        processingError: '',
        processingUpdatedAt: timestamp,
      })
      return
    case 'ocr_fallback':
      await repo.updateDocumentMetadata(documentId, {
        ocrStatus: 'processing',
        processingError: '',
        processingUpdatedAt: timestamp,
      })
      return
    default:
      await repo.updateDocumentMetadata(documentId, {
        processingError: '',
        processingUpdatedAt: timestamp,
      })
  }
}

async function updateStageFailure(documentId: string, stage: DocumentProcessingStage, error: unknown) {
  const timestamp = nowIso()
  const message = normalizeErrorMessage(error)
  const stageError = `${stageLabel(stage)} failed: ${message}`

  switch (stage) {
    case 'text_extraction':
      await repo.updateDocumentMetadata(documentId, {
        lastProcessedAt: timestamp,
        processingError: stageError,
        processingUpdatedAt: timestamp,
        textExtractionStatus: 'failed',
      })
      return stageError
    case 'indexing':
      await repo.updateDocumentMetadata(documentId, {
        indexingStatus: 'failed',
        lastProcessedAt: timestamp,
        processingError: stageError,
        processingUpdatedAt: timestamp,
      })
      return stageError
    case 'tag_suggestion':
      await repo.updateDocumentMetadata(documentId, {
        lastProcessedAt: timestamp,
        processingError: stageError,
        processingUpdatedAt: timestamp,
        tagSuggestionStatus: 'failed',
      })
      return stageError
    case 'semantic_classification':
      await repo.updateDocumentMetadata(documentId, {
        classificationStatus: 'failed',
        lastProcessedAt: timestamp,
        processingError: stageError,
        processingUpdatedAt: timestamp,
      })
      return stageError
    case 'ocr_fallback':
      await repo.updateDocumentMetadata(documentId, {
        lastProcessedAt: timestamp,
        ocrStatus: 'failed',
        processingError: stageError,
        processingUpdatedAt: timestamp,
      })
      return stageError
    default:
      await repo.updateDocumentMetadata(documentId, {
        lastProcessedAt: timestamp,
        processingError: stageError,
        processingUpdatedAt: timestamp,
      })
      return stageError
  }
}

function metadataFilePath(context: ProcessingContext) {
  return context.importedFilePath ?? context.sourcePath
}

async function applyMetadata(document: repo.DbDocument, metadata: LocalPdfMetadata) {
  const timestamp = nowIso()
  return repo.updateDocumentMetadata(document.id, {
    ...mergeExtractedMetadataIntoDocument(document, metadata),
    lastProcessedAt: timestamp,
    processingUpdatedAt: timestamp,
  })
}

async function runLocalMetadataExtractionStage(
  context: ProcessingContext,
  options: ResolvedDocumentIngestionOptions,
) {
  const stage: DocumentProcessingStage = 'local_metadata_extraction'
  const startedAt = new Date()
  const document = context.document

  if (!document || !context.documentId) {
    return stageSkipped(stage, 'Document record is not available yet.')
  }

  if (!isForced(stage, options) && document.metadataStatus === 'complete') {
    return stageSkipped(stage, 'Metadata is already populated.')
  }

  try {
    await updateStageStart(context.documentId, stage)
    const metadata = await extractLocalPdfMetadata(metadataFilePath(context), context.sourcePath)
    context.localMetadata = metadata
    await applyMetadata(document, metadata)
    await refreshContextDocument(context)
    return stageCompleted(stage, startedAt, `Local PDF metadata extracted${metadata.pageCount ? ` (${metadata.pageCount} page(s)).` : '.'}`)
  } catch (error) {
    const stageError = await updateStageFailure(context.documentId, stage, error)
    return stageFailed(stage, startedAt, stageError)
  }
}

async function runTextExtractionStage(
  context: ProcessingContext,
  options: ResolvedDocumentIngestionOptions,
) {
  const stage: DocumentProcessingStage = 'text_extraction'
  const startedAt = new Date()
  const document = context.document

  if (!document || !context.documentId) {
    return stageSkipped(stage, 'Document record is not available yet.')
  }

  if (!isForced(stage, options) && document.textExtractionStatus === 'complete' && document.hasExtractedText) {
    return stageSkipped(stage, 'Extracted text is already available.')
  }

  try {
    await updateStageStart(context.documentId, stage)
    const extracted = await extractDocumentText(context.documentId)
    await refreshContextDocument(context)
    const detail = extracted.isOcrCandidate
      ? `Persisted ${extracted.pageCount} page(s) of sparse text and marked the document as an OCR candidate.`
      : `Persisted ${extracted.pageCount} page(s) of extracted text.`
    return stageCompleted(stage, startedAt, detail)
  } catch (error) {
    const stageError = await updateStageFailure(context.documentId, stage, error)
    await refreshContextDocument(context)
    return stageFailed(stage, startedAt, stageError)
  }
}

async function runOcrFallbackStage(
  context: ProcessingContext,
  options: ResolvedDocumentIngestionOptions,
) {
  const stage: DocumentProcessingStage = 'ocr_fallback'
  const startedAt = new Date()
  const forced = isForced(stage, options)

  if (!context.document || !context.documentId) {
    return stageSkipped(stage, 'Document record is not available yet.')
  }

  if (!forced && context.document.ocrStatus === 'not_needed') {
    await repo.updateDocumentMetadata(context.documentId, {
      ocrStatus: 'not_needed',
      processingUpdatedAt: nowIso(),
    })
    await refreshContextDocument(context)
    return stageSkipped(stage, 'OCR fallback is not needed because extracted text already exists.')
  }

  if (!forced && context.document.ocrStatus === 'complete' && context.document.hasOcrText) {
    return stageSkipped(stage, 'OCR text already exists for this document.')
  }

  if (!options.enableOcrFallback && !forced) {
    return stageSkipped(stage, 'OCR fallback is disabled for this run.')
  }

  try {
    await updateStageStart(context.documentId, stage)
    const ocrResult = await runDocumentOcr(context.documentId)
    await refreshContextDocument(context)

    if (!ocrResult.hasOcrText) {
      return stageSkipped(stage, 'OCR completed without producing usable text.')
    }

    return stageCompleted(
      stage,
      startedAt,
      `OCR completed for ${ocrResult.pageCount} page(s) and promoted OCR text into the shared text store.`,
    )
  } catch (error) {
    const stageError = await updateStageFailure(context.documentId, stage, error)
    await refreshContextDocument(context)
    return stageFailed(stage, startedAt, stageError)
  }
}

async function runSaveDocumentStage(context: ProcessingContext) {
  const stage: DocumentProcessingStage = 'save_document'
  const startedAt = new Date()

  if (!context.documentId) {
    return stageSkipped(stage, 'Document record is not available yet.')
  }

  try {
    await repo.updateDocumentMetadata(context.documentId, {
      lastProcessedAt: nowIso(),
      processingUpdatedAt: nowIso(),
    })
    await refreshContextDocument(context)
    return stageCompleted(stage, startedAt, 'Document state persisted.')
  } catch (error) {
    const stageError = await updateStageFailure(context.documentId, stage, error)
    return stageFailed(stage, startedAt, stageError)
  }
}

async function runIndexingStage(
  context: ProcessingContext,
  options: ResolvedDocumentIngestionOptions,
) {
  const stage: DocumentProcessingStage = 'indexing'
  const startedAt = new Date()
  const document = context.document

  if (!document || !context.documentId) {
    return stageSkipped(stage, 'Document record is not available yet.')
  }

  if (!document.hasExtractedText && !document.hasOcrText) {
    await repo.updateDocumentMetadata(context.documentId, {
      indexingStatus: 'pending',
      processingUpdatedAt: nowIso(),
    })
    return stageSkipped(stage, 'Indexing is waiting for extracted or OCR text.')
  }

  if (!isForced(stage, options) && document.indexingStatus === 'complete') {
    return stageSkipped(stage, 'Document index is already current.')
  }

  try {
    await updateStageStart(context.documentId, stage)
    await indexDocument(context.documentId)
    await refreshContextDocument(context)
    return stageCompleted(stage, startedAt, 'Local full-text index updated.')
  } catch (error) {
    const stageError = await updateStageFailure(context.documentId, stage, error)
    await refreshContextDocument(context)
    return stageFailed(stage, startedAt, stageError)
  }
}

async function runTagSuggestionStage(
  context: ProcessingContext,
  options: ResolvedDocumentIngestionOptions,
) {
  const stage: DocumentProcessingStage = 'tag_suggestion'
  const startedAt = new Date()
  const document = context.document

  if (!document || !context.documentId) {
    return stageSkipped(stage, 'Document record is not available yet.')
  }

  if (!document.hasExtractedText && !document.hasOcrText) {
    await repo.updateDocumentMetadata(context.documentId, {
      processingUpdatedAt: nowIso(),
      tagSuggestionStatus: 'pending',
    })
    return stageSkipped(stage, 'Tag suggestion is waiting for extracted or OCR text.')
  }

  if (!options.enableTagSuggestion) {
    await repo.updateDocumentMetadata(context.documentId, {
      processingUpdatedAt: nowIso(),
      tagSuggestionStatus: 'skipped',
    })
    return stageSkipped(stage, 'Tag suggestion is disabled for this run.')
  }

  if (!isForced(stage, options) && document.tagSuggestionStatus === 'complete' && document.tagSuggestionTextHash && document.tagSuggestionTextHash === document.textHash) {
    return stageSkipped(stage, 'Tag suggestions already match the current extracted text.')
  }

  try {
    await updateStageStart(context.documentId, stage)
    const result = await generateDocumentTagSuggestions(context.documentId)
    await refreshContextDocument(context)
    return stageCompleted(
      stage,
      startedAt,
      result.suggestedTags.length > 0
        ? `Generated ${result.suggestedTags.length} local tag suggestion(s).`
        : 'No strong local tag suggestions were found for this document.',
    )
  } catch (error) {
    const stageError = await updateStageFailure(context.documentId, stage, error)
    await refreshContextDocument(context)
    return stageFailed(stage, startedAt, stageError)
  }
}

async function runCitationLinkingStage(
  context: ProcessingContext,
  _options: ResolvedDocumentIngestionOptions,
) {
  const stage: DocumentProcessingStage = 'citation_linking'
  const startedAt = new Date()
  const document = context.document

  if (!document || !context.documentId) {
    return stageSkipped(stage, 'Document record is not available yet.')
  }

  if (!document.hasExtractedText && !document.hasOcrText) {
    return stageSkipped(stage, 'Citation linking is waiting for extracted or OCR text.')
  }

  try {
    await updateStageStart(context.documentId, stage)
    const libraryDocuments = (await repo.listDocumentsByLibrary(document.libraryId)).map(toAppDocument)
    const sourceDocument = libraryDocuments.find((entry) => entry.id === context.documentId)
    if (!sourceDocument) {
      return stageSkipped(stage, 'Document is no longer available in the active library.')
    }

    const createdRelations = await rebuildCitationRelationsForDocument(sourceDocument, libraryDocuments)
    await refreshContextDocument(context)

    return stageCompleted(
      stage,
      startedAt,
      createdRelations.length > 0
        ? `Created ${createdRelations.length} automatic citation relation(s).`
        : 'No in-library citation matches were found.',
    )
  } catch (error) {
    const stageError = await updateStageFailure(context.documentId, stage, error)
    await refreshContextDocument(context)
    return stageFailed(stage, startedAt, stageError)
  }
}

async function runSemanticClassificationStage(
  context: ProcessingContext,
  options: ResolvedDocumentIngestionOptions,
) {
  const stage: DocumentProcessingStage = 'semantic_classification'
  const startedAt = new Date()
  const document = context.document

  if (!document || !context.documentId) {
    return stageSkipped(stage, 'Document record is not available yet.')
  }

  if (!document.hasExtractedText && !document.hasOcrText) {
    await repo.updateDocumentMetadata(context.documentId, {
      classificationStatus: 'pending',
      processingUpdatedAt: nowIso(),
    })
    return stageSkipped(stage, 'Semantic classification is waiting for extracted or OCR text.')
  }

  if (!options.enableSemanticClassification || options.semanticClassificationMode === 'off') {
    await repo.updateDocumentMetadata(context.documentId, {
      classificationStatus: 'skipped',
      processingUpdatedAt: nowIso(),
    })
    return stageSkipped(stage, 'Advanced semantic classification is disabled for this run.')
  }

  if (
    !isForced(stage, options)
    && document.classificationStatus === 'complete'
    && document.classificationTextHash
    && document.classificationTextHash === document.textHash
  ) {
    return stageSkipped(stage, 'Semantic classification already matches the current extracted text.')
  }

  try {
    await updateStageStart(context.documentId, stage)
    const result = await classifyDocumentSemantics(context.documentId, {
      mode: options.semanticClassificationMode,
    })
    await refreshContextDocument(context)
    return stageCompleted(
      stage,
      startedAt,
      `${result.classification.category}: ${result.classification.topic} (${Math.round(result.classification.confidence * 100)}% confidence).`,
    )
  } catch (error) {
    const stageError = await updateStageFailure(context.documentId, stage, error)
    await refreshContextDocument(context)
    return stageFailed(stage, startedAt, stageError)
  }
}

async function runOnlineMetadataEnrichmentStage(
  context: ProcessingContext,
  options: ResolvedDocumentIngestionOptions,
) {
  const stage: DocumentProcessingStage = 'online_metadata_enrichment'
  const startedAt = new Date()
  const forced = isForced(stage, options)

  if (!context.document || !context.documentId) {
    return stageSkipped(stage, 'Document record is not available yet.')
  }

  if (!options.enableOnlineMetadataEnrichment) {
    return stageSkipped(stage, 'Online metadata enrichment is disabled for this run.')
  }

  if (!forced && context.document.metadataStatus === 'complete') {
    return stageSkipped(stage, 'Metadata is already complete.')
  }

  try {
    await updateStageStart(context.documentId, stage)
    const settings = await loadAppSettings(true)
    const enriched = await enrichDocumentMetadataOnline(
      buildDocumentMetadataSeed(context.document, context.localMetadata),
      {
        crossrefContactEmail: settings.crossrefContactEmail,
        semanticScholarApiKey: settings.semanticScholarApiKey,
      },
    )

    if (!enriched) {
      return stageSkipped(stage, 'No online metadata match was found.')
    }

    await applyMetadata(context.document, enriched.metadata)
    await refreshContextDocument(context)
    const providers = enriched.matches.map((match) => `${match.source.replace(/_/g, ' ')} (${match.matchedBy})`).join(', ')
    return stageCompleted(stage, startedAt, `Online metadata enrichment applied from ${providers}.`)
  } catch (error) {
    const stageError = await updateStageFailure(context.documentId, stage, error)
    return stageFailed(stage, startedAt, stageError)
  }
}

async function runProcessingStages(
  context: ProcessingContext,
  options?: DocumentIngestionOptions,
) {
  const resolvedOptions = mergePipelineOptions(options)
  const stages: DocumentProcessingStageState[] = []
  const pushStage = (stage: DocumentProcessingStageState) => {
    stages.push(stage)
    resolvedOptions.onStageUpdate?.(stage)
  }

  pushStage(await runLocalMetadataExtractionStage(context, resolvedOptions))
  pushStage(await runTextExtractionStage(context, resolvedOptions))
  pushStage(await runOcrFallbackStage(context, resolvedOptions))
  pushStage(await runSaveDocumentStage(context))
  pushStage(await runIndexingStage(context, resolvedOptions))
  pushStage(await runCitationLinkingStage(context, resolvedOptions))
  pushStage(await runTagSuggestionStage(context, resolvedOptions))
  pushStage(await runSemanticClassificationStage(context, resolvedOptions))
  pushStage(await runOnlineMetadataEnrichmentStage(context, resolvedOptions))

  await refreshContextDocument(context)

  return {
    document: context.document,
    documentId: context.documentId,
    stages,
    success: stages.every((stage) => stage.status !== 'failed'),
  } satisfies DocumentIngestionResult
}

export async function resumeDocumentIngestion(documentId: string, options?: DocumentIngestionOptions) {
  const document = await repo.getDocumentById(documentId)
  if (!document) {
    return {
      document: null,
      documentId,
      stages: [{
        stage: 'save_document',
        status: 'failed',
        error: `Document ${documentId} was not found.`,
        startedAt: new Date(),
        completedAt: new Date(),
      }],
      success: false,
    } satisfies DocumentIngestionResult
  }

  return runProcessingStages(
    {
      document,
      documentId,
      importedFilePath: document.importedFilePath,
      sourcePath: document.sourcePath ?? document.importedFilePath ?? '',
    },
    options,
  )
}

export async function ingestImportedPdfDocument(input: ImportPdfDocumentInput, options?: DocumentIngestionOptions) {
  const stages: DocumentProcessingStageState[] = []
  const importStartedAt = new Date()
  let documentId: string | undefined

  try {
    const base = await appDataDir()
    const targetDir = await join(base, 'pdfs', input.libraryId)
    try {
      await mkdir(targetDir, { recursive: true })
    } catch (error) {
      throw new Error(`Could not create import directory "${targetDir}": ${normalizeErrorMessage(error)}`)
    }

    documentId = `doc-${crypto.randomUUID()}`
    const importedFilePath = await join(targetDir, `${documentId}.pdf`)
    try {
      await copyFile(input.sourcePath, importedFilePath)
    } catch (error) {
      throw new Error(
        `Could not copy "${input.sourcePath}" to "${importedFilePath}": ${normalizeErrorMessage(error)}`,
      )
    }

    const created = await repo.createDocument({
      id: documentId,
      importedFilePath,
      libraryId: input.libraryId,
      metadataStatus: 'missing',
      sourcePath: input.sourcePath,
      textExtractionStatus: 'pending',
      title: titleFromPath(input.sourcePath),
      authors: '[]',
      ocrStatus: 'pending',
      indexingStatus: 'pending',
      tagSuggestionStatus: 'pending',
      classificationStatus: 'pending',
    }).catch((error) => {
      throw new Error(`Could not create the local document record: ${normalizeErrorMessage(error)}`)
    })

    const importStage = stageCompleted('import_pdf', importStartedAt, 'PDF copied into local library storage.')
    stages.push(importStage)
    options?.onStageUpdate?.(importStage)

    const pipelineResult = await runProcessingStages(
      {
        document: created,
        documentId: created.id,
        importedFilePath,
        sourcePath: input.sourcePath,
      },
      options,
    )

    return {
      ...pipelineResult,
      stages: [...stages, ...pipelineResult.stages],
    } satisfies DocumentIngestionResult
  } catch (error) {
    const message = normalizeErrorMessage(error)
    const failedImportStage = stageFailed('import_pdf', importStartedAt, message)
    stages.push(failedImportStage)
    options?.onStageUpdate?.(failedImportStage)
    return {
      document: null,
      documentId,
      error: message,
      stages,
      success: false,
    } satisfies DocumentIngestionResult
  }
}
