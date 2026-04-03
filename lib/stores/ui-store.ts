'use client'

import { create } from 'zustand'
import type {
  DocumentFilters,
  DocumentSort,
  PersistentSearchState,
  ViewMode,
} from '@/lib/types'
import { defaultPersistentSearch } from './shared'

interface UiStoreState {
  viewMode: ViewMode
  sort: DocumentSort
  filters: DocumentFilters
  globalSearchQuery: string
  persistentSearch: PersistentSearchState
  commandPaletteOpen: boolean
  sidebarCollapsed: boolean
  currentPage: number
  zoom: number
  annotationMode: 'select' | 'highlight' | 'note' | 'bookmark' | null
  rightPanelOpen: boolean
  setViewMode: (mode: ViewMode) => void
  setSort: (sort: DocumentSort) => void
  setFilters: (filters: DocumentFilters) => void
  setGlobalSearchQuery: (query: string) => void
  setPersistentSearch: (search: Partial<PersistentSearchState>) => void
  setCurrentPage: (page: number) => void
  setZoom: (zoom: number) => void
  setAnnotationMode: (mode: UiStoreState['annotationMode']) => void
  toggleRightPanel: () => void
  toggleSidebar: () => void
  toggleCommandPalette: (force?: boolean) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  resetUiState: () => void
}

export const useUiStore = create<UiStoreState>((set) => ({
  viewMode: 'table',
  sort: { field: 'addedAt', direction: 'desc' },
  filters: {},
  globalSearchQuery: '',
  persistentSearch: defaultPersistentSearch(),
  commandPaletteOpen: false,
  sidebarCollapsed: true,
  currentPage: 1,
  zoom: 100,
  annotationMode: null,
  rightPanelOpen: true,
  setViewMode: (viewMode) => set({ viewMode }),
  setSort: (sort) => set({ sort }),
  setFilters: (filters) => set({ filters }),
  setGlobalSearchQuery: (globalSearchQuery) => set({ globalSearchQuery }),
  setPersistentSearch: (search) =>
    set((state) => ({
      persistentSearch: {
        ...state.persistentSearch,
        ...search,
      },
    })),
  setCurrentPage: (currentPage) => set({ currentPage }),
  setZoom: (zoom) => set({ zoom }),
  setAnnotationMode: (annotationMode) => set({ annotationMode }),
  toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  toggleCommandPalette: (force) =>
    set((state) => ({
      commandPaletteOpen: typeof force === 'boolean' ? force : !state.commandPaletteOpen,
    })),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  resetUiState: () =>
    set({
      filters: {},
      globalSearchQuery: '',
      commandPaletteOpen: false,
      persistentSearch: defaultPersistentSearch(),
      currentPage: 1,
      zoom: 100,
      annotationMode: null,
      rightPanelOpen: true,
    }),
}))
