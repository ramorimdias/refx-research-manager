'use client'

import { readFile } from '@tauri-apps/plugin-fs'

export type SniffedPdfMetadata = {
  title?: string
  authors?: string[]
  year?: number
  doi?: string
  citationKey?: string
  bibtex?: string
  source?: 'offline' | 'crossref' | 'semantic_scholar'
}

export type OnlineMetadataMatchStrategy = 'doi' | 'title'

export type OnlineMetadataMatch = SniffedPdfMetadata & {
  matchedBy: OnlineMetadataMatchStrategy
  source: 'crossref' | 'semantic_scholar'
}

export type CrossrefLookupConfig = {
  contactEmail?: string
}

export type SemanticScholarLookupConfig = {
  apiKey?: string
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

type SemanticScholarAuthor = {
  name?: string
}

type SemanticScholarPaper = {
  title?: string
  year?: number
  authors?: SemanticScholarAuthor[]
  externalIds?: {
    DOI?: string
  }
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

function parseSemanticScholarAuthors(paper: SemanticScholarPaper) {
  return (paper.authors ?? [])
    .map((author) => author.name?.trim() ?? '')
    .filter(Boolean)
}

async function fetchJsonWithTimeout(
  url: string,
  options?: {
    headers?: HeadersInit
    timeoutMs?: number
  },
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort('timeout'), options?.timeoutMs ?? 6000)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options?.headers ?? {}),
      },
    })

    if (!response.ok) return null
    return response.json()
  } finally {
    clearTimeout(timeout)
  }
}

function isAbortLikeError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError'
}

function appendCrossrefContactEmail(url: string, config?: CrossrefLookupConfig) {
  if (!config?.contactEmail?.trim()) {
    return url
  }

  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}mailto=${encodeURIComponent(config.contactEmail.trim())}`
}

async function fetchCrossrefByDoi(doi: string, config?: CrossrefLookupConfig): Promise<CrossrefWork | null> {
  const encoded = encodeURIComponent(doi)
  const result = await fetchJsonWithTimeout(appendCrossrefContactEmail(`https://api.crossref.org/works/${encoded}`, config))
  return result?.message ?? null
}

async function fetchCrossrefByQuery(title: string, author?: string, config?: CrossrefLookupConfig): Promise<CrossrefWork | null> {
  const parts = [title, author].filter(Boolean)
  if (!parts.length) return null

  const query = encodeURIComponent(parts.join(' '))
  const url = appendCrossrefContactEmail(`https://api.crossref.org/works?rows=1&query.bibliographic=${query}`, config)
  const result = await fetchJsonWithTimeout(url)
  return result?.message?.items?.[0] ?? null
}

function semanticScholarHeaders(config?: SemanticScholarLookupConfig): HeadersInit | undefined {
  const apiKey = config?.apiKey?.trim()
  if (!apiKey) return undefined
  return {
    'x-api-key': apiKey,
  }
}

async function fetchSemanticScholarByDoi(
  doi: string,
  config?: SemanticScholarLookupConfig,
): Promise<SemanticScholarPaper | null> {
  const fields = encodeURIComponent('title,authors,year,externalIds')
  const encoded = encodeURIComponent(`DOI:${doi}`)
  return fetchJsonWithTimeout(
    `https://api.semanticscholar.org/graph/v1/paper/${encoded}?fields=${fields}`,
    { headers: semanticScholarHeaders(config) },
  ) as Promise<SemanticScholarPaper | null>
}

async function fetchSemanticScholarByQuery(
  title: string,
  config?: SemanticScholarLookupConfig,
): Promise<SemanticScholarPaper | null> {
  const query = encodeURIComponent(title)
  const fields = encodeURIComponent('title,authors,year,externalIds')
  const result = await fetchJsonWithTimeout(
    `https://api.semanticscholar.org/graph/v1/paper/search?query=${query}&limit=1&fields=${fields}`,
    { headers: semanticScholarHeaders(config) },
  ) as { data?: SemanticScholarPaper[] } | null

  return result?.data?.[0] ?? null
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

export async function lookupCrossrefMetadata(
  metadata: SniffedPdfMetadata,
  config?: CrossrefLookupConfig,
): Promise<OnlineMetadataMatch | null> {
  const base = normalizeMetadata(metadata)
  let work: CrossrefWork | null = null
  let matchedBy: OnlineMetadataMatchStrategy | null = null

  if (base.doi) {
    work = await fetchCrossrefByDoi(base.doi, config)
    if (work) matchedBy = 'doi'
  }

  if (!work && base.title) {
    work = await fetchCrossrefByQuery(base.title, base.authors?.[0], config)
    if (work) matchedBy = 'title'
  }

  if (!work || !matchedBy) return null

  const title = work.title?.[0]?.trim() || base.title
  const authors = parseCrossrefAuthors(work)
  const year = parseCrossrefYear(work) ?? base.year
  const doi = work.DOI || base.doi

  return {
    ...normalizeMetadata({
      ...base,
      title,
      authors: authors.length ? authors : base.authors,
      year,
      doi,
      source: 'crossref',
    }),
    matchedBy,
    source: 'crossref',
  }
}

export async function lookupSemanticScholarMetadata(
  metadata: SniffedPdfMetadata,
  config?: SemanticScholarLookupConfig,
): Promise<OnlineMetadataMatch | null> {
  const base = normalizeMetadata(metadata)
  let paper: SemanticScholarPaper | null = null
  let matchedBy: OnlineMetadataMatchStrategy | null = null

  if (base.doi) {
    paper = await fetchSemanticScholarByDoi(base.doi, config)
    if (paper) matchedBy = 'doi'
  }

  if (!paper && base.title) {
    paper = await fetchSemanticScholarByQuery(base.title, config)
    if (paper) matchedBy = 'title'
  }

  if (!paper || !matchedBy) return null

  const authors = parseSemanticScholarAuthors(paper)
  const doi = paper.externalIds?.DOI || base.doi

  return {
    ...normalizeMetadata({
      ...base,
      title: paper.title?.trim() || base.title,
      authors: authors.length ? authors : base.authors,
      year: paper.year ?? base.year,
      doi,
      source: 'semantic_scholar',
    }),
    matchedBy,
    source: 'semantic_scholar',
  }
}

export async function enrichWithCrossrefMetadata(
  metadata: SniffedPdfMetadata,
  config?: CrossrefLookupConfig,
): Promise<SniffedPdfMetadata> {
  const matched = await lookupCrossrefMetadata(metadata, config)
  return matched ?? normalizeMetadata(metadata)
}

export async function sniffPdfMetadataOffline(filePath: string): Promise<SniffedPdfMetadata> {
  try {
    const bytes = await readFile(filePath)
    const sample = bytes.slice(0, 240_000)
    const text = new TextDecoder('latin1', { fatal: false }).decode(sample)

    const rawTitle = text.match(/\/Title\s*\(([\s\S]{1,300}?)\)/)?.[1]
    const rawAuthor = text.match(/\/Author\s*\(([\s\S]{1,300}?)\)/)?.[1]

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
    return await enrichWithCrossrefMetadata(offline)
  } catch (error) {
    if (isAbortLikeError(error)) {
      console.info('Crossref enrichment timed out, using offline metadata only.')
    } else {
      console.warn('Crossref enrichment failed, using offline metadata only:', error)
    }
    return offline
  }
}
