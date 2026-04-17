'use client'

import type { DiscoverFilterState, DiscoverWork } from '@/lib/types'
import { translate, type AppLocale } from '@/lib/localization'

export function filterDiscoverItems(
  items: DiscoverWork[],
  filters: DiscoverFilterState,
) {
  return items.filter((item) => {
    if (filters.yearMin != null && (item.year ?? Number.MIN_SAFE_INTEGER) < filters.yearMin) return false
    if (filters.yearMax != null && (item.year ?? Number.MAX_SAFE_INTEGER) > filters.yearMax) return false
    return true
  })
}

export function formatDiscoverFilterSummary(filters: DiscoverFilterState, locale: AppLocale = 'en') {
  if (filters.yearMin != null && filters.yearMax != null) {
    return translate(locale, 'discoverPage.filterSummaryBetween', {
      yearMin: filters.yearMin,
      yearMax: filters.yearMax,
    })
  }
  if (filters.yearMin != null) {
    return translate(locale, 'discoverPage.filterSummaryFrom', {
      yearMin: filters.yearMin,
    })
  }
  if (filters.yearMax != null) {
    return translate(locale, 'discoverPage.filterSummaryTo', {
      yearMax: filters.yearMax,
    })
  }
  return translate(locale, 'discoverPage.filterSummaryAllYears')
}
