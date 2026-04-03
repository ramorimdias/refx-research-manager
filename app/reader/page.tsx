'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { ArrowRight, BookOpen, Clock, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/refx/common'
import { useDocumentStore } from '@/lib/stores/document-store'
import type { Document } from '@/lib/types'
import { useT } from '@/lib/localization'

function buildReaderHref(document: Document) {
  const params = new URLSearchParams({ id: document.id })
  if (document.lastReadPage && document.lastReadPage > 0) {
    params.set('page', String(document.lastReadPage))
  }
  return `/reader/view?${params.toString()}`
}

export default function ReaderIndexPage() {
  const t = useT()
  const documents = useDocumentStore((state) => state.documents)

  const continueReading = useMemo(
    () =>
      documents
        .filter((doc) => doc.documentType === 'pdf' && doc.readingStage === 'reading' && doc.lastOpenedAt)
        .sort((a, b) => (b.lastOpenedAt?.getTime() ?? 0) - (a.lastOpenedAt?.getTime() ?? 0))
        .slice(0, 4),
    [documents],
  )

  const recentDocs = useMemo(
    () =>
      [...documents]
        .filter((doc) => doc.documentType === 'pdf' && doc.lastOpenedAt)
        .sort((a, b) => (b.lastOpenedAt?.getTime() ?? 0) - (a.lastOpenedAt?.getTime() ?? 0))
        .slice(0, 10),
    [documents],
  )

  if (continueReading.length === 0 && recentDocs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={BookOpen}
          title={t('readerIndex.emptyTitle')}
          description={t('readerIndex.emptyDescription')}
          action={
            <Button asChild>
              <Link href="/libraries">{t('readerIndex.goLibraries')}</Link>
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <BookOpen className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">{t('readerIndex.title')}</h1>
            <p className="text-muted-foreground">{t('readerIndex.subtitle')}</p>
          </div>
        </div>
      </div>

      {continueReading.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <Clock className="h-5 w-5 text-primary" />
            {t('readerIndex.continueReading')}
          </h2>
          <div className="space-y-5">
            {continueReading.map((document) => (
              <Link key={document.id} href={buildReaderHref(document)} className="block">
                <Card className="transition-colors hover:border-primary/50">
                  <CardContent className="flex items-center gap-4 p-3.5">
                    <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-medium">{document.title}</h3>
                      <p className="truncate text-sm text-muted-foreground">
                        {document.authors.slice(0, 2).join(', ')}
                        {document.authors.length > 2 && ' et al.'}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm text-muted-foreground">
                      {document.lastReadPage
                        ? `${t('readerIndex.continueLabel')}, ${t('searchPage.page', { page: document.lastReadPage })}`
                        : t('readerIndex.continueLabel')}
                    </span>
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
            {t('readerIndex.recentlyOpened')}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {recentDocs.map((document) => (
              <Link key={document.id} href={buildReaderHref(document)}>
                <Card className="h-full transition-colors hover:border-primary/50">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="line-clamp-2 font-medium">{document.title}</h3>
                        <p className="mt-1 truncate text-sm text-muted-foreground">
                          {document.authors[0] || t('readerIndex.unknownAuthor')}
                          {document.authors.length > 1 && ' et al.'}
                          {document.year && ` (${document.year})`}
                        </p>
                        {document.lastReadPage ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {`${t('readerIndex.continueLabel')}, ${t('searchPage.page', { page: document.lastReadPage })}`}
                          </p>
                        ) : null}
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
