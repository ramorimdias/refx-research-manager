'use client'

import * as repo from '@/lib/repositories/local-db'
import { getDocumentPlainText } from '@/lib/services/document-text-service'
import type { Document, SuggestedTag } from '@/lib/types'

type Candidate = {
  count: number
  firstPosition: number
  name: string
  segments: Set<number>
}

export type DocumentTagSuggestionResult = {
  documentId: string
  suggestedTags: SuggestedTag[]
  textHash?: string
}

const MAX_SUGGESTED_TAGS = 8
const SEGMENT_SIZE = 1200
const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'among', 'analysis', 'and', 'appendix', 'approach', 'approaches', 'article',
  'based', 'between', 'both', 'can', 'chapter', 'conference', 'consider', 'dataset', 'datasets', 'demonstrate',
  'describes', 'discuss', 'document', 'during', 'each', 'effect', 'effects', 'example', 'experiments', 'figure',
  'findings', 'first', 'from', 'further', 'have', 'however', 'http', 'https', 'important', 'including', 'into',
  'introduction', 'journal', 'keyword', 'keywords', 'method', 'methods', 'model', 'models', 'most', 'paper',
  'papers', 'propose', 'proposed', 'provide', 'provides', 'research', 'result', 'results', 'section', 'study',
  'studies', 'such', 'table', 'that', 'their', 'there', 'these', 'this', 'those', 'through', 'using', 'used',
  'uses', 'very', 'were', 'what', 'when', 'where', 'which', 'while', 'with', 'within', 'would', 'www',
])

function normalizeWhitespace(input: string) {
  return input.replace(/\s+/g, ' ').trim()
}

function normalizeTagName(input: string) {
  return normalizeWhitespace(input.toLowerCase().replace(/[^\p{L}\p{N}\s-]+/gu, ' ').replace(/[-_]+/g, ' '))
}

function parseSuggestedTags(value?: string | SuggestedTag[]) {
  if (!value) return []
  let parsed: unknown
  try {
    parsed = typeof value === 'string' ? JSON.parse(value) as unknown : value
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  return parsed
    .map((entry) => ({
      name: typeof entry?.name === 'string' ? normalizeTagName(entry.name) : '',
      confidence: typeof entry?.confidence === 'number' ? entry.confidence : undefined,
    }))
    .filter((entry) => entry.name.length > 0)
}

function parseRejectedSuggestedTags(value?: string | string[]) {
  if (!value) return []
  let parsed: unknown
  try {
    parsed = typeof value === 'string' ? JSON.parse(value) as unknown : value
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  return Array.from(
    new Set(
      parsed
        .map((entry) => normalizeTagName(typeof entry === 'string' ? entry : ''))
        .filter(Boolean),
    ),
  )
}

export function serializeSuggestedTags(tags: SuggestedTag[]) {
  return JSON.stringify(tags)
}

export function serializeRejectedSuggestedTags(tags: string[]) {
  return JSON.stringify(tags)
}

type SuggestedTagSource = {
  suggestedTags?: SuggestedTag[]
  tagSuggestions?: string
}

type RejectedSuggestedTagSource = {
  rejectedSuggestedTags?: string[]
  rejectedTagSuggestions?: string
}

export function getDocumentSuggestedTags(document: SuggestedTagSource) {
  return parseSuggestedTags(document.suggestedTags ?? document.tagSuggestions)
}

export function getDocumentRejectedSuggestedTags(document: RejectedSuggestedTagSource) {
  return parseRejectedSuggestedTags(document.rejectedSuggestedTags ?? document.rejectedTagSuggestions)
}

function pruneReferencesSection(text: string) {
  const markers = ['\nreferences\n', '\nbibliography\n', '\nacknowledgements\n', '\nacknowledgments\n']
  const lowered = `\n${text.toLowerCase()}\n`

  for (const marker of markers) {
    const index = lowered.indexOf(marker)
    if (index > 0) {
      return text.slice(0, Math.max(0, index - 1))
    }
  }

  return text
}

function tokenizeText(text: string) {
  const tokens = Array.from(text.matchAll(/\b[\p{L}][\p{L}\p{N}-]{2,}\b/gu))
  return tokens
    .map((match) => {
      const raw = match[0] ?? ''
      const normalized = normalizeTagName(raw)
      return {
        index: match.index ?? 0,
        normalized,
      }
    })
    .filter((token) => {
      if (!token.normalized) return false
      if (STOP_WORDS.has(token.normalized)) return false
      if (/^\d+$/.test(token.normalized)) return false
      if (token.normalized.includes('doi')) return false
      if (token.normalized.includes('arxiv')) return false
      return token.normalized.length >= 3 && token.normalized.length <= 40
    })
}

function addCandidate(
  map: Map<string, Candidate>,
  name: string,
  position: number,
  segment: number,
) {
  const existing = map.get(name)
  if (existing) {
    existing.count += 1
    existing.segments.add(segment)
    existing.firstPosition = Math.min(existing.firstPosition, position)
    return
  }

  map.set(name, {
    count: 1,
    firstPosition: position,
    name,
    segments: new Set([segment]),
  })
}

function extractCandidateTags(text: string) {
  const cleaned = pruneReferencesSection(text).slice(0, 40_000)
  const tokens = tokenizeText(cleaned)
  const candidates = new Map<string, Candidate>()

  for (const token of tokens) {
    addCandidate(candidates, token.normalized, token.index, Math.floor(token.index / SEGMENT_SIZE))
  }

  for (let index = 0; index < tokens.length - 1; index += 1) {
    const left = tokens[index]
    const right = tokens[index + 1]
    if (!left || !right) continue
    const phrase = normalizeTagName(`${left.normalized} ${right.normalized}`)
    if (!phrase || phrase.length < 7 || phrase.length > 50) continue
    addCandidate(candidates, phrase, left.index, Math.floor(left.index / SEGMENT_SIZE))
  }

  return Array.from(candidates.values())
}

function scoreCandidate(candidate: Candidate) {
  const segmentCoverage = candidate.segments.size
  const phraseBonus = candidate.name.includes(' ') ? 1.45 : 1
  const positionBonus = 1.2 - Math.min(0.5, candidate.firstPosition / 20_000)
  return (candidate.count * 0.85 + segmentCoverage * 1.35) * phraseBonus * positionBonus
}

function buildSuggestedTags(
  text: string,
  options?: {
    existingTags?: string[]
    rejectedTags?: string[]
  },
) {
  const existing = new Set((options?.existingTags ?? []).map((tag) => normalizeTagName(tag)).filter(Boolean))
  const rejected = new Set((options?.rejectedTags ?? []).map((tag) => normalizeTagName(tag)).filter(Boolean))
  const scored = extractCandidateTags(text)
    .filter((candidate) => candidate.count >= (candidate.name.includes(' ') ? 2 : 3))
    .filter((candidate) => !existing.has(candidate.name))
    .filter((candidate) => !rejected.has(candidate.name))
    .sort((left, right) => scoreCandidate(right) - scoreCandidate(left) || left.name.localeCompare(right.name))

  const topCandidates = scored.slice(0, MAX_SUGGESTED_TAGS)
  const topScore = topCandidates[0] ? scoreCandidate(topCandidates[0]) : 0

  return topCandidates.map((candidate) => ({
    name: candidate.name,
    confidence: topScore > 0 ? Number((scoreCandidate(candidate) / topScore).toFixed(2)) : undefined,
  }))
}

export async function generateDocumentTagSuggestions(documentId: string): Promise<DocumentTagSuggestionResult> {
  const document = await repo.getDocumentById(documentId)
  if (!document) {
    throw new Error(`Document ${documentId} was not found.`)
  }

  const text = normalizeWhitespace(await getDocumentPlainText(document))
  if (!text) {
    const processedAt = new Date().toISOString()
    await repo.updateDocumentMetadata(documentId, {
      tagSuggestionStatus: 'pending',
      processingUpdatedAt: processedAt,
      lastProcessedAt: processedAt,
    })

    return {
      documentId,
      suggestedTags: [],
      textHash: document.textHash,
    }
  }

  const suggestedTags = buildSuggestedTags(text, {
    existingTags: document.tags,
    rejectedTags: parseRejectedSuggestedTags(document.rejectedTagSuggestions),
  })
  const processedAt = new Date().toISOString()

  await repo.updateDocumentMetadata(documentId, {
    tagSuggestions: serializeSuggestedTags(suggestedTags),
    tagSuggestionStatus: 'complete',
    tagSuggestionTextHash: document.textHash,
    processingUpdatedAt: processedAt,
    lastProcessedAt: processedAt,
  })

  return {
    documentId,
    suggestedTags,
    textHash: document.textHash,
  }
}

export function buildAcceptedSuggestionUpdates(
  document: Pick<Document, 'rejectedSuggestedTags' | 'suggestedTags'>,
  tagName: string,
) {
  const normalizedTag = normalizeTagName(tagName)
  const suggestedTags = getDocumentSuggestedTags(document).filter((entry) => entry.name !== normalizedTag)
  const rejectedTags = getDocumentRejectedSuggestedTags(document).filter((entry) => entry !== normalizedTag)

  return {
    rejectedSuggestedTags: rejectedTags,
    suggestedTags,
  }
}

export function buildRejectedSuggestionUpdates(
  document: Pick<Document, 'rejectedSuggestedTags' | 'suggestedTags'>,
  tagName: string,
) {
  const normalizedTag = normalizeTagName(tagName)
  const suggestedTags = getDocumentSuggestedTags(document).filter((entry) => entry.name !== normalizedTag)
  const rejectedTags = Array.from(new Set([...getDocumentRejectedSuggestedTags(document), normalizedTag]))

  return {
    rejectedSuggestedTags: rejectedTags,
    suggestedTags,
  }
}

export function buildManualTagUpdates(
  document: Pick<Document, 'rejectedSuggestedTags' | 'suggestedTags'>,
  tagName: string,
) {
  const normalizedTag = normalizeTagName(tagName)
  const suggestedTags = getDocumentSuggestedTags(document).filter((entry) => entry.name !== normalizedTag)
  const rejectedTags = getDocumentRejectedSuggestedTags(document).filter((entry) => entry !== normalizedTag)

  return {
    rejectedSuggestedTags: rejectedTags,
    suggestedTags,
  }
}

export function normalizeDocumentTagName(tagName: string) {
  return normalizeTagName(tagName)
}
