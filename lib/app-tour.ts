'use client'

export type AppTourPlacement = 'top' | 'bottom' | 'left' | 'right'
export type AppTourDynamicPath = 'first-pdf-reader' | 'first-document-comments'

// Temporarily disabled while we investigate a packaged-client freeze around the
// Search tour step. Re-enable once the installed-build path is stable again.
export const APP_TOUR_ENABLED = false

export type AppTourStep = {
  id: string
  path?: string
  dynamicPath?: AppTourDynamicPath
  skipIfUnavailable?: boolean
  targetTourId: string
  titleKey: string
  bodyKey: string
  placement: AppTourPlacement
}

export const APP_TOUR_STEPS: AppTourStep[] = [
  {
    id: 'navigator-overview',
    path: '/',
    targetTourId: 'shell-nav',
    titleKey: 'tour.steps.navigatorOverview.title',
    bodyKey: 'tour.steps.navigatorOverview.body',
    placement: 'right',
  },
  {
    id: 'home-overview',
    path: '/',
    targetTourId: 'home-greeting',
    titleKey: 'tour.steps.homeOverview.title',
    bodyKey: 'tour.steps.homeOverview.body',
    placement: 'bottom',
  },
  {
    id: 'search-overview',
    path: '/tour/search',
    targetTourId: 'search-query',
    titleKey: 'tour.steps.searchOverview.title',
    bodyKey: 'tour.steps.searchOverview.body',
    placement: 'right',
  },
  {
    id: 'libraries-toolbar',
    path: '/libraries',
    targetTourId: 'libraries-toolbar',
    titleKey: 'tour.steps.librariesToolbar.title',
    bodyKey: 'tour.steps.librariesToolbar.body',
    placement: 'bottom',
  },
  {
    id: 'libraries-import',
    path: '/libraries',
    targetTourId: 'libraries-import',
    titleKey: 'tour.steps.librariesImport.title',
    bodyKey: 'tour.steps.librariesImport.body',
    placement: 'bottom',
  },
  {
    id: 'libraries-physical-book',
    path: '/libraries',
    targetTourId: 'libraries-physical-book',
    titleKey: 'tour.steps.librariesPhysicalBook.title',
    bodyKey: 'tour.steps.librariesPhysicalBook.body',
    placement: 'bottom',
  },
  {
    id: 'libraries-views',
    path: '/libraries',
    targetTourId: 'libraries-view-mode',
    titleKey: 'tour.steps.librariesViews.title',
    bodyKey: 'tour.steps.librariesViews.body',
    placement: 'bottom',
  },
  {
    id: 'libraries-list',
    path: '/libraries',
    targetTourId: 'libraries-list',
    titleKey: 'tour.steps.librariesList.title',
    bodyKey: 'tour.steps.librariesList.body',
    placement: 'top',
  },
  {
    id: 'document-details-information',
    path: '/documents?tourDemo=1',
    targetTourId: 'documents-information',
    titleKey: 'tour.steps.documentDetailsInformation.title',
    bodyKey: 'tour.steps.documentDetailsInformation.body',
    placement: 'right',
  },
  {
    id: 'document-details-tags',
    path: '/documents?tourDemo=1',
    targetTourId: 'documents-tags',
    titleKey: 'tour.steps.documentDetailsTags.title',
    bodyKey: 'tour.steps.documentDetailsTags.body',
    placement: 'right',
  },
  {
    id: 'document-details-references',
    path: '/documents?tourDemo=1',
    targetTourId: 'documents-references',
    titleKey: 'tour.steps.documentDetailsReferences.title',
    bodyKey: 'tour.steps.documentDetailsReferences.body',
    placement: 'left',
  },
  {
    id: 'document-details-metadata',
    path: '/documents?tourDemo=1',
    targetTourId: 'documents-fetch-metadata',
    titleKey: 'tour.steps.documentDetailsMetadata.title',
    bodyKey: 'tour.steps.documentDetailsMetadata.body',
    placement: 'bottom',
  },
  {
    id: 'comments-overview',
    path: '/comments?tourDemo=1',
    targetTourId: 'comments-draft',
    titleKey: 'tour.steps.commentsOverview.title',
    bodyKey: 'tour.steps.commentsOverview.body',
    placement: 'left',
  },
  {
    id: 'reader-highlights',
    path: '/reader/view?tourDemo=1',
    targetTourId: 'reader-highlight',
    titleKey: 'tour.steps.readerHighlights.title',
    bodyKey: 'tour.steps.readerHighlights.body',
    placement: 'bottom',
  },
  {
    id: 'reader-notes',
    path: '/reader/view?tourDemo=1',
    targetTourId: 'reader-notes',
    titleKey: 'tour.steps.readerNotes.title',
    bodyKey: 'tour.steps.readerNotes.body',
    placement: 'bottom',
  },
  {
    id: 'reader-search',
    path: '/reader/view?tourDemo=1',
    targetTourId: 'reader-search',
    titleKey: 'tour.steps.readerSearch.title',
    bodyKey: 'tour.steps.readerSearch.body',
    placement: 'left',
  },
  {
    id: 'references-work',
    path: '/references',
    targetTourId: 'references-work',
    titleKey: 'tour.steps.referencesWork.title',
    bodyKey: 'tour.steps.referencesWork.body',
    placement: 'bottom',
  },
  {
    id: 'notes-list-overview',
    path: '/notes',
    targetTourId: 'notes-list',
    titleKey: 'tour.steps.notesListOverview.title',
    bodyKey: 'tour.steps.notesListOverview.body',
    placement: 'right',
  },
  {
    id: 'notes-overview',
    path: '/notes',
    targetTourId: 'notes-editor',
    titleKey: 'tour.steps.notesOverview.title',
    bodyKey: 'tour.steps.notesOverview.body',
    placement: 'left',
  },
  {
    id: 'maps-overview',
    path: '/maps',
    targetTourId: 'maps-workspace',
    titleKey: 'tour.steps.mapsOverview.title',
    bodyKey: 'tour.steps.mapsOverview.body',
    placement: 'bottom',
  },
  {
    id: 'metadata-overview',
    path: '/metadata',
    targetTourId: 'metadata-queue',
    titleKey: 'tour.steps.metadataOverview.title',
    bodyKey: 'tour.steps.metadataOverview.body',
    placement: 'left',
  },
  {
    id: 'settings-tour',
    path: '/settings',
    targetTourId: 'settings-nav',
    titleKey: 'tour.steps.settingsOptions.title',
    bodyKey: 'tour.steps.settingsOptions.body',
    placement: 'right',
  },
  {
    id: 'settings-tour-button',
    path: '/settings',
    targetTourId: 'settings-tour-button',
    titleKey: 'tour.steps.settingsTour.title',
    bodyKey: 'tour.steps.settingsTour.body',
    placement: 'left',
  },
]
