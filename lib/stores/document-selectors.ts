'use client'

import { scoreDocumentMatch } from '@/lib/services/document-processing'
import { useDocumentStore } from '@/lib/stores/document-store'
import { useLibraryStore } from '@/lib/stores/library-store'
import { getLibraryMetadataFilterState } from '@/lib/stores/shared'
import { useUiStore } from '@/lib/stores/ui-store'

function compareValues(a: ReturnType<typeof useDocumentStore.getState>['documents'][number], b: ReturnType<typeof useDocumentStore.getState>['documents'][number], field: ReturnType<typeof useUiStore.getState>['sort']['field']) {
  switch (field) {
    case 'addedAt':
      return a.addedAt.getTime() - b.addedAt.getTime()
    case 'lastOpenedAt':
      return (a.lastOpenedAt?.getTime() ?? 0) - (b.lastOpenedAt?.getTime() ?? 0)
    case 'year':
      return (a.year ?? 0) - (b.year ?? 0)
    case 'rating':
      return a.rating - b.rating
    case 'authors':
      return a.authors.join(', ').localeCompare(b.authors.join(', '))
    case 'title':
    default:
      return a.title.localeCompare(b.title)
  }
}

export function useFilteredDocuments() {
  const activeLibraryId = useLibraryStore((state) => state.activeLibraryId)
  const documents = useDocumentStore((state) => state.documents)
  const filters = useUiStore((state) => state.filters)
  const sort = useUiStore((state) => state.sort)
  const search = (filters.search ?? '').trim().toLowerCase()

  const filtered = documents.filter((document) => {
    if (activeLibraryId && document.libraryId !== activeLibraryId) return false

    if (search) {
      const haystack = [document.title, document.authors.join(' '), document.doi, document.citationKey, document.abstract, document.searchText]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(search)) return false
    }

    if (filters.favorite && !document.favorite) return false
    if (filters.hasComments && document.commentCount <= 0) return false
    if (filters.hasNotes && document.notesCount <= 0) return false
    if (filters.readingStage?.length && !filters.readingStage.includes(document.readingStage)) return false
    if (filters.metadataStatus?.length && !filters.metadataStatus.includes(getLibraryMetadataFilterState(document))) return false
    if (filters.tags?.length && !filters.tags.some((tag) => document.tags.includes(tag))) return false
    if (filters.year?.min && (document.year ?? 0) < filters.year.min) return false
    if (filters.year?.max && (document.year ?? 0) > filters.year.max) return false

    return true
  })

  return filtered.sort((left, right) => {
    if (search) {
      const relevance = scoreDocumentMatch(right, search).rawScore - scoreDocumentMatch(left, search).rawScore
      if (relevance !== 0) return relevance
    }
    const comparison = compareValues(left, right, sort.field)
    return sort.direction === 'asc' ? comparison : -comparison
  })
}
