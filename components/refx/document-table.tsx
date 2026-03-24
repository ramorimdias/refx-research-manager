'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  Star,
  MoreHorizontal,
  FileText,
  ExternalLink,
  Bookmark,
  Trash2,
  Copy,
  Edit,
  MessageSquare,
} from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Document } from '@/lib/types'
import { ReadingStageBadge, MetadataStatusBadge, OcrStatusBadge, StarRating } from './common'
import { useAppStore } from '@/lib/store'

interface DocumentTableProps {
  documents: Document[]
}

export function DocumentTable({ documents }: DocumentTableProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const { toggleFavorite, updateDocument, generateKeywordsForDocuments } = useAppStore()

  const toggleSelection = (id: string) => {
    const newSelection = new Set(selectedIds)
    if (newSelection.has(id)) {
      newSelection.delete(id)
    } else {
      newSelection.add(id)
    }
    setSelectedIds(newSelection)
  }

  const toggleAll = () => {
    if (selectedIds.size === documents.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(documents.map((d) => d.id)))
    }
  }

  return (
    <div className="rounded-lg border border-border">
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2">
          <p className="text-sm text-muted-foreground">{selectedIds.size} selected</p>
          <Button size="sm" variant="outline" onClick={() => void generateKeywordsForDocuments(Array.from(selectedIds))}>
            Auto Keywords
          </Button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-12">
              <Checkbox
                checked={selectedIds.size === documents.length && documents.length > 0}
                onCheckedChange={toggleAll}
              />
            </TableHead>
            <TableHead className="w-10"></TableHead>
            <TableHead>Title</TableHead>
            <TableHead className="w-48">Authors</TableHead>
            <TableHead className="w-16 text-center">Year</TableHead>
            <TableHead className="w-32">Status</TableHead>
            <TableHead className="w-24 text-center">Annotations</TableHead>
            <TableHead className="w-24">Rating</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map((doc) => (
            <TableRow
              key={doc.id}
              className={cn(
                'group',
                selectedIds.has(doc.id) && 'bg-muted/50'
              )}
            >
              <TableCell>
                <Checkbox
                  checked={selectedIds.has(doc.id)}
                  onCheckedChange={() => toggleSelection(doc.id)}
                />
              </TableCell>
              <TableCell>
                <button
                  onClick={() => toggleFavorite(doc.id)}
                  className={cn(
                    'transition-colors',
                    doc.favorite
                      ? 'text-amber-400'
                      : 'text-muted-foreground/30 hover:text-amber-400'
                  )}
                >
                  <Star className="h-4 w-4" fill={doc.favorite ? 'currentColor' : 'none'} />
                </button>
              </TableCell>
              <TableCell>
                <Link
                  href={`/reader/view?id=${doc.id}`}
                  className="group/link flex items-start gap-2"
                >
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <span className="font-medium text-foreground group-hover/link:text-primary transition-colors line-clamp-1">
                      {doc.title}
                    </span>
                    {doc.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {doc.tags.slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs py-0">
                            {tag}
                          </Badge>
                        ))}
                        {doc.tags.length > 3 && (
                          <Badge variant="secondary" className="text-xs py-0">
                            +{doc.tags.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </Link>
              </TableCell>
              <TableCell>
                <span className="text-sm text-muted-foreground line-clamp-1">
                  {doc.authors.slice(0, 2).join(', ')}
                  {doc.authors.length > 2 && ' et al.'}
                </span>
              </TableCell>
              <TableCell className="text-center">
                <span className="text-sm">{doc.year || '—'}</span>
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  <ReadingStageBadge stage={doc.readingStage} />
                  {doc.hasOcr && <OcrStatusBadge status={doc.ocrStatus} />}
                  {doc.metadataStatus !== 'verified' && doc.metadataStatus !== 'complete' && (
                    <MetadataStatusBadge status={doc.metadataStatus} />
                  )}
                </div>
              </TableCell>
              <TableCell className="text-center">
                {doc.annotationCount > 0 ? (
                  <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {doc.annotationCount}
                  </div>
                ) : (
                  <span className="text-muted-foreground/50">—</span>
                )}
              </TableCell>
              <TableCell>
                <StarRating
                  rating={doc.rating}
                  onChange={(rating) => updateDocument(doc.id, { rating })}
                />
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/reader/view?id=${doc.id}`}>
                        <FileText className="mr-2 h-4 w-4" />
                        Open in Reader
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={`/documents?id=${doc.id}&edit=1`}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit Details
                      </Link>
                    </DropdownMenuItem>
                    {doc.doi && (
                      <DropdownMenuItem>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Open DOI
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy Citation
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Bookmark className="mr-2 h-4 w-4" />
                      Add to Reading List
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
