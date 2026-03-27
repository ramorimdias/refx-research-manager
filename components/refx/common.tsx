'use client'

import { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { MetadataStatus, OcrStatus, ReadingStage } from '@/lib/types'
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  BookMarked,
  BookOpen,
  CheckCheck,
  CheckCircle2,
  Clock,
  Eye,
  FileCheck,
  Loader2,
  XCircle,
} from 'lucide-react'

const readingStageConfig: Record<ReadingStage, { label: string; icon: typeof BookOpen; className: string }> = {
  unread: { label: 'Unread', icon: BookOpen, className: 'bg-muted text-muted-foreground' },
  reading: { label: 'Reading', icon: BookMarked, className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  skimmed: { label: 'Skimmed', icon: Eye, className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  read: { label: 'Read', icon: CheckCircle2, className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  archived: { label: 'Archived', icon: Archive, className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
}

const metadataStatusConfig: Record<MetadataStatus, { label: string; icon: typeof AlertCircle; className: string }> = {
  missing: { label: 'Missing', icon: AlertCircle, className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  partial: { label: 'Partial', icon: AlertTriangle, className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  complete: { label: 'Complete', icon: CheckCheck, className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
}

const ocrStatusConfig: Record<OcrStatus, { label: string; icon: typeof Clock; className: string }> = {
  pending: { label: 'OCR Pending', icon: Clock, className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  processing: { label: 'Processing', icon: Loader2, className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  complete: { label: 'OCR Complete', icon: FileCheck, className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  failed: { label: 'OCR Failed', icon: XCircle, className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  not_needed: { label: 'Native Text', icon: CheckCheck, className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
}

export function ReadingStageBadge({ stage }: { stage: ReadingStage }) {
  const config = readingStageConfig[stage]
  const Icon = config.icon
  return (
    <Badge variant="secondary" className={cn('gap-1 font-normal', config.className)}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  )
}

export function MetadataStatusBadge({ status }: { status: MetadataStatus }) {
  const config = metadataStatusConfig[status]
  const Icon = config.icon
  return (
    <Badge variant="secondary" className={cn('gap-1 font-normal', config.className)}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  )
}

export function OcrStatusBadge({ status }: { status: OcrStatus }) {
  const config = ocrStatusConfig[status]
  const Icon = config.icon
  return (
    <Badge variant="secondary" className={cn('gap-1 font-normal', config.className)}>
      <Icon className={cn('h-3 w-3', status === 'processing' && 'animate-spin')} />
      {config.label}
    </Badge>
  )
}

export function TagChip({
  name,
  color,
  onClick,
  removable,
  onRemove,
}: {
  name: string
  color?: string
  onClick?: () => void
  removable?: boolean
  onRemove?: () => void
}) {
  return (
    <Badge
      variant="secondary"
      className={cn('gap-1.5 font-normal cursor-default', onClick && 'cursor-pointer hover:bg-secondary/80')}
      onClick={onClick}
    >
      {color && <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
      {name}
      {removable && onRemove && (
        <button
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onRemove()
          }}
          className="ml-1 hover:text-foreground"
        >
          x
        </button>
      )}
    </Badge>
  )
}

export function NewBadge() {
  return (
    <Badge
      variant="outline"
      className="border-emerald-300/70 bg-emerald-500/[0.08] text-[10px] font-semibold tracking-[0.14em] text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300"
    >
      NEW
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
            'text-lg transition-colors',
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
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 rounded-full bg-muted p-4">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="mb-2 text-lg font-semibold">{title}</h3>
      <p className="mb-6 max-w-sm text-sm text-muted-foreground">{description}</p>
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
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold">{value}</span>
        {trend && (
          <span className={cn('text-xs', trend.value >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
            {trend.value >= 0 ? '+' : ''}
            {trend.value}% {trend.label}
          </span>
        )}
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
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}
