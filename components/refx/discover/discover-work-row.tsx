'use client'

import { Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/localization'
import type { DiscoverWork } from '@/lib/types'
import { useDiscoverActions, useDiscoverStore } from '@/lib/stores/discover-store'
import { cn } from '@/lib/utils'

export function DiscoverWorkRow({ work }: { work: DiscoverWork }) {
  const t = useT()
  const selectedWorkId = useDiscoverStore((state) => state.selectedWorkId)
  const hoveredWorkId = useDiscoverStore((state) => state.hoveredWorkId)
  const { setSelectedWork, setHoveredWork, toggleStar } = useDiscoverActions()

  return (
    <div
      data-discover-work-row={work.id}
      onMouseEnter={() => setHoveredWork(work.id)}
      onMouseLeave={() => setHoveredWork(null)}
      className={cn(
        'w-full min-w-0 overflow-hidden rounded-2xl border px-3 py-2.5 transition',
        selectedWorkId === work.id ? 'border-primary bg-primary/5 dark:bg-primary/10' : 'border-border hover:border-primary/30',
        hoveredWorkId === work.id && 'border-sky-400 bg-sky-50/70 dark:border-sky-400/60 dark:bg-sky-400/10',
      )}
    >
      <div className="flex min-w-0 max-w-full items-start gap-2 overflow-hidden">
        <button
          type="button"
          onClick={() => setSelectedWork(work.id)}
          className="min-w-0 flex-1 overflow-hidden text-left"
        >
          <div className="line-clamp-2 break-words text-sm font-medium leading-5">{work.title}</div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {work.firstAuthorLabel}
            {work.year ? ` - ${work.year}` : ''}
          </div>
        </button>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => toggleStar(work.id)}>
          <Star className={cn('h-4 w-4', work.isStarred ? 'fill-current text-amber-500' : 'text-muted-foreground')} />
        </Button>
      </div>
      <div className="mt-1.5 flex max-w-full flex-wrap gap-1.5 overflow-hidden">
        {work.inLibrary ? <Badge variant="secondary">{t('discoverPage.inLibrary')}</Badge> : null}
      </div>
    </div>
  )
}
