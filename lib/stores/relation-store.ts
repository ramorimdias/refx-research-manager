'use client'

import { create } from 'zustand'
import * as repo from '@/lib/repositories/local-db'
import { isTauri } from '@/lib/tauri/client'
import type { DocumentRelation } from '@/lib/types'
import { showStoreActionError, toUiRelation } from './shared'

interface RelationStoreState {
  relations: DocumentRelation[]
  setRelations: (relations: DocumentRelation[]) => void
  createRelation: (input: {
    sourceDocumentId: string
    targetDocumentId: string
    linkType?: DocumentRelation['linkType']
    linkOrigin?: DocumentRelation['linkOrigin']
    relationStatus?: DocumentRelation['relationStatus']
    confidence?: number
    label?: string
    notes?: string
    matchMethod?: DocumentRelation['matchMethod']
    rawReferenceText?: string
    normalizedReferenceText?: string
    normalizedTitle?: string
    normalizedFirstAuthor?: string
    referenceIndex?: number
    parseConfidence?: number
    parseWarnings?: string[]
    matchDebugInfo?: string
  }) => Promise<DocumentRelation | null>
  updateRelation: (id: string, input: {
    linkType?: DocumentRelation['linkType']
    relationStatus?: DocumentRelation['relationStatus']
    confidence?: number
    label?: string
    notes?: string
  }) => Promise<DocumentRelation | null>
  deleteRelation: (id: string) => Promise<boolean>
  resetRelations: () => void
}

export const useRelationStore = create<RelationStoreState>((set) => ({
  relations: [],
  setRelations: (relations) => set({ relations }),
  createRelation: async (input) => {
    try {
      if (!isTauri()) return null

      const created = await repo.createRelation({
        sourceDocumentId: input.sourceDocumentId,
        targetDocumentId: input.targetDocumentId,
        linkType: input.linkType ?? 'manual',
        linkOrigin: input.linkOrigin ?? 'user',
        relationStatus: input.relationStatus,
        confidence: input.confidence,
        label: input.label,
        notes: input.notes,
        matchMethod: input.matchMethod,
        rawReferenceText: input.rawReferenceText,
        normalizedReferenceText: input.normalizedReferenceText,
        normalizedTitle: input.normalizedTitle,
        normalizedFirstAuthor: input.normalizedFirstAuthor,
        referenceIndex: input.referenceIndex,
        parseConfidence: input.parseConfidence,
        parseWarnings: input.parseWarnings ? JSON.stringify(input.parseWarnings) : undefined,
        matchDebugInfo: input.matchDebugInfo,
      })
      const nextRelation = toUiRelation(created)
      useRelationStore.setState((state) => ({
        relations: [...state.relations.filter((relation) => relation.id !== nextRelation.id), nextRelation],
      }))
      return nextRelation
    } catch (error) {
      showStoreActionError('Could not create relation', error)
      return null
    }
  },
  updateRelation: async (id, input) => {
    if (!isTauri()) return null

    const updated = await repo.updateRelation(id, input)
    if (!updated) return null

    const nextRelation = toUiRelation(updated)
    useRelationStore.setState((state) => ({
      relations: state.relations.map((relation) => (relation.id === id ? nextRelation : relation)),
    }))
    return nextRelation
  },
  deleteRelation: async (id) => {
    try {
      if (!isTauri()) {
        useRelationStore.setState((state) => ({
          relations: state.relations.filter((relation) => relation.id !== id),
        }))
        return true
      }

      const deleted = await repo.deleteRelation(id)
      if (!deleted) throw new Error('Relation not found')

      useRelationStore.setState((state) => ({
        relations: state.relations.filter((relation) => relation.id !== id),
      }))
      return true
    } catch (error) {
      showStoreActionError('Could not delete relation', error)
      return false
    }
  },
  resetRelations: () => set({ relations: [] }),
}))

export function useRelationActions() {
  return {
    createRelation: useRelationStore((state) => state.createRelation),
    updateRelation: useRelationStore((state) => state.updateRelation),
    deleteRelation: useRelationStore((state) => state.deleteRelation),
  }
}
