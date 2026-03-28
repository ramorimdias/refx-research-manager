'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowRight, ExternalLink, Link2, Network, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import type { Document, DocumentRelation, DocumentRelationLinkType } from '@/lib/types'
import { getDocumentOpenHref } from '@/lib/services/document-relation-service'

type DocumentGraphPanelProps = {
  selectedDocument: Document | null
  selectedRelation: DocumentRelation | null
  sourceDocument: Document | null
  targetDocument: Document | null
  selectedLibraryName?: string | null
  relatedNotesCount: number
  relatedIncomingCount: number
  relatedOutgoingCount: number
  relatedProposedCitationsCount?: number
  onDeleteRelation: (relationId: string) => Promise<void> | void
  onUpdateRelationStatus?: (relationId: string, relationStatus: 'confirmed' | 'rejected') => Promise<void> | void
  onRebuildDocumentCitations?: (documentId: string) => Promise<void> | void
  onCenterDocument?: (documentId: string) => void
  onShowNeighborsOnly?: (documentId: string) => void
  onPinDocument?: (documentId: string, pinned: boolean) => Promise<void> | void
  onResetDocumentPosition?: (documentId: string) => Promise<void> | void
  onRemoveDocumentFromView?: (documentId: string) => Promise<void> | void
  onUpdateManualRelation?: (relationId: string, input: {
    linkType?: DocumentRelationLinkType
    label?: string
    notes?: string
  }) => Promise<void> | void
  isPinned?: boolean
  isDeletingRelation?: boolean
  isRebuildingDocumentCitations?: boolean
}

function formatLinkType(value: string) {
  return value.replace(/_/g, ' ')
}

export function DocumentGraphPanel({
  selectedDocument,
  selectedRelation,
  sourceDocument,
  targetDocument,
  selectedLibraryName,
  relatedNotesCount,
  relatedIncomingCount,
  relatedOutgoingCount,
  relatedProposedCitationsCount = 0,
  onDeleteRelation,
  onUpdateRelationStatus,
  onRebuildDocumentCitations,
  onCenterDocument,
  onShowNeighborsOnly,
  onPinDocument,
  onResetDocumentPosition,
  onRemoveDocumentFromView,
  onUpdateManualRelation,
  isPinned = false,
  isDeletingRelation = false,
  isRebuildingDocumentCitations = false,
}: DocumentGraphPanelProps) {
  const [manualLinkType, setManualLinkType] = useState<DocumentRelationLinkType>('manual')
  const [manualLabel, setManualLabel] = useState('')
  const [manualNotes, setManualNotes] = useState('')

  useEffect(() => {
    if (selectedRelation?.linkOrigin === 'user') {
      setManualLinkType(selectedRelation.linkType)
      setManualLabel(selectedRelation.label ?? '')
      setManualNotes(selectedRelation.notes ?? '')
    }
  }, [selectedRelation])

  if (!selectedDocument && !selectedRelation) {
    return (
      <div className="flex h-full flex-col">
        <div className="p-5">
          <h2 className="text-base font-semibold">Relationship Details</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Select a document node to inspect it, or click a connection to review or remove that relation.
          </p>
        </div>
      </div>
    )
  }

  if (selectedRelation && sourceDocument && targetDocument) {
    return (
      <div className="flex h-full flex-col">
        <div className="p-5">
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-teal-100 p-2 text-teal-700">
              <Link2 className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Relation</h2>
              <p className="text-sm text-muted-foreground">
                Review this persisted link between two documents.
              </p>
            </div>
          </div>
        </div>
        <Separator />
        <ScrollArea className="flex-1">
          <div className="space-y-5 p-5">
            <div className="rounded-2xl border bg-card p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span className="truncate">{sourceDocument.title}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{targetDocument.title}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="secondary">{formatLinkType(selectedRelation.linkType)}</Badge>
                <Badge variant={selectedRelation.linkOrigin === 'user' ? 'default' : 'outline'}>
                  {selectedRelation.linkOrigin === 'user' ? 'Manual' : 'Automatic'}
                </Badge>
                {selectedRelation.relationStatus ? (
                  <Badge variant={selectedRelation.relationStatus === 'proposed' ? 'secondary' : 'outline'}>
                    {formatLinkType(selectedRelation.relationStatus)}
                  </Badge>
                ) : null}
              </div>
              {selectedRelation.label ? (
                <p className="mt-3 text-sm text-muted-foreground">{selectedRelation.label}</p>
              ) : null}
              {selectedRelation.notes ? (
                <p className="mt-2 text-sm text-muted-foreground">{selectedRelation.notes}</p>
              ) : null}
              {typeof selectedRelation.confidence === 'number' ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Confidence: {Math.round(selectedRelation.confidence * 100)}%
                </p>
              ) : null}
              {selectedRelation.matchMethod ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Match method: {formatLinkType(selectedRelation.matchMethod)}
                </p>
              ) : null}
              {selectedRelation.rawReferenceText ? (
                <div className="mt-3 rounded-xl bg-slate-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                    Matched reference
                  </p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {selectedRelation.rawReferenceText}
                  </p>
                </div>
              ) : null}
              {selectedRelation.parseWarnings?.length ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Parse warnings: {selectedRelation.parseWarnings.map(formatLinkType).join(', ')}
                </p>
              ) : null}
              {selectedRelation.matchDebugInfo ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Debug: {selectedRelation.matchDebugInfo}
                </p>
              ) : null}
            </div>

            {selectedRelation.linkOrigin === 'user' ? (
              <div className="grid gap-3 rounded-2xl border bg-card p-4">
                <div className="space-y-2">
                  <Label>Manual relationship type</Label>
                  <Select
                    value={manualLinkType}
                    onValueChange={(value) => setManualLinkType(value as DocumentRelationLinkType)}
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual</SelectItem>
                      <SelectItem value="related">Related</SelectItem>
                      <SelectItem value="supports">Supports</SelectItem>
                      <SelectItem value="contradicts">Contradicts</SelectItem>
                      <SelectItem value="same_topic">Same topic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Relationship label</Label>
                  <Input
                    value={manualLabel}
                    onChange={(event) => setManualLabel(event.target.value)}
                    placeholder="Optional short label"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Relationship note</Label>
                  <Textarea
                    value={manualNotes}
                    onChange={(event) => setManualNotes(event.target.value)}
                    placeholder="Optional note about why these documents are connected"
                    className="min-h-24"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() => void onUpdateManualRelation?.(selectedRelation.id, {
                    linkType: manualLinkType,
                    label: manualLabel.trim() || undefined,
                    notes: manualNotes.trim() || undefined,
                  })}
                >
                  Save Manual Link Details
                </Button>
              </div>
            ) : null}

            <div className="grid gap-3">
              {selectedRelation.linkType === 'citation' && selectedRelation.linkOrigin === 'auto' ? (
                <>
                  <Button
                    variant="default"
                    onClick={() => void onUpdateRelationStatus?.(selectedRelation.id, 'confirmed')}
                  >
                    Confirm Citation
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void onUpdateRelationStatus?.(selectedRelation.id, 'rejected')}
                  >
                    Reject Citation
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Ignore for now by leaving this proposed link unchanged.
                  </p>
                </>
              ) : null}
              <Button asChild variant="outline">
                <Link href={getDocumentOpenHref(sourceDocument)}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open Source Document
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={getDocumentOpenHref(targetDocument)}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open Target Document
                </Link>
              </Button>
              <Button
                variant="destructive"
                onClick={() => void onDeleteRelation(selectedRelation.id)}
                disabled={isDeletingRelation}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Relation
              </Button>
            </div>
          </div>
        </ScrollArea>
      </div>
    )
  }

  if (!selectedDocument) return null

  return (
    <div className="flex h-full flex-col">
      <div className="p-5">
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-sky-100 p-2 text-sky-700">
            <Network className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold">{selectedDocument.title}</h2>
            <p className="text-sm text-muted-foreground">
              {selectedDocument.documentType === 'physical_book' ? 'Physical book' : 'PDF document'}
            </p>
          </div>
        </div>
      </div>
      <Separator />
      <ScrollArea className="flex-1">
        <div className="space-y-5 p-5">
          <div className="flex flex-wrap gap-2">
            {selectedDocument.authors.slice(0, 3).map((author) => (
              <Badge key={author} variant="secondary">{author}</Badge>
            ))}
            {selectedDocument.year ? <Badge variant="outline">{selectedDocument.year}</Badge> : null}
            <Badge variant="outline">{selectedDocument.notesCount} notes</Badge>
          </div>

          {selectedDocument.abstract ? (
            <p className="text-sm leading-6 text-muted-foreground">{selectedDocument.abstract}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No abstract is stored yet for this document.
            </p>
          )}

          <div className="grid gap-3 rounded-2xl border bg-card p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Outgoing links</span>
              <span className="font-medium">{relatedOutgoingCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Incoming links</span>
              <span className="font-medium">{relatedIncomingCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Notes</span>
              <span className="font-medium">{relatedNotesCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Proposed citations</span>
              <span className="font-medium">{relatedProposedCitationsCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Total links</span>
              <span className="font-medium">{relatedIncomingCount + relatedOutgoingCount}</span>
            </div>
            {selectedLibraryName ? (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Library</span>
                <span className="font-medium">{selectedLibraryName}</span>
              </div>
            ) : null}
          </div>

          <Button asChild>
            <Link href={getDocumentOpenHref(selectedDocument)}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Open Document
            </Link>
          </Button>
          <Button
            variant="outline"
            onClick={() => onCenterDocument?.(selectedDocument.id)}
          >
            Center Graph On Node
          </Button>
          <Button
            variant="outline"
            onClick={() => onShowNeighborsOnly?.(selectedDocument.id)}
          >
            Show Neighbors Only
          </Button>
          <Button
            variant="outline"
            onClick={() => void onPinDocument?.(selectedDocument.id, !isPinned)}
          >
            {isPinned ? 'Unpin Node Position' : 'Pin Node Position'}
          </Button>
          <Button
            variant="outline"
            onClick={() => void onResetDocumentPosition?.(selectedDocument.id)}
          >
            Reset Node Position
          </Button>
          <Button
            variant="outline"
            onClick={() => void onRemoveDocumentFromView?.(selectedDocument.id)}
          >
            Remove Node From View
          </Button>
          <Button
            variant="outline"
            onClick={() => void onRebuildDocumentCitations?.(selectedDocument.id)}
            disabled={isRebuildingDocumentCitations}
          >
            <Link2 className="mr-2 h-4 w-4" />
            Rebuild Citations For Document
          </Button>
        </div>
      </ScrollArea>
    </div>
  )
}
