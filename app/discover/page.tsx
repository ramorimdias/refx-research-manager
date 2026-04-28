'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ReactFlowProvider } from 'reactflow'
import { Orbit, Pencil, Rocket, Star, Telescope, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { DiscoverEmptyState } from '@/components/refx/discover/discover-empty-state'
import { DiscoverTimeline } from '@/components/refx/discover/discover-timeline'
import { DiscoverLeftPane } from '@/components/refx/discover/discover-left-pane'
import { DiscoverRightPane } from '@/components/refx/discover/discover-right-pane'
import { DiscoverMap } from '@/components/refx/discover/discover-map'
import { PageHeader } from '@/components/refx/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { filterDiscoverItems } from '@/lib/services/discover-filter-service'
import { countDiscoverJourneyStars, countDiscoverStepStars } from '@/lib/services/discover-star-count-service'
import { useDiscoverActions, useDiscoverStore } from '@/lib/stores/discover-store'
import { useT } from '@/lib/localization'
import { cn } from '@/lib/utils'

type DiscoverViewMode = 'home' | 'seed' | 'workspace'
const CURRENT_UNSAVED_JOURNEY_ID = '__current_unsaved_journey__'
const HOME_JOURNEY_PREVIEW_STEP_LIMIT = 5

function formatUnsavedJourneyTimestamp() {
  const date = new Date()
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = String(date.getFullYear()).slice(-2)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${minutes}`
}

function SeedDiscoveryLoading() {
  const t = useT()

  return (
    <div className="flex min-h-[360px] w-full flex-col items-center justify-center rounded-3xl border bg-card/90 p-8 text-center shadow-sm">
      <div className="relative flex h-40 w-40 items-center justify-center">
        <div className="absolute inset-5 rounded-full border border-dashed border-primary/25" />
        <div className="absolute inset-0 rounded-full bg-primary/5 blur-2xl" />
        <div className="relative z-10 flex h-20 w-20 items-center justify-center rounded-full border bg-background text-primary shadow-sm">
          <Orbit className="h-10 w-10 animate-spin [animation-duration:3.8s]" />
        </div>
        <div className="discover-seed-rocket-orbit absolute inset-0">
          <div className="absolute left-1/2 top-0 -translate-x-1/2">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border bg-card text-amber-500 shadow-lg">
              <Rocket className="h-5 w-5 rotate-[50deg]" />
            </div>
          </div>
        </div>
      </div>
      <div className="mt-5 space-y-1">
        <div className="text-base font-semibold text-foreground">{t('discoverPage.loadingFirstStep')}</div>
        <div className="text-sm text-muted-foreground">{t('discoverPage.loadingFirstStepDescription')}</div>
      </div>
      <style jsx>{`
        .discover-seed-rocket-orbit {
          animation: discover-seed-rocket-orbit 2.6s linear infinite;
          transform-origin: center;
          will-change: transform;
        }

        @keyframes discover-seed-rocket-orbit {
          from {
            transform: rotate(0deg);
          }

          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  )
}

function DiscoverPageContent() {
  const t = useT()
  const searchParams = useSearchParams()
  const sourceWork = useDiscoverStore((state) => state.sourceWork)
  const activeJourney = useDiscoverStore((state) => state.activeJourney)
  const activeStepIndex = useDiscoverStore((state) => state.activeStepIndex)
  const selectedWorkId = useDiscoverStore((state) => state.selectedWorkId)
  const hoveredWorkId = useDiscoverStore((state) => state.hoveredWorkId)
  const savedJourneys = useDiscoverStore((state) => state.savedJourneys)
  const isLoading = useDiscoverStore((state) => state.isLoading)
  const error = useDiscoverStore((state) => state.error)
  const {
    resetDiscoverSession,
    loadSeedDocument,
    openStep,
    saveCurrentJourney,
    deleteSavedJourney,
    loadSavedJourney,
    setSelectedWork,
  } = useDiscoverActions()
  const [journeyName, setJourneyName] = useState('')
  const [isEditingJourneyName, setIsEditingJourneyName] = useState(false)
  const [viewMode, setViewMode] = useState<DiscoverViewMode>('home')
  const [journeyPendingDeleteId, setJourneyPendingDeleteId] = useState<string | null>(null)
  const skipJourneyNameBlurRef = useRef(false)
  const lastOpenedDocumentIdRef = useRef<string | null>(null)

  const currentStep = activeStepIndex >= 0 ? activeJourney?.steps[activeStepIndex] ?? null : null
  const starredItems = useMemo(() => {
    if (!activeJourney) return []
    const seen = new Map<string, typeof activeJourney.steps[number]['items'][number]>()
    for (const step of activeJourney.steps) {
      for (const item of step.items) {
        if (item.isStarred) seen.set(item.id, item)
      }
      if (step.sourceWork.isStarred) seen.set(step.sourceWork.id, step.sourceWork)
    }
    return Array.from(seen.values())
  }, [activeJourney])
  const starredLinks = useMemo(() => {
    if (!activeJourney) return []

    const starredIds = new Set(starredItems.map((item) => item.id))
    if (sourceWork?.isStarred) starredIds.add(sourceWork.id)

    const seen = new Set<string>()
    const links: Array<{ sourceId: string; targetId: string }> = []

    for (const step of activeJourney.steps) {
      const sourceId = step.sourceWork.id
      if (!starredIds.has(sourceId)) continue

      for (const item of step.items) {
        if (!starredIds.has(item.id) || item.id === sourceId) continue

        const key = `${sourceId}:${item.id}`
        if (seen.has(key)) continue
        seen.add(key)
        links.push({ sourceId, targetId: item.id })
      }
    }

    return links
  }, [activeJourney, sourceWork?.id, sourceWork?.isStarred, starredItems])

  const currentItems = useMemo(() => {
    if (activeStepIndex === -1) return starredItems
    if (!currentStep) return []
    return filterDiscoverItems(currentStep.items, currentStep.filters)
  }, [activeStepIndex, currentStep, starredItems])

  const selectedWork = useMemo(() => {
    const pool = [
      ...(sourceWork ? [sourceWork] : []),
      ...(activeJourney?.steps.flatMap((step) => [step.sourceWork, ...step.items]) ?? []),
      ...starredItems,
    ]
    return pool.find((item) => item.id === selectedWorkId) ?? sourceWork ?? null
  }, [activeJourney?.steps, selectedWorkId, sourceWork, starredItems])
  const showStepFilters = Boolean(
    currentStep
    && selectedWork
    && selectedWork.id === currentStep.sourceWork.id,
  )
  const activeStepFilterCount = currentStep
    ? [currentStep.filters.yearMin, currentStep.filters.yearMax].filter((value) => value != null).length
    : 0
  const showFilterHint = Boolean(currentStep && currentStep.items.length > 50)
  const isSavedJourney = Boolean(activeJourney && savedJourneys.some((journey) => journey.id === activeJourney.id))
  const normalizedJourneyName = journeyName.trim()
  const activeJourneyName = activeJourney?.name.trim() ?? ''
  const isJourneyNameDirty = Boolean(activeJourney && normalizedJourneyName !== activeJourneyName)
  const visibleJourneyName = activeJourney?.name || t('discoverPage.defaultJourneyName')
  const homeJourneyEntries = useMemo(() => {
    const saved = [...savedJourneys].sort((left, right) => (
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    ))

    if (activeJourney && !isSavedJourney) {
      return [
        {
          id: CURRENT_UNSAVED_JOURNEY_ID,
          journey: activeJourney,
          isUnsavedCurrent: true,
        },
        ...saved.map((journey) => ({
          id: journey.id,
          journey,
          isUnsavedCurrent: false,
        })),
      ]
    }

    return saved.map((journey) => ({
      id: journey.id,
      journey,
      isUnsavedCurrent: false,
    }))
  }, [activeJourney, isSavedJourney, savedJourneys])

  const focusCurrentStepFilters = () => {
    if (!currentStep) return
    setSelectedWork(currentStep.sourceWork.id)
    window.setTimeout(() => {
      document.getElementById('discover-step-filters')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 40)
  }

  const leftPaneLabel = activeStepIndex === -1
    ? <span>{t('discoverPage.starredWorks')}</span>
    : currentStep
      ? (
        <span>
          <span
            className={cn(
              'font-bold',
              currentStep.mode === 'references' ? 'text-sky-600 dark:text-sky-300' : 'text-rose-600 dark:text-rose-300',
            )}
          >
            {currentStep.mode === 'references' ? t('discoverPage.referencesLabel') : t('discoverPage.citationsLabel')}
          </span>
          <span className="text-muted-foreground"> {t('discoverPage.of')} </span>
          <span className="font-bold text-amber-500 dark:text-amber-300">
            {currentStep.sourceWork.firstAuthorLabel}
            {currentStep.sourceWork.year ? `, ${currentStep.sourceWork.year}` : ''}
          </span>
        </span>
      )
      : <span>{t('discoverPage.currentStep')}</span>

  useEffect(() => {
    setJourneyName(activeJourney?.name ?? '')
    setIsEditingJourneyName(false)
  }, [activeJourney?.id, activeJourney?.name])

  useEffect(() => {
    const documentId = searchParams.get('documentId')
    if (!documentId) return
    if (lastOpenedDocumentIdRef.current === documentId) return

    lastOpenedDocumentIdRef.current = documentId
    resetDiscoverSession()
    setViewMode('seed')
    void loadSeedDocument(documentId)
  }, [loadSeedDocument, resetDiscoverSession, searchParams])

  const handleSaveJourney = () => {
    if (!activeJourney) return
    const fallbackLabel = sourceWork?.firstAuthorLabel
      ?? activeJourney?.steps[0]?.sourceWork.firstAuthorLabel
      ?? t('discoverPage.defaultJourneyName')
    const savedName = normalizedJourneyName || `${fallbackLabel} journey`
    saveCurrentJourney(savedName)
    setJourneyName(savedName)
    setIsEditingJourneyName(false)
    toast.success(t('discoverPage.saveJourney'), {
      description: isSavedJourney
        ? t('discoverPage.journeyUpdatedDescription', { name: savedName })
        : t('discoverPage.journeySavedDescription', { name: savedName }),
    })
  }

  const handleStartNewJourney = () => {
    if (activeJourney && !isSavedJourney) {
      saveCurrentJourney(`Unsaved ${formatUnsavedJourneyTimestamp()} journey`)
    }

    resetDiscoverSession()
    setJourneyName('')
    setViewMode('seed')
  }

  const handleCommitJourneyName = () => {
    if (skipJourneyNameBlurRef.current) {
      skipJourneyNameBlurRef.current = false
      return
    }

    if (isJourneyNameDirty || !isSavedJourney) {
      handleSaveJourney()
      return
    }

    setIsEditingJourneyName(false)
  }

  const handleDeleteJourney = (journeyId: string) => {
    if (journeyId === CURRENT_UNSAVED_JOURNEY_ID) {
      resetDiscoverSession()
      setJourneyPendingDeleteId(null)
      return
    }
    deleteSavedJourney(journeyId)
    setJourneyPendingDeleteId((current) => (current === journeyId ? null : current))
  }

  if (viewMode === 'home') {
    return (
      <div className="relative flex h-full min-h-0 flex-col gap-4 overflow-hidden p-4 md:p-6">
        <PageHeader
          icon={<Telescope className="h-6 w-6" />}
          title={t('discoverPage.title')}
          subtitle={t('discoverPage.subtitle')}
        />

        <button
          type="button"
          className="flex w-full items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-3 text-left transition hover:border-primary/40 hover:bg-accent/30"
          onClick={handleStartNewJourney}
        >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Rocket className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <div className="text-lg font-semibold">{t('discoverPage.startNewJourney')}</div>
                <div className="text-sm text-muted-foreground">{t('discoverPage.emptyDescription')}</div>
              </div>
            </div>
        </button>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {homeJourneyEntries.length > 0 ? homeJourneyEntries.map(({ id, journey, isUnsavedCurrent }) => {
                const isPendingDelete = journeyPendingDeleteId === id
                const isActiveEntry = activeJourney?.id === journey.id || (isUnsavedCurrent && activeJourney && !isSavedJourney)
                const lastStep = journey.steps[journey.steps.length - 1] ?? null
                const totalStarCount = countDiscoverJourneyStars(journey)
                return (
                  <div
                    key={id}
                    className={cn(
                      'rounded-2xl border px-4 py-3 transition',
                      isActiveEntry
                        ? 'border-primary/40 bg-primary/5 shadow-sm'
                        : 'border-border bg-card hover:border-primary/40 hover:bg-accent/30',
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <button
                        type="button"
                        onClick={() => {
                          if (isUnsavedCurrent) {
                            setViewMode('workspace')
                            return
                          }
                          loadSavedJourney(journey.id)
                          setViewMode('workspace')
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <div className="font-medium">{journey.name}</div>
                          {isUnsavedCurrent ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-400/15 dark:text-amber-200">
                              {t('discoverPage.unsaved')}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-3 flex items-center gap-3 overflow-hidden pb-1 pt-2">
                          {journey.steps
                            .slice(Math.max(0, journey.steps.length - HOME_JOURNEY_PREVIEW_STEP_LIMIT))
                            .map((step, previewIndex, visibleSteps) => {
                              const index = journey.steps.length - visibleSteps.length + previewIndex
                              const isLastVisibleStep = previewIndex === visibleSteps.length - 1
                              const stepStarCount = countDiscoverStepStars(step)
                              return (
                                <div key={step.id} className="flex items-center gap-3">
                                  {previewIndex === 0 && index > 0 ? (
                                    <>
                                      <span className="text-xs font-medium text-muted-foreground">...</span>
                                      <div className="h-px w-6 bg-border" />
                                    </>
                                  ) : null}
                                  {previewIndex > 0 ? <div className="h-px w-10 bg-border" /> : null}
                                  <span
                                    className={cn(
                                      'relative flex h-10 min-w-10 shrink-0 items-center justify-center rounded-full border px-3 text-sm font-semibold',
                                      index === journey.steps.length - 1
                                        ? 'border-primary bg-primary text-primary-foreground'
                                        : 'border-border bg-background text-muted-foreground',
                                    )}
                                  >
                                    {index + 1}
                                    {stepStarCount > 0 ? (
                                      <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border border-background bg-amber-400 px-1 text-[10px] font-black leading-none text-slate-950 shadow-sm">
                                        {stepStarCount}
                                      </span>
                                    ) : null}
                                  </span>
                                  {isLastVisibleStep && lastStep ? (
                                    <span className="min-w-0 truncate text-sm text-muted-foreground">
                                      <span className={cn('font-semibold', lastStep.mode === 'references' ? 'text-sky-600 dark:text-sky-300' : 'text-rose-600 dark:text-rose-300')}>
                                        {lastStep.mode === 'references' ? t('discoverPage.referencesLabel') : t('discoverPage.citationsLabel')}
                                      </span>
                                      <span>{` ${t('discoverPage.of')} ${lastStep.sourceWork.firstAuthorLabel}`}</span>
                                      {lastStep.sourceWork.year ? <span>{`, ${lastStep.sourceWork.year}`}</span> : null}
                                    </span>
                                  ) : null}
                                </div>
                              )
                            })}
                          {journey.steps.length > 0 ? <div className="h-px w-10 bg-border" /> : null}
                          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
                            <Star className="h-4 w-4" />
                            <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border border-background bg-amber-400 px-1 text-[10px] font-black leading-none text-slate-950 shadow-sm">
                              {totalStarCount}
                            </span>
                          </span>
                        </div>
                      </button>
                      {isPendingDelete ? (
                        <div className="flex shrink-0 items-center gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setJourneyPendingDeleteId(null)}
                          >
                            {t('referencesPage.cancel')}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="bg-red-600 text-white hover:bg-red-700"
                            onClick={() => handleDeleteJourney(id)}
                          >
                            {t('mapsPage.delete')}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-600"
                          onClick={() => setJourneyPendingDeleteId(id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                )
              }) : (
                <div className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                  {t('discoverPage.noSavedJourneys')}
                </div>
              )}
        </div>

      </div>
    )
  }

  if (viewMode === 'seed' && !sourceWork) {
    return <DiscoverEmptyState onBack={() => setViewMode('home')} />
  }

  if (viewMode === 'seed' && sourceWork && !activeJourney) {
    return (
      <div className="relative flex h-full min-h-0 flex-col gap-4 overflow-hidden p-4 md:p-6">
        <PageHeader
          icon={<Telescope className="h-6 w-6" />}
          title={t('discoverPage.title')}
          subtitle={t('discoverPage.seedPreviewDescription')}
          actions={(
            <>
              <Button variant="outline" className="rounded-full" onClick={() => setViewMode('home')}>
                {t('discoverPage.backToHome')}
              </Button>
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => {
                  resetDiscoverSession()
                  setViewMode('seed')
                }}
              >
                {t('discoverPage.chooseAnotherDocument')}
              </Button>
            </>
          )}
        />

        {error ? (
          <div className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-200">{error}</div>
        ) : null}

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
          <div className="w-full max-w-xl">
            {isLoading ? <SeedDiscoveryLoading /> : <DiscoverRightPane work={sourceWork} />}
          </div>
        </div>

      </div>
    )
  }

  if (!sourceWork) {
    return <DiscoverEmptyState />
  }

  return (
      <div className="relative flex h-full min-h-0 flex-col gap-4 overflow-hidden p-4 md:p-6">
      <PageHeader
        icon={<Telescope className="h-6 w-6" />}
        title={isEditingJourneyName ? (
          <Input
            autoFocus
            value={journeyName}
            onChange={(event) => setJourneyName(event.target.value)}
            onBlur={handleCommitJourneyName}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                handleCommitJourneyName()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                skipJourneyNameBlurRef.current = true
                setJourneyName(activeJourney?.name ?? '')
                setIsEditingJourneyName(false)
              }
            }}
            placeholder={t('discoverPage.saveJourneyPlaceholder')}
            className="h-10 w-[min(28rem,70vw)] max-w-full bg-background/80 text-lg font-semibold"
          />
        ) : (
          <button
            type="button"
            className="group flex min-w-0 items-center gap-2 text-left"
            onClick={() => setIsEditingJourneyName(true)}
            title={t('discoverPage.saveName')}
          >
            <span className="truncate">{visibleJourneyName}</span>
            <Pencil className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
          </button>
        )}
        subtitle={sourceWork ? `${sourceWork.firstAuthorLabel}${sourceWork.year ? `, ${sourceWork.year}` : ''}` : undefined}
        actions={(
          <Button variant="outline" className="rounded-full" onClick={() => setViewMode('home')}>
            {t('discoverPage.backToHome')}
          </Button>
        )}
      />

      {activeJourney ? (
        <DiscoverTimeline journey={activeJourney} activeStepIndex={activeStepIndex} onOpenStep={openStep} />
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-200">{error}</div>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden xl:grid-cols-[340px_minmax(0,1fr)_360px]">
        <DiscoverLeftPane
          label={leftPaneLabel}
          step={currentStep}
          items={currentItems}
          showFilterHint={showFilterHint}
          onFilterHintClick={focusCurrentStepFilters}
        />
        <div className="min-h-0 overflow-hidden">
          <DiscoverMap
            sourceWork={activeStepIndex === -1 ? sourceWork : currentStep?.sourceWork ?? sourceWork}
            items={currentItems}
            selectedWorkId={selectedWorkId}
            hoveredWorkId={hoveredWorkId}
            mode={activeStepIndex === -1 ? 'starred' : currentStep?.mode}
            isLoading={isLoading}
            starredLinks={activeStepIndex === -1 ? starredLinks : []}
            activeFilterCount={activeStepIndex === -1 ? 0 : activeStepFilterCount}
          />
        </div>
        <DiscoverRightPane
          work={selectedWork}
          showStepFilters={showStepFilters}
          filters={currentStep?.filters ?? {}}
          currentMode={currentStep?.mode ?? null}
        />
      </div>
    </div>
  )
}

export default function DiscoverPage() {
  return (
    <ReactFlowProvider>
      <DiscoverPageContent />
    </ReactFlowProvider>
  )
}
