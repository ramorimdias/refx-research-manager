import { create } from 'zustand'
import type {
  Document,
  Library,
  Annotation,
  DocumentFilters,
  DocumentSort,
  ViewMode,
  Tag,
  Note,
  Collection,
} from './types'
import {
  mockLibraries,
  mockDocuments,
  mockAnnotations,
} from './mock-data'
import { isTauri } from './tauri-api'
import * as db from './db-client'

interface AppState {
  // Initialization state
  initialized: boolean
  isDesktopApp: boolean
  
  // Active selections
  activeLibraryId: string | null
  activeDocumentId: string | null
  
  // View state
  sidebarCollapsed: boolean
  rightPanelOpen: boolean
  viewMode: ViewMode
  
  // Document filters and sorting
  filters: DocumentFilters
  sort: DocumentSort
  
  // Command palette
  commandPaletteOpen: boolean
  
  // PDF Reader state
  currentPage: number
  zoom: number
  annotationMode: 'select' | 'highlight' | 'note' | 'bookmark' | null
  
  // Data
  libraries: Library[]
  documents: Document[]
  annotations: Annotation[]
  tags: Tag[]
  notes: Note[]
  collections: Collection[]
  
  // Actions
  initialize: () => Promise<void>
  setActiveLibrary: (id: string | null) => void
  setActiveDocument: (id: string | null) => void
  toggleSidebar: () => void
  toggleRightPanel: () => void
  setViewMode: (mode: ViewMode) => void
  setFilters: (filters: DocumentFilters) => void
  setSort: (sort: DocumentSort) => void
  toggleCommandPalette: () => void
  setCurrentPage: (page: number) => void
  setZoom: (zoom: number) => void
  setAnnotationMode: (mode: 'select' | 'highlight' | 'note' | 'bookmark' | null) => void
  
  // Document actions
  addDocument: (document: Partial<Document>) => Promise<Document | null>
  updateDocument: (id: string, updates: Partial<Document>) => Promise<void>
  deleteDocument: (id: string) => Promise<void>
  toggleFavorite: (documentId: string) => void
  
  // Annotation actions
  addAnnotation: (annotation: Partial<Annotation>) => Promise<Annotation | null>
  deleteAnnotation: (id: string) => Promise<void>
  
  // Note actions
  addNote: (note: Partial<Note>) => Promise<Note | null>
  updateNote: (id: string, updates: Partial<Note>) => Promise<void>
  deleteNote: (id: string) => Promise<void>
  
  // Data loading
  loadDocuments: () => Promise<void>
  loadTags: () => Promise<void>
  loadNotes: () => Promise<void>
  loadCollections: () => Promise<void>
  importDocuments: () => Promise<number>
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  initialized: false,
  isDesktopApp: false,
  activeLibraryId: null,
  activeDocumentId: null,
  sidebarCollapsed: false,
  rightPanelOpen: true,
  viewMode: 'table',
  filters: {},
  sort: { field: 'addedAt', direction: 'desc' },
  commandPaletteOpen: false,
  currentPage: 1,
  zoom: 100,
  annotationMode: null,
  
  // Initial data (will be populated on init)
  libraries: [],
  documents: [],
  annotations: [],
  tags: [],
  notes: [],
  collections: [],
  
  // Initialize the store
  initialize: async () => {
    const isDesktop = isTauri()
    
    if (isDesktop) {
      // Initialize Tauri APIs and database
      const { initTauriApis } = await import('./tauri-api')
      const { initFileService } = await import('./file-service')
      
      await initTauriApis()
      await db.initDatabase()
      await initFileService()
      
      // Load data from database
      const documents = await db.getAllDocuments()
      const tags = await db.getAllTags()
      const notes = await db.getAllNotes()
      const collections = await db.getAllCollections()
      
      set({
        initialized: true,
        isDesktopApp: true,
        documents,
        tags,
        notes,
        collections,
        libraries: [], // Collections replace libraries in desktop mode
      })
    } else {
      // Web mode - use mock data
      set({
        initialized: true,
        isDesktopApp: false,
        libraries: mockLibraries,
        documents: mockDocuments,
        annotations: mockAnnotations,
        tags: [],
        notes: [],
        collections: [],
      })
    }
  },
  
  // Actions
  setActiveLibrary: (id) => set({ activeLibraryId: id }),
  setActiveDocument: (id) => set({ activeDocumentId: id }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
  setViewMode: (mode) => set({ viewMode: mode }),
  setFilters: (filters) => set({ filters }),
  setSort: (sort) => set({ sort }),
  toggleCommandPalette: () => set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
  setCurrentPage: (page) => set({ currentPage: page }),
  setZoom: (zoom) => set({ zoom }),
  setAnnotationMode: (mode) => set({ annotationMode: mode }),
  
  // Document actions
  addDocument: async (document) => {
    const { isDesktopApp } = get()
    
    if (isDesktopApp) {
      const newDoc = await db.createDocument(document)
      if (newDoc) {
        set((state) => ({
          documents: [newDoc, ...state.documents],
        }))
        return newDoc
      }
      return null
    } else {
      // Mock mode - add to state directly
      const newDoc: Document = {
        id: `doc-${Date.now()}`,
        title: document.title || 'Untitled',
        authors: document.authors || [],
        abstract: document.abstract,
        year: document.year,
        venue: document.venue,
        doi: document.doi,
        tags: document.tags || [],
        readingStage: document.readingStage || 'unread',
        readingProgress: 0,
        annotationCount: 0,
        addedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        rating: 0,
      }
      set((state) => ({
        documents: [newDoc, ...state.documents],
      }))
      return newDoc
    }
  },
  
  updateDocument: async (id, updates) => {
    const { isDesktopApp } = get()
    
    if (isDesktopApp) {
      await db.updateDocument(id, updates)
    }
    
    set((state) => ({
      documents: state.documents.map((doc) =>
        doc.id === id ? { ...doc, ...updates, updatedAt: new Date() } : doc
      ),
    }))
  },
  
  deleteDocument: async (id) => {
    const { isDesktopApp } = get()
    
    if (isDesktopApp) {
      await db.deleteDocument(id)
      const { deleteDocumentFile } = await import('./file-service')
      await deleteDocumentFile(id)
    }
    
    set((state) => ({
      documents: state.documents.filter((doc) => doc.id !== id),
      annotations: state.annotations.filter((ann) => ann.documentId !== id),
    }))
  },
  
  toggleFavorite: (documentId) => {
    set((state) => ({
      documents: state.documents.map((doc) =>
        doc.id === documentId ? { ...doc, favorite: !doc.favorite } : doc
      ),
    }))
  },
  
  // Annotation actions
  addAnnotation: async (annotation) => {
    const { isDesktopApp } = get()
    
    if (isDesktopApp) {
      const newAnn = await db.createAnnotation(annotation)
      if (newAnn) {
        set((state) => ({
          annotations: [...state.annotations, newAnn],
          documents: state.documents.map((doc) =>
            doc.id === annotation.documentId
              ? { ...doc, annotationCount: doc.annotationCount + 1 }
              : doc
          ),
        }))
        return newAnn
      }
      return null
    } else {
      const newAnn: Annotation = {
        id: `ann-${Date.now()}`,
        documentId: annotation.documentId || '',
        type: annotation.type || 'highlight',
        content: annotation.content,
        color: annotation.color || '#ffeb3b',
        pageNumber: annotation.pageNumber || 1,
        quote: annotation.quote,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      set((state) => ({
        annotations: [...state.annotations, newAnn],
        documents: state.documents.map((doc) =>
          doc.id === annotation.documentId
            ? { ...doc, annotationCount: doc.annotationCount + 1 }
            : doc
        ),
      }))
      return newAnn
    }
  },
  
  deleteAnnotation: async (id) => {
    const { isDesktopApp, annotations } = get()
    const annotation = annotations.find((a) => a.id === id)
    
    if (isDesktopApp) {
      await db.deleteAnnotation(id)
    }
    
    set((state) => ({
      annotations: state.annotations.filter((ann) => ann.id !== id),
      documents: state.documents.map((doc) =>
        doc.id === annotation?.documentId
          ? { ...doc, annotationCount: Math.max(0, doc.annotationCount - 1) }
          : doc
      ),
    }))
  },
  
  // Note actions
  addNote: async (note) => {
    const { isDesktopApp } = get()
    
    if (isDesktopApp) {
      const newNote = await db.createNote(note)
      if (newNote) {
        set((state) => ({
          notes: [newNote, ...state.notes],
        }))
        return newNote
      }
      return null
    } else {
      const newNote: Note = {
        id: `note-${Date.now()}`,
        title: note.title || 'Untitled',
        content: note.content || '',
        documentId: note.documentId,
        isPinned: note.isPinned || false,
        tags: note.tags || [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      set((state) => ({
        notes: [newNote, ...state.notes],
      }))
      return newNote
    }
  },
  
  updateNote: async (id, updates) => {
    const { isDesktopApp } = get()
    
    if (isDesktopApp) {
      await db.updateNote(id, updates)
    }
    
    set((state) => ({
      notes: state.notes.map((note) =>
        note.id === id ? { ...note, ...updates, updatedAt: new Date() } : note
      ),
    }))
  },
  
  deleteNote: async (id) => {
    const { isDesktopApp } = get()
    
    if (isDesktopApp) {
      await db.deleteNote(id)
    }
    
    set((state) => ({
      notes: state.notes.filter((note) => note.id !== id),
    }))
  },
  
  // Data loading
  loadDocuments: async () => {
    const { isDesktopApp } = get()
    
    if (isDesktopApp) {
      const documents = await db.getAllDocuments()
      set({ documents })
    }
  },
  
  loadTags: async () => {
    const { isDesktopApp } = get()
    
    if (isDesktopApp) {
      const tags = await db.getAllTags()
      set({ tags })
    }
  },
  
  loadNotes: async () => {
    const { isDesktopApp } = get()
    
    if (isDesktopApp) {
      const notes = await db.getAllNotes()
      set({ notes })
    }
  },
  
  loadCollections: async () => {
    const { isDesktopApp } = get()
    
    if (isDesktopApp) {
      const collections = await db.getAllCollections()
      set({ collections })
    }
  },

  importDocuments: async () => {
    const { isDesktopApp } = get()

    if (!isDesktopApp) {
      return 0
    }

    try {
      const { importMultiplePdfFiles } = await import('./file-service')
      const importedDocuments = await importMultiplePdfFiles()

      if (importedDocuments.length > 0) {
        set((state) => ({
          documents: [...importedDocuments, ...state.documents],
        }))
      }

      return importedDocuments.length
    } catch (error) {
      console.error('Failed to import documents:', error)
      return 0
    }
  },
}))

// Selectors
export const useActiveLibrary = () => {
  const { activeLibraryId, libraries } = useAppStore()
  return libraries.find((lib) => lib.id === activeLibraryId)
}

export const useActiveDocument = () => {
  const { activeDocumentId, documents } = useAppStore()
  return documents.find((doc) => doc.id === activeDocumentId)
}

export const useFilteredDocuments = () => {
  const { documents, filters, sort, activeLibraryId } = useAppStore()
  
  let filtered = [...documents]
  
  // Filter by library
  if (activeLibraryId) {
    filtered = filtered.filter((doc) => doc.libraryId === activeLibraryId)
  }
  
  // Apply search filter
  if (filters.search) {
    const search = filters.search.toLowerCase()
    filtered = filtered.filter(
      (doc) =>
        doc.title.toLowerCase().includes(search) ||
        doc.authors.some((a) => a.toLowerCase().includes(search)) ||
        doc.abstract?.toLowerCase().includes(search)
    )
  }
  
  // Apply tag filter
  if (filters.tags && filters.tags.length > 0) {
    filtered = filtered.filter((doc) =>
      filters.tags!.some((tag) => doc.tags.includes(tag))
    )
  }
  
  // Apply reading stage filter
  if (filters.readingStage && filters.readingStage.length > 0) {
    filtered = filtered.filter((doc) =>
      filters.readingStage!.includes(doc.readingStage)
    )
  }
  
  // Apply metadata status filter
  if (filters.metadataStatus && filters.metadataStatus.length > 0) {
    filtered = filtered.filter((doc) =>
      filters.metadataStatus!.includes(doc.metadataStatus)
    )
  }
  
  // Apply year filter
  if (filters.year) {
    if (filters.year.min) {
      filtered = filtered.filter((doc) => doc.year && doc.year >= filters.year!.min!)
    }
    if (filters.year.max) {
      filtered = filtered.filter((doc) => doc.year && doc.year <= filters.year!.max!)
    }
  }
  
  // Apply favorite filter
  if (filters.favorite) {
    filtered = filtered.filter((doc) => doc.favorite)
  }
  
  // Apply annotations filter
  if (filters.hasAnnotations) {
    filtered = filtered.filter((doc) => doc.annotationCount > 0)
  }
  
  // Sort
  filtered.sort((a, b) => {
    let comparison = 0
    switch (sort.field) {
      case 'title':
        comparison = a.title.localeCompare(b.title)
        break
      case 'authors':
        comparison = (a.authors[0] || '').localeCompare(b.authors[0] || '')
        break
      case 'year':
        comparison = (a.year || 0) - (b.year || 0)
        break
      case 'addedAt':
        comparison = (a.addedAt?.getTime() || 0) - (b.addedAt?.getTime() || 0)
        break
      case 'lastOpenedAt':
        comparison = (a.lastOpenedAt?.getTime() || 0) - (b.lastOpenedAt?.getTime() || 0)
        break
      case 'rating':
        comparison = (a.rating || 0) - (b.rating || 0)
        break
    }
    return sort.direction === 'asc' ? comparison : -comparison
  })
  
  return filtered
}

export const useDocumentAnnotations = (documentId: string) => {
  const { annotations } = useAppStore()
  return annotations.filter((ann) => ann.documentId === documentId)
}
