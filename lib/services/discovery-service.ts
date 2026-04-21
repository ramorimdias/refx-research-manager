'use client'

import { getResolvedSemanticScholarApiKey, loadAppSettings } from '@/lib/app-settings'
import {
  lookupCrossrefMetadata,
  lookupOpenAlexMetadata,
  lookupSemanticScholarMetadata,
  type SniffedPdfMetadata,
} from '@/lib/services/bibtex-sniffer'
import { enqueue } from '@/lib/services/discovery-request-queue'
import { normalizeTitle } from '@/lib/services/document-reference-parser-service'
import type {
  DiscoverMode,
  DiscoverWork,
  Document,
  DocumentRelation,
} from '@/lib/types'

type OpenAlexWorkWithGraph = {
  id?: string
  title?: string
  doi?: string
  publication_year?: number
  authorships?: Array<{ author?: { display_name?: string } }>
  cited_by_count?: number
  referenced_works?: string[]
  cited_by_api_url?: string
  abstract_inverted_index?: Record<string, number[]>
  primary_location?: { source?: { display_name?: string } }
}

type OpenAlexWorksResponse = {
  results?: OpenAlexWorkWithGraph[]
}

type SemanticScholarListPaper = {
  paperId?: string
  title?: string
  year?: number
  abstract?: string
  citationCount?: number
  authors?: Array<{ name?: string }>
  externalIds?: { DOI?: string }
  venue?: string
  journal?: { name?: string }
}

type SemanticScholarReferenceEntry = {
  citedPaper?: SemanticScholarListPaper
  citingPaper?: SemanticScholarListPaper
}

const stepCache = new Map<string, DiscoverWork[]>()

export function clearDiscoverStepCache() {
  stepCache.clear()
}

function reconstructOpenAlexAbstract(index?: Record<string, number[]>) {
  if (!index) return null
  const positionedWords: string[] = []
  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions) {
      positionedWords[position] = word
    }
  }
  const text = positionedWords.filter(Boolean).join(' ').trim()
  return text || null
}

function normalizeDoi(input?: string | null) {
  return (input ?? '')
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .toLowerCase() || null
}

function firstAuthorLabel(authors: string[]) {
  const first = authors[0]?.trim() ?? ''
  if (!first) return 'Unknown author'
  const tokens = first.split(/\s+/).filter(Boolean)
  const family = tokens[tokens.length - 1] ?? first
  return authors.length > 1 ? `${family} et al.` : family
}

function documentToDiscoverWork(document: Document): DiscoverWork {
  return {
    id: document.id,
    doi: document.doi ?? null,
    title: document.title,
    authors: document.authors,
    firstAuthorLabel: firstAuthorLabel(document.authors),
    year: document.year ?? null,
    abstract: document.abstract ?? null,
    journal: document.venue ?? document.publisher ?? null,
    url: document.url ?? (document.doi ? `https://doi.org/${document.doi}` : null),
    citedByCount: null,
    referencedWorksCount: null,
    inLibrary: true,
    libraryDocumentId: document.id,
    fromLocalLibrary: true,
    isStarred: document.favorite,
  }
}

function makeSeed(document: Pick<Document, 'title' | 'authors' | 'year' | 'doi' | 'citationKey' | 'abstract'>): SniffedPdfMetadata {
  return {
    title: document.title,
    authors: document.authors,
    year: document.year,
    doi: document.doi,
    citationKey: document.citationKey,
    abstract: document.abstract,
    source: 'offline',
  }
}

function normalizeOpenAlexId(input?: string | null) {
  if (!input) return null
  const match = input.match(/W\d+/i)?.[0]
  return match ? match.toUpperCase() : null
}

function titleAuthorYearKey(title?: string | null, authors?: string[], year?: number | null) {
  return `${normalizeTitle(title)}::${normalizeTitle(authors?.[0] ?? '')}::${year ?? ''}`
}

function discoverKey(work: Pick<DiscoverWork, 'doi' | 'openAlexId' | 'title' | 'authors' | 'year'>) {
  return normalizeDoi(work.doi)
    ? `doi:${normalizeDoi(work.doi)}`
    : work.openAlexId
      ? `openalex:${work.openAlexId}`
      : `tay:${titleAuthorYearKey(work.title, work.authors, work.year)}`
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

async function fetchJson<T>(url: string, signal?: AbortSignal, headers?: HeadersInit): Promise<T | null> {
  return enqueue(
    url,
    async () => {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          ...(headers ?? {}),
        },
        signal,
      })

      if (!response.ok) {
        throw new Error(`Request failed (${response.status}) for ${url}`)
      }

      return response.json() as Promise<T>
    },
    signal,
  )
}

async function fetchOpenAlexPrimaryWork(
  sourceWork: Pick<DiscoverWork, 'doi' | 'openAlexId' | 'title' | 'authors'>,
  signal?: AbortSignal,
) {
  if (sourceWork.openAlexId) {
    const id = normalizeOpenAlexId(sourceWork.openAlexId)
    if (!id) return null
    return fetchJson<OpenAlexWorkWithGraph>(
      `https://api.openalex.org/works/${id}?select=id,title,doi,publication_year,authorships,cited_by_count,referenced_works,cited_by_api_url,abstract_inverted_index,primary_location`,
      signal,
    )
  }

  const doi = normalizeDoi(sourceWork.doi)
  if (doi) {
    const filter = encodeURIComponent(`doi:https://doi.org/${doi}`)
    const response = await fetchJson<OpenAlexWorksResponse>(
      `https://api.openalex.org/works?filter=${filter}&per-page=1&select=id,title,doi,publication_year,authorships,cited_by_count,referenced_works,cited_by_api_url,abstract_inverted_index,primary_location`,
      signal,
    )
    if (response?.results?.[0]) return response.results[0]
  }

  const title = sourceWork.title?.trim()
  if (!title) return null

  const authorNeedle = sourceWork.authors?.[0]?.trim().toLowerCase() ?? ''
  const graphSelect = 'id,title,doi,publication_year,authorships,cited_by_count,referenced_works,cited_by_api_url,abstract_inverted_index,primary_location'
  const matchesAuthor = (work: OpenAlexWorkWithGraph) => (
    !authorNeedle
      || (work.authorships ?? []).some((entry) => entry.author?.display_name?.toLowerCase().includes(authorNeedle))
  )

  const titleFilter = encodeURIComponent(`title.search:${title}`)
  const titleResponse = await fetchJson<OpenAlexWorksResponse>(
    `https://api.openalex.org/works?filter=${titleFilter}&per-page=8&select=${graphSelect}`,
    signal,
  )
  const titleMatches = (titleResponse?.results ?? []).filter(matchesAuthor)
  if (titleMatches[0]) return titleMatches[0]
  if ((titleResponse?.results ?? [])[0]) return titleResponse?.results?.[0] ?? null

  const searchQuery = encodeURIComponent([title, sourceWork.authors?.[0]?.trim()].filter(Boolean).join(' '))
  const searchResponse = await fetchJson<OpenAlexWorksResponse>(
    `https://api.openalex.org/works?search=${searchQuery}&per-page=8&select=${graphSelect}`,
    signal,
  )
  const searchMatches = (searchResponse?.results ?? []).filter(matchesAuthor)
  return searchMatches[0] ?? searchResponse?.results?.[0] ?? null
}

async function fetchOpenAlexWorksByIds(ids: string[], signal?: AbortSignal) {
  const normalizedIds = ids.map(normalizeOpenAlexId).filter(Boolean) as string[]
  const batches: OpenAlexWorkWithGraph[] = []

  for (let index = 0; index < normalizedIds.length; index += 25) {
    const batch = normalizedIds.slice(index, index + 25)
    const filter = encodeURIComponent(batch.map((id) => `https://openalex.org/${id}`).join('|'))
    const response = await fetchJson<OpenAlexWorksResponse>(
      `https://api.openalex.org/works?filter=openalex_id:${filter}&per-page=${batch.length}&select=id,title,doi,publication_year,authorships,cited_by_count,referenced_works,cited_by_api_url,abstract_inverted_index,primary_location`,
      signal,
    )
    batches.push(...(response?.results ?? []))
  }

  return batches
}

function openAlexToDiscoverWork(work: OpenAlexWorkWithGraph): DiscoverWork {
  const authors = (work.authorships ?? [])
    .map((entry) => entry.author?.display_name?.trim() ?? '')
    .filter(Boolean)
  const openAlexId = normalizeOpenAlexId(work.id)

  return {
    id: openAlexId ?? normalizeDoi(work.doi) ?? crypto.randomUUID(),
    doi: normalizeDoi(work.doi),
    openAlexId,
    title: work.title?.trim() || 'Untitled work',
    authors,
    firstAuthorLabel: firstAuthorLabel(authors),
    year: work.publication_year ?? null,
    abstract: reconstructOpenAlexAbstract(work.abstract_inverted_index),
    journal: work.primary_location?.source?.display_name ?? null,
    url: normalizeDoi(work.doi) ? `https://doi.org/${normalizeDoi(work.doi)}` : work.id ?? null,
    citedByCount: work.cited_by_count ?? null,
    referencedWorksCount: work.referenced_works?.length ?? null,
    inLibrary: false,
    libraryDocumentId: null,
    relationKind: undefined,
    fromLocalLibrary: false,
    isStarred: false,
  }
}

function semanticScholarPaperToDiscoverWork(paper: SemanticScholarListPaper, relationKind: 'reference' | 'citation'): DiscoverWork {
  const authors = (paper.authors ?? []).map((entry) => entry.name?.trim() ?? '').filter(Boolean)
  const doi = normalizeDoi(paper.externalIds?.DOI)
  return {
    id: paper.paperId ?? doi ?? crypto.randomUUID(),
    doi,
    semanticScholarId: paper.paperId ?? null,
    title: paper.title?.trim() || 'Untitled work',
    authors,
    firstAuthorLabel: firstAuthorLabel(authors),
    year: paper.year ?? null,
    abstract: paper.abstract?.trim() ?? null,
    journal: paper.journal?.name ?? paper.venue ?? null,
    url: doi ? `https://doi.org/${doi}` : null,
    citedByCount: paper.citationCount ?? null,
    referencedWorksCount: null,
    inLibrary: false,
    libraryDocumentId: null,
    relationKind,
    fromLocalLibrary: false,
    isStarred: false,
  }
}

function matchInLibrary(work: DiscoverWork, allDocuments: Document[]) {
  const normalizedWorkDoi = normalizeDoi(work.doi)
  if (normalizedWorkDoi) {
    const doiMatch = allDocuments.find((document) => normalizeDoi(document.doi) === normalizedWorkDoi)
    if (doiMatch) return doiMatch
  }

  return allDocuments.find((document) =>
    titleAuthorYearKey(document.title, document.authors, document.year) === titleAuthorYearKey(work.title, work.authors, work.year),
  ) ?? null
}

function annotateLibraryMatches(items: DiscoverWork[], allDocuments: Document[]) {
  return items.map((item) => {
    const match = matchInLibrary(item, allDocuments)
    if (!match) return item
    return {
      ...item,
      inLibrary: true,
      libraryDocumentId: match.id,
      fromLocalLibrary: false,
      isStarred: item.isStarred ?? match.favorite,
    }
  })
}

export async function mergeLocalRelations(
  sourceDocumentId: string,
  externalItems: DiscoverWork[],
  allDocuments: Document[],
  allRelations: DocumentRelation[],
): Promise<DiscoverWork[]> {
  const externalByKey = new Map(externalItems.map((item) => [discoverKey(item), item]))
  const localItems: DiscoverWork[] = []

  for (const relation of allRelations) {
    if (relation.sourceDocumentId !== sourceDocumentId) continue
    const target = allDocuments.find((document) => document.id === relation.targetDocumentId)
    if (!target) continue

    localItems.push({
      ...documentToDiscoverWork(target),
      relationKind: relation.linkOrigin === 'auto' ? 'auto_link' : 'manual_link',
    })
  }

  for (const item of localItems) {
    const key = discoverKey(item)
    if (!externalByKey.has(key)) {
      externalByKey.set(key, item)
      continue
    }

    const existing = externalByKey.get(key)
    if (!existing) continue
    externalByKey.set(key, {
      ...existing,
      inLibrary: true,
      libraryDocumentId: item.libraryDocumentId,
      relationKind: item.relationKind,
      fromLocalLibrary: true,
    })
  }

  return Array.from(externalByKey.values())
}

async function fetchSemanticScholarStep(sourceWork: DiscoverWork, mode: DiscoverMode, apiKey?: string, signal?: AbortSignal) {
  const id = sourceWork.semanticScholarId
    ?? (normalizeDoi(sourceWork.doi) ? `DOI:${normalizeDoi(sourceWork.doi)}` : encodeURIComponent(sourceWork.title))
  const path = mode === 'references' ? 'references' : 'citations'
  const response = await fetchJson<{ data?: SemanticScholarReferenceEntry[] }>(
    `https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(id)}/${path}?fields=title,year,authors,externalIds,citationCount,abstract,journal,venue,paperId`,
    signal,
    apiKey ? { 'x-api-key': apiKey } : undefined,
  )

  return (response?.data ?? [])
    .map((entry) => mode === 'references' ? entry.citedPaper : entry.citingPaper)
    .filter((paper): paper is SemanticScholarListPaper => Boolean(paper))
    .map((paper) => semanticScholarPaperToDiscoverWork(paper, mode === 'references' ? 'reference' : 'citation'))
}

async function fetchOpenAlexStep(sourceWork: DiscoverWork, mode: DiscoverMode, signal?: AbortSignal) {
  const source = await fetchOpenAlexPrimaryWork(sourceWork, signal)
  if (!source) return []

  if (mode === 'references') {
    const referenced = source.referenced_works ?? []
    if (referenced.length === 0) return []
    const works = await fetchOpenAlexWorksByIds(referenced.slice(0, 75), signal)
    return works.map((work) => ({ ...openAlexToDiscoverWork(work), relationKind: 'reference' as const }))
  }

  const citationsUrl = source.cited_by_api_url
    ?? `https://api.openalex.org/works?filter=cites:${encodeURIComponent(source.id ?? '')}&per-page=50&select=id,title,doi,publication_year,authorships,cited_by_count,referenced_works,cited_by_api_url,abstract_inverted_index,primary_location`
  const response = await fetchJson<OpenAlexWorksResponse>(
    citationsUrl.includes('select=')
      ? citationsUrl
      : `${citationsUrl}&select=id,title,doi,publication_year,authorships,cited_by_count,referenced_works,cited_by_api_url,abstract_inverted_index,primary_location`,
    signal,
  )
  return (response?.results ?? []).map((work) => ({ ...openAlexToDiscoverWork(work), relationKind: 'citation' as const }))
}

function dedupeWorks(items: DiscoverWork[]) {
  const map = new Map<string, DiscoverWork>()
  for (const item of items) {
    const key = discoverKey(item)
    const existing = map.get(key)
    if (!existing) {
      map.set(key, item)
      continue
    }

    map.set(key, {
      ...existing,
      ...item,
      authors: item.authors.length > 0 ? item.authors : existing.authors,
      abstract: existing.abstract ?? item.abstract,
      journal: existing.journal ?? item.journal,
      inLibrary: existing.inLibrary || item.inLibrary,
      libraryDocumentId: existing.libraryDocumentId ?? item.libraryDocumentId,
      fromLocalLibrary: existing.fromLocalLibrary || item.fromLocalLibrary,
      relationKind: existing.relationKind ?? item.relationKind,
      userTags: existing.userTags ?? item.userTags,
    })
  }
  return Array.from(map.values())
}

async function resolveSourceSeed(document: Document) {
  const seed = makeSeed(document)

  const openAlex = await lookupOpenAlexMetadata(seed).catch(() => null)
  if (openAlex) return { ...seed, ...openAlex }

  const crossref = await lookupCrossrefMetadata(seed).catch(() => null)
  if (crossref) return { ...seed, ...crossref }

  const semantic = await lookupSemanticScholarMetadata(seed).catch(() => null)
  if (semantic) return { ...seed, ...semantic }

  return seed
}

export async function resolveSourceWork(document: Document): Promise<DiscoverWork | null> {
  try {
    const seeded = await resolveSourceSeed(document)
    const base = documentToDiscoverWork({
      ...document,
      title: seeded.title ?? document.title,
      authors: seeded.authors ?? document.authors,
      year: seeded.year ?? document.year,
      doi: seeded.doi ?? document.doi,
      abstract: seeded.abstract ?? document.abstract,
    } as Document)

    const openAlex = await fetchOpenAlexPrimaryWork({
      doi: base.doi ?? null,
      openAlexId: null,
      title: base.title,
      authors: base.authors,
    }).catch(() => null)
    if (openAlex) {
      return {
        ...base,
        ...openAlexToDiscoverWork(openAlex),
        inLibrary: true,
        libraryDocumentId: document.id,
        fromLocalLibrary: true,
        isStarred: document.favorite,
      }
    }

    return base
  } catch (error) {
    console.warn('Could not resolve discover source work:', error)
    return documentToDiscoverWork(document)
  }
}

export async function fetchDiscoverStep(
  sourceWork: DiscoverWork,
  mode: DiscoverMode,
  allDocuments: Document[],
  allRelations: DocumentRelation[],
  settings: { semanticScholarApiKey?: string },
  signal?: AbortSignal,
  forceRefresh = false,
): Promise<DiscoverWork[]> {
  const cacheKey = `${sourceWork.openAlexId ?? normalizeDoi(sourceWork.doi) ?? normalizeTitle(sourceWork.title)}:${mode}`
  const cached = forceRefresh ? null : stepCache.get(cacheKey)
  if (!forceRefresh) {
    if (cached && cached.length > 0) return cached
    if (cached && cached.length === 0) {
      stepCache.delete(cacheKey)
    }
  }

  const sourceDocumentId = sourceWork.libraryDocumentId ?? matchInLibrary(sourceWork, allDocuments)?.id ?? ''
  let items: DiscoverWork[] = []

  try {
    items = await fetchOpenAlexStep(sourceWork, mode, signal)
  } catch (error) {
    if (isAbortError(error)) throw error
    console.warn(`OpenAlex discover ${mode} failed:`, error)
  }

  if (items.length < 5) {
    try {
      const semanticItems = await fetchSemanticScholarStep(sourceWork, mode, settings.semanticScholarApiKey, signal)
      items = dedupeWorks([...items, ...semanticItems])
    } catch (error) {
      if (isAbortError(error)) throw error
      console.warn(`Semantic Scholar discover ${mode} fallback failed:`, error)
    }
  }

  const merged = await mergeLocalRelations(sourceDocumentId, annotateLibraryMatches(items, allDocuments), allDocuments, allRelations)
  const deduped = dedupeWorks(merged)
  if (deduped.length > 0) {
    stepCache.set(cacheKey, deduped)
  }
  return deduped
}

export async function enrichWorkMetadata(
  work: DiscoverWork,
  settings: { semanticScholarApiKey?: string; crossrefContactEmail?: string },
) {
  try {
    let next = { ...work }
    const seed: SniffedPdfMetadata = {
      title: work.title,
      authors: work.authors,
      year: work.year ?? undefined,
      doi: work.doi ?? undefined,
      abstract: work.abstract ?? undefined,
      source: 'offline',
    }

    if (!next.abstract || !next.journal) {
      const crossref = await lookupCrossrefMetadata(seed, {
        contactEmail: settings.crossrefContactEmail,
      }).catch(() => null)
      if (crossref) {
        next = {
          ...next,
          doi: next.doi ?? normalizeDoi(crossref.doi),
          journal: next.journal ?? null,
          abstract: next.abstract ?? crossref.abstract ?? null,
        }
      }
    }

    if (!next.abstract || next.citedByCount == null) {
      const semantic = await lookupSemanticScholarMetadata(seed, {
        apiKey: settings.semanticScholarApiKey,
      }).catch(() => null)
      if (semantic) {
        next = {
          ...next,
          abstract: next.abstract ?? semantic.abstract ?? null,
          citedByCount: next.citedByCount ?? semantic.citationCount ?? null,
          doi: next.doi ?? normalizeDoi(semantic.doi),
        }
      }
    }

    return next
  } catch (error) {
    console.warn('Could not enrich discover work metadata:', error)
    return work
  }
}

export async function loadDiscoverySettings() {
  const settings = await loadAppSettings(true)
  return {
    semanticScholarApiKey: getResolvedSemanticScholarApiKey(settings),
    crossrefContactEmail: settings.crossrefContactEmail,
  }
}

export function getDiscoverStepCacheKey(sourceWork: DiscoverWork, mode: DiscoverMode) {
  return `${sourceWork.openAlexId ?? normalizeDoi(sourceWork.doi) ?? normalizeTitle(sourceWork.title)}:${mode}`
}
