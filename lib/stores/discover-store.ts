'use client'

import { create } from 'zustand'
import { useDocumentStore } from '@/lib/stores/document-store'
import { useRelationStore } from '@/lib/stores/relation-store'
import {
  enrichWorkMetadata,
  fetchDiscoverStep,
  getDiscoverStepCacheKey,
  loadDiscoverySettings,
  resolveSourceWork,
} from '@/lib/services/discovery-service'
import type {
  DiscoverExternalTag,
  DiscoverFilterState,
  DiscoverJourney,
  DiscoverMode,
  DiscoverWork,
} from '@/lib/types'

const JOURNEYS_STORAGE_KEY = 'refx.discover.journeys.v1'
const WORK_TAGS_STORAGE_KEY = 'refx.discover.work-tags.v1'

function cloneJourney(journey: DiscoverJourney): DiscoverJourney {
  return {
    ...journey,
    steps: journey.steps.map((step) => ({
      ...step,
      filters: { ...step.filters },
      sourceWork: { ...step.sourceWork, authors: [...step.sourceWork.authors], userTags: [...(step.sourceWork.userTags ?? [])] },
      items: step.items.map((item) => ({
        ...item,
        authors: [...item.authors],
        userTags: [...(item.userTags ?? [])],
      })),
    })),
  }
}

function persistJourneys(journeys: DiscoverJourney[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(JOURNEYS_STORAGE_KEY, JSON.stringify(journeys))
}

function persistWorkTags(tags: Record<string, DiscoverExternalTag[]>) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(WORK_TAGS_STORAGE_KEY, JSON.stringify(tags))
}

function loadPersistedJourneys(): DiscoverJourney[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(JOURNEYS_STORAGE_KEY)
    return raw ? JSON.parse(raw) as DiscoverJourney[] : []
  } catch {
    return []
  }
}

function loadPersistedWorkTags(): Record<string, DiscoverExternalTag[]> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(WORK_TAGS_STORAGE_KEY)
    return raw ? JSON.parse(raw) as Record<string, DiscoverExternalTag[]> : {}
  } catch {
    return {}
  }
}

function applyTagState(work: DiscoverWork, workTags: Record<string, DiscoverExternalTag[]>) {
  const tags = workTags[work.id] ?? work.userTags ?? []
  return {
    ...work,
    userTags: tags,
  }
}

function hydrateJourneyTags(journey: DiscoverJourney, workTags: Record<string, DiscoverExternalTag[]>) {
  return {
    ...journey,
    steps: journey.steps.map((step) => ({
      ...step,
      sourceWork: applyTagState(step.sourceWork, workTags),
      items: step.items.map((item) => applyTagState(item, workTags)),
    })),
  }
}

function mergeWorkPatch(existing: DiscoverWork, patch: Partial<DiscoverWork>) {
  return {
    ...existing,
    ...patch,
    authors: patch.authors ?? existing.authors,
    userTags: patch.userTags ?? existing.userTags,
  }
}

function patchJourneyWork(journey: DiscoverJourney, patch: Partial<DiscoverWork> & { id: string }) {
  return {
    ...journey,
    steps: journey.steps.map((step) => ({
      ...step,
      sourceWork: step.sourceWork.id === patch.id ? mergeWorkPatch(step.sourceWork, patch) : step.sourceWork,
      items: step.items.map((item) => item.id === patch.id ? mergeWorkPatch(item, patch) : item),
    })),
  }
}

function collectKnownWorks(sourceWork: DiscoverWork | null, activeJourney: DiscoverJourney | null) {
  return [
    ...(sourceWork ? [sourceWork] : []),
    ...(activeJourney?.steps.flatMap((step) => [step.sourceWork, ...step.items]) ?? []),
  ]
}

function collectJourneyStarredIds(activeJourney: DiscoverJourney | null) {
  if (!activeJourney) return new Set<string>()

  const starredIds = new Set<string>()
  for (const step of activeJourney.steps) {
    if (step.sourceWork.isStarred) starredIds.add(step.sourceWork.id)
    for (const item of step.items) {
      if (item.isStarred) starredIds.add(item.id)
    }
  }

  return starredIds
}

function applyJourneyStarState(work: DiscoverWork, activeJourney: DiscoverJourney | null) {
  return {
    ...work,
    isStarred: collectJourneyStarredIds(activeJourney).has(work.id),
  }
}

function syncSavedJourneysWithActiveJourney(savedJourneys: DiscoverJourney[], activeJourney: DiscoverJourney | null) {
  if (!activeJourney) return savedJourneys
  if (!savedJourneys.some((journey) => journey.id === activeJourney.id)) return savedJourneys

  const nextJourneys = savedJourneys.map((journey) => (
    journey.id === activeJourney.id ? cloneJourney(activeJourney) : journey
  ))
  persistJourneys(nextJourneys)
  return nextJourneys
}

interface DiscoverStoreState {
  seedDocumentId: string | null
  sourceWork: DiscoverWork | null
  selectedWorkId: string | null
  hoveredWorkId: string | null
  activeJourney: DiscoverJourney | null
  activeStepIndex: number
  cachedSteps: Map<string, DiscoverWork[]>
  cachedWorkMetadata: Map<string, DiscoverWork>
  workTags: Record<string, DiscoverExternalTag[]>
  savedJourneys: DiscoverJourney[]
  isLoading: boolean
  error: string | null
  resetDiscoverSession: () => void
  loadSeedDocument: (documentId: string) => Promise<void>
  setSelectedWork: (workId: string | null) => void
  setHoveredWork: (workId: string | null) => void
  prefetchWorkSteps: (workId?: string | null) => Promise<void>
  startJourneyFromSource: (sourceWork: DiscoverWork, mode: DiscoverMode) => Promise<void>
  advanceJourneyFromSelected: (mode: DiscoverMode) => Promise<void>
  openStep: (stepIndex: number) => void
  setYearFilterForCurrentStep: (min: number | null, max: number | null) => void
  clearCurrentStepFilters: () => void
  toggleExternalTag: (workId: string, tag: DiscoverExternalTag) => void
  toggleStar: (workId: string) => void
  saveCurrentJourney: (name: string) => void
  loadSavedJourney: (journeyId: string) => void
  deleteSavedJourney: (journeyId: string) => void
  hydrateSelectedWorkMetadata: () => Promise<void>
}

const initialJourneys = loadPersistedJourneys()
const initialTags = loadPersistedWorkTags()

export const useDiscoverStore = create<DiscoverStoreState>((set, get) => ({
  seedDocumentId: null,
  sourceWork: null,
  selectedWorkId: null,
  hoveredWorkId: null,
  activeJourney: null,
  activeStepIndex: 0,
  cachedSteps: new Map(),
  cachedWorkMetadata: new Map(),
  workTags: initialTags,
  savedJourneys: initialJourneys.map((journey) => hydrateJourneyTags(journey, initialTags)),
  isLoading: false,
  error: null,
  resetDiscoverSession: () => set({
    seedDocumentId: null,
    sourceWork: null,
    selectedWorkId: null,
    hoveredWorkId: null,
    activeJourney: null,
    activeStepIndex: 0,
    cachedWorkMetadata: new Map(),
    isLoading: false,
    error: null,
  }),
  loadSeedDocument: async (documentId) => {
    set({ isLoading: true, error: null })
    try {
      const document = useDocumentStore.getState().documents.find((entry) => entry.id === documentId) ?? null
      if (!document) {
        set({ error: 'Document not found.', isLoading: false })
        return
      }

      const sourceWork = await resolveSourceWork(document)
      set({
        seedDocumentId: documentId,
        sourceWork,
        selectedWorkId: sourceWork?.id ?? null,
        activeJourney: null,
        activeStepIndex: 0,
        isLoading: false,
      })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Could not load the discovery seed.',
        isLoading: false,
      })
    }
  },
  setSelectedWork: (selectedWorkId) => set({ selectedWorkId }),
  setHoveredWork: (hoveredWorkId) => set({ hoveredWorkId }),
  prefetchWorkSteps: async (workId) => {
    const state = get()
    const targetId = workId ?? state.selectedWorkId
    if (!targetId) return

    const work = collectKnownWorks(state.sourceWork, state.activeJourney).find((entry) => entry.id === targetId) ?? null
    if (!work) return

    try {
      const documents = useDocumentStore.getState().documents
      const relations = useRelationStore.getState().relations
      const settings = await loadDiscoverySettings()
      const nextCachedSteps = new Map(get().cachedSteps)

      const [referencesResult, citationsResult] = await Promise.all(
        (['references', 'citations'] as const).map(async (mode) => {
          const cacheKey = getDiscoverStepCacheKey(work, mode)
          const cached = nextCachedSteps.get(cacheKey)
          if (cached) {
            return { mode, items: cached }
          }

          const items = (await fetchDiscoverStep(work, mode, documents, relations, settings))
            .map((item) => applyTagState(item, get().workTags))
          nextCachedSteps.set(cacheKey, items)
          return { mode, items }
        }),
      )

      const patch: Partial<DiscoverWork> & { id: string } = {
        id: work.id,
        referencedWorksCount: referencesResult.items.length,
        citedByCount: citationsResult.items.length,
      }
      const latestState = get()
      const nextCachedMetadata = new Map(latestState.cachedWorkMetadata)
      nextCachedMetadata.set(work.id, {
        ...(nextCachedMetadata.get(work.id) ?? work),
        ...patch,
      })

      set({
        cachedSteps: nextCachedSteps,
        cachedWorkMetadata: nextCachedMetadata,
        sourceWork: latestState.sourceWork?.id === work.id
          ? mergeWorkPatch(latestState.sourceWork, patch)
          : latestState.sourceWork,
        activeJourney: latestState.activeJourney
          ? patchJourneyWork(cloneJourney(latestState.activeJourney), patch)
          : latestState.activeJourney,
        savedJourneys: latestState.activeJourney
          ? syncSavedJourneysWithActiveJourney(
            latestState.savedJourneys,
            patchJourneyWork(cloneJourney(latestState.activeJourney), patch),
          )
          : latestState.savedJourneys,
      })
    } catch (error) {
      console.warn('Could not prefetch discover steps:', error)
    }
  },
  startJourneyFromSource: async (sourceWork, mode) => {
    set({ isLoading: true, error: null })
    try {
      const documents = useDocumentStore.getState().documents
      const relations = useRelationStore.getState().relations
      const settings = await loadDiscoverySettings()
      const cacheKey = getDiscoverStepCacheKey(sourceWork, mode)
      const cached = get().cachedSteps.get(cacheKey)
      const items = (cached ?? await fetchDiscoverStep(sourceWork, mode, documents, relations, settings))
        .map((item) => applyJourneyStarState(applyTagState(item, get().workTags), get().activeJourney))

      const nextCachedSteps = new Map(get().cachedSteps)
      nextCachedSteps.set(cacheKey, items)
      const nextJourney: DiscoverJourney = {
        id: crypto.randomUUID(),
        name: `${mode === 'references' ? 'References' : 'Citations'} of ${sourceWork.firstAuthorLabel}`,
        steps: [{
          id: crypto.randomUUID(),
          sourceWork: applyJourneyStarState(applyTagState(sourceWork, get().workTags), get().activeJourney),
          mode,
          items,
          filters: {},
          createdAt: new Date().toISOString(),
          cacheKey,
        }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      set({
        sourceWork: applyJourneyStarState(applyTagState(sourceWork, get().workTags), get().activeJourney),
        activeJourney: nextJourney,
        activeStepIndex: 0,
        selectedWorkId: sourceWork.id,
        cachedSteps: nextCachedSteps,
        isLoading: false,
      })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Could not start the discovery journey.',
        isLoading: false,
      })
    }
  },
  advanceJourneyFromSelected: async (mode) => {
    const state = get()
    const currentJourney = state.activeJourney
    if (!currentJourney) return

    const currentStep = state.activeStepIndex >= 0 ? currentJourney.steps[state.activeStepIndex] : currentJourney.steps.at(-1) ?? null
    const selectedWork = [
      ...(currentJourney.steps.flatMap((step) => step.items)),
      ...currentJourney.steps.map((step) => step.sourceWork),
      ...(state.sourceWork ? [state.sourceWork] : []),
    ].find((item) => item.id === state.selectedWorkId) ?? currentStep?.sourceWork ?? state.sourceWork

    if (!selectedWork) return

    set({ isLoading: true, error: null })
    try {
      const documents = useDocumentStore.getState().documents
      const relations = useRelationStore.getState().relations
      const settings = await loadDiscoverySettings()
      const cacheKey = getDiscoverStepCacheKey(selectedWork, mode)
      const cached = get().cachedSteps.get(cacheKey)
      const items = (cached ?? await fetchDiscoverStep(selectedWork, mode, documents, relations, settings))
        .map((item) => applyJourneyStarState(applyTagState(item, get().workTags), currentJourney))

      const nextCachedSteps = new Map(get().cachedSteps)
      nextCachedSteps.set(cacheKey, items)
      const nextJourney = cloneJourney(currentJourney)
      if (state.activeStepIndex >= 0 && state.activeStepIndex < nextJourney.steps.length - 1) {
        nextJourney.steps = nextJourney.steps.slice(0, state.activeStepIndex + 1)
      }
      const existingStepIndex = nextJourney.steps.findIndex((step) => step.cacheKey === cacheKey)

      if (existingStepIndex >= 0) {
        set({
          activeJourney: nextJourney,
          activeStepIndex: existingStepIndex,
          cachedSteps: nextCachedSteps,
          selectedWorkId: selectedWork.id,
          savedJourneys: syncSavedJourneysWithActiveJourney(get().savedJourneys, nextJourney),
          isLoading: false,
        })
        return
      }

      nextJourney.steps.push({
        id: crypto.randomUUID(),
        sourceWork: applyJourneyStarState(applyTagState(selectedWork, get().workTags), currentJourney),
        mode,
        items,
        filters: {},
        createdAt: new Date().toISOString(),
        cacheKey,
      })
      nextJourney.updatedAt = new Date().toISOString()

      set({
        activeJourney: nextJourney,
        activeStepIndex: nextJourney.steps.length - 1,
        cachedSteps: nextCachedSteps,
        selectedWorkId: selectedWork.id,
        savedJourneys: syncSavedJourneysWithActiveJourney(get().savedJourneys, nextJourney),
        isLoading: false,
      })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Could not advance the discovery journey.',
        isLoading: false,
      })
    }
  },
  openStep: (stepIndex) => {
    const journey = get().activeJourney
    if (!journey) {
      set({ activeStepIndex: stepIndex })
      return
    }

    if (stepIndex < 0) {
      set({ activeStepIndex: stepIndex })
      return
    }

    const step = journey.steps[stepIndex]
    set({
      activeStepIndex: stepIndex,
      selectedWorkId: step?.sourceWork.id ?? get().selectedWorkId,
    })
  },
  setYearFilterForCurrentStep: (min, max) => {
    const journey = get().activeJourney
    if (!journey || get().activeStepIndex < 0) return

    const nextJourney = cloneJourney(journey)
    const step = nextJourney.steps[get().activeStepIndex]
    if (!step) return
    step.filters = { yearMin: min, yearMax: max }
    step.createdAt = step.createdAt
    nextJourney.updatedAt = new Date().toISOString()
    set({
      activeJourney: nextJourney,
      savedJourneys: syncSavedJourneysWithActiveJourney(get().savedJourneys, nextJourney),
    })
  },
  clearCurrentStepFilters: () => {
    const journey = get().activeJourney
    if (!journey || get().activeStepIndex < 0) return
    const nextJourney = cloneJourney(journey)
    const step = nextJourney.steps[get().activeStepIndex]
    if (!step) return
    step.filters = {}
    nextJourney.updatedAt = new Date().toISOString()
    set({
      activeJourney: nextJourney,
      savedJourneys: syncSavedJourneysWithActiveJourney(get().savedJourneys, nextJourney),
    })
  },
  toggleExternalTag: (workId, tag) => {
    const nextTags = { ...get().workTags }
    const current = new Set(nextTags[workId] ?? [])
    if (current.has(tag)) current.delete(tag)
    else current.add(tag)
    nextTags[workId] = Array.from(current)
    persistWorkTags(nextTags)

    const activeJourney = get().activeJourney
    set({
      workTags: nextTags,
      activeJourney: activeJourney ? hydrateJourneyTags(cloneJourney(activeJourney), nextTags) : null,
      savedJourneys: (() => {
        const nextJourneys = get().savedJourneys.map((journey) => hydrateJourneyTags(cloneJourney(journey), nextTags))
        persistJourneys(nextJourneys)
        return nextJourneys
      })(),
    })
  },
  toggleStar: (workId) => {
    const activeJourney = get().activeJourney
    if (!activeJourney) return
    const nextJourney = cloneJourney(activeJourney)
    for (const step of nextJourney.steps) {
      if (step.sourceWork.id === workId) {
        step.sourceWork.isStarred = !step.sourceWork.isStarred
      }
      step.items = step.items.map((item) => item.id === workId ? { ...item, isStarred: !item.isStarred } : item)
    }
    if (get().sourceWork?.id === workId) {
      set({ sourceWork: get().sourceWork ? { ...get().sourceWork!, isStarred: !get().sourceWork!.isStarred } : null })
    }
    set({
      activeJourney: nextJourney,
      savedJourneys: syncSavedJourneysWithActiveJourney(get().savedJourneys, nextJourney),
    })
  },
  saveCurrentJourney: (name) => {
    const journey = get().activeJourney
    if (!journey) return
    const existingSavedJourney = get().savedJourneys.find((entry) => entry.id === journey.id)
    const saved = {
      ...cloneJourney(journey),
      id: existingSavedJourney?.id ?? crypto.randomUUID(),
      name,
      updatedAt: new Date().toISOString(),
    }
    const nextJourneys = [saved, ...get().savedJourneys.filter((entry) => entry.id !== saved.id)]
    persistJourneys(nextJourneys)
    set({
      activeJourney: { ...saved },
      savedJourneys: nextJourneys,
    })
  },
  loadSavedJourney: (journeyId) => {
    const journey = get().savedJourneys.find((entry) => entry.id === journeyId)
    if (!journey) return
    set({
      activeJourney: cloneJourney(journey),
      activeStepIndex: 0,
      sourceWork: journey.steps[0]?.sourceWork ?? null,
      selectedWorkId: journey.steps[0]?.sourceWork.id ?? null,
      seedDocumentId: journey.steps[0]?.sourceWork.libraryDocumentId ?? null,
    })
  },
  deleteSavedJourney: (journeyId) => {
    const nextJourneys = get().savedJourneys.filter((entry) => entry.id !== journeyId)
    persistJourneys(nextJourneys)
    set({
      savedJourneys: nextJourneys,
      activeJourney: get().activeJourney?.id === journeyId ? null : get().activeJourney,
    })
  },
  hydrateSelectedWorkMetadata: async () => {
    const state = get()
    const selectedId = state.selectedWorkId
    if (!selectedId) return

    const allWorks = collectKnownWorks(state.sourceWork, state.activeJourney)
    const work = allWorks.find((entry) => entry.id === selectedId)
    if (!work) return

    const settings = await loadDiscoverySettings()
    const enriched = await enrichWorkMetadata(work, settings)
    const nextCachedMetadata = new Map(state.cachedWorkMetadata)
    nextCachedMetadata.set(enriched.id, enriched)

    const nextJourney = state.activeJourney ? cloneJourney(state.activeJourney) : null
    if (nextJourney) {
      nextJourney.steps = nextJourney.steps.map((step) => ({
        ...step,
        sourceWork: step.sourceWork.id === enriched.id ? { ...step.sourceWork, ...enriched } : step.sourceWork,
        items: step.items.map((item) => item.id === enriched.id ? { ...item, ...enriched } : item),
      }))
    }

    set({
      cachedWorkMetadata: nextCachedMetadata,
      activeJourney: nextJourney,
      savedJourneys: syncSavedJourneysWithActiveJourney(state.savedJourneys, nextJourney),
      sourceWork: state.sourceWork?.id === enriched.id ? { ...state.sourceWork, ...enriched } : state.sourceWork,
    })
  },
}))

export function useDiscoverActions() {
  return {
    resetDiscoverSession: useDiscoverStore((state) => state.resetDiscoverSession),
    loadSeedDocument: useDiscoverStore((state) => state.loadSeedDocument),
    setSelectedWork: useDiscoverStore((state) => state.setSelectedWork),
    setHoveredWork: useDiscoverStore((state) => state.setHoveredWork),
    prefetchWorkSteps: useDiscoverStore((state) => state.prefetchWorkSteps),
    startJourneyFromSource: useDiscoverStore((state) => state.startJourneyFromSource),
    advanceJourneyFromSelected: useDiscoverStore((state) => state.advanceJourneyFromSelected),
    openStep: useDiscoverStore((state) => state.openStep),
    setYearFilterForCurrentStep: useDiscoverStore((state) => state.setYearFilterForCurrentStep),
    clearCurrentStepFilters: useDiscoverStore((state) => state.clearCurrentStepFilters),
    toggleExternalTag: useDiscoverStore((state) => state.toggleExternalTag),
    toggleStar: useDiscoverStore((state) => state.toggleStar),
    saveCurrentJourney: useDiscoverStore((state) => state.saveCurrentJourney),
    loadSavedJourney: useDiscoverStore((state) => state.loadSavedJourney),
    deleteSavedJourney: useDiscoverStore((state) => state.deleteSavedJourney),
    hydrateSelectedWorkMetadata: useDiscoverStore((state) => state.hydrateSelectedWorkMetadata),
  }
}
