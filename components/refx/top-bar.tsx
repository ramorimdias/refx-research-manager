'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Command, Moon, Search, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/lib/store'
import { useTheme } from 'next-themes'
import { Kbd } from '@/components/ui/kbd'
import { loadAppSettings, saveAppSettings } from '@/lib/app-settings'

export function TopBar() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const {
    globalSearchQuery,
    setGlobalSearchQuery,
    setPersistentSearch,
    toggleCommandPalette,
    isDesktopApp,
  } = useAppStore()
  const { setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const submitGlobalSearch = () => {
    setPersistentSearch({ query: globalSearchQuery.trim() })
    router.push(`/search?q=${encodeURIComponent(globalSearchQuery.trim())}`)
  }

  const toggleTheme = async () => {
    const nextTheme = resolvedTheme === 'dark' ? 'light' : 'dark'
    setTheme(nextTheme)

    const settings = await loadAppSettings(isDesktopApp)
    await saveAppSettings(isDesktopApp, {
      ...settings,
      theme: nextTheme,
    })
  }

  return (
    <header className="flex h-14 items-center justify-between gap-4 border-b border-border bg-background px-4">
      <div className="relative w-full max-w-2xl">
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
          className="pl-9"
          placeholder="Search your library and press Enter"
        />
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="gap-2" onClick={() => toggleCommandPalette(true)}>
          <Command className="h-4 w-4" />
          <span className="hidden md:inline">Commands</span>
          <Kbd>
            <span className="text-xs">Ctrl</span>K
          </Kbd>
        </Button>

        {mounted && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void toggleTheme()}
            aria-label="Toggle theme"
          >
            {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        )}

        <Button variant="ghost" size="sm" asChild className="hidden lg:inline-flex">
          <Link href="/settings">Settings</Link>
        </Button>
      </div>
    </header>
  )
}
