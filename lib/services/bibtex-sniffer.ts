'use client'

import { readFile } from '@tauri-apps/plugin-fs'

export type SniffedPdfMetadata = {
  title?: string
  authors?: string[]
  year?: number
  doi?: string
  citationKey?: string
  bibtex?: string
  source?: 'offline' | 'crossref'
}

type CrossrefAuthor = {
  given?: string
  family?: string
  name?: string
}

type CrossrefWork = {
  title?: string[]
  DOI?: string
  author?: CrossrefAuthor[]
  issued?: { 'date-parts'?: number[][] }
  published?: { 'date-parts'?: number[][] }
}

function cleanPdfField(value: string) {
  return value
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitAuthors(raw?: string) {
  if (!raw) return []
  return raw
    .split(/,|;|\band\b/gi)
    .map((part) => part.trim())
    .filter(Boolean)
}

function parseDoi(input: string) {
  return input.match(/10\.\d{4,9}\/[\-._;()/:A-Z0-9]+/i)?.[0]
}

function parseYear(input: string) {
  const value = input.match(/\b(19|20)\d{2}\b/)?.[0]
  if (!value) return undefined
  const year = Number(value)
  return Number.isFinite(year) ? year : undefined
}

function parseTitleFromName(filePath: string) {
  const fileName = filePath.split(/[\\/]/).pop() ?? ''
  return fileName
    .replace(/\.pdf$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function citationKeyFor(title: string, authors: string[], year?: number) {
  const firstAuthorToken = authors[0]?.split(/\s+/).pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'unknown'
  const titleToken = title.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'paper'
  return `${firstAuthorToken}${year ?? 'nd'}${titleToken}`
}

function bibtexFor(meta: Required<Pick<SniffedPdfMetadata, 'title'>> & SniffedPdfMetadata) {
  const key = meta.citationKey || citationKeyFor(meta.title, meta.authors ?? [], meta.year)
  const fields = [
    `  title={${meta.title}}`,
    meta.authors?.length ? `  author={${meta.authors.join(' and ')}}` : null,
    meta.year ? `  year={${meta.year}}` : null,
    meta.doi ? `  doi={${meta.doi}}` : null,
  ].filter(Boolean)

  return `@article{${key},\n${fields.join(',\n')}\n}`
}

function parseCrossrefYear(work: CrossrefWork) {
  return work.issued?.['date-parts']?.[0]?.[0] ?? work.published?.['date-parts']?.[0]?.[0]
}

function parseCrossrefAuthors(work: CrossrefWork) {
  return (work.author ?? [])
    .map((author) => {
      const named = [author.given, author.family].filter(Boolean).join(' ').trim()
      return named || author.name || ''
    })
    .filter(Boolean)
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 6000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    })

    if (!response.ok) return null
    return response.json()
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchCrossrefByDoi(doi: string): Promise<CrossrefWork | null> {
  const encoded = encodeURIComponent(doi)
  const result = await fetchJsonWithTimeout(`https://api.crossref.org/works/${encoded}`)
  return result?.message ?? null
}

async function fetchCrossrefByQuery(title: string, author?: string): Promise<CrossrefWork | null> {
  const parts = [title, author].filter(Boolean)
  if (!parts.length) return null

  const query = encodeURIComponent(parts.join(' '))
  const result = await fetchJsonWithTimeout(`https://api.crossref.org/works?rows=1&query.bibliographic=${query}`)
  return result?.message?.items?.[0] ?? null
}

function normalizeMetadata(metadata: SniffedPdfMetadata): SniffedPdfMetadata {
  if (!metadata.title) return metadata
  const authors = metadata.authors ?? []
  const citationKey = metadata.citationKey || citationKeyFor(metadata.title, authors, metadata.year)

  return {
    ...metadata,
    authors,
    citationKey,
    bibtex: metadata.bibtex || bibtexFor({ ...metadata, citationKey, authors, title: metadata.title }),
  }
}

async function enrichWithCrossref(metadata: SniffedPdfMetadata): Promise<SniffedPdfMetadata> {
  const base = normalizeMetadata(metadata)
  let work: CrossrefWork | null = null

  if (base.doi) {
    work = await fetchCrossrefByDoi(base.doi)
  }

  if (!work && base.title) {
    work = await fetchCrossrefByQuery(base.title, base.authors?.[0])
  }

  if (!work) return base

  const title = work.title?.[0]?.trim() || base.title
  const authors = parseCrossrefAuthors(work)
  const year = parseCrossrefYear(work) ?? base.year
  const doi = work.DOI || base.doi

  return normalizeMetadata({
    ...base,
    title,
    authors: authors.length ? authors : base.authors,
    year,
    doi,
    source: 'crossref',
  })
}

async function sniffPdfMetadataOffline(filePath: string): Promise<SniffedPdfMetadata> {
  try {
    const bytes = await readFile(filePath)
    const sample = bytes.slice(0, 240_000)
    const text = new TextDecoder('latin1', { fatal: false }).decode(sample)

    const rawTitle = text.match(/\/Title\s*\(([^)]{1,300})\)/s)?.[1]
    const rawAuthor = text.match(/\/Author\s*\(([^)]{1,300})\)/s)?.[1]

    const titleFromPdf = rawTitle ? cleanPdfField(rawTitle) : undefined
    const authorsFromPdf = splitAuthors(rawAuthor ? cleanPdfField(rawAuthor) : undefined)

    const fileNameTitle = parseTitleFromName(filePath)
    const title = titleFromPdf && titleFromPdf.length > 2 ? titleFromPdf : fileNameTitle

    const doi = parseDoi(text) ?? parseDoi(filePath)
    const year = parseYear(text) ?? parseYear(filePath)

    return normalizeMetadata({
      title,
      authors: authorsFromPdf,
      year,
      doi,
      source: 'offline',
    })
  } catch (error) {
    console.warn('Metadata sniff failed, using file name fallback:', error)
    const title = parseTitleFromName(filePath)
    return normalizeMetadata({
      title,
      authors: [],
      source: 'offline',
    })
  }
}

export async function sniffPdfMetadata(filePath: string): Promise<SniffedPdfMetadata> {
  const offline = await sniffPdfMetadataOffline(filePath)

  try {
    return await enrichWithCrossref(offline)
  } catch (error) {
    console.warn('Crossref enrichment failed, using offline metadata only:', error)
    return offline
  }
}
