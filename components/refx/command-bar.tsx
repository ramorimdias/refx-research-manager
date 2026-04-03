'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BookOpen,
  CloudDownload,
  FileText,
  Home,
  Keyboard,
  Library,
  Moon,
  Search,
  Settings,
  StickyNote,
  Sun,
} from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { useTheme } from 'next-themes'
import { getBaseThemeMode, loadAppSettings, saveAppSettings, toggleStoredThemeVariant } from '@/lib/app-settings'
import { useT } from '@/lib/localization'
import { useDocumentActions, useDocumentStore } from '@/lib/stores/document-store'
import { useLibraryActions, useLibraryStore } from '@/lib/stores/library-store'
import { useRuntimeState } from '@/lib/stores/runtime-store'
import { useUiStore } from '@/lib/stores/ui-store'

export function CommandBar() {
  const t = useT()
  const router = useRouter()
  const commandPaletteOpen = useUiStore((state) => state.commandPaletteOpen)
  const toggleCommandPalette = useUiStore((state) => state.toggleCommandPalette)
  const libraries = useLibraryStore((state) => state.libraries)
  const documents = useDocumentStore((state) => state.documents)
  const { setActiveLibrary } = useLibraryActions()
  const { setActiveDocument } = useDocumentActions()
  const { isDesktopApp } = useRuntimeState()
  const { setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        toggleCommandPalette()
      }
    }

    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [toggleCommandPalette])

  const runCommand = (command: () => void) => {
    toggleCommandPalette(false)
    command()
  }

  const toggleTheme = async () => {
    const settings = await loadAppSettings(isDesktopApp)
    const nextTheme = toggleStoredThemeVariant(settings.theme, resolvedTheme)
    setTheme(getBaseThemeMode(nextTheme))
    await saveAppSettings(isDesktopApp, {
      ...settings,
      theme: nextTheme,
    })
  }

  return (
    <CommandDialog open={commandPaletteOpen} onOpenChange={(open) => toggleCommandPalette(open)}>
      <CommandInput placeholder={t('commandBar.placeholder')} />
      <CommandList>
        <CommandEmpty>{t('commandBar.empty')}</CommandEmpty>

        <CommandGroup heading={t('commandBar.navigation')}>
          <CommandItem onSelect={() => runCommand(() => router.push('/'))}>
            <Home className="mr-2 h-4 w-4" />
            <span>{t('nav.home')}</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/libraries'))}>
            <Library className="mr-2 h-4 w-4" />
            <span>{t('nav.libraries')}</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/reader'))}>
            <BookOpen className="mr-2 h-4 w-4" />
            <span>{t('nav.reader')}</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/references'))}>
            <FileText className="mr-2 h-4 w-4" />
            <span>{t('nav.references')}</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/metadata'))}>
            <CloudDownload className="mr-2 h-4 w-4" />
            <span>{t('nav.metadata')}</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/notes'))}>
            <StickyNote className="mr-2 h-4 w-4" />
            <span>{t('nav.notes')}</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/settings'))}>
            <Settings className="mr-2 h-4 w-4" />
            <span>{t('settings.title')}</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading={t('commandBar.actions')}>
          {mounted && (
            <CommandItem onSelect={() => runCommand(() => void toggleTheme())}>
              {resolvedTheme === 'dark' ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
              <span>{t('commandBar.toggleTheme')}</span>
            </CommandItem>
          )}
          <CommandItem onSelect={() => runCommand(() => router.push('/settings'))}>
            <Keyboard className="mr-2 h-4 w-4" />
            <span>{t('commandBar.openSettings')}</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading={t('commandBar.libraries')}>
          {libraries.map((library) => (
            <CommandItem
              key={library.id}
              onSelect={() =>
                runCommand(() => {
                  setActiveLibrary(library.id)
                  router.push('/libraries')
                })
              }
            >
              <div className="mr-2 h-3 w-3 rounded-full" style={{ backgroundColor: library.color }} />
              <span>{library.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">{t('commandBar.docsCount', { count: library.documentCount })}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading={t('commandBar.recentDocuments')}>
          {documents.slice(0, 5).map((document) => (
            <CommandItem
              key={document.id}
              onSelect={() =>
                runCommand(() => {
                  setActiveDocument(document.id)
                  router.push(`/documents?id=${document.id}&edit=1`)
                })
              }
            >
              <FileText className="mr-2 h-4 w-4" />
              <span className="truncate">{document.title}</span>
              {document.year && <span className="ml-auto text-xs text-muted-foreground">{document.year}</span>}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
