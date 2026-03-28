'use client'

import { Search, Target, ZoomIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import type {
  GraphColorMode,
  GraphNeighborhoodDepth,
  GraphRelationFilter,
  GraphScopeMode,
  GraphSizeMode,
} from '@/lib/services/document-graph-view-service'
import type { Document } from '@/lib/types'

type DocumentGraphControlsProps = {
  relationFilter: GraphRelationFilter
  onRelationFilterChange: (value: GraphRelationFilter) => void
  colorMode: GraphColorMode
  onColorModeChange: (value: GraphColorMode) => void
  sizeMode: GraphSizeMode
  onSizeModeChange: (value: GraphSizeMode) => void
  scopeMode: GraphScopeMode
  onScopeModeChange: (value: GraphScopeMode) => void
  neighborhoodDepth: GraphNeighborhoodDepth
  onNeighborhoodDepthChange: (value: GraphNeighborhoodDepth) => void
  focusMode: boolean
  onFocusModeChange: (value: boolean) => void
  hideOrphans: boolean
  onHideOrphansChange: (value: boolean) => void
  confidenceThreshold: number
  onConfidenceThresholdChange: (value: number) => void
  yearMin?: number
  yearMax?: number
  yearOptions: number[]
  onYearMinChange: (value?: number) => void
  onYearMaxChange: (value?: number) => void
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  searchResults: Document[]
  onJumpToDocument: (documentId: string) => void
  onZoomToFit: () => void
  onCenterSelected: () => void
  onResetFocus: () => void
}

export function DocumentGraphControls({
  relationFilter,
  onRelationFilterChange,
  colorMode,
  onColorModeChange,
  sizeMode,
  onSizeModeChange,
  scopeMode,
  onScopeModeChange,
  neighborhoodDepth,
  onNeighborhoodDepthChange,
  focusMode,
  onFocusModeChange,
  hideOrphans,
  onHideOrphansChange,
  confidenceThreshold,
  onConfidenceThresholdChange,
  yearMin,
  yearMax,
  yearOptions,
  onYearMinChange,
  onYearMaxChange,
  searchQuery,
  onSearchQueryChange,
  searchResults,
  onJumpToDocument,
  onZoomToFit,
  onCenterSelected,
  onResetFocus,
}: DocumentGraphControlsProps) {
  return (
    <Card className="border-dashed bg-white/92 p-4 shadow-sm">
      <div className="grid gap-4 lg:grid-cols-[1.2fr_repeat(5,minmax(0,1fr))]">
        <div className="space-y-2">
          <Label htmlFor="graph-search">Graph search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="graph-search"
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder="Find by title"
              className="pl-9"
            />
          </div>
          {searchResults.length > 0 ? (
            <Select onValueChange={onJumpToDocument}>
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Jump to matching document" />
              </SelectTrigger>
              <SelectContent>
                {searchResults.slice(0, 12).map((document) => (
                  <SelectItem key={document.id} value={document.id}>
                    {document.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label>Relations</Label>
          <Select value={relationFilter} onValueChange={(value) => onRelationFilterChange(value as GraphRelationFilter)}>
            <SelectTrigger className="bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Show all</SelectItem>
              <SelectItem value="manual">Manual only</SelectItem>
              <SelectItem value="citations">Citations only</SelectItem>
              <SelectItem value="confirmed_citations">Confirmed only</SelectItem>
              <SelectItem value="proposed_citations">Proposed only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Color mode</Label>
          <Select value={colorMode} onValueChange={(value) => onColorModeChange(value as GraphColorMode)}>
            <SelectTrigger className="bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="library">Library</SelectItem>
              <SelectItem value="year">Year</SelectItem>
              <SelectItem value="density">Density</SelectItem>
              <SelectItem value="status">Status</SelectItem>
              <SelectItem value="component">Component</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Size mode</Label>
          <Select value={sizeMode} onValueChange={(value) => onSizeModeChange(value as GraphSizeMode)}>
            <SelectTrigger className="bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="uniform">Uniform</SelectItem>
              <SelectItem value="inbound_citations">Inbound citations</SelectItem>
              <SelectItem value="total_degree">Total degree</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Scope</Label>
          <Select value={scopeMode} onValueChange={(value) => onScopeModeChange(value as GraphScopeMode)}>
            <SelectTrigger className="bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mapped">Mapped subset</SelectItem>
              <SelectItem value="library">Full library</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Neighborhood</Label>
          <Select value={neighborhoodDepth} onValueChange={(value) => onNeighborhoodDepthChange(value as GraphNeighborhoodDepth)}>
            <SelectTrigger className="bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="full">Full graph</SelectItem>
              <SelectItem value="1">1-hop neighbors</SelectItem>
              <SelectItem value="2">2-hop neighbors</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <Label>Minimum confidence</Label>
            <span className="text-slate-500">{Math.round(confidenceThreshold * 100)}%</span>
          </div>
          <Slider
            value={[Math.round(confidenceThreshold * 100)]}
            onValueChange={(value) => onConfidenceThresholdChange((value[0] ?? 0) / 100)}
            min={0}
            max={100}
            step={5}
          />
        </div>

        <div className="space-y-2">
          <Label>Year from</Label>
          <Select value={yearMin?.toString() ?? 'any'} onValueChange={(value) => onYearMinChange(value === 'any' ? undefined : Number.parseInt(value, 10))}>
            <SelectTrigger className="bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              {yearOptions.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Year to</Label>
          <Select value={yearMax?.toString() ?? 'any'} onValueChange={(value) => onYearMaxChange(value === 'any' ? undefined : Number.parseInt(value, 10))}>
            <SelectTrigger className="bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              {yearOptions.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2 pt-6">
          <Label className="justify-between">
            <span>Focus mode</span>
            <Switch checked={focusMode} onCheckedChange={onFocusModeChange} />
          </Label>
          <Label className="justify-between">
            <span>Hide orphans</span>
            <Switch checked={hideOrphans} onCheckedChange={onHideOrphansChange} />
          </Label>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" onClick={onZoomToFit}>
          <ZoomIn className="mr-2 h-4 w-4" />
          Zoom To Fit
        </Button>
        <Button variant="outline" onClick={onCenterSelected}>
          <Target className="mr-2 h-4 w-4" />
          Center Selected
        </Button>
        <Button variant="outline" onClick={onResetFocus}>
          Reset Focus
        </Button>
      </div>
    </Card>
  )
}
