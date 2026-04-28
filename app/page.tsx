'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Brackets,
  CheckCircle2,
  ChevronDown,
  Clock,
  FilePlus2,
  FolderPlus,
  Heart,
  Highlighter,
  Home,
  LayoutGrid,
  Library,
  MessageSquareText,
  Rows3,
  Search as SearchIcon,
  Settings2,
  StickyNote,
  Telescope,
  Waypoints,
  type LucideIcon,
} from 'lucide-react'
import { EmptyState } from '@/components/refx/common'
import { PageHeader } from '@/components/refx/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { loadAppSettings } from '@/lib/app-settings'
import {
  type HomeDashboardPrefs,
  type HomeDashboardSectionId,
  type HomeRecentSearch,
  loadHomeDashboardPrefs,
  loadHomeRecentSearches,
  saveHomeDashboardPrefs,
} from '@/lib/home-dashboard'
import { getLibraryForegroundColor, getLibraryOverlayColor } from '@/lib/library-colors'
import { getLibraryIcon } from '@/lib/library-icons'
import { useT } from '@/lib/localization'
import * as repo from '@/lib/repositories/local-db'
import { useDiscoverStore } from '@/lib/stores/discover-store'
import { useDocumentStore } from '@/lib/stores/document-store'
import { useGraphStore } from '@/lib/stores/graph-store'
import { useLibraryActions, useLibraryStore } from '@/lib/stores/library-store'
import { useRelationStore } from '@/lib/stores/relation-store'
import { useRuntimeState } from '@/lib/stores/runtime-store'
import type { Document } from '@/lib/types'

type DashboardActivity = {
  id: string
  title: string
  detail: string
  href: string
  occurredAt: Date
  icon: LucideIcon
  category: 'library' | 'document' | 'note' | 'annotation' | 'finished' | 'relation' | 'graph-view' | 'reference' | 'work-reference' | 'journey'
  bundledItems?: DashboardActivity[]
}

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

function getDocumentCommentsHref(document: Document) {
  return `/comments?id=${document.id}&returnTo=comments`
}

function getLatestActivityTimestamp(createdAt: Date, updatedAt?: Date) {
  if (updatedAt && updatedAt.getTime() > createdAt.getTime()) {
    return { occurredAt: updatedAt, isUpdated: true }
  }

  return { occurredAt: createdAt, isUpdated: false }
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

    bundled[bundled.length - 1] = {
      ...previous,
      title: `${baseTitle} (${nextCount})`,
      detail: bundledActivitySummary,
      occurredAt: activity.occurredAt,
      groupedDetails: Array.from(new Set([...previous.groupedDetails, activity.detail].filter(Boolean))),
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

function htmlToPlainText(value?: string | null) {
  return (value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function DashboardCard({
  title,
  icon: Icon,
  children,
  dataTourId,
}: {
  title: string
  icon: LucideIcon
  children: ReactNode
  dataTourId?: string
}) {
  return (
    <Card className="w-full min-w-0 gap-0 pb-0" data-tour-id={dataTourId}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="w-full pb-0">{children}</CardContent>
    </Card>
  )
}

function LibraryPill({
  name,
  color,
}: {
  name: string
  color?: string | null
}) {
  const foregroundColor = getLibraryForegroundColor(color)
  const backgroundColor = color ?? '#e5e7eb'

  return (
    <Badge
      variant="secondary"
      className="h-5 rounded-full border-0 px-2 text-[10px] font-medium shadow-none"
      style={{
        backgroundColor,
        color: foregroundColor,
      }}
    >
      {name}
    </Badge>
  )
}

function DashboardLinkRow({
  href,
  icon: Icon,
  title,
  detail,
  meta,
  timeLabel,
}: {
  href: string
  icon: LucideIcon
  title: ReactNode
  detail: ReactNode
  meta?: ReactNode
  timeLabel?: string
}) {
  return (
    <Link
      href={href}
      className="flex w-full items-start gap-3 rounded-xl border border-border/70 p-3 transition hover:bg-muted/30"
    >
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/70 text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-foreground">{title}</div>
            {meta ? <div className="mt-1 flex flex-wrap items-center gap-2">{meta}</div> : null}
            <div className="mt-1 truncate text-sm text-muted-foreground">{detail}</div>
          </div>
          {timeLabel ? (
            <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground sm:text-right">
              {timeLabel}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  )
}

export default function HomePage() {
  const t = useT()
  const router = useRouter()
  const libraries = useLibraryStore((state) => state.libraries)
  const documents = useDocumentStore((state) => state.documents)
  const graphViews = useGraphStore((state) => state.graphViews)
  const relations = useRelationStore((state) => state.relations)
  const savedJourneys = useDiscoverStore((state) => state.savedJourneys)
  const { notes, annotations, isDesktopApp } = useRuntimeState()
  const { setActiveLibrary } = useLibraryActions()

  const [userName, setUserName] = useState('')
  const [greetingIndex, setGreetingIndex] = useState(0)
  const [expandedActivityIds, setExpandedActivityIds] = useState<string[]>([])
  const [typedGreetingTitle, setTypedGreetingTitle] = useState('')
  const [references, setReferences] = useState<repo.DbReference[]>([])
  const [workReferences, setWorkReferences] = useState<repo.DbWorkReference[]>([])
  const [recentSearches, setRecentSearches] = useState<HomeRecentSearch[]>(() => loadHomeRecentSearches())
  const [dashboardPrefs, setDashboardPrefs] = useState<HomeDashboardPrefs>(() => loadHomeDashboardPrefs())
  const [isCustomizeDialogOpen, setIsCustomizeDialogOpen] = useState(false)

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

  useEffect(() => {
    saveHomeDashboardPrefs(dashboardPrefs)
  }, [dashboardPrefs])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const refreshRecentSearches = () => {
      setRecentSearches(loadHomeRecentSearches())
    }

    refreshRecentSearches()
    window.addEventListener('focus', refreshRecentSearches)
    window.addEventListener('storage', refreshRecentSearches)

    return () => {
      window.removeEventListener('focus', refreshRecentSearches)
      window.removeEventListener('storage', refreshRecentSearches)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadReferenceActivities = async () => {
      if (!isDesktopApp) {
        setReferences([])
        setWorkReferences([])
        return
      }

      try {
        const workDocumentIds = documents
          .filter((document) => document.documentType === 'my_work')
          .map((document) => document.id)

        const [nextReferences, nextWorkReferences] = await Promise.all([
          repo.listReferences(),
          Promise.all(
            workDocumentIds.map(async (workDocumentId) => [
              workDocumentId,
              await repo.listWorkReferences(workDocumentId),
            ] as const),
          ),
        ])

        if (cancelled) return

        setReferences(nextReferences)
        setWorkReferences(nextWorkReferences.flatMap(([, rows]) => rows))
      } catch (error) {
        if (cancelled) return
        console.warn('Could not load reference activities:', error)
        setReferences([])
        setWorkReferences([])
      }
    }

    void loadReferenceActivities()

    return () => {
      cancelled = true
    }
  }, [documents, isDesktopApp])

  const recentJourneys = useMemo(() => {
    const latestJourneysById = new Map<string, (typeof savedJourneys)[number]>()
    for (const journey of savedJourneys) {
      const previous = latestJourneysById.get(journey.id)
      if (!previous || new Date(journey.updatedAt).getTime() >= new Date(previous.updatedAt).getTime()) {
        latestJourneysById.set(journey.id, journey)
      }
    }

    return [...latestJourneysById.values()]
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
      .slice(0, 20)
  }, [savedJourneys])

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

    const noteActivities = notes.map((note) => {
      const latest = getLatestActivityTimestamp(new Date(note.createdAt), new Date(note.updatedAt))
      const noteTitle = note.title.trim() || t('home.untitledNote')
      const documentTitle = note.documentId ? documentsById.get(note.documentId)?.title : null

      return {
        id: `note-${note.id}`,
        title: latest.isUpdated ? t('home.noteUpdated') : t('home.noteCreated'),
        detail: documentTitle ? `${noteTitle} - ${documentTitle}` : noteTitle,
        href: note.documentId && documentsById.get(note.documentId) ? getDocumentHref(documentsById.get(note.documentId)!) : '/notes',
        occurredAt: latest.occurredAt,
        icon: StickyNote,
        category: 'note' as const,
      }
    })

    const annotationActivities = annotations
      .map((annotation) => {
        const document = documentsById.get(annotation.documentId)
        if (!document) return null

        return {
          id: `annotation-${annotation.id}`,
          title: annotation.kind === 'highlight' || annotation.kind === 'area'
            ? t('home.highlightCreated')
            : t('home.annotationCreated'),
          detail: `${document.title}${annotation.pageNumber ? ` - ${t('home.page', { page: annotation.pageNumber })}` : ''}`,
          href: getDocumentHref(document),
          occurredAt: new Date(annotation.createdAt),
          icon: Highlighter,
          category: 'annotation' as const,
        }
      })
      .filter((activity): activity is NonNullable<typeof activity> => Boolean(activity))

    const relationActivities = relations
      .map((relation) => {
        const sourceDocument = documentsById.get(relation.sourceDocumentId)
        const targetDocument = documentsById.get(relation.targetDocumentId)
        if (!sourceDocument || !targetDocument) return null

        const latest = getLatestActivityTimestamp(relation.createdAt, relation.updatedAt)

        return {
          id: `relation-${relation.id}`,
          title: latest.isUpdated ? t('home.relationUpdated') : t('home.relationCreated'),
          detail: `${sourceDocument.title} -> ${targetDocument.title}`,
          href: getDocumentHref(sourceDocument),
          occurredAt: latest.occurredAt,
          icon: Waypoints,
          category: 'relation' as const,
        }
      })
      .filter((activity): activity is NonNullable<typeof activity> => Boolean(activity))

    const graphViewActivities = graphViews.map((graphView) => {
      const latest = getLatestActivityTimestamp(graphView.createdAt, graphView.updatedAt)
      return {
        id: `graph-view-${graphView.id}`,
        title: latest.isUpdated ? t('home.mapUpdated') : t('home.mapSaved'),
        detail: `${graphView.name} - ${librariesById.get(graphView.libraryId)?.name ?? t('home.libraryFallback')}`,
        href: '/maps',
        occurredAt: latest.occurredAt,
        icon: Waypoints,
        category: 'graph-view' as const,
      }
    })

    const referenceActivities = references.map((reference) => {
      const latest = getLatestActivityTimestamp(new Date(reference.createdAt), new Date(reference.updatedAt))
      return {
        id: `reference-${reference.id}`,
        title: latest.isUpdated ? t('home.referenceUpdated') : t('home.referenceAdded'),
        detail: reference.title,
        href: '/references',
        occurredAt: latest.occurredAt,
        icon: Brackets,
        category: 'reference' as const,
      }
    })

    const workReferenceActivities = workReferences.map((workReference) => {
      const latest = getLatestActivityTimestamp(new Date(workReference.createdAt), new Date(workReference.updatedAt))
      const workDocument = documentsById.get(workReference.workDocumentId)
      return {
        id: `work-reference-${workReference.id}`,
        title: latest.isUpdated ? t('home.workReferenceUpdated') : t('home.workReferenceAdded'),
        detail: workDocument ? `${workReference.reference.title} - ${workDocument.title}` : workReference.reference.title,
        href: '/references',
        occurredAt: latest.occurredAt,
        icon: Brackets,
        category: 'work-reference' as const,
      }
    })

    const journeyActivities = recentJourneys.map((journey) => {
      const latest = getLatestActivityTimestamp(new Date(journey.createdAt), new Date(journey.updatedAt))
      return {
        id: `journey-${journey.id}`,
        title: latest.isUpdated ? t('home.journeyUpdated') : t('home.journeySaved'),
        detail: journey.name,
        href: '/discover',
        occurredAt: latest.occurredAt,
        icon: Telescope,
        category: 'journey' as const,
      }
    })

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
      [
        ...libraryActivities,
        ...addedDocumentActivities,
        ...noteActivities,
        ...annotationActivities,
        ...relationActivities,
        ...graphViewActivities,
        ...referenceActivities,
        ...workReferenceActivities,
        ...journeyActivities,
        ...finishedActivities,
      ].sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime()),
      t('home.bundledActivitySummary'),
    ).slice(0, 100)
  }, [annotations, documents, graphViews, libraries, notes, recentJourneys, references, relations, t, workReferences])

  const recentlyOpened = useMemo(
    () => [...documents]
      .filter((document) => document.lastOpenedAt)
      .sort((left, right) => (right.lastOpenedAt?.getTime() ?? 0) - (left.lastOpenedAt?.getTime() ?? 0))
      .slice(0, 20),
    [documents],
  )

  const favoriteDocuments = useMemo(
    () => [...documents]
      .filter((document) => document.favorite)
      .sort((left, right) => {
        const leftTime = left.lastOpenedAt?.getTime() ?? left.updatedAt.getTime()
        const rightTime = right.lastOpenedAt?.getTime() ?? right.updatedAt.getTime()
        return rightTime - leftTime
      })
      .slice(0, 20),
    [documents],
  )

  const recentNotes = useMemo(
    () => [...notes]
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
      .slice(0, 20),
    [notes],
  )

  const recentComments = useMemo(
    () => [...documents]
      .filter((document) => htmlToPlainText(document.commentaryText).length > 0)
      .sort((left, right) => (right.commentaryUpdatedAt?.getTime() ?? 0) - (left.commentaryUpdatedAt?.getTime() ?? 0))
      .slice(0, 20),
    [documents],
  )

  const librariesById = useMemo(
    () => new Map(libraries.map((library) => [library.id, library])),
    [libraries],
  )

  const greeting = useMemo(() => {
    const greetings = userName
      ? [
          { title: t('home.welcomeBackNamed', { name: userName }), subtitle: t('home.ideasToday') },
          { title: t('home.goodToSeeNamed', { name: userName }), subtitle: t('home.exploringToday') },
          { title: t('home.backAtItNamed', { name: userName }), subtitle: t('home.attentionToday') },
          { title: t('home.welcomeBackNamed', { name: userName }), subtitle: t('home.moveForwardToday') },
        ]
      : [
          { title: t('home.welcomeBack'), subtitle: t('home.ideasToday') },
          { title: t('home.goodToSee'), subtitle: t('home.exploringToday') },
          { title: t('home.backAtIt'), subtitle: t('home.attentionToday') },
          { title: t('home.welcomeBack'), subtitle: t('home.moveForwardToday') },
        ]

    return greetings[greetingIndex % greetings.length]
  }, [greetingIndex, t, userName])

  useEffect(() => {
    setTypedGreetingTitle('')
    if (!greeting.title) return

    let index = 0
    const intervalId = window.setInterval(() => {
      index += 1
      setTypedGreetingTitle(greeting.title.slice(0, index))
      if (index >= greeting.title.length) {
        window.clearInterval(intervalId)
      }
    }, 42)

    return () => window.clearInterval(intervalId)
  }, [greeting.title])

  const sectionMeta = useMemo(
    () => [
      { id: 'libraries', label: t('home.quickActions'), icon: Library },
      { id: 'recent-activity', label: t('home.recentActivity'), icon: Clock },
      { id: 'recent-opened', label: t('readerIndex.recentlyOpened'), icon: ArrowRight },
      { id: 'favorite-documents', label: t('home.favoriteDocuments'), icon: Heart },
      { id: 'recent-notes', label: t('home.recentNotes'), icon: StickyNote },
      { id: 'recent-comments', label: t('home.recentComments'), icon: MessageSquareText },
      { id: 'recent-journeys', label: t('home.recentJourneys'), icon: Telescope },
      { id: 'recent-searches', label: t('home.recentSearches'), icon: SearchIcon },
    ] satisfies Array<{ id: HomeDashboardSectionId; label: string; icon: LucideIcon }>,
    [t],
  )

  const hiddenSectionIds = new Set(dashboardPrefs.hidden)
  const visibleSectionIds = dashboardPrefs.order.filter((id) => !hiddenSectionIds.has(id))

  const toggleSectionVisibility = (id: HomeDashboardSectionId, visible: boolean) => {
    setDashboardPrefs((current) => ({
      ...current,
      hidden: visible
        ? current.hidden.filter((entry) => entry !== id)
        : [...current.hidden, id].filter((entry, index, array) => array.indexOf(entry) === index),
    }))
  }

  const moveSection = (id: HomeDashboardSectionId, direction: 'up' | 'down') => {
    setDashboardPrefs((current) => {
      const currentIndex = current.order.indexOf(id)
      if (currentIndex < 0) return current

      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
      if (targetIndex < 0 || targetIndex >= current.order.length) return current

      const nextOrder = [...current.order]
      const [moved] = nextOrder.splice(currentIndex, 1)
      nextOrder.splice(targetIndex, 0, moved)

      return {
        ...current,
        order: nextOrder,
      }
    })
  }

  const renderSection = (sectionId: HomeDashboardSectionId) => {
    if (sectionId === 'libraries') {
      return (
        <div key={sectionId} data-tour-id="home-libraries">
          <DashboardCard title={t('home.quickActions')} icon={Library}>
            {libraries.length > 0 ? (
              <div className="flex flex-wrap gap-2.5 pb-6">
                {libraries.map((library) => {
                  const LibraryIcon = getLibraryIcon(library.icon)
                  const foregroundColor = getLibraryForegroundColor(library.color)
                  const overlayColor = getLibraryOverlayColor(library.color)

                  return (
                    <button
                      key={library.id}
                      type="button"
                      className="flex min-h-[4.5rem] w-full max-w-[15.5rem] items-center justify-between rounded-2xl border border-transparent px-3.5 py-3 text-left shadow-sm transition hover:opacity-95"
                      style={{ backgroundColor: library.color, color: foregroundColor }}
                      onClick={() => {
                        setActiveLibrary(library.id)
                        router.push('/libraries')
                      }}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: overlayColor }}>
                          <LibraryIcon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold leading-tight">{library.name}</p>
                          <p className="text-[11px]" style={{ color: foregroundColor, opacity: 0.82 }}>
                            {library.documentCount} {t('home.totalDocuments').toLowerCase()}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="ml-2.5 h-4 w-4 shrink-0" />
                    </button>
                  )
                })}
              </div>
            ) : (
              <EmptyState
                icon={Library}
                title={t('home.quickActions')}
                description={t('home.noActivityDescription')}
                action={(
                  <Button asChild>
                    <Link href="/libraries">{t('home.openLibraries')}</Link>
                  </Button>
                )}
              />
            )}
          </DashboardCard>
        </div>
      )
    }

    if (sectionId === 'recent-activity') {
      return (
        <DashboardCard key={sectionId} title={t('home.recentActivity')} icon={Clock} dataTourId="home-activity">
          {activities.length > 0 ? (
            <div className="max-h-[32rem] overflow-y-auto pr-2 [scrollbar-gutter:stable]">
              <div className="space-y-2 pb-3">
                {activities.map((activity) => {
                  const Icon = activity.icon
                  const isBundled = (activity.bundledItems?.length ?? 0) > 1
                  const isExpanded = expandedActivityIds.includes(activity.id)

                  if (!isBundled) {
                    return (
                      <DashboardLinkRow
                        key={activity.id}
                        href={activity.href}
                        icon={activity.icon}
                        title={activity.title}
                        detail={activity.detail}
                        timeLabel={formatRelativeTime(activity.occurredAt, t)}
                      />
                    )
                  }

                  return (
                    <div key={activity.id} className="rounded-xl border border-border/70 p-3 transition hover:bg-muted/30">
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
                          <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium text-foreground">{activity.title}</div>
                              <div className="truncate text-sm text-muted-foreground">{activity.detail}</div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2 sm:pt-0.5">
                              <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground sm:text-right">
                                {formatRelativeTime(activity.occurredAt, t)}
                              </span>
                              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </div>
                          </div>
                        </div>
                      </button>
                      {isExpanded ? (
                        <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
                          {activity.bundledItems?.map((item) => (
                            <DashboardLinkRow
                              key={item.id}
                              href={item.href}
                              icon={item.icon}
                              title={item.title}
                              detail={item.detail}
                              timeLabel={formatRelativeTime(item.occurredAt, t)}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={Clock}
              title={t('home.noActivity')}
              description={t('home.noActivityDescription')}
              action={(
                <Button asChild>
                  <Link href="/libraries">{t('home.openLibraries')}</Link>
                </Button>
              )}
            />
          )}
        </DashboardCard>
      )
    }

    if (sectionId === 'recent-opened') {
      return (
        <DashboardCard key={sectionId} title={t('readerIndex.recentlyOpened')} icon={ArrowRight} dataTourId="home-recent-opened">
          {recentlyOpened.length > 0 ? (
            <div className="max-h-[32rem] overflow-y-auto pr-2 [scrollbar-gutter:stable]">
              <div className="space-y-2 pb-3">
                {recentlyOpened.map((document) => (
                  <DashboardLinkRow
                    key={`recent-opened-${document.id}`}
                    href={getDocumentHref(document)}
                    icon={ArrowRight}
                    title={document.title}
                    detail={`${document.authors[0] || t('searchPage.unknownAuthor')}${document.lastReadPage ? ` - ${t('searchPage.page', { page: document.lastReadPage })}` : ''}`}
                    timeLabel={document.lastOpenedAt ? formatRelativeTime(document.lastOpenedAt, t) : ''}
                  />
                ))}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={ArrowRight}
              title={t('readerIndex.recentlyOpened')}
              description={t('home.noActivityDescription')}
            />
          )}
        </DashboardCard>
      )
    }

    if (sectionId === 'favorite-documents') {
      return (
        <DashboardCard key={sectionId} title={t('home.favoriteDocuments')} icon={Heart}>
          {favoriteDocuments.length > 0 ? (
            <div className="max-h-[32rem] overflow-y-auto pr-2 [scrollbar-gutter:stable]">
              <div className="space-y-2 pb-3">
                {favoriteDocuments.map((document) => (
                  <DashboardLinkRow
                    key={`favorite-${document.id}`}
                    href={getDocumentHref(document)}
                    icon={Heart}
                    title={document.title}
                    meta={(() => {
                      const library = librariesById.get(document.libraryId)
                      return library ? <LibraryPill name={library.name} color={library.color} /> : null
                    })()}
                    detail={document.authors[0] || t('searchPage.unknownAuthor')}
                    timeLabel={formatRelativeTime(document.lastOpenedAt ?? document.updatedAt, t)}
                  />
                ))}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={Heart}
              title={t('home.noFavoriteDocuments')}
              description={t('home.favoriteDocumentsDescription')}
            />
          )}
        </DashboardCard>
      )
    }

    if (sectionId === 'recent-notes') {
      const documentsById = new Map(documents.map((document) => [document.id, document]))

      return (
        <DashboardCard key={sectionId} title={t('home.recentNotes')} icon={StickyNote}>
          {recentNotes.length > 0 ? (
            <div className="max-h-[32rem] overflow-y-auto pr-2 [scrollbar-gutter:stable]">
              <div className="space-y-2 pb-3">
                {recentNotes.map((note) => {
                  const noteTitle = note.title.trim() || t('home.untitledNote')
                  const linkedDocument = note.documentId ? documentsById.get(note.documentId) : null
                  const library = linkedDocument ? librariesById.get(linkedDocument.libraryId) : null
                  return (
                    <DashboardLinkRow
                      key={`recent-note-${note.id}`}
                      href={linkedDocument ? getDocumentHref(linkedDocument) : '/notes'}
                      icon={StickyNote}
                      title={<span className="text-[13px] font-medium text-foreground/90">{noteTitle}</span>}
                      meta={(
                        <>
                          {library ? <LibraryPill name={library.name} color={library.color} /> : null}
                          {linkedDocument ? (
                            <span className="min-w-0 truncate text-[11px] text-muted-foreground/80">{linkedDocument.title}</span>
                          ) : null}
                        </>
                      )}
                      detail={note.content.trim() || (linkedDocument ? linkedDocument.title : t('home.notesWorkspace'))}
                      timeLabel={formatRelativeTime(new Date(note.updatedAt), t)}
                    />
                  )
                })}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={StickyNote}
              title={t('home.noRecentNotes')}
              description={t('home.recentNotesDescription')}
            />
          )}
        </DashboardCard>
      )
    }

    if (sectionId === 'recent-comments') {
      return (
        <DashboardCard key={sectionId} title={t('home.recentComments')} icon={MessageSquareText}>
          {recentComments.length > 0 ? (
            <div className="max-h-[32rem] overflow-y-auto pr-2 [scrollbar-gutter:stable]">
              <div className="space-y-2 pb-3">
                {recentComments.map((document) => {
                  const library = librariesById.get(document.libraryId)
                  return (
                    <DashboardLinkRow
                      key={`recent-comment-${document.id}`}
                      href={getDocumentCommentsHref(document)}
                      icon={MessageSquareText}
                      title={document.title}
                      meta={library ? <LibraryPill name={library.name} color={library.color} /> : null}
                      detail={htmlToPlainText(document.commentaryText) || t('commentsPage.noCommentPreview')}
                      timeLabel={document.commentaryUpdatedAt ? formatRelativeTime(document.commentaryUpdatedAt, t) : ''}
                    />
                  )
                })}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={MessageSquareText}
              title={t('home.noRecentComments')}
              description={t('home.recentCommentsDescription')}
            />
          )}
        </DashboardCard>
      )
    }

    if (sectionId === 'recent-journeys') {
      return (
        <DashboardCard key={sectionId} title={t('home.recentJourneys')} icon={Telescope}>
          {recentJourneys.length > 0 ? (
            <div className="max-h-[32rem] overflow-y-auto pr-2 [scrollbar-gutter:stable]">
              <div className="space-y-2 pb-3">
                {recentJourneys.map((journey) => (
                  <DashboardLinkRow
                    key={`recent-journey-${journey.id}`}
                    href="/discover"
                    icon={Telescope}
                    title={journey.name}
                    detail={t('home.discoveryWorkspace')}
                    timeLabel={formatRelativeTime(new Date(journey.updatedAt), t)}
                  />
                ))}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={Telescope}
              title={t('home.noRecentJourneys')}
              description={t('home.recentJourneysDescription')}
            />
          )}
        </DashboardCard>
      )
    }

    return (
      <DashboardCard key={sectionId} title={t('home.recentSearches')} icon={SearchIcon}>
        {recentSearches.length > 0 ? (
          <div className="max-h-[32rem] overflow-y-auto pr-2 [scrollbar-gutter:stable]">
            <div className="space-y-2 pb-3">
              {[...recentSearches]
                .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())
                .map((search) => (
                  <DashboardLinkRow
                    key={search.id}
                    href={search.href}
                    icon={SearchIcon}
                    title={search.label}
                    detail={search.mode === 'simple' ? t('home.simpleSearch') : t('home.complexSearch')}
                    timeLabel={formatRelativeTime(new Date(search.occurredAt), t)}
                  />
                ))}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={SearchIcon}
            title={t('home.noRecentSearches')}
            description={t('home.recentSearchesDescription')}
            action={(
              <Button asChild>
                <Link href="/search">{t('searchPage.search')}</Link>
              </Button>
            )}
          />
        )}
      </DashboardCard>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div data-tour-id="home-greeting">
        <PageHeader
          icon={<Home className="h-6 w-6" />}
          title={(
            <>
              <span>{typedGreetingTitle}</span>
              <span className="refx-type-cursor" aria-hidden="true" />
            </>
          )}
          subtitle={greeting.subtitle}
          actions={(
            <Button type="button" variant="outline" className="gap-2" onClick={() => setIsCustomizeDialogOpen(true)}>
              <Settings2 className="h-4 w-4" />
              {t('home.customize')}
            </Button>
          )}
        />
      </div>

      <div className={dashboardPrefs.layout === 'grid' ? 'grid w-full min-w-0 gap-6 lg:grid-cols-2' : 'space-y-6'}>
        {visibleSectionIds.map((sectionId) => renderSection(sectionId))}
      </div>

      <Dialog open={isCustomizeDialogOpen} onOpenChange={setIsCustomizeDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('home.customize')}</DialogTitle>
            <DialogDescription>{t('home.customizeDescription')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="space-y-3">
              <div className="text-sm font-medium">{t('home.layout')}</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setDashboardPrefs((current) => ({ ...current, layout: 'grid' }))}
                  className={`rounded-2xl border p-4 text-left transition ${dashboardPrefs.layout === 'grid' ? 'border-primary bg-primary/5' : 'border-border/70 hover:bg-muted/30'}`}
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-muted/70 text-muted-foreground">
                    <LayoutGrid className="h-5 w-5" />
                  </div>
                  <div className="font-medium">{t('home.gridView')}</div>
                  <div className="text-sm text-muted-foreground">{t('home.gridViewDescription')}</div>
                </button>
                <button
                  type="button"
                  onClick={() => setDashboardPrefs((current) => ({ ...current, layout: 'stacked' }))}
                  className={`rounded-2xl border p-4 text-left transition ${dashboardPrefs.layout === 'stacked' ? 'border-primary bg-primary/5' : 'border-border/70 hover:bg-muted/30'}`}
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-muted/70 text-muted-foreground">
                    <Rows3 className="h-5 w-5" />
                  </div>
                  <div className="font-medium">{t('home.stackedView')}</div>
                  <div className="text-sm text-muted-foreground">{t('home.stackedViewDescription')}</div>
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-sm font-medium">{t('home.sections')}</div>
              <div className="space-y-2">
                {dashboardPrefs.order.map((sectionId, index) => {
                  const meta = sectionMeta.find((section) => section.id === sectionId)
                  if (!meta) return null

                  const visible = !hiddenSectionIds.has(sectionId)

                  return (
                    <div key={sectionId} className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card/70 px-4 py-3">
                      <Checkbox checked={visible} onCheckedChange={(checked) => toggleSectionVisibility(sectionId, checked === true)} />
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/70 text-muted-foreground">
                        <meta.icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-foreground">{meta.label}</div>
                        <div className="text-sm text-muted-foreground">
                          {visible ? t('home.sectionVisible') : t('home.sectionHidden')}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => moveSection(sectionId, 'up')}
                          disabled={index === 0}
                          aria-label={t('home.moveUp')}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => moveSection(sectionId, 'down')}
                          disabled={index === dashboardPrefs.order.length - 1}
                          aria-label={t('home.moveDown')}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" onClick={() => setIsCustomizeDialogOpen(false)}>
              {t('home.done')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
