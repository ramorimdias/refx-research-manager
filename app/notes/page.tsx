'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Clock3, FileText, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import * as repo from '@/lib/repositories/local-db'
import { useT } from '@/lib/localization'
import { useDocumentStore } from '@/lib/stores/document-store'
import { useLibraryStore } from '@/lib/stores/library-store'
import { useRuntimeState } from '@/lib/stores/runtime-store'

type SortMode = 'timestamp' | 'page'

type AppNote = repo.DbNote

function getNoteDocumentHref(note: AppNote, document?: { id: string; documentType: string } | null) {
  if (!document) return null

  if (document.documentType === 'my_work') {
    return `/documents?id=${document.id}`
  }

  if (document.documentType === 'physical_book') {
    return `/books/notes?id=${document.id}`
  }

  return `/reader/view?id=${document.id}${note.pageNumber ? `&page=${note.pageNumber}` : ''}`
}

export default function NotesPage() {
  const t = useT()
  const { notes, loadNotes, isDesktopApp } = useRuntimeState()
  const documents = useDocumentStore((state) => state.documents)
  const libraries = useLibraryStore((state) => state.libraries)
  const activeLibraryId = useLibraryStore((state) => state.activeLibraryId)
  const [query, setQuery] = useState('')
  const [selectedLibraryId, setSelectedLibraryId] = useState<string>('all')
  const [sortMode, setSortMode] = useState<SortMode>('timestamp')
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [draftContent, setDraftContent] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    void loadNotes()
  }, [loadNotes])

  useEffect(() => {
    if (activeLibraryId) {
      setSelectedLibraryId(activeLibraryId)
    }
  }, [activeLibraryId])

  const documentsById = useMemo(
    () => new Map(documents.map((document) => [document.id, document])),
    [documents],
  )

  const filteredNotes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return notes.filter((note) => {
      const document = note.documentId ? documentsById.get(note.documentId) : undefined
      if (selectedLibraryId !== 'all' && (!document || document.libraryId !== selectedLibraryId)) {
        return false
      }

      if (!normalizedQuery) return true

      return `${note.title} ${note.content} ${document?.title ?? ''}`.toLowerCase().includes(normalizedQuery)
    })
  }, [documentsById, notes, query, selectedLibraryId])

  const groupedNotes = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string
        label: string
        notes: AppNote[]
      }
    >()

    for (const note of filteredNotes) {
      const document = note.documentId ? documentsById.get(note.documentId) : undefined
      const key = note.documentId ?? 'unlinked'
        const label = document?.title ?? t('notesPage.unlinkedNotes')
      const existing = groups.get(key)

      if (existing) {
        existing.notes.push(note)
      } else {
        groups.set(key, { key, label, notes: [note] })
      }
    }

    const ordered = Array.from(groups.values()).map((group) => ({
      ...group,
      notes: [...group.notes].sort((left, right) => {
        if (sortMode === 'page') {
          const pageDifference = (left.pageNumber ?? Number.MAX_SAFE_INTEGER) - (right.pageNumber ?? Number.MAX_SAFE_INTEGER)
          if (pageDifference !== 0) return pageDifference
        }

        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      }),
    }))

    return ordered.sort((left, right) => {
      const leftLead = left.notes[0]
      const rightLead = right.notes[0]
      if (!leftLead || !rightLead) return left.label.localeCompare(right.label)

      if (sortMode === 'page') {
        const pageDifference = (leftLead.pageNumber ?? Number.MAX_SAFE_INTEGER) - (rightLead.pageNumber ?? Number.MAX_SAFE_INTEGER)
        if (pageDifference !== 0) return pageDifference
      }

      return new Date(rightLead.updatedAt).getTime() - new Date(leftLead.updatedAt).getTime()
    })
  }, [documentsById, filteredNotes, sortMode, t])

  const flatVisibleNotes = useMemo(
    () => groupedNotes.flatMap((group) => group.notes),
    [groupedNotes],
  )

  useEffect(() => {
    if (!selectedNoteId && flatVisibleNotes.length > 0) {
      setSelectedNoteId(flatVisibleNotes[0].id)
      return
    }

    if (selectedNoteId && !flatVisibleNotes.some((note) => note.id === selectedNoteId)) {
      setSelectedNoteId(flatVisibleNotes[0]?.id ?? null)
    }
  }, [flatVisibleNotes, selectedNoteId])

  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedNoteId) ?? null,
    [notes, selectedNoteId],
  )

  const selectedDocument = useMemo(
    () => (selectedNote?.documentId ? documentsById.get(selectedNote.documentId) ?? null : null),
    [documentsById, selectedNote?.documentId],
  )

  useEffect(() => {
    setDraftContent(selectedNote?.content ?? '')
  }, [selectedNote?.id, selectedNote?.content])

  const handleSave = async () => {
    if (!selectedNote || !isDesktopApp) return

    setIsSaving(true)
    try {
      await repo.updateNote(selectedNote.id, {
        title: selectedNote.title.trim() || t('notesPage.untitledNote'),
        content: draftContent,
        pageNumber: selectedNote.pageNumber,
      })
      await loadNotes()
    } finally {
      setIsSaving(false)
    }
  }

  useEffect(() => {
    if (!selectedNote || !isDesktopApp) return
    if (draftContent === selectedNote.content) return

    const timeoutId = window.setTimeout(() => {
      void handleSave()
    }, 500)

    return () => window.clearTimeout(timeoutId)
  }, [draftContent, isDesktopApp, selectedNote])

  return (
    <div className="flex h-full">
      <div className="flex w-96 flex-col border-r">
        <div className="space-y-3 border-b p-4">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder={t('notesPage.searchNotes')} value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Select value={selectedLibraryId} onValueChange={setSelectedLibraryId}>
              <SelectTrigger>
                <SelectValue placeholder={t('notesPage.allLibraries')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('notesPage.allLibraries')}</SelectItem>
                {libraries.map((library) => (
                  <SelectItem key={library.id} value={library.id}>
                    {library.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="timestamp">{t('notesPage.sortTimestamp')}</SelectItem>
                <SelectItem value="page">{t('notesPage.sortPage')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {groupedNotes.map((group) => (
            <Collapsible
              key={group.key}
              open={openGroups[group.key] ?? false}
              onOpenChange={(open) => setOpenGroups((current) => ({ ...current, [group.key]: open }))}
              className="space-y-2"
            >
              <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-1 text-left">
                <div className="flex min-w-0 items-center gap-2">
                  <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${(openGroups[group.key] ?? false) ? 'rotate-180' : ''}`} />
                  <h3 className="truncate text-sm font-semibold">{group.label}</h3>
                </div>
                <Badge variant="secondary">{group.notes.length}</Badge>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2">
                {group.notes.map((note) => (
                  (() => {
                    const document = note.documentId ? documentsById.get(note.documentId) : null
                    const noteHref = getNoteDocumentHref(note, document)

                    return (
                      <div
                        key={note.id}
                        className={`rounded-lg border p-3 transition ${
                          selectedNoteId === note.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'
                        }`}
                      >
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => setSelectedNoteId(note.id)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">{note.title || t('notesPage.untitledNote')}</div>
                              <div className="line-clamp-2 text-xs text-muted-foreground">{note.content || t('notesPage.noContent')}</div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {noteHref ? (
                                <Link
                                  href={noteHref}
                                  className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary transition hover:bg-primary/10"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  {t('notesPage.seeInDocument')}
                                  {note.pageNumber ? ` p.${note.pageNumber}` : ''}
                                </Link>
                              ) : null}
                            </div>
                          </div>
                        </button>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock3 className="h-3.5 w-3.5" />
                            {new Date(note.updatedAt).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    )
                  })()
                ))}
              </CollapsibleContent>
            </Collapsible>
          ))}

          {groupedNotes.length === 0 && (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              {t('notesPage.noNotesForFilters')}
            </div>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-4">
        {selectedNote ? (
          <div className="flex h-full flex-col space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
                  <span className="block truncate">{selectedNote.title || t('notesPage.untitledNote')}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  {selectedDocument ? (
                    <>
                      <Badge variant="secondary" className="max-w-full truncate">
                        <FileText className="mr-1 h-3.5 w-3.5" />
                        {selectedDocument.title}
                      </Badge>
                      {selectedNote.pageNumber ? <Badge variant="outline">Page {selectedNote.pageNumber}</Badge> : null}
                    </>
                  ) : (
                    <Badge variant="outline">{t('notesPage.standaloneNote')}</Badge>
                  )}
                  <span>{t('notesPage.updated', { value: new Date(selectedNote.updatedAt).toLocaleString() })}</span>
                </div>
              </div>

            </div>

            <Textarea
              className="min-h-0 flex-1"
              value={draftContent}
              onChange={(event) => setDraftContent(event.target.value)}
            />
            {isSaving ? (
              <div className="flex items-center justify-end text-xs text-muted-foreground">
                {t('notesPage.saving')}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">{t('notesPage.selectNote')}</div>
        )}
      </div>
    </div>
  )
}
