'use client'

import { GEMINI_MODEL_OPTIONS, getResolvedGeminiApiKey, loadAppSettings } from '@/lib/app-settings'
import * as repo from '@/lib/repositories/local-db'
import { classifyDocumentSemantics, coerceIncomingDocumentClassification, serializeDocumentClassification, type IncomingDocumentClassification } from '@/lib/services/document-classification-service'
import { serializeSuggestedTags } from '@/lib/services/document-tag-suggestion-service'
import { getDocumentPlainText, readPersistedDocumentText } from '@/lib/services/document-text-service'

const KEYWORD_SECTION_REGEX =
  /(?:^|\n)\s*(keywords?|key words|index terms?|mots[ -]?cl(?:e|é)s|palavras[ -]?chave)\s*[:\-]\s*(.+)/i

const MAX_KEYWORDS = 12
const LOCAL_STOP_WORDS = new Set([
  'a', 'an', 'about', 'after', 'again', 'also', 'among', 'analysis', 'and', 'appendix', 'approach',
  'article', 'are', 'around', 'as', 'at', 'based', 'be', 'been', 'between', 'both', 'by', 'can',
  'chapter', 'conference', 'consider', 'dataset', 'datasets', 'describes', 'did', 'discuss',
  'document', 'does', 'during', 'each', 'effect', 'effects', 'example', 'experiments', 'figure',
  'findings', 'first', 'for', 'form', 'forms', 'from', 'further', 'had', 'has', 'have', 'having',
  'however', 'important', 'in', 'including', 'into',
  'introduction', 'is', 'journal', 'key', 'keyword', 'keywords', 'method', 'methods', 'model',
  'models', 'most', 'no', 'not', 'of', 'off', 'often', 'on', 'onto', 'or', 'other', 'our',
  'over', 'paper', 'papers', 'propose', 'proposed', 'provide', 'provides', 'research', 'result',
  'results', 'section', 'show', 'shows', 'since', 'some', 'study', 'studies', 'such', 'table',
  'than', 'that', 'the', 'their', 'there', 'these', 'they', 'this', 'those', 'through', 'throughout',
  'to', 'toward', 'under', 'using', 'used', 'uses', 'very', 'via', 'was', 'we', 'were', 'what',
  'when', 'where', 'whether', 'which', 'while', 'with', 'within', 'without', 'would',
])

export type DetectedDocumentKeywordsResult = {
  documentId: string
  keywords: string[]
  summary?: string
  source: 'author_list' | 'local_heuristic' | 'gemini_page1' | 'gemini_full'
  classificationStored?: boolean
}

type DetectKeywordOptions = {
  forceAi?: boolean
  forceLocal?: boolean
  autoMode?: boolean
}

export function normalizeWhitespace(input: string) {
  return input.replace(/\s+/g, ' ').trim()
}

export function normalizeKeyword(input: string) {
  return normalizeWhitespace(input).toLowerCase()
}

function dedupeKeywords(values: string[]) {
  return Array.from(new Set(values.map((value) => normalizeKeyword(value)).filter(Boolean))).slice(0, MAX_KEYWORDS)
}

function splitKeywordList(input: string) {
  return input
    .split(/[,;•·]/)
    .map((entry) => normalizeKeyword(entry))
    .filter(Boolean)
}

function getFirstPageText(
  plainText: string,
  persistedText?: Awaited<ReturnType<typeof readPersistedDocumentText>> | null,
) {
  const persistedFirstPage = persistedText?.pages.find((page) => page.pageNumber === 1)?.text
  return normalizeWhitespace((persistedFirstPage || plainText).slice(0, 4_000))
}

export function extractAuthorKeywords(page1: string): string[] {
  const normalizedPageText = page1.replace(/\r\n/g, '\n')
  const match = KEYWORD_SECTION_REGEX.exec(normalizedPageText)
  if (!match) return []

  let section = match[2] ?? ''
  const stopIndex = section.search(/\n\s*\n|\n[A-Z][A-Za-z\s]{2,}[:\-]/)
  if (stopIndex >= 0) {
    section = section.slice(0, stopIndex)
  }

  return dedupeKeywords(splitKeywordList(section))
}

export function buildKeywordInput(document: repo.DbDocument, firstPageText: string) {
  return normalizeWhitespace(
    [
      document.title,
      document.abstractText,
      firstPageText,
    ]
      .filter(Boolean)
      .join('\n\n'),
  ).slice(0, 6_000)
}

function tokenizeLocalKeywordText(text: string) {
  return Array.from(text.matchAll(/\b[\p{L}][\p{L}\p{N}-]{2,}\b/gu))
    .map((match) => ({
      index: match.index ?? 0,
      token: normalizeKeyword(match[0] ?? ''),
    }))
    .filter(({ token }) => {
      if (!token) return false
      if (LOCAL_STOP_WORDS.has(token)) return false
      if (/^\d+$/.test(token)) return false
      if (token.includes('doi') || token.includes('arxiv')) return false
      return token.length >= 3 && token.length <= 40
    })
}

function isLowSignalKeyword(keyword: string) {
  const parts = keyword.split(' ').filter(Boolean)
  if (parts.length === 0) return true

  if (parts.length === 1) {
    return LOCAL_STOP_WORDS.has(parts[0] ?? '') || keyword.length < 4
  }

  const meaningfulParts = parts.filter((part) => !LOCAL_STOP_WORDS.has(part))
  if (meaningfulParts.length < Math.ceil(parts.length / 2)) return true
  if (LOCAL_STOP_WORDS.has(parts[0] ?? '') || LOCAL_STOP_WORDS.has(parts[parts.length - 1] ?? '')) return true
  return false
}

function scoreLocalKeywordCandidates(text: string) {
  const tokens = tokenizeLocalKeywordText(text)
  const scores = new Map<string, { keyword: string; score: number }>()
  const counts = new Map<string, number>()

  const bump = (keyword: string, amount: number) => {
    counts.set(keyword, (counts.get(keyword) ?? 0) + 1)
    const existing = scores.get(keyword)
    if (existing) {
      existing.score += amount
      return
    }
    scores.set(keyword, { keyword, score: amount })
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const current = tokens[index]
    if (!current) continue
    const positionBoost = index < 24 ? 0.45 : index < 72 ? 0.2 : 0
    bump(current.token, 1 + positionBoost)

    const next = tokens[index + 1]
    if (!next) continue
    const phrase = normalizeKeyword(`${current.token} ${next.token}`)
    if (phrase.length < 7 || phrase.length > 50) continue
    if (isLowSignalKeyword(phrase)) continue
    bump(phrase, 1.35 + positionBoost)
  }

  return Array.from(scores.values())
    .filter((entry) => {
      if (isLowSignalKeyword(entry.keyword)) return false
      const count = counts.get(entry.keyword) ?? 0
      if (entry.keyword.includes(' ')) return count >= 1 && entry.score >= 1.35
      return count >= 2 && entry.score >= 2.4 && entry.keyword.length >= 5
    })
    .sort((left, right) => right.score - left.score || left.keyword.localeCompare(right.keyword))
    .slice(0, MAX_KEYWORDS)
    .map((entry, _, all) => ({
      keyword: entry.keyword,
      score: all[0]?.score ? Number((entry.score / all[0].score).toFixed(2)) : undefined,
    }))
}

async function extractKeywordsWithKeyBert(text: string) {
  const keywords = scoreLocalKeywordCandidates(text)
  if (keywords.length === 0) {
    throw new Error('The local keyword extractor did not find any useful keywords.')
  }
  return keywords
}

function extractGeminiRetryDelay(payload: unknown) {
  const details = Array.isArray((payload as { error?: { details?: unknown } })?.error?.details)
    ? ((payload as { error: { details: Array<{ retryDelay?: unknown }> } }).error.details ?? [])
    : []

  const retryDelay = details.find((entry) => typeof entry?.retryDelay === 'string')?.retryDelay
  return typeof retryDelay === 'string' ? retryDelay : ''
}

async function extractKeywordsWithGemini(args: {
  text: string
  apiKey: string
  model: string
}) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(args.model)}:generateContent?key=${encodeURIComponent(args.apiKey)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        generationConfig: {
          responseMimeType: 'application/json',
        },
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: [
                  'Extract research keywords from this PDF text.',
                  'If author-provided keywords appear, return them exactly.',
                  'Otherwise infer 5 to 12 concise research keywords.',
                  'Include one short summary sentence.',
                  'Also infer a semantic topic classification for the document.',
                  'Return JSON only with: {"keywords": string[], "summary": string, "classification": {"category": string, "topic": string, "confidence": number, "matchedKeywords": string[], "suggestedTags": string[]}}.',
                  '',
                  args.text,
                ].join('\n'),
              },
            ],
          },
        ],
      }),
    },
  )

  if (!response.ok) {
    const responseText = await response.text().catch(() => '')
    let parsedError: unknown = null
    try {
      parsedError = responseText ? JSON.parse(responseText) : null
    } catch {
      parsedError = null
    }

    const errorStatus = typeof (parsedError as { error?: { status?: unknown } })?.error?.status === 'string'
      ? (parsedError as { error: { status: string } }).error.status
      : ''
    const errorMessage = typeof (parsedError as { error?: { message?: unknown } })?.error?.message === 'string'
      ? (parsedError as { error: { message: string } }).error.message
      : ''

    if (response.status === 429 || errorStatus === 'RESOURCE_EXHAUSTED') {
      const retryDelay = extractGeminiRetryDelay(parsedError)
      throw new Error(
        retryDelay
          ? `Gemini quota exceeded. Please wait about ${retryDelay} and try again, or use a paid Gemini plan.`
          : 'Gemini quota exceeded. Please try again later or use a paid Gemini plan.',
      )
    }

    throw new Error(errorMessage || responseText || `Gemini keyword extraction failed (${response.status}).`)
  }

  const payload = await response.json()
  const rawText = payload?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part?.text ?? '')
    .join('')
    .trim()

  if (!rawText) {
    throw new Error('Gemini returned an empty keyword response.')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    throw new Error('Gemini returned invalid JSON for keyword extraction.')
  }

  const keywords = Array.isArray((parsed as { keywords?: unknown }).keywords)
    ? dedupeKeywords(
        ((parsed as { keywords?: unknown[] }).keywords ?? [])
          .map((entry) => (typeof entry === 'string' ? entry : ''))
          .filter(Boolean),
      )
    : []
  const summary = typeof (parsed as { summary?: unknown }).summary === 'string'
    ? normalizeWhitespace((parsed as { summary: string }).summary)
    : undefined
  const classification = (() => {
    const raw = (parsed as { classification?: unknown }).classification
    if (!raw || typeof raw !== 'object') return undefined
    const candidate = raw as Partial<IncomingDocumentClassification>
    return {
      category: typeof candidate.category === 'string' ? candidate.category : '',
      topic: typeof candidate.topic === 'string' ? candidate.topic : '',
      confidence: typeof candidate.confidence === 'number' ? candidate.confidence : undefined,
      matchedKeywords: Array.isArray(candidate.matchedKeywords)
        ? candidate.matchedKeywords.filter((entry): entry is string => typeof entry === 'string')
        : undefined,
      suggestedTags: Array.isArray(candidate.suggestedTags)
        ? candidate.suggestedTags.filter((entry): entry is string => typeof entry === 'string')
        : undefined,
    } satisfies IncomingDocumentClassification
  })()

  if (keywords.length === 0) {
    throw new Error('Gemini did not return any valid keywords.')
  }

  return {
    keywords,
    summary,
    classification,
  }
}

function buildTagSuggestionsFromKeywords(
  keywords: Array<{ keyword: string; score?: number }>,
  source: DetectedDocumentKeywordsResult['source'],
) {
  return keywords.map(({ keyword, score }) => ({
    name: keyword,
    confidence: source === 'author_list'
      ? 1
      : typeof score === 'number'
        ? Number(Math.max(0.5, Math.min(1, score)).toFixed(2))
        : source === 'local_heuristic'
          ? 0.9
          : 0.8,
  }))
}

async function updateDocumentKeywordSuggestions(
  document: repo.DbDocument,
  keywords: Array<{ keyword: string; score?: number }>,
  source: DetectedDocumentKeywordsResult['source'],
) {
  const processedAt = new Date().toISOString()
  await repo.updateDocumentMetadata(document.id, {
    tagSuggestions: serializeSuggestedTags(buildTagSuggestionsFromKeywords(keywords, source)),
    tagSuggestionStatus: 'complete',
    tagSuggestionTextHash: document.textHash,
    processingUpdatedAt: processedAt,
    lastProcessedAt: processedAt,
  })
}

async function persistAiClassification(
  document: repo.DbDocument,
  classification: IncomingDocumentClassification | undefined,
  source: 'gemini_page1' | 'gemini_full',
  model: string,
) {
  const normalizedClassification = coerceIncomingDocumentClassification(classification, {
    provider: source,
    model,
  })

  if (normalizedClassification) {
    const processedAt = new Date().toISOString()
    await repo.updateDocumentMetadata(document.id, {
      classificationResult: serializeDocumentClassification(normalizedClassification),
      classificationStatus: 'complete',
      classificationTextHash: document.textHash,
      processingUpdatedAt: processedAt,
      lastProcessedAt: processedAt,
    })
    return true
  }

  await classifyDocumentSemantics(document.id, { mode: 'local_heuristic' })
  return true
}

function getDailyAiCounterKey() {
  return `gemini_auto_${new Date().toISOString().slice(0, 10)}`
}

async function isUnderDailyAiLimit(limit: string) {
  const parsedLimit = Math.max(0, Number.parseInt(limit || '0', 10) || 0)
  if (parsedLimit <= 0) return false
  const counter = await repo.getUsageCounter(getDailyAiCounterKey())
  const current = Math.max(0, Number.parseInt(counter?.value || '0', 10) || 0)
  return current < parsedLimit
}

async function incrementDailyAiUsage() {
  const key = getDailyAiCounterKey()
  const counter = await repo.getUsageCounter(key)
  const current = Math.max(0, Number.parseInt(counter?.value || '0', 10) || 0)
  await repo.setUsageCounter(key, String(current + 1))
}

async function storeKeywords(
  document: repo.DbDocument,
  keywords: Array<{ keyword: string; score?: number }>,
  source: DetectedDocumentKeywordsResult['source'],
  summary?: string,
  apiMode: string = 'local',
  options?: {
    classification?: IncomingDocumentClassification
    model?: string
  },
) {
  const normalizedKeywords = dedupeKeywords(keywords.map((entry) => entry.keyword))
  const normalizedRows = normalizedKeywords.map((keyword) => ({
    keyword,
    score: keywords.find((entry) => entry.keyword === keyword)?.score,
    summary,
    source,
    apiMode,
  }))

  await repo.replaceDocumentKeywords(document.id, normalizedRows)
  await updateDocumentKeywordSuggestions(document, normalizedRows, source)
  const classificationStored =
    (source === 'gemini_page1' || source === 'gemini_full')
      ? await persistAiClassification(document, options?.classification, source, options?.model ?? 'gemini')
      : false

  return {
    documentId: document.id,
    keywords: normalizedRows.map((entry) => entry.keyword),
    summary,
    source,
    classificationStored,
  } satisfies DetectedDocumentKeywordsResult
}

export async function detectAndStoreDocumentKeywords(
  documentId: string,
  options?: DetectKeywordOptions,
) {
  const document = await repo.getDocumentById(documentId)
  if (!document) {
    throw new Error(`Document ${documentId} was not found.`)
  }

  const settings = await loadAppSettings(true)
  const persistedText = await readPersistedDocumentText(document)
  const plainText = normalizeWhitespace(await getDocumentPlainText(document))
  if (!plainText) {
    if (options?.forceAi) {
      throw new Error('No extracted text is available for this document yet.')
    }
    return {
      documentId,
      keywords: [],
      source: 'author_list' as const,
      classificationStored: false,
    }
  }

  const firstPageText = getFirstPageText(plainText, persistedText)
  if (!options?.forceAi && !options?.forceLocal) {
    const authorKeywords = extractAuthorKeywords(firstPageText)
    if (authorKeywords.length >= 3) {
      return storeKeywords(
        document,
        authorKeywords.map((keyword) => ({ keyword, score: 1 })),
        'author_list',
        undefined,
        'local',
      )
    }
  }

  const keywordInput = buildKeywordInput(document, firstPageText)
  const shouldUseGemini =
    options?.forceAi
    || (
      settings.keywordEngine === 'gemini'
      && settings.autoGeminiOnImport
      && options?.autoMode
      && await isUnderDailyAiLimit(settings.dailyAiAutoLimit)
    )

  if (!options?.forceAi && (options?.forceLocal || settings.keywordEngine === 'local_heuristic' || !shouldUseGemini)) {
    const localKeywords = await extractKeywordsWithKeyBert(keywordInput)
    return storeKeywords(document, localKeywords, 'local_heuristic', undefined, 'local')
  }

  const apiKey = getResolvedGeminiApiKey(settings).trim()
  if (!apiKey) {
    if (options?.forceAi) {
      throw new Error('Gemini API key is not configured.')
    }
    const fallbackKeywords = await extractKeywordsWithKeyBert(keywordInput)
    return storeKeywords(document, fallbackKeywords, 'local_heuristic', undefined, 'local')
  }

  const selectedModel = GEMINI_MODEL_OPTIONS.find((option) => option.value === settings.geminiModel)?.value
  if (!selectedModel) {
    throw new Error('The selected Gemini model is not supported.')
  }

  const extractionMode = settings.keywordExtractionMode
  const textForGemini = extractionMode === 'full'
    ? normalizeWhitespace(plainText.slice(0, 12_000))
    : normalizeWhitespace(firstPageText.slice(0, 4_000))
  const source = extractionMode === 'full' ? 'gemini_full' : 'gemini_page1'
  const extracted = await extractKeywordsWithGemini({
    text: textForGemini,
    apiKey,
    model: selectedModel,
  })

  if (options?.autoMode) {
    await incrementDailyAiUsage()
  }

  return storeKeywords(
    document,
    extracted.keywords.map((keyword) => ({ keyword, score: 0.8 })),
    source,
    extracted.summary,
    options?.autoMode ? 'auto_ai' : 'manual_ai',
    {
      classification: extracted.classification,
      model: selectedModel,
    },
  )
}
