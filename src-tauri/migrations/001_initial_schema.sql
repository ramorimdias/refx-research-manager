-- Refx Database Schema
-- Initial migration for SQLite database

-- Documents table - stores PDF metadata and reading state
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  authors TEXT, -- JSON array of author names
  abstract TEXT,
  year INTEGER,
  venue TEXT,
  doi TEXT,
  isbn TEXT,
  url TEXT,
  file_path TEXT, -- Relative path within app data
  file_name TEXT,
  file_size INTEGER,
  file_hash TEXT, -- SHA-256 hash for deduplication
  page_count INTEGER,
  reading_stage TEXT DEFAULT 'unread' CHECK (reading_stage IN ('unread', 'skimmed', 'reading', 'completed', 'archived')),
  reading_progress INTEGER DEFAULT 0,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  rating INTEGER CHECK (rating >= 0 AND rating <= 5),
  notes TEXT, -- Quick notes/summary
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_opened_at DATETIME
);

-- Annotations table - highlights, notes, bookmarks
CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('highlight', 'note', 'underline', 'bookmark', 'comment')),
  content TEXT, -- The highlighted/noted text or comment content
  color TEXT DEFAULT '#ffeb3b',
  page_number INTEGER NOT NULL,
  position_x REAL,
  position_y REAL,
  position_width REAL,
  position_height REAL,
  quote TEXT, -- Original text being annotated
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

-- Tags table - user-defined categorization
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#3b82f6',
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Document-Tags junction table
CREATE TABLE IF NOT EXISTS document_tags (
  document_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (document_id, tag_id),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- Collections/Folders - hierarchical organization
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

-- Document-Collections junction table
CREATE TABLE IF NOT EXISTS document_collections (
  document_id TEXT NOT NULL,
  collection_id TEXT NOT NULL,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (document_id, collection_id),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
);

-- References table - citation/bibliography data
CREATE TABLE IF NOT EXISTS references (
  id TEXT PRIMARY KEY,
  document_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('article', 'book', 'inproceedings', 'thesis', 'report', 'misc', 'online')),
  citation_key TEXT UNIQUE,
  title TEXT NOT NULL,
  authors TEXT, -- JSON array
  year INTEGER,
  journal TEXT,
  volume TEXT,
  issue TEXT,
  chapter TEXT,
  pages TEXT,
  publisher TEXT,
  booktitle TEXT, -- For conference papers
  doi TEXT,
  url TEXT,
  abstract TEXT,
  is_manual INTEGER NOT NULL DEFAULT 0,
  keywords TEXT, -- JSON array
  bibtex TEXT, -- Raw BibTeX entry
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL
);

-- Notes table - standalone research notes
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT, -- Markdown content
  document_id TEXT, -- Optional link to document
  is_pinned INTEGER DEFAULT 0,
  color TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL
);

-- Note-Tags junction table
CREATE TABLE IF NOT EXISTS note_tags (
  note_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (note_id, tag_id),
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- Reading sessions - track reading activity
CREATE TABLE IF NOT EXISTS reading_sessions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  started_at DATETIME NOT NULL,
  ended_at DATETIME,
  start_page INTEGER,
  end_page INTEGER,
  duration_seconds INTEGER,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

-- Settings table - key-value store for preferences
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_documents_reading_stage ON documents(reading_stage);
CREATE INDEX IF NOT EXISTS idx_documents_year ON documents(year);
CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents(updated_at);
CREATE INDEX IF NOT EXISTS idx_annotations_document_id ON annotations(document_id);
CREATE INDEX IF NOT EXISTS idx_annotations_type ON annotations(type);
CREATE INDEX IF NOT EXISTS idx_document_tags_document_id ON document_tags(document_id);
CREATE INDEX IF NOT EXISTS idx_document_tags_tag_id ON document_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_collections_parent_id ON collections(parent_id);
CREATE INDEX IF NOT EXISTS idx_references_citation_key ON references(citation_key);
CREATE INDEX IF NOT EXISTS idx_notes_document_id ON notes(document_id);
CREATE INDEX IF NOT EXISTS idx_reading_sessions_document_id ON reading_sessions(document_id);

-- Insert default settings
INSERT OR IGNORE INTO settings (key, value) VALUES 
  ('theme', '"system"'),
  ('sidebar_collapsed', 'false'),
  ('default_reading_stage', '"unread"'),
  ('pdf_zoom', '100'),
  ('show_annotations', 'true'),
  ('auto_backup', 'true'),
  ('backup_interval_days', '7');

-- Insert some default tags
INSERT OR IGNORE INTO tags (id, name, color) VALUES 
  ('tag-to-read', 'To Read', '#ef4444'),
  ('tag-important', 'Important', '#f59e0b'),
  ('tag-review', 'Review', '#3b82f6'),
  ('tag-reference', 'Reference', '#10b981');

-- Insert default collection
INSERT OR IGNORE INTO collections (id, name, description, color) VALUES 
  ('col-inbox', 'Inbox', 'Uncategorized documents', '#6b7280'),
  ('col-favorites', 'Favorites', 'Your favorite papers', '#ef4444');
