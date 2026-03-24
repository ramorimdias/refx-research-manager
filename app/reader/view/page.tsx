'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, StickyNote, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import * as repo from '@/lib/repositories/local-db'
import { convertFileSrc, isTauri, readFile } from '@/lib/tauri/client'

export default function ReaderViewPage() {
  const params = useSearchParams()
  const id = params.get('id') ?? ''
  const [doc, setDoc] = useState<any>(null)
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(100)
  const [note, setNote] = useState('')
  const [blobPdfUrl, setBlobPdfUrl] = useState('')
  const [viewerError, setViewerError] = useState<string | null>(null)

  useEffect(() => {
    if (!id || !isTauri()) return
    repo.getDocumentById(id).then((d) => {
      setDoc(d)
      if (d?.lastReadPage) setPage(d.lastReadPage)
    })
  }, [id])

  useEffect(() => {
    if (!id || !isTauri()) return
    repo.updateDocumentMetadata(id, {
      lastReadPage: page,
      lastOpenedAt: new Date().toISOString(),
    })
  }, [id, page])

  useEffect(() => {
    let objectUrl = ''

    const loadPdf = async () => {
      if (!doc?.importedFilePath || !isTauri()) {
        setBlobPdfUrl('')
        return
      }

      try {
        const bytes = await readFile(doc.importedFilePath)
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

    loadPdf()

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [doc?.importedFilePath])

  const fileUrl = useMemo(() => {
    if (!doc?.importedFilePath || !isTauri()) return ''
    return convertFileSrc(doc.importedFilePath)
  }, [doc])

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col">
        <div className="border-b p-3 flex items-center gap-2">
          <Button asChild variant="outline" size="sm"><Link href={`/documents?id=${id}`}><ArrowLeft className="h-4 w-4" /></Link></Button>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="h-4 w-4" /></Button>
          <Input value={page} onChange={(e) => setPage(Math.max(1, Number(e.target.value) || 1))} className="w-20" />
          <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setZoom((z) => Math.max(50, z - 10))}><ZoomOut className="h-4 w-4" /></Button>
          <span className="text-sm">{zoom}%</span>
          <Button variant="outline" size="sm" onClick={() => setZoom((z) => Math.min(250, z + 10))}><ZoomIn className="h-4 w-4" /></Button>
          {fileUrl && (
            <Button asChild variant="ghost" size="sm" className="ml-auto">
              <a href={fileUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />Open external
              </a>
            </Button>
          )}
        </div>
        <div className="flex-1 overflow-auto bg-muted/30 p-4">
          {blobPdfUrl ? (
            <iframe
              src={`${blobPdfUrl}#page=${page}&zoom=${zoom}`}
              className="w-full h-full border rounded bg-white"
              title="PDF Reader"
            />
          ) : (
            <div className="p-6 space-y-2">
              <p>{viewerError ?? 'PDF unavailable. Import a PDF in desktop mode.'}</p>
              {fileUrl && (
                <a className="text-sm text-primary underline" href={fileUrl} target="_blank" rel="noreferrer">
                  Open with system viewer
                </a>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="w-80 border-l p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium"><StickyNote className="h-4 w-4" />Page note</div>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add page note" className="min-h-40" />
        <Button size="sm" onClick={() => id && repo.createNote({ documentId: id, title: `Page ${page} note`, content: note })}>Save note</Button>
      </div>
    </div>
  )
}
