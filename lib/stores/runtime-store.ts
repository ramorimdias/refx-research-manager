'use client'

import { useAppStore } from '@/lib/store'

export function useRuntimeState() {
  return {
    initialized: useAppStore((state) => state.initialized),
    isDesktopApp: useAppStore((state) => state.isDesktopApp),
    notes: useAppStore((state) => state.notes),
    annotations: useAppStore((state) => state.annotations),
    loadNotes: useAppStore((state) => state.loadNotes),
    refreshData: useAppStore((state) => state.refreshData),
    initialize: useAppStore((state) => state.initialize),
  }
}

export function useRuntimeActions() {
  return {
    initialize: useAppStore((state) => state.initialize),
    refreshData: useAppStore((state) => state.refreshData),
    clearLocalData: useAppStore((state) => state.clearLocalData),
  }
}
