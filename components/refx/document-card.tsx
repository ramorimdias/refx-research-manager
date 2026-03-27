'use client'

import Link from 'next/link'
import {
  BookMarked,
  Star,
  MoreHorizontal,
  FileText,
  MessageSquare,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Document, DocumentEphemeralUiFlags } from '@/lib/types'
import { NewBadge, OcrStatusBadge, ReadingStageBadge, StarRating } from './common'
import { useAppStore } from '@/lib/store'
import { DocumentActions, DocumentContextMenu } from './document-actions'

interface DocumentCardProps {
  document: Document
  ephemeralFlags?: DocumentEphemeralUiFlags
  variant?: 'grid' | 'list'
}

export function DocumentCard({ document: doc, ephemeralFlags, variant = 'grid' }: DocumentCardProps) {
  const { toggleFavorite, updateDocument } = useAppStore()
  const openHref = doc.documentType === 'physical_book' ? `/books/notes?id=${doc.id}` : `/reader/view?id=${doc.id}`
  const Icon = doc.documentType === 'physical_book' ? BookMarked : FileText

  if (variant === 'list') {
    return (
      <DocumentContextMenu document={doc}>
        <Card className={cn('group transition-colors hover:border-primary/50', ephemeralFlags?.isNewlyAdded && 'border-emerald-300/60 bg-emerald-500/[0.04]')}>
          <CardContent className="flex items-center gap-4 p-4">
            <button
              onClick={() => toggleFavorite(doc.id)}
              className={cn(
                'shrink-0 transition-colors',
                doc.favorite
                  ? 'text-amber-400'
                  : 'text-muted-foreground/30 hover:text-amber-400'
              )}
            >
              <Star className="h-4 w-4" fill={doc.favorite ? 'currentColor' : 'none'} />
            </button>

            <Link href={openHref} className="flex min-w-0 flex-1 items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="h-5 w-5 text-primary" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2">
                  <h3 className="min-w-0 truncate font-medium transition-colors group-hover:text-primary">
                    {doc.title}
                  </h3>
                  {ephemeralFlags?.isNewlyAdded && <NewBadge />}
                </div>
                <p className="text-sm text-muted-foreground truncate">
                  {doc.authors.slice(0, 2).join(', ')}
                  {doc.authors.length > 2 && ' et al.'}
                  {doc.year && ` (${doc.year})`}
                </p>
              </div>
            </Link>

            <div className="flex items-center gap-3 shrink-0">
              {doc.commentCount > 0 && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <MessageSquare className="h-3.5 w-3.5" />
                  {doc.commentCount}
                </div>
              )}
              <ReadingStageBadge stage={doc.readingStage} />
              <StarRating
                rating={doc.rating}
                onChange={(rating) => updateDocument(doc.id, { rating })}
              />
              <DocumentActions
                document={doc}
                trigger={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                }
              />
            </div>
          </CardContent>
        </Card>
      </DocumentContextMenu>
    )
  }

  return (
    <DocumentContextMenu document={doc}>
      <Card className={cn('group transition-colors hover:border-primary/50', ephemeralFlags?.isNewlyAdded && 'border-emerald-300/60 bg-emerald-500/[0.04]')}>
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
              <DocumentActions
                document={doc}
                trigger={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                }
              />
            </div>
          </div>

          <Link href={openHref} className="block">
            <div className="mb-1 flex items-start gap-2">
              <h3 className="line-clamp-2 font-medium transition-colors group-hover:text-primary">
                {doc.title}
              </h3>
              {ephemeralFlags?.isNewlyAdded && <NewBadge />}
            </div>
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
              {doc.commentCount > 0 && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MessageSquare className="h-3 w-3" />
                  {doc.commentCount}
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
    </DocumentContextMenu>
  )
}
