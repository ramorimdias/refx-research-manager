'use client'

import { readFile } from '@tauri-apps/plugin-fs'
import { extractPdfPageLines } from '@/lib/services/document-processing'
import type { DbDocument, DbUpdateDocumentMetadataInput } from '@/lib/repositories/local-db'
import { getDocumentSuggestedTags, serializeSuggestedTags } from '@/lib/services/document-tag-suggestion-service'
import type {
  DocumentMetadataProvenance,
  DocumentMetadataProvenanceEntry,
  DocumentMetadataUserEditedFields,
  EditableMetadataField,
  MetadataFieldSource,
  MetadataStatus,
  SuggestedTag,
} from '@/lib/types'

export type LocalPdfMetadata = {
  title?: string
  authors?: string[]
  year?: number
  doi?: string
  pageCount?: number
  citationKey?: string
  abstract?: string
  suggestedTags?: SuggestedTag[]
  citationCount?: number
  provenance: DocumentMetadataProvenance
}

type MetadataMergeMode = 'fill_missing' | 'replace_unlocked'

type RawPdfMetadataSignals = {
  rawText: string
  title?: string
  authors?: string[]
  year?: number
  doi?: string
}

type FirstPageMetadataSignals = {
  title?: string
  authors?: string[]
  doi?: string
  pageCount?: number
}

function normalizeWhitespace(input: string) {
  return input.replace(/\s+/g, ' ').trim()
}

function cleanPdfField(value: string) {
  return normalizeWhitespace(
    value
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\n/g, ' ')
      .replace(/^\uFEFF/, ''),
  )
}

function splitAuthors(raw?: string) {
  if (!raw) return []
  return raw
    .split(/,|;|\band\b/gi)
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean)
}

function parseDoi(input?: string) {
  if (!input) return undefined
  const match = input.match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/i)?.[0]
  return match?.replace(/[).,;:\]}]+$/, '')
}

function parseYear(input?: string) {
  if (!input) return undefined
  const value = input.match(/\b(19|20)\d{2}\b/)?.[0]
  if (!value) return undefined
  const year = Number(value)
  const currentYear = new Date().getFullYear() + 1
  if (!Number.isFinite(year) || year < 1900 || year > currentYear) return undefined
  return year
}

function titleFromFilePath(filePath: string) {
  const fileName = filePath.split(/[\\/]/).pop() ?? ''
  return normalizeWhitespace(fileName.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' '))
}

function citationKeyFor(title: string, authors: string[], year?: number) {
  const firstAuthorToken = authors[0]?.split(/\s+/).pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'unknown'
  const titleToken = title.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'paper'
  return `${firstAuthorToken}${year ?? 'nd'}${titleToken}`
}

function normalizeExtractedTitle(title?: string) {
  if (!title) return undefined
  const cleaned = normalizeWhitespace(title.replace(/^title[:\s-]*/i, ''))
  if (!cleaned) return undefined
  return cleaned
}

function looksLikeStopLine(line: string) {
  return /\b(abstract|summary|keywords|index terms|introduction|resumo|sum[aá]rio)\b/i.test(line)
}

function looksLikeAuthorToken(token: string) {
  const normalized = token.trim()
  if (!normalized || normalized.length < 3 || /\d/.test(normalized)) return false
  if (/@|https?:\/\//i.test(normalized)) return false
  const words = normalized.split(/\s+/).filter(Boolean)
  if (words.length < 2 || words.length > 5) return false
  return words.every((word) => /^[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ.'-]*$|^[A-ZÀ-ÖØ-Ý]\.?$/u.test(word))
}

function parseAuthorsFromLine(line: string) {
  const cleaned = line
    .replace(/\b(and|e)\b/gi, ',')
    .replace(/\s{2,}/g, ' ')
    .trim()

  const candidates = cleaned
    .split(/,|;|•/)
    .map((entry) => normalizeWhitespace(entry.replace(/\d+/g, '').replace(/[*†‡]/g, '')))
    .filter(Boolean)

  if (candidates.length === 0 || candidates.length > 8) return []
  if (!candidates.every(looksLikeAuthorToken)) return []
  return candidates
}

function extractFirstPageMetadata(lines: string[], pageText: string): FirstPageMetadataSignals {
  const cleanedLines = lines
    .map((line) => normalizeWhitespace(line))
    .filter((line) => line.length >= 3)
    .slice(0, 14)

  const visibleLines: string[] = []
  for (const line of cleanedLines) {
    if (looksLikeStopLine(line)) break
    visibleLines.push(line)
  }

  let title: string | undefined
  let authors: string[] = []

  for (let index = 0; index < visibleLines.length; index += 1) {
    const line = visibleLines[index]
    if (!line || /^doi\b/i.test(line) || /@/.test(line)) continue
    const parsedAuthors = parseAuthorsFromLine(line)
    if (parsedAuthors.length > 0) {
      authors = parsedAuthors
      break
    }

    if (!title && line.length >= 20 && line.length <= 240 && !/\b(university|journal|vol\.|issue|issn)\b/i.test(line)) {
      const nextLine = visibleLines[index + 1]
      const nextIsAuthorLine = nextLine ? parseAuthorsFromLine(nextLine).length > 0 : false
      title = nextIsAuthorLine && nextLine && line.length < 160
        ? normalizeExtractedTitle(`${line} ${nextLine}`.replace(/\s+/g, ' '))
        : normalizeExtractedTitle(line)
    }
  }

  if (!authors.length) {
    const authorLine = visibleLines.find((line) => parseAuthorsFromLine(line).length > 0)
    if (authorLine) {
      authors = parseAuthorsFromLine(authorLine)
    }
  }

  return {
    title,
    authors,
    doi: parseDoi(pageText),
  }
}

async function readRawPdfMetadata(filePath: string): Promise<RawPdfMetadataSignals> {
  const bytes = await readFile(filePath)
  const sample = bytes.slice(0, 360_000)
  const text = new TextDecoder('latin1', { fatal: false }).decode(sample)

  const rawTitle = text.match(/\/Title\s*\(([\s\S]{1,300}?)\)/)?.[1]
  const rawAuthor = text.match(/\/Author\s*\(([\s\S]{1,300}?)\)/)?.[1]
  const rawCreationDate = text.match(/\/CreationDate\s*\(([\s\S]{1,80}?)\)/)?.[1]

  return {
    rawText: text,
    title: rawTitle ? cleanPdfField(rawTitle) : undefined,
    authors: splitAuthors(rawAuthor ? cleanPdfField(rawAuthor) : undefined),
    year: parseYear(rawCreationDate ? cleanPdfField(rawCreationDate) : text),
    doi: parseDoi(text),
  }
}

function provenanceEntry(source: MetadataFieldSource, detail?: string, confidence?: number): DocumentMetadataProvenanceEntry {
  return {
    source,
    extractedAt: new Date(),
    ...(detail ? { detail } : {}),
    ...(typeof confidence === 'number' ? { confidence } : {}),
  }
}

function parseAuthorsValue(value: string) {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : []
  } catch {
    return splitAuthors(value)
  }
}

export function parseMetadataProvenance(value?: string | DocumentMetadataProvenance) {
  if (!value) return {} as DocumentMetadataProvenance
  let parsed: unknown
  try {
    parsed = typeof value === 'string' ? JSON.parse(value) : value
  } catch {
    return {} as DocumentMetadataProvenance
  }
  if (!parsed || typeof parsed !== 'object') {
    return {} as DocumentMetadataProvenance
  }
  const entries = Object.entries(parsed ?? {})
  return Object.fromEntries(
    entries
      .filter(([, entry]) => entry && typeof entry === 'object')
      .map(([field, entry]) => [
        field,
        {
          ...(entry as Omit<DocumentMetadataProvenanceEntry, 'extractedAt'>),
          extractedAt: new Date((entry as { extractedAt?: string | Date }).extractedAt ?? new Date()),
        },
      ]),
  ) as DocumentMetadataProvenance
}

export function parseMetadataUserEditedFields(value?: string | DocumentMetadataUserEditedFields) {
  if (!value) return {} as DocumentMetadataUserEditedFields
  let parsed: unknown
  try {
    parsed = typeof value === 'string' ? JSON.parse(value) : value
  } catch {
    return {} as DocumentMetadataUserEditedFields
  }
  return typeof parsed === 'object' && parsed ? parsed as DocumentMetadataUserEditedFields : {}
}

export function serializeMetadataProvenance(provenance: DocumentMetadataProvenance) {
  return JSON.stringify(provenance)
}

export function serializeMetadataUserEditedFields(fields: DocumentMetadataUserEditedFields) {
  return JSON.stringify(fields)
}

export function deriveMetadataStatus(input: {
  title?: string
  authors?: string[]
  year?: number
  doi?: string
}): MetadataStatus {
  const signalCount = [
    input.title ? 1 : 0,
    input.authors && input.authors.length > 0 ? 1 : 0,
    input.year ? 1 : 0,
    input.doi ? 1 : 0,
  ].reduce((sum, value) => sum + value, 0)

  if (signalCount >= 3) return 'complete'
  if (signalCount >= 1) return 'partial'
  return 'missing'
}

export async function extractLocalPdfMetadata(filePath: string, titleFallbackPath?: string): Promise<LocalPdfMetadata> {
  const rawMetadata = await readRawPdfMetadata(filePath)
  let firstPageMetadata: FirstPageMetadataSignals = {}

  try {
    const pages = await extractPdfPageLines(filePath)
    const firstPage = pages[0]
    firstPageMetadata = {
      ...extractFirstPageMetadata(firstPage?.lines ?? [], firstPage?.text ?? ''),
      pageCount: pages.length,
    }
  } catch (error) {
    console.info('First-page metadata extraction skipped:', error)
  }

  const fileNameTitle = titleFromFilePath(titleFallbackPath ?? filePath)
  const provenance: DocumentMetadataProvenance = {}

  const title = fileNameTitle

  if (fileNameTitle) {
    provenance.title = provenanceEntry('filename_fallback', 'Filename fallback.', 0.25)
  }

  const authors = rawMetadata.authors && rawMetadata.authors.length > 0
    ? rawMetadata.authors
    : (firstPageMetadata.authors ?? [])

  if (authors.length > 0) {
    provenance.authors = provenanceEntry(
      rawMetadata.authors && rawMetadata.authors.length > 0 ? 'embedded_pdf_metadata' : 'first_page_heuristic',
      rawMetadata.authors && rawMetadata.authors.length > 0 ? 'Embedded PDF author metadata.' : 'First-page author heuristic.',
      rawMetadata.authors && rawMetadata.authors.length > 0 ? 0.9 : 0.8,
    )
  }

  const year = rawMetadata.year
  if (year) {
    provenance.year = provenanceEntry(
      'embedded_pdf_metadata',
      'Embedded PDF date metadata.',
      0.7,
    )
  }

  const doi = rawMetadata.doi ?? firstPageMetadata.doi
  if (doi) {
    provenance.doi = provenanceEntry(
      'doi_regex',
      rawMetadata.doi ? 'DOI regex over PDF byte sample.' : 'DOI regex over first-page text.',
      rawMetadata.doi ? 0.92 : 0.88,
    )
  }

  if (firstPageMetadata.pageCount) {
    provenance.pageCount = provenanceEntry('first_page_heuristic', 'Page count derived from PDF page scan.', 1)
  }

  const normalizedTitle = title || undefined
  return {
    title: normalizedTitle,
    authors,
    year,
    doi,
    pageCount: firstPageMetadata.pageCount,
    citationKey: normalizedTitle ? citationKeyFor(normalizedTitle, authors, year) : undefined,
    provenance,
  }
}

export function mergeExtractedMetadataIntoDocument(
  document: Pick<DbDocument, 'title' | 'authors' | 'year' | 'doi' | 'citationKey' | 'pageCount' | 'abstractText' | 'tagSuggestions' | 'metadataProvenance' | 'metadataUserEditedFields'>,
  metadata: LocalPdfMetadata,
  mode: MetadataMergeMode = 'replace_unlocked',
) {
  const userEdited = parseMetadataUserEditedFields(document.metadataUserEditedFields)
  const provenance = parseMetadataProvenance(document.metadataProvenance)
  const currentAuthors = parseAuthorsValue(document.authors)
  const updates: DbUpdateDocumentMetadataInput = {}

  const canWriteField = (field: EditableMetadataField) => {
    if (mode === 'replace_unlocked') return true
    return !userEdited[field]
  }
  const canReplaceFieldValue = (field: EditableMetadataField, currentValue: unknown) => {
    if (!canWriteField(field)) return false
    if (mode === 'replace_unlocked') return true
    if (Array.isArray(currentValue)) return currentValue.length === 0
    if (typeof currentValue === 'string') return currentValue.trim().length === 0
    return currentValue === undefined || currentValue === null
  }

  if (metadata.title && canReplaceFieldValue('title', document.title)) {
    updates.title = metadata.title
    if (metadata.provenance.title) provenance.title = metadata.provenance.title
  }

  if (metadata.authors && metadata.authors.length > 0 && canReplaceFieldValue('authors', currentAuthors)) {
    updates.authors = JSON.stringify(metadata.authors)
    if (metadata.provenance.authors) provenance.authors = metadata.provenance.authors
  }

  if (metadata.year && canReplaceFieldValue('year', document.year)) {
    updates.year = metadata.year
    if (metadata.provenance.year) provenance.year = metadata.provenance.year
  }

  if (metadata.doi && canReplaceFieldValue('doi', document.doi)) {
    updates.doi = metadata.doi
    if (metadata.provenance.doi) provenance.doi = metadata.provenance.doi
  }

  if (metadata.pageCount && metadata.pageCount > 0 && (mode === 'replace_unlocked' || !document.pageCount)) {
    updates.pageCount = metadata.pageCount
    if (metadata.provenance.pageCount) provenance.pageCount = metadata.provenance.pageCount
  }

  if (
    metadata.citationKey
    && canWriteField('title')
    && canWriteField('authors')
    && canWriteField('year')
    && (mode === 'replace_unlocked' || !document.citationKey)
  ) {
    updates.citationKey = metadata.citationKey
  }

  if (metadata.abstract && canReplaceFieldValue('abstract', document.abstractText)) {
    updates.abstractText = metadata.abstract
  }

  if (metadata.suggestedTags && metadata.suggestedTags.length > 0) {
    const existingSuggestedTags = getDocumentSuggestedTags({
      tagSuggestions: document.tagSuggestions,
    })
    const mergedSuggestedTags: SuggestedTag[] = [...existingSuggestedTags]

    for (const tag of metadata.suggestedTags) {
      if (mergedSuggestedTags.some((entry) => entry.name === tag.name)) continue
      mergedSuggestedTags.push(tag)
    }

    if (mergedSuggestedTags.length > 0) {
      updates.tagSuggestions = serializeSuggestedTags(mergedSuggestedTags.slice(0, 12))
    }
  }

  const effectiveTitle = updates.title ?? document.title
  const effectiveAuthors = updates.authors ? parseAuthorsValue(updates.authors) : currentAuthors
  const effectiveYear = updates.year ?? document.year
  const effectiveDoi = updates.doi ?? document.doi

  updates.metadataStatus = deriveMetadataStatus({
    title: effectiveTitle,
    authors: effectiveAuthors,
    year: effectiveYear,
    doi: effectiveDoi,
  })
  updates.metadataProvenance = serializeMetadataProvenance(provenance)

  return updates
}

export function markMetadataFieldsAsUserEdited(
  existingValue: string | undefined,
  fields: EditableMetadataField[],
) {
  const edited = parseMetadataUserEditedFields(existingValue)
  for (const field of fields) {
    edited[field] = true
  }
  return serializeMetadataUserEditedFields(edited)
}

export function markMetadataFieldProvenanceAsUser(
  existingValue: string | undefined,
  fields: EditableMetadataField[],
) {
  const provenance = parseMetadataProvenance(existingValue)
  for (const field of fields) {
    if (field === 'abstract' || field === 'isbn' || field === 'publisher' || field === 'citationKey') continue
    provenance[field as keyof DocumentMetadataProvenance] = provenanceEntry('user', 'Edited manually in the document details view.', 1)
  }
  return serializeMetadataProvenance(provenance)
}
