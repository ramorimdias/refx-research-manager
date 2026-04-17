'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, ExternalLink, Star, Telescope } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DiscoverFilters } from '@/components/refx/discover/discover-filters'
import type { DiscoverFilterState, DiscoverWork } from '@/lib/types'
import { getDiscoverStepCacheKey } from '@/lib/services/discovery-service'
import { useDiscoverActions, useDiscoverStore } from '@/lib/stores/discover-store'
import { useT } from '@/lib/localization'
import type { DiscoverMode } from '@/lib/types'

export function DiscoverRightPane({
  work,
  showStepFilters = false,
  filters = {},
  currentMode,
}: {
  work: DiscoverWork | null
  showStepFilters?: boolean
  filters?: DiscoverFilterState
  currentMode?: DiscoverMode | null
}) {
  const t = useT()
  const [isAbstractOpen, setIsAbstractOpen] = useState(false)
  const [pendingAdvanceMode, setPendingAdvanceMode] = useState<DiscoverMode | null>(null)
  const activeJourney = useDiscoverStore((state) => state.activeJourney)
  const activeStepIndex = useDiscoverStore((state) => state.activeStepIndex)
  const cachedSteps = useDiscoverStore((state) => state.cachedSteps)
  const {
    advanceJourneyFromSelected,
    clearCurrentStepFilters,
    hydrateSelectedWorkMetadata,
    prefetchWorkSteps,
    setYearFilterForCurrentStep,
    startJourneyFromSource,
    toggleStar,
  } = useDiscoverActions()

  useEffect(() => {
    if (!work) return
    setIsAbstractOpen(false)
    setPendingAdvanceMode(null)
    void hydrateSelectedWorkMetadata()
    void prefetchWorkSteps(work.id)
  }, [hydrateSelectedWorkMetadata, prefetchWorkSteps, work?.id])

  if (!work) {
    return (
      <div className="flex h-full items-center justify-center rounded-[28px] border bg-card/95 p-4 text-sm text-muted-foreground">
        {t('discoverPage.selectWork')}
      </div>
    )
  }

  const href = work.url ?? (work.doi ? `https://doi.org/${work.doi}` : null)
  const referencesKey = getDiscoverStepCacheKey(work, 'references')
  const citationsKey = getDiscoverStepCacheKey(work, 'citations')
  const referencesCount = cachedSteps.get(referencesKey)?.length ?? work.referencedWorksCount
  const citationsCount = cachedSteps.get(citationsKey)?.length ?? work.citedByCount
  const referencesLabel = referencesCount == null
    ? t('discoverPage.referencesLoading')
    : t('discoverPage.references', { count: referencesCount })
  const citationsLabel = citationsCount == null
    ? t('discoverPage.citationsLoading')
    : t('discoverPage.citations', { count: citationsCount })
  const noReferences = referencesCount === 0
  const noCitations = citationsCount === 0
  const willBranchJourney = Boolean(
    activeJourney
    && activeStepIndex >= 0
    && activeStepIndex < activeJourney.steps.length - 1,
  )

  const continueAdvance = (mode: DiscoverMode) => {
    if (!activeJourney) {
      void startJourneyFromSource(work, mode)
      return
    }
    void advanceJourneyFromSelected(mode)
  }

  const handleAdvance = (mode: DiscoverMode) => {
    if (willBranchJourney) {
      setPendingAdvanceMode(mode)
      return
    }

    continueAdvance(mode)
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-[28px] border bg-card/95">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {work.inLibrary ? <Badge variant="secondary">{t('discoverPage.inLibrary')}</Badge> : null}
          </div>
          <div className="space-y-2">
            <div className="text-xl font-semibold leading-tight">{work.title}</div>
            <div className="text-sm text-muted-foreground">
              {work.authors.join(', ') || t('searchPage.unknownAuthor')}
            </div>
            <div className="text-sm text-muted-foreground">
              {[work.year, work.journal].filter(Boolean).join(' - ') || t('discoverPage.metadataPending')}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => toggleStar(work.id)}
            className={work.isStarred ? 'border-amber-300 text-amber-700 hover:border-amber-400 hover:bg-amber-50' : ''}
          >
            <Star className={work.isStarred ? 'mr-2 h-4 w-4 fill-amber-400 text-amber-400' : 'mr-2 h-4 w-4'} />
            {t('documentTable.favorite')}
          </Button>
          {work.inLibrary && work.libraryDocumentId ? (
            <Button asChild size="sm">
              <Link href={`/reader/view?id=${work.libraryDocumentId}`}>
                {t('searchPage.openReader')}
              </Link>
            </Button>
          ) : null}
          {href ? (
            <Button asChild variant="outline" size="sm">
              <a href={href} target="_blank" rel="noreferrer">
                {t('discoverPage.openSource')}
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
          ) : null}
        </div>

        {showStepFilters ? (
          <div id="discover-step-filters">
            <DiscoverFilters
              filters={filters}
              onChange={(min, max) => setYearFilterForCurrentStep(min, max)}
              onClear={clearCurrentStepFilters}
            />
          </div>
        ) : null}

        <div className="rounded-2xl border bg-background/80">
          <button
            type="button"
            onClick={() => setIsAbstractOpen((current) => !current)}
            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
          >
            <span className="text-sm font-medium text-foreground">{t('discoverPage.abstract')}</span>
            {isAbstractOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          {isAbstractOpen ? (
            <div className="border-t px-3 py-3 text-sm leading-6 text-muted-foreground">
              {work.abstract || t('discoverPage.noAbstract')}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          {pendingAdvanceMode ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-3">
              <div className="text-sm font-medium text-amber-900">
                {t('discoverPage.branchWarning')}
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPendingAdvanceMode(null)}
                >
                  {t('referencesPage.cancel')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="bg-amber-600 text-white hover:bg-amber-700"
                  onClick={() => {
                    const mode = pendingAdvanceMode
                    setPendingAdvanceMode(null)
                    if (mode) continueAdvance(mode)
                  }}
                >
                  {t('discoverPage.continue')}
                </Button>
              </div>
            </div>
          ) : null}
          {(!showStepFilters || currentMode !== 'references') ? (
            <Button
              className="justify-start gap-2 bg-sky-600 text-white hover:bg-sky-700 disabled:bg-slate-200 disabled:text-slate-500"
              disabled={noReferences}
              onClick={() => handleAdvance('references')}
            >
              <Telescope className="h-4 w-4" />
              <span>
                {noReferences
                  ? t('discoverPage.noReferencesFound')
                  : t('discoverPage.discoverReferences', { count: referencesCount ?? '...' })}
              </span>
            </Button>
          ) : null}
          {(!showStepFilters || currentMode !== 'citations') ? (
            <Button
              variant="outline"
              className="justify-start gap-2 border-rose-300 text-rose-700 hover:border-rose-400 hover:bg-rose-50 disabled:border-slate-200 disabled:text-slate-500"
              disabled={noCitations}
              onClick={() => handleAdvance('citations')}
            >
              <Telescope className="h-4 w-4" />
              <span>
                {noCitations
                  ? t('discoverPage.noCitationsFound')
                  : t('discoverPage.discoverCitations', { count: citationsCount ?? '...' })}
              </span>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
