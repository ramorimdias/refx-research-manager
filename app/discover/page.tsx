'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Search,
  Filter,
  Star,
  FileText,
  Calendar,
  User,
  Tag,
  Building,
  X,
  ChevronDown,
  Sparkles,
  BookOpen,
  Clock,
  Hash,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { mockDocuments, mockTags, mockSavedSearches, mockLibraries } from '@/lib/mock-data'
import { ReadingStageBadge, StarRating, TagChip } from '@/components/refx/common'
import { cn } from '@/lib/utils'

export default function DiscoverPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchType, setSearchType] = useState<'all' | 'title' | 'author' | 'fulltext'>('all')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [yearRange, setYearRange] = useState({ min: '', max: '' })
  const [sortBy, setSortBy] = useState<'relevance' | 'date' | 'citations'>('relevance')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  const searchResults = searchQuery
    ? mockDocuments.filter((doc) => {
        const query = searchQuery.toLowerCase()
        switch (searchType) {
          case 'title':
            return doc.title.toLowerCase().includes(query)
          case 'author':
            return doc.authors.some((a) => a.toLowerCase().includes(query))
          case 'fulltext':
            return (
              doc.abstract?.toLowerCase().includes(query) ||
              doc.title.toLowerCase().includes(query)
            )
          default:
            return (
              doc.title.toLowerCase().includes(query) ||
              doc.authors.some((a) => a.toLowerCase().includes(query)) ||
              doc.abstract?.toLowerCase().includes(query) ||
              doc.tags.some((t) => t.toLowerCase().includes(query))
            )
        }
      })
    : []

  const filteredResults = searchResults
    .filter((doc) => {
      if (selectedTags.length > 0 && !selectedTags.some((tag) => doc.tags.includes(tag))) {
        return false
      }
      if (yearRange.min && doc.year && doc.year < parseInt(yearRange.min)) {
        return false
      }
      if (yearRange.max && doc.year && doc.year > parseInt(yearRange.max)) {
        return false
      }
      return true
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return (b.updatedAt?.getTime() || 0) - (a.updatedAt?.getTime() || 0)
        case 'citations':
          return (b.annotationCount || 0) - (a.annotationCount || 0)
        default:
          return 0
      }
    })

  const clearFilters = () => {
    setSelectedTags([])
    setYearRange({ min: '', max: '' })
  }

  const hasActiveFilters = selectedTags.length > 0 || yearRange.min || yearRange.max

  return (
    <div className="flex h-full flex-col">
      {/* Search Header */}
      <div className="border-b border-border p-6 space-y-4">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search documents, authors, topics..."
              className="h-12 pl-12 pr-4 text-lg"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select value={searchType} onValueChange={(v) => setSearchType(v as typeof searchType)}>
            <SelectTrigger className="w-36 h-12">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Fields</SelectItem>
              <SelectItem value="title">Title</SelectItem>
              <SelectItem value="author">Author</SelectItem>
              <SelectItem value="fulltext">Full Text</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={showAdvanced ? 'secondary' : 'outline'}
            className="h-12"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <Filter className="mr-2 h-4 w-4" />
            Advanced
          </Button>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="w-40 h-12">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="relevance">Relevance</SelectItem>
              <SelectItem value="date">Most Recent</SelectItem>
              <SelectItem value="citations">Most Cited</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Advanced Search Options */}
        {showAdvanced && (
          <Card>
            <CardContent className="p-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div>
                  <Label className="text-sm font-medium">Tags</Label>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {mockTags.slice(0, 6).map((tag) => (
                      <Badge
                        key={tag.id}
                        variant={selectedTags.includes(tag.name) ? 'default' : 'secondary'}
                        className="cursor-pointer"
                        onClick={() =>
                          setSelectedTags((prev) =>
                            prev.includes(tag.name)
                              ? prev.filter((t) => t !== tag.name)
                              : [...prev, tag.name]
                          )
                        }
                      >
                        {tag.name}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Year Range</Label>
                  <div className="mt-2 flex items-center gap-2">
                    <Input
                      type="number"
                      placeholder="From"
                      className="h-9"
                      value={yearRange.min}
                      onChange={(e) => setYearRange((prev) => ({ ...prev, min: e.target.value }))}
                    />
                    <span className="text-muted-foreground">-</span>
                    <Input
                      type="number"
                      placeholder="To"
                      className="h-9"
                      value={yearRange.max}
                      onChange={(e) => setYearRange((prev) => ({ ...prev, max: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Library</Label>
                  <Select>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="All libraries" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Libraries</SelectItem>
                      {mockLibraries.map((lib) => (
                        <SelectItem key={lib.id} value={lib.id}>
                          {lib.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearFilters}>
                      <X className="mr-2 h-4 w-4" />
                      Clear Filters
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Results */}
        <div className="flex-1 overflow-auto">
          {searchQuery ? (
            <div className="p-6">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {filteredResults.length} results for "{searchQuery}"
                  </p>
                  {hasActiveFilters && (
                    <div className="flex items-center gap-2 mt-2">
                      {selectedTags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="gap-1"
                        >
                          {tag}
                          <button
                            onClick={() => setSelectedTags((prev) => prev.filter((t) => t !== tag))}
                            className="ml-1 hover:text-foreground"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {filteredResults.length === 0 ? (
                <div className="text-center py-16">
                  <Search className="mx-auto h-12 w-12 text-muted-foreground/30 mb-4" />
                  <h3 className="font-medium mb-2">No results found</h3>
                  <p className="text-sm text-muted-foreground">
                    Try adjusting your search terms or filters
                  </p>
                </div>
              ) : (
                <div className={viewMode === 'list' ? 'space-y-4' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'}>
                  {filteredResults.map((doc) => (
                    <Link key={doc.id} href={`/documents/${doc.id}`}>
                      <Card className="hover:border-primary/50 transition-colors h-full">
                        <CardContent className={viewMode === 'list' ? 'p-4' : 'p-4'}>
                          <div className={viewMode === 'list' ? 'flex items-start gap-4' : 'flex flex-col gap-3'}>
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                              <FileText className="h-6 w-6 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <h3 className="font-medium line-clamp-2">{doc.title}</h3>
                                  <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                                    {doc.authors.slice(0, 2).join(', ')}
                                    {doc.authors.length > 2 && ' et al.'}
                                  </p>
                                </div>
                                <ReadingStageBadge stage={doc.readingStage} />
                              </div>
                              {doc.abstract && (
                                <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                                  {doc.abstract}
                                </p>
                              )}
                              <div className={viewMode === 'list' ? 'flex items-center gap-4 mt-3 text-xs text-muted-foreground' : 'flex flex-col gap-2 mt-3'}>
                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                  {doc.year && (
                                    <span className="flex items-center gap-1">
                                      <Calendar className="h-3 w-3" />
                                      {doc.year}
                                    </span>
                                  )}
                                  {doc.venue && (
                                    <span className="flex items-center gap-1 truncate">
                                      <Building className="h-3 w-3" />
                                      {doc.venue}
                                    </span>
                                  )}
                                </div>
                                <div className="flex gap-1 flex-wrap">
                                  {doc.tags.slice(0, viewMode === 'list' ? 3 : 2).map((tag) => (
                                    <Badge key={tag} variant="secondary" className="text-xs">
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="p-6">
              {/* Saved Searches */}
              <div className="mb-8">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Star className="h-5 w-5 text-primary" />
                  Saved Searches
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {mockSavedSearches.map((search) => (
                    <Card
                      key={search.id}
                      className="cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => setSearchQuery(search.query)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <h3 className="font-medium">{search.name}</h3>
                          <Badge variant="secondary">{search.resultCount}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 truncate">
                          {search.query || 'Filter-based search'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">
                          Last run {search.lastRun?.toLocaleDateString()}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Suggested Topics */}
              <div className="mb-8">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Hash className="h-5 w-5 text-primary" />
                  Popular Tags
                </h2>
                <div className="flex flex-wrap gap-2">
                  {mockTags.map((tag) => (
                    <Badge
                      key={tag.id}
                      variant="secondary"
                      className="cursor-pointer hover:bg-secondary/80 gap-1.5 py-1.5 px-3"
                      onClick={() => setSearchQuery(tag.name)}
                    >
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      {tag.name}
                      <span className="text-muted-foreground ml-1">({tag.documentCount})</span>
                    </Badge>
                  ))}
                </div>
              </div>

              {/* AI Search Placeholder */}
              <Card className="border-dashed">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Semantic Search
                    <Badge variant="secondary" className="text-xs">Coming Soon</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Search using natural language queries like "papers about attention mechanisms
                    in transformers" or "recent work on climate modeling uncertainty".
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Related Documents Panel */}
        {searchQuery && filteredResults.length > 0 && (
          <div className="w-72 shrink-0 border-l border-border overflow-auto hidden lg:block">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold text-sm">Related Suggestions</h3>
            </div>
            <div className="p-4">
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Related Tags
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {mockTags.slice(0, 5).map((tag) => (
                      <Badge
                        key={tag.id}
                        variant="secondary"
                        className="cursor-pointer text-xs"
                        onClick={() => setSearchQuery(tag.name)}
                      >
                        {tag.name}
                      </Badge>
                    ))}
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Similar Searches
                  </h4>
                  <div className="space-y-2">
                    {['attention mechanism', 'transformer architecture', 'deep learning'].map(
                      (suggestion) => (
                        <button
                          key={suggestion}
                          onClick={() => setSearchQuery(suggestion)}
                          className="block w-full text-left text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {suggestion}
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
