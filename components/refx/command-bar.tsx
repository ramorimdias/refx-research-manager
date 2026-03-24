'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search,
  Home,
  Library,
  BookOpen,
  FileText,
  StickyNote,
  GitBranch,
  BarChart3,
  Settings,
  Plus,
  Upload,
  Moon,
  Sun,
  Keyboard,
  Loader2,
} from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
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
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        toggleCommandPalette()
      }
    }

    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [toggleCommandPalette])

  const runCommand = (command: () => void) => {
    toggleCommandPalette()
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
    <CommandDialog open={commandPaletteOpen} onOpenChange={toggleCommandPalette}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        
        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => runCommand(() => router.push('/'))}>
            <Home className="mr-2 h-4 w-4" />
            <span>Home</span>
            <CommandShortcut>G H</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/libraries'))}>
            <Library className="mr-2 h-4 w-4" />
            <span>Libraries</span>
            <CommandShortcut>G L</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/reader'))}>
            <BookOpen className="mr-2 h-4 w-4" />
            <span>Reader</span>
            <CommandShortcut>G R</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/references'))}>
            <FileText className="mr-2 h-4 w-4" />
            <span>References</span>
            <CommandShortcut>G F</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/notes'))}>
            <StickyNote className="mr-2 h-4 w-4" />
            <span>Notes</span>
            <CommandShortcut>G N</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/discover'))}>
            <Search className="mr-2 h-4 w-4" />
            <span>Discover</span>
            <CommandShortcut>G D</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/maps'))}>
            <GitBranch className="mr-2 h-4 w-4" />
            <span>Maps</span>
            <CommandShortcut>G M</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/reports'))}>
            <BarChart3 className="mr-2 h-4 w-4" />
            <span>Reports</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/settings'))}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
            <CommandShortcut>G S</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Actions">
          <CommandItem>
            <Plus className="mr-2 h-4 w-4" />
            <span>New Library</span>
            <CommandShortcut>N L</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => void handleImport())} disabled={!isDesktopApp || isImporting}>
            <Upload className="mr-2 h-4 w-4" />
            <span>{isImporting ? 'Importing Documents...' : 'Import Documents'}</span>
            <CommandShortcut>I</CommandShortcut>
          </CommandItem>
          <CommandItem>
            <StickyNote className="mr-2 h-4 w-4" />
            <span>New Note</span>
            <CommandShortcut>N N</CommandShortcut>
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
                  router.push(`/libraries/${library.id}`)
                })
              }
            >
              <div
                className="mr-2 h-3 w-3 rounded-full"
                style={{ backgroundColor: library.color }}
              />
              <span>{library.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {library.documentCount} docs
              </span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Recent Documents">
          {documents.slice(0, 5).map((doc) => (
            <CommandItem
              key={doc.id}
              onSelect={() =>
                runCommand(() => {
                  setActiveDocument(doc.id)
                  router.push(`/documents/${doc.id}`)
                })
              }
            >
              <FileText className="mr-2 h-4 w-4" />
              <span className="truncate">{doc.title}</span>
              {doc.year && <span className="ml-auto text-xs text-muted-foreground">{doc.year}</span>}
            </CommandItem>
          ))}
          {isImporting && (
            <CommandItem disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              <span>Working...</span>
            </CommandItem>
          )}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Preferences">
          {mounted && (
            <CommandItem
              onSelect={() => runCommand(() => setTheme(theme === 'dark' ? 'light' : 'dark'))}
            >
              {theme === 'dark' ? (
                <Sun className="mr-2 h-4 w-4" />
              ) : (
                <Moon className="mr-2 h-4 w-4" />
              )}
              <span>Toggle Theme</span>
              <CommandShortcut>T</CommandShortcut>
            </CommandItem>
          )}
          <CommandItem onSelect={() => runCommand(() => router.push('/settings#shortcuts'))}>
            <Keyboard className="mr-2 h-4 w-4" />
            <span>Keyboard Shortcuts</span>
            <CommandShortcut>?</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
