'use client'

import { readFile } from '@tauri-apps/plugin-fs'
import type { DbDocument, DbUpdateDocumentMetadataInput } from '@/lib/repositories/local-db'
import { extractPdfPageWords } from '@/lib/services/document-processing'
import type {
  DocumentMetadataProvenance,
  DocumentMetadataProvenanceEntry,
  DocumentMetadataUserEditedFields,
  EditableMetadataField,
  MetadataFieldSource,
  MetadataStatus,
} from '@/lib/types'

export type LocalPdfMetadata = {
  title?: string
  authors?: string[]
  year?: number
  doi?: string
  pageCount?: number
  citationKey?: string
  provenance: DocumentMetadataProvenance
}

type RawPdfMetadataSignals = {
  rawText: string
  title?: string
  authors?: string[]
  year?: number
  doi?: string
}

const TITLE_STOP_WORDS = new Set([
  'abstract',
  'introduction',
  'keywords',
  'contents',
  'appendix',
  'references',
  'arxiv',
  'preprint',
  'proceedings',
])

const COMMON_UPPERCASE_WORDS = new Set(['and', 'for', 'the', 'with', 'from', 'into', 'using', 'via', 'toward', 'towards'])

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

function authorLooksValid(name: string) {
  if (!name) return false
  if (/\d/.test(name)) return false
  const words = name.split(/\s+/).filter(Boolean)
  if (words.length < 2 || words.length > 5) return false
  return words.every((word) => /^[A-Z][A-Za-z.'-]+$/.test(word) || /^[A-Z]\.$/.test(word))
}

function parseAuthorLine(line: string) {
  const cleaned = normalizeWhitespace(
    line
      .replace(/\b(authors?|by)\b[:\s-]*/gi, '')
      .replace(/\b(and|&)\b/g, ','),
  )
  const authors = cleaned
    .split(',')
    .map((part) => normalizeWhitespace(part))
    .filter(authorLooksValid)

  return authors.length > 0 ? authors : []
}

function titleCaseUpperLine(line: string) {
  const words = line.split(/\s+/).filter(Boolean)
  if (words.length === 0) return line
  return words
    .map((word) => {
      if (COMMON_UPPERCASE_WORDS.has(word.toLowerCase())) return word.toLowerCase()
      if (/^[A-Z0-9-]{2,}$/.test(word)) {
        return word.charAt(0) + word.slice(1).toLowerCase()
      }
      return word
    })
    .join(' ')
}

function scoreTitleCandidate(line: string, index: number) {
  const normalized = normalizeWhitespace(line)
  if (!normalized) return Number.NEGATIVE_INFINITY
  const lowered = normalized.toLowerCase()
  if (TITLE_STOP_WORDS.has(lowered)) return Number.NEGATIVE_INFINITY
  if (lowered.startsWith('doi')) return Number.NEGATIVE_INFINITY
  if (normalized.length < 12 || normalized.length > 220) return Number.NEGATIVE_INFINITY

  const words = normalized.split(/\s+/).filter(Boolean)
  if (words.length < 3 || words.length > 24) return Number.NEGATIVE_INFINITY

  let score = 120 - index * 8
  if (!/[.?!:]$/.test(normalized)) score += 8
  if (!/\d{4}/.test(normalized)) score += 4
  if (!/@/.test(normalized)) score += 4
  if (/^[A-Z0-9\s\-:]+$/.test(normalized)) score -= 6
  if (words.some((word) => word.length > 28)) score -= 12
  if (words.filter((word) => /^[A-Z]/.test(word)).length >= Math.max(2, Math.floor(words.length / 3))) score += 10
  if (/^(a|an|the)\b/i.test(normalized)) score += 3
  return score
}

function normalizeExtractedTitle(title?: string) {
  if (!title) return undefined
  const cleaned = normalizeWhitespace(title.replace(/^title[:\s-]*/i, ''))
  if (!cleaned) return undefined
  return /^[A-Z0-9\s\-:]+$/.test(cleaned) ? titleCaseUpperLine(cleaned) : cleaned
}

function groupPageLines(words: Awaited<ReturnType<typeof extractPdfPageWords>>[number]['words']) {
  const sorted = [...words]
    .filter((word) => normalizeWhitespace(word.text))
    .sort((left, right) => {
      const topDiff = left.top - right.top
      if (Math.abs(topDiff) > 4) return topDiff
      return left.left - right.left
    })

  const lines: Array<{ top: number; text: string }> = []
  for (const word of sorted) {
    const text = normalizeWhitespace(word.text)
    if (!text) continue

    const current = lines[lines.length - 1]
    if (!current || Math.abs(current.top - word.top) > 5) {
      lines.push({ top: word.top, text })
      continue
    }

    const separator = /[-/]/.test(current.text.slice(-1)) ? '' : ' '
    current.text = `${current.text}${separator}${text}`.trim()
  }

  return lines
    .map((line) => normalizeWhitespace(line.text))
    .filter((line) => line.length > 0)
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

async function extractFirstPageSignals(filePath: string) {
  const pages = await extractPdfPageWords(filePath)
  const firstPage = pages[0]
  const firstPageText = firstPage?.text ?? ''
  const firstPageLines = firstPage ? groupPageLines(firstPage.words).slice(0, 14) : []

  let title: string | undefined
  let authors: string[] = []

  const scoredTitle = firstPageLines
    .map((line, index) => ({ line, index, score: scoreTitleCandidate(line, index) }))
    .sort((left, right) => right.score - left.score)[0]

  if (scoredTitle && Number.isFinite(scoredTitle.score) && scoredTitle.score > 30) {
    title = normalizeExtractedTitle(scoredTitle.line)
    const authorWindow = firstPageLines.slice(scoredTitle.index + 1, scoredTitle.index + 5)
    for (const line of authorWindow) {
      const parsed = parseAuthorLine(line)
      if (parsed.length > 0) {
        authors = parsed
        break
      }
    }
  }

  return {
    authors,
    doi: parseDoi(firstPageText),
    pageCount: pages.length,
    title,
    year: parseYear(firstPageText),
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

export async function extractLocalPdfMetadata(filePath: string): Promise<LocalPdfMetadata> {
  const [rawMetadata, firstPageSignals] = await Promise.all([
    readRawPdfMetadata(filePath),
    extractFirstPageSignals(filePath),
  ])

  const fileNameTitle = titleFromFilePath(filePath)
  const provenance: DocumentMetadataProvenance = {}

  const title = normalizeExtractedTitle(rawMetadata.title)
    ?? normalizeExtractedTitle(firstPageSignals.title)
    ?? fileNameTitle

  if (normalizeExtractedTitle(rawMetadata.title)) {
    provenance.title = provenanceEntry('embedded_pdf_metadata', 'Embedded PDF title metadata.', 0.95)
  } else if (normalizeExtractedTitle(firstPageSignals.title)) {
    provenance.title = provenanceEntry('first_page_heuristic', 'First-page heading heuristic.', 0.72)
  } else if (fileNameTitle) {
    provenance.title = provenanceEntry('filename_fallback', 'Filename fallback.', 0.25)
  }

  const authors = rawMetadata.authors && rawMetadata.authors.length > 0
    ? rawMetadata.authors
    : firstPageSignals.authors

  if (authors.length > 0) {
    provenance.authors = provenanceEntry(
      rawMetadata.authors && rawMetadata.authors.length > 0 ? 'embedded_pdf_metadata' : 'first_page_heuristic',
      rawMetadata.authors && rawMetadata.authors.length > 0 ? 'Embedded PDF author metadata.' : 'First-page author line heuristic.',
      rawMetadata.authors && rawMetadata.authors.length > 0 ? 0.9 : 0.68,
    )
  }

  const year = rawMetadata.year ?? firstPageSignals.year
  if (year) {
    provenance.year = provenanceEntry(
      rawMetadata.year ? 'embedded_pdf_metadata' : 'first_page_heuristic',
      rawMetadata.year ? 'Embedded PDF date metadata.' : 'First-page year detection.',
      rawMetadata.year ? 0.7 : 0.55,
    )
  }

  const doi = rawMetadata.doi ?? firstPageSignals.doi
  if (doi) {
    provenance.doi = provenanceEntry('doi_regex', rawMetadata.doi ? 'DOI regex over PDF byte sample.' : 'DOI regex over first-page text.', rawMetadata.doi ? 0.92 : 0.78)
  }

  if (firstPageSignals.pageCount && firstPageSignals.pageCount > 0) {
    provenance.pageCount = provenanceEntry('embedded_pdf_metadata', 'Derived from local PDF page enumeration.', 1)
  }

  const normalizedTitle = title || undefined
  return {
    title: normalizedTitle,
    authors,
    year,
    doi,
    pageCount: firstPageSignals.pageCount,
    citationKey: normalizedTitle ? citationKeyFor(normalizedTitle, authors, year) : undefined,
    provenance,
  }
}

export function mergeExtractedMetadataIntoDocument(
  document: Pick<DbDocument, 'title' | 'authors' | 'year' | 'doi' | 'pageCount' | 'metadataProvenance' | 'metadataUserEditedFields'>,
  metadata: LocalPdfMetadata,
) {
  const userEdited = parseMetadataUserEditedFields(document.metadataUserEditedFields)
  const provenance = parseMetadataProvenance(document.metadataProvenance)
  const currentAuthors = parseAuthorsValue(document.authors)
  const updates: DbUpdateDocumentMetadataInput = {}

  const canWriteField = (field: EditableMetadataField) => !userEdited[field]

  if (metadata.title && canWriteField('title')) {
    updates.title = metadata.title
    if (metadata.provenance.title) provenance.title = metadata.provenance.title
  }

  if (metadata.authors && metadata.authors.length > 0 && canWriteField('authors')) {
    updates.authors = JSON.stringify(metadata.authors)
    if (metadata.provenance.authors) provenance.authors = metadata.provenance.authors
  }

  if (metadata.year && canWriteField('year')) {
    updates.year = metadata.year
    if (metadata.provenance.year) provenance.year = metadata.provenance.year
  }

  if (metadata.doi && canWriteField('doi')) {
    updates.doi = metadata.doi
    if (metadata.provenance.doi) provenance.doi = metadata.provenance.doi
  }

  if (metadata.pageCount && metadata.pageCount > 0) {
    updates.pageCount = metadata.pageCount
    if (metadata.provenance.pageCount) provenance.pageCount = metadata.provenance.pageCount
  }

  if (metadata.citationKey && canWriteField('title') && canWriteField('authors') && canWriteField('year')) {
    updates.citationKey = metadata.citationKey
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
