'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BookOpen,
  FileText,
  Home,
  Keyboard,
  Library,
  Moon,
  Search,
  Settings,
  StickyNote,
  Sun,
  Upload,
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
import { useAppStore } from '@/lib/store'
import { useTheme } from 'next-themes'

export function CommandBar() {
  const router = useRouter()
  const {
    commandPaletteOpen,
    toggleCommandPalette,
    setActiveLibrary,
    setActiveDocument,
    libraries,
    documents,
    importDocuments,
    isDesktopApp,
  } = useAppStore()
  const { setTheme, theme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

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

  const handleImport = async () => {
    if (!isDesktopApp || isImporting) return
    setIsImporting(true)
    try {
      await importDocuments()
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <CommandDialog open={commandPaletteOpen} onOpenChange={(open) => toggleCommandPalette(open)}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No local results found.</CommandEmpty>

        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => runCommand(() => router.push('/'))}>
            <Home className="mr-2 h-4 w-4" />
            <span>Home</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/libraries'))}>
            <Library className="mr-2 h-4 w-4" />
            <span>Libraries</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/reader'))}>
            <BookOpen className="mr-2 h-4 w-4" />
            <span>Reader</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/references'))}>
            <FileText className="mr-2 h-4 w-4" />
            <span>References</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/notes'))}>
            <StickyNote className="mr-2 h-4 w-4" />
            <span>Notes</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/discover'))}>
            <Search className="mr-2 h-4 w-4" />
            <span>Discover</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/settings'))}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => runCommand(() => void handleImport())} disabled={!isDesktopApp || isImporting}>
            <Upload className="mr-2 h-4 w-4" />
            <span>{isImporting ? 'Importing documents...' : 'Import documents'}</span>
          </CommandItem>
          {mounted && (
            <CommandItem onSelect={() => runCommand(() => setTheme(theme === 'dark' ? 'light' : 'dark'))}>
              {theme === 'dark' ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
              <span>Toggle theme</span>
            </CommandItem>
          )}
          <CommandItem onSelect={() => runCommand(() => router.push('/settings'))}>
            <Keyboard className="mr-2 h-4 w-4" />
            <span>Open settings</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Libraries">
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
              <span className="ml-auto text-xs text-muted-foreground">{library.documentCount} docs</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Recent Documents">
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
