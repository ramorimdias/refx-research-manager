'use client'

import { readFile } from '@tauri-apps/plugin-fs'
import type { Document } from '@/lib/types'
import { splitIntoSentenceLikeSegments } from '@/lib/utils/sentence-segmentation'

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'among', 'and', 'been', 'being', 'between', 'both', 'does', 'during', 'each',
  'from', 'have', 'into', 'more', 'most', 'not', 'other', 'over', 'such', 'than', 'that', 'their', 'there', 'these',
  'this', 'those', 'through', 'under', 'using', 'with', 'your', 'where', 'when', 'what', 'which', 'while', 'were',
  'will', 'would', 'could', 'should', 'paper', 'study', 'research', 'analysis', 'results', 'based', 'data', 'method',
  'methods', 'or', 'system',
])

const BOOLEAN_TOKENS = new Set(['and', 'or', 'not'])

export type PdfWord = {
  text: string
  left: number
  top: number
  width: number
  height: number
  confidence: number
  trailingSpace?: boolean
}

export type PdfPageWords = {
  pageNumber: number
  text: string
  words: PdfWord[]
}

export type PdfPageLines = {
  pageNumber: number
  text: string
  lines: string[]
}

export type SearchOccurrence = {
  index: number
  matchedText?: string
  snippet: string
  start: number
  end: number
  estimatedPage: number
  rects?: Array<{ left: number; top: number; width: number; height: number }>
}

const pdfWordCache = new Map<string, Promise<PdfPageWords[]>>()

type PdfJsModule = {
  getDocument: (source: Record<string, unknown>) => { promise: Promise<unknown>; destroy?: () => void }
  GlobalWorkerOptions: { workerSrc: string }
}

let pdfJsPromise: Promise<PdfJsModule> | null = null
let pdfJsWorkerModulePromise: Promise<void> | null = null
const BROWSER_PDFJS_MODULE_PATH = '/pdfjs/pdf.js'
const BROWSER_PDFJS_WORKER_PATH = '/pdfjs/pdf.worker.js'

function browserModuleImport(specifier: string) {
  const browserImport = new Function(
    'specifier',
    'return import(specifier)',
  ) as (specifier: string) => Promise<unknown>

  return browserImport(specifier)
}

function resolvePdfJsCandidate(importedModule: unknown) {
  const candidate = (
    importedModule
    && typeof importedModule === 'object'
    && 'getDocument' in importedModule
    && 'GlobalWorkerOptions' in importedModule
  )
    ? importedModule
    : (
      importedModule
      && typeof importedModule === 'object'
      && 'default' in importedModule
      && importedModule.default
      && typeof importedModule.default === 'object'
      && 'getDocument' in importedModule.default
      && 'GlobalWorkerOptions' in importedModule.default
    )
      ? importedModule.default
      : null

  return candidate && typeof candidate === 'object' ? candidate as PdfJsModule : null
}

function normalizeText(input: string) {
  return input.replace(/\s+/g, ' ').trim()
}

async function ensurePdfJsWorkerModuleLoaded() {
  if (!pdfJsWorkerModulePromise) {
    pdfJsWorkerModulePromise = browserModuleImport(BROWSER_PDFJS_WORKER_PATH)
      .then(() => undefined)
      .catch((error) => {
        pdfJsWorkerModulePromise = null
        console.warn('PDF.js worker module preload failed; falling back to workerSrc only:', error)
      })
  }

  await pdfJsWorkerModulePromise
}

function buildPageLines(words: PdfWord[]) {
  if (words.length === 0) return []

  const sorted = [...words].sort((left, right) => {
    if (Math.abs(left.top - right.top) > 4) {
      return left.top - right.top
    }
    return left.left - right.left
  })

  const grouped: PdfWord[][] = []
  for (const word of sorted) {
    const current = grouped[grouped.length - 1]
    if (!current) {
      grouped.push([word])
      continue
    }

    const averageTop = current.reduce((sum, entry) => sum + entry.top, 0) / current.length
    if (Math.abs(word.top - averageTop) <= 4) {
      current.push(word)
    } else {
      grouped.push([word])
    }
  }

  return grouped
    .map((line) =>
      normalizeText(
        line
          .sort((left, right) => left.left - right.left)
          .map((entry) => entry.text)
          .join(' '),
      ),
    )
    .filter(Boolean)
}

function shouldInsertTrailingSpace(current: PdfWord, next: PdfWord | undefined) {
  if (!next) return false
  if (current.text.endsWith('-')) return false
  if (/^[,.;:!?)}\]]/.test(next.text)) return false

  const sameLineTolerance = Math.max(4, Math.min(current.height, next.height) * 0.5)
  if (Math.abs(next.top - current.top) > sameLineTolerance) {
    return false
  }

  const currentRight = current.left + current.width
  const horizontalGap = next.left - currentRight
  return horizontalGap >= Math.max(1.5, Math.min(current.height, next.height) * 0.08)
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items))
}

function tokenize(input: string) {
  return input
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
}

function extractQueryTokens(query: string) {
  return unique(tokenize(query).filter((token) => !BOOLEAN_TOKENS.has(token)))
}

function normalizeSearchToken(input: string) {
  return input.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

function compactSearchText(input: string) {
  return input.toLowerCase().replace(/[\s\-_]+/g, '').replace(/[^\p{L}\p{N}]+/gu, '')
}

function levenshteinDistance(left: string, right: string) {
  if (left === right) return 0
  if (left.length === 0) return right.length
  if (right.length === 0) return left.length

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)

  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0]
    previous[0] = i
    for (let j = 1; j <= right.length; j += 1) {
      const temp = previous[j]
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (left[i - 1] === right[j - 1] ? 0 : 1),
      )
      diagonal = temp
    }
  }

  return previous[right.length]
}

function allowedFuzzyDistance(keyword: string, flexibility: number) {
  if (flexibility < 25) return 0
  if (keyword.length <= 4) return flexibility >= 75 ? 1 : 0
  if (keyword.length <= 8) return flexibility >= 85 ? 2 : flexibility >= 45 ? 1 : 0
  return flexibility >= 92 ? 3 : flexibility >= 70 ? 2 : flexibility >= 40 ? 1 : 0
}

function countKeywordMatchesInWords(words: string[], keyword: string, flexibility: number) {
  const normalizedKeyword = normalizeSearchToken(keyword)
  if (!normalizedKeyword) return 0

  const compactKeyword = compactSearchText(keyword)
  const maxDistance = allowedFuzzyDistance(normalizedKeyword, flexibility)
  let matches = 0

  for (let index = 0; index < words.length; index += 1) {
    const normalizedWord = normalizeSearchToken(words[index] ?? '')
    if (!normalizedWord) continue

    if (normalizedWord.includes(normalizedKeyword) || normalizedKeyword.includes(normalizedWord)) {
      matches += 1
      continue
    }

    if (maxDistance > 0 && levenshteinDistance(normalizedWord, normalizedKeyword) <= maxDistance) {
      matches += 1
      continue
    }

    if (index < words.length - 1) {
      const compactPair = compactSearchText(`${words[index]}${words[index + 1]}`)
      if (compactPair === compactKeyword || compactPair.includes(compactKeyword)) {
        matches += 1
      }
    }
  }

  return matches
}

function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildSearchCorpus(document: Document) {
  return [document.title, document.authors.join(' '), document.abstract, document.searchText, document.tags.join(' ')]
    .filter(Boolean)
    .join(' ')
}

function buildDocumentSearchCorpus(document: Document) {
  return [document.searchText, document.abstract]
    .filter(Boolean)
    .join(' ')
}

function countMatches(input: string, expression: RegExp) {
  let count = 0
  let match: RegExpExecArray | null
  const scoped = new RegExp(expression.source, expression.flags.includes('g') ? expression.flags : `${expression.flags}g`)
  while ((match = scoped.exec(input))) {
    count += 1
  }
  return count
}

function normalizeOccurrenceSnippet(input: string) {
  return input.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim()
}

function splitIntoSearchFragments(input: string) {
  const normalized = input.replace(/\s+/g, ' ').trim()
  if (!normalized) return []

  const sentenceLike = splitIntoSentenceLikeSegments(normalized)
    .map((part) => part.trim())
    .filter((part) => part.length >= 20)

  const fragments: string[] = []
  for (const part of sentenceLike) {
    if (part.length <= 220) {
      fragments.push(part)
      continue
    }

    for (let start = 0; start < part.length; start += 160) {
      const chunk = part.slice(start, start + 220).trim()
      if (chunk.length >= 20) {
        fragments.push(chunk)
      }
    }
  }

  return fragments
}

function buildSnippetFromWords(words: PdfWord[], startIndex: number, endIndex: number, radius = 10) {
  const snippetStart = Math.max(0, startIndex - radius)
  const snippetEnd = Math.min(words.length, endIndex + radius + 1)
  const prefix = snippetStart > 0 ? '...' : ''
  const suffix = snippetEnd < words.length ? '...' : ''
  const snippet = words.slice(snippetStart, snippetEnd).map((word) => word.text).join(' ')
  return `${prefix}${snippet}${suffix}`.trim()
}

function wordMatchesToken(word: string, token: string) {
  const normalizedWord = word.toLowerCase()
  const normalizedToken = token.toLowerCase()
  return normalizedWord.startsWith(normalizedToken) || normalizedWord.includes(normalizedToken)
}

function findMatchesInWordList(words: PdfWord[], query: string, maxResults = 100) {
  const queryTokens = extractQueryTokens(query)
  if (queryTokens.length === 0 || words.length === 0) return []

  const occurrences: Array<{ matchedText: string; startIndex: number; endIndex: number; snippet: string; rects: SearchOccurrence['rects'] }> = []
  const seen = new Set<string>()

  const addMatch = (startIndex: number, endIndex: number) => {
    if (occurrences.length >= maxResults) return

    const matchedWords = words.slice(startIndex, endIndex + 1)
    const snippet = buildSnippetFromWords(words, startIndex, endIndex)
    const dedupeKey = `${startIndex}:${endIndex}:${normalizeOccurrenceSnippet(snippet)}`
    if (seen.has(dedupeKey)) return
    seen.add(dedupeKey)

    occurrences.push({
      matchedText: normalizeText(matchedWords.map((word) => word.text).join(' ')),
      startIndex,
      endIndex,
      snippet,
      rects: matchedWords.map((word) => ({
        left: word.left,
        top: word.top,
        width: word.width,
        height: word.height,
      })),
    })
  }

  if (queryTokens.length > 1) {
    for (let index = 0; index <= words.length - queryTokens.length; index += 1) {
      let matchesAll = true
      for (let offset = 0; offset < queryTokens.length; offset += 1) {
        if (!wordMatchesToken(words[index + offset]?.text ?? '', queryTokens[offset])) {
          matchesAll = false
          break
        }
      }

      if (matchesAll) {
        addMatch(index, index + queryTokens.length - 1)
      }
    }
  }

  for (const token of queryTokens) {
    for (let index = 0; index < words.length; index += 1) {
      if (occurrences.length >= maxResults) break
      if (wordMatchesToken(words[index]?.text ?? '', token)) {
        addMatch(index, index)
      }
    }
  }

  return occurrences
}

export async function loadPdfJsModule() {
  if (!pdfJsPromise) {
    pdfJsPromise = (async () => {
      if (typeof window === 'undefined') {
        throw new Error('PDF.js can only be initialized in a browser context.')
      }

      const candidate = resolvePdfJsCandidate(await browserModuleImport(BROWSER_PDFJS_MODULE_PATH))

      if (!candidate || typeof candidate !== 'object') {
        throw new Error('PDF.js module could not be initialized.')
      }

      const pdfjs = candidate as PdfJsModule
      if (
        !pdfjs.GlobalWorkerOptions
        || (typeof pdfjs.GlobalWorkerOptions !== 'object' && typeof pdfjs.GlobalWorkerOptions !== 'function')
      ) {
        throw new Error('PDF.js worker options are unavailable in this build.')
      }

      pdfjs.GlobalWorkerOptions.workerSrc = BROWSER_PDFJS_WORKER_PATH
      await ensurePdfJsWorkerModuleLoaded()

      return pdfjs
    })().catch((error) => {
      pdfJsPromise = null
      throw error
    })
  }

  return pdfJsPromise
}

async function extractPdfPages(filePath: string) {
  const cached = pdfWordCache.get(filePath)
  if (cached) {
    return cached
  }

  const loadingPromise = (async () => {
    const pdfjs = await loadPdfJsModule()
    const bytes = await readFile(filePath)
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(bytes),
      disableWorker: false,
      useWorkerFetch: false,
      isEvalSupported: false,
      stopAtErrors: false,
    })

    const pdf = (await loadingTask.promise) as {
      numPages: number
      getPage: (pageNumber: number) => Promise<{
        getViewport: (args: { scale: number }) => { width: number; height: number }
        getTextContent: (args?: { disableNormalization?: boolean }) => Promise<{
          items: Array<{
            str?: string
            width?: number
            height?: number
            transform?: number[]
          }>
        }>
        cleanup?: () => void
      }>
      destroy?: () => Promise<void>
    }

    try {
      const pages: PdfPageWords[] = []

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber)
        const viewport = page.getViewport({ scale: 1 })
        const textContent = await page.getTextContent({ disableNormalization: false })
        const words: PdfWord[] = []

        for (const item of textContent.items) {
          const raw = normalizeText(item.str ?? '')
          if (!raw) continue

          const segments = raw.split(/\s+/).filter(Boolean)
          if (segments.length === 0) continue

          const totalCharacters = segments.reduce((sum, segment) => sum + segment.length, 0)
          const itemWidth = Math.max(item.width ?? 0, segments.length * 8)
          const itemHeight = Math.max(item.height ?? 0, 10)
          const transform = item.transform ?? [1, 0, 0, 1, 0, 0]
          let cursorX = transform[4] ?? 0

          for (const segment of segments) {
            const ratio = totalCharacters > 0 ? segment.length / totalCharacters : 1 / segments.length
            const width = Math.max(6, itemWidth * ratio)
            words.push({
              text: segment,
              left: cursorX,
              top: viewport.height - (transform[5] ?? 0) - itemHeight,
              width,
              height: itemHeight,
              confidence: 1,
            })
            cursorX += width + 2
          }
        }

        for (let index = 0; index < words.length; index += 1) {
          words[index]!.trailingSpace = shouldInsertTrailingSpace(words[index]!, words[index + 1])
        }

        pages.push({
          pageNumber,
          text: words.map((word) => word.text).join(' '),
          words,
        })

        page.cleanup?.()
      }

      return pages
    } finally {
      await pdf.destroy?.()
    }
  })().catch((error) => {
    pdfWordCache.delete(filePath)
    throw error
  })

  pdfWordCache.set(filePath, loadingPromise)
  return loadingPromise
}

export async function extractPdfPageWords(filePath: string) {
  return extractPdfPages(filePath)
}

export async function extractPdfDocumentText(filePath: string) {
  const pages = await extractPdfPages(filePath)
  return {
    pageCount: pages.length,
    pages,
    text: pages.map((page) => page.text).join('\n\n'),
  }
}

export async function extractPdfPageLines(filePath: string): Promise<PdfPageLines[]> {
  const pages = await extractPdfPages(filePath)
  return pages.map((page) => ({
    pageNumber: page.pageNumber,
    text: page.text,
    lines: buildPageLines(page.words),
  }))
}

export async function extractPdfSearchText(filePath: string) {
  const { text } = await extractPdfDocumentText(filePath)
  return text
}

export async function extractPdfSearchFragments(filePath: string) {
  const pages = await extractPdfPages(filePath)
  return pages.map((page) => page.text).filter(Boolean)
}

export function deriveOcrState(searchText?: string) {
  const normalized = (searchText ?? '').trim()
  if (normalized.length >= 200) {
    return {
      hasOcr: true,
      ocrStatus: 'complete' as const,
    }
  }

  return {
    hasOcr: false,
    ocrStatus: 'failed' as const,
  }
}

export function scoreDocumentMatch(document: Document, query: string) {
  const trimmedQuery = query.trim().toLowerCase()
  if (!trimmedQuery) return { rawScore: 0, confidence: 0 }

  const tokens = extractQueryTokens(trimmedQuery)
  if (tokens.length === 0) return { rawScore: 0, confidence: 0 }

  const title = document.title.toLowerCase()
  const authors = document.authors.join(' ').toLowerCase()
  const abstract = (document.abstract ?? '').toLowerCase()
  const content = (document.searchText ?? '').toLowerCase()
  const tags = document.tags.join(' ').toLowerCase()

  let score = 0
  if (title.includes(trimmedQuery)) score += 90
  if (authors.includes(trimmedQuery)) score += 35
  if (abstract.includes(trimmedQuery)) score += 30
  if (content.includes(trimmedQuery)) score += 45
  if (tags.includes(trimmedQuery)) score += 25

  for (const token of tokens) {
    if (title.includes(token)) score += 20
    if (authors.includes(token)) score += 8
    if (abstract.includes(token)) score += 6
    if (content.includes(token)) score += 10
    if (tags.includes(token)) score += 5
  }

  const confidence = Math.min(100, Math.round(score / Math.max(tokens.length, 1)))
  return { rawScore: score, confidence }
}

export function extractSearchPreview(document: Document, query: string, radius = 100) {
  const corpus = buildSearchCorpus(document)
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return corpus.slice(0, radius * 2).trim()

  const lowerCorpus = corpus.toLowerCase()
  const lowerQuery = trimmedQuery.toLowerCase()
  const tokenMatches = unique([lowerQuery, ...extractQueryTokens(lowerQuery)]).filter(Boolean)

  for (const token of tokenMatches) {
    const index = lowerCorpus.indexOf(token)
    if (index >= 0) {
      const start = Math.max(0, index - radius)
      const end = Math.min(corpus.length, index + token.length + radius)
      const prefix = start > 0 ? '...' : ''
      const suffix = end < corpus.length ? '...' : ''
      return `${prefix}${corpus.slice(start, end).trim()}${suffix}`
    }
  }

  return corpus.slice(0, radius * 2).trim()
}

export function findDocumentSearchOccurrences(document: Document, query: string, maxResults = 100): SearchOccurrence[] {
  const corpus = buildDocumentSearchCorpus(document)
  const trimmedQuery = query.trim()
  if (!trimmedQuery || !corpus) return []

  const tokens = extractQueryTokens(trimmedQuery)
  if (tokens.length === 0) return []

  const fragments = splitIntoSearchFragments(corpus)
  if (fragments.length === 0) return []

  const occurrences: SearchOccurrence[] = []
  const seen = new Set<string>()

  for (const [fragmentIndex, fragment] of fragments.entries()) {
    if (occurrences.length >= maxResults) break

    const normalizedFragment = fragment.toLowerCase()
    const fullQueryExpression = new RegExp(escapeRegExp(trimmedQuery), 'i')
    const fullMatch = normalizedFragment.match(fullQueryExpression)

    if (fullMatch) {
      const start = fullMatch.index ?? 0
      const end = start + fullMatch[0].length
      const snippetStart = Math.max(0, start - 70)
      const snippetEnd = Math.min(fragment.length, end + 70)
      const snippet = `${snippetStart > 0 ? '...' : ''}${fragment.slice(snippetStart, snippetEnd).trim()}${snippetEnd < fragment.length ? '...' : ''}`
      const dedupeKey = `${fragmentIndex}:${normalizeOccurrenceSnippet(snippet)}`
      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey)
        occurrences.push({
          index: occurrences.length,
          matchedText: fragment.slice(start, end),
          start,
          end,
          estimatedPage: document.pageCount
            ? Math.min(document.pageCount, Math.max(1, Math.floor((fragmentIndex / Math.max(fragments.length, 1)) * document.pageCount) + 1))
            : 1,
          snippet,
        })
      }
      continue
    }

    for (const token of tokens) {
      const tokenIndex = normalizedFragment.indexOf(token)
      if (tokenIndex < 0) continue

      const snippetStart = Math.max(0, tokenIndex - 70)
      const snippetEnd = Math.min(fragment.length, tokenIndex + token.length + 70)
      const snippet = `${snippetStart > 0 ? '...' : ''}${fragment.slice(snippetStart, snippetEnd).trim()}${snippetEnd < fragment.length ? '...' : ''}`
      const dedupeKey = `${fragmentIndex}:${normalizeOccurrenceSnippet(snippet)}`
      if (seen.has(dedupeKey)) {
        continue
      }

      seen.add(dedupeKey)
      occurrences.push({
        index: occurrences.length,
        matchedText: fragment.slice(tokenIndex, tokenIndex + token.length),
        start: tokenIndex,
        end: tokenIndex + token.length,
        estimatedPage: document.pageCount
          ? Math.min(document.pageCount, Math.max(1, Math.floor((fragmentIndex / Math.max(fragments.length, 1)) * document.pageCount) + 1))
          : 1,
        snippet,
      })

      if (occurrences.length >= maxResults) break
    }
  }

  return occurrences
}

export async function findPdfSearchOccurrences(filePath: string, query: string, _pageCount?: number, maxResults = 100): Promise<SearchOccurrence[]> {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return []

  const pages = await extractPdfPages(filePath)
  const occurrences: SearchOccurrence[] = []

  for (const page of pages) {
    if (occurrences.length >= maxResults) break

    const pageMatches = findMatchesInWordList(page.words, trimmedQuery, maxResults - occurrences.length)
    for (const match of pageMatches) {
      occurrences.push({
        index: occurrences.length,
        matchedText: match.matchedText,
        start: match.startIndex,
        end: match.endIndex,
        estimatedPage: page.pageNumber,
        snippet: match.snippet,
        rects: match.rects,
      })

      if (occurrences.length >= maxResults) break
    }
  }

  return occurrences
}

export async function searchDocumentDeep(document: Document, query: string) {
  return searchDocumentDeepWithOptions(document, query)
}

export async function searchDocumentDeepWithOptions(
  document: Document,
  query: string,
  options?: {
    keywords?: string[]
    flexibility?: number
  },
) {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) {
    return { rawScore: 0, confidence: 0, preview: '', matchCount: 0 }
  }

  const keywords = unique((options?.keywords?.length ? options.keywords : trimmedQuery.split(',')).map((keyword) => keyword.trim()).filter(Boolean))
  const effectiveKeywords = keywords.length > 0 ? keywords : [trimmedQuery]
  const flexibility = options?.flexibility ?? 0
  const metadataScore = scoreDocumentMatch(document, trimmedQuery)
  const previewFallback = extractSearchPreview(document, trimmedQuery, 120)

  if (!document.filePath) {
    const corpusWords = buildDocumentSearchCorpus(document).split(/\s+/).filter(Boolean)
    const matchCount = effectiveKeywords.reduce((sum, keyword) => sum + countKeywordMatchesInWords(corpusWords, keyword, flexibility), 0)
    const occurrences = findDocumentSearchOccurrences(document, effectiveKeywords[0] ?? trimmedQuery, 200)
    return {
      rawScore: metadataScore.rawScore + matchCount * 20,
      confidence: Math.min(100, metadataScore.confidence + Math.min(40, matchCount * 4)),
      preview: occurrences[0]?.snippet ?? previewFallback,
      matchCount,
    }
  }

  const pages = await extractPdfPages(document.filePath)
  const fullQueryExpression = new RegExp(escapeRegExp(trimmedQuery), 'gi')
  const tokenExpressions = extractQueryTokens(trimmedQuery).map((token) => new RegExp(escapeRegExp(token), 'gi'))

  let matchCount = 0
  let preview = ''
  let phraseMatches = 0

  for (const page of pages) {
    const pageWords = page.words.map((word) => word.text)
    const keywordMatchCount = effectiveKeywords.reduce((sum, keyword) => sum + countKeywordMatchesInWords(pageWords, keyword, flexibility), 0)
    const matches = findMatchesInWordList(page.words, effectiveKeywords[0] ?? trimmedQuery, 200)
    if (matches.length > 0) {
      matchCount += Math.max(matches.length, keywordMatchCount)
      if (!preview) {
        preview = matches[0].snippet
      }
      phraseMatches += matches.filter((match) => match.endIndex > match.startIndex).length
      continue
    }

    const fullMatches = countMatches(page.text, fullQueryExpression)
    const tokenMatches = tokenExpressions.reduce((sum, expression) => sum + countMatches(page.text, expression), 0)
    const pageMatches = Math.max(fullMatches > 0 ? fullMatches : tokenMatches > 0 ? 1 : 0, keywordMatchCount)
    if (pageMatches > 0) {
      matchCount += pageMatches
      if (!preview) {
        preview = extractSearchPreview(
          {
            ...document,
            searchText: page.text,
          },
          trimmedQuery,
          120,
        )
      }
    }
  }

  return {
    rawScore: metadataScore.rawScore + matchCount * 24 + phraseMatches * 18,
    confidence: Math.min(100, metadataScore.confidence + Math.min(60, matchCount * 3 + phraseMatches * 4)),
    preview: preview || previewFallback,
    matchCount,
  }
}

export function extractTopKeywords(document: Pick<Document, 'title' | 'abstract' | 'searchText' | 'authors'>, limit = 5) {
  const corpus = [document.title, document.abstract, document.searchText, document.authors.join(' ')]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  const counts = tokenize(corpus).reduce<Record<string, number>>((acc, token) => {
    if (STOP_WORDS.has(token) || token.length < 4) return acc
    acc[token] = (acc[token] ?? 0) + 1
    return acc
  }, {})

  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([token]) => token)
}
