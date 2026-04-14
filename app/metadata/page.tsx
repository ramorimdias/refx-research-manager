'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CloudDownload,
  Database,
  Globe,
  Loader2,
  Save,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/refx/common'
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

type MetadataQueueMode = 'fetch_possible' | 'missing'

function hasCompleteCoreMetadata(document: Document) {
  return document.title.trim().length > 0 && document.authors.length > 0 && typeof document.year === 'number'
}

function isFetchPossibleDocument(document: Document) {
  return !hasCompleteCoreMetadata(document) && (document.doi ?? '').trim().length > 0
}

function isMissingMetadataDocument(document: Document) {
  return !hasCompleteCoreMetadata(document) && (document.doi ?? '').trim().length === 0
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
  const [metadataCandidates, setMetadataCandidates] = useState<DocumentMetadataCandidate[]>([])

  useEffect(() => {
    if (!selectedLibraryId && libraries.length > 0) {
      setSelectedLibraryId(activeLibraryId || libraries[0]?.id || '')
    }
  }, [activeLibraryId, libraries, selectedLibraryId])

  const filteredDocuments = useMemo(() => {
    if (!selectedLibraryId) return []
    return documents
      .filter((document) => document.libraryId === selectedLibraryId)
      .sort((left, right) => left.title.localeCompare(right.title))
  }, [documents, selectedLibraryId])

  const queue = useMemo(() => {
    const source = mode === 'fetch_possible' ? isFetchPossibleDocument : isMissingMetadataDocument
    return filteredDocuments.filter(source)
  }, [filteredDocuments, mode])

  useEffect(() => {
    setCurrentIndex((current) => {
      if (queue.length === 0) return 0
      return Math.min(current, queue.length - 1)
    })
  }, [queue.length])

  const currentDocument = queue[currentIndex] ?? null

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

  const runDoiCandidateSearch = async (document: Document) => {
    const trimmedDoi = (document.doi ?? '').trim()
    if (!trimmedDoi) {
      setMetadataCandidates([])
      setCandidateError('This document has no DOI to search.')
      return
    }

    setIsFetchingCandidates(true)
    setCandidateError('')
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
      if (candidates.length === 0) {
        setCandidateError('No DOI results were found for this document.')
      }
    } catch (error) {
      setCandidateError(error instanceof Error ? error.message : 'Could not fetch metadata candidates.')
    } finally {
      setIsFetchingCandidates(false)
    }
  }

  useEffect(() => {
    if (mode !== 'fetch_possible' || !currentDocument) return
    void runDoiCandidateSearch(currentDocument)
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
    <div className="p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <CloudDownload className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">{t('metadataPage.title')}</h1>
              <p className="text-sm text-muted-foreground">{t('metadataPage.subtitle')}</p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/maps">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('metadataPage.back')}
            </Link>
          </Button>
        </div>

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
                className="rounded-full"
                onClick={() => {
                  setMode('fetch_possible')
                  setCurrentIndex(0)
                }}
                data-tour-id="metadata-fetch-possible"
              >
                {t('metadataPage.fetchPossible')}
                <Badge variant="secondary" className="ml-2">
                  {filteredDocuments.filter(isFetchPossibleDocument).length}
                </Badge>
              </Button>
              <Button
                variant={mode === 'missing' ? 'secondary' : 'outline'}
                className="rounded-full"
                onClick={() => {
                  setMode('missing')
                  setCurrentIndex(0)
                }}
                data-tour-id="metadata-missing"
              >
                {t('metadataPage.missing')}
                <Badge variant="secondary" className="ml-2">
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
            title={mode === 'fetch_possible' ? t('metadataPage.noFetchQueue') : t('metadataPage.noMissingQueue')}
            description={
              mode === 'fetch_possible'
                ? t('metadataFields.allCompleteDescription', { library: currentLibrary.name })
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
                  <Input id="metadata-doi" className="mt-1.5" value={doi} onChange={(event) => setDoi(event.target.value)} />
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
                      {mode === 'fetch_possible' ? t('metadataPage.doiReview') : t('metadataPage.manualReview')}
                    </CardTitle>
                    <CardDescription>
                      {mode === 'fetch_possible'
                        ? t('metadataPage.doiReviewDescription')
                        : t('metadataPage.manualReviewDescription')}
                    </CardDescription>
                  </div>
                  {mode === 'fetch_possible' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void runDoiCandidateSearch(currentDocument)}
                      disabled={isFetchingCandidates}
                    >
                      <Globe className="mr-2 h-4 w-4" />
                      {isFetchingCandidates ? t('metadataPage.searching') : t('metadataPage.refresh')}
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {mode === 'fetch_possible' ? (
                  isFetchingCandidates ? (
                    <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                      {t('metadataPage.searchAcrossProviders')}
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
                  )
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
    </div>
  )
}
