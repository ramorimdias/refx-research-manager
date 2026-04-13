'use client'

import type { Document, CitationStyle } from '@/lib/types'
import type { DbCreateReferenceInput, DbReference } from '@/lib/repositories/local-db'
import { normalizeTitle } from '@/lib/services/document-reference-parser-service'

export type ReferenceDocumentMatch = {
  matchedDocumentId?: string
  matchMethod?: string
  matchConfidence?: number
}

export function normalizeWhitespace(input?: string | null) {
  return (input ?? '').replace(/\s+/g, ' ').trim()
}

export function normalizeDoi(input?: string | null) {
  return normalizeWhitespace(input)
    .toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[),.;:]+$/g, '')
}

export function parseAuthorsInput(input?: string | null) {
  return normalizeWhitespace(input)
    .split(/\s*(?:;|,| and )\s*/i)
    .map((author) => normalizeWhitespace(author))
    .filter(Boolean)
}

export function serializeAuthors(authors: string[]) {
  return authors.map((author) => normalizeWhitespace(author)).filter(Boolean).join('; ')
}

function firstAuthorKeyFromList(authors: string[]) {
  return normalizeTitle(authors[0] ?? '').split(' ').filter(Boolean)[0] ?? ''
}

function titleTokens(input?: string | null) {
  return normalizeTitle(input)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
}

function jaccardSimilarity(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) return 0

  const leftSet = new Set(left)
  const rightSet = new Set(right)
  const union = new Set([...leftSet, ...rightSet]).size
  let intersection = 0
  for (const token of leftSet) {
    if (rightSet.has(token)) intersection += 1
  }
  return union > 0 ? intersection / union : 0
}

export function seedReferenceFromDocument(document: Document): DbCreateReferenceInput {
  return {
    documentId: document.id,
    type: document.documentType === 'physical_book' ? 'book' : 'article',
    isManual: false,
    title: document.title,
    authors: serializeAuthors(document.authors),
    year: document.year,
    doi: document.doi,
    publisher: document.publisher,
    url: document.url,
    abstract: document.abstract,
  }
}

export function mergeReferenceDraft(
  base: DbCreateReferenceInput,
  extra: Partial<DbCreateReferenceInput>,
): DbCreateReferenceInput {
  return {
    ...base,
    ...extra,
    title: normalizeWhitespace(extra.title ?? base.title),
    type: extra.type ?? base.type ?? 'misc',
    isManual: extra.isManual ?? base.isManual ?? false,
  }
}

export function findMatchingDocuments(
  documents: Document[],
  input: {
    title: string
    authors?: string
    year?: number
    doi?: string
  },
  limit = 5,
) {
  const normalizedDoi = normalizeDoi(input.doi)
  const normalizedTitle = normalizeTitle(input.title)
  const authorKey = firstAuthorKeyFromList(parseAuthorsInput(input.authors))
  const inputTokens = titleTokens(input.title)
  const hasTypedTitle = normalizedTitle.length >= 2

  return documents
    .map((document) => {
      const documentDoi = normalizeDoi(document.doi)
      const documentTitle = normalizeTitle(document.title)
      const documentAuthorKey = firstAuthorKeyFromList(document.authors)
      const similarity = jaccardSimilarity(inputTokens, titleTokens(document.title))
      const doiExact = Boolean(normalizedDoi && documentDoi === normalizedDoi)
      const titleExact = Boolean(normalizedTitle && documentTitle === normalizedTitle)
      const titleContains = Boolean(
        hasTypedTitle
        && (
          documentTitle.includes(normalizedTitle)
          || normalizedTitle.includes(documentTitle)
        ),
      )
      const titlePrefix = Boolean(hasTypedTitle && documentTitle.startsWith(normalizedTitle))
      const yearMatch = input.year != null && document.year != null && input.year === document.year
      const authorMatch = Boolean(authorKey && authorKey === documentAuthorKey)

      let score = 0
      if (doiExact) score = 1
      else if (titleExact && authorMatch && yearMatch) score = 0.93
      else if (titleExact && yearMatch) score = 0.88
      else if (titleExact) score = 0.84
      else if (titlePrefix && authorMatch) score = 0.82
      else if (titlePrefix) score = 0.78
      else if (titleContains && authorMatch) score = 0.76
      else if (titleContains) score = 0.7
      else if (similarity >= 0.72) score = 0.55 + similarity * 0.35 + (authorMatch ? 0.06 : 0) + (yearMatch ? 0.04 : 0)

      return { document, score }
    })
    .filter((entry) => entry.score >= 0.62)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
}

export function matchReferenceToDocument(
  documents: Document[],
  input: {
    title: string
    authors?: string
    year?: number
    doi?: string
  },
): ReferenceDocumentMatch {
  const [best] = findMatchingDocuments(documents, input, 1)
  if (!best) return {}

  const normalizedDoi = normalizeDoi(input.doi)
  const documentDoi = normalizeDoi(best.document.doi)
  const titleExact = normalizeTitle(input.title) === normalizeTitle(best.document.title)
  const authorKey = firstAuthorKeyFromList(parseAuthorsInput(input.authors))
  const documentAuthorKey = firstAuthorKeyFromList(best.document.authors)
  const yearMatch = input.year != null && best.document.year != null && input.year === best.document.year

  const matchMethod = normalizedDoi && documentDoi === normalizedDoi
    ? 'doi_exact'
    : titleExact && authorKey && authorKey === documentAuthorKey && yearMatch
      ? 'title_firstauthor_year'
      : titleExact
        ? 'title_exact'
        : 'fuzzy_title'

  return {
    matchedDocumentId: best.document.id,
    matchMethod,
    matchConfidence: Number(best.score.toFixed(2)),
  }
}

export function findReusableReference(
  references: DbReference[],
  input: {
    title: string
    authors?: string
    year?: number
    doi?: string
  },
) {
  const normalizedDoi = normalizeDoi(input.doi)
  if (normalizedDoi) {
    const doiMatch = references.find((reference) => normalizeDoi(reference.doi) === normalizedDoi)
    if (doiMatch) return doiMatch
  }

  const normalizedTitle = normalizeTitle(input.title)
  const inputAuthorKey = firstAuthorKeyFromList(parseAuthorsInput(input.authors))
  return references.find((reference) => {
    if (normalizeTitle(reference.title) !== normalizedTitle) return false
    const referenceAuthorKey = firstAuthorKeyFromList(parseAuthorsInput(reference.authors))
    const yearMatch = input.year == null || reference.year == null || reference.year === input.year
    return referenceAuthorKey === inputAuthorKey && yearMatch
  })
}

function formatAuthors(authors: string[], style: CitationStyle) {
  if (authors.length === 0) return ''
  if (style === 'apa') {
    if (authors.length === 1) return authors[0]
    if (authors.length === 2) return `${authors[0]} & ${authors[1]}`
    return `${authors.slice(0, -1).join(', ')}, & ${authors[authors.length - 1]}`
  }
  if (style === 'mla') {
    if (authors.length === 1) return authors[0]
    return `${authors[0]}, et al.`
  }
  if (authors.length === 1) return authors[0]
  if (authors.length === 2) return `${authors[0]} and ${authors[1]}`
  return `${authors[0]} et al.`
}

export function formatReference(
  reference: Pick<
    DbReference,
    'title' | 'authors' | 'year' | 'publisher' | 'journal' | 'booktitle' | 'doi' | 'url' | 'volume' | 'issue' | 'chapter' | 'pages' | 'isManual'
  >,
  style: CitationStyle,
) {
  if (reference.isManual) {
    return normalizeWhitespace(reference.title)
  }

  const authors = parseAuthorsInput(reference.authors)
  const authorText = formatAuthors(authors, style)
  const yearText = reference.year ? `${reference.year}` : 'n.d.'
  const container = normalizeWhitespace(reference.journal ?? reference.booktitle ?? reference.publisher)
  const volumeText = normalizeWhitespace(reference.volume)
  const issueText = normalizeWhitespace(reference.issue)
  const volumeIssueText = volumeText && issueText
    ? `${volumeText}(${issueText})`
    : volumeText || issueText
  const chapterText = normalizeWhitespace(reference.chapter)
  const pagesText = normalizeWhitespace(reference.pages)
  const doiText = normalizeDoi(reference.doi)
  const urlText = normalizeWhitespace(reference.url)
  const locatorText = [volumeIssueText, chapterText ? `chap. ${chapterText}` : '', pagesText ? `pp. ${pagesText}` : '']
    .filter(Boolean)
    .join(', ')

  if (style === 'mla') {
    return [
      authorText ? `${authorText}.` : '',
      reference.title ? `"${reference.title}."` : '',
      container ? `${container},` : '',
      locatorText ? `${locatorText},` : '',
      reference.year ? `${reference.year}.` : '',
      doiText ? `doi:${doiText}.` : '',
      !doiText && urlText ? `${urlText}.` : '',
    ].filter(Boolean).join(' ').trim()
  }

  if (style === 'chicago') {
    return [
      authorText ? `${authorText}.` : '',
      reference.year ? `${reference.year}.` : '',
      reference.title ? `"${reference.title}."` : '',
      container ? `${container}.` : '',
      locatorText ? `${locatorText}.` : '',
      doiText ? `https://doi.org/${doiText}.` : '',
      !doiText && urlText ? `${urlText}.` : '',
    ].filter(Boolean).join(' ').trim()
  }

  return [
    authorText ? `${authorText}.` : '',
    `(${yearText}).`,
    reference.title ? `${reference.title}.` : '',
    container ? `${container}.` : '',
    locatorText ? `${locatorText}.` : '',
    doiText ? `https://doi.org/${doiText}` : '',
    !doiText && urlText ? urlText : '',
  ].filter(Boolean).join(' ').trim()
}
