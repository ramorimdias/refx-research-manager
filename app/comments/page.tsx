'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, Bold, BookMarked, FileText, Italic, List, MessageSquareText, Save, Search, SquareArrowOutUpRight, Underline } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/refx/page-header'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import * as repo from '@/lib/repositories/local-db'
import { getNoteLocationLabel } from '@/lib/services/document-note-anchor-service'
import { openDetachedReaderWindow } from '@/lib/services/reader-window-service'
import { useDocumentActions, useDocumentStore } from '@/lib/stores/document-store'
import { useLibraryStore } from '@/lib/stores/library-store'
import { useRuntimeState } from '@/lib/stores/runtime-store'
import { useT } from '@/lib/localization'

function formatNoteReference(note: repo.DbNote) {
  const noteLabel = formatNoteTitle(note)
  const pageLabel = note.pageNumber ? ` (p. ${note.pageNumber})` : ''
  const location = getNoteLocationLabel(note.locationHint)
  const locationLabel = location ? ` - ${location}` : ''
  return `${noteLabel}${pageLabel}${locationLabel}`
}

function formatNoteTitle(note: repo.DbNote) {
  return note.commentNumber ? `Note ${note.commentNumber}` : note.title || 'Note'
}

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

function CommentsTourDemo() {
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
                <FileText className="h-6 w-6" />
                REFX Tour Sample PDF
              </h1>
              <p className="text-sm text-muted-foreground">Write a document-level comment and pull supporting notes into the draft.</p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          <Card className="min-h-0" data-tour-id="comments-notes">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span>Document Notes</span>
                <Badge variant="secondary">2</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { title: 'Note 1', page: 2, updatedAt: new Date('2026-04-21T10:20:00'), text: 'Capture the key argument from the introduction.' },
                { title: 'Note 2', page: 4, updatedAt: new Date('2026-04-21T10:35:00'), text: 'Highlight where methods and evidence are introduced.' },
              ].map((note) => (
                <div key={note.title} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-semibold">{note.title}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatCompactNoteTimestamp(note.updatedAt)}
                      </span>
                    </div>
                    <Badge variant="outline">p. {note.page}</Badge>
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{note.text}</div>
                  <div className="mt-3 flex justify-end">
                    <Button variant="outline" size="sm">Insert</Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="min-h-0" data-tour-id="comments-draft">
            <CardHeader>
              <CardTitle>Comment Draft</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                Build a high-level commentary here, using the notes on the left as evidence while you synthesize the document.
              </div>
              <div className="min-h-[28rem] rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs">
                <p className="mb-3 font-medium">Sample commentary</p>
                <p className="text-muted-foreground">
                  This demo draft shows where to write an overall comment for a document after reviewing the notes you created in the reader.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function RealCommentsPage() {
  const t = useT()
  const params = useSearchParams()
  const id = params.get('id') ?? ''
  const returnTo = params.get('returnTo')
  const documents = useDocumentStore((state) => state.documents)
  const libraries = useLibraryStore((state) => state.libraries)
  const activeLibraryId = useLibraryStore((state) => state.activeLibraryId)
  const { notes, loadNotes, refreshData, isDesktopApp } = useRuntimeState()
  const { setActiveDocument } = useDocumentActions()
  const editorRef = useRef<HTMLDivElement | null>(null)
  const currentDocument = useMemo(() => documents.find((entry) => entry.id === id) ?? null, [documents, id])
  const [commentSearch, setCommentSearch] = useState('')
  const [newCommentLibraryId, setNewCommentLibraryId] = useState<string>('all')
  const [newCommentSearch, setNewCommentSearch] = useState('')
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
    if (!activeLibraryId) return
    setNewCommentLibraryId(activeLibraryId)
  }, [activeLibraryId])

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

  const documentsWithComments = useMemo(() => {
    const normalized = commentSearch.trim().toLowerCase()

    return documents
      .filter((document) => htmlToPlainText(document.commentaryText ?? '').length > 0)
      .filter((document) => {
        if (!normalized) return true
        return [
          document.title,
          document.authors.join(' '),
          document.year ? String(document.year) : '',
          htmlToPlainText(document.commentaryText ?? ''),
        ].join(' ').toLowerCase().includes(normalized)
      })
      .sort((left, right) => (
        (right.commentaryUpdatedAt?.getTime() ?? 0) - (left.commentaryUpdatedAt?.getTime() ?? 0)
      ))
  }, [commentSearch, documents])

  const documentsForNewComment = useMemo(() => {
    const normalized = newCommentSearch.trim().toLowerCase()

    return documents
      .filter((document) => newCommentLibraryId === 'all' || document.libraryId === newCommentLibraryId)
      .filter((document) => document.documentType !== 'my_work')
      .filter((document) => {
        if (!normalized) return true
        const library = libraries.find((item) => item.id === document.libraryId)
        return [
          document.title,
          document.authors.join(' '),
          document.year ? String(document.year) : '',
          document.doi ?? '',
          library?.name ?? '',
        ].join(' ').toLowerCase().includes(normalized)
      })
      .sort((left, right) => left.title.localeCompare(right.title))
  }, [documents, libraries, newCommentLibraryId, newCommentSearch])

  const noteCountByDocumentId = useMemo(() => {
    const counts = new Map<string, number>()
    for (const note of notes) {
      if (!note.documentId) continue
      counts.set(note.documentId, (counts.get(note.documentId) ?? 0) + 1)
    }
    return counts
  }, [notes])

  const libraryById = useMemo(
    () => new Map(libraries.map((library) => [library.id, library])),
    [libraries],
  )

  if (!id) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-6">
        <PageHeader
          icon={<MessageSquareText className="h-6 w-6" />}
          title={t('commentsPage.title')}
          subtitle={t('commentsPage.subtitle')}
        />

        <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Card className="flex min-h-0 flex-col">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3 text-lg">
                <span>{t('commentsPage.myComments')}</span>
                <Badge variant="secondary">{documentsWithComments.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={commentSearch}
                  onChange={(event) => setCommentSearch(event.target.value)}
                  placeholder={t('commentsPage.searchComments')}
                  className="pl-9"
                />
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
                {documentsWithComments.map((document) => {
                  const library = libraryById.get(document.libraryId)
                  const preview = htmlToPlainText(document.commentaryText ?? '')

                  return (
                    <Link key={document.id} href={`/comments?id=${document.id}&returnTo=comments`} className="block">
                      <div className="rounded-2xl border bg-card px-4 py-3 transition hover:border-primary/40 hover:bg-accent/30">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="line-clamp-2 text-sm font-medium">{document.title}</div>
                            <div className="mt-1 truncate text-xs text-muted-foreground">
                              {document.authors.join(', ') || t('searchPage.unknownAuthor')}
                              {document.year ? ` - ${document.year}` : ''}
                            </div>
                          </div>
                          {library ? (
                            <span
                              className="flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium"
                              style={{
                                borderColor: `${library.color}66`,
                                backgroundColor: `${library.color}18`,
                                color: library.color,
                              }}
                            >
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: library.color }} />
                              {library.name}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                          {preview || t('commentsPage.noCommentPreview')}
                        </div>
                        {document.commentaryUpdatedAt ? (
                          <div className="mt-2 text-xs text-muted-foreground">
                            {t('notesPage.updated', { value: document.commentaryUpdatedAt.toLocaleString() })}
                          </div>
                        ) : null}
                      </div>
                    </Link>
                  )
                })}

                {documentsWithComments.length === 0 ? (
                  <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                    {t('commentsPage.noComments')}
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="flex min-h-0 flex-col">
            <CardHeader>
              <CardTitle className="text-lg">{t('commentsPage.startNewComment')}</CardTitle>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
              <Select value={newCommentLibraryId} onValueChange={setNewCommentLibraryId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('notesPage.allLibraries')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('notesPage.allLibraries')}</SelectItem>
                  {libraries.map((library) => (
                    <SelectItem key={library.id} value={library.id}>
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: library.color }} />
                        {library.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={newCommentSearch}
                  onChange={(event) => setNewCommentSearch(event.target.value)}
                  placeholder={t('commentsPage.searchDocuments')}
                  className="pl-9"
                />
              </div>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                {documentsForNewComment.map((document) => {
                  const library = libraryById.get(document.libraryId)
                  const noteCount = noteCountByDocumentId.get(document.id) ?? 0

                  return (
                    <Link key={document.id} href={`/comments?id=${document.id}&returnTo=comments`} className="block">
                      <div className="rounded-2xl border bg-card px-4 py-3 transition hover:border-primary/40 hover:bg-accent/30">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="line-clamp-2 text-sm font-medium">{document.title}</div>
                            <div className="mt-1 truncate text-xs text-muted-foreground">
                              {document.authors.join(', ') || t('searchPage.unknownAuthor')}
                              {document.year ? ` - ${document.year}` : ''}
                            </div>
                          </div>
                          <Badge variant={noteCount > 0 ? 'secondary' : 'outline'} className="shrink-0">
                            {t('commentsPage.notesCount', { count: noteCount })}
                          </Badge>
                        </div>
                        {library ? (
                          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: library.color }} />
                            {library.name}
                          </div>
                        ) : null}
                      </div>
                    </Link>
                  )
                })}

                {documentsForNewComment.length === 0 ? (
                  <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                    {t('commentsPage.noDocuments')}
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

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

  const insertNoteIntoComment = (note: repo.DbNote) => {
    editorRef.current?.focus()

    const title = escapeHtml(formatNoteTitle(note))
    const timestamp = escapeHtml(formatCompactNoteTimestamp(note.updatedAt))
    const pageLabel = note.pageNumber ? `p. ${note.pageNumber}` : ''
    const location = getNoteLocationLabel(note.locationHint)
    const meta = [pageLabel, location].filter(Boolean).map(escapeHtml).join(' · ')
    const snippet = escapeHtml(note.content.trim() || 'No note text yet.').replaceAll('\n', '<br>')
    const block = [
      `<article data-refx-note-embed="true" data-note-id="${escapeHtml(note.id)}" contenteditable="false" style="margin: 0 0 12px; border: 1px solid color-mix(in oklab, currentColor 16%, transparent); border-radius: 12px; padding: 10px 12px; background: color-mix(in oklab, currentColor 4%, transparent);">`,
      '<div style="display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 4px;">',
      `<strong style="font-size: 0.92em;">${title}</strong>`,
      `<span style="font-size: 0.75em; opacity: 0.68;">${timestamp}</span>`,
      '</div>',
      meta ? `<div style="font-size: 0.75em; opacity: 0.68; margin-bottom: 6px;">${meta}</div>` : '',
      `<div style="font-size: 0.88em; line-height: 1.45; opacity: 0.86;">${snippet}</div>`,
      '</article>',
      '<p><br></p>',
    ].join('')

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

  const handleOpenDocumentFromComment = async () => {
    if (currentDocument.documentType !== 'pdf') return

    await openDetachedReaderWindow({
      documentId: currentDocument.id,
      title: currentDocument.title,
      page: currentDocument.lastReadPage || undefined,
    })
  }

  const openHref = currentDocument.documentType === 'my_work'
    ? `/documents?id=${currentDocument.id}`
    : currentDocument.documentType === 'physical_book'
      ? `/books/notes?id=${currentDocument.id}`
      : `/reader/view?id=${currentDocument.id}`
  const backHref = returnTo === 'comments' ? '/comments' : '/libraries'
  const plainTextLength = htmlToPlainText(draft).length

  return (
    <div className="p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button asChild variant="outline" size="sm">
              <Link href={backHref}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
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
            {currentDocument.documentType === 'pdf' ? (
              <Button variant="outline" onClick={() => void handleOpenDocumentFromComment()}>
                <SquareArrowOutUpRight className="mr-2 h-4 w-4" />
                Open Reader
              </Button>
            ) : (
              <Button asChild variant="outline">
                <Link href={openHref}>
                  {currentDocument.documentType === 'physical_book'
                    ? 'Open Notes'
                    : 'Open Details'}
                </Link>
              </Button>
            )}
            <Button onClick={() => void handleSave()} disabled={!hasPendingChanges || isSaving || !isDesktopApp}>
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? 'Saving...' : 'Save Comment'}
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          <Card className="min-h-0" data-tour-id="comments-notes">
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
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="truncate text-sm font-semibold">{formatNoteTitle(note)}</span>
                              <span className="shrink-0 text-[11px] text-muted-foreground">
                                {formatCompactNoteTimestamp(note.updatedAt)}
                              </span>
                            </div>
                            <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{note.content || 'No note text yet.'}</div>
                          </div>
                          {note.pageNumber ? <Badge variant="outline">p. {note.pageNumber}</Badge> : null}
                        </div>
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

          <Card className="min-h-0" data-tour-id="comments-draft">
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
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-semibold">{formatNoteTitle(selectedNote)}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatCompactNoteTimestamp(selectedNote.updatedAt)}
                    </span>
                  </div>
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

export default function CommentsPage() {
  return <RealCommentsPage />
}
