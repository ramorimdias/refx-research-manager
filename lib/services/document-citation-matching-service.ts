'use client'

import type { CitationMatchMethod, Document, ParsedDocumentReference } from '@/lib/types'
import { normalizeTitle } from '@/lib/services/document-reference-parser-service'

export type CitationMatchResult = {
  confidence: number
  matchMethod: CitationMatchMethod
  parsedReference: ParsedDocumentReference
  sourceDocument: Document
  targetDocument: Document
  debugInfo: string
}

function normalizeWhitespace(input?: string | null) {
  return (input ?? '').replace(/\s+/g, ' ').trim()
}

function normalizeDoi(input?: string | null) {
  return normalizeWhitespace(input).toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '')
}

function titleTokens(input?: string | null) {
  return normalizeTitle(input)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
}

function firstAuthorKey(authors: string[]) {
  const value = authors[0] ?? ''
  return normalizeTitle(value).split(' ').filter(Boolean)[0] ?? ''
}

function jaccardSimilarity(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) return 0

  const leftSet = new Set(left)
  const rightSet = new Set(right)
  let intersection = 0

  for (const token of leftSet) {
    if (rightSet.has(token)) intersection += 1
  }

  const union = new Set([...leftSet, ...rightSet]).size
  return union > 0 ? intersection / union : 0
}

function candidateDebugInfo(method: CitationMatchMethod, confidence: number, extra: string) {
  return `${method} @ ${Math.round(confidence * 100)}%${extra ? ` | ${extra}` : ''}`
}

export function matchParsedReferenceToDocument(
  sourceDocument: Document,
  parsedReference: ParsedDocumentReference,
  libraryDocuments: Document[],
): CitationMatchResult | null {
  const normalizedReferenceDoi = normalizeDoi(parsedReference.doi)
  if (normalizedReferenceDoi) {
    const doiMatch = libraryDocuments.find((document) =>
      document.id !== sourceDocument.id && normalizeDoi(document.doi) === normalizedReferenceDoi,
    )

    if (doiMatch) {
      return {
        confidence: 0.99,
        matchMethod: 'doi_exact',
        parsedReference,
        sourceDocument,
        targetDocument: doiMatch,
        debugInfo: candidateDebugInfo('doi_exact', 0.99, 'exact DOI match'),
      }
    }
  }

  const normalizedReferenceTitle = parsedReference.normalizedTitle ?? normalizeTitle(parsedReference.title)
  if (normalizedReferenceTitle) {
    const exactTitleMatch = libraryDocuments.find((document) =>
      document.id !== sourceDocument.id && normalizeTitle(document.title) === normalizedReferenceTitle,
    )

    if (exactTitleMatch) {
      return {
        confidence: 0.94,
        matchMethod: 'title_exact',
        parsedReference,
        sourceDocument,
        targetDocument: exactTitleMatch,
        debugInfo: candidateDebugInfo('title_exact', 0.94, 'exact normalized title match'),
      }
    }
  }

  const referenceTokens = titleTokens(parsedReference.title)
  const referenceAuthor = parsedReference.normalizedFirstAuthor ?? firstAuthorKey(parsedReference.authors)
  let bestMatch: CitationMatchResult | null = null

  for (const document of libraryDocuments) {
    if (document.id === sourceDocument.id) continue

    const similarity = jaccardSimilarity(referenceTokens, titleTokens(document.title))
    if (similarity < 0.52) continue

    const yearMatches = parsedReference.year !== undefined
      && document.year !== undefined
      && parsedReference.year === document.year
    const authorMatches = referenceAuthor.length > 0 && referenceAuthor === firstAuthorKey(document.authors)

    let method: CitationMatchMethod = 'fuzzy_title'
    let confidence = 0.48 + similarity * 0.28

    if (similarity >= 0.86 && yearMatches && authorMatches) {
      method = 'title_firstauthor_year'
      confidence = 0.91
    } else if (similarity >= 0.82 && yearMatches) {
      method = 'title_year'
      confidence = 0.86
    } else if (similarity >= 0.74 && yearMatches && authorMatches) {
      method = 'title_firstauthor_year'
      confidence = 0.83
    } else if (similarity >= 0.72 && yearMatches) {
      method = 'title_year'
      confidence = 0.78
    } else if (similarity >= 0.68 && authorMatches && yearMatches) {
      method = 'title_firstauthor_year'
      confidence = 0.76
    } else {
      confidence += yearMatches ? 0.1 : 0
      confidence += authorMatches ? 0.08 : 0
    }

    if (confidence < 0.62) continue

    const candidate: CitationMatchResult = {
      confidence: Number.parseFloat(Math.min(0.96, confidence).toFixed(2)),
      matchMethod: method,
      parsedReference,
      sourceDocument,
      targetDocument: document,
      debugInfo: candidateDebugInfo(
        method,
        Number.parseFloat(Math.min(0.96, confidence).toFixed(2)),
        `token similarity ${similarity.toFixed(2)}, year ${yearMatches ? 'yes' : 'no'}, author ${authorMatches ? 'yes' : 'no'}`,
      ),
    }

    if (!bestMatch || candidate.confidence > bestMatch.confidence) {
      bestMatch = candidate
    }
  }

  return bestMatch
}

export function dedupeCitationMatches(matches: CitationMatchResult[]) {
  const bestByTarget = new Map<string, CitationMatchResult>()

  for (const match of matches) {
    const current = bestByTarget.get(match.targetDocument.id)
    if (!current || match.confidence > current.confidence) {
      bestByTarget.set(match.targetDocument.id, match)
    }
  }

  return Array.from(bestByTarget.values())
}
