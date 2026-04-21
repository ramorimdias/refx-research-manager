'use client'

import { Handle, Position, type NodeProps } from 'reactflow'
import { cn } from '@/lib/utils'
import type { DiscoverWork } from '@/lib/types'

export type DiscoverMapNodeData = {
  work: DiscoverWork
  isSource?: boolean
  isSelected?: boolean
  isHovered?: boolean
  isDimmed?: boolean
}

export function DiscoverMapNode({ data }: NodeProps<DiscoverMapNodeData>) {
  const { work, isSource, isSelected, isHovered, isDimmed } = data
  const showExpandedLabel = Boolean(isHovered || isSelected)
  const baseLabel = `${work.firstAuthorLabel}${work.year ? `, ${work.year}` : ''}`

  return (
    <div className="relative">
      <div
        className={cn(
          'h-[56px] w-[56px] rounded-full border bg-background shadow-sm transition dark:border-slate-500 dark:bg-slate-950',
          isSource && 'border-primary shadow-[0_0_0_10px_rgba(14,165,233,0.12)]',
          isSelected && 'border-amber-400 shadow-[0_0_0_10px_rgba(251,191,36,0.16)]',
          work.inLibrary && 'ring-2 ring-emerald-300/70',
          isHovered && 'scale-[1.06]',
          isDimmed && 'opacity-20',
        )}
      />
      {work.isStarred ? (
        <div className={cn('pointer-events-none absolute -right-1 -top-1 text-[12px] leading-none', isDimmed && 'opacity-20')}>
          *
        </div>
      ) : null}
      <div
        className={cn(
          'pointer-events-none absolute left-1/2 top-full mt-2 w-[220px] -translate-x-1/2 text-center text-xs transition',
          isDimmed && 'opacity-20',
        )}
      >
        <div
          className="font-medium text-foreground [-webkit-text-stroke:3px_rgba(255,255,255,0.98)] [paint-order:stroke_fill] [text-shadow:0_1px_6px_rgba(255,255,255,0.95),0_0_10px_rgba(255,255,255,0.9)] dark:[-webkit-text-stroke:3px_rgba(2,6,23,0.96)] dark:[text-shadow:0_1px_6px_rgba(2,6,23,0.95),0_0_10px_rgba(2,6,23,0.9)]"
        >
          {baseLabel}
        </div>
        {showExpandedLabel ? (
          <div
            className="mx-auto mt-1 max-w-[220px] text-[11px] leading-4 text-muted-foreground [-webkit-text-stroke:2px_rgba(255,255,255,0.96)] [paint-order:stroke_fill] [text-shadow:0_1px_6px_rgba(255,255,255,0.92),0_0_10px_rgba(255,255,255,0.88)] dark:[-webkit-text-stroke:2px_rgba(2,6,23,0.94)] dark:[text-shadow:0_1px_6px_rgba(2,6,23,0.92),0_0_10px_rgba(2,6,23,0.88)]"
          >
            {work.title}
          </div>
        ) : null}
      </div>
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="source" position={Position.Right} className="!opacity-0" />
    </div>
  )
}
