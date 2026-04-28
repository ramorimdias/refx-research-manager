'use client'

export const HOME_DASHBOARD_PREFS_KEY = 'refx.home.dashboard.v2'
export const HOME_RECENT_SEARCHES_KEY = 'refx.home.recent-searches.v1'

export type HomeDashboardSectionId =
  | 'libraries'
  | 'recent-activity'
  | 'recent-opened'
  | 'favorite-documents'
  | 'recent-notes'
  | 'recent-comments'
  | 'recent-journeys'
  | 'recent-searches'

export type HomeDashboardLayout = 'grid' | 'stacked'

export type HomeDashboardPrefs = {
  layout: HomeDashboardLayout
  order: HomeDashboardSectionId[]
  hidden: HomeDashboardSectionId[]
}

export type HomeRecentSearch = {
  id: string
  label: string
  href: string
  mode: 'simple' | 'complex'
  occurredAt: string
}

export const HOME_DASHBOARD_SECTION_ORDER: HomeDashboardSectionId[] = [
  'libraries',
  'favorite-documents',
  'recent-activity',
  'recent-opened',
  'recent-notes',
  'recent-comments',
  'recent-journeys',
  'recent-searches',
]

export const DEFAULT_HOME_DASHBOARD_PREFS: HomeDashboardPrefs = {
  layout: 'grid',
  order: HOME_DASHBOARD_SECTION_ORDER,
  hidden: [
    'recent-notes',
    'recent-comments',
    'recent-journeys',
    'recent-searches',
  ],
}

export function normalizeHomeDashboardPrefs(value: unknown): HomeDashboardPrefs {
  const fallback = DEFAULT_HOME_DASHBOARD_PREFS
  if (!value || typeof value !== 'object') return fallback

  const input = value as Partial<HomeDashboardPrefs>
  const knownIds = new Set(HOME_DASHBOARD_SECTION_ORDER)
  const order = Array.isArray(input.order)
    ? input.order.filter((id): id is HomeDashboardSectionId => knownIds.has(id as HomeDashboardSectionId))
    : []
  const hidden = Array.isArray(input.hidden)
    ? input.hidden.filter((id): id is HomeDashboardSectionId => knownIds.has(id as HomeDashboardSectionId))
    : []

  return {
    layout: input.layout === 'stacked' ? 'stacked' : 'grid',
    order: [
      ...order,
      ...HOME_DASHBOARD_SECTION_ORDER.filter((id) => !order.includes(id)),
    ],
    hidden: Array.from(new Set(hidden)),
  }
}

export function loadHomeDashboardPrefs() {
  if (typeof window === 'undefined') return DEFAULT_HOME_DASHBOARD_PREFS

  try {
    const raw = window.localStorage.getItem(HOME_DASHBOARD_PREFS_KEY)
    return normalizeHomeDashboardPrefs(raw ? JSON.parse(raw) : null)
  } catch {
    return DEFAULT_HOME_DASHBOARD_PREFS
  }
}

export function saveHomeDashboardPrefs(prefs: HomeDashboardPrefs) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(HOME_DASHBOARD_PREFS_KEY, JSON.stringify(normalizeHomeDashboardPrefs(prefs)))
}

export function loadHomeRecentSearches() {
  if (typeof window === 'undefined') return [] as HomeRecentSearch[]

  try {
    const raw = window.localStorage.getItem(HOME_RECENT_SEARCHES_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed.filter((entry): entry is HomeRecentSearch => (
      Boolean(entry)
      && typeof entry === 'object'
      && typeof (entry as HomeRecentSearch).id === 'string'
      && typeof (entry as HomeRecentSearch).label === 'string'
      && typeof (entry as HomeRecentSearch).href === 'string'
      && (((entry as HomeRecentSearch).mode === 'simple') || ((entry as HomeRecentSearch).mode === 'complex'))
      && typeof (entry as HomeRecentSearch).occurredAt === 'string'
    ))
  } catch {
    return []
  }
}

export function saveHomeRecentSearch(search: Omit<HomeRecentSearch, 'id' | 'occurredAt'>) {
  if (typeof window === 'undefined') return

  const nextEntry: HomeRecentSearch = {
    id: `${search.href}:${search.label}`.toLowerCase(),
    label: search.label.trim(),
    href: search.href,
    mode: search.mode,
    occurredAt: new Date().toISOString(),
  }

  if (!nextEntry.label) return

  const current = loadHomeRecentSearches().filter((entry) => entry.id !== nextEntry.id)
  const next = [nextEntry, ...current].slice(0, 12)
  window.localStorage.setItem(HOME_RECENT_SEARCHES_KEY, JSON.stringify(next))
}
