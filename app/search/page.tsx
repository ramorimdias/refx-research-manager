'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Filter, Loader2, Plus, Search as SearchIcon, X } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { EmptyState, MetadataStatusBadge, ReadingStageBadge } from '@/components/refx/common'
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value'
import { useAppStore } from '@/lib/store'
import type { KeywordGroup, MetadataStatus, ReadingStage } from '@/lib/types'
import { searchDocuments, type DocumentSearchPageHit, type DocumentSearchQuery } from '@/lib/services/document-search-service'

type SearchResult = {
  document: ReturnType<typeof useAppStore.getState>['documents'][number]
  matchedQueryTerms: string[] 
  matchedTerms: string[]
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

function flexibilityLabel(flexibility: number) {
  if (flexibility < 20) return 'Strict'
  if (flexibility < 45) return 'Balanced'
  if (flexibility < 70) return 'Flexible'
  return 'Very flexible'
}

export default function SearchPage() {
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
  const [queryMode, setQueryMode] = useState<'simple' | 'complex'>(initialMode)
  const [simpleQueryInput, setSimpleQueryInput] = useState(initialSimpleQuery)
  const [draftGroups, setDraftGroups] = useState<KeywordGroup[]>(initialGroups.length > 0 ? initialGroups : [createKeywordGroup('AND')])
  const [draftGroupJoinOperator, setDraftGroupJoinOperator] = useState<GroupJoinOperator>(initialGroupJoinOperator)
  const [groupInputs, setGroupInputs] = useState<Record<string, string>>({})
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchedCount, setSearchedCount] = useState(0)
  const [totalToSearch, setTotalToSearch] = useState(0)
  const searchRunId = useRef(0)
  const debouncedSimpleQuery = useDebouncedValue(simpleQueryInput.trim(), 300)

  const selectedLibraryId = persistentSearch.selectedLibraryId
  const readingStage = persistentSearch.readingStage
  const metadataStatus = persistentSearch.metadataStatus
  const favoriteOnly = persistentSearch.favoriteOnly
  const flexibility = persistentSearch.flexibility
  const executedGroups = useMemo(() => normalizeGroups(initialGroups), [initialGroups])
  const executedGroupJoinOperator = useMemo(() => initialGroupJoinOperator, [initialGroupJoinOperator])
  const executedSimpleQuery = useMemo(() => initialSimpleQuery.trim(), [initialSimpleQuery])
  const executedKeywords = useMemo(
    () => queryMode === 'simple'
      ? normalizeKeywords(executedSimpleQuery.split(/\s+/))
      : flattenKeywords(executedGroups),
    [executedGroups, executedSimpleQuery, queryMode],
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
    const persistedQuery = initialMode === 'simple' ? initialSimpleQuery : flattenKeywords(initialGroups).join(', ')
    setGlobalSearchQuery(persistedQuery)
    setPersistentSearch({
      query: persistedQuery,
      keywords: initialMode === 'simple' ? normalizeKeywords(initialSimpleQuery.split(/\s+/)) : flattenKeywords(initialGroups),
      keywordGroups: initialMode === 'simple' ? [] : normalizeGroups(initialGroups),
      groupJoinOperator: initialMode === 'simple' ? 'AND' : initialGroupJoinOperator,
    })
  }, [initialGroupJoinOperator, initialGroups, initialMode, initialSimpleQuery, setGlobalSearchQuery, setPersistentSearch])

  const filteredDocuments = useMemo(() => {
    return documents.filter((document) => {
      if (selectedLibraryId !== 'all' && document.libraryId !== selectedLibraryId) return false
      if (readingStage !== 'all' && document.readingStage !== readingStage) return false
      if (metadataStatus !== 'all' && document.metadataStatus !== metadataStatus) return false
      if (favoriteOnly && !document.favorite) return false
      return true
    })
  }, [documents, favoriteOnly, metadataStatus, readingStage, selectedLibraryId])
  const searchableDocumentIds = useMemo(() => filteredDocuments.map((document) => document.id), [filteredDocuments])
  const searchableDocumentsById = useMemo(() => new Map(filteredDocuments.map((document) => [document.id, document])), [filteredDocuments])
  const executedSearchQuery = useMemo(() => {
    if (queryMode === 'simple') {
      return executedSimpleQuery || null
    }

    return buildSearchQuery(executedGroups, executedGroupJoinOperator)
  }, [executedGroupJoinOperator, executedGroups, executedSimpleQuery, queryMode])

  const applySimpleSearch = (nextQuery: string, navigation: 'push' | 'replace' = 'replace') => {
    const trimmedQuery = nextQuery.trim()
    const nextParams = new URLSearchParams()
    nextParams.set('mode', 'simple')
    if (trimmedQuery) {
      nextParams.set('q', trimmedQuery)
    }

    setGlobalSearchQuery(trimmedQuery)
    setPersistentSearch({
      query: trimmedQuery,
      keywords: normalizeKeywords(trimmedQuery.split(/\s+/)),
      keywordGroups: [],
      groupJoinOperator: 'AND',
    })

    const href = nextParams.toString() ? `/search?${nextParams.toString()}` : '/search'
    if (navigation === 'push') {
      router.push(href)
      return
    }

    router.replace(href)
  }

  useEffect(() => {
    if (queryMode !== 'simple') return
    if (debouncedSimpleQuery === executedSimpleQuery) return
    applySimpleSearch(debouncedSimpleQuery, 'replace')
  }, [debouncedSimpleQuery, executedSimpleQuery, queryMode])

  useEffect(() => {
    const runId = ++searchRunId.current

    if (!executedSearchQuery) {
      setResults([])
      setIsSearching(false)
      setSearchedCount(0)
      setTotalToSearch(0)
      return
    }

    let cancelled = false

    const runSearch = async () => {
      setIsSearching(true)
      setResults([])
      setSearchedCount(0)
      setTotalToSearch(filteredDocuments.length)
      const nextResults = await searchDocuments(executedSearchQuery, {
        documentIds: searchableDocumentIds,
        flexibility,
        limit: Math.max(filteredDocuments.length, 100),
      })

      if (cancelled || searchRunId.current !== runId) return

      const mappedResults = nextResults.flatMap((result) => {
        const document = searchableDocumentsById.get(result.documentId)
        if (!document) return []

        return [{
          document,
          matchedQueryTerms: result.matchedQueryTerms,
          matchedTerms: result.matchedTerms,
          pageHits: result.pageHits,
          preview: result.snippet ?? '',
          score: result.score,
        }] satisfies SearchResult[]
      })

      setResults(mappedResults)
      setSearchedCount(filteredDocuments.length)
      setIsSearching(false)
    }

    void runSearch()

    return () => {
      cancelled = true
      if (searchRunId.current === runId) {
        setIsSearching(false)
      }
    }
  }, [executedSearchQuery, filteredDocuments.length, flexibility, searchableDocumentIds, searchableDocumentsById])

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
    })

    if (preparedGroups.length === 0) {
      router.push('/search')
      return
    }

    const nextParams = new URLSearchParams()
    nextParams.set('mode', 'complex')
    nextParams.set('go', draftGroupJoinOperator)
    for (const group of preparedGroups) {
      nextParams.append('g', encodeGroupParam(group))
    }
    router.push(`/search?${nextParams.toString()}`)
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
            <h1 className="text-2xl font-semibold">Search</h1>
            <p className="text-sm text-muted-foreground">Indexed full-library search backed by the local MiniSearch index.</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Advanced Filters
              </CardTitle>
              <CardDescription>Build grouped keyword queries with AND and OR logic, then run them across the selected library scope.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  submitSearch()
                }}
              >
                <div className="space-y-2">
                  <label className="text-sm font-medium">Query mode</label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={queryMode === 'simple' ? 'default' : 'outline'}
                      onClick={() => switchMode('simple')}
                    >
                      Simple
                    </Button>
                    <Button
                      type="button"
                      variant={queryMode === 'complex' ? 'default' : 'outline'}
                      onClick={() => switchMode('complex')}
                    >
                      Complex
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Keyword query</label>
                    {queryMode === 'complex' && (
                      <Button type="button" variant="outline" size="sm" onClick={addGroup}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add group
                      </Button>
                    )}
                  </div>

                  {queryMode === 'simple' ? (
                    <div className="space-y-3 rounded-xl border p-3">
                      <label className="text-sm font-medium">Quick search</label>
                      <div className="relative">
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
                          placeholder="Search the local full-text index"
                        />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Results update automatically after a short pause and come from the local MiniSearch index.
                      </p>
                    </div>
                  ) : null}

                  {queryMode === 'complex' && draftGroups.length > 1 && (
                    <div className="space-y-2 rounded-xl border p-3">
                      <label className="text-sm font-medium">Between groups</label>
                      <Select value={draftGroupJoinOperator} onValueChange={(value) => setDraftGroupJoinOperator(value as GroupJoinOperator)}>
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AND">AND</SelectItem>
                          <SelectItem value="OR">OR</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {draftGroupJoinOperator === 'AND'
                          ? 'A document must satisfy every group.'
                          : 'A document can satisfy any one of the groups.'}
                      </p>
                    </div>
                  )}

                  {queryMode === 'complex' && draftGroups.map((group, index) => (
                    <div key={group.id} className="space-y-3 rounded-xl border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{`Group ${index + 1}`}</span>
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
                          placeholder={`Add a keyword to this ${group.operator} group`}
                        />
                        <Button type="button" variant="outline" className="shrink-0" onClick={() => addKeywordToGroup(group.id)} disabled={!(groupInputs[group.id] ?? '').trim()}>
                          <Plus className="mr-2 h-4 w-4" />
                          Add
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
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            {`Add one or more keywords. This group matches when ${group.operator === 'AND' ? 'every keyword is found.' : 'any keyword is found.'}`}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {queryMode === 'complex' && (
                  <Button type="submit" className="w-full">
                    Search
                  </Button>
                )}
              </form>

              <div className="space-y-2">
                <label className="text-sm font-medium">Flexibility</label>
                <div className="rounded-lg border px-3 py-4">
                  <div className="mb-3 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{flexibilityLabel(flexibility)}</span>
                    <span className="font-medium">{flexibility}%</span>
                  </div>
                  <Slider
                    value={[flexibility]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={([value]) => setPersistentSearch({ flexibility: value ?? 0 })}
                  />
                  <p className="mt-3 text-xs text-muted-foreground">
                    Higher flexibility allows closer variants such as misspellings, broken words across line wraps, and near matches.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Library</label>
                <Select value={selectedLibraryId} onValueChange={(value) => setPersistentSearch({ selectedLibraryId: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="All libraries" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All libraries</SelectItem>
                    {libraries.map((library) => (
                      <SelectItem key={library.id} value={library.id}>
                        {library.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Reading stage</label>
                <Select value={readingStage} onValueChange={(value) => setPersistentSearch({ readingStage: value as 'all' | ReadingStage })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any stage</SelectItem>
                    <SelectItem value="unread">Unread</SelectItem>
                    <SelectItem value="reading">Reading</SelectItem>
                    <SelectItem value="skimmed">Skimmed</SelectItem>
                    <SelectItem value="read">Read</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Metadata quality</label>
                <Select value={metadataStatus} onValueChange={(value) => setPersistentSearch({ metadataStatus: value as 'all' | MetadataStatus })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any status</SelectItem>
                    <SelectItem value="missing">Missing</SelectItem>
                    <SelectItem value="partial">Partial</SelectItem>
                    <SelectItem value="complete">Complete</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                type="button"
                variant={favoriteOnly ? 'default' : 'outline'}
                className="w-full"
                onClick={() => setPersistentSearch({ favoriteOnly: !favoriteOnly })}
              >
                {favoriteOnly ? 'Showing favorites only' : 'Filter to favorites'}
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-4">
            {executedGroups.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3">
                <div>
                  <p className="text-sm text-muted-foreground">Persistent indexed search</p>
                  <p className="font-medium">
                    {isSearching
                      ? `Searching ${searchedCount}/${totalToSearch || filteredDocuments.length} documents for ${executedQueryLabel}`
                      : `${results.length} result${results.length === 1 ? '' : 's'} for ${executedQueryLabel}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {isSearching && (
                    <Badge variant="secondary" className="gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Searching
                    </Badge>
                  )}
                  <Badge variant="secondary">{flexibilityLabel(flexibility)}</Badge>
                </div>
              </div>
            ) : (
              <EmptyState
                icon={SearchIcon}
                title="Start a Search"
                description={queryMode === 'simple'
                  ? 'Type into the search box to query your local indexed library.'
                  : 'Add one or more keyword groups and press Search to scan your full library.'}
              />
            )}

            {executedGroups.length > 0 && isSearching && (
              <Card>
                <CardContent className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Querying the local MiniSearch index and resolving snippets from stored extracted text.
                </CardContent>
              </Card>
            )}

            {executedGroups.length > 0 && !isSearching && results.length === 0 && (
              <EmptyState
                icon={SearchIcon}
                title="No matching documents"
                description="Try increasing flexibility or broadening the filters."
              />
            )}

            {results.map(({ document, matchedTerms, pageHits, preview, score }) => {
              const library = libraries.find((item) => item.id === document.libraryId)
              const readerKeyword = executedKeywords[0] ?? ''
              const primaryPageHit = pageHits[0]
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
                          {document.authors.join(', ') || 'Unknown author'}
                          {document.year ? ` • ${document.year}` : ''}
                          {library ? ` • ${library.name}` : ''}
                        </p>
                      </div>
                      <Badge variant="outline" className="shrink-0">
                        Relevance {score}%
                      </Badge>
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
                      {primaryPageHit && (
                        <Badge variant="outline">
                          Page {primaryPageHit.pageNumber}
                        </Badge>
                      )}
                    </div>

                    <p className="text-sm leading-6 text-muted-foreground">{highlightText(preview, executedKeywords)}</p>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button asChild>
                        <Link href={readerHref}>
                          Open in Reader
                        </Link>
                      </Button>
                      <Button asChild variant="outline">
                        <Link href={`/documents?id=${document.id}&edit=1`}>Open Details</Link>
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
