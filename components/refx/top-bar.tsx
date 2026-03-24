'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Command, Moon, Search, Sun, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/lib/store'
import { useTheme } from 'next-themes'
import { Kbd } from '@/components/ui/kbd'
import { scoreDocumentMatch } from '@/lib/services/document-processing'

export function TopBar() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const {
    documents,
    notes,
    libraries,
    globalSearchQuery,
    setGlobalSearchQuery,
    setFilters,
    setActiveLibrary,
    setActiveDocument,
    toggleCommandPalette,
    importDocuments,
    isDesktopApp,
  } = useAppStore()
  const { setTheme, theme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [resultsOpen, setResultsOpen] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const trimmedQuery = globalSearchQuery.trim().toLowerCase()
  const documentResults = useMemo(
    () =>
      trimmedQuery
        ? documents
            .map((doc) => ({ doc, match: scoreDocumentMatch(doc, trimmedQuery) }))
            .filter((entry) => entry.match.rawScore > 0)
            .sort((left, right) => right.match.rawScore - left.match.rawScore)
            .slice(0, 5)
        : [],
    [documents, trimmedQuery],
  )

  const libraryResults = useMemo(
    () =>
      trimmedQuery
        ? libraries.filter((library) => `${library.name} ${library.description}`.toLowerCase().includes(trimmedQuery)).slice(0, 3)
        : [],
    [libraries, trimmedQuery],
  )

  const noteResults = useMemo(
    () =>
      trimmedQuery
        ? notes.filter((note) => `${note.title} ${note.content}`.toLowerCase().includes(trimmedQuery)).slice(0, 3)
        : [],
    [notes, trimmedQuery],
  )

  const hasResults = documentResults.length > 0 || libraryResults.length > 0 || noteResults.length > 0

  const handleImport = async () => {
    if (!isDesktopApp || isImporting) return
    setIsImporting(true)
    try {
      await importDocuments()
    } finally {
      setIsImporting(false)
    }
  }

  const submitGlobalSearch = () => {
    setFilters({ search: globalSearchQuery || undefined })
    setActiveLibrary(null)
    router.push('/libraries')
    setResultsOpen(false)
  }

  return (
    <header className="flex h-14 items-center justify-between gap-4 border-b border-border bg-background px-4">
      <div className="relative w-full max-w-2xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={globalSearchQuery}
          onChange={(event) => {
            setGlobalSearchQuery(event.target.value)
            setResultsOpen(true)
          }}
          onFocus={() => setResultsOpen(true)}
          onBlur={() => window.setTimeout(() => setResultsOpen(false), 120)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              submitGlobalSearch()
            }
            if (event.key === 'Escape') {
              setResultsOpen(false)
            }
          }}
          className="pl-9"
          placeholder="Search documents, libraries, and notes"
        />
        {resultsOpen && trimmedQuery && (
          <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 rounded-lg border border-border bg-popover p-2 shadow-lg">
            {hasResults ? (
              <div className="space-y-2">
                {documentResults.length > 0 && (
                  <div className="space-y-1">
                    <p className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Documents</p>
                    {documentResults.map(({ doc: document, match }) => (
                      <button
                        key={document.id}
                        className="flex w-full items-start rounded-md px-2 py-2 text-left hover:bg-muted"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setActiveDocument(document.id)
                          setResultsOpen(false)
                          router.push(`/reader/view?id=${document.id}`)
                        }}
                      >
                        <div className="w-full">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm font-medium">{document.title}</p>
                            <span className="shrink-0 text-xs text-primary">{match.confidence}% match</span>
                          </div>
                          <p className="text-sm font-medium">{document.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {document.authors.slice(0, 2).join(', ') || 'Unknown author'}
                          </p>
                          {document.searchText && (
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                              {document.searchText.slice(0, 180)}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {libraryResults.length > 0 && (
                  <div className="space-y-1">
                    <p className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Libraries</p>
                    {libraryResults.map((library) => (
                      <button
                        key={library.id}
                        className="flex w-full items-start rounded-md px-2 py-2 text-left hover:bg-muted"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setActiveLibrary(library.id)
                          setResultsOpen(false)
                          router.push('/libraries')
                        }}
                      >
                        <div>
                          <p className="text-sm font-medium">{library.name}</p>
                          <p className="text-xs text-muted-foreground">{library.description || 'Local library'}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {noteResults.length > 0 && (
                  <div className="space-y-1">
                    <p className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
                    {noteResults.map((note) => (
                      <button
                        key={note.id}
                        className="flex w-full items-start rounded-md px-2 py-2 text-left hover:bg-muted"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setResultsOpen(false)
                          router.push('/notes')
                        }}
                      >
                        <div>
                          <p className="text-sm font-medium">{note.title}</p>
                          <p className="line-clamp-1 text-xs text-muted-foreground">{note.content || 'Empty note'}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                <div className="border-t border-border px-2 pt-2">
                  <button
                    className="text-sm text-primary hover:underline"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={submitGlobalSearch}
                  >
                    View all matches in Libraries
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-2 py-3 text-sm text-muted-foreground">No local matches found.</div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={handleImport}
          disabled={!isDesktopApp || isImporting}
        >
          <Upload className="h-4 w-4" />
          <span className="hidden sm:inline">{isImporting ? 'Importing...' : 'Import'}</span>
        </Button>

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
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        )}

        <Button variant="ghost" size="sm" asChild className="hidden lg:inline-flex">
          <Link href="/settings">Settings</Link>
        </Button>
      </div>
    </header>
  )
}
