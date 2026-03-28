'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, Bold, BookMarked, FileText, Italic, List, Save, Underline } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAppStore } from '@/lib/store'
import * as repo from '@/lib/repositories/local-db'

function formatNoteReference(note: ReturnType<typeof useAppStore.getState>['notes'][number]) {
  const noteLabel = note.commentNumber ? `Note ${note.commentNumber}` : note.title || 'Note'
  const pageLabel = note.pageNumber ? ` (p. ${note.pageNumber})` : ''
  const locationLabel = note.locationHint ? ` - ${note.locationHint}` : ''
  return `${noteLabel}${pageLabel}${locationLabel}`
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function htmlToPlainText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim()
}

export default function CommentsPage() {
  const params = useSearchParams()
  const id = params.get('id') ?? ''
  const { documents, notes, loadNotes, refreshData, isDesktopApp, setActiveDocument } = useAppStore()
  const editorRef = useRef<HTMLDivElement | null>(null)
  const currentDocument = useMemo(() => documents.find((entry) => entry.id === id) ?? null, [documents, id])
  const [draft, setDraft] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<'page' | 'timestamp'>('page')

  const documentNotes = useMemo(
    () =>
      notes
        .filter((note) => note.documentId === id)
        .sort((left, right) => {
          if (sortMode === 'page') {
            const pageDiff = (left.pageNumber ?? Number.MAX_SAFE_INTEGER) - (right.pageNumber ?? Number.MAX_SAFE_INTEGER)
            if (pageDiff !== 0) return pageDiff
          }
          return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
        }),
    [id, notes, sortMode],
  )

  const selectedNote = useMemo(
    () => documentNotes.find((note) => note.id === selectedNoteId) ?? null,
    [documentNotes, selectedNoteId],
  )

  useEffect(() => {
    void loadNotes()
  }, [loadNotes])

  useEffect(() => {
    if (!currentDocument) return
    setActiveDocument(currentDocument.id)
    const nextDraft = currentDocument.commentaryText ?? ''
    setDraft(nextDraft)
    if (editorRef.current && editorRef.current.innerHTML !== nextDraft) {
      editorRef.current.innerHTML = nextDraft
    }
  }, [currentDocument?.id, currentDocument?.commentaryText, setActiveDocument])

  useEffect(() => {
    if (!selectedNoteId && documentNotes.length > 0) {
      setSelectedNoteId(documentNotes[0].id)
      return
    }

    if (selectedNoteId && !documentNotes.some((note) => note.id === selectedNoteId)) {
      setSelectedNoteId(documentNotes[0]?.id ?? null)
    }
  }, [documentNotes, selectedNoteId])

  if (!currentDocument) {
    return <div className="p-6">Document not found.</div>
  }

  const hasPendingChanges = draft !== (currentDocument.commentaryText ?? '')

  const syncDraftFromEditor = () => {
    setDraft(editorRef.current?.innerHTML ?? '')
  }

  const applyCommand = (command: 'bold' | 'italic' | 'underline' | 'insertUnorderedList') => {
    editorRef.current?.focus()
    window.document.execCommand(command, false)
    syncDraftFromEditor()
  }

  const applyBulletList = () => {
    const editor = editorRef.current
    if (!editor) return

    editor.focus()

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      window.document.execCommand('insertHTML', false, '<ul><li><br></li></ul>')
      syncDraftFromEditor()
      return
    }

    const range = selection.getRangeAt(0)
    if (!editor.contains(range.commonAncestorContainer)) {
      window.document.execCommand('insertHTML', false, '<ul><li><br></li></ul>')
      syncDraftFromEditor()
      return
    }

    const selectedText = range.toString().trim()
    if (!selectedText) {
      window.document.execCommand('insertHTML', false, '<ul><li><br></li></ul>')
      syncDraftFromEditor()
      return
    }

    const items = selectedText
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `<li>${escapeHtml(line)}</li>`)
      .join('')

    range.deleteContents()
    window.document.execCommand('insertHTML', false, `<ul>${items || '<li><br></li>'}</ul>`)
    syncDraftFromEditor()
  }

  const toolbarButtonProps = {
    onMouseDown: (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
    },
  }

  const insertNoteIntoComment = (note: ReturnType<typeof useAppStore.getState>['notes'][number]) => {
    editorRef.current?.focus()

    const reference = escapeHtml(formatNoteReference(note))
    const snippet = escapeHtml(note.content.trim() || 'No note text yet.').replaceAll('\n', '<br>')
    const block = `<p><strong>${reference}</strong>: ${snippet}</p>`

    window.document.execCommand('insertHTML', false, block)
    syncDraftFromEditor()
  }

  const handleSave = async () => {
    if (!isDesktopApp) return

    setIsSaving(true)
    try {
      await repo.updateDocumentMetadata(currentDocument.id, {
        commentaryText: draft,
        commentaryUpdatedAt: new Date().toISOString(),
      })
      await refreshData()
    } finally {
      setIsSaving(false)
    }
  }

  const openHref = currentDocument.documentType === 'physical_book' ? `/books/notes?id=${currentDocument.id}` : `/reader/view?id=${currentDocument.id}`
  const plainTextLength = htmlToPlainText(draft).length

  return (
    <div className="p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button asChild variant="outline" size="sm">
              <Link href="/libraries">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Library
              </Link>
            </Button>
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-semibold">
                {currentDocument.documentType === 'physical_book' ? <BookMarked className="h-6 w-6" /> : <FileText className="h-6 w-6" />}
                {currentDocument.title}
              </h1>
              <p className="text-sm text-muted-foreground">Write a document-level comment using your saved notes as supporting material.</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link href={openHref}>
                {currentDocument.documentType === 'physical_book' ? 'Open Notes' : 'Open Reader'}
              </Link>
            </Button>
            <Button onClick={() => void handleSave()} disabled={!hasPendingChanges || isSaving || !isDesktopApp}>
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? 'Saving...' : 'Save Comment'}
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          <Card className="min-h-0">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2">
                  <span>Document Notes</span>
                  <Badge variant="secondary">{documentNotes.length}</Badge>
                </CardTitle>
                <Select value={sortMode} onValueChange={(value) => setSortMode(value as 'page' | 'timestamp')}>
                  <SelectTrigger className="h-8 w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="page">By page</SelectItem>
                    <SelectItem value="timestamp">By timestamp</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {documentNotes.length > 0 ? (
                documentNotes.map((note) => {
                  const isSelected = selectedNoteId === note.id

                  return (
                    <div
                      key={note.id}
                      className={`rounded-lg border p-3 transition ${
                        isSelected ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'
                      }`}
                    >
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => setSelectedNoteId(note.id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{formatNoteReference(note)}</div>
                            <div className="line-clamp-3 text-xs text-muted-foreground">{note.content || 'No note text yet.'}</div>
                          </div>
                          {note.pageNumber ? <Badge variant="outline">p. {note.pageNumber}</Badge> : null}
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">{new Date(note.updatedAt).toLocaleString()}</div>
                      </button>
                      <div className="mt-3 flex justify-end">
                        <Button variant="outline" size="sm" onClick={() => insertNoteIntoComment(note)}>
                          Insert
                        </Button>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No notes for this document yet. Add notes in the reader, then use them here while writing your comment.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="min-h-0">
            <CardHeader>
              <CardTitle>Comment Draft</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => applyCommand('bold')} {...toolbarButtonProps}>
                  <Bold className="mr-2 h-4 w-4" />
                  Bold
                </Button>
                <Button variant="outline" size="sm" onClick={() => applyCommand('italic')} {...toolbarButtonProps}>
                  <Italic className="mr-2 h-4 w-4" />
                  Italic
                </Button>
                <Button variant="outline" size="sm" onClick={() => applyCommand('underline')} {...toolbarButtonProps}>
                  <Underline className="mr-2 h-4 w-4" />
                  Underline
                </Button>
                <Button variant="outline" size="sm" onClick={applyBulletList} {...toolbarButtonProps}>
                  <List className="mr-2 h-4 w-4" />
                  Bullets
                </Button>
              </div>

              {selectedNote ? (
                <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                  <div className="font-medium">{formatNoteReference(selectedNote)}</div>
                  <div className="mt-1 text-muted-foreground">{selectedNote.content || 'No note text yet.'}</div>
                </div>
              ) : null}

              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={syncDraftFromEditor}
                className="min-h-[28rem] rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:mb-1"
                data-placeholder="Write your overall comment on this article or book here. Use the notes on the left to support your synthesis."
              />

              <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>
                  {currentDocument.commentaryUpdatedAt
                    ? `Last saved ${currentDocument.commentaryUpdatedAt.toLocaleString()}`
                    : 'Not saved yet'}
                </span>
                <span>{plainTextLength} characters</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
