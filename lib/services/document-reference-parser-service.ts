'use client'

import type { ParsedDocumentReference } from '@/lib/types'
import { splitIntoSentenceLikeSegments } from '@/lib/utils/sentence-segmentation'

const DOI_PATTERN = /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/i
const YEAR_PATTERN = /\b(19|20)\d{2}\b/

export function normalizeWhitespace(input?: string | null) {
  return (input ?? '').replace(/\s+/g, ' ').trim()
}

function stripTrailingPunctuation(input: string) {
  return input.replace(/^[\s,.;:()]+|[\s,.;:()]+$/g, '').trim()
}

export function normalizeReferenceText(input?: string | null) {
  return normalizeWhitespace(input)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeTitle(input?: string | null) {
  return normalizeReferenceText(input)
    .replace(/\b(a|an|the)\b/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitAuthorTokens(input: string) {
  return input
    .split(/\s*(?:;|&| and )\s*/i)
    .map((author) => stripTrailingPunctuation(author))
    .filter(Boolean)
}

function normalizeFirstAuthor(input: string) {
  const normalized = normalizeTitle(input)
  return normalized.split(' ').filter(Boolean)[0] ?? ''
}

function parseAuthors(authorSegment: string) {
  const normalized = normalizeWhitespace(authorSegment)
  if (!normalized) return []

  const directAuthors = splitAuthorTokens(normalized)
  if (directAuthors.length > 1) return directAuthors

  const commaSeparated = normalized
    .split(/\s*,\s*/)
    .map((part) => stripTrailingPunctuation(part))
    .filter(Boolean)

  if (commaSeparated.length >= 4) {
    const authors: string[] = []
    for (let index = 0; index < commaSeparated.length - 1; index += 2) {
      authors.push(stripTrailingPunctuation(`${commaSeparated[index]}, ${commaSeparated[index + 1]}`))
    }
    return authors.filter(Boolean)
  }

  return directAuthors
}

function cleanReferenceLead(input: string) {
  return normalizeWhitespace(
    input
      .replace(/^\s*(?:\[\d+\]|\d+\.)\s*/, '')
      .replace(/\s+/g, ' '),
  )
}

function parseTitle(remainder: string) {
  const cleaned = cleanReferenceLead(remainder)
  if (!cleaned) return undefined

  const sentenceMatches = cleaned.match(/"([^"]{8,})"|“([^”]{8,})”/)
  const quotedTitle = sentenceMatches?.[1] ?? sentenceMatches?.[2]
  if (quotedTitle) return stripTrailingPunctuation(quotedTitle)

  const titleCandidates = splitIntoSentenceLikeSegments(cleaned)
    .map((candidate) => stripTrailingPunctuation(candidate))
    .filter((candidate) => candidate.length >= 8)

  return titleCandidates.find((candidate) => /\s/.test(candidate)) || undefined
}

function parseJournal(remainder: string, title?: string) {
  const cleaned = cleanReferenceLead(remainder)
  if (!cleaned) return undefined

  const afterTitle = title
    ? cleaned.slice(Math.max(0, cleaned.toLowerCase().indexOf(title.toLowerCase())) + title.length).trim()
    : cleaned

  return splitIntoSentenceLikeSegments(afterTitle)
    .map((segment) => stripTrailingPunctuation(segment))
    .filter((segment) => segment.length >= 4)
    .find((segment) => /[A-Za-z]/.test(segment))
}

export function parseDocumentReference(
  rawReferenceText: string,
  sourceDocumentId: string,
  referenceIndex: number,
): ParsedDocumentReference {
  const cleaned = cleanReferenceLead(rawReferenceText)
  const doi = cleaned.match(DOI_PATTERN)?.[0]?.toLowerCase()
  const yearMatch = cleaned.match(YEAR_PATTERN)
  const year = yearMatch ? Number.parseInt(yearMatch[0], 10) : undefined
  const yearIndex = yearMatch?.index ?? -1

  const authorSegment = yearIndex > 0
    ? cleaned.slice(0, yearIndex)
    : cleaned.split(/[.?!]/)[0] ?? ''
  const authors = parseAuthors(authorSegment)
  const remainder = yearIndex >= 0
    ? cleaned.slice(yearIndex + (yearMatch?.[0].length ?? 0))
    : cleaned
  const title = parseTitle(remainder)
  const journal = parseJournal(remainder, title)

  const parseWarnings: string[] = []
  if (!title) parseWarnings.push('title_missing')
  if (authors.length === 0) parseWarnings.push('authors_missing')
  if (!year) parseWarnings.push('year_missing')

  let parseConfidence = 0.2
  if (doi) parseConfidence += 0.32
  if (title) parseConfidence += 0.24
  if (authors.length > 0) parseConfidence += 0.14
  if (year) parseConfidence += 0.14
  if (journal) parseConfidence += 0.08
  parseConfidence -= parseWarnings.length * 0.03

  return {
    rawReferenceText: cleaned,
    normalizedReferenceText: normalizeReferenceText(cleaned),
    doi,
    normalizedTitle: normalizeTitle(title),
    title,
    authors,
    normalizedFirstAuthor: normalizeFirstAuthor(authors[0] ?? ''),
    year,
    journal,
    parseConfidence: Math.max(0.1, Math.min(0.98, Number.parseFloat(parseConfidence.toFixed(2)))),
    parseWarnings,
    sourceDocumentId,
    referenceIndex,
  }
}

export function parseDocumentReferences(entries: string[], sourceDocumentId: string) {
  return entries
    .map((entry, index) => parseDocumentReference(entry, sourceDocumentId, index))
    .filter((reference) => reference.rawReferenceText.length > 0)
}
