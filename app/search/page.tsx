'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Filter, Loader2, Plus, Search as SearchIcon, X } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { EmptyState, MetadataStatusBadge, ReadingStageBadge } from '@/components/refx/common'
import { useAppStore } from '@/lib/store'
import type { KeywordGroup, MetadataStatus, ReadingStage } from '@/lib/types'
import { searchDocuments, type DocumentSearchPageHit, type DocumentSearchQuery, type SearchProgressUpdate } from '@/lib/services/document-search-service'
import { useT } from '@/lib/localization'

type SearchResult = {
  document: ReturnType<typeof useAppStore.getState>['documents'][number]
  matchedQueryTerms: string[] 
  matchedTerms: string[]
  occurrenceCounts: Record<string, number>
  pageHits: DocumentSearchPageHit[]
  preview: string
  score: number
}

type GroupJoinOperator = 'AND' | 'OR'

function createKeywordGroup(operator: KeywordGroup['operator'] = 'AND', keywords: string[] = []): KeywordGroup {
  return {
    id: `group-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
    operator,
    keywords,
  }
}

function normalizeKeywords(keywords: string[]) {
  return Array.from(new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean)))
}

function normalizeSelectedIds(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function parseSimpleSearchTerms(query: string) {
  const matches = Array.from(query.matchAll(/"([^"]+)"|(\S+)/g))
  return normalizeKeywords(
    matches.map((match) => (match[1] ?? match[2] ?? '').trim()),
  )
}

function normalizeGroups(groups: KeywordGroup[]) {
  return groups
    .map((group) => ({
      ...group,
      keywords: normalizeKeywords(group.keywords),
    }))
    .filter((group) => group.keywords.length > 0)
}

function encodeGroupParam(group: KeywordGroup) {
  return `${group.operator}:${group.keywords.join('||')}`
}

function parseGroupParam(value: string) {
  const separatorIndex = value.indexOf(':')
  if (separatorIndex <= 0) return null

  const operator = value.slice(0, separatorIndex)
  if (operator !== 'AND' && operator !== 'OR') return null

  const keywords = normalizeKeywords(value.slice(separatorIndex + 1).split('||'))
  if (keywords.length === 0) return null

  return createKeywordGroup(operator, keywords)
}

function parseInitialGroups(params: URLSearchParams) {
  const encodedGroups = params.getAll('g').map(parseGroupParam).filter((group): group is KeywordGroup => Boolean(group))
  if (encodedGroups.length > 0) return encodedGroups

  const repeatedKeywords = normalizeKeywords(params.getAll('k'))
  if (repeatedKeywords.length > 0) {
    return [createKeywordGroup('AND', repeatedKeywords)]
  }

  const legacyQuery = params.get('q') ?? ''
  return legacyQuery.trim().length > 0 ? [createKeywordGroup('AND', [legacyQuery.trim()])] : []
}

function parseInitialSimpleQuery(params: URLSearchParams) {
  const directQuery = (params.get('q') ?? '').trim()
  if (directQuery) return directQuery

  const groups = parseInitialGroups(params)
  return flattenKeywords(groups).join(' ')
}

function parseQueryMode(params: URLSearchParams) {
  return params.get('mode') === 'complex' ? 'complex' : 'simple'
}

function parseGroupJoinOperator(params: URLSearchParams): GroupJoinOperator {
  return params.get('go') === 'OR' ? 'OR' : 'AND'
}

function flattenKeywords(groups: KeywordGroup[]) {
  return normalizeKeywords(groups.flatMap((group) => group.keywords))
}

function querySummary(groups: KeywordGroup[], groupJoinOperator: GroupJoinOperator) {
  return groups
    .map((group) => `(${group.keywords.join(` ${group.operator} `)})`)
    .join(` ${groupJoinOperator} `)
}

function buildSearchQuery(groups: KeywordGroup[], groupJoinOperator: GroupJoinOperator): DocumentSearchQuery | null {
  const normalizedGroups = normalizeGroups(groups)
  if (normalizedGroups.length === 0) return null

  const groupQueries = normalizedGroups.map((group) =>
    group.keywords.length === 1
      ? group.keywords[0]
      : {
          combineWith: group.operator,
          queries: group.keywords,
        },
  )

  if (groupQueries.length === 1) {
    return groupQueries[0] ?? null
  }

  return {
    combineWith: groupJoinOperator,
    queries: groupQueries,
  }
}

function parseSelectedLibraryIds(params: URLSearchParams) {
  if (params.get('libs') === 'none') return []
  return normalizeSelectedIds(params.getAll('lib'))
}

function buildSimpleSearchQuery(query: string): DocumentSearchQuery | null {
  const terms = parseSimpleSearchTerms(query)
  if (terms.length === 0) return null
  if (terms.length === 1) return terms[0] ?? null
  return {
    combineWith: 'AND',
    queries: terms,
  }
}

function SearchHelpTooltip({
  content,
  children,
}: {
  content: string
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help items-center">{children}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-pretty">
        {content}
      </TooltipContent>
    </Tooltip>
  )
}

function highlightText(text: string, keywords: string[]) {
  const normalized = normalizeKeywords(keywords)
  if (normalized.length === 0) return text

  const pattern = normalized
    .sort((left, right) => right.length - left.length)
    .map((keyword) => keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')

  if (!pattern) return text
  const expression = new RegExp(`(${pattern})`, 'gi')
  const segments = text.split(expression)

  return segments.map((segment, index) =>
    normalized.some((keyword) => keyword.toLowerCase() === segment.toLowerCase()) ? (
      <mark key={`${segment}-${index}`} className="rounded bg-primary/20 px-0.5 text-foreground">
        {segment}
      </mark>
    ) : (
      <span key={`${segment}-${index}`}>{segment}</span>
    ),
  )
}

export default function SearchPage() {
  const t = useT()
  const router = useRouter()
  const params = useSearchParams()
  const paramString = params.toString()
  const { documents, libraries, setGlobalSearchQuery, persistentSearch, setPersistentSearch } = useAppStore()
  const initialGroups = useMemo(
    () => parseInitialGroups(new URLSearchParams(paramString)),
    [paramString],
  )
  const initialMode = useMemo(() => parseQueryMode(new URLSearchParams(paramString)), [paramString])
  const initialGroupJoinOperator = useMemo(() => parseGroupJoinOperator(new URLSearchParams(paramString)), [paramString])
  const initialSimpleQuery = useMemo(() => parseInitialSimpleQuery(new URLSearchParams(paramString)), [paramString])
  const initialSelectedLibraryIds = useMemo(() => parseSelectedLibraryIds(new URLSearchParams(paramString)), [paramString])
  const hasExplicitNoLibraries = useMemo(() => new URLSearchParams(paramString).get('libs') === 'none', [paramString])
  const [queryMode, setQueryMode] = useState<'simple' | 'complex'>(initialMode)
  const [simpleQueryInput, setSimpleQueryInput] = useState(initialSimpleQuery)
  const [draftGroups, setDraftGroups] = useState<KeywordGroup[]>(initialGroups.length > 0 ? initialGroups : [createKeywordGroup('AND')])
  const [draftGroupJoinOperator, setDraftGroupJoinOperator] = useState<GroupJoinOperator>(initialGroupJoinOperator)
  const [draftSelectedLibraryIds, setDraftSelectedLibraryIds] = useState<string[]>(
    initialSelectedLibraryIds.length > 0 || hasExplicitNoLibraries
      ? initialSelectedLibraryIds
      : libraries.map((library) => library.id),
  )
  const [draftReadingStage, setDraftReadingStage] = useState<'all' | ReadingStage>(persistentSearch.readingStage)
  const [draftMetadataStatus, setDraftMetadataStatus] = useState<'all' | MetadataStatus>(persistentSearch.metadataStatus)
  const [draftFavoriteOnly, setDraftFavoriteOnly] = useState(persistentSearch.favoriteOnly)
  const [draftFlexibility, setDraftFlexibility] = useState(persistentSearch.flexibility)
  const [groupInputs, setGroupInputs] = useState<Record<string, string>>({})
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchedCount, setSearchedCount] = useState(0)
  const [totalToSearch, setTotalToSearch] = useState(0)
  const [searchStatus, setSearchStatus] = useState('')
  const searchRunId = useRef(0)

  const selectedLibraryIds = persistentSearch.selectedLibraryIds
  const readingStage = persistentSearch.readingStage
  const metadataStatus = persistentSearch.metadataStatus
  const favoriteOnly = persistentSearch.favoriteOnly
  const flexibility = persistentSearch.flexibility
  const executedSelectedLibraryIds = useMemo(
    () => (hasExplicitNoLibraries ? [] : selectedLibraryIds.length > 0 ? selectedLibraryIds : libraries.map((library) => library.id)),
    [hasExplicitNoLibraries, libraries, selectedLibraryIds],
  )
  const executedGroups = useMemo(() => normalizeGroups(initialGroups), [initialGroups])
  const executedGroupJoinOperator = useMemo(() => initialGroupJoinOperator, [initialGroupJoinOperator])
  const executedSimpleQuery = useMemo(() => initialSimpleQuery.trim(), [initialSimpleQuery])
  const executedSimpleTerms = useMemo(() => parseSimpleSearchTerms(executedSimpleQuery), [executedSimpleQuery])
  const flexibilityLabel = (flexibility: number) => {
    if (flexibility < 20) return t('searchPage.strict')
    if (flexibility < 45) return t('searchPage.balanced')
    if (flexibility < 70) return t('searchPage.flexible')
    return t('searchPage.veryFlexible')
  }
  const executedKeywords = useMemo(
    () => queryMode === 'simple'
      ? executedSimpleTerms
      : flattenKeywords(executedGroups),
    [executedGroups, executedSimpleTerms, queryMode],
  )
  const executedQueryLabel = useMemo(
    () => queryMode === 'simple' ? executedSimpleQuery : querySummary(executedGroups, executedGroupJoinOperator),
    [executedGroupJoinOperator, executedGroups, executedSimpleQuery, queryMode],
  )

  useEffect(() => {
    setQueryMode(initialMode)
    setSimpleQueryInput(initialSimpleQuery)
    setDraftGroupJoinOperator(initialGroupJoinOperator)
    const nextGroups = initialGroups.length > 0 ? initialGroups : [createKeywordGroup('AND')]
    setDraftGroups(nextGroups)
    setDraftSelectedLibraryIds(
      initialSelectedLibraryIds.length > 0 || hasExplicitNoLibraries
        ? initialSelectedLibraryIds
        : libraries.map((library) => library.id),
    )
    setDraftReadingStage(persistentSearch.readingStage)
    setDraftMetadataStatus(persistentSearch.metadataStatus)
    setDraftFavoriteOnly(persistentSearch.favoriteOnly)
    setDraftFlexibility(persistentSearch.flexibility)
    const persistedQuery = initialMode === 'simple' ? initialSimpleQuery : flattenKeywords(initialGroups).join(', ')
    setGlobalSearchQuery(persistedQuery)
    setPersistentSearch({
      query: persistedQuery,
      keywords: initialMode === 'simple' ? parseSimpleSearchTerms(initialSimpleQuery) : flattenKeywords(initialGroups),
      keywordGroups: initialMode === 'simple' ? [] : normalizeGroups(initialGroups),
      groupJoinOperator: initialMode === 'simple' ? 'AND' : initialGroupJoinOperator,
      selectedLibraryIds: initialSelectedLibraryIds,
    })
  }, [hasExplicitNoLibraries, initialGroupJoinOperator, initialGroups, initialMode, initialSelectedLibraryIds, initialSimpleQuery, libraries, persistentSearch.favoriteOnly, persistentSearch.flexibility, persistentSearch.metadataStatus, persistentSearch.readingStage, setGlobalSearchQuery, setPersistentSearch])

  const filteredDocuments = useMemo(() => {
    return documents.filter((document) => {
      if (executedSelectedLibraryIds.length > 0 && !executedSelectedLibraryIds.includes(document.libraryId)) return false
      if (readingStage !== 'all' && document.readingStage !== readingStage) return false
      if (metadataStatus !== 'all' && document.metadataStatus !== metadataStatus) return false
      if (favoriteOnly && !document.favorite) return false
      return true
    })
  }, [documents, executedSelectedLibraryIds, favoriteOnly, metadataStatus, readingStage])
  const searchableDocumentIds = useMemo(() => filteredDocuments.map((document) => document.id), [filteredDocuments])
  const searchableDocumentsById = useMemo(() => new Map(filteredDocuments.map((document) => [document.id, document])), [filteredDocuments])
  const executedSearchQuery = useMemo(() => {
    if (queryMode === 'simple') {
      return buildSimpleSearchQuery(executedSimpleQuery)
    }

    return buildSearchQuery(executedGroups, executedGroupJoinOperator)
  }, [executedGroupJoinOperator, executedGroups, executedSimpleQuery, queryMode])

  const buildQueryParams = ({
    mode,
    query,
    groups,
    groupJoin,
    libraryIds,
  }: {
    mode: 'simple' | 'complex'
    query?: string
    groups?: KeywordGroup[]
    groupJoin?: GroupJoinOperator
    libraryIds?: string[]
  }) => {
    const nextParams = new URLSearchParams()
    nextParams.set('mode', mode)
    const normalizedLibraryIds = normalizeSelectedIds(libraryIds ?? draftSelectedLibraryIds)
    if (normalizedLibraryIds.length === 0) {
      nextParams.set('libs', 'none')
    } else {
      for (const libraryId of normalizedLibraryIds) {
        nextParams.append('lib', libraryId)
      }
    }

    if (mode === 'simple') {
      const trimmedQuery = query?.trim() ?? ''
      if (trimmedQuery) {
        nextParams.set('q', trimmedQuery)
      }
      return nextParams
    }

    const preparedGroups = normalizeGroups(groups ?? [])
    if (preparedGroups.length > 0) {
      nextParams.set('go', groupJoin ?? draftGroupJoinOperator)
      for (const group of preparedGroups) {
        nextParams.append('g', encodeGroupParam(group))
      }
    }
    return nextParams
  }

  const applySimpleSearch = (nextQuery: string, navigation: 'push' | 'replace' = 'replace') => {
    const trimmedQuery = nextQuery.trim()
    const nextParams = buildQueryParams({ mode: 'simple', query: trimmedQuery })

    setGlobalSearchQuery(trimmedQuery)
    setPersistentSearch({
      query: trimmedQuery,
      keywords: parseSimpleSearchTerms(trimmedQuery),
      keywordGroups: [],
      groupJoinOperator: 'AND',
      selectedLibraryIds: normalizeSelectedIds(draftSelectedLibraryIds),
      readingStage: draftReadingStage,
      metadataStatus: draftMetadataStatus,
      favoriteOnly: draftFavoriteOnly,
      flexibility: draftFlexibility,
    })

    const href = nextParams.toString() ? `/search?${nextParams.toString()}` : '/search'
    if (navigation === 'push') {
      router.push(href)
      return
    }

    router.replace(href)
  }

  useEffect(() => {
    const runId = ++searchRunId.current

    if (!executedSearchQuery) {
      setResults([])
      setIsSearching(false)
      setSearchedCount(0)
      setTotalToSearch(0)
      setSearchStatus('')
      return
    }

    let cancelled = false

    const runSearch = async () => {
      setIsSearching(true)
      setResults([])
      setSearchedCount(0)
      setTotalToSearch(filteredDocuments.length)
      setSearchStatus(t('searchPage.preparingIndex'))
      const nextResults = await searchDocuments(executedSearchQuery, {
        documentIds: searchableDocumentIds,
        flexibility,
        limit: Math.max(filteredDocuments.length, 100),
        onProgress: (progress: SearchProgressUpdate) => {
          if (cancelled || searchRunId.current !== runId) return
          setSearchedCount(progress.processed)
          setTotalToSearch(progress.total)
          setSearchStatus(progress.detail ?? '')
        },
      })

      if (cancelled || searchRunId.current !== runId) return

      const mappedResults = nextResults.flatMap((result) => {
        const document = searchableDocumentsById.get(result.documentId)
        if (!document) return []
        const hasOccurrences = Object.values(result.occurrenceCounts ?? {}).some((count) => count > 0)
        if (!hasOccurrences && result.pageHits.length === 0) return []

        return [{
          document,
          matchedQueryTerms: result.matchedQueryTerms,
          matchedTerms: result.matchedTerms,
          occurrenceCounts: result.occurrenceCounts,
          pageHits: result.pageHits,
          preview: result.snippet ?? '',
          score: result.score,
        }] satisfies SearchResult[]
      })

      setResults(mappedResults)
      setSearchedCount(filteredDocuments.length)
      setSearchStatus(t('searchPage.resultsReady', {
        count: mappedResults.length,
        suffix: mappedResults.length === 1 ? '' : 's',
      }))
      setIsSearching(false)
    }

    void runSearch()

    return () => {
      cancelled = true
      if (searchRunId.current === runId) {
        setIsSearching(false)
        setSearchStatus('')
      }
    }
  }, [executedSearchQuery, filteredDocuments.length, flexibility, searchableDocumentIds, searchableDocumentsById, t])

  const updateGroup = (groupId: string, updates: Partial<KeywordGroup>) => {
    setDraftGroups((current) =>
      current.map((group) => (group.id === groupId ? { ...group, ...updates } : group)),
    )
  }

  const addKeywordToGroup = (groupId: string) => {
    const nextKeyword = groupInputs[groupId]?.trim() ?? ''
    if (!nextKeyword) return

    setDraftGroups((current) =>
      current.map((group) =>
        group.id === groupId
          ? {
              ...group,
              keywords: normalizeKeywords([...group.keywords, nextKeyword]),
            }
          : group,
      ),
    )
    setGroupInputs((current) => ({ ...current, [groupId]: '' }))
  }

  const removeKeywordFromGroup = (groupId: string, keyword: string) => {
    setDraftGroups((current) =>
      current.map((group) =>
        group.id === groupId
          ? {
              ...group,
              keywords: group.keywords.filter((entry) => entry !== keyword),
            }
          : group,
      ),
    )
  }

  const addGroup = () => {
    setDraftGroups((current) => [...current, createKeywordGroup('AND')])
  }

  const removeGroup = (groupId: string) => {
    setDraftGroups((current) => {
      const remaining = current.filter((group) => group.id !== groupId)
      return remaining.length > 0 ? remaining : [createKeywordGroup('AND')]
    })
    setGroupInputs((current) => {
      const next = { ...current }
      delete next[groupId]
      return next
    })
  }

  const submitSearch = () => {
    if (queryMode === 'simple') {
      applySimpleSearch(simpleQueryInput, 'push')
      return
    }

    const preparedGroups = normalizeGroups(
      draftGroups.map((group) => ({
        ...group,
        keywords: normalizeKeywords([...group.keywords, ...(groupInputs[group.id]?.trim() ? [groupInputs[group.id]] : [])]),
      })),
    )

    const flattenedKeywords = flattenKeywords(preparedGroups)
    const joined = flattenedKeywords.join(', ')

    setDraftGroups(preparedGroups.length > 0 ? preparedGroups : [createKeywordGroup('AND')])
    setGroupInputs({})
    setGlobalSearchQuery(joined)
    setPersistentSearch({
      query: joined,
      keywords: flattenedKeywords,
      keywordGroups: preparedGroups,
      groupJoinOperator: draftGroupJoinOperator,
      selectedLibraryIds: normalizeSelectedIds(draftSelectedLibraryIds),
      readingStage: draftReadingStage,
      metadataStatus: draftMetadataStatus,
      favoriteOnly: draftFavoriteOnly,
      flexibility: draftFlexibility,
    })

    if (preparedGroups.length === 0) {
      router.push('/search')
      return
    }

    const nextParams = buildQueryParams({
      mode: 'complex',
      groups: preparedGroups,
      groupJoin: draftGroupJoinOperator,
    })
    router.push(`/search?${nextParams.toString()}`)
  }

  const updateSelectedLibraries = (nextLibraryIds: string[]) => {
    setDraftSelectedLibraryIds(normalizeSelectedIds(nextLibraryIds))
  }

  const switchMode = (nextMode: 'simple' | 'complex') => {
    setQueryMode(nextMode)
    setDraftGroupJoinOperator('AND')
    setDraftGroups((current) => {
      const normalized = normalizeGroups(current)
      if (nextMode === 'simple') {
        return [createKeywordGroup('AND')]
      }
      return normalized.length > 0 ? normalized : [createKeywordGroup('AND')]
    })
    if (nextMode === 'simple') {
      setSimpleQueryInput(executedSimpleQuery || flattenKeywords(normalizeGroups(draftGroups)).join(' '))
    }
    setGroupInputs({})
  }

  return (
    <div className="p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <SearchIcon className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">{t('searchPage.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('searchPage.subtitleCompact')}</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="h-fit">
            <CardContent className="space-y-5 pt-6">
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  submitSearch()
                }}
              >
                <div className="space-y-2">
                  <SearchHelpTooltip content={t('searchPage.queryModeHelp')}>
                    <label className="text-sm font-medium">{t('searchPage.queryMode')}</label>
                  </SearchHelpTooltip>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={queryMode === 'simple' ? 'default' : 'outline'}
                      onClick={() => switchMode('simple')}
                    >
                      {t('searchPage.simple')}
                    </Button>
                    <Button
                      type="button"
                      variant={queryMode === 'complex' ? 'default' : 'outline'}
                      onClick={() => switchMode('complex')}
                    >
                      {t('searchPage.complex')}
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <SearchHelpTooltip content={t('searchPage.keywordQueryHelp')}>
                      <label className="text-sm font-medium">{t('searchPage.keywordQuery')}</label>
                    </SearchHelpTooltip>
                  </div>

                  {queryMode === 'simple' ? (
                    <div className="space-y-3 rounded-xl border p-3">
                      <SearchHelpTooltip content={t('searchPage.simpleHelp')}>
                        <label className="text-sm font-medium">{t('searchPage.quickSearch')}</label>
                      </SearchHelpTooltip>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            value={simpleQueryInput}
                            onChange={(event) => setSimpleQueryInput(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                submitSearch()
                              }
                            }}
                            className="pl-9"
                            placeholder={t('searchPage.quickSearchPlaceholder')}
                          />
                        </div>
                        <Button type="button" onClick={submitSearch} disabled={simpleQueryInput.trim().length === 0}>
                          {t('searchPage.search')}
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {queryMode === 'complex' && draftGroups.length > 1 && (
                    <div className="space-y-2 rounded-xl border p-3">
                      <SearchHelpTooltip content={draftGroupJoinOperator === 'AND' ? t('searchPage.everyGroup') : t('searchPage.anyGroup')}>
                        <label className="text-sm font-medium">{t('searchPage.betweenGroups')}</label>
                      </SearchHelpTooltip>
                      <Select value={draftGroupJoinOperator} onValueChange={(value) => setDraftGroupJoinOperator(value as GroupJoinOperator)}>
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AND">AND</SelectItem>
                          <SelectItem value="OR">OR</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {queryMode === 'complex' && draftGroups.map((group, index) => (
                    <div key={group.id} className="space-y-3 rounded-xl border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {draftGroups.length > 1 ? (
                            <SearchHelpTooltip content={group.operator === 'AND' ? t('searchPage.addKeywordsHelpAnd') : t('searchPage.addKeywordsHelpOr')}>
                              <span className="text-sm font-medium">{t('searchPage.group', { index: index + 1 })}</span>
                            </SearchHelpTooltip>
                          ) : null}
                          <Select value={group.operator} onValueChange={(value) => updateGroup(group.id, { operator: value as KeywordGroup['operator'] })}>
                            <SelectTrigger className="h-8 w-24">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="AND">AND</SelectItem>
                              <SelectItem value="OR">OR</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeGroup(group.id)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="flex gap-2">
                        <Input
                          value={groupInputs[group.id] ?? ''}
                          onChange={(event) => setGroupInputs((current) => ({ ...current, [group.id]: event.target.value }))}
                          placeholder={t('searchPage.addKeywordPlaceholder')}
                        />
                        <Button type="button" variant="outline" className="shrink-0" onClick={() => addKeywordToGroup(group.id)} disabled={!(groupInputs[group.id] ?? '').trim()}>
                          <Plus className="mr-2 h-4 w-4" />
                          {t('searchPage.add')}
                        </Button>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {group.keywords.length > 0 ? (
                          group.keywords.map((keyword) => (
                            <Badge key={`${group.id}-${keyword}`} variant="secondary" className="gap-1.5 pr-1">
                              {keyword}
                              <button type="button" onClick={() => removeKeywordFromGroup(group.id, keyword)} className="rounded-full p-0.5 hover:bg-background/70">
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))
                        ) : null}
                      </div>
                    </div>
                  ))}

                  {queryMode === 'complex' && (
                    <Button type="button" variant="outline" size="sm" onClick={addGroup} className="w-full">
                      <Plus className="mr-2 h-4 w-4" />
                      {t('searchPage.addGroup')}
                    </Button>
                  )}
                </div>

                {queryMode === 'complex' && (
                  <Button type="submit" className="w-full">
                    {t('searchPage.search')}
                  </Button>
                )}
              </form>

              <div className="space-y-2">
                <SearchHelpTooltip content={t('searchPage.flexibilityHelp')}>
                  <label className="text-sm font-medium">{t('searchPage.flexibility')}</label>
                </SearchHelpTooltip>
                <div className="rounded-lg border px-3 py-4">
                  <div className="mb-3 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{draftFlexibility < 20 ? t('searchPage.strict') : draftFlexibility < 45 ? t('searchPage.balanced') : draftFlexibility < 70 ? t('searchPage.flexible') : t('searchPage.veryFlexible')}</span>
                    <span className="font-medium">{draftFlexibility}%</span>
                  </div>
                  <Slider
                    value={[draftFlexibility]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={([value]) => setDraftFlexibility(value ?? 0)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{t('searchPage.library')}</label>
                <div className="space-y-2 rounded-xl bg-muted/55 p-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => updateSelectedLibraries(libraries.map((library) => library.id))}
                    >
                      Select all
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => updateSelectedLibraries([])}
                    >
                      Clear
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {libraries.map((library) => {
                      const checked = draftSelectedLibraryIds.includes(library.id)
                      return (
                        <label
                          key={library.id}
                          className="flex items-center gap-3 rounded-lg bg-background/70 px-3 py-2 text-sm"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(nextChecked) => {
                              updateSelectedLibraries(
                                nextChecked
                                  ? [...draftSelectedLibraryIds, library.id]
                                  : draftSelectedLibraryIds.filter((value) => value !== library.id),
                              )
                            }}
                          />
                          <span className="min-w-0 flex-1 truncate">{library.name}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{t('searchPage.readingStage')}</label>
                <Select value={draftReadingStage} onValueChange={(value) => setDraftReadingStage(value as 'all' | ReadingStage)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('searchPage.anyStage')}</SelectItem>
                    <SelectItem value="unread">{t('common.unread')}</SelectItem>
                    <SelectItem value="reading">{t('common.reading')}</SelectItem>
                    <SelectItem value="finished">{t('common.finished')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{t('searchPage.metadataQuality')}</label>
                <Select value={draftMetadataStatus} onValueChange={(value) => setDraftMetadataStatus(value as 'all' | MetadataStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('searchPage.anyStatus')}</SelectItem>
                    <SelectItem value="missing">{t('common.missing')}</SelectItem>
                    <SelectItem value="partial">{t('common.partial')}</SelectItem>
                    <SelectItem value="complete">{t('common.complete')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                type="button"
                variant={draftFavoriteOnly ? 'default' : 'outline'}
                className="w-full"
                onClick={() => setDraftFavoriteOnly((current) => !current)}
              >
                {draftFavoriteOnly ? t('searchPage.favoritesOnly') : t('searchPage.filterFavorites')}
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-4">
            {executedGroups.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3">
                <div>
                  <p className="text-sm text-muted-foreground">{t('searchPage.persistentSearch')}</p>
                  <p className="font-medium">
                    {isSearching
                      ? t('searchPage.searchingDocs', { processed: searchedCount, total: totalToSearch || filteredDocuments.length, query: executedQueryLabel })
                      : t('searchPage.resultsFor', { count: results.length, suffix: results.length === 1 ? '' : 's', query: executedQueryLabel })}
                  </p>
                  {searchStatus ? (
                    <p className="mt-1 text-sm text-muted-foreground">{searchStatus}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {isSearching && (
                    <Badge variant="secondary" className="gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {t('searchPage.searchingBadge')}
                    </Badge>
                  )}
                  <Badge variant="secondary">{flexibilityLabel(flexibility)}</Badge>
                </div>
              </div>
            ) : (
              <EmptyState
                icon={SearchIcon}
                title={t('searchPage.startTitle')}
                description={queryMode === 'simple'
                  ? t('searchPage.startDescriptionSimple')
                  : t('searchPage.startDescriptionComplex')}
              />
            )}

            {executedGroups.length > 0 && isSearching && (
              <Card>
                <CardContent className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  {searchStatus || t('searchPage.loadingFallback')}
                </CardContent>
              </Card>
            )}

            {executedGroups.length > 0 && !isSearching && results.length === 0 && (
              <EmptyState
                icon={SearchIcon}
                title={t('searchPage.noMatchesTitle')}
                description={t('searchPage.noMatchesDescription')}
              />
            )}

            {results.map(({ document, matchedTerms, occurrenceCounts, pageHits, preview }) => {
              const library = libraries.find((item) => item.id === document.libraryId)
              const readerKeyword = executedKeywords[0] ?? ''
              const primaryPageHit = pageHits[0]
              const occurrenceEntries = executedKeywords
                .map((term) => [term, occurrenceCounts[term] ?? 0] as const)
                .filter(([, count]) => count > 0)
              const readerHref = `/reader/view?id=${document.id}&query=${encodeURIComponent(readerKeyword)}${
                primaryPageHit ? `&page=${primaryPageHit.pageNumber}&matchText=${encodeURIComponent(primaryPageHit.matchedText)}&matchStart=${primaryPageHit.positions[0]?.start ?? 0}` : ''
              }&returnTo=search`

              return (
                <Card key={document.id}>
                  <CardContent className="flex flex-col gap-4 py-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <Link
                          href={readerHref}
                          className="text-lg font-semibold hover:text-primary"
                        >
                          {document.title}
                        </Link>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {document.authors.join(', ') || t('searchPage.unknownAuthor')}
                          {document.year ? ` • ${document.year}` : ''}
                          {library ? ` • ${library.name}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <ReadingStageBadge stage={document.readingStage} />
                      <MetadataStatusBadge status={document.metadataStatus} />
                      {document.tags.slice(0, 4).map((tag) => (
                        <Badge key={tag} variant="secondary">
                          {tag}
                        </Badge>
                      ))}
                      {matchedTerms.slice(0, 4).map((term) => (
                        <Badge key={`${document.id}-${term}`} variant="outline">
                          {term}
                        </Badge>
                      ))}
                      {occurrenceEntries.map(([term, count]) => (
                        <Badge key={`${document.id}-${term}-count`} variant="outline">
                          {`${term}: ${count}`}
                        </Badge>
                      ))}
                      {primaryPageHit && (
                        <Badge variant="outline">
                          {t('searchPage.page', { page: primaryPageHit.pageNumber })}
                        </Badge>
                      )}
                    </div>

                    {occurrenceEntries.length > 0 && preview.trim().length > 0 ? (
                      <p className="text-sm leading-6 text-muted-foreground">{highlightText(preview, executedKeywords)}</p>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-2">
                      <Button asChild>
                        <Link href={readerHref}>
                          {t('searchPage.openReader')}
                        </Link>
                      </Button>
                      <Button asChild variant="outline">
                        <Link href={`/documents?id=${document.id}&edit=1`}>{t('searchPage.openDetails')}</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
