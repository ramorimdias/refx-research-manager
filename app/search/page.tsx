'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Filter, Loader2, Plus, Search as SearchIcon, X } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { EmptyState, MetadataStatusBadge, ReadingStageBadge } from '@/components/refx/common'
import { PageHeader } from '@/components/refx/page-header'
import type { KeywordGroup, MetadataStatus, ReadingStage } from '@/lib/types'
import { searchDocuments, type DocumentSearchPageHit, type DocumentSearchQuery, type SearchProgressUpdate } from '@/lib/services/document-search-service'
import { useT } from '@/lib/localization'
import type { Document } from '@/lib/types'
import { saveHomeRecentSearch } from '@/lib/home-dashboard'
import { useDocumentStore } from '@/lib/stores/document-store'
import { useLibraryStore } from '@/lib/stores/library-store'
import { useUiStore } from '@/lib/stores/ui-store'

type SearchResult = {
  document: Document
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

function normalizeSelectedReadingStages(values: ReadingStage[]) {
  return Array.from(new Set(values))
}

function normalizeSelectedMetadataStatuses(values: MetadataStatus[]) {
  return Array.from(new Set(values))
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

function SearchTourDemo() {
  return (
    <div className="p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <SearchIcon className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Search</h1>
            <p className="text-sm text-muted-foreground">
              Explore your library with simple queries, grouped keywords, and focused filters.
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="h-fit" data-tour-id="search-query">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SearchIcon className="h-5 w-5" />
                Search Workspace
              </CardTitle>
              <CardDescription>
                This demo view keeps the tour step stable while showing how search is organized.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium">Query Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button">Simple</Button>
                  <Button type="button" variant="outline">Complex</Button>
                </div>
              </div>

              <div className="space-y-3 rounded-xl border p-3">
                <label className="text-sm font-medium">Quick Search</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value="climate policy adaptation"
                      readOnly
                      className="pl-9"
                    />
                  </div>
                  <Button type="button">Search</Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Try a quick query here, or switch to grouped logic when you need more control.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Filters</label>
                <div className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
                  Library, reading stage, metadata quality, favorites, and search flexibility all live in this panel.
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4" data-tour-id="search-results">
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div>
                  <p className="text-sm text-muted-foreground">Sample results</p>
                  <p className="font-medium">2 matches for “climate policy adaptation”</p>
                </div>
                <Badge variant="secondary" className="gap-1.5">
                  <Filter className="h-3.5 w-3.5" />
                  Balanced
                </Badge>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4 py-6">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold">Policy Pathways for Urban Climate Adaptation</h2>
                  <p className="text-sm text-muted-foreground">Jane Doe, Alex Silva • Research Library</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">Finished</Badge>
                  <Badge variant="secondary">Complete metadata</Badge>
                  <Badge variant="outline">adaptation: 8</Badge>
                  <Badge variant="outline">policy: 5</Badge>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  Preview snippets, page hits, and quick actions appear here after you run a search.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button">Open Reader</Button>
                  <Button type="button" variant="outline">Open Details</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

type MultiSelectOption = {
  value: string
  label: string
}

function MultiSelectDropdown({
  label,
  options,
  selectedValues,
  onChange,
  allLabel,
  t,
}: {
  label: string
  options: MultiSelectOption[]
  selectedValues: string[]
  onChange: (values: string[]) => void
  allLabel: string
  t: ReturnType<typeof useT>
}) {
  const selectedSet = new Set(selectedValues)
  const selectedOptions = options.filter((option) => selectedSet.has(option.value))
  const triggerLabel = selectedOptions.length === 0
    ? allLabel
    : selectedOptions.length === 1
      ? selectedOptions[0]?.label ?? allLabel
      : t('searchPage.selectedCount', { count: selectedOptions.length })

  return (
    <Popover modal={false}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="w-full justify-between font-normal">
          <span className="truncate">{triggerLabel}</span>
          <Badge variant="secondary" className="ml-2 shrink-0">
            {selectedOptions.length === 0 ? t('searchPage.allShort') : selectedOptions.length}
          </Badge>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-3" align="start">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{label}</p>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => onChange(options.map((option) => option.value))}>
                {t('searchPage.selectAll')}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => onChange([])}>
                {t('searchPage.clearSelection')}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {options.map((option) => {
              const checked = selectedSet.has(option.value)
              return (
                <label
                  key={option.value}
                  className="flex items-center gap-3 rounded-lg bg-muted/55 px-3 py-2 text-sm"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(nextChecked) => {
                      onChange(
                        nextChecked
                          ? [...selectedValues, option.value]
                          : selectedValues.filter((value) => value !== option.value),
                      )
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                </label>
              )
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
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

function RealSearchPage() {
  const t = useT()
  const router = useRouter()
  const params = useSearchParams()
  const paramString = params.toString()
  const documents = useDocumentStore((state) => state.documents)
  const libraries = useLibraryStore((state) => state.libraries)
  const setGlobalSearchQuery = useUiStore((state) => state.setGlobalSearchQuery)
  const persistentSearch = useUiStore((state) => state.persistentSearch)
  const setPersistentSearch = useUiStore((state) => state.setPersistentSearch)
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
  const [draftReadingStage, setDraftReadingStage] = useState<ReadingStage[]>(persistentSearch.readingStage)
  const [draftMetadataStatus, setDraftMetadataStatus] = useState<MetadataStatus[]>(persistentSearch.metadataStatus)
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
      if (readingStage.length > 0 && !readingStage.includes(document.readingStage)) return false
      if (metadataStatus.length > 0 && !metadataStatus.includes(document.metadataStatus)) return false
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
      readingStage: normalizeSelectedReadingStages(draftReadingStage),
      metadataStatus: normalizeSelectedMetadataStatuses(draftMetadataStatus),
      favoriteOnly: draftFavoriteOnly,
      flexibility: draftFlexibility,
    })

    const href = nextParams.toString() ? `/search?${nextParams.toString()}` : '/search'
    if (navigation === 'push' && trimmedQuery) {
      saveHomeRecentSearch({ label: trimmedQuery, href, mode: 'simple' })
    }
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
      readingStage: normalizeSelectedReadingStages(draftReadingStage),
      metadataStatus: normalizeSelectedMetadataStatuses(draftMetadataStatus),
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
    saveHomeRecentSearch({
      label: querySummary(preparedGroups, draftGroupJoinOperator),
      href: `/search?${nextParams.toString()}`,
      mode: 'complex',
    })
    router.push(`/search?${nextParams.toString()}`)
  }

  const updateSelectedLibraries = (nextLibraryIds: string[]) => {
    setDraftSelectedLibraryIds(normalizeSelectedIds(nextLibraryIds))
  }

  const updateSelectedReadingStages = (nextReadingStages: ReadingStage[]) => {
    setDraftReadingStage(normalizeSelectedReadingStages(nextReadingStages))
  }

  const updateSelectedMetadataStatuses = (nextMetadataStatuses: MetadataStatus[]) => {
    setDraftMetadataStatus(normalizeSelectedMetadataStatuses(nextMetadataStatuses))
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

  const libraryFilterOptions = useMemo(
    () => libraries.map((library) => ({ value: library.id, label: library.name })),
    [libraries],
  )
  const readingStageOptions = useMemo<MultiSelectOption[]>(
    () => [
      { value: 'unread', label: t('common.unread') },
      { value: 'reading', label: t('common.reading') },
      { value: 'finished', label: t('common.finished') },
    ],
    [t],
  )
  const metadataStatusOptions = useMemo<MultiSelectOption[]>(
    () => [
      { value: 'missing', label: t('common.missing') },
      { value: 'partial', label: t('common.partial') },
      { value: 'complete', label: t('common.complete') },
    ],
    [t],
  )

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 p-4 md:p-6">
        <PageHeader
          icon={<SearchIcon className="h-6 w-6" />}
          title={t('searchPage.title')}
          subtitle={t('searchPage.subtitleCompact')}
        />

        <div className="grid min-h-0 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="h-fit" data-tour-id="search-query">
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
                      data-tour-id="search-simple-button"
                    >
                      {t('searchPage.simple')}
                    </Button>
                    <Button
                      type="button"
                      variant={queryMode === 'complex' ? 'default' : 'outline'}
                      onClick={() => switchMode('complex')}
                      data-tour-id="search-complex-button"
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

              <div className="space-y-2" data-tour-id="search-filters">
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
                <MultiSelectDropdown
                  label={t('searchPage.library')}
                  options={libraryFilterOptions}
                  selectedValues={draftSelectedLibraryIds}
                  onChange={updateSelectedLibraries}
                  allLabel={t('libraries.allLibraries')}
                  t={t}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{t('searchPage.readingStage')}</label>
                <MultiSelectDropdown
                  label={t('searchPage.readingStage')}
                  options={readingStageOptions}
                  selectedValues={draftReadingStage}
                  onChange={(values) => updateSelectedReadingStages(values as ReadingStage[])}
                  allLabel={t('searchPage.anyStage')}
                  t={t}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{t('searchPage.metadataQuality')}</label>
                <MultiSelectDropdown
                  label={t('searchPage.metadataQuality')}
                  options={metadataStatusOptions}
                  selectedValues={draftMetadataStatus}
                  onChange={(values) => updateSelectedMetadataStatuses(values as MetadataStatus[])}
                  allLabel={t('searchPage.anyStatus')}
                  t={t}
                />
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

          <div className="space-y-4" data-tour-id="search-results">
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
  )
}

export default function SearchPage() {
  return <RealSearchPage />
}
