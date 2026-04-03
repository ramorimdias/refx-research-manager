'use client'

import { create } from 'zustand'
import * as repo from '@/lib/repositories/local-db'
import { isTauri } from '@/lib/tauri/client'
import type { GraphView, GraphViewNodeLayout } from '@/lib/types'
import { toUiGraphView, toUiGraphViewNodeLayout } from './shared'
import { useLibraryStore } from './library-store'

interface GraphStoreState {
  graphViews: GraphView[]
  graphViewLayouts: GraphViewNodeLayout[]
  setGraphViews: (graphViews: GraphView[]) => void
  setGraphViewLayouts: (graphViewLayouts: GraphViewNodeLayout[]) => void
  loadGraphViews: (libraryId?: string | null) => Promise<void>
  loadGraphViewLayouts: (graphViewId: string | null) => Promise<void>
  createGraphView: (input: {
    libraryId: string
    name: string
    description?: string
    relationFilter: GraphView['relationFilter']
    colorMode: GraphView['colorMode']
    sizeMode: GraphView['sizeMode']
    scopeMode: GraphView['scopeMode']
    neighborhoodDepth: GraphView['neighborhoodDepth']
    focusMode: boolean
    hideOrphans: boolean
    confidenceThreshold: number
    yearMin?: number
    yearMax?: number
    selectedDocumentId?: string
    documentIds: string[]
  }) => Promise<GraphView | null>
  updateGraphView: (id: string, input: {
    name?: string
    description?: string
    relationFilter?: GraphView['relationFilter']
    colorMode?: GraphView['colorMode']
    sizeMode?: GraphView['sizeMode']
    scopeMode?: GraphView['scopeMode']
    neighborhoodDepth?: GraphView['neighborhoodDepth']
    focusMode?: boolean
    hideOrphans?: boolean
    confidenceThreshold?: number
    yearMin?: number
    yearMax?: number
    selectedDocumentId?: string
    documentIds?: string[]
  }) => Promise<GraphView | null>
  duplicateGraphView: (id: string) => Promise<GraphView | null>
  deleteGraphView: (id: string) => Promise<boolean>
  upsertGraphViewNodeLayout: (input: {
    graphViewId: string
    documentId: string
    x: number
    y: number
    pinned?: boolean
    hidden?: boolean
  }) => Promise<GraphViewNodeLayout | null>
  resetGraphViewNodeLayouts: (graphViewId: string, documentId?: string) => Promise<void>
  resetGraphState: () => void
}

export const useGraphStore = create<GraphStoreState>((set) => ({
  graphViews: [],
  graphViewLayouts: [],
  setGraphViews: (graphViews) => set({ graphViews }),
  setGraphViewLayouts: (graphViewLayouts) => set({ graphViewLayouts }),
  loadGraphViews: async (libraryId) => {
    if (!isTauri()) {
      useGraphStore.setState({ graphViews: [] })
      return
    }

    const targetLibraryId = libraryId ?? useLibraryStore.getState().activeLibraryId
    if (!targetLibraryId) {
      useGraphStore.setState({ graphViews: [] })
      return
    }

    const viewRows = await repo.listGraphViews(targetLibraryId)
    useGraphStore.setState((state) => ({
      graphViews: [
        ...state.graphViews.filter((view) => view.libraryId !== targetLibraryId),
        ...viewRows.map(toUiGraphView),
      ],
    }))
  },
  loadGraphViewLayouts: async (graphViewId) => {
    if (!isTauri()) {
      useGraphStore.setState({ graphViewLayouts: [] })
      return
    }

    if (!graphViewId) {
      useGraphStore.setState({ graphViewLayouts: [] })
      return
    }

    const layoutRows = await repo.listGraphViewNodeLayouts(graphViewId)
    useGraphStore.setState({
      graphViewLayouts: layoutRows.map(toUiGraphViewNodeLayout),
    })
  },
  createGraphView: async (input) => {
    if (!isTauri()) return null

    const created = await repo.createGraphView({
      libraryId: input.libraryId,
      name: input.name,
      description: input.description,
      relationFilter: input.relationFilter,
      colorMode: input.colorMode,
      sizeMode: input.sizeMode,
      scopeMode: input.scopeMode,
      neighborhoodDepth: input.neighborhoodDepth,
      focusMode: input.focusMode,
      hideOrphans: input.hideOrphans,
      confidenceThreshold: input.confidenceThreshold,
      yearMin: input.yearMin,
      yearMax: input.yearMax,
      selectedDocumentId: input.selectedDocumentId,
      documentIdsJson: JSON.stringify(input.documentIds),
    })

    const nextView = toUiGraphView(created)
    useGraphStore.setState((state) => ({
      graphViews: [...state.graphViews.filter((view) => view.id !== nextView.id), nextView],
    }))
    return nextView
  },
  updateGraphView: async (id, input) => {
    if (!isTauri()) return null

    const updated = await repo.updateGraphView(id, {
      name: input.name,
      description: input.description,
      relationFilter: input.relationFilter,
      colorMode: input.colorMode,
      sizeMode: input.sizeMode,
      scopeMode: input.scopeMode,
      neighborhoodDepth: input.neighborhoodDepth,
      focusMode: input.focusMode,
      hideOrphans: input.hideOrphans,
      confidenceThreshold: input.confidenceThreshold,
      yearMin: input.yearMin,
      yearMax: input.yearMax,
      selectedDocumentId: input.selectedDocumentId,
      documentIdsJson: input.documentIds ? JSON.stringify(input.documentIds) : undefined,
    })

    if (!updated) return null
    const nextView = toUiGraphView(updated)
    useGraphStore.setState((state) => ({
      graphViews: state.graphViews.map((view) => (view.id === id ? nextView : view)),
    }))
    return nextView
  },
  duplicateGraphView: async (id) => {
    if (!isTauri()) return null

    const duplicated = await repo.duplicateGraphView(id)
    const nextView = toUiGraphView(duplicated)
    useGraphStore.setState((state) => ({
      graphViews: [...state.graphViews, nextView],
    }))
    return nextView
  },
  deleteGraphView: async (id) => {
    if (!isTauri()) return false

    const deleted = await repo.deleteGraphView(id)
    if (!deleted) return false

    useGraphStore.setState((state) => ({
      graphViews: state.graphViews.filter((view) => view.id !== id),
      graphViewLayouts: state.graphViewLayouts.filter((layout) => layout.graphViewId !== id),
    }))
    return true
  },
  upsertGraphViewNodeLayout: async (input) => {
    if (!isTauri()) return null

    const updated = await repo.upsertGraphViewNodeLayout({
      graphViewId: input.graphViewId,
      documentId: input.documentId,
      positionX: input.x,
      positionY: input.y,
      pinned: input.pinned,
      hidden: input.hidden,
    })

    const nextLayout = toUiGraphViewNodeLayout(updated)
    useGraphStore.setState((state) => ({
      graphViewLayouts: [
        ...state.graphViewLayouts.filter(
          (layout) => !(layout.graphViewId === nextLayout.graphViewId && layout.documentId === nextLayout.documentId),
        ),
        nextLayout,
      ],
    }))
    return nextLayout
  },
  resetGraphViewNodeLayouts: async (graphViewId, documentId) => {
    if (!isTauri()) return

    await repo.resetGraphViewNodeLayouts(graphViewId, documentId)
    if (!documentId) {
      useGraphStore.setState((state) => ({
        graphViewLayouts: state.graphViewLayouts.filter((layout) => layout.graphViewId !== graphViewId),
      }))
      return
    }

    useGraphStore.setState((state) => ({
      graphViewLayouts: state.graphViewLayouts.filter(
        (layout) => !(layout.graphViewId === graphViewId && layout.documentId === documentId),
      ),
    }))
  },
  resetGraphState: () => set({ graphViews: [], graphViewLayouts: [] }),
}))

export function useGraphActions() {
  return {
    loadGraphViews: useGraphStore((state) => state.loadGraphViews),
    loadGraphViewLayouts: useGraphStore((state) => state.loadGraphViewLayouts),
    createGraphView: useGraphStore((state) => state.createGraphView),
    updateGraphView: useGraphStore((state) => state.updateGraphView),
    duplicateGraphView: useGraphStore((state) => state.duplicateGraphView),
    deleteGraphView: useGraphStore((state) => state.deleteGraphView),
    upsertGraphViewNodeLayout: useGraphStore((state) => state.upsertGraphViewNodeLayout),
    resetGraphViewNodeLayouts: useGraphStore((state) => state.resetGraphViewNodeLayouts),
  }
}
