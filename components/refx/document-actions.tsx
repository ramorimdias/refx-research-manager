'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { BookMarked, BookOpen, Copy, Edit, ExternalLink, FileText, FolderOpen, MessageSquare, Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
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

interface DocumentActionsProps {
  document: Document
  trigger: ReactNode
}

interface DocumentContextMenuProps {
  document: Document
  children: ReactNode
}

function formatCitation(document: Document) {
  const authorPart = document.authors.length > 0 ? document.authors.join(', ') : 'Unknown author'
  const yearPart = document.year ? `(${document.year})` : '(n.d.)'
  const doiPart = document.doi ? ` https://doi.org/${document.doi}` : ''
  return `${authorPart} ${yearPart}. ${document.title}.${doiPart}`
}

function useDocumentActionState(document: Document) {
  const { deleteDocument } = useDocumentActions()
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
    await repo.openDocumentFileLocation(document.filePath)
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

  return {
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    isDeleting,
    handleCopyCitation,
    handleOpenDoi,
    handleOpenFileLocation,
    handleDeleteDocument,
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
}: {
  document: Document
  variant: 'dropdown' | 'context'
  onCopyCitation: () => void
  onOpenDoi: () => void
  onOpenFileLocation: () => void
  onRemove: () => void
}) {
  const Item = variant === 'dropdown' ? DropdownMenuItem : ContextMenuItem
  const Separator = variant === 'dropdown' ? DropdownMenuSeparator : ContextMenuSeparator
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
    ? 'Open Notes'
    : document.documentType === 'my_work'
      ? 'Open Details'
      : 'Open in Reader'

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
          Edit Details
        </Link>
      </Item>
      <Item asChild>
        <Link href={`/comments?id=${document.id}`}>
          <MessageSquare className="mr-2 h-4 w-4" />
          Open Comments
        </Link>
      </Item>
      {document.filePath && (
        <Item onClick={onOpenFileLocation}>
          <FolderOpen className="mr-2 h-4 w-4" />
          Open File Location
        </Item>
      )}
      {document.doi && (
        <Item onClick={onOpenDoi}>
          <ExternalLink className="mr-2 h-4 w-4" />
          Open DOI
        </Item>
      )}
      <Separator />
      <Item onClick={onCopyCitation}>
        <Copy className="mr-2 h-4 w-4" />
        Copy Citation
      </Item>
      <Separator />
      {variant === 'dropdown' ? (
        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onRemove}>
          <Trash2 className="mr-2 h-4 w-4" />
          Remove from Library
        </DropdownMenuItem>
      ) : (
        <ContextMenuItem variant="destructive" onClick={onRemove}>
          <Trash2 className="mr-2 h-4 w-4" />
          Remove from Library
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

export function DocumentContextMenu({ document, children }: DocumentContextMenuProps) {
  const actions = useDocumentActionState(document)

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent>
          <DocumentActionMenuItems
            document={document}
            variant="context"
            onCopyCitation={() => void actions.handleCopyCitation()}
            onOpenDoi={actions.handleOpenDoi}
            onOpenFileLocation={() => void actions.handleOpenFileLocation()}
            onRemove={() => actions.setIsDeleteDialogOpen(true)}
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
