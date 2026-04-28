'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CloudDownload,
  Database,
  Globe,
  Loader2,
  Save,
  Search,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/refx/common'
import { PageHeader } from '@/components/refx/page-header'
import {
  buildDocumentMetadataSeed,
  findDocumentMetadataCandidates,
  loadOnlineMetadataEnrichmentSettings,
  type DocumentMetadataCandidate,
} from '@/lib/services/document-enrichment-service'
import { cn } from '@/lib/utils'
import type { Document } from '@/lib/types'
import { useT } from '@/lib/localization'
import { useDocumentActions, useDocumentStore } from '@/lib/stores/document-store'
import { useLibraryStore } from '@/lib/stores/library-store'
import { useRuntimeState } from '@/lib/stores/runtime-store'

type MetadataQueueMode = 'fetch_possible' | 'missing_doi' | 'missing' | 'cleanup'

const VERIFIED_DOI_TITLE_MATCHES_KEY = 'refx.metadata.verified-doi-title-matches.v1'

const TITLE_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'by',
  'for',
  'from',
  'in',
  'into',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
])

function normalizeMetadataToken(input: string) {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function metadataTokens(input: string) {
  return normalizeMetadataToken(input)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !TITLE_STOP_WORDS.has(token))
}

function titleSimilarity(left?: string, right?: string) {
  const leftTokens = new Set(metadataTokens(left ?? ''))
  const rightTokens = new Set(metadataTokens(right ?? ''))
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length
  return overlap / Math.max(leftTokens.size, rightTokens.size)
}

function getMetadataCleanupIssues(
  document: Document,
  options?: { ignoreVerifiedDoiTitle?: boolean },
) {
  const issues: string[] = []
  const title = document.title.trim()
  const titleTokens = new Set(metadataTokens(title))
  const authorTokens = document.authors.flatMap((author) => metadataTokens(author))
  const authorOverlap = authorTokens.filter((token) => titleTokens.has(token))
  const yearMatches = title.match(/\b(19|20)\d{2}\b/g) ?? []
  const numericGroups = title.match(/\d+/g) ?? []
  const alphanumeric = title.replace(/[^a-z0-9]/gi, '')
  const digitCount = (alphanumeric.match(/\d/g) ?? []).length
  const suspiciousAuthors = document.authors.some((author) => {
    const normalized = author.trim()
    return normalized.length > 80
      || /@|https?:\/\/|doi\b|abstract|keywords|journal|university|department|received|accepted/i.test(normalized)
      || metadataTokens(normalized).length > 7
  })

  if (authorOverlap.length >= 2) {
    issues.push('Title contains words that look like author names.')
  }
  if (yearMatches.length > 1 || numericGroups.length >= 4 || (alphanumeric.length > 0 && digitCount / alphanumeric.length > 0.22)) {
    issues.push('Title contains many numbers or years.')
  }
  if (suspiciousAuthors) {
    issues.push('Author field may contain non-author text.')
  }
  if (!options?.ignoreVerifiedDoiTitle && document.metadataProvenance?.doi?.source === 'doi_regex' && (document.doi ?? '').trim().length > 0) {
    issues.push('DOI was detected automatically; verify that its fetched title matches this record.')
  }
  if (document.metadataProvenance?.title?.source === 'filename_fallback' && titleSimilarity(title, document.sourcePath ?? document.importedFilePath ?? '') < 0.2) {
    issues.push('Title came from a filename fallback and may need review.')
  }

  return issues
}

function hasCompleteCoreMetadata(document: Document) {
  return document.title.trim().length > 0 && document.authors.length > 0 && typeof document.year === 'number'
}

function isFetchPossibleDocument(document: Document) {
  return !hasCompleteCoreMetadata(document) && (document.doi ?? '').trim().length > 0
}

function isMissingDoiDocument(document: Document) {
  return hasCompleteCoreMetadata(document) && (document.doi ?? '').trim().length === 0
}

function isMissingMetadataDocument(document: Document) {
  return !hasCompleteCoreMetadata(document) && (document.doi ?? '').trim().length === 0
}

function isCleanupCandidateDocument(
  document: Document,
  options?: { ignoreVerifiedDoiTitle?: boolean },
) {
  return hasCompleteCoreMetadata(document) && getMetadataCleanupIssues(document, options).length > 0
}

function loadVerifiedDoiTitleMatches() {
  if (typeof window === 'undefined') return {}
  try {
    const parsed = JSON.parse(window.localStorage.getItem(VERIFIED_DOI_TITLE_MATCHES_KEY) ?? '{}') as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] =>
        typeof entry[0] === 'string' && typeof entry[1] === 'string',
      ),
    )
  } catch {
    return {}
  }
}

function persistVerifiedDoiTitleMatches(value: Record<string, string>) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(VERIFIED_DOI_TITLE_MATCHES_KEY, JSON.stringify(value))
}

function buildSavePayload(input: {
  title: string
  authors: string
  year: string
  doi: string
  isbn: string
  publisher: string
  citationKey: string
  abstract: string
}) {
  return {
    title: input.title.trim(),
    authors: input.authors
      .split(',')
      .map((author) => author.trim())
      .filter(Boolean),
    year: input.year.trim() ? Number(input.year.trim()) : undefined,
    doi: input.doi.trim() || undefined,
    isbn: input.isbn.trim() || undefined,
    publisher: input.publisher.trim() || undefined,
    citationKey: input.citationKey.trim() || '',
    abstract: input.abstract.trim() || undefined,
  }
}

export default function MetadataWorkspacePage() {
  const t = useT()
  const libraries = useLibraryStore((state) => state.libraries)
  const activeLibraryId = useLibraryStore((state) => state.activeLibraryId)
  const documents = useDocumentStore((state) => state.documents)
  const { updateDocument, applyFetchedMetadataCandidate } = useDocumentActions()
  const { isDesktopApp, remoteVaultStatus } = useRuntimeState()

  const [selectedLibraryId, setSelectedLibraryId] = useState('')
  const [mode, setMode] = useState<MetadataQueueMode>('fetch_possible')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [title, setTitle] = useState('')
  const [authors, setAuthors] = useState('')
  const [year, setYear] = useState('')
  const [doi, setDoi] = useState('')
  const [isbn, setIsbn] = useState('')
  const [publisher, setPublisher] = useState('')
  const [citationKey, setCitationKey] = useState('')
  const [abstract, setAbstract] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isFetchingCandidates, setIsFetchingCandidates] = useState(false)
  const [isApplyingCandidate, setIsApplyingCandidate] = useState(false)
  const [candidateError, setCandidateError] = useState('')
  const [doiSearchFailed, setDoiSearchFailed] = useState(false)
  const [metadataCandidates, setMetadataCandidates] = useState<DocumentMetadataCandidate[]>([])
  const [verifiedDoiTitleMatches, setVerifiedDoiTitleMatches] = useState<Record<string, string>>(() => loadVerifiedDoiTitleMatches())

  useEffect(() => {
    if (!selectedLibraryId && libraries.length > 0) {
      setSelectedLibraryId(activeLibraryId || libraries[0]?.id || '')
    }
  }, [activeLibraryId, libraries, selectedLibraryId])

  const filteredDocuments = useMemo(() => {
    if (!selectedLibraryId) return []
    return documents
      .filter((document) => document.libraryId === selectedLibraryId && document.documentType !== 'my_work')
      .sort((left, right) => left.title.localeCompare(right.title))
  }, [documents, selectedLibraryId])

  const hasVerifiedDoiTitleMatch = (document: Document) => {
    const doi = (document.doi ?? '').trim().toLowerCase()
    return Boolean(doi && verifiedDoiTitleMatches[document.id] === doi)
  }

  const queue = useMemo(() => {
    const source = mode === 'fetch_possible'
      ? isFetchPossibleDocument
      : mode === 'missing_doi'
        ? isMissingDoiDocument
      : mode === 'cleanup'
        ? (document: Document) => isCleanupCandidateDocument(document, {
            ignoreVerifiedDoiTitle: hasVerifiedDoiTitleMatch(document),
          })
        : isMissingMetadataDocument
    return filteredDocuments.filter(source)
  }, [filteredDocuments, mode, verifiedDoiTitleMatches])

  const currentDocument = queue[currentIndex] ?? null

  const currentCleanupIssues = useMemo(
    () => currentDocument
      ? getMetadataCleanupIssues(currentDocument, {
          ignoreVerifiedDoiTitle: hasVerifiedDoiTitleMatch(currentDocument),
        })
      : [],
    [currentDocument, verifiedDoiTitleMatches],
  )

  const bestDoiTitleCandidate = useMemo(() => {
    if (!currentDocument || metadataCandidates.length === 0) return null
    return metadataCandidates
      .map((candidate) => ({
        candidate,
        similarity: titleSimilarity(currentDocument.title, candidate.title),
      }))
      .sort((left, right) => right.similarity - left.similarity)[0] ?? null
  }, [currentDocument, metadataCandidates])

  const hasDoiTitleMismatch = mode === 'cleanup'
    && bestDoiTitleCandidate
    && bestDoiTitleCandidate.similarity < 0.42

  useEffect(() => {
    setCurrentIndex((current) => {
      if (queue.length === 0) return 0
      return Math.min(current, queue.length - 1)
    })
  }, [queue.length])

  useEffect(() => {
    if (!currentDocument) {
      setTitle('')
      setAuthors('')
      setYear('')
      setDoi('')
      setIsbn('')
      setPublisher('')
      setCitationKey('')
      setAbstract('')
      setMetadataCandidates([])
      setCandidateError('')
      setDoiSearchFailed(false)
      return
    }

    setTitle(currentDocument.title)
    setAuthors(currentDocument.authors.join(', '))
    setYear(currentDocument.year ? String(currentDocument.year) : '')
    setDoi(currentDocument.doi ?? '')
    setIsbn(currentDocument.isbn ?? '')
    setPublisher(currentDocument.publisher ?? '')
    setCitationKey(currentDocument.citationKey ?? '')
    setAbstract(currentDocument.abstract ?? '')
    setMetadataCandidates([])
    setCandidateError('')
    setDoiSearchFailed(false)
  }, [currentDocument])

  const savePayload = useMemo(
    () =>
      buildSavePayload({
        title,
        authors,
        year,
        doi,
        isbn,
        publisher,
        citationKey,
        abstract,
      }),
    [abstract, authors, citationKey, doi, isbn, publisher, title, year],
  )

  const hasUnsavedChanges = useMemo(() => {
    if (!currentDocument) return false
    if (savePayload.title !== currentDocument.title) return true
    if (savePayload.authors.length !== currentDocument.authors.length) return true
    if (savePayload.authors.some((author, index) => author !== currentDocument.authors[index])) return true
    if (savePayload.year !== currentDocument.year) return true
    if ((savePayload.doi ?? '') !== (currentDocument.doi ?? '')) return true
    if ((savePayload.isbn ?? '') !== (currentDocument.isbn ?? '')) return true
    if ((savePayload.publisher ?? '') !== (currentDocument.publisher ?? '')) return true
    if (savePayload.citationKey !== (currentDocument.citationKey ?? '')) return true
    if ((savePayload.abstract ?? '') !== (currentDocument.abstract ?? '')) return true
    return false
  }, [currentDocument, savePayload])

  const runDoiCandidateSearch = async (document: Document, doiOverride?: string) => {
    const trimmedDoi = (doiOverride ?? doi ?? document.doi ?? '').trim()
    if (!trimmedDoi) {
      setMetadataCandidates([])
      setCandidateError('This document has no DOI to search.')
      setDoiSearchFailed(false)
      return
    }

    setIsFetchingCandidates(true)
    setCandidateError('')
    setDoiSearchFailed(false)
    setMetadataCandidates([])
    try {
      const settings = await loadOnlineMetadataEnrichmentSettings(isDesktopApp)
      const candidates = await findDocumentMetadataCandidates(
        buildDocumentMetadataSeed({
          title: document.title,
          authors: JSON.stringify(document.authors),
          year: document.year,
          doi: trimmedDoi,
          citationKey: document.citationKey,
        }),
        settings,
        { providers: ['semantic_scholar', 'openalex', 'crossref'] },
      )
      setMetadataCandidates(candidates)
      if (mode === 'cleanup' && candidates.length > 0) {
        const bestMatch = candidates
          .map((candidate) => ({
            candidate,
            similarity: titleSimilarity(document.title, candidate.title),
          }))
          .sort((left, right) => right.similarity - left.similarity)[0]

        if (bestMatch && bestMatch.similarity >= 0.42) {
          setVerifiedDoiTitleMatches((current) => {
            const next = {
              ...current,
              [document.id]: trimmedDoi.toLowerCase(),
            }
            persistVerifiedDoiTitleMatches(next)
            return next
          })
        }
      }
      if (candidates.length === 0) {
        setCandidateError('No DOI results were found for this document.')
        setDoiSearchFailed(true)
      }
    } catch (error) {
      setCandidateError(error instanceof Error ? error.message : 'Could not fetch metadata candidates.')
    } finally {
      setIsFetchingCandidates(false)
    }
  }

  const runTitleAuthorCandidateSearch = async (document: Document) => {
    const trimmedTitle = document.title.trim()
    const primaryAuthor = document.authors[0]?.trim() ?? ''
    if (!trimmedTitle && !primaryAuthor) {
      setMetadataCandidates([])
      setCandidateError('This document has no title or author to search.')
      setDoiSearchFailed(false)
      return
    }

    setIsFetchingCandidates(true)
    setCandidateError('')
    setDoiSearchFailed(false)
    setMetadataCandidates([])
    try {
      const settings = await loadOnlineMetadataEnrichmentSettings(isDesktopApp)
      const candidates = await findDocumentMetadataCandidates(
        buildDocumentMetadataSeed({
          title: trimmedTitle,
          authors: JSON.stringify(primaryAuthor ? [primaryAuthor] : document.authors),
          year: document.year,
          doi: undefined,
          citationKey: document.citationKey,
        }),
        settings,
        { providers: ['semantic_scholar', 'openalex', 'crossref'] },
      )
      const doiCandidates = candidates.filter((candidate) => (candidate.doi ?? '').trim().length > 0)
      setMetadataCandidates(doiCandidates)
      if (doiCandidates.length === 0) {
        setCandidateError('No title and author results with DOI were found for this document.')
      }
    } catch (error) {
      setCandidateError(error instanceof Error ? error.message : 'Could not fetch metadata candidates.')
    } finally {
      setIsFetchingCandidates(false)
    }
  }

  useEffect(() => {
    if ((mode !== 'fetch_possible' && mode !== 'cleanup') || !currentDocument || !(currentDocument.doi ?? '').trim()) return
    void runDoiCandidateSearch(currentDocument, currentDocument.doi)
  }, [currentDocument, isDesktopApp, mode])

  useEffect(() => {
    if (mode !== 'missing_doi' || !currentDocument) return
    void runTitleAuthorCandidateSearch(currentDocument)
  }, [currentDocument, isDesktopApp, mode])

  const handleSave = async () => {
    if (!currentDocument || !hasUnsavedChanges) return
    setIsSaving(true)
    try {
      await updateDocument(currentDocument.id, savePayload)
    } finally {
      setIsSaving(false)
    }
  }

  const handleApplyCandidate = async (
    modeToApply: 'fill_missing' | 'replace_unlocked',
    candidate: DocumentMetadataCandidate,
  ) => {
    if (!currentDocument) return
    setIsApplyingCandidate(true)
    try {
      await applyFetchedMetadataCandidate(currentDocument.id, candidate.metadata, modeToApply)
      setCurrentIndex((current) => Math.min(current, Math.max(0, queue.length - 2)))
    } finally {
      setIsApplyingCandidate(false)
    }
  }

  const currentLibrary = libraries.find((library) => library.id === selectedLibraryId) ?? null
  const canWriteMetadata = !remoteVaultStatus?.enabled || (!remoteVaultStatus.isOffline && remoteVaultStatus.mode === 'remoteWriter')
  const metadataWriteLockMessage = remoteVaultStatus?.enabled && !canWriteMetadata
    ? `${remoteVaultStatus.message} You can still search metadata, but saving or applying changes requires write access.`
    : ''

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 p-4 md:p-6">
        <PageHeader
          icon={<CloudDownload className="h-6 w-6" />}
          title={t('metadataPage.title')}
          subtitle={t('metadataPage.subtitle')}
          actions={(
            <Button asChild variant="outline" size="sm">
              <Link href="/maps">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('metadataPage.back')}
              </Link>
            </Button>
          )}
        />

        <Card data-tour-id="metadata-queue">
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-[240px] flex-1">
              <Label className="text-sm">{t('metadataPage.library')}</Label>
              <Select value={selectedLibraryId} onValueChange={(value) => {
                setSelectedLibraryId(value)
                setCurrentIndex(0)
              }}>
                <SelectTrigger className="mt-1.5 border-transparent bg-card/90 shadow-sm">
                  <SelectValue placeholder={t('metadataPage.selectLibrary')} />
                </SelectTrigger>
                <SelectContent>
                  {libraries.map((library) => (
                    <SelectItem key={library.id} value={library.id}>
                      {library.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 self-end">
              <Button
                variant={mode === 'fetch_possible' ? 'secondary' : 'outline'}
                className={cn(
                  'rounded-full border-sky-200',
                  mode === 'fetch_possible'
                    ? 'bg-sky-100 text-sky-950 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-900/40 dark:text-sky-100'
                    : 'text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950/30',
                )}
                onClick={() => {
                  setMode('fetch_possible')
                  setCurrentIndex(0)
                }}
                data-tour-id="metadata-fetch-possible"
              >
                <Search className="mr-2 h-4 w-4" />
                {t('metadataPage.fetchPossible')}
                <Badge variant="secondary" className="ml-2 bg-white/70 text-sky-950 dark:bg-black/20 dark:text-sky-100">
                  {filteredDocuments.filter(isFetchPossibleDocument).length}
                </Badge>
              </Button>
              <Button
                variant={mode === 'cleanup' ? 'secondary' : 'outline'}
                className={cn(
                  'rounded-full border-violet-200',
                  mode === 'cleanup'
                    ? 'bg-violet-100 text-violet-950 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-900/40 dark:text-violet-100'
                    : 'text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950/30',
                )}
                onClick={() => {
                  setMode('cleanup')
                  setCurrentIndex(0)
                }}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {t('metadataPage.cleanup')}
                <Badge variant="secondary" className="ml-2 bg-white/70 text-violet-950 dark:bg-black/20 dark:text-violet-100">
                  {filteredDocuments.filter((document) => isCleanupCandidateDocument(document, {
                    ignoreVerifiedDoiTitle: hasVerifiedDoiTitleMatch(document),
                  })).length}
                </Badge>
              </Button>
              <Button
                variant={mode === 'missing_doi' ? 'secondary' : 'outline'}
                className={cn(
                  'rounded-full border-amber-200',
                  mode === 'missing_doi'
                    ? 'bg-amber-100 text-amber-950 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-100'
                    : 'text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/30',
                )}
                onClick={() => {
                  setMode('missing_doi')
                  setCurrentIndex(0)
                }}
              >
                <Check className="mr-2 h-4 w-4" />
                {t('libraries.missingDoi')}
                <Badge variant="secondary" className="ml-2 bg-white/70 text-amber-950 dark:bg-black/20 dark:text-amber-100">
                  {filteredDocuments.filter(isMissingDoiDocument).length}
                </Badge>
              </Button>
              <Button
                variant={mode === 'missing' ? 'secondary' : 'outline'}
                className={cn(
                  'rounded-full border-red-200',
                  mode === 'missing'
                    ? 'bg-red-100 text-red-950 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/40 dark:text-red-100'
                    : 'text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30',
                )}
                onClick={() => {
                  setMode('missing')
                  setCurrentIndex(0)
                }}
                data-tour-id="metadata-missing"
              >
                <CircleHelp className="mr-2 h-4 w-4" />
                {t('metadataPage.missing')}
                <Badge variant="secondary" className="ml-2 bg-white/70 text-red-950 dark:bg-black/20 dark:text-red-100">
                  {filteredDocuments.filter(isMissingMetadataDocument).length}
                </Badge>
              </Button>
            </div>
          </CardContent>
        </Card>

        <div data-tour-id="metadata-editor">
          {!currentLibrary ? (
          <EmptyState
            icon={Database}
            title={t('metadataPage.noLibrary')}
            description={t('metadataPage.noLibraryDescription')}
          />
        ) : !currentDocument ? (
          <EmptyState
            icon={Database}
            title={
              mode === 'fetch_possible'
                ? t('metadataPage.noFetchQueue')
                : mode === 'cleanup'
                  ? t('metadataPage.noCleanupQueue')
                  : mode === 'missing_doi'
                    ? t('metadataPage.noMissingDoiQueue')
                  : t('metadataPage.noMissingQueue')
            }
            description={
              mode === 'fetch_possible'
                ? t('metadataFields.allCompleteDescription', { library: currentLibrary.name })
                : mode === 'cleanup'
                  ? t('metadataPage.noCleanupDescription', { library: currentLibrary.name })
                  : mode === 'missing_doi'
                    ? t('metadataPage.noMissingDoiDescription', { library: currentLibrary.name })
                  : t('metadataFields.noMissingDescription', { library: currentLibrary.name })
            }
          />
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.95fr)]">
            <Card>
              <CardHeader className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{currentDocument.title || t('metadataFields.untitledDocument')}</CardTitle>
                    <CardDescription>
                      {currentLibrary.name} - {t('metadataFields.queuePosition', { current: currentIndex + 1, total: queue.length })}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setCurrentIndex((current) => Math.max(0, current - 1))}
                      disabled={currentIndex <= 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setCurrentIndex((current) => Math.min(queue.length - 1, current + 1))}
                      disabled={currentIndex >= queue.length - 1}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {mode === 'cleanup' ? (
                    currentCleanupIssues.map((issue) => (
                      <Badge key={issue} variant="outline" className="border-amber-300 bg-amber-50 text-amber-900">
                        {issue}
                      </Badge>
                    ))
                  ) : null}
                  {hasUnsavedChanges ? (
                    <Button
                      onClick={() => void handleSave()}
                      disabled={isSaving || !canWriteMetadata}
                      title={!canWriteMetadata ? metadataWriteLockMessage : undefined}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {isSaving ? t('metadataPage.saving') : t('metadataPage.save')}
                    </Button>
                  ) : null}
                  <Button asChild variant="outline">
                    <Link href={`/documents?id=${currentDocument.id}`}>{t('metadataPage.openDetails')}</Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                {metadataWriteLockMessage ? (
                  <div className="md:col-span-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    {metadataWriteLockMessage}
                  </div>
                ) : null}
                <div className="md:col-span-2">
                  <Label htmlFor="metadata-title">{t('metadataFields.title')}</Label>
                  <Input id="metadata-title" className="mt-1.5" value={title} onChange={(event) => setTitle(event.target.value)} />
                </div>

                <div className="md:col-span-2">
                  <Label htmlFor="metadata-authors">{t('metadataFields.authors')}</Label>
                  <Input
                    id="metadata-authors"
                    className="mt-1.5"
                    value={authors}
                    onChange={(event) => setAuthors(event.target.value)}
                    placeholder={t('libraries.authorsPlaceholder')}
                  />
                </div>

                <div>
                  <Label htmlFor="metadata-year">{t('metadataFields.year')}</Label>
                  <Input id="metadata-year" className="mt-1.5" value={year} onChange={(event) => setYear(event.target.value)} />
                </div>

                <div>
                  <Label htmlFor="metadata-doi">{t('metadataFields.doi')}</Label>
                  <Input
                    id="metadata-doi"
                    className={cn(
                      'mt-1.5',
                      doiSearchFailed && 'border-destructive text-destructive focus-visible:ring-destructive/30',
                    )}
                    value={doi}
                    onChange={(event) => {
                      setDoi(event.target.value)
                      setDoiSearchFailed(false)
                    }}
                  />
                </div>

                <div>
                  <Label htmlFor="metadata-isbn">{t('metadataFields.isbn')}</Label>
                  <Input id="metadata-isbn" className="mt-1.5" value={isbn} onChange={(event) => setIsbn(event.target.value)} />
                </div>

                <div>
                  <Label htmlFor="metadata-publisher">{t('metadataFields.publisher')}</Label>
                  <Input id="metadata-publisher" className="mt-1.5" value={publisher} onChange={(event) => setPublisher(event.target.value)} />
                </div>

                <div className="md:col-span-2">
                  <Label htmlFor="metadata-citation-key">{t('metadataFields.citationKey')}</Label>
                  <Input
                    id="metadata-citation-key"
                    className="mt-1.5"
                    value={citationKey}
                    onChange={(event) => setCitationKey(event.target.value)}
                  />
                </div>

                <div className="md:col-span-2">
                  <Label htmlFor="metadata-abstract">{t('metadataFields.abstract')}</Label>
                  <Textarea
                    id="metadata-abstract"
                    className="mt-1.5 min-h-40"
                    value={abstract}
                    onChange={(event) => setAbstract(event.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">
                      {mode === 'fetch_possible'
                        ? t('metadataPage.doiReview')
                        : mode === 'cleanup'
                          ? t('metadataPage.cleanupReview')
                          : mode === 'missing_doi'
                            ? t('metadataPage.missingDoiReview')
                          : t('metadataPage.manualReview')}
                    </CardTitle>
                    <CardDescription>
                      {mode === 'fetch_possible'
                        ? t('metadataPage.doiReviewDescription')
                        : mode === 'cleanup'
                          ? t('metadataPage.cleanupReviewDescription')
                          : mode === 'missing_doi'
                            ? t('metadataPage.missingDoiReviewDescription')
                          : t('metadataPage.manualReviewDescription')}
                    </CardDescription>
                  </div>
                  {(mode === 'fetch_possible' || mode === 'missing_doi' || (mode === 'cleanup' && (currentDocument.doi ?? '').trim())) ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (mode === 'missing_doi') {
                          void runTitleAuthorCandidateSearch(currentDocument)
                          return
                        }
                        void runDoiCandidateSearch(currentDocument, doi)
                      }}
                      disabled={isFetchingCandidates}
                    >
                      <Globe className="mr-2 h-4 w-4" />
                      {isFetchingCandidates ? t('metadataPage.searching') : t('metadataPage.refresh')}
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {mode === 'fetch_possible' || mode === 'cleanup' || mode === 'missing_doi' ? (
                  <>
                  {mode === 'cleanup' ? (
                    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
                      <div className="flex items-center gap-2 font-medium">
                        <Sparkles className="h-4 w-4" />
                        {t('metadataPage.cleanupReasons')}
                      </div>
                      <ul className="list-disc space-y-1 pl-5">
                        {currentCleanupIssues.map((issue) => (
                          <li key={issue}>{issue}</li>
                        ))}
                        {hasDoiTitleMismatch ? (
                          <li>
                            {t('metadataPage.doiTitleMismatch', {
                              similarity: `${Math.round((bestDoiTitleCandidate?.similarity ?? 0) * 100)}%`,
                            })}
                          </li>
                        ) : null}
                      </ul>
                    </div>
                  ) : null}
                  {mode === 'cleanup' && !(currentDocument.doi ?? '').trim() ? (
                    <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                      {t('metadataPage.cleanupManualHelp')}
                    </div>
                  ) : (
                  isFetchingCandidates ? (
                    <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                      {mode === 'missing_doi'
                        ? t('metadataPage.searchTitleAuthorAcrossProviders')
                        : t('metadataPage.searchAcrossProviders')}
                    </div>
                  ) : metadataCandidates.length > 0 ? (
                    metadataCandidates.map((candidate) => (
                      <div key={candidate.id} className="rounded-lg border border-border px-4 py-4">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">
                            {candidate.source === 'semantic_scholar'
                              ? 'Semantic Scholar'
                              : candidate.source === 'openalex'
                                ? 'OpenAlex'
                                : 'Crossref'}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {candidate.matchedBy === 'doi' ? t('metadataFields.doi') : t('metadataFields.title')}
                          </span>
                        </div>
                        <p className="mt-2 break-words text-sm font-medium leading-5">{candidate.title || t('metadataFields.untitledDocument')}</p>
                        <p className="mt-1 break-words text-xs text-muted-foreground">
                          {candidate.authors.join(', ') || t('searchPage.unknownAuthor')}
                          {candidate.year ? ` • ${candidate.year}` : ''}
                          {candidate.doi ? ` • ${candidate.doi}` : ''}
                          {typeof candidate.citationCount === 'number' ? ` • ${candidate.citationCount} citations` : ''}
                        </p>
                        {candidate.suggestedTags && candidate.suggestedTags.length > 0 ? (
                          <p className="mt-2 break-words text-xs text-muted-foreground">
                            Topics: {candidate.suggestedTags.slice(0, 5).join(', ')}
                          </p>
                        ) : null}
                        {candidate.abstract ? (
                          <p className="mt-2 break-words text-xs leading-5 text-muted-foreground">
                            {candidate.abstract}
                          </p>
                        ) : null}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void handleApplyCandidate('fill_missing', candidate)}
                            disabled={isApplyingCandidate || !canWriteMetadata}
                            title={!canWriteMetadata ? metadataWriteLockMessage : undefined}
                          >
                            {t('metadataPage.fillMissing')}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void handleApplyCandidate('replace_unlocked', candidate)}
                            disabled={isApplyingCandidate || !canWriteMetadata}
                            title={!canWriteMetadata ? metadataWriteLockMessage : undefined}
                          >
                            {t('metadataPage.applyCandidate')}
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                      {candidateError || t('metadataPage.noCandidates')}
                    </div>
                  ))}
                  </>
                ) : (
                  <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                    {t('metadataPage.manualQueueHelp')}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
        </div>
    </div>
  )
}
