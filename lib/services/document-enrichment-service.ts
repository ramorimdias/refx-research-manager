'use client'

import type { DbDocument } from '@/lib/repositories/local-db'
import { loadAppSettings, type StoredAppSettings } from '@/lib/app-settings'
import {
  lookupCrossrefMetadata,
  lookupSemanticScholarMetadata,
  type OnlineMetadataMatch,
  type OnlineMetadataMatchStrategy,
  type SniffedPdfMetadata,
} from '@/lib/services/bibtex-sniffer'
import { deriveMetadataStatus, type LocalPdfMetadata } from '@/lib/services/document-metadata-service'
import type { DocumentMetadataProvenanceEntry, MetadataFieldSource } from '@/lib/types'

export type OnlineMetadataEnrichmentSettings = Pick<
  StoredAppSettings,
  'crossrefContactEmail' | 'semanticScholarApiKey'
>

export type DocumentMetadataEnrichmentResult = {
  matches: Array<{
    matchedBy: OnlineMetadataMatchStrategy
    source: 'crossref' | 'semantic_scholar'
  }>
  metadata: LocalPdfMetadata
}

function parseAuthorsValue(value?: string) {
  if (!value) return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : []
  } catch {
    return value ? [value] : []
  }
}

function citationKeyFor(title: string, authors: string[], year?: number) {
  const firstAuthorToken = authors[0]?.split(/\s+/).pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'unknown'
  const titleToken = title.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'paper'
  return `${firstAuthorToken}${year ?? 'nd'}${titleToken}`
}

function provenanceEntry(
  source: MetadataFieldSource,
  matchedBy: OnlineMetadataMatchStrategy,
  providerLabel: string,
  confidence: number,
): DocumentMetadataProvenanceEntry {
  const matchLabel = matchedBy === 'doi' ? 'DOI' : 'title'
  return {
    source,
    extractedAt: new Date(),
    confidence,
    detail: `${providerLabel} ${matchLabel} match.`,
  }
}

function providerMatchToLocalMetadata(match: OnlineMetadataMatch): LocalPdfMetadata {
  const providerSource: MetadataFieldSource = match.source === 'semantic_scholar' ? 'semantic_scholar' : 'crossref'
  const providerLabel = match.source === 'semantic_scholar' ? 'Semantic Scholar' : 'Crossref'
  const confidence = match.matchedBy === 'doi'
    ? match.source === 'semantic_scholar' ? 0.94 : 0.97
    : match.source === 'semantic_scholar' ? 0.74 : 0.82
  const authors = match.authors ?? []
  const title = match.title?.trim() || undefined

  return {
    title,
    authors,
    year: match.year,
    doi: match.doi,
    citationKey: title ? citationKeyFor(title, authors, match.year) : undefined,
    provenance: {
      ...(title ? { title: provenanceEntry(providerSource, match.matchedBy, providerLabel, confidence) } : {}),
      ...(authors.length > 0 ? { authors: provenanceEntry(providerSource, match.matchedBy, providerLabel, confidence) } : {}),
      ...(match.year ? { year: provenanceEntry(providerSource, match.matchedBy, providerLabel, confidence - 0.04) } : {}),
      ...(match.doi ? { doi: provenanceEntry(providerSource, match.matchedBy, providerLabel, 1) } : {}),
    },
  }
}

function mergeProviderMetadata(
  base: LocalPdfMetadata | null,
  incoming: LocalPdfMetadata,
) {
  if (!base) {
    return incoming
  }

  return {
    title: base.title ?? incoming.title,
    authors: base.authors && base.authors.length > 0 ? base.authors : incoming.authors,
    year: base.year ?? incoming.year,
    doi: base.doi ?? incoming.doi,
    pageCount: base.pageCount ?? incoming.pageCount,
    citationKey: base.citationKey ?? incoming.citationKey,
    provenance: {
      ...incoming.provenance,
      ...base.provenance,
    },
  } satisfies LocalPdfMetadata
}

function effectiveMetadataStatus(seed: SniffedPdfMetadata) {
  return deriveMetadataStatus({
    title: seed.title,
    authors: seed.authors,
    year: seed.year,
    doi: seed.doi,
  })
}

function applyMatchToSeed(seed: SniffedPdfMetadata, match: OnlineMetadataMatch): SniffedPdfMetadata {
  return {
    ...seed,
    title: seed.title ?? match.title,
    authors: seed.authors && seed.authors.length > 0 ? seed.authors : match.authors,
    year: seed.year ?? match.year,
    doi: seed.doi ?? match.doi,
    citationKey: seed.citationKey ?? match.citationKey,
  }
}

export function buildDocumentMetadataSeed(
  document: Pick<DbDocument, 'title' | 'authors' | 'year' | 'doi' | 'citationKey'>,
  localMetadata?: Pick<LocalPdfMetadata, 'authors' | 'citationKey' | 'doi' | 'title' | 'year'>,
): SniffedPdfMetadata {
  return {
    authors: localMetadata?.authors ?? parseAuthorsValue(document.authors),
    citationKey: localMetadata?.citationKey ?? document.citationKey,
    doi: localMetadata?.doi ?? document.doi,
    source: 'offline',
    title: localMetadata?.title ?? document.title,
    year: localMetadata?.year ?? document.year,
  }
}

export async function loadOnlineMetadataEnrichmentSettings(isDesktopApp: boolean) {
  const settings = await loadAppSettings(isDesktopApp)
  return {
    crossrefContactEmail: settings.crossrefContactEmail,
    semanticScholarApiKey: settings.semanticScholarApiKey,
  } satisfies OnlineMetadataEnrichmentSettings
}

export async function enrichDocumentMetadataOnline(
  seed: SniffedPdfMetadata,
  settings: OnlineMetadataEnrichmentSettings,
): Promise<DocumentMetadataEnrichmentResult | null> {
  let nextSeed = seed
  let metadata: LocalPdfMetadata | null = null
  const matches: DocumentMetadataEnrichmentResult['matches'] = []

  const crossrefMatch = await lookupCrossrefMetadata(nextSeed, {
    contactEmail: settings.crossrefContactEmail,
  })

  if (crossrefMatch) {
    metadata = mergeProviderMetadata(metadata, providerMatchToLocalMetadata(crossrefMatch))
    matches.push({ matchedBy: crossrefMatch.matchedBy, source: crossrefMatch.source })
    nextSeed = applyMatchToSeed(nextSeed, crossrefMatch)
  }

  if (effectiveMetadataStatus(nextSeed) !== 'complete' && settings.semanticScholarApiKey.trim()) {
    const semanticScholarMatch = await lookupSemanticScholarMetadata(nextSeed, {
      apiKey: settings.semanticScholarApiKey,
    })

    if (semanticScholarMatch) {
      metadata = mergeProviderMetadata(metadata, providerMatchToLocalMetadata(semanticScholarMatch))
      matches.push({ matchedBy: semanticScholarMatch.matchedBy, source: semanticScholarMatch.source })
    }
  }

  if (!metadata) {
    return null
  }

  return {
    matches,
    metadata,
  }
}
