'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Copy, ExternalLink, FileText, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/refx/common'
import { useAppStore } from '@/lib/store'

function formatCitation(document: ReturnType<typeof useAppStore.getState>['documents'][number]) {
  const authorPart = document.authors.length > 0 ? document.authors.join(', ') : 'Unknown author'
  const yearPart = document.year ? `(${document.year})` : '(n.d.)'
  const doiPart = document.doi ? ` https://doi.org/${document.doi}` : ''
  return `${authorPart} ${yearPart}. ${document.title}.${doiPart}`
}

export default function ReferencesPage() {
  const { documents } = useAppStore()
  const [query, setQuery] = useState('')

  const filteredDocuments = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return documents
    return documents.filter((document) =>
      [document.title, document.authors.join(' '), document.citationKey, document.doi]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(trimmed),
    )
  }, [documents, query])

  if (documents.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={FileText}
          title="No references yet"
          description="References will appear from real local document metadata once you import PDFs."
          action={
            <Button asChild>
              <Link href="/libraries">Open Libraries</Link>
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div>
          <h1 className="text-xl font-semibold">References</h1>
          <p className="text-sm text-muted-foreground">Generated from real local document metadata only.</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="relative mb-4 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search references..." className="pl-9" />
        </div>

        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Authors</TableHead>
                <TableHead className="w-24">Year</TableHead>
                <TableHead>Citation Key</TableHead>
                <TableHead className="w-28">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDocuments.map((document) => (
                <TableRow key={document.id}>
                  <TableCell>
                    <div className="space-y-1">
                      <Link href={`/reader/view?id=${document.id}`} className="font-medium hover:text-primary">
                        {document.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">{formatCitation(document)}</p>
                    </div>
                  </TableCell>
                  <TableCell>{document.authors.join(', ') || 'Unknown author'}</TableCell>
                  <TableCell>{document.year ?? '-'}</TableCell>
                  <TableCell>{document.citationKey || '-'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => void navigator.clipboard.writeText(formatCitation(document))}
                        aria-label="Copy citation"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      {document.doi && (
                        <Button variant="ghost" size="icon" asChild aria-label="Open DOI">
                          <a href={`https://doi.org/${document.doi}`} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {filteredDocuments.length === 0 && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">No matching references</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              No local document metadata matched that search.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
