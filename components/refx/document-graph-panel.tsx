'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowRight, ChevronDown, EyeOff, Link2, Network, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import * as repo from '@/lib/repositories/local-db'
import { formatReference } from '@/lib/services/work-reference-service'
import type { Document, DocumentRelation } from '@/lib/types'
import { getDocumentOpenHref } from '@/lib/services/document-relation-service'
import { useT } from '@/lib/localization'

type DocumentGraphPanelProps = {
  selectedDocument: Document | null
  selectedWorkReference?: repo.DbWorkReference | null
  selectedRelation: DocumentRelation | null
  sourceDocument: Document | null
  targetDocument: Document | null
  relatedIncomingDocuments: Document[]
  relatedOutgoingDocuments: Document[]
  relatedOutgoingReferences?: repo.DbWorkReference[]
  otherIncomingDocuments: Document[]
  otherOutgoingDocuments: Document[]
  onDeleteRelation: (relationId: string) => Promise<void> | void
  onInvertRelation?: (relationId: string) => Promise<void> | void
  onAddLinkedDocumentToMap?: (documentId: string) => Promise<void> | void
  onHideLinkedDocumentFromMap?: (documentId: string) => Promise<void> | void
  isDeletingRelation?: boolean
  onCloseSelection?: () => void
}

function LinkedDocumentRow({
  document,
  tone,
  actionLabel,
  actionIcon,
  onAction,
  compactAction = false,
}: {
  document: Document
  tone: 'incoming' | 'outgoing'
  actionLabel: string
  actionIcon: React.ReactNode
  onAction?: (documentId: string) => Promise<void> | void
  compactAction?: boolean
}) {
  const t = useT()

  return (
    <div className="flex min-w-0 items-start gap-2 overflow-hidden rounded-xl border border-current/15 bg-white/90 p-2 text-inherit">
      <div className="min-w-0 flex-1 rounded-lg px-1 py-0.5">
        <p className="break-words text-sm font-medium text-slate-900">{document.title}</p>
        <p className="mt-1 min-w-0 break-words text-xs text-slate-500">
          {document.authors[0] ?? t('searchPage.unknownAuthor')}
          {document.year ? ` - ${document.year}` : ''}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={actionLabel}
        title={actionLabel}
        className={compactAction
          ? tone === 'outgoing'
            ? 'h-8 w-8 shrink-0 border-sky-200 px-0 text-sky-800 hover:bg-sky-50'
            : 'h-8 w-8 shrink-0 border-rose-200 px-0 text-rose-800 hover:bg-rose-50'
          : tone === 'outgoing'
            ? 'h-auto min-w-[6.75rem] shrink-0 whitespace-nowrap border-sky-200 px-2.5 py-1.5 text-right leading-4 text-sky-800 hover:bg-sky-50'
            : 'h-auto min-w-[6.75rem] shrink-0 whitespace-nowrap border-rose-200 px-2.5 py-1.5 text-right leading-4 text-rose-800 hover:bg-rose-50'}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void onAction?.(document.id)
        }}
      >
        {actionIcon}
        {compactAction ? null : <span className="whitespace-nowrap">{actionLabel}</span>}
      </Button>
    </div>
  )
}

function LinkedReferenceRow({ workReference }: { workReference: repo.DbWorkReference }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white/90 p-2">
      <p className="break-words text-sm font-medium text-slate-900">{workReference.reference.title}</p>
      <p className="mt-1 break-words text-xs text-slate-500">
        {formatReference(workReference.reference, 'apa')}
      </p>
    </div>
  )
}

export function DocumentGraphPanel({
  selectedDocument,
  selectedWorkReference,
  selectedRelation,
  sourceDocument,
  targetDocument,
  relatedIncomingDocuments,
  relatedOutgoingDocuments,
  relatedOutgoingReferences = [],
  otherIncomingDocuments,
  otherOutgoingDocuments,
  onDeleteRelation,
  onInvertRelation,
  onAddLinkedDocumentToMap,
  onHideLinkedDocumentFromMap,
  isDeletingRelation = false,
  onCloseSelection,
}: DocumentGraphPanelProps) {
  const t = useT()
  const [isAbstractExpanded, setIsAbstractExpanded] = useState(false)
  const [isOtherOutgoingExpanded, setIsOtherOutgoingExpanded] = useState(false)
  const [isOtherIncomingExpanded, setIsOtherIncomingExpanded] = useState(false)

  useEffect(() => {
    setIsAbstractExpanded(false)
    setIsOtherOutgoingExpanded(false)
    setIsOtherIncomingExpanded(false)
  }, [selectedDocument?.id])

  if (!selectedDocument && !selectedRelation && !selectedWorkReference) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="p-5">
          <h2 className="text-base font-semibold">{t('mapsPage.relationDetails')}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('mapsPage.relationDetailsDescription')}
          </p>
        </div>
      </div>
    )
  }

  if (selectedWorkReference) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="rounded-full border border-dashed border-slate-300 bg-muted/70 p-2 text-slate-700">
                <Link2 className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold">{selectedWorkReference.reference.title}</h2>
                <p className="text-sm text-muted-foreground">Reference-only node</p>
              </div>
            </div>
            {onCloseSelection ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={onCloseSelection}
                aria-label={t('mapsPage.closeDetails')}
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
        <Separator />
        <ScrollArea className="h-0 min-h-0 flex-1">
          <div className="space-y-5 p-5">
            <div className="rounded-2xl border border-dashed bg-card p-4">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Formatted reference</p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {formatReference(selectedWorkReference.reference, 'apa')}
              </p>
            </div>
            <div className="grid gap-3">
              <div className="rounded-2xl bg-muted/60 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Match status</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {selectedWorkReference.matchedDocumentId
                    ? `Matched via ${selectedWorkReference.matchMethod?.replaceAll('_', ' ') ?? 'reference matching'}`
                    : 'No document match yet'}
                </p>
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>
    )
  }

  if (selectedRelation && sourceDocument && targetDocument) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="rounded-full bg-teal-100 p-2 text-teal-700">
                <Link2 className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold">{t('mapsPage.relation')}</h2>
                <p className="text-sm text-muted-foreground">
                  {t('mapsPage.relationDescription')}
                </p>
              </div>
            </div>
            {onCloseSelection ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={onCloseSelection}
                aria-label={t('mapsPage.closeDetails')}
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
        <Separator />
        <ScrollArea className="h-0 min-h-0 flex-1">
          <div className="space-y-5 p-5">
            <div className="grid gap-4 rounded-2xl border bg-card p-4">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{t('mapsPage.citingDocument')}</p>
                <Link
                  href={getDocumentOpenHref(sourceDocument)}
                  className="block rounded-xl border border-sky-200/80 bg-sky-50/70 px-3 py-3 transition hover:border-sky-300 hover:bg-sky-50"
                >
                  <p className="text-sm font-semibold text-slate-900">{sourceDocument.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {sourceDocument.authors[0] ?? t('searchPage.unknownAuthor')}
                    {sourceDocument.year ? ` - ${sourceDocument.year}` : ''}
                  </p>
                </Link>
              </div>
              <div className="flex items-center justify-center gap-3 py-1 text-sm font-medium text-sky-700">
                <span>{t('mapsPage.addReference')}</span>
                <ArrowRight className="h-4 w-4" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{t('mapsPage.referencedDocument')}</p>
                <Link
                  href={getDocumentOpenHref(targetDocument)}
                  className="block rounded-xl border border-rose-200/80 bg-rose-50/70 px-3 py-3 transition hover:border-rose-300 hover:bg-rose-50"
                >
                  <p className="text-sm font-semibold text-slate-900">{targetDocument.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {targetDocument.authors[0] ?? t('searchPage.unknownAuthor')}
                    {targetDocument.year ? ` - ${targetDocument.year}` : ''}
                  </p>
                </Link>
              </div>
            </div>

            <div className="grid gap-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={() => void onInvertRelation?.(selectedRelation.id)}
                    disabled={isDeletingRelation}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {t('mapsPage.reverseLinkDirection')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={8}>
                  {t('mapsPage.reverseLinkDirectionHelp')}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="destructive"
                    onClick={() => void onDeleteRelation(selectedRelation.id)}
                    disabled={isDeletingRelation}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('mapsPage.breakLink')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={8}>
                  {t('mapsPage.breakLinkHelp')}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </ScrollArea>
      </div>
    )
  }

  if (!selectedDocument) return null

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-sky-100 p-2 text-sky-700">
              <Network className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold">{selectedDocument.title}</h2>
              <p className="text-sm text-muted-foreground">
                {selectedDocument.documentType === 'physical_book'
                  ? t('mapsPage.physicalBook')
                  : selectedDocument.documentType === 'my_work'
                    ? t('mapsPage.myWorkType')
                    : t('mapsPage.pdfDocument')}
              </p>
            </div>
          </div>
          {onCloseSelection ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={onCloseSelection}
              aria-label={t('mapsPage.closeDetails')}
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>
      <Separator />
      <ScrollArea className="h-0 min-h-0 flex-1">
        <div className="space-y-5 p-5">
          <div className="grid gap-4 rounded-2xl border bg-card p-4">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{t('mapsPage.author')}</p>
              <p className="text-sm leading-6 text-muted-foreground">
                {selectedDocument.authors.length ? selectedDocument.authors.join(', ') : t('mapsPage.none')}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{t('metadataFields.year')}</p>
              <p className="text-sm leading-6 text-muted-foreground">
                {selectedDocument.year ?? t('mapsPage.none')}
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{t('mapsPage.abstract')}</p>
                {selectedDocument.abstract?.trim() ? (
                  <button
                    type="button"
                    onClick={() => setIsAbstractExpanded((current) => !current)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition hover:text-foreground"
                  >
                    {isAbstractExpanded ? t('mapsPage.collapse') : t('mapsPage.expand')}
                    <ChevronDown className={isAbstractExpanded ? 'h-3.5 w-3.5 rotate-180' : 'h-3.5 w-3.5'} />
                  </button>
                ) : null}
              </div>
              <p className={isAbstractExpanded ? 'text-sm leading-6 text-muted-foreground' : 'line-clamp-3 text-sm leading-6 text-muted-foreground'}>
                {selectedDocument.abstract?.trim() || t('mapsPage.none')}
              </p>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-sky-200/80 bg-sky-50/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-sky-900">{t('mapsPage.makesReferenceTo')}</h3>
              <Badge className="border-sky-200 bg-sky-100 text-sky-700 hover:bg-sky-100">
                {relatedOutgoingDocuments.length + relatedOutgoingReferences.length}
              </Badge>
            </div>
            <div className="space-y-2">
              {relatedOutgoingDocuments.length || relatedOutgoingReferences.length ? (
                <>
                  {relatedOutgoingDocuments.map((document) => (
                    <LinkedDocumentRow
                      key={document.id}
                      document={document}
                      tone="outgoing"
                      actionLabel={t('mapsPage.hideFromMap')}
                      actionIcon={<EyeOff className="mr-1 h-3.5 w-3.5" />}
                      onAction={onHideLinkedDocumentFromMap}
                    />
                  ))}
                  {relatedOutgoingReferences.map((workReference) => (
                    <LinkedReferenceRow key={workReference.id} workReference={workReference} />
                  ))}
                </>
              ) : (
                <p className="text-sm text-sky-800/80">{t('mapsPage.none')}</p>
              )}
            </div>
            {otherOutgoingDocuments.length ? (
              <div className="space-y-2 rounded-xl border border-sky-200/70 bg-white/55 p-3">
                <button
                  type="button"
                  onClick={() => setIsOtherOutgoingExpanded((current) => !current)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-sky-800">
                    {t('mapsPage.otherLinks')}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge className="border-sky-200 bg-sky-100 text-sky-700 hover:bg-sky-100">
                      {otherOutgoingDocuments.length}
                    </Badge>
                    <ChevronDown className={isOtherOutgoingExpanded ? 'h-4 w-4 rotate-180 text-sky-700' : 'h-4 w-4 text-sky-700'} />
                  </div>
                </button>
                {isOtherOutgoingExpanded ? (
                  <div className="space-y-2">
                    {otherOutgoingDocuments.map((document) => (
                      <LinkedDocumentRow
                        key={`other-outgoing-${document.id}`}
                        document={document}
                        tone="outgoing"
                        actionLabel={t('mapsPage.addToMap')}
                        actionIcon={<Plus className="h-3.5 w-3.5" />}
                        onAction={onAddLinkedDocumentToMap}
                        compactAction
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="space-y-3 rounded-2xl border border-rose-200/80 bg-rose-50/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-rose-900">{t('mapsPage.isReferencedBy')}</h3>
              <Badge className="border-rose-200 bg-rose-100 text-rose-700 hover:bg-rose-100">
                {relatedIncomingDocuments.length}
              </Badge>
            </div>
            <div className="space-y-2">
              {relatedIncomingDocuments.length ? (
                relatedIncomingDocuments.map((document) => (
                  <LinkedDocumentRow
                    key={document.id}
                    document={document}
                    tone="incoming"
                    actionLabel={t('mapsPage.hideFromMap')}
                    actionIcon={<EyeOff className="mr-1 h-3.5 w-3.5" />}
                    onAction={onHideLinkedDocumentFromMap}
                  />
                ))
              ) : (
                <p className="text-sm text-rose-800/80">{t('mapsPage.none')}</p>
              )}
            </div>
            {otherIncomingDocuments.length ? (
              <div className="space-y-2 rounded-xl border border-rose-200/70 bg-white/55 p-3">
                <button
                  type="button"
                  onClick={() => setIsOtherIncomingExpanded((current) => !current)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-rose-800">
                    {t('mapsPage.otherLinks')}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge className="border-rose-200 bg-rose-100 text-rose-700 hover:bg-rose-100">
                      {otherIncomingDocuments.length}
                    </Badge>
                    <ChevronDown className={isOtherIncomingExpanded ? 'h-4 w-4 rotate-180 text-rose-700' : 'h-4 w-4 text-rose-700'} />
                  </div>
                </button>
                {isOtherIncomingExpanded ? (
                  <div className="space-y-2">
                    {otherIncomingDocuments.map((document) => (
                      <LinkedDocumentRow
                        key={`other-incoming-${document.id}`}
                        document={document}
                        tone="incoming"
                        actionLabel={t('mapsPage.addToMap')}
                        actionIcon={<Plus className="h-3.5 w-3.5" />}
                        onAction={onAddLinkedDocumentToMap}
                        compactAction
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
