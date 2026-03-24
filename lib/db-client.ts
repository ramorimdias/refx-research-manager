/**
 * SQLite Database Client for Tauri
 * Provides type-safe database operations using @tauri-apps/plugin-sql
 */

import { isTauri } from './tauri-api'
import type {
  Document,
  Annotation,
  Tag,
  Collection,
  Reference,
  Note,
  ReadingStage,
} from './types'

// Database instance
let db: Database | null = null

// Type definition for the SQL plugin
interface Database {
  execute(query: string, bindValues?: unknown[]): Promise<{ rowsAffected: number; lastInsertId: number }>
  select<T>(query: string, bindValues?: unknown[]): Promise<T[]>
  close(): Promise<void>
}

// Initialize database connection
export async function initDatabase(): Promise<boolean> {
  if (!isTauri()) {
    console.log('Not running in Tauri environment, using mock data')
    return false
  }

  try {
    const SqlPlugin = await import('@tauri-apps/plugin-sql')
    db = await SqlPlugin.default.load('sqlite:refx.db')
    
    // Run migrations
    await runMigrations()
    
    return true
  } catch (error) {
    console.error('Failed to initialize database:', error)
    return false
  }
}

// Run database migrations
async function runMigrations(): Promise<void> {
  if (!db) return

  // Create migrations tracking table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Check if initial schema has been applied
  const applied = await db.select<{ name: string }>(
    'SELECT name FROM migrations WHERE name = ?',
    ['001_initial_schema']
  )

  if (applied.length === 0) {
    // Apply initial schema (the SQL from migrations file)
    const schema = await getInitialSchema()
    const statements = schema.split(';').filter(s => s.trim())
    
    for (const statement of statements) {
      if (statement.trim()) {
        await db.execute(statement)
      }
    }

    // Mark migration as applied
    await db.execute(
      'INSERT INTO migrations (name) VALUES (?)',
      ['001_initial_schema']
    )
  }
}

// Get initial schema SQL
async function getInitialSchema(): Promise<string> {
  // This would normally be loaded from a file, but for simplicity we'll include it inline
  return `
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      authors TEXT,
      abstract TEXT,
      year INTEGER,
      venue TEXT,
      doi TEXT,
      isbn TEXT,
      url TEXT,
      file_path TEXT,
      file_name TEXT,
      file_size INTEGER,
      file_hash TEXT,
      page_count INTEGER,
      reading_stage TEXT DEFAULT 'unread',
      reading_progress INTEGER DEFAULT 0,
      priority TEXT DEFAULT 'normal',
      rating INTEGER,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_opened_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS annotations (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT,
      color TEXT DEFAULT '#ffeb3b',
      page_number INTEGER NOT NULL,
      position_x REAL,
      position_y REAL,
      position_width REAL,
      position_height REAL,
      quote TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#3b82f6',
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS document_tags (
      document_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (document_id, tag_id),
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      parent_id TEXT,
      color TEXT DEFAULT '#6b7280',
      icon TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES collections(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS document_collections (
      document_id TEXT NOT NULL,
      collection_id TEXT NOT NULL,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (document_id, collection_id),
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS references_table (
      id TEXT PRIMARY KEY,
      document_id TEXT,
      type TEXT NOT NULL,
      citation_key TEXT UNIQUE,
      title TEXT NOT NULL,
      authors TEXT,
      year INTEGER,
      journal TEXT,
      volume TEXT,
      issue TEXT,
      pages TEXT,
      publisher TEXT,
      booktitle TEXT,
      doi TEXT,
      url TEXT,
      abstract TEXT,
      keywords TEXT,
      bibtex TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT,
      document_id TEXT,
      is_pinned INTEGER DEFAULT 0,
      color TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    INSERT OR IGNORE INTO tags (id, name, color) VALUES 
      ('tag-to-read', 'To Read', '#ef4444'),
      ('tag-important', 'Important', '#f59e0b'),
      ('tag-review', 'Review', '#3b82f6'),
      ('tag-reference', 'Reference', '#10b981');

    INSERT OR IGNORE INTO collections (id, name, description, color) VALUES 
      ('col-inbox', 'Inbox', 'Uncategorized documents', '#6b7280'),
      ('col-favorites', 'Favorites', 'Your favorite papers', '#ef4444');
  `
}

// ============ Document Operations ============

export async function getAllDocuments(): Promise<Document[]> {
  if (!db) return []
  
  const rows = await db.select<DocumentRow>('SELECT * FROM documents ORDER BY updated_at DESC')
  return rows.map(rowToDocument)
}

export async function getDocumentById(id: string): Promise<Document | null> {
  if (!db) return null
  
  const rows = await db.select<DocumentRow>('SELECT * FROM documents WHERE id = ?', [id])
  if (rows.length === 0) return null
  
  const doc = rowToDocument(rows[0])
  
  // Get tags
  const tags = await getDocumentTags(id)
  doc.tags = tags.map(t => t.name)
  
  return doc
}

export async function createDocument(doc: Partial<Document>): Promise<Document> {
  if (!db) throw new Error('Database not initialized')
  
  const id = doc.id || `doc-${Date.now()}`
  const now = new Date().toISOString()
  
  await db.execute(
    `INSERT INTO documents (id, title, authors, abstract, year, venue, doi, file_path, file_name, page_count, reading_stage, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      doc.title || 'Untitled',
      JSON.stringify(doc.authors || []),
      doc.abstract || null,
      doc.year || null,
      doc.venue || null,
      doc.doi || null,
      doc.filePath || null,
      doc.fileName || null,
      doc.pageCount || null,
      doc.readingStage || 'unread',
      now,
      now
    ]
  )
  
  // Add tags
  if (doc.tags && doc.tags.length > 0) {
    for (const tagName of doc.tags) {
      await addTagToDocument(id, tagName)
    }
  }
  
  return (await getDocumentById(id))!
}

export async function updateDocument(id: string, updates: Partial<Document>): Promise<Document | null> {
  if (!db) return null
  
  const setClauses: string[] = []
  const values: unknown[] = []
  
  if (updates.title !== undefined) {
    setClauses.push('title = ?')
    values.push(updates.title)
  }
  if (updates.authors !== undefined) {
    setClauses.push('authors = ?')
    values.push(JSON.stringify(updates.authors))
  }
  if (updates.abstract !== undefined) {
    setClauses.push('abstract = ?')
    values.push(updates.abstract)
  }
  if (updates.readingStage !== undefined) {
    setClauses.push('reading_stage = ?')
    values.push(updates.readingStage)
  }
  if (updates.readingProgress !== undefined) {
    setClauses.push('reading_progress = ?')
    values.push(updates.readingProgress)
  }
  
  setClauses.push('updated_at = ?')
  values.push(new Date().toISOString())
  values.push(id)
  
  await db.execute(
    `UPDATE documents SET ${setClauses.join(', ')} WHERE id = ?`,
    values
  )
  
  return getDocumentById(id)
}

export async function deleteDocument(id: string): Promise<boolean> {
  if (!db) return false
  
  const result = await db.execute('DELETE FROM documents WHERE id = ?', [id])
  return result.rowsAffected > 0
}

// ============ Tag Operations ============

export async function getAllTags(): Promise<Tag[]> {
  if (!db) return []
  
  const rows = await db.select<{ id: string; name: string; color: string; description: string | null }>(
    'SELECT * FROM tags ORDER BY name'
  )
  
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    color: row.color,
    description: row.description || undefined
  }))
}

export async function getDocumentTags(documentId: string): Promise<Tag[]> {
  if (!db) return []
  
  const rows = await db.select<{ id: string; name: string; color: string }>(
    `SELECT t.* FROM tags t
     INNER JOIN document_tags dt ON t.id = dt.tag_id
     WHERE dt.document_id = ?`,
    [documentId]
  )
  
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    color: row.color
  }))
}

export async function addTagToDocument(documentId: string, tagName: string): Promise<void> {
  if (!db) return
  
  // Find or create tag
  let tagRows = await db.select<{ id: string }>('SELECT id FROM tags WHERE name = ?', [tagName])
  
  if (tagRows.length === 0) {
    const tagId = `tag-${Date.now()}`
    await db.execute('INSERT INTO tags (id, name) VALUES (?, ?)', [tagId, tagName])
    tagRows = [{ id: tagId }]
  }
  
  // Link tag to document
  await db.execute(
    'INSERT OR IGNORE INTO document_tags (document_id, tag_id) VALUES (?, ?)',
    [documentId, tagRows[0].id]
  )
}

export async function removeTagFromDocument(documentId: string, tagId: string): Promise<void> {
  if (!db) return
  
  await db.execute(
    'DELETE FROM document_tags WHERE document_id = ? AND tag_id = ?',
    [documentId, tagId]
  )
}

// ============ Annotation Operations ============

export async function getDocumentAnnotations(documentId: string): Promise<Annotation[]> {
  if (!db) return []
  
  const rows = await db.select<AnnotationRow>(
    'SELECT * FROM annotations WHERE document_id = ? ORDER BY page_number, created_at',
    [documentId]
  )
  
  return rows.map(rowToAnnotation)
}

export async function createAnnotation(annotation: Partial<Annotation>): Promise<Annotation> {
  if (!db) throw new Error('Database not initialized')
  
  const id = annotation.id || `ann-${Date.now()}`
  const now = new Date().toISOString()
  
  await db.execute(
    `INSERT INTO annotations (id, document_id, type, content, color, page_number, quote, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      annotation.documentId,
      annotation.type || 'highlight',
      annotation.content || null,
      annotation.color || '#ffeb3b',
      annotation.pageNumber || 1,
      annotation.quote || null,
      now,
      now
    ]
  )
  
  const rows = await db.select<AnnotationRow>('SELECT * FROM annotations WHERE id = ?', [id])
  return rowToAnnotation(rows[0])
}

export async function deleteAnnotation(id: string): Promise<boolean> {
  if (!db) return false
  
  const result = await db.execute('DELETE FROM annotations WHERE id = ?', [id])
  return result.rowsAffected > 0
}

// ============ Collection Operations ============

export async function getAllCollections(): Promise<Collection[]> {
  if (!db) return []
  
  const rows = await db.select<CollectionRow>('SELECT * FROM collections ORDER BY sort_order, name')
  return rows.map(rowToCollection)
}

export async function getCollectionDocuments(collectionId: string): Promise<Document[]> {
  if (!db) return []
  
  const rows = await db.select<DocumentRow>(
    `SELECT d.* FROM documents d
     INNER JOIN document_collections dc ON d.id = dc.document_id
     WHERE dc.collection_id = ?
     ORDER BY d.updated_at DESC`,
    [collectionId]
  )
  
  return rows.map(rowToDocument)
}

// ============ Note Operations ============

export async function getAllNotes(): Promise<Note[]> {
  if (!db) return []
  
  const rows = await db.select<NoteRow>('SELECT * FROM notes ORDER BY updated_at DESC')
  return rows.map(rowToNote)
}

export async function createNote(note: Partial<Note>): Promise<Note> {
  if (!db) throw new Error('Database not initialized')
  
  const id = note.id || `note-${Date.now()}`
  const now = new Date().toISOString()
  
  await db.execute(
    `INSERT INTO notes (id, title, content, document_id, is_pinned, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      note.title || 'Untitled Note',
      note.content || '',
      note.documentId || null,
      note.isPinned ? 1 : 0,
      now,
      now
    ]
  )
  
  const rows = await db.select<NoteRow>('SELECT * FROM notes WHERE id = ?', [id])
  return rowToNote(rows[0])
}

export async function updateNote(id: string, updates: Partial<Note>): Promise<Note | null> {
  if (!db) return null
  
  const setClauses: string[] = []
  const values: unknown[] = []
  
  if (updates.title !== undefined) {
    setClauses.push('title = ?')
    values.push(updates.title)
  }
  if (updates.content !== undefined) {
    setClauses.push('content = ?')
    values.push(updates.content)
  }
  if (updates.isPinned !== undefined) {
    setClauses.push('is_pinned = ?')
    values.push(updates.isPinned ? 1 : 0)
  }
  
  setClauses.push('updated_at = ?')
  values.push(new Date().toISOString())
  values.push(id)
  
  await db.execute(
    `UPDATE notes SET ${setClauses.join(', ')} WHERE id = ?`,
    values
  )
  
  const rows = await db.select<NoteRow>('SELECT * FROM notes WHERE id = ?', [id])
  return rows.length > 0 ? rowToNote(rows[0]) : null
}

export async function deleteNote(id: string): Promise<boolean> {
  if (!db) return false
  
  const result = await db.execute('DELETE FROM notes WHERE id = ?', [id])
  return result.rowsAffected > 0
}

// ============ Settings Operations ============

export async function getSetting<T>(key: string): Promise<T | null> {
  if (!db) return null
  
  const rows = await db.select<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])
  if (rows.length === 0) return null
  
  try {
    return JSON.parse(rows[0].value) as T
  } catch {
    return rows[0].value as unknown as T
  }
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  if (!db) return
  
  const stringValue = typeof value === 'string' ? value : JSON.stringify(value)
  
  await db.execute(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?`,
    [key, stringValue, new Date().toISOString(), stringValue, new Date().toISOString()]
  )
}

// ============ Stats Operations ============

export async function getLibraryStats(): Promise<{
  totalDocuments: number
  totalAnnotations: number
  totalNotes: number
  byReadingStage: Record<ReadingStage, number>
}> {
  if (!db) {
    return {
      totalDocuments: 0,
      totalAnnotations: 0,
      totalNotes: 0,
      byReadingStage: { unread: 0, skimmed: 0, reading: 0, completed: 0, archived: 0 }
    }
  }
  
  const docCount = await db.select<{ count: number }>('SELECT COUNT(*) as count FROM documents')
  const annCount = await db.select<{ count: number }>('SELECT COUNT(*) as count FROM annotations')
  const noteCount = await db.select<{ count: number }>('SELECT COUNT(*) as count FROM notes')
  
  const stageRows = await db.select<{ reading_stage: string; count: number }>(
    'SELECT reading_stage, COUNT(*) as count FROM documents GROUP BY reading_stage'
  )
  
  const byReadingStage: Record<ReadingStage, number> = {
    unread: 0,
    skimmed: 0,
    reading: 0,
    completed: 0,
    archived: 0
  }
  
  for (const row of stageRows) {
    if (row.reading_stage in byReadingStage) {
      byReadingStage[row.reading_stage as ReadingStage] = row.count
    }
  }
  
  return {
    totalDocuments: docCount[0]?.count || 0,
    totalAnnotations: annCount[0]?.count || 0,
    totalNotes: noteCount[0]?.count || 0,
    byReadingStage
  }
}

// ============ Row Type Definitions ============

interface DocumentRow {
  id: string
  title: string
  authors: string | null
  abstract: string | null
  year: number | null
  venue: string | null
  doi: string | null
  file_path: string | null
  file_name: string | null
  file_size: number | null
  page_count: number | null
  reading_stage: string
  reading_progress: number
  created_at: string
  updated_at: string
  last_opened_at: string | null
}

interface AnnotationRow {
  id: string
  document_id: string
  type: string
  content: string | null
  color: string
  page_number: number
  quote: string | null
  created_at: string
  updated_at: string
}

interface CollectionRow {
  id: string
  name: string
  description: string | null
  parent_id: string | null
  color: string
  icon: string | null
  sort_order: number
}

interface NoteRow {
  id: string
  title: string
  content: string | null
  document_id: string | null
  is_pinned: number
  created_at: string
  updated_at: string
}

// ============ Row to Entity Converters ============

function rowToDocument(row: DocumentRow): Document {
  return {
    id: row.id,
    title: row.title,
    authors: row.authors ? JSON.parse(row.authors) : [],
    abstract: row.abstract || undefined,
    year: row.year || undefined,
    venue: row.venue || undefined,
    doi: row.doi || undefined,
    filePath: row.file_path || undefined,
    fileName: row.file_name || undefined,
    pageCount: row.page_count || undefined,
    readingStage: row.reading_stage as ReadingStage,
    readingProgress: row.reading_progress,
    tags: [],
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    annotationCount: 0
  }
}

function rowToAnnotation(row: AnnotationRow): Annotation {
  return {
    id: row.id,
    documentId: row.document_id,
    type: row.type as Annotation['type'],
    content: row.content || undefined,
    color: row.color,
    pageNumber: row.page_number,
    quote: row.quote || undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  }
}

function rowToCollection(row: CollectionRow): Collection {
  return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    parentId: row.parent_id || undefined,
    color: row.color,
    documentCount: 0
  }
}

function rowToNote(row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    content: row.content || '',
    documentId: row.document_id || undefined,
    isPinned: row.is_pinned === 1,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    tags: []
  }
}

// Close database connection
export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.close()
    db = null
  }
}
