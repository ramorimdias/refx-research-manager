'use client'

import * as repo from '@/lib/repositories/local-db'
import type { ParsedDocumentReference } from '@/lib/types'
import { getDocumentPlainText, readPersistedDocumentText } from '@/lib/services/document-text-service'

export type ExtractedReferenceSection = {
  entries: string[]
  sectionText: string
  source: 'heading' | 'tail_heuristic' | 'full_text'
}

const REFERENCE_SECTION_HEADINGS = [
  'references',
  'bibliography',
  'works cited',
  'literature cited',
  'reference list',
]

function normalizeWhitespace(input: string) {
  return input.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

function looksLikeReferenceEntry(input: string) {
  const text = input.trim()
  if (text.length < 24) return false
  const doiPattern = /10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i
  const yearPattern = /\b(19|20)\d{2}\b/
  const authorPattern = /[A-Z][a-zA-Z'`-]+,\s*(?:[A-Z]\.|[A-Z][a-z]+)/u
  const titleLikePattern = /[A-Z][^.!?]{10,}\./
  let score = 0
  if (doiPattern.test(text)) score += 3
  if (yearPattern.test(text)) score += 2
  if (authorPattern.test(text)) score += 2
  if (titleLikePattern.test(text)) score += 1
  return score >= 3
}

function splitNumberedEntries(sectionText: string) {
  const normalized = `\n${sectionText.trim()}`
  const numberedMatches = Array.from(
    normalized.matchAll(/\n\s*(?:\[\d+\]|\d+\.)\s+/g),
  )

  if (numberedMatches.length < 2) return []

  return numberedMatches
    .map((match, index) => {
      const start = match.index ?? 0
      const end = numberedMatches[index + 1]?.index ?? normalized.length
      return normalized.slice(start, end).replace(/^\s*(?:\[\d+\]|\d+\.)\s+/, '').trim()
    })
    .filter(looksLikeReferenceEntry)
}

function splitParagraphEntries(sectionText: string) {
  const paragraphs = normalizeWhitespace(sectionText)
    .split(/\n{2,}/)
    .map((entry) => entry.replace(/\n/g, ' ').trim())
    .filter(Boolean)

  const directMatches = paragraphs.filter(looksLikeReferenceEntry)
  if (directMatches.length >= 2) return directMatches

  const lineGroups = normalizeWhitespace(sectionText)
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean)

  const merged: string[] = []
  let current = ''

  for (const line of lineGroups) {
    current = current ? `${current} ${line}` : line
    if (looksLikeReferenceEntry(current)) {
      merged.push(current.trim())
      current = ''
    }
  }

  if (current.trim()) {
    merged.push(current.trim())
  }

  return merged.filter(looksLikeReferenceEntry)
}

function detectReferenceSection(text: string): ExtractedReferenceSection | null {
  const normalized = normalizeWhitespace(text)
  const lower = normalized.toLowerCase()

  for (const heading of REFERENCE_SECTION_HEADINGS) {
    const index = lower.lastIndexOf(`\n${heading}\n`)
    const alternativeIndex = index >= 0 ? index : lower.lastIndexOf(`${heading}\n`)
    if (alternativeIndex < 0) continue

    const sectionText = normalized.slice(alternativeIndex + heading.length).trim()
    const entries = splitNumberedEntries(sectionText)
    const fallbackEntries = entries.length > 0 ? entries : splitParagraphEntries(sectionText)
    if (fallbackEntries.length > 0) {
      return {
        entries: fallbackEntries,
        sectionText,
        source: 'heading',
      }
    }
  }

  const tailStart = Math.max(0, Math.floor(normalized.length * 0.65))
  const tailText = normalized.slice(tailStart)
  const tailEntries = splitNumberedEntries(tailText)
  const fallbackTailEntries = tailEntries.length > 0 ? tailEntries : splitParagraphEntries(tailText)
  if (fallbackTailEntries.length > 0) {
    return {
      entries: fallbackTailEntries,
      sectionText: tailText,
      source: 'tail_heuristic',
    }
  }

  return null
}

export async function extractDocumentReferenceSection(document: Pick<repo.DbDocument, 'id' | 'extractedTextPath' | 'searchText'>) {
  const persistedText = await readPersistedDocumentText(document)
  const text = persistedText?.text?.trim() || (await getDocumentPlainText(document))
  if (!text) {
    return null
  }

  return detectReferenceSection(text)
}

export function toReferenceDebugSummary(references: ParsedDocumentReference[]) {
  return references.map((reference) => reference.rawReferenceText).join('\n\n')
}
