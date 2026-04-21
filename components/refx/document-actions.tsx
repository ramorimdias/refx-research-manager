'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { BookMarked, BookOpen, Copy, Edit, ExternalLink, FileText, FolderOpen, MessageSquare, Telescope, Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
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
import * as repo from '@/lib/repositories/local-db'
import type { Document } from '@/lib/types'
import { useDocumentActions } from '@/lib/stores/document-store'
import { useDocumentStore } from '@/lib/stores/document-store'
import { useT } from '@/lib/localization'
import { findReusableReference, seedReferenceFromDocument } from '@/lib/services/work-reference-service'
import { toast } from 'sonner'

interface DocumentActionsProps {
  document: Document
  trigger: ReactNode
}

interface DocumentContextMenuProps {
  document: Document
  children: ReactNode
  prependContextItems?: ReactNode
}

function formatCitation(document: Document) {
  const authorPart = document.authors.length > 0 ? document.authors.join(', ') : 'Unknown author'
  const yearPart = document.year ? `(${document.year})` : '(n.d.)'
  const doiPart = document.doi ? ` https://doi.org/${document.doi}` : ''
  return `${authorPart} ${yearPart}. ${document.title}.${doiPart}`
}

function useDocumentActionState(document: Document) {
  const t = useT()
  const { deleteDocument } = useDocumentActions()
  const documents = useDocumentStore((state) => state.documents)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleCopyCitation = async () => {
    await navigator.clipboard.writeText(formatCitation(document))
  }

  const handleOpenDoi = () => {
    if (!document.doi) return
    window.open(`https://doi.org/${document.doi}`, '_blank', 'noopener,noreferrer')
  }

  const handleOpenFileLocation = async () => {
    if (!document.filePath) return
    const resolvedPath = await repo.ensureDocumentPdfInStorage(document.id)
    await repo.openDocumentFileLocation(resolvedPath ?? document.filePath)
  }

  const handleDeleteDocument = async () => {
    setIsDeleting(true)
    try {
      const deleted = await deleteDocument(document.id)
      if (deleted) {
        setIsDeleteDialogOpen(false)
      }
    } finally {
      setIsDeleting(false)
    }
  }

  const myWorkDocuments = documents
    .filter((entry) => entry.documentType === 'my_work')
    .sort((left, right) => left.title.localeCompare(right.title))

  const handleAddToMyWork = async (workDocumentId: string) => {
    const targetWork = myWorkDocuments.find((entry) => entry.id === workDocumentId)
    if (!targetWork) return

    const existingReferences = await repo.listWorkReferences(workDocumentId)
    const alreadyExists = existingReferences.some((entry) => (
      entry.matchedDocumentId === document.id || entry.reference.documentId === document.id
    ))
    if (alreadyExists) {
      toast.message(t('documentActions.alreadyInMyWork'), {
        description: t('documentActions.alreadyInMyWorkDescription', {
          documentTitle: document.title,
          workTitle: targetWork.title,
        }),
      })
      return
    }

    const allReferences = await repo.listReferences()
    const referenceDraft = seedReferenceFromDocument(document)
    const reusable = findReusableReference(allReferences, referenceDraft)
    const sharedReference = reusable
      ? await repo.updateReference(reusable.id, referenceDraft) ?? reusable
      : await repo.createReference(referenceDraft)

    await repo.createWorkReference({
      workDocumentId,
      referenceId: sharedReference.id,
      matchedDocumentId: document.id,
      matchMethod: referenceDraft.doi ? 'doi_exact' : 'title_exact',
      matchConfidence: 0.99,
    })

    toast.success(t('documentActions.addedToMyWork'), {
      description: t('documentActions.addedToMyWorkDescription', {
        documentTitle: document.title,
        workTitle: targetWork.title,
      }),
    })
  }

  return {
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    isDeleting,
    handleCopyCitation,
    handleOpenDoi,
    handleOpenFileLocation,
    handleDeleteDocument,
    myWorkDocuments,
    handleAddToMyWork,
  }
}

function DocumentDeleteDialog({
  document,
  isOpen,
  onOpenChange,
  isDeleting,
  onConfirm,
}: {
  document: Document
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  isDeleting: boolean
  onConfirm: () => void
}) {
  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove document from library?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes "{document.title}" from the library and deletes its copied local file from Refx storage.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? 'Removing...' : 'Remove Document'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function DocumentActionMenuItems({
  document,
  variant,
  onCopyCitation,
  onOpenDoi,
  onOpenFileLocation,
  onRemove,
  myWorkDocuments,
  onAddToMyWork,
}: {
  document: Document
  variant: 'dropdown' | 'context'
  onCopyCitation: () => void
  onOpenDoi: () => void
  onOpenFileLocation: () => void
  onRemove: () => void
  myWorkDocuments: Document[]
  onAddToMyWork: (workDocumentId: string) => void
}) {
  const t = useT()
  const Item = variant === 'dropdown' ? DropdownMenuItem : ContextMenuItem
  const Separator = variant === 'dropdown' ? DropdownMenuSeparator : ContextMenuSeparator
  const Sub = variant === 'dropdown' ? DropdownMenuSub : ContextMenuSub
  const SubTrigger = variant === 'dropdown' ? DropdownMenuSubTrigger : ContextMenuSubTrigger
  const SubContent = variant === 'dropdown' ? DropdownMenuSubContent : ContextMenuSubContent
  const openHref = document.documentType === 'my_work'
    ? `/documents?id=${document.id}`
    : document.documentType === 'physical_book'
      ? `/books/notes?id=${document.id}`
      : `/reader/view?id=${document.id}`
  const OpenIcon = document.documentType === 'physical_book'
    ? BookMarked
    : document.documentType === 'my_work'
      ? FileText
      : BookOpen
  const openLabel = document.documentType === 'physical_book'
    ? t('documentActions.openNotes')
    : document.documentType === 'my_work'
      ? t('documentActions.openDetails')
      : t('documentActions.openReader')

  return (
    <>
      <Item asChild>
        <Link href={openHref}>
          <OpenIcon className="mr-2 h-4 w-4" />
          {openLabel}
        </Link>
      </Item>
      <Item asChild>
        <Link href={`/documents?id=${document.id}&edit=1`}>
          <Edit className="mr-2 h-4 w-4" />
          {t('searchPage.openDetails')}
        </Link>
      </Item>
      <Item asChild>
        <Link href={`/discover?documentId=${document.id}`}>
          <Telescope className="mr-2 h-4 w-4" />
          {t('documentActions.openInDiscovery')}
        </Link>
      </Item>
      <Item asChild>
        <Link href={`/comments?id=${document.id}`}>
          <MessageSquare className="mr-2 h-4 w-4" />
          {t('documentActions.openComments')}
        </Link>
      </Item>
      {document.documentType !== 'my_work' ? (
        <Sub>
          <SubTrigger>
            <span className="mr-2 text-xs font-semibold tracking-tight text-muted-foreground">
              [ ]
            </span>
            {t('documentActions.addToMyWork')}
          </SubTrigger>
          <SubContent className="min-w-[260px] max-h-[280px] overflow-y-auto">
            {myWorkDocuments.length > 0 ? myWorkDocuments.map((work) => (
              <Item key={work.id} onSelect={() => void onAddToMyWork(work.id)}>
                <FileText className="mr-2 h-4 w-4" />
                {work.title}
              </Item>
            )) : (
              <Item disabled>
                <FileText className="mr-2 h-4 w-4" />
                {t('documentActions.noMyWorks')}
              </Item>
            )}
          </SubContent>
        </Sub>
      ) : null}
      {document.filePath && (
        <Item onClick={onOpenFileLocation}>
          <FolderOpen className="mr-2 h-4 w-4" />
          {t('documentActions.openFileLocation')}
        </Item>
      )}
      {document.doi && (
        <Item onClick={onOpenDoi}>
          <ExternalLink className="mr-2 h-4 w-4" />
          {t('documentActions.openDoi')}
        </Item>
      )}
      <Separator />
      <Item onClick={onCopyCitation}>
        <Copy className="mr-2 h-4 w-4" />
        {t('documentActions.copyCitation')}
      </Item>
      <Separator />
      {variant === 'dropdown' ? (
        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onRemove}>
          <Trash2 className="mr-2 h-4 w-4" />
          {t('documentActions.removeFromLibrary')}
        </DropdownMenuItem>
      ) : (
        <ContextMenuItem variant="destructive" onClick={onRemove}>
          <Trash2 className="mr-2 h-4 w-4" />
          {t('documentActions.removeFromLibrary')}
        </ContextMenuItem>
      )}
    </>
  )
}

export function DocumentActions({ document, trigger }: DocumentActionsProps) {
  const actions = useDocumentActionState(document)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DocumentActionMenuItems
            document={document}
            variant="dropdown"
            onCopyCitation={() => void actions.handleCopyCitation()}
            onOpenDoi={actions.handleOpenDoi}
            onOpenFileLocation={() => void actions.handleOpenFileLocation()}
            onRemove={() => actions.setIsDeleteDialogOpen(true)}
            myWorkDocuments={actions.myWorkDocuments}
            onAddToMyWork={(workDocumentId) => void actions.handleAddToMyWork(workDocumentId)}
          />
        </DropdownMenuContent>
      </DropdownMenu>

      <DocumentDeleteDialog
        document={document}
        isOpen={actions.isDeleteDialogOpen}
        onOpenChange={actions.setIsDeleteDialogOpen}
        isDeleting={actions.isDeleting}
        onConfirm={() => void actions.handleDeleteDocument()}
      />
    </>
  )
}

export function DocumentContextMenu({ document, children, prependContextItems }: DocumentContextMenuProps) {
  const actions = useDocumentActionState(document)

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent>
          {prependContextItems}
          {prependContextItems ? <ContextMenuSeparator /> : null}
          <DocumentActionMenuItems
            document={document}
            variant="context"
            onCopyCitation={() => void actions.handleCopyCitation()}
            onOpenDoi={actions.handleOpenDoi}
            onOpenFileLocation={() => void actions.handleOpenFileLocation()}
            onRemove={() => actions.setIsDeleteDialogOpen(true)}
            myWorkDocuments={actions.myWorkDocuments}
            onAddToMyWork={(workDocumentId) => void actions.handleAddToMyWork(workDocumentId)}
          />
        </ContextMenuContent>
      </ContextMenu>

      <DocumentDeleteDialog
        document={document}
        isOpen={actions.isDeleteDialogOpen}
        onOpenChange={actions.setIsDeleteDialogOpen}
        isDeleting={actions.isDeleting}
        onConfirm={() => void actions.handleDeleteDocument()}
      />
    </>
  )
}
