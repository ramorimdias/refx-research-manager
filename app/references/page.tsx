'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import {
  Brackets,
  BookOpen,
  Check,
  Copy,
  FileInput,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { EmptyState } from '@/components/refx/common'
import { PageHeader } from '@/components/refx/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import type { CitationStyle, Document, ReferenceType } from '@/lib/types'
import * as repo from '@/lib/repositories/local-db'
import {
  findMatchingDocuments,
  findReusableReference,
  formatReference,
  matchReferenceToDocument,
  mergeReferenceDraft,
  normalizeWhitespace,
  parseAuthorsInput,
  seedReferenceFromDocument,
} from '@/lib/services/work-reference-service'
import { parseBibtexReferences, type ImportedReferenceDraft } from '@/lib/services/bibtex-reference-import-service'
import { useLocale, useT } from '@/lib/localization'
import { cn } from '@/lib/utils'
import { useDocumentActions, useDocumentStore } from '@/lib/stores/document-store'
import { useLibraryStore } from '@/lib/stores/library-store'

type ReferenceFormState = {
  type: ReferenceType
  title: string
  authors: string
  year: string
  doi: string
  volume: string
  issue: string
  chapter: string
  pages: string
  publisher: string
  journal: string
  booktitle: string
  url: string
  abstract: string
}

type BibliographySortMode = 'user' | 'title' | 'author' | 'year'
type ReferenceImportProvider = ImportedReferenceDraft['sourceProvider']

const DEFAULT_REFERENCE_FORM: ReferenceFormState = {
  type: 'article',
  title: '',
  authors: '',
  year: '',
  doi: '',
  volume: '',
  issue: '',
  chapter: '',
  pages: '',
  publisher: '',
  journal: '',
  booktitle: '',
  url: '',
  abstract: '',
}

const CITATION_STYLES: Array<{ value: CitationStyle; label: string }> = [
  { value: 'apa', label: 'APA' },
  { value: 'mla', label: 'MLA' },
  { value: 'chicago', label: 'Chicago' },
]

const REFERENCE_IMPORT_PROVIDERS: Array<{ value: ReferenceImportProvider; label: string }> = [
  { value: 'mendeley', label: 'Mendeley' },
  { value: 'endnote', label: 'EndNote' },
  { value: 'paperpile', label: 'Paperpile' },
]

function isManualReferenceType(type: ReferenceType) {
  return type === 'manual'
}

function normalizeSortText(value?: string | null) {
  return normalizeWhitespace(value).toLocaleLowerCase()
}

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

function buildDocumentEditHref(document: Document) {
  if (document.documentType === 'physical_book') {
    return `/books/notes?id=${document.id}`
  }

  return `/documents?id=${document.id}&edit=1`
}

export default function ReferencesPage() {
  const router = useRouter()
  const t = useT()
  const { locale } = useLocale()
  const libraries = useLibraryStore((state) => state.libraries)
  const activeLibraryId = useLibraryStore((state) => state.activeLibraryId)
  const documents = useDocumentStore((state) => state.documents)
  const { createDocumentRecord, deleteDocument, updateDocument } = useDocumentActions()
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
  const [newWorkAuthors, setNewWorkAuthors] = useState('')
  const [newWorkYear, setNewWorkYear] = useState('')
  const [isSavingWork, setIsSavingWork] = useState(false)
  const [editWorkAuthors, setEditWorkAuthors] = useState('')
  const [editWorkYear, setEditWorkYear] = useState('')
  const [isUpdatingWorkMetadata, setIsUpdatingWorkMetadata] = useState(false)
  const [isEditingSelectedWork, setIsEditingSelectedWork] = useState(false)
  const [isAddingReference, setIsAddingReference] = useState(false)
  const [isImportingReferences, setIsImportingReferences] = useState(false)
  const [referenceImportProvider, setReferenceImportProvider] = useState<ReferenceImportProvider>('mendeley')
  const [referenceImportBibtex, setReferenceImportBibtex] = useState('')
  const [isSubmittingReferenceImport, setIsSubmittingReferenceImport] = useState(false)
  const [referenceForm, setReferenceForm] = useState<ReferenceFormState>(DEFAULT_REFERENCE_FORM)
  const [editingWorkReferenceId, setEditingWorkReferenceId] = useState<string | null>(null)
  const [preferredMatchDocumentId, setPreferredMatchDocumentId] = useState<string | null>(null)
  const [selectedStyle, setSelectedStyle] = useState<CitationStyle>('apa')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [isSubmittingReference, setIsSubmittingReference] = useState(false)
  const [isRecheckingMatches, setIsRecheckingMatches] = useState(false)
  const [draggingWorkReferenceId, setDraggingWorkReferenceId] = useState<string | null>(null)
  const [dragOverWorkReferenceId, setDragOverWorkReferenceId] = useState<string | null>(null)
  const [bibliographySort, setBibliographySort] = useState<BibliographySortMode>('user')
  const [showReferenceNumbers, setShowReferenceNumbers] = useState(true)
  const [copiedWorkReferenceId, setCopiedWorkReferenceId] = useState<string | null>(null)
  const [copiedAllReferences, setCopiedAllReferences] = useState(false)
  const [pendingDeleteWorkReferenceId, setPendingDeleteWorkReferenceId] = useState<string | null>(null)
  const [isDeleteWorkDialogOpen, setIsDeleteWorkDialogOpen] = useState(false)
  const [isDeletingWork, setIsDeletingWork] = useState(false)

  const referenceUiCopy = useMemo(() => {
    switch (locale) {
      case 'pt-BR':
        return {
          copyAllReferences: 'Copiar todas as referências',
          copiedAllReferences: 'Tudo copiado',
        }
      case 'fr':
        return {
          copyAllReferences: 'Copier toutes les références',
          copiedAllReferences: 'Tout copié',
        }
      default:
        return {
          copyAllReferences: 'Copy all references',
          copiedAllReferences: 'Copied all',
        }
    }
  }, [locale])

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

  useEffect(() => {
    setDraggingWorkReferenceId(null)
    setDragOverWorkReferenceId(null)
  }, [bibliographySort])

  const selectedWork = useMemo(
    () => myWorks.find((document) => document.id === selectedWorkId) ?? null,
    [myWorks, selectedWorkId],
  )

  useEffect(() => {
    setEditWorkAuthors(selectedWork?.authors.join(', ') ?? '')
    setEditWorkYear(selectedWork?.year ? String(selectedWork.year) : '')
    setIsEditingSelectedWork(false)
  }, [selectedWork?.authors, selectedWork?.id, selectedWork?.year])

  const documentById = useMemo(
    () => new Map(documents.map((document) => [document.id, document])),
    [documents],
  )

  const liveSuggestions = useMemo(
    () =>
      isManualReferenceType(referenceForm.type)
        ? []
        : findMatchingDocuments(documents, {
            title: referenceForm.title,
            authors: referenceForm.authors,
            year: Number.parseInt(referenceForm.year, 10) || undefined,
            doi: referenceForm.doi,
          }),
    [documents, referenceForm.authors, referenceForm.doi, referenceForm.title, referenceForm.type, referenceForm.year],
  )

  const importPreviewReferences = useMemo(
    () => parseBibtexReferences(referenceImportBibtex, referenceImportProvider),
    [referenceImportBibtex, referenceImportProvider],
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
  const displayedWorkReferences = useMemo(() => {
    const nextReferences = [...workReferences]

    switch (bibliographySort) {
      case 'title':
        nextReferences.sort((left, right) => {
          const titleCompare = normalizeSortText(left.reference.title).localeCompare(normalizeSortText(right.reference.title), locale)
          if (titleCompare !== 0) return titleCompare
          return left.sortOrder - right.sortOrder
        })
        break
      case 'author':
        nextReferences.sort((left, right) => {
          const leftAuthor = normalizeSortText(parseAuthorsInput(left.reference.authors)[0] ?? '')
          const rightAuthor = normalizeSortText(parseAuthorsInput(right.reference.authors)[0] ?? '')
          const authorCompare = leftAuthor.localeCompare(rightAuthor, locale)
          if (authorCompare !== 0) return authorCompare
          const titleCompare = normalizeSortText(left.reference.title).localeCompare(normalizeSortText(right.reference.title), locale)
          if (titleCompare !== 0) return titleCompare
          return left.sortOrder - right.sortOrder
        })
        break
      case 'year':
        nextReferences.sort((left, right) => {
          const leftYear = left.reference.year ?? Number.MAX_SAFE_INTEGER
          const rightYear = right.reference.year ?? Number.MAX_SAFE_INTEGER
          if (leftYear !== rightYear) return leftYear - rightYear
          const titleCompare = normalizeSortText(left.reference.title).localeCompare(normalizeSortText(right.reference.title), locale)
          if (titleCompare !== 0) return titleCompare
          return left.sortOrder - right.sortOrder
        })
        break
      default:
        break
    }

    return nextReferences
  }, [bibliographySort, locale, workReferences])
  const isUserDefinedBibliographyOrder = bibliographySort === 'user'

  const resetReferenceDialog = () => {
    setReferenceForm(DEFAULT_REFERENCE_FORM)
    setPreferredMatchDocumentId(null)
    setEditingWorkReferenceId(null)
  }

  const openEditFreeformReference = (workReference: repo.DbWorkReference) => {
    setEditingWorkReferenceId(workReference.id)
    setPreferredMatchDocumentId(null)
    setReferenceForm({
      type: workReference.reference.isManual ? 'manual' : (workReference.reference.type as ReferenceType) || 'misc',
      title: workReference.reference.title ?? '',
      authors: workReference.reference.authors ?? '',
      year: workReference.reference.year ? String(workReference.reference.year) : '',
      doi: workReference.reference.doi ?? '',
      volume: workReference.reference.volume ?? '',
      issue: workReference.reference.issue ?? '',
      chapter: workReference.reference.chapter ?? '',
      pages: workReference.reference.pages ?? '',
      publisher: workReference.reference.publisher ?? '',
      journal: workReference.reference.journal ?? '',
      booktitle: workReference.reference.booktitle ?? '',
      url: workReference.reference.url ?? '',
      abstract: workReference.reference.abstract ?? '',
    })
    setIsAddingReference(true)
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
      const authors = newWorkAuthors
        .split(',')
        .map((author) => author.trim())
        .filter(Boolean)
      const parsedYear = newWorkYear.trim() ? Number.parseInt(newWorkYear.trim(), 10) : undefined
      const created = await createDocumentRecord({
        libraryId,
        title,
        documentType: 'my_work',
        authors,
        year: Number.isFinite(parsedYear) ? parsedYear : undefined,
      })

      if (created) {
        setSelectedWorkId(created.id)
        setNewWorkTitle('')
        setNewWorkAuthors('')
        setNewWorkYear('')
        setIsAddingWork(false)
        setStatusMessage(t('referencesPage.createdWork', { title: created.title }))
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : t('referencesPage.couldNotCreateWork'))
    } finally {
      setIsSavingWork(false)
    }
  }

  const handleUpdateSelectedWorkMetadata = async () => {
    if (!selectedWork) return

    const authors = editWorkAuthors
      .split(',')
      .map((author) => author.trim())
      .filter(Boolean)
    const parsedYear = editWorkYear.trim() ? Number.parseInt(editWorkYear.trim(), 10) : undefined

    setIsUpdatingWorkMetadata(true)
    setStatusMessage(null)
    try {
      await updateDocument(selectedWork.id, {
        authors,
        year: Number.isFinite(parsedYear) ? parsedYear : undefined,
      })
      setStatusMessage(t('referencesPage.updatedWorkMetadata'))
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : t('referencesPage.couldNotUpdateWorkMetadata'))
    } finally {
      setIsUpdatingWorkMetadata(false)
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

    const isManual = isManualReferenceType(referenceForm.type)
    const title = normalizeWhitespace(referenceForm.title)
    if (!title) {
      setStatusMessage(
        isManual
          ? t('referencesPage.manualReferenceRequired')
          : t('referencesPage.referenceTitleRequired'),
      )
      return
    }

    const seededDocument = !isManual && preferredMatchDocumentId
      ? documentById.get(preferredMatchDocumentId) ?? null
      : null
    const baseDraft = seededDocument ? seedReferenceFromDocument(seededDocument) : {
      type: isManual ? 'misc' : referenceForm.type || 'misc',
      isManual,
      title,
    }

    const referenceDraft = mergeReferenceDraft(baseDraft, {
      title,
      authors: isManual ? undefined : referenceForm.authors || undefined,
      year: isManual ? undefined : Number.parseInt(referenceForm.year, 10) || undefined,
      doi: isManual ? undefined : referenceForm.doi || undefined,
      volume: isManual ? undefined : referenceForm.volume || undefined,
      issue: isManual ? undefined : referenceForm.issue || undefined,
      chapter: isManual ? undefined : referenceForm.chapter || undefined,
      pages: isManual ? undefined : referenceForm.pages || undefined,
      publisher: isManual ? undefined : referenceForm.publisher || undefined,
      journal: isManual ? undefined : referenceForm.journal || undefined,
      booktitle: isManual ? undefined : referenceForm.booktitle || undefined,
      url: isManual ? undefined : referenceForm.url || undefined,
      abstract: isManual ? undefined : referenceForm.abstract || undefined,
      type: isManual ? 'misc' : referenceForm.type || baseDraft.type || 'misc',
      isManual,
      documentId: seededDocument?.id ?? baseDraft.documentId,
    })

    setIsSubmittingReference(true)
    setStatusMessage(null)
    try {
      if (editingWorkReferenceId) {
        const workReferenceToEdit = workReferences.find((entry) => entry.id === editingWorkReferenceId) ?? null
        if (!workReferenceToEdit) {
          throw new Error(t('referencesPage.couldNotLoadWorkReferences'))
        }

        await repo.updateReference(workReferenceToEdit.reference.id, {
          title,
          type: referenceDraft.type,
          isManual,
          authors: referenceDraft.authors,
          year: referenceDraft.year,
          doi: referenceDraft.doi,
          volume: referenceDraft.volume,
          issue: referenceDraft.issue,
          chapter: referenceDraft.chapter,
          pages: referenceDraft.pages,
          publisher: referenceDraft.publisher,
          journal: referenceDraft.journal,
          booktitle: referenceDraft.booktitle,
          url: referenceDraft.url,
          abstract: referenceDraft.abstract,
          documentId: undefined,
        })
        const nextReferences = await repo.listWorkReferences(selectedWork.id)
        setWorkReferences(nextReferences)
        setIsAddingReference(false)
        resetReferenceDialog()
        setStatusMessage(t('referencesPage.referenceUpdated'))
        return
      }

      const matched = isManual
        ? {}
        : preferredMatchDocumentId
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

  const resetReferenceImportDialog = () => {
    setReferenceImportProvider('mendeley')
    setReferenceImportBibtex('')
  }

  const handleImportReferences = async () => {
    if (!selectedWork) {
      setStatusMessage(t('referencesPage.selectWorkBeforeAddingReferences'))
      return
    }

    if (importPreviewReferences.length === 0) {
      setStatusMessage(t('referencesPage.noImportableReferences'))
      return
    }

    setIsSubmittingReferenceImport(true)
    setStatusMessage(null)
    try {
      let importedCount = 0
      for (const reference of importPreviewReferences) {
        await saveReferenceToSelectedWork(reference, matchReferenceToDocument(documents, reference))
        importedCount += 1
      }

      setIsImportingReferences(false)
      resetReferenceImportDialog()
      setStatusMessage(t('referencesPage.importedReferences', { count: importedCount }))
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : t('referencesPage.couldNotImportReferences'))
    } finally {
      setIsSubmittingReferenceImport(false)
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

  const handleCopyAllReferences = async () => {
    try {
      const serialized = displayedWorkReferences
        .map((entry) => formatReference(entry.reference, selectedStyle))
        .filter((value) => value.trim().length > 0)
        .join('\n')

      if (!serialized) return

      await navigator.clipboard.writeText(serialized)
      setCopiedAllReferences(true)
      window.setTimeout(() => {
        setCopiedAllReferences(false)
      }, 1600)
    } catch {
      setStatusMessage(t('referencesPage.couldNotCopyAllReferences'))
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
    if (!selectedWork || !draggingWorkReferenceId) return
    if (draggingWorkReferenceId === targetId) {
      setDraggingWorkReferenceId(null)
      setDragOverWorkReferenceId(null)
      return
    }

    const current = [...workReferences]
    const fromIndex = current.findIndex((item) => item.id === draggingWorkReferenceId)
    const toIndex = current.findIndex((item) => item.id === targetId)
    if (fromIndex < 0 || toIndex < 0) return

    const [moved] = current.splice(fromIndex, 1)
    current.splice(toIndex, 0, moved)
    setWorkReferences(current)
    setDraggingWorkReferenceId(null)
    setDragOverWorkReferenceId(null)

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

  const finishReferenceReorder = () => {
    const targetId = dragOverWorkReferenceId
    if (targetId) {
      void handleDropWorkReference(targetId)
      return
    }
    setDraggingWorkReferenceId(null)
    setDragOverWorkReferenceId(null)
  }

  useEffect(() => {
    if (!draggingWorkReferenceId) return
    window.addEventListener('mouseup', finishReferenceReorder)
    return () => window.removeEventListener('mouseup', finishReferenceReorder)
  }, [draggingWorkReferenceId, dragOverWorkReferenceId])

  const pendingDeleteWorkReference = useMemo(
    () => workReferences.find((entry) => entry.id === pendingDeleteWorkReferenceId) ?? null,
    [pendingDeleteWorkReferenceId, workReferences],
  )
  const isManualReferenceForm = isManualReferenceType(referenceForm.type)

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
      <PageHeader
        icon={<Brackets className="h-6 w-6" />}
        title={t('referencesPage.title')}
        subtitle={t('referencesPage.subtitle')}
      />

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="min-h-0" data-tour-id="references-work">
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <CardTitle className="w-fit cursor-help">{t('referencesPage.works')}</CardTitle>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={8}>
                  {t('referencesPage.worksHelp')}
                </TooltipContent>
              </Tooltip>
              <Button type="button" variant="outline" size="icon" onClick={() => setIsAddingWork(true)} data-tour-id="references-add-work" aria-label={t('referencesPage.addWork')}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
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
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-full px-3 text-xs"
                      onClick={() => setIsEditingSelectedWork((current) => !current)}
                    >
                      {isEditingSelectedWork ? t('referencesPage.cancel') : 'Edit'}
                    </Button>
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
                {isEditingSelectedWork ? (
                  <div className="mt-4 space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="selected-work-authors">{t('metadataFields.authors')}</Label>
                      <Input
                        id="selected-work-authors"
                        value={editWorkAuthors}
                        onChange={(event) => setEditWorkAuthors(event.target.value)}
                        placeholder={t('libraries.authorsPlaceholder')}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="selected-work-year">{t('metadataFields.year')}</Label>
                      <Input
                        id="selected-work-year"
                        value={editWorkYear}
                        onChange={(event) => setEditWorkYear(event.target.value)}
                        placeholder="2026"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => void handleUpdateSelectedWorkMetadata()}
                      disabled={isUpdatingWorkMetadata}
                    >
                      {isUpdatingWorkMetadata ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      {t('referencesPage.saveWorkMetadata')}
                    </Button>
                  </div>
                ) : null}
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
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-background/80 p-1.5">
                <Select value={selectedStyle} onValueChange={(value) => setSelectedStyle(value as CitationStyle)}>
                  <SelectTrigger className="h-9 w-[120px] border-0 bg-transparent shadow-none" data-tour-id="references-style">
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
                <Select value={bibliographySort} onValueChange={(value) => setBibliographySort(value as BibliographySortMode)}>
                  <SelectTrigger className="h-9 w-[180px] border-0 bg-transparent shadow-none">
                    <SelectValue placeholder={t('referencesPage.sortBy')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">{t('referencesPage.sortUserDefined')}</SelectItem>
                    <SelectItem value="title">{t('referencesPage.sortTitle')}</SelectItem>
                    <SelectItem value="author">{t('referencesPage.sortAuthor')}</SelectItem>
                    <SelectItem value="year">{t('referencesPage.sortReleaseDate')}</SelectItem>
                  </SelectContent>
                </Select>
                <label className="flex h-9 items-center gap-2 rounded-xl px-2.5 text-sm text-muted-foreground hover:bg-muted">
                  <Checkbox
                    checked={showReferenceNumbers}
                    onCheckedChange={(checked) => setShowReferenceNumbers(Boolean(checked))}
                  />
                  <span>{t('referencesPage.showNumbers')}</span>
                </label>
              </div>

              <div className="flex items-center gap-1 rounded-2xl border bg-background/80 p-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setIsAddingReference(true)}
                      disabled={!selectedWork}
                      data-tour-id="references-add-reference"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('referencesPage.addReference')}</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setIsImportingReferences(true)}
                      disabled={!selectedWork}
                      data-tour-id="references-import-reference"
                    >
                      <FileInput className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('referencesPage.importReferencesFrom')}</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => void handleCopyAllReferences()}
                      disabled={!selectedWork || workReferences.length === 0}
                      className={cn(copiedAllReferences && 'text-emerald-600')}
                      data-tour-id="references-copy-all"
                    >
                      {copiedAllReferences ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {copiedAllReferences ? referenceUiCopy.copiedAllReferences : referenceUiCopy.copyAllReferences}
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => void handleRecheckMatches()}
                      disabled={!selectedWork || isRecheckingMatches}
                      data-tour-id="references-recheck"
                    >
                      {isRecheckingMatches ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('referencesPage.recheckMatches')}</TooltipContent>
                </Tooltip>
              </div>
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
              <div className={cn('space-y-3', draggingWorkReferenceId && 'cursor-grabbing select-none')}>
                {displayedWorkReferences.map((workReference, index) => {
                  const linkedDocumentId = workReference.matchedDocumentId ?? workReference.reference.documentId ?? null
                  const linkedDocument = linkedDocumentId
                    ? documentById.get(linkedDocumentId) ?? null
                    : null
                  return (
                    <div
                      key={workReference.id}
                      onMouseEnter={() => {
                        if (!draggingWorkReferenceId || draggingWorkReferenceId === workReference.id) return
                        setDragOverWorkReferenceId(workReference.id)
                      }}
                      onMouseUp={(event) => {
                        if (!draggingWorkReferenceId) return
                        event.preventDefault()
                        event.stopPropagation()
                        setDragOverWorkReferenceId(workReference.id)
                        void handleDropWorkReference(workReference.id)
                      }}
                      onClick={() => {
                        if (draggingWorkReferenceId) return
                        if (!linkedDocument) return
                        router.push(buildDocumentResumeHref(linkedDocument))
                      }}
                      className={cn(
                        'relative h-[78px] overflow-hidden rounded-2xl border bg-card px-4 py-2 transition-all duration-150',
                        linkedDocument && 'cursor-pointer hover:border-primary/40 hover:bg-accent/30',
                        draggingWorkReferenceId === workReference.id && 'scale-[0.985] border-primary/70 bg-primary/5 opacity-80 shadow-lg ring-2 ring-primary/25',
                        dragOverWorkReferenceId === workReference.id && draggingWorkReferenceId !== workReference.id && 'translate-y-0.5 border-primary/70 bg-accent/50 shadow-md ring-2 ring-primary/20',
                      )}
                    >
                      {dragOverWorkReferenceId === workReference.id && draggingWorkReferenceId !== workReference.id ? (
                        <div className="absolute inset-x-4 top-0 h-1 rounded-full bg-primary shadow-[0_0_16px_hsl(var(--primary)/0.45)]" />
                      ) : null}
                      <div className="flex h-full items-center gap-3">
                        <div
                          onMouseDown={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            if (!isUserDefinedBibliographyOrder) return
                            setDraggingWorkReferenceId(workReference.id)
                            setDragOverWorkReferenceId(null)
                          }}
                          onClick={(event) => event.stopPropagation()}
                          className={cn(
                            'flex h-full items-center rounded-lg px-1 text-muted-foreground transition hover:bg-muted',
                            isUserDefinedBibliographyOrder
                              ? draggingWorkReferenceId === workReference.id
                                ? 'cursor-grabbing bg-primary/10 text-primary'
                                : 'cursor-grab active:cursor-grabbing'
                              : 'cursor-not-allowed opacity-50',
                          )}
                          title={isUserDefinedBibliographyOrder ? t('referencesPage.dragToReorder') : t('referencesPage.switchToUserOrder')}
                        >
                          <GripVertical className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                {showReferenceNumbers ? (
                                  <span className="shrink-0 text-xs font-medium text-muted-foreground">
                                    [{index + 1}]
                                  </span>
                                ) : null}
                                <div className="truncate text-sm font-semibold">{workReference.reference.title}</div>
                                {workReference.reference.isManual ? (
                                  <span className="shrink-0 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700">
                                    {t('referencesPage.manualReferenceBadge')}
                                  </span>
                                ) : null}
                                {linkedDocument ? (
                                  <span className="shrink-0 inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-[11px] text-sky-700">
                                    {t('referencesPage.existsInLibraries')}
                                  </span>
                                ) : null}
                              </div>
                              <div className="line-clamp-2 text-xs text-muted-foreground">
                                {workReference.reference.isManual
                                  ? t('referencesPage.manualReferenceStyleWarning')
                                  : formatReference(workReference.reference, selectedStyle)}
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
                                variant="outline"
                                size="icon"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  if (linkedDocument) {
                                    router.push(buildDocumentEditHref(linkedDocument))
                                    return
                                  }
                                  openEditFreeformReference(workReference)
                                }}
                                aria-label={t('referencesPage.editReference')}
                              >
                                <Pencil className="h-4 w-4" />
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="new-work-authors">{t('metadataFields.authors')}</Label>
              <Input
                id="new-work-authors"
                value={newWorkAuthors}
                onChange={(event) => setNewWorkAuthors(event.target.value)}
                placeholder={t('libraries.authorsPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-work-year">{t('metadataFields.year')}</Label>
              <Input
                id="new-work-year"
                value={newWorkYear}
                onChange={(event) => setNewWorkYear(event.target.value)}
                placeholder="2026"
              />
            </div>
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
        open={isImportingReferences}
        onOpenChange={(open) => {
          setIsImportingReferences(open)
          if (!open) resetReferenceImportDialog()
        }}
      >
        <DialogContent className="w-[68vw] max-w-[920px] sm:max-w-[920px]">
          <DialogHeader>
            <DialogTitle>{t('referencesPage.importReferencesFrom')}</DialogTitle>
            <DialogDescription>
              {t('referencesPage.importReferencesDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
            <div className="space-y-3">
              <Label htmlFor="reference-import-provider">{t('referencesPage.referenceProvider')}</Label>
              <Select value={referenceImportProvider} onValueChange={(value) => setReferenceImportProvider(value as ReferenceImportProvider)}>
                <SelectTrigger id="reference-import-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REFERENCE_IMPORT_PROVIDERS.map((provider) => (
                    <SelectItem key={provider.value} value={provider.value}>
                      {provider.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="rounded-2xl border bg-muted/50 p-3 text-sm text-muted-foreground">
                {t(`referencesPage.importInstructions.${referenceImportProvider}`)}
              </div>

              <div className="rounded-2xl border bg-background p-3">
                <div className="text-sm font-medium">
                  {t('referencesPage.importPreview')}
                </div>
                <div className="mt-1 text-2xl font-semibold">
                  {importPreviewReferences.length}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t('referencesPage.importableReferences')}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Label htmlFor="reference-import-bibtex">{t('referencesPage.pasteBibtex')}</Label>
              <Textarea
                id="reference-import-bibtex"
                value={referenceImportBibtex}
                onChange={(event) => setReferenceImportBibtex(event.target.value)}
                placeholder="@article{smith2025,...}"
                rows={14}
                className="font-mono text-xs"
              />
              {importPreviewReferences.length > 0 ? (
                <div className="max-h-40 space-y-2 overflow-y-auto rounded-2xl border bg-muted/30 p-2">
                  {importPreviewReferences.slice(0, 6).map((reference, index) => (
                    <div key={`${reference.citationKey ?? reference.title}-${index}`} className="rounded-xl bg-background px-3 py-2 text-sm">
                      <div className="line-clamp-1 font-medium">{reference.title}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {[reference.authors, reference.year, reference.doi].filter(Boolean).join(' - ')}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsImportingReferences(false)}>
              {t('referencesPage.cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => void handleImportReferences()}
              disabled={isSubmittingReferenceImport || importPreviewReferences.length === 0}
            >
              {isSubmittingReferenceImport ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileInput className="h-4 w-4" />}
              {t('referencesPage.importReferences')}
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
            <DialogTitle>
              {editingWorkReferenceId ? t('referencesPage.editReference') : t('referencesPage.addReference')}
            </DialogTitle>
            <DialogDescription>
              {t('referencesPage.addReferenceDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reference-type">{t('referencesPage.type')}</Label>
                <Select
                  value={referenceForm.type}
                  onValueChange={(value) =>
                    setReferenceForm((current) => ({
                      ...current,
                      type: value as ReferenceType,
                    }))
                  }
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
                    <SelectItem value="manual">{t('referencesPage.referenceTypeManual')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reference-title">
                  {isManualReferenceForm ? t('referencesPage.manualReference') : t('metadataFields.title')}
                </Label>
                <Input
                  id="reference-title"
                  value={referenceForm.title}
                  onChange={(event) => setReferenceForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder={
                    isManualReferenceForm
                      ? t('referencesPage.manualReferencePlaceholder')
                      : t('referencesPage.referenceTitlePlaceholder')
                  }
                />
              </div>

              {isManualReferenceForm ? (
                <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {t('referencesPage.manualReferenceHelp')}
                </div>
              ) : (
                <>
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
                    {referenceForm.type === 'article' ? (
                      <div className="space-y-2">
                        <Label htmlFor="reference-journal">{t('referencesPage.journal')}</Label>
                        <Input
                          id="reference-journal"
                          value={referenceForm.journal}
                          onChange={(event) => setReferenceForm((current) => ({ ...current, journal: event.target.value }))}
                          placeholder={t('referencesPage.journalPlaceholder')}
                        />
                      </div>
                    ) : null}
                    {referenceForm.type === 'book' ? (
                      <div className="space-y-2">
                        <Label htmlFor="reference-publisher">{t('referencesPage.publisherSource')}</Label>
                        <Input
                          id="reference-publisher"
                          value={referenceForm.publisher}
                          onChange={(event) => setReferenceForm((current) => ({ ...current, publisher: event.target.value }))}
                          placeholder={t('referencesPage.publisherPlaceholder')}
                        />
                      </div>
                    ) : null}
                    {referenceForm.type === 'inproceedings' ? (
                      <div className="space-y-2">
                        <Label htmlFor="reference-booktitle">{t('referencesPage.booktitleCollection')}</Label>
                        <Input
                          id="reference-booktitle"
                          value={referenceForm.booktitle}
                          onChange={(event) => setReferenceForm((current) => ({ ...current, booktitle: event.target.value }))}
                          placeholder={t('referencesPage.booktitlePlaceholder')}
                        />
                      </div>
                    ) : null}
                    {referenceForm.type === 'thesis' || referenceForm.type === 'report' || referenceForm.type === 'online' || referenceForm.type === 'misc' ? (
                      <div className="space-y-2">
                        <Label htmlFor="reference-publisher">{t('referencesPage.publisherSource')}</Label>
                        <Input
                          id="reference-publisher"
                          value={referenceForm.publisher}
                          onChange={(event) => setReferenceForm((current) => ({ ...current, publisher: event.target.value }))}
                          placeholder={t('referencesPage.publisherPlaceholder')}
                        />
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <Label htmlFor="reference-doi">{t('metadataFields.doi')}</Label>
                      <Input
                        id="reference-doi"
                        value={referenceForm.doi}
                        onChange={(event) => setReferenceForm((current) => ({ ...current, doi: event.target.value }))}
                        placeholder="10.1234/example"
                      />
                    </div>
                  </div>

                  {(referenceForm.type === 'article' || referenceForm.type === 'book' || referenceForm.type === 'inproceedings' || referenceForm.type === 'report') ? (
                    <div className="grid gap-4 sm:grid-cols-3">
                      {referenceForm.type === 'article' ? (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor="reference-volume">{t('referencesPage.volume')}</Label>
                            <Input
                              id="reference-volume"
                              value={referenceForm.volume}
                              onChange={(event) => setReferenceForm((current) => ({ ...current, volume: event.target.value }))}
                              placeholder={t('referencesPage.volumePlaceholder')}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="reference-issue">{t('referencesPage.issue')}</Label>
                            <Input
                              id="reference-issue"
                              value={referenceForm.issue}
                              onChange={(event) => setReferenceForm((current) => ({ ...current, issue: event.target.value }))}
                              placeholder={t('referencesPage.issuePlaceholder')}
                            />
                          </div>
                        </>
                      ) : null}
                      {referenceForm.type === 'book' ? (
                        <div className="space-y-2">
                          <Label htmlFor="reference-chapter">{t('referencesPage.chapter')}</Label>
                          <Input
                            id="reference-chapter"
                            value={referenceForm.chapter}
                            onChange={(event) => setReferenceForm((current) => ({ ...current, chapter: event.target.value }))}
                            placeholder={t('referencesPage.chapterPlaceholder')}
                          />
                        </div>
                      ) : null}
                      <div className="space-y-2">
                        <Label htmlFor="reference-pages">{t('referencesPage.pages')}</Label>
                        <Input
                          id="reference-pages"
                          value={referenceForm.pages}
                          onChange={(event) => setReferenceForm((current) => ({ ...current, pages: event.target.value }))}
                          placeholder={t('referencesPage.pagesPlaceholder')}
                        />
                      </div>
                    </div>
                  ) : null}

                  {(referenceForm.type === 'inproceedings') ? (
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
                        <Label htmlFor="reference-pages">{t('referencesPage.pages')}</Label>
                        <Input
                          id="reference-pages"
                          value={referenceForm.pages}
                          onChange={(event) => setReferenceForm((current) => ({ ...current, pages: event.target.value }))}
                          placeholder={t('referencesPage.pagesPlaceholder')}
                        />
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <Label htmlFor="reference-url">{t('referencesPage.url')}</Label>
                    <Input
                      id="reference-url"
                      value={referenceForm.url}
                      onChange={(event) => setReferenceForm((current) => ({ ...current, url: event.target.value }))}
                      placeholder={t('referencesPage.urlPlaceholder')}
                    />
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
                </>
              )}
            </div>

            <div className="flex max-h-[70vh] min-h-0 flex-col rounded-2xl bg-muted/50 p-5">
              <div>
                <div className="text-base font-medium">{t('referencesPage.matchingSuggestions')}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {isManualReferenceForm
                    ? t('referencesPage.manualReferenceHelp')
                    : t('referencesPage.matchingSuggestionsDescription')}
                </div>
              </div>

              {isManualReferenceForm ? (
                <div className="mt-4 rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                  {t('referencesPage.manualReferenceNoMatching')}
                </div>
              ) : liveSuggestions.length ? (
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

              {!isManualReferenceForm && preferredMatchDocumentId ? (
                <div className="mt-4 rounded-2xl bg-sky-100 px-4 py-3 text-sm text-sky-700">
                  {t('referencesPage.referenceWillBeLinked')}
                </div>
              ) : !isManualReferenceForm ? (
                <div className="mt-4 rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
                  {t('referencesPage.freeformReferenceHelp')}
                </div>
              ) : null}
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
              {isSubmittingReference ? <Loader2 className="h-4 w-4 animate-spin" /> : editingWorkReferenceId ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editingWorkReferenceId ? t('referencesPage.saveReferenceChanges') : t('referencesPage.addReference')}
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
