'use client'

import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { ArrowRightLeft, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAppStore } from '@/lib/store'

interface DocumentBulkActionsProps {
  selectedDocumentIds: string[]
  onClearSelection: () => void
  children?: ReactNode
}

export function DocumentBulkActions({
  selectedDocumentIds,
  onClearSelection,
  children,
}: DocumentBulkActionsProps) {
  const {
    documents,
    libraries,
    removeDocumentsFromLibrary,
    moveDocumentsToLibrary,
  } = useAppStore()
  const [isRemoveDialogOpen, setIsRemoveDialogOpen] = useState(false)
  const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false)
  const [moveTargetLibraryId, setMoveTargetLibraryId] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const selectedDocuments = useMemo(
    () => documents.filter((document) => selectedDocumentIds.includes(document.id)),
    [documents, selectedDocumentIds],
  )
  const availableLibraries = useMemo(
    () => libraries.filter((library) => !selectedDocuments.every((document) => document.libraryId === library.id)),
    [libraries, selectedDocuments],
  )

  useEffect(() => {
    if (!isMoveDialogOpen) return
    if (!moveTargetLibraryId || !availableLibraries.some((library) => library.id === moveTargetLibraryId)) {
      setMoveTargetLibraryId(availableLibraries[0]?.id ?? '')
    }
  }, [availableLibraries, isMoveDialogOpen, moveTargetLibraryId])

  const selectionLabel = selectedDocumentIds.length === 1
    ? '1 selected'
    : `${selectedDocumentIds.length} selected`

  const handleRemove = async () => {
    setIsSubmitting(true)
    try {
      const removedCount = await removeDocumentsFromLibrary(selectedDocumentIds)
      if (removedCount > 0) {
        onClearSelection()
        setIsRemoveDialogOpen(false)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleMove = async () => {
    if (!moveTargetLibraryId) return

    setIsSubmitting(true)
    try {
      const movedCount = await moveDocumentsToLibrary(selectedDocumentIds, moveTargetLibraryId)
      if (movedCount > 0) {
        onClearSelection()
        setIsMoveDialogOpen(false)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">{selectionLabel}</p>
        {children}
        <Button
          size="sm"
          variant="outline"
          onClick={() => setIsMoveDialogOpen(true)}
          disabled={availableLibraries.length === 0}
        >
          <ArrowRightLeft className="mr-2 h-4 w-4" />
          Move to Library
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setIsRemoveDialogOpen(true)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Remove from Library
        </Button>
      </div>

      <AlertDialog open={isRemoveDialogOpen} onOpenChange={setIsRemoveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove selected documents from this library?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {selectedDocumentIds.length} selected {selectedDocumentIds.length === 1 ? 'document' : 'documents'} from Refx and deletes their copied local files.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={isSubmitting} onClick={() => void handleRemove()}>
              {isSubmitting ? 'Removing...' : 'Remove Documents'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isMoveDialogOpen} onOpenChange={setIsMoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move selected documents</DialogTitle>
            <DialogDescription>
              Move {selectedDocumentIds.length} selected {selectedDocumentIds.length === 1 ? 'document' : 'documents'} to another library.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Target library</p>
            <Select value={moveTargetLibraryId} onValueChange={setMoveTargetLibraryId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a library" />
              </SelectTrigger>
              <SelectContent>
                {availableLibraries.map((library) => (
                  <SelectItem key={library.id} value={library.id}>
                    {library.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMoveDialogOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={() => void handleMove()} disabled={!moveTargetLibraryId || isSubmitting}>
              {isSubmitting ? 'Moving...' : 'Move Documents'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
