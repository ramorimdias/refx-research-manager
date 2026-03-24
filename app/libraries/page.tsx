'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Plus,
  Search,
  Grid3X3,
  List,
  Table2,
  SortAsc,
  Upload,
  MoreHorizontal,
  FolderOpen,
  Trash2,
  Edit,
  Copy,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { useAppStore, useFilteredDocuments } from '@/lib/store'
import { DocumentTable } from '@/components/refx/document-table'
import { FilterPanel } from '@/components/refx/filter-panel'
import { DocumentCard } from '@/components/refx/document-card'
import type { SortField, ViewMode } from '@/lib/types'

export default function LibrariesPage() {
  const {
    activeLibraryId,
    setActiveLibrary,
    viewMode,
    setViewMode,
    sort,
    setSort,
    filters,
    setFilters,
    libraries,
    importDocuments,
    isDesktopApp,
  } = useAppStore()
  const documents = useFilteredDocuments()
  const [showFilters, setShowFilters] = useState(true)
  const [isImporting, setIsImporting] = useState(false)

  const activeLibrary = libraries.find((lib) => lib.id === activeLibraryId)

  const handleImport = async () => {
    if (!isDesktopApp || isImporting) return
    setIsImporting(true)
    try {
      await importDocuments()
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="flex h-full">
      {/* Filter Panel */}
      {showFilters && <FilterPanel />}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-4 border-b border-border p-4">
          <div className="flex items-center gap-4 flex-1">
            {/* Library Selector */}
            <Select
              value={activeLibraryId || 'all'}
              onValueChange={(val) => setActiveLibrary(val === 'all' ? null : val)}
            >
              <SelectTrigger className="w-64">
                <SelectValue placeholder="All Libraries" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Libraries</SelectItem>
                {libraries.map((lib) => (
                  <SelectItem key={lib.id} value={lib.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: lib.color }}
                      />
                      {lib.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search documents..."
                className="pl-9"
                value={filters.search || ''}
                onChange={(e) => setFilters({ ...filters, search: e.target.value || undefined })}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Sort */}
            <Select
              value={sort.field}
              onValueChange={(val) => setSort({ ...sort, field: val as SortField })}
            >
              <SelectTrigger className="w-36">
                <SortAsc className="mr-2 h-4 w-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="addedAt">Date Added</SelectItem>
                <SelectItem value="lastOpenedAt">Last Opened</SelectItem>
                <SelectItem value="title">Title</SelectItem>
                <SelectItem value="authors">Authors</SelectItem>
                <SelectItem value="year">Year</SelectItem>
                <SelectItem value="rating">Rating</SelectItem>
              </SelectContent>
            </Select>

            {/* View Toggle */}
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
              <TabsList>
                <TabsTrigger value="table">
                  <Table2 className="h-4 w-4" />
                </TabsTrigger>
                <TabsTrigger value="grid">
                  <Grid3X3 className="h-4 w-4" />
                </TabsTrigger>
                <TabsTrigger value="list">
                  <List className="h-4 w-4" />
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Actions */}
            <Button variant="outline" size="sm" onClick={handleImport} disabled={!isDesktopApp || isImporting}>
              <Upload className="mr-2 h-4 w-4" />
              {isImporting ? 'Importing...' : 'Import'}
            </Button>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add Document
            </Button>
          </div>
        </div>

        {/* Library Header (when library selected) */}
        {activeLibrary && (
          <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-muted/30">
            <div className="flex items-center gap-3">
              <div
                className="h-4 w-4 rounded"
                style={{ backgroundColor: activeLibrary.color }}
              />
              <div>
                <h2 className="font-semibold">{activeLibrary.name}</h2>
                <p className="text-sm text-muted-foreground">{activeLibrary.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{documents.length} documents</Badge>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit Library
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Copy className="mr-2 h-4 w-4" />
                    Duplicate Library
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Library
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}

        {/* Documents */}
        <div className="flex-1 overflow-auto p-4">
          {documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 rounded-full bg-muted p-4">
                <FolderOpen className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">No documents found</h3>
              <p className="mb-6 max-w-sm text-sm text-muted-foreground">
                {filters.search || Object.keys(filters).length > 1
                  ? 'Try adjusting your filters or search query.'
                  : 'Get started by importing PDFs or adding documents manually.'}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleImport} disabled={!isDesktopApp || isImporting}>
                  <Upload className="mr-2 h-4 w-4" />
                  {isImporting ? 'Importing PDFs...' : 'Import PDFs'}
                </Button>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Document
                </Button>
              </div>
            </div>
          ) : viewMode === 'table' ? (
            <DocumentTable documents={documents} />
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {documents.map((doc) => (
                <DocumentCard key={doc.id} document={doc} />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <DocumentCard key={doc.id} document={doc} variant="list" />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
