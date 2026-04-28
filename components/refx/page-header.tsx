import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type PageHeaderProps = {
  icon: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
  contentClassName?: string
}

export function PageHeader({
  icon,
  title,
  subtitle,
  actions,
  className,
  contentClassName,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[1.75rem] border border-border/70 bg-card/92 shadow-[0_10px_28px_rgba(15,23,42,0.06)]',
        className,
      )}
    >
      <div className="absolute inset-0 bg-[linear-gradient(135deg,hsl(var(--primary)/0.20)_0%,hsl(var(--accent)/0.16)_34%,hsl(var(--background)/0.94)_72%,hsl(var(--card)/0.96)_100%)] dark:bg-[linear-gradient(135deg,hsl(var(--primary)/0.30)_0%,hsl(var(--accent)/0.22)_36%,hsl(var(--background)/0.92)_74%,hsl(var(--card)/0.96)_100%)]" />
      <div className="absolute -left-10 top-0 h-28 w-32 rounded-full bg-[hsl(var(--primary)/0.14)] blur-3xl dark:bg-[hsl(var(--primary)/0.22)]" />
      <div className="absolute right-0 top-0 h-24 w-40 rounded-full bg-[hsl(var(--accent)/0.12)] blur-3xl dark:bg-[hsl(var(--accent)/0.18)]" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border/70 to-transparent" />

      <div
        className={cn(
          'relative flex flex-col gap-4 px-5 py-5 sm:px-6 lg:flex-row lg:items-start lg:justify-between',
          contentClassName,
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-4 lg:pr-6">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-background/78 text-primary shadow-[inset_0_1px_0_hsl(var(--background)/0.65)] backdrop-blur">
            {icon}
          </div>
          <div className="min-w-0 space-y-1">
            <div className="truncate text-2xl font-semibold tracking-tight text-foreground">{title}</div>
            {subtitle ? (
              <p className="max-w-3xl truncate text-sm leading-6 text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
        </div>

        <div className="shrink-0 lg:w-auto lg:flex-none">
          {actions ? (
            <div className="relative flex min-h-[3.5rem] flex-nowrap items-center gap-2 lg:justify-end">
              {actions}
            </div>
          ) : (
            <div className="hidden min-h-[3.5rem] lg:block lg:w-[1px]" aria-hidden="true" />
          )}
        </div>
      </div>
    </div>
  )
}
