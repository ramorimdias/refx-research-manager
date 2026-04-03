'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, Filter, MessageSquare, Star, StickyNote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import { useDocumentStore } from '@/lib/stores/document-store'
import { useLibraryStore } from '@/lib/stores/library-store'
import { useUiStore } from '@/lib/stores/ui-store'
import type { LibraryMetadataState, ReadingStage } from '@/lib/types'
import { useT } from '@/lib/localization'

const readingStages: { value: ReadingStage; label: string }[] = [
  { value: 'unread', label: 'Unread' },
  { value: 'reading', label: 'Reading' },
  { value: 'finished', label: 'Finished' },
]

const metadataStatuses: { value: LibraryMetadataState; label: string }[] = [
  { value: 'missing', label: 'Missing' },
  { value: 'fetch_possible', label: 'Fetch Possible' },
  { value: 'missing_doi', label: 'Missing DOI' },
  { value: 'complete', label: 'Complete' },
]

export function FilterPanel() {
  const t = useT()
  const documents = useDocumentStore((state) => state.documents)
  const activeLibraryId = useLibraryStore((state) => state.activeLibraryId)
  const filters = useUiStore((state) => state.filters)
  const setFilters = useUiStore((state) => state.setFilters)
  const [isOpen] = useState(true)

  const availableTags = useMemo(() => {
    const visibleDocuments = activeLibraryId ? documents.filter((doc) => doc.libraryId === activeLibraryId) : documents
    const counts = visibleDocuments.reduce<Record<string, number>>((acc, doc) => {
      doc.tags.forEach((tag) => {
        acc[tag] = (acc[tag] ?? 0) + 1
      })
      return acc
    }, {})

    return Object.entries(counts)
      .sort((left, right) => right[1] - left[1])
      .map(([name, count]) => ({ name, count }))
  }, [activeLibraryId, documents])

  const activeFilterCount = [
    filters.tags?.length || 0,
    filters.readingStage?.length || 0,
    filters.metadataStatus?.length || 0,
    filters.favorite ? 1 : 0,
    filters.hasComments ? 1 : 0,
    filters.hasNotes ? 1 : 0,
  ].reduce((sum, count) => sum + count, 0)

  const toggleReadingStage = (stage: ReadingStage) => {
    const current = filters.readingStage || []
    const updated = current.includes(stage) ? current.filter((value) => value !== stage) : [...current, stage]
    setFilters({ ...filters, readingStage: updated.length > 0 ? updated : undefined })
  }

  const toggleMetadataStatus = (status: LibraryMetadataState) => {
    const current = filters.metadataStatus || []
    const updated = current.includes(status) ? current.filter((value) => value !== status) : [...current, status]
    setFilters({ ...filters, metadataStatus: updated.length > 0 ? updated : undefined })
  }

  const toggleTag = (tag: string) => {
    const current = filters.tags || []
    const updated = current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag]
    setFilters({ ...filters, tags: updated.length > 0 ? updated : undefined })
  }

  if (!isOpen) return null

  return (
    <div className="w-64 shrink-0 bg-muted/65 backdrop-blur">
      <div className="flex items-center justify-between border-b border-transparent px-4 py-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{t('libraries.filters')}</span>
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="h-5 rounded-full px-1.5 text-[11px]">
              {activeFilterCount}
            </Badge>
          )}
        </div>
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setFilters({})}>
            {t('libraries.clearFilters')}
          </Button>
        )}
      </div>

      <div className="space-y-4 p-4">
        <div className="space-y-3 rounded-xl border border-transparent bg-card/80 p-3 shadow-sm">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="favorite"
              className="dark:border-slate-500 dark:bg-slate-700/80 dark:data-[state=checked]:border-primary dark:data-[state=checked]:bg-primary"
              checked={filters.favorite || false}
              onCheckedChange={(checked) => setFilters({ ...filters, favorite: checked ? true : undefined })}
            />
            <Label htmlFor="favorite" className="flex cursor-pointer items-center gap-2">
              <Star className="h-3.5 w-3.5 text-amber-400" />
              {t('searchPage.filterFavorites')}
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="hasComments"
              className="dark:border-slate-500 dark:bg-slate-700/80 dark:data-[state=checked]:border-primary dark:data-[state=checked]:bg-primary"
              checked={filters.hasComments || false}
              onCheckedChange={(checked) => setFilters({ ...filters, hasComments: checked ? true : undefined })}
            />
            <Label htmlFor="hasComments" className="flex cursor-pointer items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5" />
              {t('libraries.hasComments')}
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="hasNotes"
              className="dark:border-slate-500 dark:bg-slate-700/80 dark:data-[state=checked]:border-primary dark:data-[state=checked]:bg-primary"
              checked={filters.hasNotes || false}
              onCheckedChange={(checked) => setFilters({ ...filters, hasNotes: checked ? true : undefined })}
            />
            <Label htmlFor="hasNotes" className="flex cursor-pointer items-center gap-2">
              <StickyNote className="h-3.5 w-3.5" />
              {t('libraries.hasNotes')}
            </Label>
          </div>
        </div>

        <Separator />

        <Collapsible defaultOpen>
          <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-medium text-foreground">
            {t('searchPage.readingStage')}
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-2 rounded-xl border border-transparent bg-card/80 p-3 shadow-sm">
            {readingStages.map((stage) => (
              <div key={stage.value} className="flex items-center space-x-2">
                <Checkbox
                  id={`stage-${stage.value}`}
                  className="dark:border-slate-500 dark:bg-slate-700/80 dark:data-[state=checked]:border-primary dark:data-[state=checked]:bg-primary"
                  checked={filters.readingStage?.includes(stage.value) || false}
                  onCheckedChange={() => toggleReadingStage(stage.value)}
                />
                <Label htmlFor={`stage-${stage.value}`} className="cursor-pointer">
                  {t(`common.${stage.value}`)}
                </Label>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        <Collapsible defaultOpen>
          <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-medium text-foreground">
            {t('searchPage.metadataQuality')}
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-2 rounded-xl border border-transparent bg-card/80 p-3 shadow-sm">
            {metadataStatuses.map((status) => (
              <div key={status.value} className="flex items-center space-x-2">
                <Checkbox
                  id={`meta-${status.value}`}
                  className="dark:border-slate-500 dark:bg-slate-700/80 dark:data-[state=checked]:border-primary dark:data-[state=checked]:bg-primary"
                  checked={filters.metadataStatus?.includes(status.value) || false}
                  onCheckedChange={() => toggleMetadataStatus(status.value)}
                />
                <Label htmlFor={`meta-${status.value}`} className="cursor-pointer">
                  {status.value === 'fetch_possible'
                    ? t('documentTable.fetchPossible')
                    : status.value === 'missing_doi'
                      ? t('libraries.missingDoi')
                      : t(`common.${status.value}`)}
                </Label>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        <Collapsible defaultOpen>
          <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-medium text-foreground">
            {t('libraries.tags')}
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-2 rounded-xl border border-transparent bg-card/80 p-3 shadow-sm">
            {availableTags.length > 0 ? (
              availableTags.map((tag) => (
                <div key={tag.name} className="flex min-w-0 items-center space-x-2 overflow-hidden">
                  <Checkbox
                    id={`tag-${tag.name}`}
                    className="dark:border-slate-500 dark:bg-slate-700/80 dark:data-[state=checked]:border-primary dark:data-[state=checked]:bg-primary"
                    checked={filters.tags?.includes(tag.name) || false}
                    onCheckedChange={() => toggleTag(tag.name)}
                  />
                  <Label htmlFor={`tag-${tag.name}`} className="flex min-w-0 w-full cursor-pointer items-center justify-between gap-2 overflow-hidden">
                    <span className="min-w-0 truncate">{tag.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{tag.count}</span>
                  </Label>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">{t('libraries.noLocalTags')}</p>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  )
}
