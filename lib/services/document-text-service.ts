'use client'

import * as repo from '@/lib/repositories/local-db'
import { appDataDir, exists, join, mkdir, readTextFile, writeTextFile } from '@/lib/tauri/client'
import { extractPdfDocumentText } from '@/lib/services/document-processing'

export type PersistedDocumentTextPage = {
  pageNumber: number
  text: string
}

export type DocumentTextSource = 'native' | 'ocr'

export type PersistedDocumentTextVariant = {
  confidence?: number
  extractedAt: string
  pageCount: number
  pages: PersistedDocumentTextPage[]
  text: string
}

export type PersistedDocumentText = {
  activeSource: DocumentTextSource
  documentId: string
  extractedAt: string
  native?: PersistedDocumentTextVariant
  ocr?: PersistedDocumentTextVariant
  pageCount: number
  pages: PersistedDocumentTextPage[]
  text: string
  version: number
}

export type ExtractedDocumentTextResult = {
  activeSource: DocumentTextSource
  documentId: string
  extractedAt: string
  extractedTextPath: string
  hasExtractedText: boolean
  isOcrCandidate: boolean
  pageCount: number
  text: string
  textExtractionStatus: repo.DbProcessingStatus
  textHash: string
}

const DOCUMENT_TEXT_DIR_NAME = 'document-text'
const DOCUMENT_TEXT_STORAGE_VERSION = 2
const LEGACY_DOCUMENT_TEXT_STORAGE_VERSION = 1
const OCR_CANDIDATE_MIN_TOTAL_CHARS = 240
const OCR_CANDIDATE_MIN_AVG_PAGE_CHARS = 80

function normalizeText(input?: string | null) {
  return (input ?? '').trim()
}

function hasVariantText(variant?: PersistedDocumentTextVariant | null) {
  return normalizeText(variant?.text).length > 0
}

async function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
}

async function getDocumentTextDirPath() {
  const base = await appDataDir()
  const dirPath = await join(base, DOCUMENT_TEXT_DIR_NAME)
  await mkdir(dirPath, { recursive: true })
  return dirPath
}

export async function getDocumentTextFilePath(documentId: string) {
  const dirPath = await getDocumentTextDirPath()
  return join(dirPath, `${documentId}.json`)
}

function normalizePages(input: unknown) {
  if (!Array.isArray(input)) return []

  return input
    .map((page) => ({
      pageNumber: typeof page?.pageNumber === 'number' ? page.pageNumber : 0,
      text: normalizeText(typeof page?.text === 'string' ? page.text : ''),
    }))
    .filter((page) => page.pageNumber > 0)
}

function normalizePersistedVariant(input: unknown) {
  if (!input || typeof input !== 'object') return undefined

  const pages = normalizePages((input as { pages?: unknown }).pages)
  const text = normalizeText((input as { text?: string | null }).text)
  const pageCount = typeof (input as { pageCount?: unknown }).pageCount === 'number'
    ? (input as { pageCount: number }).pageCount
    : pages.length

  return {
    confidence: typeof (input as { confidence?: unknown }).confidence === 'number'
      ? (input as { confidence: number }).confidence
      : undefined,
    extractedAt: typeof (input as { extractedAt?: unknown }).extractedAt === 'string'
      ? (input as { extractedAt: string }).extractedAt
      : new Date().toISOString(),
    pageCount,
    pages,
    text,
  } satisfies PersistedDocumentTextVariant
}

function selectActiveSource(
  variants: Pick<PersistedDocumentText, 'native' | 'ocr'>,
  preferredSource: DocumentTextSource,
): DocumentTextSource {
  if (preferredSource === 'ocr' && hasVariantText(variants.ocr)) return 'ocr'
  if (preferredSource === 'native' && hasVariantText(variants.native)) return 'native'
  if (hasVariantText(variants.ocr)) return 'ocr'
  if (hasVariantText(variants.native)) return 'native'
  if (variants.ocr) return 'ocr'
  return 'native'
}

function toPersistedDocumentText(
  documentId: string,
  variants: Pick<PersistedDocumentText, 'native' | 'ocr'>,
  preferredSource: DocumentTextSource,
): PersistedDocumentText {
  const activeSource = selectActiveSource(variants, preferredSource)
  const activeVariant = activeSource === 'ocr' ? variants.ocr : variants.native
  const fallbackVariant = activeSource === 'ocr' ? variants.native : variants.ocr
  const resolvedVariant = activeVariant ?? fallbackVariant ?? {
    extractedAt: new Date().toISOString(),
    pageCount: 0,
    pages: [],
    text: '',
  }

  return {
    activeSource,
    documentId,
    extractedAt: resolvedVariant.extractedAt,
    native: variants.native,
    ocr: variants.ocr,
    pageCount: resolvedVariant.pageCount,
    pages: resolvedVariant.pages,
    text: resolvedVariant.text,
    version: DOCUMENT_TEXT_STORAGE_VERSION,
  }
}

function buildDocumentTextVariant(
  extractedAt: string,
  extracted: Awaited<ReturnType<typeof extractPdfDocumentText>>,
) {
  const pages = extracted.pages.map((page) => ({
    pageNumber: page.pageNumber,
    text: normalizeText(page.text),
  }))
  const text = normalizeText(
    pages
      .map((page) => page.text)
      .filter(Boolean)
      .join('\n\n'),
  )

  return {
    confidence: undefined,
    extractedAt,
    pageCount: extracted.pageCount,
    pages,
    text,
  } satisfies PersistedDocumentTextVariant
}

export function isOcrCandidate(text: string, pageCount: number) {
  if (!text) return true
  if (text.length < OCR_CANDIDATE_MIN_TOTAL_CHARS) return true
  if (pageCount > 1 && text.length / Math.max(pageCount, 1) < OCR_CANDIDATE_MIN_AVG_PAGE_CHARS) return true
  return false
}

function normalizePersistedDocumentText(
  documentId: string,
  parsed: Partial<PersistedDocumentText>,
): PersistedDocumentText | null {
  if (parsed.version === LEGACY_DOCUMENT_TEXT_STORAGE_VERSION) {
    const legacyVariant = normalizePersistedVariant(parsed)
    if (!legacyVariant) return null
    return toPersistedDocumentText(documentId, { native: legacyVariant }, 'native')
  }

  if (parsed.version !== DOCUMENT_TEXT_STORAGE_VERSION) {
    return null
  }

  const native = normalizePersistedVariant(parsed.native)
  const ocr = normalizePersistedVariant(parsed.ocr)
  const preferredSource = parsed.activeSource === 'ocr' ? 'ocr' : 'native'
  if (!native && !ocr) {
    const fallbackVariant = normalizePersistedVariant(parsed)
    if (!fallbackVariant) return null
    return toPersistedDocumentText(documentId, { native: fallbackVariant }, 'native')
  }

  return toPersistedDocumentText(documentId, { native, ocr }, preferredSource)
}

export async function readPersistedDocumentText(document: Pick<repo.DbDocument, 'id' | 'extractedTextPath'>) {
  const filePath = document.extractedTextPath ?? await getDocumentTextFilePath(document.id)
  if (!(await exists(filePath))) {
    return null
  }

  try {
    const raw = await readTextFile(filePath)
    const parsed = JSON.parse(raw) as Partial<PersistedDocumentText>
    return normalizePersistedDocumentText(document.id, parsed)
  } catch {
    return null
  }
}

export async function persistDocumentTextVariant(
  documentId: string,
  source: DocumentTextSource,
  variant: PersistedDocumentTextVariant,
  existing?: PersistedDocumentText | null,
  extractedTextPath?: string | null,
) {
  const current = existing ?? await readPersistedDocumentText({ id: documentId, extractedTextPath: undefined })
  const variants = {
    native: source === 'native' ? variant : current?.native,
    ocr: source === 'ocr' ? variant : current?.ocr,
  }
  const preferredSource: DocumentTextSource = source === 'ocr'
    ? 'ocr'
    : isOcrCandidate(variant.text, variant.pageCount) && hasVariantText(current?.ocr)
      ? 'ocr'
      : 'native'
  const persisted = toPersistedDocumentText(documentId, variants, preferredSource)
  const filePath = extractedTextPath ?? await getDocumentTextFilePath(documentId)

  await writeTextFile(filePath, JSON.stringify(persisted))

  return {
    filePath,
    persisted,
  }
}

export async function getDocumentPlainText(document: Pick<repo.DbDocument, 'id' | 'extractedTextPath' | 'searchText'>) {
  const persisted = await readPersistedDocumentText(document)
  const persistedText = normalizeText(persisted?.text)
  if (persistedText) return persistedText

  return normalizeText(document.searchText)
}

export async function extractAndPersistDocumentText(documentId: string): Promise<ExtractedDocumentTextResult> {
  const document = await repo.getDocumentById(documentId)
  if (!document) {
    throw new Error(`Document ${documentId} was not found.`)
  }

  const filePath = document.importedFilePath ?? document.sourcePath
  if (!filePath) {
    throw new Error(`Document ${documentId} does not have an imported file path.`)
  }

  const extractedAt = new Date().toISOString()
  const extracted = await extractPdfDocumentText(filePath)
  const variant = buildDocumentTextVariant(extractedAt, extracted)
  const existing = await readPersistedDocumentText(document)
  const { filePath: extractedTextPath, persisted } = await persistDocumentTextVariant(
    documentId,
    'native',
    variant,
    existing,
    document.extractedTextPath,
  )
  const textHash = await sha256Hex(persisted.text)
  const hasExtractedText = hasVariantText(persisted.native)
  const hasOcrText = hasVariantText(persisted.ocr)
  const ocrCandidate = isOcrCandidate(variant.text, variant.pageCount)
  const textExtractionStatus: repo.DbProcessingStatus = 'complete'
  const ocrStatus: repo.DbOcrStatus = hasOcrText ? 'complete' : ocrCandidate ? 'pending' : 'not_needed'

  const updated = await repo.updateDocumentMetadata(documentId, {
    extractedTextPath,
    hasExtractedText,
    hasOcr: hasOcrText,
    hasOcrText,
    indexingStatus: 'pending',
    ocrStatus,
    pageCount: persisted.pageCount,
    processingError: '',
    processingUpdatedAt: extractedAt,
    lastProcessedAt: extractedAt,
    searchText: persisted.text,
    textExtractedAt: persisted.extractedAt,
    textHash,
    textExtractionStatus,
  })

  if (!updated) {
    throw new Error(`Document ${documentId} could not be updated after text extraction.`)
  }

  return {
    activeSource: persisted.activeSource,
    documentId,
    extractedAt: persisted.extractedAt,
    extractedTextPath,
    hasExtractedText,
    isOcrCandidate: ocrCandidate,
    pageCount: persisted.pageCount,
    text: persisted.text,
    textExtractionStatus,
    textHash,
  }
}
