'use client'

import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef } from 'react'
import { DiscoverWorkRow } from '@/components/refx/discover/discover-work-row'
import { formatDiscoverFilterSummary } from '@/lib/services/discover-filter-service'
import type { DiscoverJourneyStep, DiscoverWork } from '@/lib/types'
import { useDiscoverStore } from '@/lib/stores/discover-store'
import { useLocale, useT } from '@/lib/localization'

export function DiscoverLeftPane({
  label,
  step,
  items,
  showFilterHint = false,
  onFilterHintClick,
}: {
  label: ReactNode
  step: DiscoverJourneyStep | null
  items: DiscoverWork[]
  showFilterHint?: boolean
  onFilterHintClick?: () => void
}) {
  const t = useT()
  const { locale } = useLocale()
  const hoveredWorkId = useDiscoverStore((state) => state.hoveredWorkId)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const filters = step?.filters ?? {}
  const sortedItems = useMemo(
    () => [...items].sort((left, right) => {
      const leftYear = left.year ?? Number.MIN_SAFE_INTEGER
      const rightYear = right.year ?? Number.MIN_SAFE_INTEGER
      if (leftYear !== rightYear) return rightYear - leftYear
      return left.title.localeCompare(right.title)
    }),
    [items],
  )

  useEffect(() => {
    if (!hoveredWorkId || !containerRef.current) return
    const row = containerRef.current.querySelector<HTMLElement>(`[data-discover-work-row="${hoveredWorkId}"]`)
    row?.scrollIntoView({ block: 'nearest', behavior: 'auto' })
  }, [hoveredWorkId])

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden rounded-[28px] border bg-card/95 p-4">
      <div className="space-y-1">
        <div className="text-lg font-semibold leading-tight">{label}</div>
        <div className="text-sm text-muted-foreground">{formatDiscoverFilterSummary(filters, locale)}</div>
      </div>
      {showFilterHint ? (
        <button
          type="button"
          onClick={onFilterHintClick}
          className="rounded-2xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-left text-sm text-amber-900 transition hover:border-amber-300 hover:bg-amber-50 dark:border-amber-500/30 dark:bg-amber-400/10 dark:text-amber-100 dark:hover:border-amber-400/40 dark:hover:bg-amber-400/15"
        >
          {t('discoverPage.largeStepHint')}
        </button>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <div ref={containerRef} className="mx-auto w-full max-w-[calc(100%-8px)] space-y-2">
          {sortedItems.map((work) => <DiscoverWorkRow key={work.id} work={work} />)}
          {sortedItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              {t('discoverPage.noResults')}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
