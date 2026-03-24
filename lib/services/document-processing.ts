'use client'

import { readFile } from '@tauri-apps/plugin-fs'
import type { Document } from '@/lib/types'

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'among', 'been', 'being', 'between', 'both', 'does', 'during',
  'each', 'from', 'have', 'into', 'more', 'most', 'other', 'over', 'such', 'than', 'that', 'their',
  'there', 'these', 'this', 'those', 'through', 'under', 'using', 'with', 'your', 'where', 'when',
  'what', 'which', 'while', 'were', 'will', 'would', 'could', 'should', 'paper', 'study', 'research',
  'analysis', 'results', 'based', 'data', 'method', 'methods', 'system',
])

function normalizeText(input: string) {
  return input
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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

export async function extractPdfSearchText(filePath: string) {
  const bytes = await readFile(filePath)
  const raw = new TextDecoder('latin1', { fatal: false }).decode(bytes)

  const literalChunks =
    raw.match(/\((?:\\.|[^\\)]){3,240}\)/g)?.map((chunk) => normalizeText(chunk.slice(1, -1))) ?? []

  const printableChunks =
    raw.match(/[A-Za-z][A-Za-z0-9 ,.;:'"!?/()_-]{20,240}/g)?.map((chunk) => normalizeText(chunk)) ?? []

  return unique([...literalChunks, ...printableChunks])
    .filter((chunk) => /[A-Za-z]{3,}/.test(chunk))
    .join(' ')
    .slice(0, 120_000)
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

  const tokens = unique(tokenize(trimmedQuery))
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
