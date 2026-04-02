'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import {
  Brackets,
  BookOpen,
  Check,
  Copy,
  GripVertical,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { EmptyState } from '@/components/refx/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAppStore } from '@/lib/store'
import type { CitationStyle, Document } from '@/lib/types'
import * as repo from '@/lib/repositories/local-db'
import {
  findMatchingDocuments,
  findReusableReference,
  formatReference,
  matchReferenceToDocument,
  mergeReferenceDraft,
  normalizeWhitespace,
  seedReferenceFromDocument,
} from '@/lib/services/work-reference-service'
import { useT } from '@/lib/localization'
import { cn } from '@/lib/utils'

type ReferenceFormState = {
  title: string
  authors: string
  year: string
  doi: string
  publisher: string
  journal: string
  booktitle: string
  url: string
  abstract: string
  type: string
}

const DEFAULT_REFERENCE_FORM: ReferenceFormState = {
  title: '',
  authors: '',
  year: '',
  doi: '',
  publisher: '',
  journal: '',
  booktitle: '',
  url: '',
  abstract: '',
  type: 'misc',
}

const CITATION_STYLES: Array<{ value: CitationStyle; label: string }> = [
  { value: 'apa', label: 'APA' },
  { value: 'mla', label: 'MLA' },
  { value: 'chicago', label: 'Chicago' },
]

function buildDocumentResumeHref(document: Document) {
  if (document.documentType === 'pdf') {
    const params = new URLSearchParams({ id: document.id })
    if (document.lastReadPage && document.lastReadPage > 0) {
      params.set('page', String(document.lastReadPage))
    }
    return `/reader/view?${params.toString()}`
  }

  return document.documentType === 'physical_book'
    ? `/books/notes?id=${document.id}`
    : `/documents?id=${document.id}`
}

export default function ReferencesPage() {
  const router = useRouter()
  const t = useT()
  const libraries = useAppStore((state) => state.libraries)
  const documents = useAppStore((state) => state.documents)
  const activeLibraryId = useAppStore((state) => state.activeLibraryId)
  const createDocumentRecord = useAppStore((state) => state.createDocumentRecord)
  const deleteDocument = useAppStore((state) => state.deleteDocument)
  const myWorks = useMemo(
    () =>
      documents
        .filter((document) => document.documentType === 'my_work')
        .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()),
    [documents],
  )

  const [selectedWorkId, setSelectedWorkId] = useState<string>('')
  const [workReferences, setWorkReferences] = useState<repo.DbWorkReference[]>([])
  const [allReferences, setAllReferences] = useState<repo.DbReference[]>([])
  const [isLoadingReferences, setIsLoadingReferences] = useState(false)
  const [isAddingWork, setIsAddingWork] = useState(false)
  const [newWorkTitle, setNewWorkTitle] = useState('')
  const [isSavingWork, setIsSavingWork] = useState(false)
  const [isAddingReference, setIsAddingReference] = useState(false)
  const [referenceForm, setReferenceForm] = useState<ReferenceFormState>(DEFAULT_REFERENCE_FORM)
  const [preferredMatchDocumentId, setPreferredMatchDocumentId] = useState<string | null>(null)
  const [selectedStyle, setSelectedStyle] = useState<CitationStyle>('apa')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [isSubmittingReference, setIsSubmittingReference] = useState(false)
  const [isRecheckingMatches, setIsRecheckingMatches] = useState(false)
  const [draggingWorkReferenceId, setDraggingWorkReferenceId] = useState<string | null>(null)
  const [copiedWorkReferenceId, setCopiedWorkReferenceId] = useState<string | null>(null)
  const [pendingDeleteWorkReferenceId, setPendingDeleteWorkReferenceId] = useState<string | null>(null)
  const [isDeleteWorkDialogOpen, setIsDeleteWorkDialogOpen] = useState(false)
  const [isDeletingWork, setIsDeletingWork] = useState(false)

  useEffect(() => {
    if (!selectedWorkId && myWorks[0]?.id) {
      setSelectedWorkId(myWorks[0].id)
      return
    }

    if (selectedWorkId && !myWorks.some((document) => document.id === selectedWorkId)) {
      setSelectedWorkId(myWorks[0]?.id ?? '')
    }
  }, [myWorks, selectedWorkId])

  useEffect(() => {
    let cancelled = false

    const loadSharedReferences = async () => {
      try {
        const nextReferences = await repo.listReferences()
        if (!cancelled) setAllReferences(nextReferences)
      } catch (error) {
        if (!cancelled) {
          setStatusMessage(error instanceof Error ? error.message : t('referencesPage.couldNotLoadReferences'))
        }
      }
    }

    void loadSharedReferences()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadWorkReferences = async () => {
      if (!selectedWorkId) {
        setWorkReferences([])
        return
      }

      setIsLoadingReferences(true)
      try {
        const nextReferences = await repo.listWorkReferences(selectedWorkId)
        if (!cancelled) setWorkReferences(nextReferences)
      } catch (error) {
        if (!cancelled) {
          setStatusMessage(error instanceof Error ? error.message : t('referencesPage.couldNotLoadWorkReferences'))
        }
      } finally {
        if (!cancelled) setIsLoadingReferences(false)
      }
    }

    void loadWorkReferences()
    return () => {
      cancelled = true
    }
  }, [selectedWorkId])

  const selectedWork = useMemo(
    () => myWorks.find((document) => document.id === selectedWorkId) ?? null,
    [myWorks, selectedWorkId],
  )

  const documentById = useMemo(
    () => new Map(documents.map((document) => [document.id, document])),
    [documents],
  )

  const liveSuggestions = useMemo(
    () =>
      findMatchingDocuments(documents, {
        title: referenceForm.title,
        authors: referenceForm.authors,
        year: Number.parseInt(referenceForm.year, 10) || undefined,
        doi: referenceForm.doi,
      }),
    [documents, referenceForm.authors, referenceForm.doi, referenceForm.title, referenceForm.year],
  )

  const existingWorkDocumentIds = useMemo(
    () =>
      new Set(
        workReferences.flatMap((workReference) => {
          const ids: string[] = []
          if (workReference.matchedDocumentId) ids.push(workReference.matchedDocumentId)
          if (workReference.reference.documentId) ids.push(workReference.reference.documentId)
          return ids
        }),
      ),
    [workReferences],
  )

  const resetReferenceDialog = () => {
    setReferenceForm(DEFAULT_REFERENCE_FORM)
    setPreferredMatchDocumentId(null)
  }

  const saveReferenceToSelectedWork = async (
    referenceDraft: Parameters<typeof mergeReferenceDraft>[0],
    directMatch?: {
      matchedDocumentId?: string
      matchMethod?: string
      matchConfidence?: number
    },
  ) => {
    if (!selectedWork) {
      throw new Error(t('referencesPage.selectWorkBeforeAddingReferences'))
    }

    const reusable = findReusableReference(allReferences, referenceDraft)
    const sharedReference = reusable
      ? await repo.updateReference(reusable.id, referenceDraft) ?? reusable
      : await repo.createReference(referenceDraft)

    const matched = directMatch ?? matchReferenceToDocument(documents, referenceDraft)

    await repo.createWorkReference({
      workDocumentId: selectedWork.id,
      referenceId: sharedReference.id,
      matchedDocumentId: matched.matchedDocumentId,
      matchMethod: matched.matchMethod,
      matchConfidence: matched.matchConfidence,
    })

    const [nextReferences, nextSharedReferences] = await Promise.all([
      repo.listWorkReferences(selectedWork.id),
      repo.listReferences(),
    ])
    setWorkReferences(nextReferences)
    setAllReferences(nextSharedReferences)
  }

  const handleCreateWork = async () => {
    const title = normalizeWhitespace(newWorkTitle)
    if (!title) {
      setStatusMessage(t('referencesPage.workNameRequired'))
      return
    }

    const libraryId = activeLibraryId ?? libraries[0]?.id
    if (!libraryId) {
      setStatusMessage(t('referencesPage.createLibraryBeforeAddingWork'))
      return
    }

    setIsSavingWork(true)
    setStatusMessage(null)
    try {
      const created = await createDocumentRecord({
        libraryId,
        title,
        documentType: 'my_work',
      })

      if (created) {
        setSelectedWorkId(created.id)
        setNewWorkTitle('')
        setIsAddingWork(false)
        setStatusMessage(t('referencesPage.createdWork', { title: created.title }))
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : t('referencesPage.couldNotCreateWork'))
    } finally {
      setIsSavingWork(false)
    }
  }

  const handleUseSuggestion = async (document: Document) => {
    if (!selectedWork) {
      setStatusMessage(t('referencesPage.selectWorkBeforeAddingReferences'))
      return
    }

    const seeded = seedReferenceFromDocument(document)
    setIsSubmittingReference(true)
    setStatusMessage(null)

    try {
      await saveReferenceToSelectedWork(seeded, {
        matchedDocumentId: document.id,
        matchMethod: seeded.doi ? 'doi_exact' : 'title_exact',
        matchConfidence: 0.99,
      })
      setIsAddingReference(false)
      resetReferenceDialog()
      setStatusMessage(t('referencesPage.addedDocumentToWork', { title: document.title }))
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : t('referencesPage.couldNotAddReference'))
    } finally {
      setIsSubmittingReference(false)
    }
  }

  const handleAddReference = async () => {
    if (!selectedWork) {
      setStatusMessage(t('referencesPage.selectWorkBeforeAddingReferences'))
      return
    }

    const title = normalizeWhitespace(referenceForm.title)
    if (!title) {
      setStatusMessage(t('referencesPage.referenceTitleRequired'))
      return
    }

    const seededDocument = preferredMatchDocumentId ? documentById.get(preferredMatchDocumentId) ?? null : null
    const baseDraft = seededDocument ? seedReferenceFromDocument(seededDocument) : {
      type: referenceForm.type || 'misc',
      title,
    }

    const referenceDraft = mergeReferenceDraft(baseDraft, {
      title,
      authors: referenceForm.authors || undefined,
      year: Number.parseInt(referenceForm.year, 10) || undefined,
      doi: referenceForm.doi || undefined,
      publisher: referenceForm.publisher || undefined,
      journal: referenceForm.journal || undefined,
      booktitle: referenceForm.booktitle || undefined,
      url: referenceForm.url || undefined,
      abstract: referenceForm.abstract || undefined,
      type: referenceForm.type || baseDraft.type || 'misc',
      documentId: seededDocument?.id ?? baseDraft.documentId,
    })

    setIsSubmittingReference(true)
    setStatusMessage(null)
    try {
      const matched = preferredMatchDocumentId
        ? {
            matchedDocumentId: preferredMatchDocumentId,
            matchMethod: referenceDraft.doi ? 'doi_exact' : 'title_exact',
            matchConfidence: 0.99,
          }
        : matchReferenceToDocument(documents, referenceDraft)

      await saveReferenceToSelectedWork(referenceDraft, matched)
      setIsAddingReference(false)
      resetReferenceDialog()
      setStatusMessage(t('referencesPage.referenceAdded'))
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : t('referencesPage.couldNotAddReference'))
    } finally {
      setIsSubmittingReference(false)
    }
  }

  const handleCopyReference = async (reference: repo.DbReference) => {
    try {
      await navigator.clipboard.writeText(formatReference(reference, selectedStyle))
      const relatedWorkReference = workReferences.find((entry) => entry.reference.id === reference.id)
      setCopiedWorkReferenceId(relatedWorkReference?.id ?? null)
      window.setTimeout(() => {
        setCopiedWorkReferenceId((current) =>
          current === (relatedWorkReference?.id ?? null) ? null : current,
        )
      }, 1600)
    } catch {
      setStatusMessage(t('referencesPage.couldNotCopyReference'))
    }
  }

  const handleDeleteWorkReference = async (id: string) => {
    try {
      await repo.deleteWorkReference(id)
      const nextReferences = selectedWork ? await repo.listWorkReferences(selectedWork.id) : []
      setWorkReferences(nextReferences)
      setStatusMessage(t('referencesPage.referenceRemovedFromWork'))
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : t('referencesPage.couldNotRemoveReference'))
    }
  }

  const handleRecheckMatches = async () => {
    if (!selectedWork) return

    setIsRecheckingMatches(true)
    setStatusMessage(null)
    try {
      const refreshed = await repo.recheckWorkReferenceMatches(selectedWork.id)
      setWorkReferences(refreshed)
      setStatusMessage(t('referencesPage.referenceMatchesRefreshed'))
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : t('referencesPage.couldNotRefreshMatches'))
    } finally {
      setIsRecheckingMatches(false)
    }
  }

  const handleDropWorkReference = async (targetId: string) => {
    if (!selectedWork || !draggingWorkReferenceId || draggingWorkReferenceId === targetId) return

    const current = [...workReferences]
    const fromIndex = current.findIndex((item) => item.id === draggingWorkReferenceId)
    const toIndex = current.findIndex((item) => item.id === targetId)
    if (fromIndex < 0 || toIndex < 0) return

    const [moved] = current.splice(fromIndex, 1)
    current.splice(toIndex, 0, moved)
    setWorkReferences(current)
    setDraggingWorkReferenceId(null)

    try {
      const reordered = await repo.reorderWorkReferences(
        selectedWork.id,
        current.map((item) => item.id),
      )
      setWorkReferences(reordered)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : t('referencesPage.couldNotReorderReferences'))
      const restored = await repo.listWorkReferences(selectedWork.id)
      setWorkReferences(restored)
    }
  }

  const pendingDeleteWorkReference = useMemo(
    () => workReferences.find((entry) => entry.id === pendingDeleteWorkReferenceId) ?? null,
    [pendingDeleteWorkReferenceId, workReferences],
  )

  const handleDeleteSelectedWork = async () => {
    if (!selectedWork) return

    setIsDeletingWork(true)
    setStatusMessage(null)
    try {
      const deleted = await deleteDocument(selectedWork.id)
      if (!deleted) {
        setStatusMessage(t('referencesPage.couldNotDeleteWork'))
        return
      }

      setIsDeleteWorkDialogOpen(false)
      setStatusMessage(t('referencesPage.deletedWork', { title: selectedWork.title }))
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : t('referencesPage.couldNotDeleteWork'))
    } finally {
      setIsDeletingWork(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Brackets className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{t('referencesPage.title')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('referencesPage.subtitle')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={selectedStyle} onValueChange={(value) => setSelectedStyle(value as CitationStyle)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder={t('referencesPage.citationStyle')} />
            </SelectTrigger>
            <SelectContent>
              {CITATION_STYLES.map((style) => (
                <SelectItem key={style.value} value={style.value}>
                  {style.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" onClick={() => setIsAddingWork(true)}>
            <Plus className="h-4 w-4" />
            {t('referencesPage.addWork')}
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="min-h-0">
          <CardHeader>
            <Tooltip>
              <TooltipTrigger asChild>
                <CardTitle className="w-fit cursor-help">{t('referencesPage.works')}</CardTitle>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={8}>
                {t('referencesPage.worksHelp')}
              </TooltipContent>
            </Tooltip>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={selectedWorkId} onValueChange={setSelectedWorkId}>
              <SelectTrigger>
                <SelectValue placeholder={t('referencesPage.selectWork')} />
              </SelectTrigger>
              <SelectContent>
                {myWorks.map((work) => (
                  <SelectItem key={work.id} value={work.id}>
                    {work.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedWork ? (
              <div className="rounded-2xl bg-muted/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{selectedWork.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {t('referencesPage.referencesCount', { count: workReferences.length, suffix: workReferences.length === 1 ? '' : 's' })}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsDeleteWorkDialogOpen(true)}
                    aria-label={t('referencesPage.deleteWork')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <EmptyState
                icon={BookOpen}
                title={t('referencesPage.noWorkSelected')}
                description={myWorks.length ? t('referencesPage.selectWorkToManage') : t('referencesPage.createFirstWork')}
              />
            )}
          </CardContent>
        </Card>

        <Card className="flex min-h-0 flex-col">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <CardTitle className="w-fit cursor-help">{t('referencesPage.bibliography')}</CardTitle>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={8}>
                  {t('referencesPage.bibliographyHelp', { style: selectedStyle.toUpperCase() })}
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddingReference(true)}
                disabled={!selectedWork}
              >
                <Plus className="h-4 w-4" />
                {t('referencesPage.addReference')}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleRecheckMatches()}
                disabled={!selectedWork || isRecheckingMatches}
              >
                {isRecheckingMatches ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {t('referencesPage.recheckMatches')}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto">
            {statusMessage ? (
              <div className="rounded-xl bg-muted/70 px-3 py-2 text-sm text-muted-foreground">
                {statusMessage}
              </div>
            ) : null}

            {!selectedWork ? (
              <EmptyState
                icon={BookOpen}
                title={t('referencesPage.selectWork')}
                description={t('referencesPage.selectWorkToManage')}
              />
            ) : isLoadingReferences ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('referencesPage.loadingReferences')}
              </div>
            ) : workReferences.length === 0 ? (
              <EmptyState
                icon={Sparkles}
                title={t('referencesPage.noReferencesYet')}
                description={t('referencesPage.noReferencesYetDescription')}
              />
            ) : (
              <div className="space-y-3">
                {workReferences.map((workReference, index) => {
                  const matchedDocument = workReference.matchedDocumentId
                    ? documentById.get(workReference.matchedDocumentId) ?? null
                    : null

                  return (
                    <div
                      key={workReference.id}
                      draggable
                      onDragStart={() => setDraggingWorkReferenceId(workReference.id)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => void handleDropWorkReference(workReference.id)}
                      onClick={() => {
                        if (!matchedDocument) return
                        router.push(buildDocumentResumeHref(matchedDocument))
                      }}
                      className={cn(
                        'h-[78px] overflow-hidden rounded-2xl border bg-card px-4 py-2 transition',
                        matchedDocument && 'cursor-pointer hover:border-primary/40 hover:bg-accent/30',
                        draggingWorkReferenceId === workReference.id && 'opacity-60',
                      )}
                    >
                      <div className="flex h-full items-center gap-3">
                        <div className="flex h-full items-center cursor-grab text-muted-foreground">
                          <GripVertical className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="shrink-0 text-xs font-medium text-muted-foreground">
                                  [{index + 1}]
                                </span>
                                <div className="truncate text-sm font-semibold">{workReference.reference.title}</div>
                                {matchedDocument ? (
                                  <span className="shrink-0 inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-[11px] text-sky-700">
                                    {t('referencesPage.existsInLibraries')}
                                  </span>
                                ) : null}
                              </div>
                              <div className="line-clamp-2 text-xs text-muted-foreground">
                                {formatReference(workReference.reference, selectedStyle)}
                              </div>
                            </div>
                            <div className="ml-auto flex shrink-0 items-center gap-2 self-center">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  void handleCopyReference(workReference.reference)
                                }}
                                aria-label={t('referencesPage.copyReference')}
                                className={cn(
                                  copiedWorkReferenceId === workReference.id
                                    ? 'border-emerald-300 text-emerald-600'
                                    : '',
                                )}
                              >
                                {copiedWorkReferenceId === workReference.id ? (
                                  <Check className="h-4 w-4" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setPendingDeleteWorkReferenceId(workReference.id)
                                }}
                                aria-label={t('referencesPage.removeReference')}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isAddingWork} onOpenChange={setIsAddingWork}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('referencesPage.addWork')}</DialogTitle>
            <DialogDescription>{t('referencesPage.addWorkDescription')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-work-title">{t('referencesPage.workName')}</Label>
            <Input
              id="new-work-title"
              value={newWorkTitle}
              onChange={(event) => setNewWorkTitle(event.target.value)}
              placeholder={t('referencesPage.workNamePlaceholder')}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsAddingWork(false)}>
              {t('referencesPage.cancel')}
            </Button>
            <Button type="button" onClick={() => void handleCreateWork()} disabled={isSavingWork}>
              {isSavingWork ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {t('referencesPage.createWork')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteWorkDialogOpen} onOpenChange={setIsDeleteWorkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('referencesPage.deleteWork')}</DialogTitle>
            <DialogDescription>
              {selectedWork
                ? t('referencesPage.deleteWorkDescription', { title: selectedWork.title })
                : t('referencesPage.deleteWorkDescriptionFallback')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsDeleteWorkDialogOpen(false)}>
              {t('referencesPage.cancel')}
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleDeleteSelectedWork()} disabled={isDeletingWork || !selectedWork}>
              {isDeletingWork ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {t('referencesPage.deleteWork')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isAddingReference}
        onOpenChange={(open) => {
          setIsAddingReference(open)
          if (!open) resetReferenceDialog()
        }}
      >
        <DialogContent className="w-[72vw] max-w-[1080px] sm:max-w-[1080px]">
          <DialogHeader>
            <DialogTitle>{t('referencesPage.addReference')}</DialogTitle>
            <DialogDescription>
              {t('referencesPage.addReferenceDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reference-title">{t('metadataFields.title')}</Label>
                <Input
                  id="reference-title"
                  value={referenceForm.title}
                  onChange={(event) => setReferenceForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder={t('referencesPage.referenceTitlePlaceholder')}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="reference-authors">{t('metadataFields.authors')}</Label>
                  <Input
                    id="reference-authors"
                    value={referenceForm.authors}
                    onChange={(event) => setReferenceForm((current) => ({ ...current, authors: event.target.value }))}
                    placeholder={t('referencesPage.authorsPlaceholder')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reference-year">{t('metadataFields.year')}</Label>
                  <Input
                    id="reference-year"
                    value={referenceForm.year}
                    onChange={(event) => setReferenceForm((current) => ({ ...current, year: event.target.value }))}
                    placeholder="2024"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="reference-doi">{t('metadataFields.doi')}</Label>
                  <Input
                    id="reference-doi"
                    value={referenceForm.doi}
                    onChange={(event) => setReferenceForm((current) => ({ ...current, doi: event.target.value }))}
                    placeholder="10.1234/example"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reference-type">{t('referencesPage.type')}</Label>
                  <Select
                    value={referenceForm.type}
                    onValueChange={(value) => setReferenceForm((current) => ({ ...current, type: value }))}
                  >
                    <SelectTrigger id="reference-type">
                      <SelectValue placeholder={t('referencesPage.referenceType')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="article">{t('referencesPage.referenceTypeArticle')}</SelectItem>
                      <SelectItem value="book">{t('referencesPage.referenceTypeBook')}</SelectItem>
                      <SelectItem value="inproceedings">{t('referencesPage.referenceTypeConference')}</SelectItem>
                      <SelectItem value="thesis">{t('referencesPage.referenceTypeThesis')}</SelectItem>
                      <SelectItem value="report">{t('referencesPage.referenceTypeReport')}</SelectItem>
                      <SelectItem value="online">{t('referencesPage.referenceTypeOnline')}</SelectItem>
                      <SelectItem value="misc">{t('referencesPage.referenceTypeMisc')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="reference-publisher">{t('referencesPage.publisherSource')}</Label>
                  <Input
                    id="reference-publisher"
                    value={referenceForm.publisher}
                    onChange={(event) => setReferenceForm((current) => ({ ...current, publisher: event.target.value }))}
                    placeholder={t('referencesPage.publisherPlaceholder')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reference-journal">{t('referencesPage.journal')}</Label>
                  <Input
                    id="reference-journal"
                    value={referenceForm.journal}
                    onChange={(event) => setReferenceForm((current) => ({ ...current, journal: event.target.value }))}
                    placeholder={t('referencesPage.journalPlaceholder')}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="reference-booktitle">{t('referencesPage.booktitleCollection')}</Label>
                  <Input
                    id="reference-booktitle"
                    value={referenceForm.booktitle}
                    onChange={(event) => setReferenceForm((current) => ({ ...current, booktitle: event.target.value }))}
                    placeholder={t('referencesPage.booktitlePlaceholder')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reference-url">{t('referencesPage.url')}</Label>
                  <Input
                    id="reference-url"
                    value={referenceForm.url}
                    onChange={(event) => setReferenceForm((current) => ({ ...current, url: event.target.value }))}
                    placeholder={t('referencesPage.urlPlaceholder')}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reference-abstract">{t('referencesPage.abstractNote')}</Label>
                <Textarea
                  id="reference-abstract"
                  value={referenceForm.abstract}
                  onChange={(event) => setReferenceForm((current) => ({ ...current, abstract: event.target.value }))}
                  placeholder={t('referencesPage.abstractPlaceholder')}
                  rows={4}
                />
              </div>
            </div>

            <div className="flex max-h-[70vh] min-h-0 flex-col rounded-2xl bg-muted/50 p-5">
              <div>
                <div className="text-base font-medium">{t('referencesPage.matchingSuggestions')}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {t('referencesPage.matchingSuggestionsDescription')}
                </div>
              </div>

              {liveSuggestions.length ? (
                <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                  {liveSuggestions.map(({ document, score }) => {
                    const alreadyInWork = existingWorkDocumentIds.has(document.id)
                    return (
                    <button
                      key={document.id}
                      type="button"
                      onClick={() => void handleUseSuggestion(document)}
                      disabled={isSubmittingReference}
                      className={cn(
                        'block w-full rounded-2xl border px-4 py-3 text-left transition hover:bg-card disabled:cursor-wait disabled:opacity-70',
                        preferredMatchDocumentId === document.id
                          ? 'border-sky-300 bg-sky-50'
                          : 'border-border bg-background',
                      )}
                    >
                      <div className="line-clamp-2 text-base font-medium leading-6">{document.title}</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {document.authors.join(', ') || t('searchPage.unknownAuthor')}
                        {document.year ? ` • ${document.year}` : ''}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {t('referencesPage.matchPercent', { percent: Math.round(score * 100) })}
                        </span>
                        {alreadyInWork ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700">
                            {t('referencesPage.alreadyInWork')}
                          </span>
                        ) : null}
                      </div>
                    </button>
                    )
                  })}
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                  {t('referencesPage.matchingSuggestionsEmpty')}
                </div>
              )}

              {preferredMatchDocumentId ? (
                <div className="mt-4 rounded-2xl bg-sky-100 px-4 py-3 text-sm text-sky-700">
                  {t('referencesPage.referenceWillBeLinked')}
                </div>
              ) : (
                <div className="mt-4 rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
                  {t('referencesPage.freeformReferenceHelp')}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsAddingReference(false)
                resetReferenceDialog()
              }}
            >
              {t('referencesPage.cancel')}
            </Button>
            <Button type="button" onClick={() => void handleAddReference()} disabled={isSubmittingReference}>
              {isSubmittingReference ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {t('referencesPage.addReference')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(pendingDeleteWorkReference)}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteWorkReferenceId(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('referencesPage.removeReference')}</DialogTitle>
            <DialogDescription>
              {pendingDeleteWorkReference
                ? t('referencesPage.removeReferenceConfirmNamed', { title: pendingDeleteWorkReference.reference.title })
                : t('referencesPage.removeReferenceConfirm')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingDeleteWorkReferenceId(null)}>
              {t('referencesPage.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (!pendingDeleteWorkReferenceId) return
                void handleDeleteWorkReference(pendingDeleteWorkReferenceId)
                setPendingDeleteWorkReferenceId(null)
              }}
            >
              {t('referencesPage.remove')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
