'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, StickyNote, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import * as repo from '@/lib/repositories/local-db'
import { appDataDir, convertFileSrc, copyFile, isTauri, join, mkdir, open, readFile } from '@/lib/tauri/client'
import { useAppStore } from '@/lib/store'

export default function ReaderViewPage() {
  const params = useSearchParams()
  const id = params.get('id') ?? ''
  const { documents, setActiveDocument, updateDocument, loadNotes, refreshData, isDesktopApp } = useAppStore()
  const document = useMemo(() => documents.find((entry) => entry.id === id) ?? null, [documents, id])
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(100)
  const [note, setNote] = useState('')
  const [blobPdfUrl, setBlobPdfUrl] = useState('')
  const [viewerError, setViewerError] = useState<string | null>(null)

  useEffect(() => {
    if (!document) return
    setActiveDocument(document.id)
    if (document.lastReadPage) {
      setPage(document.lastReadPage)
    }
    if (document.readingStage === 'unread') {
      void updateDocument(document.id, { readingStage: 'reading' })
    }
  }, [document, setActiveDocument, updateDocument])

  useEffect(() => {
    let objectUrl = ''

    const loadPdf = async () => {
      if (!document?.filePath || !isTauri()) {
        setBlobPdfUrl('')
        return
      }

      try {
        const bytes = await readFile(document.filePath)
        const blob = new Blob([bytes], { type: 'application/pdf' })
        objectUrl = URL.createObjectURL(blob)
        setBlobPdfUrl(objectUrl)
        setViewerError(null)
      } catch (error) {
        console.error('Failed to read PDF for embedded viewer:', error)
        setBlobPdfUrl('')
        setViewerError('Embedded PDF preview is unavailable. Open this document in your system PDF app.')
      }
    }

    void loadPdf()

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [document?.filePath])

  useEffect(() => {
    if (!id || !document) return
    const timeout = window.setTimeout(() => {
      void updateDocument(id, {
        readingStage: document.readingStage === 'unread' ? 'reading' : document.readingStage,
      })
      void repo.updateDocumentMetadata(id, {
        lastReadPage: page,
        lastOpenedAt: new Date().toISOString(),
      })
    }, 150)

    return () => window.clearTimeout(timeout)
  }, [document, id, page, updateDocument])

  const fileUrl = useMemo(() => {
    if (isTauri() && document?.filePath) return convertFileSrc(document.filePath)
    return ''
  }, [document?.filePath])

  const importPdfForDocument = async () => {
    if (!isTauri() || !document?.id || !document?.libraryId) return

    const selected = await open({
      multiple: false,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      title: 'Import PDF for this document',
    })

    if (!selected || Array.isArray(selected)) return

    const base = await appDataDir()
    const targetDir = await join(base, 'pdfs', document.libraryId)
    await mkdir(targetDir, { recursive: true })

    const destination = await join(targetDir, `${document.id}.pdf`)
    await copyFile(selected, destination)

    await repo.updateDocumentMetadata(document.id, { importedFilePath: destination })
    await refreshData()
  }

  if (!document) {
    return <div className="p-6">Document not found.</div>
  }

  return (
    <div className="flex h-full">
      <div className="flex flex-1 flex-col">
        <div className="flex items-center gap-2 border-b p-3">
          <Button asChild variant="outline" size="sm">
            <Link href={`/documents?id=${id}&edit=1`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Input value={page} onChange={(event) => setPage(Math.max(1, Number(event.target.value) || 1))} className="w-20" />
          <Button variant="outline" size="sm" onClick={() => setPage((current) => current + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setZoom((current) => Math.max(50, current - 10))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm">{zoom}%</span>
          <Button variant="outline" size="sm" onClick={() => setZoom((current) => Math.min(250, current + 10))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          {fileUrl && (
            <Button asChild variant="ghost" size="sm" className="ml-auto">
              <a href={fileUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                Open external
              </a>
            </Button>
          )}
        </div>
        <div className="flex-1 overflow-auto bg-muted/30 p-4">
          {blobPdfUrl ? (
            <iframe src={`${blobPdfUrl}#page=${page}&zoom=${zoom}`} className="h-full w-full rounded border bg-white" title="PDF Reader" />
          ) : (
            <div className="space-y-2 p-6">
              <p>{viewerError ?? 'PDF unavailable. Import a PDF in desktop mode.'}</p>
              {isDesktopApp && document.id && (
                <Button size="sm" onClick={() => void importPdfForDocument()}>
                  Import PDF...
                </Button>
              )}
              {fileUrl && (
                <a className="text-sm text-primary underline" href={fileUrl} target="_blank" rel="noreferrer">
                  Open with system viewer
                </a>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="w-80 space-y-2 border-l p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <StickyNote className="h-4 w-4" />
          Page note
        </div>
        <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add page note" className="min-h-40" />
        <Button
          size="sm"
          onClick={async () => {
            if (!id || !isDesktopApp || !note.trim()) return
            await repo.createNote({ documentId: id, title: `Page ${page} note`, content: note })
            setNote('')
            await loadNotes()
          }}
          disabled={!isDesktopApp}
        >
          Save note
        </Button>
      </div>
    </div>
  )
}
