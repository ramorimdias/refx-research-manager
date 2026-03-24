'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, Filter, MessageSquare, Star } from 'lucide-react'
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
import { useAppStore } from '@/lib/store'
import type { MetadataStatus, ReadingStage } from '@/lib/types'

const readingStages: { value: ReadingStage; label: string }[] = [
  { value: 'unread', label: 'Unread' },
  { value: 'reading', label: 'Reading' },
  { value: 'skimmed', label: 'Skimmed' },
  { value: 'read', label: 'Read' },
  { value: 'archived', label: 'Archived' },
]

const metadataStatuses: { value: MetadataStatus; label: string }[] = [
  { value: 'incomplete', label: 'Incomplete' },
  { value: 'partial', label: 'Partial' },
  { value: 'complete', label: 'Complete' },
  { value: 'verified', label: 'Verified' },
]

export function FilterPanel() {
  const { documents, activeLibraryId, filters, setFilters } = useAppStore()
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
    filters.hasAnnotations ? 1 : 0,
  ].reduce((sum, count) => sum + count, 0)

  const toggleReadingStage = (stage: ReadingStage) => {
    const current = filters.readingStage || []
    const updated = current.includes(stage) ? current.filter((value) => value !== stage) : [...current, stage]
    setFilters({ ...filters, readingStage: updated.length > 0 ? updated : undefined })
  }

  const toggleMetadataStatus = (status: MetadataStatus) => {
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
    <div className="w-64 shrink-0 border-r border-border">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4" />
          <span className="font-medium">Filters</span>
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5">
              {activeFilterCount}
            </Badge>
          )}
        </div>
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setFilters({})}>
            Clear
          </Button>
        )}
      </div>

      <div className="space-y-4 p-4">
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="favorite"
              checked={filters.favorite || false}
              onCheckedChange={(checked) => setFilters({ ...filters, favorite: checked ? true : undefined })}
            />
            <Label htmlFor="favorite" className="flex cursor-pointer items-center gap-2">
              <Star className="h-3.5 w-3.5 text-amber-400" />
              Favorites only
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="hasAnnotations"
              checked={filters.hasAnnotations || false}
              onCheckedChange={(checked) => setFilters({ ...filters, hasAnnotations: checked ? true : undefined })}
            />
            <Label htmlFor="hasAnnotations" className="flex cursor-pointer items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5" />
              Has annotations
            </Label>
          </div>
        </div>

        <Separator />

        <Collapsible defaultOpen>
          <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-medium">
            Reading Stage
            <ChevronDown className="h-4 w-4" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-2">
            {readingStages.map((stage) => (
              <div key={stage.value} className="flex items-center space-x-2">
                <Checkbox
                  id={`stage-${stage.value}`}
                  checked={filters.readingStage?.includes(stage.value) || false}
                  onCheckedChange={() => toggleReadingStage(stage.value)}
                />
                <Label htmlFor={`stage-${stage.value}`} className="cursor-pointer">
                  {stage.label}
                </Label>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        <Collapsible defaultOpen>
          <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-medium">
            Metadata Status
            <ChevronDown className="h-4 w-4" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-2">
            {metadataStatuses.map((status) => (
              <div key={status.value} className="flex items-center space-x-2">
                <Checkbox
                  id={`meta-${status.value}`}
                  checked={filters.metadataStatus?.includes(status.value) || false}
                  onCheckedChange={() => toggleMetadataStatus(status.value)}
                />
                <Label htmlFor={`meta-${status.value}`} className="cursor-pointer">
                  {status.label}
                </Label>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        <Collapsible defaultOpen>
          <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-medium">
            Tags
            <ChevronDown className="h-4 w-4" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-2">
            {availableTags.length > 0 ? (
              availableTags.map((tag) => (
                <div key={tag.name} className="flex items-center space-x-2">
                  <Checkbox
                    id={`tag-${tag.name}`}
                    checked={filters.tags?.includes(tag.name) || false}
                    onCheckedChange={() => toggleTag(tag.name)}
                  />
                  <Label htmlFor={`tag-${tag.name}`} className="flex w-full cursor-pointer items-center justify-between gap-2">
                    <span className="truncate">{tag.name}</span>
                    <span className="text-xs text-muted-foreground">{tag.count}</span>
                  </Label>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No local tags available.</p>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  )
}
