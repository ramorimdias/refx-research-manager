'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CheckCircle2, ChevronDown, Clock, FilePlus2, FolderPlus, Highlighter, Home, LibraryBig, type LucideIcon, StickyNote } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { EmptyState } from '@/components/refx/common'
import { loadAppSettings } from '@/lib/app-settings'
import { useT } from '@/lib/localization'
import type { Document } from '@/lib/types'
import { useDocumentStore } from '@/lib/stores/document-store'
import { useLibraryActions, useLibraryStore } from '@/lib/stores/library-store'
import { useRuntimeState } from '@/lib/stores/runtime-store'

function getDocumentHref(document: Document) {
  if (document.documentType === 'pdf') {
    const params = new URLSearchParams({ id: document.id })
    if (document.lastReadPage && document.lastReadPage > 0) {
      params.set('page', String(document.lastReadPage))
    }
    return `/reader/view?${params.toString()}`
  }

  return document.documentType === 'my_work'
    ? `/documents?id=${document.id}`
    : document.documentType === 'physical_book'
      ? `/books/notes?id=${document.id}`
      : `/reader/view?id=${document.id}`
}

type DashboardActivity = {
  id: string
  title: string
  detail: string
  href: string
  occurredAt: Date
  icon: LucideIcon
  category: 'library' | 'document' | 'note' | 'annotation' | 'finished'
  bundledItems?: DashboardActivity[]
}

function bundleSequentialActivities(activities: DashboardActivity[], bundledActivitySummary: string) {
  const bundled: Array<DashboardActivity & { groupedDetails: string[]; bundledItems: DashboardActivity[] }> = []

  for (const activity of activities) {
    const previous = bundled[bundled.length - 1]
    if (!previous || previous.category !== activity.category) {
      bundled.push({
        ...activity,
        groupedDetails: activity.detail ? [activity.detail] : [],
        bundledItems: [activity],
      })
      continue
    }

    const previousCountMatch = previous.title.match(/\((\d+)\)$/)
    const previousCount = previousCountMatch ? Number(previousCountMatch[1]) : 1
    const nextCount = previousCount + 1
    const baseTitle = previousCountMatch
      ? previous.title.replace(/\s*\(\d+\)$/, '')
      : previous.title
    const groupedDetails = Array.from(new Set([...previous.groupedDetails, activity.detail].filter(Boolean)))
    const nextDetail = bundledActivitySummary

    bundled[bundled.length - 1] = {
      ...previous,
      title: `${baseTitle} (${nextCount})`,
      detail: nextDetail,
      occurredAt: activity.occurredAt,
      groupedDetails,
      bundledItems: [...previous.bundledItems, activity],
    }
  }

  return bundled.map(({ groupedDetails: _groupedDetails, ...activity }) => activity)
}

function formatRelativeTime(date: Date, t: ReturnType<typeof useT>) {
  const elapsed = Date.now() - date.getTime()
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  if (elapsed < hour) {
    const minutes = Math.max(1, Math.round(elapsed / minute))
    return t('home.minutesAgo', { count: minutes })
  }

  if (elapsed < day) {
    const hours = Math.max(1, Math.round(elapsed / hour))
    return t('home.hoursAgo', { count: hours })
  }

  const days = Math.max(1, Math.round(elapsed / day))
  return t('home.daysAgo', { count: days })
}

export default function HomePage() {
  const t = useT()
  const router = useRouter()
  const libraries = useLibraryStore((state) => state.libraries)
  const documents = useDocumentStore((state) => state.documents)
  const { notes, annotations, isDesktopApp } = useRuntimeState()
  const { setActiveLibrary } = useLibraryActions()
  const [userName, setUserName] = useState('')
  const [greetingIndex, setGreetingIndex] = useState(0)
  const [expandedActivityIds, setExpandedActivityIds] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const settings = await loadAppSettings(isDesktopApp)
      if (!cancelled) {
        setUserName(settings.userName.trim())
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [isDesktopApp])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const key = 'refx.dashboard.greeting-count'
    const current = Number(window.sessionStorage.getItem(key) ?? '0')
    window.sessionStorage.setItem(key, String(current + 1))
    setGreetingIndex(current)
  }, [])

  const activities = useMemo<DashboardActivity[]>(() => {
    const documentsById = new Map(documents.map((document) => [document.id, document]))
    const librariesById = new Map(libraries.map((library) => [library.id, library]))

    const libraryActivities = libraries.map((library) => ({
      id: `library-${library.id}`,
      title: t('home.libraryCreated'),
      detail: library.name,
      href: '/libraries',
      occurredAt: library.createdAt,
      icon: FolderPlus,
      category: 'library' as const,
    }))

    const addedDocumentActivities = documents.map((document) => ({
      id: `document-added-${document.id}`,
      title: t('home.documentAdded'),
      detail: `${document.title} - ${librariesById.get(document.libraryId)?.name ?? t('home.libraryFallback')}`,
      href: getDocumentHref(document),
      occurredAt: document.createdAt,
      icon: FilePlus2,
      category: 'document' as const,
    }))

    const noteActivities = notes.map((note) => ({
      id: `note-${note.id}`,
      title: t('home.noteCreated'),
      detail: (() => {
        const noteTitle = note.title.trim() || t('home.untitledNote')
        const documentTitle = note.documentId ? documentsById.get(note.documentId)?.title : null
        return documentTitle ? `${noteTitle} - ${documentTitle}` : noteTitle
      })(),
      href: note.documentId ? (documentsById.get(note.documentId) ? getDocumentHref(documentsById.get(note.documentId)!) : '/notes') : '/notes',
      occurredAt: new Date(note.createdAt),
      icon: StickyNote,
      category: 'note' as const,
    }))

    const annotationActivities = annotations
      .map((annotation) => {
        const document = documentsById.get(annotation.documentId)
        if (!document) return null

        const isHighlight = annotation.kind === 'highlight' || annotation.kind === 'area'
        const pageLabel = annotation.pageNumber ? ` - ${t('home.page', { page: annotation.pageNumber })}` : ''

        return {
          id: `annotation-${annotation.id}`,
          title: isHighlight ? t('home.highlightCreated') : t('home.annotationCreated'),
          detail: `${document.title}${pageLabel}`,
          href: getDocumentHref(document),
          occurredAt: new Date(annotation.createdAt),
          icon: Highlighter,
          category: 'annotation' as const,
        }
      })
      .filter((activity): activity is NonNullable<typeof activity> => Boolean(activity))

    const finishedActivities = documents
      .filter((document) => document.readingStage === 'finished')
      .map((document) => ({
        id: `finished-${document.id}`,
        title: t('home.finishedReading'),
        detail: document.title,
        href: getDocumentHref(document),
        occurredAt: document.updatedAt,
        icon: CheckCircle2,
        category: 'finished' as const,
      }))

    return bundleSequentialActivities(
      [...libraryActivities, ...addedDocumentActivities, ...noteActivities, ...annotationActivities, ...finishedActivities]
        .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime()),
      t('home.bundledActivitySummary'),
    )
      .slice(0, 100)
  }, [annotations, documents, libraries, notes, t])

  const recentlyOpened = useMemo(
    () =>
      [...documents]
        .filter((document) => document.lastOpenedAt)
        .sort((left, right) => (right.lastOpenedAt?.getTime() ?? 0) - (left.lastOpenedAt?.getTime() ?? 0))
        .slice(0, 20),
    [documents],
  )

  const greeting = useMemo(() => {
    const greetings = userName
      ? [
          {
            title: t('home.welcomeBackNamed', { name: userName }),
            subtitle: t('home.ideasTodayNamed', { name: userName }),
          },
          {
            title: t('home.goodToSeeNamed', { name: userName }),
            subtitle: t('home.exploringTodayNamed', { name: userName }),
          },
          {
            title: t('home.backAtItNamed', { name: userName }),
            subtitle: t('home.attentionTodayNamed', { name: userName }),
          },
          {
            title: t('home.welcomeBackNamed', { name: userName }),
            subtitle: t('home.moveForwardNamed', { name: userName }),
          },
        ]
      : [
          {
            title: t('home.welcomeBack'),
            subtitle: t('home.ideasToday'),
          },
          {
            title: t('home.goodToSee'),
            subtitle: t('home.exploringToday'),
          },
          {
            title: t('home.backAtIt'),
            subtitle: t('home.attentionToday'),
          },
          {
            title: t('home.welcomeBack'),
            subtitle: t('home.moveForwardToday'),
          },
        ]

    return greetings[greetingIndex % greetings.length]
  }, [greetingIndex, t, userName])

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Home className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">{greeting.title}</h1>
          <p className="text-muted-foreground">{greeting.subtitle}</p>
        </div>
      </div>

      <div>
        <Card>
          <CardHeader>
            <CardTitle>{t('home.quickActions')}</CardTitle>
          </CardHeader>
          <CardContent className="grid max-w-2xl gap-3 sm:grid-cols-2">
            {libraries.map((library) => (
              <button
                key={library.id}
                type="button"
                className="flex min-h-[5.5rem] items-center justify-between rounded-2xl border border-transparent px-4 py-4 text-left text-white shadow-sm transition hover:opacity-95"
                style={{ backgroundColor: library.color }}
                onClick={() => {
                  setActiveLibrary(library.id)
                  router.push('/libraries')
                }}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/18 text-white">
                    <LibraryBig className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{library.name}</p>
                    <p className="text-xs text-white/80">{library.documentCount} {t('home.totalDocuments').toLowerCase()}</p>
                  </div>
                </div>
                <ArrowRight className="ml-3 h-4 w-4 shrink-0" />
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="gap-0 pb-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {t('home.recentActivity')}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-0">
            {activities.length > 0 ? (
              <ScrollArea className="h-[32rem] pr-3">
                <div className="space-y-2 pb-3">
                  {activities.map((activity) => {
                    const Icon = activity.icon
                    const isBundled = (activity.bundledItems?.length ?? 0) > 1
                    const isExpanded = expandedActivityIds.includes(activity.id)

                    return (
                      <div
                        key={activity.id}
                        className="rounded-xl border border-border/70 p-3 transition hover:bg-muted/30"
                      >
                        {isBundled ? (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedActivityIds((current) =>
                                current.includes(activity.id)
                                  ? current.filter((id) => id !== activity.id)
                                  : [...current, activity.id],
                              )}
                            className="flex w-full items-start gap-3 text-left"
                          >
                            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/70 text-muted-foreground">
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="truncate font-medium text-foreground">{activity.title}</div>
                                  <div className="truncate text-sm text-muted-foreground">{activity.detail}</div>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  <span className="shrink-0 text-xs text-muted-foreground">
                                    {formatRelativeTime(activity.occurredAt, t)}
                                  </span>
                                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                </div>
                              </div>
                            </div>
                          </button>
                        ) : (
                          <Link
                            href={activity.href}
                            className="flex items-start gap-3"
                          >
                            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/70 text-muted-foreground">
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="truncate font-medium text-foreground">{activity.title}</div>
                                  <div className="truncate text-sm text-muted-foreground">{activity.detail}</div>
                                </div>
                                <span className="shrink-0 text-xs text-muted-foreground">
                                  {formatRelativeTime(activity.occurredAt, t)}
                                </span>
                              </div>
                            </div>
                          </Link>
                        )}
                        {isBundled && isExpanded ? (
                          <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
                            {activity.bundledItems?.map((item) => {
                              const BundledIcon = item.icon
                              return (
                                <Link
                                  key={item.id}
                                  href={item.href}
                                  className="flex items-start gap-3 rounded-lg px-2 py-2 transition hover:bg-muted/40"
                                >
                                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/70 text-muted-foreground">
                                    <BundledIcon className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm font-medium text-foreground">{item.title}</div>
                                        <div className="truncate text-xs text-muted-foreground">{item.detail}</div>
                                      </div>
                                      <span className="shrink-0 text-xs text-muted-foreground">
                                        {formatRelativeTime(item.occurredAt, t)}
                                      </span>
                                    </div>
                                  </div>
                                </Link>
                              )
                            })}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            ) : (
              <EmptyState
                icon={Clock}
                title={t('home.noActivity')}
                description={t('home.noActivityDescription')}
                action={
                  <Button asChild>
                    <Link href="/libraries">{t('home.openLibraries')}</Link>
                  </Button>
                }
              />
            )}
          </CardContent>
        </Card>

        <Card className="gap-0 pb-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowRight className="h-4 w-4" />
              {t('readerIndex.recentlyOpened')}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-0">
            {recentlyOpened.length > 0 ? (
              <ScrollArea className="h-[32rem] pr-3">
                <div className="space-y-2 pb-3">
                  {recentlyOpened.map((document) => (
                    <Link
                      key={`recent-opened-${document.id}`}
                      href={getDocumentHref(document)}
                      className="block rounded-xl border border-border/70 p-3 transition hover:bg-muted/30"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground">{document.title}</div>
                          <div className="truncate text-sm text-muted-foreground">
                            {document.authors[0] || t('searchPage.unknownAuthor')}
                            {document.lastReadPage ? ` - ${t('searchPage.page', { page: document.lastReadPage })}` : ''}
                          </div>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {document.lastOpenedAt ? formatRelativeTime(document.lastOpenedAt, t) : ''}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <EmptyState
                icon={ArrowRight}
                title={t('readerIndex.recentlyOpened')}
                description={t('home.noActivityDescription')}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
