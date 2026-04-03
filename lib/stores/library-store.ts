'use client'

import { create } from 'zustand'
import { removeDocumentFromIndex } from '@/lib/services/document-search-service'
import { isTauri } from '@/lib/tauri/client'
import * as repo from '@/lib/repositories/local-db'
import type { Library } from '@/lib/types'
import { fetchDesktopData, previewLibraries, showStoreActionError } from './shared'
import { useDocumentStore } from './document-store'
import { useGraphStore } from './graph-store'
import { useRelationStore } from './relation-store'

interface LibraryStoreState {
  libraries: Library[]
  activeLibraryId: string | null
  setLibraries: (libraries: Library[]) => void
  setActiveLibrary: (id: string | null) => void
  loadLibraryDocuments: (_libraryId?: string | null) => Promise<void>
  createLibrary: (input: { name: string; description?: string; color?: string }) => Promise<void>
  updateLibrary: (id: string, updates: { name?: string; description?: string; color?: string }) => Promise<void>
  deleteLibrary: (id: string) => Promise<boolean>
  resetLibraries: () => void
}

export const useLibraryStore = create<LibraryStoreState>((set) => ({
  libraries: [],
  activeLibraryId: null,
  setLibraries: (libraries) => set({ libraries }),
  setActiveLibrary: (activeLibraryId) => set({ activeLibraryId }),
  resetLibraries: () => {
    const libraries = previewLibraries()
    set({
      libraries,
      activeLibraryId: libraries[0]?.id ?? null,
    })
  },
  loadLibraryDocuments: async () => {
    if (!isTauri()) return

    const data = await fetchDesktopData()
    useLibraryStore.setState((state) => ({
      libraries: data.libraries,
      activeLibraryId: data.libraries.some((library) => library.id === state.activeLibraryId)
        ? state.activeLibraryId
        : data.libraries[0]?.id ?? null,
    }))
    useDocumentStore.setState((state) => ({
      documents: data.documents,
      activeDocumentId: data.documents.some((document) => document.id === state.activeDocumentId)
        ? state.activeDocumentId
        : null,
    }))
    useRelationStore.setState({ relations: data.relations })
    useGraphStore.setState({ graphViews: data.graphViews })
  },
  createLibrary: async (input) => {
    if (!isTauri()) {
      const now = new Date()
      const library: Library = {
        id: `lib-${crypto.randomUUID?.() ?? Date.now()}`,
        name: input.name,
        description: input.description ?? '',
        color: input.color ?? '#3b82f6',
        icon: 'folder',
        type: 'local',
        documentCount: 0,
        createdAt: now,
        updatedAt: now,
      }

      useLibraryStore.setState((state) => ({
        libraries: [...state.libraries, library],
        activeLibraryId: library.id,
      }))
      return
    }

    const created = await repo.createLibrary(input)
    const data = await fetchDesktopData()
    useLibraryStore.setState({
      libraries: data.libraries,
      activeLibraryId: created.id,
    })
    useDocumentStore.setState({ documents: data.documents })
    useRelationStore.setState({ relations: data.relations })
    useGraphStore.setState({ graphViews: data.graphViews })
  },
  updateLibrary: async (id, updates) => {
    if (!isTauri()) {
      useLibraryStore.setState((state) => ({
        libraries: state.libraries.map((library) =>
          library.id === id
            ? { ...library, ...updates, updatedAt: new Date() }
            : library),
      }))
      return
    }

    await repo.updateLibrary(id, updates)
    await useLibraryStore.getState().loadLibraryDocuments()
  },
  deleteLibrary: async (id) => {
    try {
      if (!isTauri()) {
        const remainingLibraries = useLibraryStore.getState().libraries.filter((library) => library.id !== id)
        if (remainingLibraries.length === 0) return false

        useLibraryStore.setState((state) => ({
          libraries: remainingLibraries,
          activeLibraryId: state.activeLibraryId === id ? remainingLibraries[0]?.id ?? null : state.activeLibraryId,
        }))
        useDocumentStore.setState((state) => ({
          documents: state.documents.filter((document) => document.libraryId !== id),
        }))
        return true
      }

      const libraryDocumentIds = useDocumentStore.getState().documents
        .filter((document) => document.libraryId === id)
        .map((document) => document.id)
      const deleted = await repo.deleteLibrary(id)
      if (!deleted) throw new Error('Library not found')
      await Promise.all(libraryDocumentIds.map((documentId) => removeDocumentFromIndex(documentId)))
      await useLibraryStore.getState().loadLibraryDocuments()
      return true
    } catch (error) {
      showStoreActionError('Could not delete library', error)
      return false
    }
  },
}))

export function useLibraryActions() {
  return {
    setActiveLibrary: useLibraryStore((state) => state.setActiveLibrary),
    createLibrary: useLibraryStore((state) => state.createLibrary),
    updateLibrary: useLibraryStore((state) => state.updateLibrary),
    deleteLibrary: useLibraryStore((state) => state.deleteLibrary),
    loadLibraryDocuments: useLibraryStore((state) => state.loadLibraryDocuments),
  }
}
