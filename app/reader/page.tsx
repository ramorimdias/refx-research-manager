'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { ArrowRight, BookOpen, Clock, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/refx/common'
import { PageHeader } from '@/components/refx/page-header'
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
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-4 md:p-6">
      <div className="shrink-0">
        <PageHeader
          icon={<BookOpen className="h-6 w-6" />}
          title={t('readerIndex.title')}
          subtitle={t('readerIndex.subtitle')}
        />
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(22rem,0.9fr)_minmax(28rem,1.35fr)]">
        {continueReading.length > 0 && (
          <Card className="flex min-h-0 flex-col" data-tour-id="reader-continue">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="h-5 w-5 text-primary" />
                {t('readerIndex.continueReading')}
              </CardTitle>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto">
              {continueReading.map((document) => (
                <Link key={document.id} href={buildReaderHref(document)} className="block">
                  <div className="h-[78px] overflow-hidden rounded-2xl border bg-card px-4 py-2 transition hover:border-primary/40 hover:bg-accent/30">
                    <div className="flex h-full items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-medium transition-colors hover:text-primary">{document.title}</h3>
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
                      <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                    </div>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}

        {recentDocs.length > 0 && (
          <Card className="flex min-h-0 flex-col" data-tour-id="reader-recent-opened">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BookOpen className="h-5 w-5 text-primary" />
                {t('readerIndex.recentlyOpened')}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid min-h-0 flex-1 gap-3 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
              {recentDocs.map((document) => (
                <Link key={document.id} href={buildReaderHref(document)}>
                  <div className="h-full min-h-[126px] rounded-2xl border bg-card p-4 transition hover:border-primary/40 hover:bg-accent/30">
                    <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                          <FileText className="h-5 w-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="line-clamp-2 font-medium transition-colors hover:text-primary">{document.title}</h3>
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
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
