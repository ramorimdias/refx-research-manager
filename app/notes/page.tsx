'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Clock3, FileText, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { useAppStore } from '@/lib/store'
import * as repo from '@/lib/repositories/local-db'
import { useT } from '@/lib/localization'

type SortMode = 'timestamp' | 'page'

type AppNote = ReturnType<typeof useAppStore.getState>['notes'][number]

export default function NotesPage() {
  const t = useT()
  const { notes, documents, libraries, loadNotes, isDesktopApp, activeLibraryId } = useAppStore()
  const [query, setQuery] = useState('')
  const [selectedLibraryId, setSelectedLibraryId] = useState<string>('all')
  const [sortMode, setSortMode] = useState<SortMode>('timestamp')
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
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
    setDraftTitle(selectedNote?.title ?? '')
    setDraftContent(selectedNote?.content ?? '')
  }, [selectedNote?.id, selectedNote?.title, selectedNote?.content])

  const hasPendingChanges =
    selectedNote !== null &&
    (draftTitle !== selectedNote.title || draftContent !== selectedNote.content)

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
            <div key={group.key} className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="truncate text-sm font-semibold">{group.label}</h3>
                <Badge variant="secondary">{group.notes.length}</Badge>
              </div>
              <div className="space-y-2">
                {group.notes.map((note) => (
                  <button
                    key={note.id}
                    className={`w-full rounded-lg border p-3 text-left transition ${
                      selectedNoteId === note.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'
                    }`}
                    onClick={() => setSelectedNoteId(note.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{note.title || t('notesPage.untitledNote')}</div>
                        <div className="line-clamp-2 text-xs text-muted-foreground">{note.content || t('notesPage.noContent')}</div>
                      </div>
                      {note.pageNumber ? (
                        <Badge variant="outline">p. {note.pageNumber}</Badge>
                      ) : null}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock3 className="h-3.5 w-3.5" />
                      {new Date(note.updatedAt).toLocaleString()}
                    </div>
                  </button>
                ))}
              </div>
            </div>
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
                <Input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
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

              {selectedDocument && (selectedNote.pageNumber || selectedDocument.documentType === 'physical_book') ? (
                <Button asChild variant="outline">
                  <Link
                    href={
                      selectedDocument.documentType === 'my_work'
                        ? `/documents?id=${selectedDocument.id}`
                        : selectedDocument.documentType === 'physical_book'
                        ? `/books/notes?id=${selectedDocument.id}`
                        : `/reader/view?id=${selectedDocument.id}&page=${selectedNote.pageNumber}`
                    }
                  >
                    {selectedDocument.documentType === 'physical_book'
                      ? t('notesPage.openBookNotes')
                      : selectedDocument.documentType === 'my_work'
                        ? t('notesPage.openDetails')
                        : t('notesPage.openReader')}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              ) : null}
            </div>

            <Textarea
              className="min-h-0 flex-1"
              value={draftContent}
              onChange={(event) => setDraftContent(event.target.value)}
            />

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => {
                setDraftTitle(selectedNote.title)
                setDraftContent(selectedNote.content)
              }} disabled={!hasPendingChanges || isSaving}>
                {t('notesPage.reset')}
              </Button>
              <Button onClick={() => void handleSave()} disabled={!hasPendingChanges || isSaving || !isDesktopApp}>
                {isSaving ? t('notesPage.saving') : t('notesPage.save')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">{t('notesPage.selectNote')}</div>
        )}
      </div>
    </div>
  )
}
