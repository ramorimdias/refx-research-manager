'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, BookMarked, Plus, Save, Trash2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import * as repo from '@/lib/repositories/local-db'
import { useDocumentStore } from '@/lib/stores/document-store'
import { useRuntimeState } from '@/lib/stores/runtime-store'

type BookNoteDraft = {
  id?: string
  title: string
  content: string
  pageNumber: string
  locationHint: string
}

const DEFAULT_DRAFT: BookNoteDraft = {
  title: '',
  content: '',
  pageNumber: '',
  locationHint: '',
}

export default function PhysicalBookNotesPage() {
  const params = useSearchParams()
  const id = params.get('id') ?? ''
  const documents = useDocumentStore((state) => state.documents)
  const { notes, loadNotes, isDesktopApp } = useRuntimeState()
  const document = useMemo(() => documents.find((entry) => entry.id === id) ?? null, [documents, id])
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [draft, setDraft] = useState<BookNoteDraft>(DEFAULT_DRAFT)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  const bookNotes = useMemo(
    () =>
      notes
        .filter((note) => note.documentId === id)
        .sort((left, right) => {
          const pageDiff = (left.pageNumber ?? Number.MAX_SAFE_INTEGER) - (right.pageNumber ?? Number.MAX_SAFE_INTEGER)
          if (pageDiff !== 0) return pageDiff
          return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
        }),
    [id, notes],
  )

  const selectedNote = useMemo(
    () => bookNotes.find((note) => note.id === selectedNoteId) ?? null,
    [bookNotes, selectedNoteId],
  )

  useEffect(() => {
    void loadNotes()
  }, [loadNotes])

  useEffect(() => {
    if (!selectedNoteId && bookNotes.length > 0) {
      setSelectedNoteId(bookNotes[0].id)
    }
  }, [bookNotes, selectedNoteId])

  useEffect(() => {
    if (selectedNote) {
      setDraft({
        id: selectedNote.id,
        title: selectedNote.title,
        content: selectedNote.content,
        pageNumber: selectedNote.pageNumber ? String(selectedNote.pageNumber) : '',
        locationHint: selectedNote.locationHint ?? '',
      })
    } else {
      setDraft(DEFAULT_DRAFT)
    }
  }, [selectedNote])

  if (!document) {
    return <div className="p-6">Physical book not found.</div>
  }

  const handleNewNote = () => {
    setSelectedNoteId(null)
    setDraft(DEFAULT_DRAFT)
  }

  const handleSave = async () => {
    if (!isDesktopApp) return

    setIsSaving(true)
    try {
      const input = {
        documentId: document.id,
        pageNumber: draft.pageNumber ? Number(draft.pageNumber) : undefined,
        locationHint: draft.locationHint.trim() || undefined,
        title: draft.title.trim() || 'Untitled note',
        content: draft.content,
      }

      if (draft.id) {
        await repo.updateNote(draft.id, input)
      } else {
        const created = await repo.createNote(input)
        setSelectedNoteId(created.id)
      }

      await loadNotes()
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!draft.id || !isDesktopApp) return

    await repo.deleteNote(draft.id)
    await loadNotes()
    setSelectedNoteId(null)
    setDraft(DEFAULT_DRAFT)
    setIsDeleteDialogOpen(false)
  }

  return (
    <div className="p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button asChild variant="outline" size="sm">
              <Link href={`/documents?id=${document.id}&edit=1`}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Details
              </Link>
            </Button>
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-semibold">
                <BookMarked className="h-6 w-6" />
                {document.title}
              </h1>
              <p className="text-sm text-muted-foreground">Physical book notes with page and chapter references.</p>
            </div>
          </div>
          <Button onClick={handleNewNote}>
            <Plus className="mr-2 h-4 w-4" />
            Add Note
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Book Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {bookNotes.length > 0 ? (
                bookNotes.map((note) => (
                  <button
                    key={note.id}
                    className={`w-full rounded-lg border p-3 text-left transition ${
                      selectedNoteId === note.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'
                    }`}
                    onClick={() => setSelectedNoteId(note.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{note.title}</div>
                        <div className="line-clamp-2 text-xs text-muted-foreground">{note.content || 'No content yet.'}</div>
                      </div>
                      {note.pageNumber ? <Badge variant="outline">p. {note.pageNumber}</Badge> : null}
                    </div>
                    {note.locationHint ? <div className="mt-2 text-xs text-muted-foreground">{note.locationHint}</div> : null}
                    <div className="mt-2 text-xs text-muted-foreground">{new Date(note.updatedAt).toLocaleString()}</div>
                  </button>
                ))
              ) : (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No notes for this physical book yet.</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{draft.id ? 'Edit Note' : 'New Note'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="book-note-title">Title</Label>
                <Input
                  id="book-note-title"
                  value={draft.title}
                  onChange={(event) => setDraft((state) => ({ ...state, title: event.target.value }))}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="book-note-page">Page</Label>
                  <Input
                    id="book-note-page"
                    value={draft.pageNumber}
                    onChange={(event) => setDraft((state) => ({ ...state, pageNumber: event.target.value }))}
                    placeholder="e.g. 42"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="book-note-location">Chapter / Location</Label>
                  <Input
                    id="book-note-location"
                    value={draft.locationHint}
                    onChange={(event) => setDraft((state) => ({ ...state, locationHint: event.target.value }))}
                    placeholder="e.g. Chapter 3, Section 2"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="book-note-content">Note</Label>
                <Textarea
                  id="book-note-content"
                  className="min-h-72"
                  value={draft.content}
                  onChange={(event) => setDraft((state) => ({ ...state, content: event.target.value }))}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm text-muted-foreground">
                  {selectedNote ? `Last updated ${new Date(selectedNote.updatedAt).toLocaleString()}` : 'Not saved yet'}
                </div>
                <div className="flex items-center gap-2">
                {draft.id ? (
                  <Button variant="destructive" onClick={() => setIsDeleteDialogOpen(true)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                ) : null}
                  <Button onClick={() => void handleSave()} disabled={isSaving || !draft.content.trim()}>
                    <Save className="mr-2 h-4 w-4" />
                    {isSaving ? 'Saving...' : 'Save Note'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this book note?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the selected note.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()}>
              Delete Note
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
