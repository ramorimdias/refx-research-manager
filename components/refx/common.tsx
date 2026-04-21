'use client'

import { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { LibraryMetadataState, MetadataStatus, OcrStatus, ReadingStage } from '@/lib/types'
import {
  AlertCircle,
  BookMarked,
  BookOpen,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock,
  FileCheck,
  Loader2,
  Search,
  XCircle,
} from 'lucide-react'
import { useT } from '@/lib/localization'

const readingStageConfig: Record<ReadingStage, { labelKey: string; icon: typeof BookOpen; className: string }> = {
  unread: { labelKey: 'common.unread', icon: BookOpen, className: 'bg-muted text-muted-foreground' },
  reading: { labelKey: 'common.reading', icon: BookMarked, className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  finished: { labelKey: 'common.finished', icon: CheckCircle2, className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
}

const metadataStatusConfig: Record<MetadataStatus | LibraryMetadataState, { labelKey: string; icon: typeof AlertCircle; className: string }> = {
  missing: { labelKey: 'common.missing', icon: AlertCircle, className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  partial: { labelKey: 'common.missing', icon: AlertCircle, className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  complete: { labelKey: 'common.complete', icon: CheckCheck, className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  missing_doi: { labelKey: 'libraries.missingDoi', icon: Check, className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  fetch_possible: { labelKey: 'documentTable.fetchPossible', icon: Search, className: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
}

const ocrStatusConfig: Record<OcrStatus, { labelKey: string; icon: typeof Clock; className: string }> = {
  pending: { labelKey: 'common.ocrPending', icon: Clock, className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  processing: { labelKey: 'common.processing', icon: Loader2, className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  complete: { labelKey: 'common.ocrComplete', icon: FileCheck, className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  failed: { labelKey: 'common.ocrFailed', icon: XCircle, className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  not_needed: { labelKey: 'common.nativeText', icon: CheckCheck, className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
}

function CompactBadge({
  icon: Icon,
  label,
  className,
}: {
  icon: typeof BookOpen
  label: string
  className: string
}) {
  return (
    <Badge variant="secondary" className={cn('h-6 gap-1.5 rounded-full px-2.5 text-[11px] font-medium', className)}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  )
}

export function ReadingStageBadge({ stage }: { stage: ReadingStage }) {
  const t = useT()
  const config = readingStageConfig[stage]
  return <CompactBadge icon={config.icon} label={t(config.labelKey)} className={config.className} />
}

export function MetadataStatusBadge({ status }: { status: MetadataStatus | LibraryMetadataState }) {
  const t = useT()
  const config = metadataStatusConfig[status]
  return <CompactBadge icon={config.icon} label={t(config.labelKey)} className={config.className} />
}

export function OcrStatusBadge({ status }: { status: OcrStatus }) {
  const t = useT()
  const config = ocrStatusConfig[status]
  const Icon = config.icon
  return (
    <Badge variant="secondary" className={cn('h-6 gap-1.5 rounded-full px-2.5 text-[11px] font-medium', config.className)}>
      <Icon className={cn('h-3 w-3', status === 'processing' && 'animate-spin')} />
      {t(config.labelKey)}
    </Badge>
  )
}

export function TagChip({
  name,
  color,
  onClick,
  removable,
  onRemove,
  className,
}: {
  name: string
  color?: string
  onClick?: () => void
  removable?: boolean
  onRemove?: () => void
  className?: string
}) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        'inline-flex h-6 max-w-full gap-1.5 rounded-full border border-border/70 bg-muted/60 px-2.5 text-[11px] font-medium text-foreground shadow-none',
        onClick && 'cursor-pointer hover:bg-muted',
        className,
      )}
      onClick={onClick}
    >
      {color ? <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} /> : null}
      <span className="min-w-0 truncate">{name}</span>
      {removable && onRemove ? (
        <button
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onRemove()
          }}
          className="ml-0.5 shrink-0 rounded-full px-1 text-muted-foreground transition hover:bg-muted-foreground/10 hover:text-foreground"
        >
          ×
        </button>
      ) : null}
    </Badge>
  )
}

export function NewBadge() {
  const t = useT()
  return (
    <Badge
      variant="outline"
      className="h-5 rounded-full border-emerald-300/60 bg-emerald-500/[0.08] px-2 text-[10px] font-semibold tracking-[0.12em] text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300"
    >
      {t('common.new')}
    </Badge>
  )
}

export function StarRating({
  rating,
  onChange,
  readonly = false,
}: {
  rating: number
  onChange?: (rating: number) => void
  readonly?: boolean
}) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          disabled={readonly}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onChange?.(star === rating ? 0 : star)
          }}
          className={cn(
            'text-base leading-none transition-colors',
            star <= rating ? 'text-amber-400' : 'text-muted-foreground/30',
            !readonly && 'cursor-pointer hover:text-amber-400',
            readonly && 'cursor-default',
          )}
        >
          ★
        </button>
      ))}
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof BookOpen
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/70 text-muted-foreground">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mb-1 text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mb-5 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action}
    </div>
  )
}

export function StatsCard({
  label,
  value,
  trend,
  icon: Icon,
}: {
  label: string
  value: string | number
  trend?: { value: number; label: string }
  icon?: typeof BookOpen
}) {
  return (
    <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        {Icon ? <Icon className="h-4 w-4 text-muted-foreground" /> : null}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold">{value}</span>
        {trend ? (
          <span className={cn('text-xs', trend.value >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
            {trend.value >= 0 ? '+' : ''}
            {trend.value}% {trend.label}
          </span>
        ) : null}
      </div>
    </div>
  )
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="section-header">
      <div>
        <h2 className="section-title">{title}</h2>
        {description ? <p className="section-caption">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}
