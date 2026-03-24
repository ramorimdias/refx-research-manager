'use client'

import Link from 'next/link'
import {
  Star,
  MoreHorizontal,
  FileText,
  MessageSquare,
  ExternalLink,
  BookOpen,
  Edit,
  Trash2,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { Document } from '@/lib/types'
import { OcrStatusBadge, ReadingStageBadge, StarRating } from './common'
import { useAppStore } from '@/lib/store'

interface DocumentCardProps {
  document: Document
  variant?: 'grid' | 'list'
}

export function DocumentCard({ document: doc, variant = 'grid' }: DocumentCardProps) {
  const { toggleFavorite, updateDocument } = useAppStore()

  if (variant === 'list') {
    return (
      <Link href={`/reader/view?id=${doc.id}`}>
        <Card className="group hover:border-primary/50 transition-colors">
          <CardContent className="flex items-center gap-4 p-4">
            <button
              onClick={(e) => {
                e.preventDefault()
                toggleFavorite(doc.id)
              }}
              className={cn(
                'shrink-0 transition-colors',
                doc.favorite
                  ? 'text-amber-400'
                  : 'text-muted-foreground/30 hover:text-amber-400'
              )}
            >
              <Star className="h-4 w-4" fill={doc.favorite ? 'currentColor' : 'none'} />
            </button>
            
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            
            <div className="flex-1 min-w-0">
              <h3 className="font-medium truncate group-hover:text-primary transition-colors">
                {doc.title}
              </h3>
              <p className="text-sm text-muted-foreground truncate">
                {doc.authors.slice(0, 2).join(', ')}
                {doc.authors.length > 2 && ' et al.'}
                {doc.year && ` (${doc.year})`}
              </p>
            </div>
            
            <div className="flex items-center gap-3 shrink-0">
              {doc.annotationCount > 0 && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <MessageSquare className="h-3.5 w-3.5" />
                  {doc.annotationCount}
                </div>
              )}
              <ReadingStageBadge stage={doc.readingStage} />
              <StarRating
                rating={doc.rating}
                onChange={(rating) => updateDocument(doc.id, { rating })}
              />
            </div>
          </CardContent>
        </Card>
      </Link>
    )
  }

  return (
    <Card className="group hover:border-primary/50 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
            <FileText className="h-6 w-6 text-primary" />
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => toggleFavorite(doc.id)}
              className={cn(
                'p-1 transition-colors',
                doc.favorite
                  ? 'text-amber-400'
                  : 'text-muted-foreground/30 hover:text-amber-400'
              )}
            >
              <Star className="h-4 w-4" fill={doc.favorite ? 'currentColor' : 'none'} />
            </button>
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
                    <BookOpen className="mr-2 h-4 w-4" />
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
                <DropdownMenuItem className="text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <Link href={`/reader/view?id=${doc.id}`} className="block">
          <h3 className="font-medium line-clamp-2 mb-1 group-hover:text-primary transition-colors">
            {doc.title}
          </h3>
          <p className="text-sm text-muted-foreground line-clamp-1 mb-3">
            {doc.authors.slice(0, 2).join(', ')}
            {doc.authors.length > 2 && ' et al.'}
            {doc.year && ` (${doc.year})`}
          </p>
        </Link>

        <div className="flex flex-wrap gap-1 mb-3">
          {doc.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-border">
          <div className="flex items-center gap-2">
            <ReadingStageBadge stage={doc.readingStage} />
            {doc.hasOcr && <OcrStatusBadge status={doc.ocrStatus} />}
          </div>
          <div className="flex items-center gap-2">
            {doc.annotationCount > 0 && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <MessageSquare className="h-3 w-3" />
                {doc.annotationCount}
              </div>
            )}
            <StarRating
              rating={doc.rating}
              onChange={(rating) => updateDocument(doc.id, { rating })}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
