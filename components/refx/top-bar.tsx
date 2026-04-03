'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Command, Search, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useUiStore } from '@/lib/stores/ui-store'
import { useT } from '@/lib/localization'

export function TopBar() {
  const t = useT()
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const globalSearchQuery = useUiStore((state) => state.globalSearchQuery)
  const setGlobalSearchQuery = useUiStore((state) => state.setGlobalSearchQuery)
  const setPersistentSearch = useUiStore((state) => state.setPersistentSearch)
  const toggleCommandPalette = useUiStore((state) => state.toggleCommandPalette)

  const submitGlobalSearch = () => {
    setPersistentSearch({ query: globalSearchQuery.trim() })
    router.push(`/search?q=${encodeURIComponent(globalSearchQuery.trim())}`)
  }

  return (
    <header className="flex h-16 items-center justify-between gap-4 border-b border-border/80 bg-background/92 px-5 backdrop-blur">
      <div className="relative w-full max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={globalSearchQuery}
          onChange={(event) => setGlobalSearchQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              submitGlobalSearch()
            }
          }}
          className="h-10 rounded-full border-border/80 bg-card pl-9 pr-4"
          placeholder={t('topBar.searchPlaceholder')}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="gap-2 rounded-full" onClick={() => toggleCommandPalette(true)}>
          <Command className="h-4 w-4" />
          <span className="hidden lg:inline">{t('topBar.command')}</span>
          <span className="hidden text-[11px] text-muted-foreground md:inline">Ctrl K</span>
        </Button>

        <Button variant="outline" size="icon" className="rounded-full" onClick={() => router.push('/settings')} aria-label={t('topBar.openSettings')}>
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}
