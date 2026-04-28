'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, FileText, Search, SlidersHorizontal, StickyNote } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/refx/page-header'
import * as repo from '@/lib/repositories/local-db'
import { useT } from '@/lib/localization'
import { useDocumentStore } from '@/lib/stores/document-store'
import { useLibraryStore } from '@/lib/stores/library-store'
import { useRuntimeState } from '@/lib/stores/runtime-store'
import type { Document, ReadingStage } from '@/lib/types'

type SortMode = 'recent_notes' | 'last_opened'
type ReadingStageFilter = 'all' | ReadingStage

type AppNote = repo.DbNote

function formatCompactNoteTimestamp(value: string | Date) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = String(date.getFullYear()).slice(-2)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${minutes}`
}

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

function formatDocumentAuthorsYear(document?: Document | null) {
  if (!document) return ''
  const authors = document.authors.length > 0
    ? document.authors.slice(0, 2).join(', ')
    : ''
  const authorLabel = document.authors.length > 2 ? `${authors} et al.` : authors
  return [authorLabel, document.year ? String(document.year) : ''].filter(Boolean).join(', ')
}

function readingStageLabelKey(stage: ReadingStage) {
  if (stage === 'reading') return 'common.reading'
  if (stage === 'finished') return 'common.finished'
  return 'common.unread'
}

export default function NotesPage() {
  const t = useT()
  const { notes, loadNotes, isDesktopApp } = useRuntimeState()
  const documents = useDocumentStore((state) => state.documents)
  const libraries = useLibraryStore((state) => state.libraries)
  const activeLibraryId = useLibraryStore((state) => state.activeLibraryId)
  const [query, setQuery] = useState('')
  const [selectedLibraryId, setSelectedLibraryId] = useState<string>('all')
  const [selectedReadingStage, setSelectedReadingStage] = useState<ReadingStageFilter>('all')
  const [sortMode, setSortMode] = useState<SortMode>('recent_notes')
  const [sortNotesByPage, setSortNotesByPage] = useState(false)
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [draftTitle, setDraftTitle] = useState('')
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
      if (selectedReadingStage !== 'all' && (!document || document.readingStage !== selectedReadingStage)) {
        return false
      }

      if (!normalizedQuery) return true

      return `${note.title} ${note.content} ${document?.title ?? ''}`.toLowerCase().includes(normalizedQuery)
    })
  }, [documentsById, notes, query, selectedLibraryId, selectedReadingStage])

  const groupedNotes = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string
        label: string
        document?: Document
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
        groups.set(key, { key, label, document, notes: [note] })
      }
    }

    const ordered = Array.from(groups.values()).map((group) => ({
      ...group,
      notes: [...group.notes].sort((left, right) => {
        if (sortNotesByPage) {
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

      if (sortMode === 'last_opened') {
        const leftOpened = left.document?.lastOpenedAt?.getTime() ?? 0
        const rightOpened = right.document?.lastOpenedAt?.getTime() ?? 0
        if (leftOpened !== rightOpened) return rightOpened - leftOpened
      }

      return new Date(rightLead.updatedAt).getTime() - new Date(leftLead.updatedAt).getTime()
    })
  }, [documentsById, filteredNotes, sortMode, sortNotesByPage, t])

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
    setDraftTitle(selectedNote?.title ?? '')
    setDraftContent(selectedNote?.content ?? '')
  }, [selectedNote?.id, selectedNote?.title, selectedNote?.content])

  const handleSave = async () => {
    if (!selectedNote || !isDesktopApp) return

    setIsSaving(true)
    try {
      await repo.updateNote(selectedNote.id, {
        title: draftTitle.trim() || t('notesPage.untitledNote'),
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
    if (draftTitle === selectedNote.title && draftContent === selectedNote.content) return

    const timeoutId = window.setTimeout(() => {
      void handleSave()
    }, 500)

    return () => window.clearTimeout(timeoutId)
  }, [draftTitle, draftContent, isDesktopApp, selectedNote])

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-6">
      <PageHeader
        icon={<StickyNote className="h-6 w-6" />}
        title={t('notesPage.title')}
        subtitle={t('notesPage.subtitle')}
      />

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[384px_minmax(0,1fr)]">
        <Card className="flex min-h-0 flex-col" data-tour-id="notes-list">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-lg">{t('notesPage.title')}</CardTitle>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" className="shrink-0" title={t('notesPage.filters')}>
                    <SlidersHorizontal className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">{t('notesPage.documentStatus')}</p>
                    <Select value={selectedReadingStage} onValueChange={(value) => setSelectedReadingStage(value as ReadingStageFilter)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('searchPage.anyStage')}</SelectItem>
                        <SelectItem value="unread">{t(readingStageLabelKey('unread'))}</SelectItem>
                        <SelectItem value="reading">{t(readingStageLabelKey('reading'))}</SelectItem>
                        <SelectItem value="finished">{t(readingStageLabelKey('finished'))}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">{t('notesPage.documentSort')}</p>
                    <Select value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="recent_notes">{t('notesPage.sortRecentNotes')}</SelectItem>
                        <SelectItem value="last_opened">{t('notesPage.sortOpenedDocuments')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <label className="flex items-start gap-2 rounded-lg border border-border/70 px-3 py-2 text-sm text-muted-foreground">
                    <Checkbox
                      className="mt-0.5"
                      checked={sortNotesByPage}
                      onCheckedChange={(checked) => setSortNotesByPage(Boolean(checked))}
                    />
                    <span>
                      <span className="block font-medium text-foreground">{t('notesPage.sortNotesByPage')}</span>
                      <span className="block text-xs">{t('notesPage.sortNotesByPageHelp')}</span>
                    </span>
                  </label>
                </PopoverContent>
              </Popover>
            </div>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex gap-2">
              <Select value={selectedLibraryId} onValueChange={setSelectedLibraryId}>
                <SelectTrigger className="w-[150px] shrink-0">
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
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder={t('notesPage.searchNotes')}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
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
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">{group.label}</h3>
                    {(openGroups[group.key] ?? false) && formatDocumentAuthorsYear(group.document) ? (
                      <p className="truncate text-xs text-muted-foreground">{formatDocumentAuthorsYear(group.document)}</p>
                    ) : null}
                  </div>
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
                          selectedNoteId === note.id ? 'border-primary/40 bg-primary/5' : 'hover:border-primary/40 hover:bg-accent/30'
                        }`}
                      >
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => setSelectedNoteId(note.id)}
                        >
                          <div className="flex min-w-0 items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate text-sm font-semibold text-foreground">
                                  {note.title || t('notesPage.untitledNote')}
                                </span>
                                <span className="shrink-0 text-[11px] text-muted-foreground">
                                  {formatCompactNoteTimestamp(note.updatedAt)}
                                </span>
                              </div>
                              <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                                {note.content || t('notesPage.noContent')}
                              </div>
                            </div>
                            {noteHref ? (
                              <Link
                                href={noteHref}
                                className="shrink-0 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary transition hover:bg-primary/10"
                                onClick={(event) => event.stopPropagation()}
                              >
                                {t('notesPage.seeInDocument')}
                                {note.pageNumber ? ` p.${note.pageNumber}` : ''}
                              </Link>
                            ) : null}
                          </div>
                        </button>
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
          </CardContent>
        </Card>

      <Card className="flex min-w-0 flex-col" data-tour-id="notes-editor">
        <CardContent className="min-h-0 flex-1 p-4">
        {selectedNote ? (
          <div className="flex h-full flex-col space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Input
                  className="h-auto rounded-xl border-border/70 bg-muted/40 px-3 py-2 text-base font-semibold text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:border-primary/40 focus-visible:bg-background focus-visible:ring-primary/15"
                  value={draftTitle}
                  placeholder={t('notesPage.untitledNote')}
                  onChange={(event) => setDraftTitle(event.target.value)}
                />
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
        </CardContent>
      </Card>
      </div>
    </div>
  )
}
