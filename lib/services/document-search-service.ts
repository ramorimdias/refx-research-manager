'use client'

import MiniSearch, { type Options as MiniSearchOptions, type Query as MiniSearchQuery } from 'minisearch'
import * as repo from '@/lib/repositories/local-db'
import { appDataDir, exists, join, mkdir, readTextFile, remove, writeTextFile } from '@/lib/tauri/client'
import { extractAndPersistDocumentText, getDocumentPlainText, readPersistedDocumentText } from '@/lib/services/document-text-service'

type IndexedDocument = {
  id: string
  text: string
}

type PersistedSearchIndex = {
  version: number
  indexedTextHashes: Record<string, string>
  miniSearchJson: string
}

type SearchIndexState = {
  dirty: boolean
  index: MiniSearch<IndexedDocument>
  indexedTextHashes: Record<string, string>
}

export type DocumentSearchQuery =
  | string
  | {
      combineWith: 'AND' | 'OR' | 'AND_NOT'
      queries: DocumentSearchQuery[]
    }

export type ExtractedDocumentText = {
  documentId: string
  extractedTextPath: string
  extractedAt: string
  hasExtractedText: boolean
  isOcrCandidate: boolean
  pageCount: number
  text: string
  textExtractionStatus: repo.DbProcessingStatus
  textHash: string
}

export type IndexedDocumentResult = {
  documentId: string
  indexed: boolean
  textHash?: string
}

export type SearchDocumentsOptions = {
  combineWith?: 'AND' | 'OR' | 'AND_NOT'
  documentIds?: string[]
  flexibility?: number
  limit?: number
}

export type DocumentSearchMatchPosition = {
  end: number
  start: number
}

export type DocumentSearchPageHit = {
  matchedText: string
  pageNumber: number
  positions: DocumentSearchMatchPosition[]
  snippet: string
}

export type DocumentSearchResult = {
  documentId: string
  matchedQueryTerms: string[]
  matchedTerms: string[]
  pageHits: DocumentSearchPageHit[]
  score: number
  snippet?: string
  title: string
}

const INDEX_VERSION = 1
const SEARCH_DIR_NAME = 'search'
const SEARCH_INDEX_FILE_NAME = 'documents.minisearch.json'
const INDEX_OPTIONS: MiniSearchOptions<IndexedDocument> = {
  fields: ['text'],
  storeFields: [],
}
// The ranking layer keeps MiniSearch retrieval, then reranks candidates with a
// simple weighted formula that stays easy to tune later.
const SEARCH_RANKING_WEIGHTS = {
  indexScore: 0.38,
  metadataMatch: 0.08,
  phraseMatch: 0.16,
  termFrequency: 0.24,
  titleMatch: 0.14,
} as const
const SEARCH_RESULT_CANDIDATE_MULTIPLIER = 4
const SEARCH_RESULT_CANDIDATE_MINIMUM = 100
const OCR_CONFIDENCE_MULTIPLIER_RANGE = {
  max: 1,
  min: 0.88,
} as const

let indexStatePromise: Promise<SearchIndexState> | null = null
let indexOperation = Promise.resolve()

function unique(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)))
}

function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function toAbsoluteScore(score: number) {
  return Number(score.toFixed(1))
}

function firstNonEmptyText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = (value ?? '').trim()
    if (normalized) return normalized
  }

  return ''
}

function clamp01(value: number) {
  if (Number.isNaN(value) || !Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function normalizeSearchText(input: string) {
  return firstNonEmptyText(input).toLowerCase()
}

function normalizeQueryFragment(input: string) {
  return normalizeSearchText(input).replace(/\s+/g, ' ').trim()
}

function countOccurrences(text: string, term: string) {
  const normalizedText = normalizeSearchText(text)
  const normalizedTerm = normalizeQueryFragment(term)
  if (!normalizedText || !normalizedTerm) return 0
  const matches = normalizedText.match(new RegExp(`\\b${escapeRegExp(normalizedTerm)}\\b`, 'g'))
  return matches?.length ?? 0
}

function collectPositiveQueryStrings(query: DocumentSearchQuery, include = true): string[] {
  if (typeof query === 'string') {
    return include ? [query] : []
  }

  if (query.combineWith === 'AND_NOT') {
    return query.queries.flatMap((entry, index) => collectPositiveQueryStrings(entry, include && index === 0))
  }

  return query.queries.flatMap((entry) => collectPositiveQueryStrings(entry, include))
}

function buildQuerySignals(query: DocumentSearchQuery) {
  const strings = unique(collectPositiveQueryStrings(query).map((entry) => normalizeQueryFragment(entry)).filter(Boolean))
  const phrases = strings.filter((entry) => entry.includes(' '))
  const tokens = unique(
    strings
      .flatMap((entry) => entry.split(/\s+/))
      .map((entry) => normalizeQueryFragment(entry))
      .filter((entry) => entry.length >= 2),
  )

  return {
    phrases,
    tokens,
  }
}

function parseDocumentAuthors(document: repo.DbDocument) {
  if (typeof document.authors !== 'string') return []

  try {
    const parsed = JSON.parse(document.authors) as unknown
    if (Array.isArray(parsed)) {
      return parsed.filter((entry): entry is string => typeof entry === 'string')
    }
  } catch {
    // fall through to the raw author string below
  }

  return document.authors ? [document.authors] : []
}

function buildDocumentMetadataCorpus(document: repo.DbDocument) {
  const authors = parseDocumentAuthors(document).join(' ')
  const tags = document.tags.join(' ')
  return normalizeSearchText([
    authors,
    document.abstractText,
    document.citationKey,
    document.doi,
    document.publisher,
    tags,
    document.year ? String(document.year) : '',
  ].join(' '))
}

function buildFieldTokenCoverageScore(field: string, tokens: string[]) {
  if (tokens.length === 0) return 0
  const normalizedField = normalizeSearchText(field)
  if (!normalizedField) return 0

  const matchedTokenCount = tokens.filter((token) => normalizedField.includes(token)).length
  return clamp01(matchedTokenCount / tokens.length)
}

function buildPhraseMatchScore(
  fullText: string,
  title: string,
  metadataCorpus: string,
  phrases: string[],
) {
  if (phrases.length === 0) return 0

  let best = 0
  for (const phrase of phrases) {
    if (title.includes(phrase)) best = Math.max(best, 1)
    else if (metadataCorpus.includes(phrase)) best = Math.max(best, 0.8)
    else if (fullText.includes(phrase)) best = Math.max(best, 0.68)
  }

  return best
}

function buildTermFrequencyScore(fullText: string, terms: string[]) {
  if (terms.length === 0) return 0

  const contributions = unique(terms)
    .map((term) => countOccurrences(fullText, term))
    .filter((count) => count > 0)
    .map((count) => clamp01(Math.log1p(count) / Math.log1p(6)))

  if (contributions.length === 0) return 0
  return clamp01(contributions.reduce((sum, value) => sum + value, 0) / contributions.length)
}

function buildIndexScore(rawScore: number, topRawScore: number) {
  if (rawScore <= 0 || topRawScore <= 0) return 0
  return clamp01(Math.log1p(rawScore) / Math.log1p(topRawScore))
}

function buildOcrConfidenceWeight(activeSource: 'native' | 'ocr', ocrConfidence?: number) {
  if (activeSource !== 'ocr' || typeof ocrConfidence !== 'number') return 1
  const confidenceRatio = clamp01(ocrConfidence / 100)
  return OCR_CONFIDENCE_MULTIPLIER_RANGE.min
    + (OCR_CONFIDENCE_MULTIPLIER_RANGE.max - OCR_CONFIDENCE_MULTIPLIER_RANGE.min) * confidenceRatio
}

function buildSnippetAtPosition(text: string, start: number, end: number, radius = 110) {
  const normalizedText = firstNonEmptyText(text)
  if (!normalizedText) return ''

  const safeStart = Math.max(0, start)
  const safeEnd = Math.min(normalizedText.length, Math.max(end, safeStart))
  const snippetStart = Math.max(0, safeStart - radius)
  const snippetEnd = Math.min(normalizedText.length, safeEnd + radius)
  const prefix = snippetStart > 0 ? '...' : ''
  const suffix = snippetEnd < normalizedText.length ? '...' : ''
  return `${prefix}${normalizedText.slice(snippetStart, snippetEnd).trim()}${suffix}`
}

function collectMatchPositions(text: string, terms: string[], maxPositions = 12) {
  const normalizedText = firstNonEmptyText(text)
  const positions: DocumentSearchMatchPosition[] = []

  for (const term of unique(terms).sort((left, right) => right.length - left.length)) {
    if (!term.trim()) continue
    const expression = new RegExp(escapeRegExp(term), 'gi')
    let match: RegExpExecArray | null

    while ((match = expression.exec(normalizedText)) && positions.length < maxPositions) {
      const start = match.index ?? 0
      const end = start + match[0].length
      const overlaps = positions.some((position) => start < position.end && end > position.start)
      if (!overlaps) {
        positions.push({ start, end })
      }
      if (expression.lastIndex === start) {
        expression.lastIndex += 1
      }
    }

    if (positions.length >= maxPositions) break
  }

  return positions.sort((left, right) => left.start - right.start)
}

function buildPageHits(
  persistedText: Awaited<ReturnType<typeof readPersistedDocumentText>>,
  query: DocumentSearchQuery,
  matchedTerms: string[],
  matchedQueryTerms: string[],
  limit = 5,
) {
  if (!persistedText?.pages?.length) return []

  const { phrases, tokens } = buildQuerySignals(query)
  const effectiveTerms = matchedTerms.length > 0 ? matchedTerms : matchedQueryTerms.length > 0 ? matchedQueryTerms : tokens
  const preferredTerms = phrases.length > 0 ? phrases : effectiveTerms
  const pageHits: DocumentSearchPageHit[] = []

  for (const page of persistedText.pages) {
    if (pageHits.length >= limit) break

    const phrasePositions = phrases.length > 0 ? collectMatchPositions(page.text, phrases) : []
    const fallbackPositions = phrasePositions.length > 0 ? [] : collectMatchPositions(page.text, preferredTerms)
    const positions = phrasePositions.length > 0 ? phrasePositions : fallbackPositions
    if (positions.length === 0) continue

    const firstPosition = positions[0]
    if (!firstPosition) continue

    pageHits.push({
      matchedText: page.text.slice(firstPosition.start, firstPosition.end),
      pageNumber: page.pageNumber,
      positions,
      snippet: buildSnippetAtPosition(page.text, firstPosition.start, firstPosition.end),
    })
  }

  return pageHits
}

export async function findDocumentPageHits(documentId: string, query: DocumentSearchQuery, limit = 100) {
  if (isQueryEmpty(query)) return []

  const document = await repo.getDocumentById(documentId)
  if (!document) return []

  const persistedText = await readPersistedDocumentText(document)
  const pageHits = buildPageHits(persistedText, query, [], [], limit)

  return pageHits.flatMap((pageHit, index) => {
    const firstPosition = pageHit.positions[0]
    if (!firstPosition) return []

    return [{
      index,
      matchedText: pageHit.matchedText,
      snippet: pageHit.snippet,
      start: firstPosition.start,
      end: firstPosition.end,
      estimatedPage: pageHit.pageNumber,
    }]
  })
}

async function buildNormalizedSearchScore(
  document: repo.DbDocument,
  query: DocumentSearchQuery,
  rawScore: number,
  topRawScore: number,
  matchedTerms: string[],
  matchedQueryTerms: string[],
) {
  const persistedText = await readPersistedDocumentText(document)
  const fullText = normalizeSearchText(persistedText?.text ?? document.searchText ?? '')
  const title = normalizeSearchText(document.title)
  const metadataCorpus = buildDocumentMetadataCorpus(document)
  const { phrases, tokens } = buildQuerySignals(query)
  const effectiveTerms = matchedTerms.length > 0 ? matchedTerms : tokens
  const effectiveQueryTerms = matchedQueryTerms.length > 0 ? matchedQueryTerms : tokens

  const indexScore = buildIndexScore(rawScore, topRawScore)
  const termFrequencyScore = buildTermFrequencyScore(fullText, effectiveTerms)
  const phraseMatchScore = buildPhraseMatchScore(fullText, title, metadataCorpus, phrases)
  const titleMatchScore = Math.max(
    buildFieldTokenCoverageScore(title, effectiveQueryTerms),
    phraseMatchScore === 1 ? 1 : 0,
  )
  const metadataMatchScore = buildFieldTokenCoverageScore(metadataCorpus, effectiveQueryTerms)
  const ocrConfidenceWeight = buildOcrConfidenceWeight(
    persistedText?.activeSource ?? 'native',
    persistedText?.activeSource === 'ocr' ? persistedText.ocr?.confidence : undefined,
  )

  const weightedScore = (
    indexScore * SEARCH_RANKING_WEIGHTS.indexScore
    + termFrequencyScore * SEARCH_RANKING_WEIGHTS.termFrequency
    + phraseMatchScore * SEARCH_RANKING_WEIGHTS.phraseMatch
    + titleMatchScore * SEARCH_RANKING_WEIGHTS.titleMatch
    + metadataMatchScore * SEARCH_RANKING_WEIGHTS.metadataMatch
  ) * ocrConfidenceWeight

  return {
    persistedText,
    score: toAbsoluteScore(clamp01(weightedScore) * 100),
    snippet: buildSnippet(
      firstNonEmptyText(persistedText?.text, document.searchText),
      matchedTerms.length > 0 ? matchedTerms : matchedQueryTerms,
    ),
  }
}

async function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
}

async function getSearchIndexPath() {
  const base = await appDataDir()
  const searchDir = await join(base, SEARCH_DIR_NAME)
  await mkdir(searchDir, { recursive: true })
  return join(searchDir, SEARCH_INDEX_FILE_NAME)
}

async function persistSearchIndexState(state: SearchIndexState) {
  if (state.index.dirtCount > 0) {
    await state.index.vacuum({
      batchSize: Math.max(100, state.index.termCount || 100),
      batchWait: 0,
    })
  }

  const indexPath = await getSearchIndexPath()
  const payload: PersistedSearchIndex = {
    version: INDEX_VERSION,
    indexedTextHashes: state.indexedTextHashes,
    miniSearchJson: JSON.stringify(state.index),
  }

  await writeTextFile(indexPath, JSON.stringify(payload))
  state.dirty = false
}

async function createEmptySearchIndexState() {
  return {
    dirty: false,
    index: new MiniSearch(INDEX_OPTIONS),
    indexedTextHashes: {},
  } satisfies SearchIndexState
}

async function loadSearchIndexState() {
  const indexPath = await getSearchIndexPath()
  if (!(await exists(indexPath))) {
    return createEmptySearchIndexState()
  }

  try {
    const raw = await readTextFile(indexPath)
    const parsed = JSON.parse(raw) as Partial<PersistedSearchIndex>
    if (parsed.version !== INDEX_VERSION || typeof parsed.miniSearchJson !== 'string') {
      return createEmptySearchIndexState()
    }

    return {
      dirty: false,
      index: MiniSearch.loadJSON(parsed.miniSearchJson, INDEX_OPTIONS),
      indexedTextHashes: parsed.indexedTextHashes ?? {},
    } satisfies SearchIndexState
  } catch {
    return createEmptySearchIndexState()
  }
}

async function getSearchIndexState() {
  if (!indexStatePromise) {
    indexStatePromise = loadSearchIndexState()
  }

  return indexStatePromise
}

function withIndexLock<T>(operation: () => Promise<T>) {
  const next = indexOperation.then(operation, operation)
  indexOperation = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}

async function ensureDocumentTextHash(document: repo.DbDocument) {
  const searchText = firstNonEmptyText(await getDocumentPlainText(document))
  if (!searchText) return null
  if (document.textHash) return document.textHash

  const textHash = await sha256Hex(searchText)
  const textExtractedAt = document.textExtractedAt ?? new Date().toISOString()
  const updated = await repo.updateDocumentMetadata(document.id, {
    extractedTextPath: document.extractedTextPath,
    searchText: searchText !== document.searchText ? searchText : undefined,
    textExtractedAt,
    textHash,
  })

  document.textHash = updated?.textHash ?? textHash
  document.textExtractedAt = updated?.textExtractedAt ?? textExtractedAt
  return document.textHash
}

async function discardDocument(state: SearchIndexState, documentId: string) {
  let changed = false

  if (state.index.has(documentId)) {
    state.index.discard(documentId)
    changed = true
  }

  if (state.indexedTextHashes[documentId]) {
    delete state.indexedTextHashes[documentId]
    changed = true
  }

  if (changed) {
    state.dirty = true
  }

  return changed
}

async function upsertDocument(state: SearchIndexState, document: repo.DbDocument) {
  const searchText = firstNonEmptyText(await getDocumentPlainText(document))
  if (!searchText) {
    return discardDocument(state, document.id)
  }

  if (searchText !== firstNonEmptyText(document.searchText)) {
    const updated = await repo.updateDocumentMetadata(document.id, {
      searchText,
    })
    if (updated) {
      document.searchText = updated.searchText
    } else {
      document.searchText = searchText
    }
  }

  const textHash = (await ensureDocumentTextHash(document)) ?? (await sha256Hex(searchText))
  if (state.index.has(document.id) && state.indexedTextHashes[document.id] === textHash) {
    return false
  }

  const indexedDocument: IndexedDocument = {
    id: document.id,
    text: searchText,
  }

  if (state.index.has(document.id)) {
    state.index.replace(indexedDocument)
  } else {
    state.index.add(indexedDocument)
  }

  state.indexedTextHashes[document.id] = textHash
  state.dirty = true
  return true
}

async function ensureIndexSynchronized(state: SearchIndexState, documents: repo.DbDocument[]) {
  const documentsById = new Map(documents.map((document) => [document.id, document]))
  let changed = false

  for (const indexedId of Object.keys(state.indexedTextHashes)) {
    if (!documentsById.has(indexedId)) {
      changed = (await discardDocument(state, indexedId)) || changed
    }
  }

  for (const document of documents) {
    const hasSearchText = Boolean(firstNonEmptyText(await getDocumentPlainText(document)))
    const isIndexed = state.index.has(document.id)
    if (!hasSearchText) {
      changed = (await discardDocument(state, document.id)) || changed
      continue
    }

    const textHash = await ensureDocumentTextHash(document)
    if (!textHash) continue
    if (!isIndexed || state.indexedTextHashes[document.id] !== textHash) {
      changed = (await upsertDocument(state, document)) || changed
    }
  }

  return changed
}

function isQueryEmpty(query: DocumentSearchQuery): boolean {
  if (typeof query === 'string') {
    return query.trim().length === 0
  }

  return query.queries.every((entry) => isQueryEmpty(entry))
}

function buildFuzzySetting(flexibility = 35) {
  if (flexibility < 25) return false
  if (flexibility < 45) return 0.1
  if (flexibility < 70) return 0.15
  return 0.2
}

function buildPrefixSetting(flexibility = 35) {
  return flexibility >= 15
}

function buildSnippet(text: string, terms: string[], radius = 110) {
  const normalizedText = firstNonEmptyText(text)
  if (!normalizedText) return undefined

  const candidates = unique(terms).sort((left, right) => right.length - left.length)
  for (const candidate of candidates) {
    const expression = new RegExp(escapeRegExp(candidate), 'i')
    const match = expression.exec(normalizedText)
    if (!match) continue

    const start = Math.max(0, match.index - radius)
    const end = Math.min(normalizedText.length, match.index + candidate.length + radius)
    const prefix = start > 0 ? '...' : ''
    const suffix = end < normalizedText.length ? '...' : ''
    return `${prefix}${normalizedText.slice(start, end).trim()}${suffix}`
  }

  return normalizedText.slice(0, radius * 2).trim()
}

export async function extractDocumentText(documentId: string): Promise<ExtractedDocumentText> {
  const extracted = await extractAndPersistDocumentText(documentId)
  return {
    documentId: extracted.documentId,
    extractedTextPath: extracted.extractedTextPath,
    extractedAt: extracted.extractedAt,
    hasExtractedText: extracted.hasExtractedText,
    isOcrCandidate: extracted.isOcrCandidate,
    pageCount: extracted.pageCount,
    text: extracted.text,
    textExtractionStatus: extracted.textExtractionStatus,
    textHash: extracted.textHash,
  }
}

export async function indexDocument(documentId: string): Promise<IndexedDocumentResult> {
  return withIndexLock(async () => {
    let document = await repo.getDocumentById(documentId)
    if (!document) {
      const state = await getSearchIndexState()
      const changed = await discardDocument(state, documentId)
      if (changed) {
        await persistSearchIndexState(state)
      }

      return {
        documentId,
        indexed: false,
      }
    }

    const state = await getSearchIndexState()
    const storedText = firstNonEmptyText(await getDocumentPlainText(document))
    if (!storedText) {
      const changed = await discardDocument(state, documentId)
      if (changed) {
        await persistSearchIndexState(state)
      }

      const processedAt = new Date().toISOString()
      await repo.updateDocumentMetadata(documentId, {
        indexingStatus: 'pending',
        processingUpdatedAt: processedAt,
        lastProcessedAt: processedAt,
      })

      return {
        documentId,
        indexed: false,
      }
    }

    const changed = await upsertDocument(state, document)
    if (changed) {
      await persistSearchIndexState(state)
    }

    const processedAt = new Date().toISOString()
    await repo.updateDocumentMetadata(documentId, {
      indexingStatus: state.index.has(documentId) ? 'complete' : 'pending',
      processingUpdatedAt: processedAt,
      lastProcessedAt: processedAt,
    })

    return {
      documentId,
      indexed: state.index.has(documentId),
      textHash: document.textHash ?? state.indexedTextHashes[documentId],
    }
  })
}

export async function removeDocumentFromIndex(documentId: string) {
  return withIndexLock(async () => {
    const state = await getSearchIndexState()
    const changed = await discardDocument(state, documentId)
    if (changed) {
      await persistSearchIndexState(state)
    }

    return changed
  })
}

export async function clearDocumentSearchIndex() {
  return withIndexLock(async () => {
    indexStatePromise = null
    const indexPath = await getSearchIndexPath()
    if (await exists(indexPath)) {
      await remove(indexPath)
    }
  })
}

export async function searchDocuments(query: DocumentSearchQuery, options: SearchDocumentsOptions = {}): Promise<DocumentSearchResult[]> {
  if (isQueryEmpty(query)) return []

  return withIndexLock(async () => {
    const documents = await repo.listAllDocuments()
    const state = await getSearchIndexState()
    const synchronized = await ensureIndexSynchronized(state, documents)
    if (synchronized) {
      await persistSearchIndexState(state)
    }

    const allowedIds = options.documentIds?.length ? new Set(options.documentIds) : null
    const rawResults = state.index.search(query as MiniSearchQuery, {
      combineWith: typeof query === 'string' ? (options.combineWith ?? 'AND') : undefined,
      filter: allowedIds ? (result) => allowedIds.has(String(result.id)) : undefined,
      fuzzy: buildFuzzySetting(options.flexibility),
      prefix: buildPrefixSetting(options.flexibility),
    })

    const documentsById = new Map(documents.map((document) => [document.id, document]))
    const candidateLimit = Math.max(
      (options.limit ?? 100) * SEARCH_RESULT_CANDIDATE_MULTIPLIER,
      SEARCH_RESULT_CANDIDATE_MINIMUM,
    )
    const candidateResults = rawResults.slice(0, candidateLimit)
    const topRawScore = candidateResults[0]?.score ?? 0
    const mappedResults: Array<DocumentSearchResult & {
      persistedText: Awaited<ReturnType<typeof readPersistedDocumentText>>
    }> = []

    for (const result of candidateResults) {
      const document = documentsById.get(String(result.id))
      if (!document) continue

      const matchedTerms = unique(result.terms)
      const matchedQueryTerms = unique(result.queryTerms)
      const ranked = await buildNormalizedSearchScore(
        document,
        query,
        result.score,
        topRawScore,
        matchedTerms,
        matchedQueryTerms,
      )

      mappedResults.push({
        documentId: document.id,
        matchedQueryTerms,
        matchedTerms,
        pageHits: [],
        persistedText: ranked.persistedText,
        score: ranked.score,
        snippet: ranked.snippet,
        title: document.title,
      })
    }

    mappedResults.sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    return mappedResults
      .slice(0, options.limit ?? 100)
      .map(({ persistedText, ...result }) => {
        const pageHits = buildPageHits(persistedText, query, result.matchedTerms, result.matchedQueryTerms)
        return {
          ...result,
          pageHits,
          snippet: pageHits[0]?.snippet ?? result.snippet,
        }
      })
  })
}
