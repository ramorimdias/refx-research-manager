'use client'

import { create } from 'zustand'
import type { Document } from '@/lib/types'
import { useAppStore } from '@/lib/store'
import { previewDocuments } from './shared'

interface DocumentStoreState {
  documents: Document[]
  activeDocumentId: string | null
  setDocuments: (documents: Document[]) => void
  setActiveDocument: (id: string | null) => void
  resetDocuments: () => void
}

export const useDocumentStore = create<DocumentStoreState>((set) => ({
  documents: [],
  activeDocumentId: null,
  setDocuments: (documents) => set({ documents }),
  setActiveDocument: (activeDocumentId) => set({ activeDocumentId }),
  resetDocuments: () => set({ documents: previewDocuments(), activeDocumentId: null }),
}))

export function useDocumentActions() {
  return {
    setActiveDocument: useAppStore((state) => state.setActiveDocument),
    createDocumentRecord: useAppStore((state) => state.createDocumentRecord),
    importDocuments: useAppStore((state) => state.importDocuments),
    deleteDocument: useAppStore((state) => state.deleteDocument),
    removeDocumentsFromLibrary: useAppStore((state) => state.removeDocumentsFromLibrary),
    moveDocumentsToLibrary: useAppStore((state) => state.moveDocumentsToLibrary),
    addDocumentTag: useAppStore((state) => state.addDocumentTag),
    removeDocumentTag: useAppStore((state) => state.removeDocumentTag),
    acceptSuggestedTag: useAppStore((state) => state.acceptSuggestedTag),
    rejectSuggestedTag: useAppStore((state) => state.rejectSuggestedTag),
    toggleFavorite: useAppStore((state) => state.toggleFavorite),
    updateDocument: useAppStore((state) => state.updateDocument),
    applyFetchedMetadataCandidate: useAppStore((state) => state.applyFetchedMetadataCandidate),
    classifyDocuments: useAppStore((state) => state.classifyDocuments),
    scanDocumentsOcr: useAppStore((state) => state.scanDocumentsOcr),
    fetchOnlineMetadataForDocument: useAppStore((state) => state.fetchOnlineMetadataForDocument),
    refreshTagSuggestionsForDocuments: useAppStore((state) => state.refreshTagSuggestionsForDocuments),
  }
}
