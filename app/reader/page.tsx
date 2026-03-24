'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { ArrowRight, BookOpen, Clock, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { EmptyState } from '@/components/refx/common'
import { useAppStore } from '@/lib/store'

export default function ReaderIndexPage() {
  const { documents } = useAppStore()

  const continueReading = useMemo(
    () =>
      documents
        .filter((doc) => doc.readingStage === 'reading' && doc.lastReadPage && doc.pageCount)
        .sort((a, b) => (b.lastOpenedAt?.getTime() ?? 0) - (a.lastOpenedAt?.getTime() ?? 0)),
    [documents],
  )

  const recentDocs = useMemo(
    () =>
      [...documents]
        .filter((doc) => doc.lastOpenedAt)
        .sort((a, b) => (b.lastOpenedAt?.getTime() ?? 0) - (a.lastOpenedAt?.getTime() ?? 0))
        .slice(0, 10),
    [documents],
  )

  if (continueReading.length === 0 && recentDocs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={BookOpen}
          title="No documents to read"
          description="Import PDFs and open a document to build your local reading queue."
          action={
            <Button asChild>
              <Link href="/libraries">Go to Libraries</Link>
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Reader</h1>
        <p className="text-muted-foreground">Continue where you left off or jump back into recent files.</p>
      </div>

      {continueReading.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <Clock className="h-5 w-5 text-primary" />
            Continue Reading
          </h2>
          <div className="space-y-3">
            {continueReading.map((document) => (
              <Link key={document.id} href={`/reader/view?id=${document.id}`}>
                <Card className="transition-colors hover:border-primary/50">
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary/10">
                      <FileText className="h-7 w-7 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-medium">{document.title}</h3>
                      <p className="truncate text-sm text-muted-foreground">
                        {document.authors.slice(0, 2).join(', ')}
                        {document.authors.length > 2 && ' et al.'}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <span className="text-sm text-muted-foreground">
                        Page {document.lastReadPage} of {document.pageCount}
                      </span>
                      <Progress value={((document.lastReadPage ?? 0) / (document.pageCount ?? 1)) * 100} className="mt-2 h-2 w-32" />
                    </div>
                    <ArrowRight className="h-5 w-5 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {recentDocs.length > 0 && (
        <div>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <BookOpen className="h-5 w-5 text-primary" />
            Recently Opened
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {recentDocs.map((document) => (
              <Link key={document.id} href={`/reader/view?id=${document.id}`}>
                <Card className="h-full transition-colors hover:border-primary/50">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="line-clamp-2 font-medium">{document.title}</h3>
                        <p className="mt-1 truncate text-sm text-muted-foreground">
                          {document.authors[0] || 'Unknown author'}
                          {document.authors.length > 1 && ' et al.'}
                          {document.year && ` (${document.year})`}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
