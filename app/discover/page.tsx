'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Calendar, FileText, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, ReadingStageBadge } from '@/components/refx/common'
import { useAppStore } from '@/lib/store'

export default function DiscoverPage() {
  const { documents } = useAppStore()
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return []
    return documents.filter((document) =>
      [document.title, document.authors.join(' '), document.abstract, document.doi, document.citationKey]
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
          icon={Search}
          title="Nothing to discover yet"
          description="Import local documents first. Discover will search only real local content."
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
      <div className="border-b border-border p-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search local documents by title, author, abstract, DOI, or citation key"
            className="h-12 pl-12"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {query.trim() === '' ? (
          <EmptyState
            icon={Search}
            title="Search your local library"
            description="Start typing to search only the documents stored in this workspace."
          />
        ) : results.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No local matches"
            description="Try another keyword or import more PDFs into your library."
          />
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium">
                {results.length} result{results.length === 1 ? '' : 's'} for "{query}"
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {results.map((document) => (
                <Link key={document.id} href={`/reader/view?id=${document.id}`}>
                  <Card className="h-full transition-colors hover:border-primary/50">
                    <CardHeader className="pb-3">
                      <CardTitle className="line-clamp-2 text-base">{document.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="line-clamp-2 text-sm text-muted-foreground">
                        {document.authors.join(', ') || 'Unknown author'}
                      </p>
                      {document.abstract && <p className="line-clamp-3 text-sm text-muted-foreground">{document.abstract}</p>}
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {document.year ?? 'Unknown year'}
                        </span>
                        <ReadingStageBadge stage={document.readingStage} />
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <FileText className="h-3 w-3" />
                        {document.citationKey || 'No citation key'}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
