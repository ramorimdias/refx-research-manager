'use client'

import { useEffect, useRef } from 'react'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DiscoverJourney } from '@/lib/types'
import { countDiscoverJourneyStars, countDiscoverStepStars } from '@/lib/services/discover-star-count-service'

export function DiscoverTimeline({
  journey,
  activeStepIndex,
  onOpenStep,
}: {
  journey: DiscoverJourney
  activeStepIndex: number
  onOpenStep: (index: number) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const totalStarCount = countDiscoverJourneyStars(journey)

  useEffect(() => {
    if (!containerRef.current) return
    const target = containerRef.current.querySelector<HTMLElement>(`[data-discover-timeline-step="${activeStepIndex}"]`)
    target?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'auto' })
  }, [activeStepIndex])

  return (
    <div ref={containerRef} className="flex items-center gap-3 overflow-auto rounded-2xl border bg-background/90 px-4 py-3">
      <button
        type="button"
        onClick={() => onOpenStep(-1)}
        data-discover-timeline-step={-1}
        className={cn(
          'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition',
          activeStepIndex === -1 ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:border-primary/40',
        )}
      >
        <Star className="h-4 w-4" />
        <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border border-background bg-amber-400 px-1 text-[10px] font-black leading-none text-slate-950 shadow-sm">
          {totalStarCount}
        </span>
      </button>
      {journey.steps.map((step, index) => {
        const stepStarCount = countDiscoverStepStars(step)

        return (
          <div key={step.id} className="flex items-center gap-3">
            <div className="h-px w-10 bg-border" />
            <button
              type="button"
              onClick={() => onOpenStep(index)}
              data-discover-timeline-step={index}
              className={cn(
                'relative flex h-10 min-w-10 shrink-0 items-center justify-center rounded-full border px-3 text-sm font-semibold transition',
                activeStepIndex === index ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:border-primary/40',
              )}
            >
              {index + 1}
              {stepStarCount > 0 ? (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border border-background bg-amber-400 px-1 text-[10px] font-black leading-none text-slate-950 shadow-sm">
                  {stepStarCount}
                </span>
              ) : null}
            </button>
          </div>
        )
      })}
    </div>
  )
}
