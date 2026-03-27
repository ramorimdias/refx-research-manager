'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, BookOpen, Save, Star, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmptyState, StarRating, TagChip } from '@/components/refx/common'
import { useAppStore } from '@/lib/store'
import type { ReadingStage } from '@/lib/types'

const readingStages: Array<{ value: ReadingStage; label: string }> = [
  { value: 'unread', label: 'Unread' },
  { value: 'reading', label: 'Reading' },
  { value: 'skimmed', label: 'Skimmed' },
  { value: 'read', label: 'Read' },
  { value: 'archived', label: 'Archived' },
]

export default function DocumentDetailPage() {
  const params = useSearchParams()
  const id = params.get('id')
  const { documents, initialized, addDocumentTag, removeDocumentTag, acceptSuggestedTag, rejectSuggestedTag, updateDocument, setActiveDocument } = useAppStore()
  const document = useMemo(() => documents.find((entry) => entry.id === id) ?? null, [documents, id])

  const [title, setTitle] = useState('')
  const [authors, setAuthors] = useState('')
  const [year, setYear] = useState('')
  const [doi, setDoi] = useState('')
  const [isbn, setIsbn] = useState('')
  const [publisher, setPublisher] = useState('')
  const [citationKey, setCitationKey] = useState('')
  const [abstract, setAbstract] = useState('')
  const [readingStage, setReadingStage] = useState<ReadingStage>('unread')
  const [rating, setRating] = useState(0)
  const [favorite, setFavorite] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!document) return
    setActiveDocument(document.id)
    setTitle(document.title)
    setAuthors(document.authors.join(', '))
    setYear(document.year ? String(document.year) : '')
    setDoi(document.doi ?? '')
    setIsbn(document.isbn ?? '')
    setPublisher(document.publisher ?? '')
    setCitationKey(document.citationKey ?? '')
    setAbstract(document.abstract ?? '')
    setReadingStage(document.readingStage)
    setRating(document.rating)
    setFavorite(document.favorite)
  }, [document, setActiveDocument])

  if (!id) {
    return <div className="p-6">Missing document id.</div>
  }

  if (!document) {
    if (!initialized) return <div className="p-6">Loading document...</div>
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={BookOpen}
          title="Document not found"
          description="This document is no longer available in your local library."
          action={
            <Button asChild>
              <Link href="/libraries">Back to Libraries</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await updateDocument(document.id, {
        title: title.trim() || document.title,
        authors: authors
          .split(',')
          .map((author) => author.trim())
          .filter(Boolean),
        year: year ? Number(year) : undefined,
        doi: doi.trim() || undefined,
        isbn: isbn.trim() || undefined,
        publisher: publisher.trim() || undefined,
        citationKey: citationKey.trim() || '',
        abstract: abstract.trim() || undefined,
        readingStage,
        rating,
        favorite,
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddTag = async () => {
    if (!document || !tagInput.trim()) return
    await addDocumentTag(document.id, tagInput)
    setTagInput('')
  }

  return (
    <div className="p-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/libraries">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>

          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link href={document.documentType === 'physical_book' ? `/books/notes?id=${document.id}` : `/reader/view?id=${document.id}`}>
                <BookOpen className="mr-2 h-4 w-4" />
                {document.documentType === 'physical_book' ? 'Open Notes' : 'Open Reader'}
              </Link>
            </Button>
            <Button onClick={() => void handleSave()} disabled={isSaving}>
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Edit Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label htmlFor="title">Title</Label>
                <Input id="title" className="mt-1.5" value={title} onChange={(event) => setTitle(event.target.value)} />
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="authors">Authors</Label>
                <Input
                  id="authors"
                  className="mt-1.5"
                  value={authors}
                  onChange={(event) => setAuthors(event.target.value)}
                  placeholder="Comma-separated author names"
                />
              </div>

              <div>
                <Label htmlFor="year">Year</Label>
                <Input id="year" className="mt-1.5" value={year} onChange={(event) => setYear(event.target.value)} />
              </div>

              <div>
                <Label htmlFor="reading-stage">Reading Stage</Label>
                <Select value={readingStage} onValueChange={(value) => setReadingStage(value as ReadingStage)}>
                  <SelectTrigger id="reading-stage" className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {readingStages.map((stage) => (
                      <SelectItem key={stage.value} value={stage.value}>
                        {stage.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="doi">DOI</Label>
                <Input id="doi" className="mt-1.5" value={doi} onChange={(event) => setDoi(event.target.value)} />
              </div>

              <div>
                <Label htmlFor="isbn">ISBN</Label>
                <Input id="isbn" className="mt-1.5" value={isbn} onChange={(event) => setIsbn(event.target.value)} />
              </div>

              <div>
                <Label htmlFor="publisher">Publisher</Label>
                <Input id="publisher" className="mt-1.5" value={publisher} onChange={(event) => setPublisher(event.target.value)} />
              </div>

              <div>
                <Label htmlFor="citation-key">Citation Key</Label>
                <Input
                  id="citation-key"
                  className="mt-1.5"
                  value={citationKey}
                  onChange={(event) => setCitationKey(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Rating</Label>
                <StarRating rating={rating} onChange={setRating} />
              </div>

              <div className="space-y-2">
                <Label>Favorite</Label>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm"
                  onClick={() => setFavorite((current) => !current)}
                >
                  <Star className="h-4 w-4" fill={favorite ? 'currentColor' : 'none'} />
                  {favorite ? 'Marked Favorite' : 'Mark Favorite'}
                </button>
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="abstract">Abstract</Label>
                <Textarea
                  id="abstract"
                  className="mt-1.5 min-h-40"
                  value={abstract}
                  onChange={(event) => setAbstract(event.target.value)}
                />
              </div>

              <div className="md:col-span-2 space-y-4 rounded-lg border border-border p-4">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Tags</Label>
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {document.tags.length > 0 ? (
                      document.tags.map((tag) => (
                        <TagChip
                          key={tag}
                          name={tag}
                          removable
                          onRemove={() => void removeDocumentTag(document.id, tag)}
                        />
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No tags added yet.</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={tagInput}
                      onChange={(event) => setTagInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          void handleAddTag()
                        }
                      }}
                      placeholder="Add a manual tag"
                    />
                    <Button type="button" variant="outline" onClick={() => void handleAddTag()} disabled={!tagInput.trim()}>
                      Add Tag
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Suggested Tags</Label>
                  {document.suggestedTags && document.suggestedTags.length > 0 ? (
                    <div className="space-y-2">
                      {document.suggestedTags.map((tag) => (
                        <div key={tag.name} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
                          <TagChip name={tag.name} />
                          {typeof tag.confidence === 'number' && (
                            <span className="text-xs text-muted-foreground">
                              {Math.round(tag.confidence * 100)}%
                            </span>
                          )}
                          <Button size="sm" variant="outline" onClick={() => void acceptSuggestedTag(document.id, tag.name)}>
                            Accept
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => void rejectSuggestedTag(document.id, tag.name)}>
                            Reject
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No pending tag suggestions for this document.</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Semantic Classification</Label>
                  {document.classification ? (
                    <div className="space-y-2 rounded-md border border-border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{document.classification.category}</span>
                        <span className="text-xs text-muted-foreground">/</span>
                        <span className="text-sm">{document.classification.topic}</span>
                        <span className="text-xs text-muted-foreground">
                          {Math.round(document.classification.confidence * 100)}% confidence
                        </span>
                      </div>
                      {document.classification.suggestedTags && document.classification.suggestedTags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {document.classification.suggestedTags.map((tag) => (
                            <TagChip key={tag.name} name={tag.name} />
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No semantic classification saved for this document.</p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
