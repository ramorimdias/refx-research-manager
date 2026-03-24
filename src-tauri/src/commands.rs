use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("DB error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("Path error: could not resolve app data directory")]
    PathError,
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Library {
    pub id: String,
    pub name: String,
    pub description: String,
    pub color: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub id: String,
    pub library_id: String,
    pub title: String,
    pub authors: String,
    pub year: Option<i64>,
    pub abstract_text: Option<String>,
    pub doi: Option<String>,
    pub citation_key: Option<String>,
    pub source_path: Option<String>,
    pub imported_file_path: Option<String>,
    pub page_count: Option<i64>,
    pub has_ocr: bool,
    pub ocr_status: String,
    pub metadata_status: String,
    pub reading_stage: String,
    pub rating: i64,
    pub favorite: bool,
    pub last_opened_at: Option<String>,
    pub last_read_page: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub document_id: Option<String>,
    pub title: String,
    pub content: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Annotation {
    pub id: String,
    pub document_id: String,
    pub page_number: i64,
    pub kind: String,
    pub content: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateLibraryInput {
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDocumentInput {
    pub id: Option<String>,
    pub library_id: String,
    pub title: String,
    pub authors: Option<String>,
    pub year: Option<i64>,
    pub abstract_text: Option<String>,
    pub doi: Option<String>,
    pub citation_key: Option<String>,
    pub source_path: Option<String>,
    pub imported_file_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDocumentInput {
    pub title: Option<String>,
    pub authors: Option<String>,
    pub year: Option<i64>,
    pub abstract_text: Option<String>,
    pub doi: Option<String>,
    pub citation_key: Option<String>,
    pub metadata_status: Option<String>,
    pub reading_stage: Option<String>,
    pub rating: Option<i64>,
    pub favorite: Option<bool>,
    pub last_opened_at: Option<String>,
    pub last_read_page: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNoteInput {
    pub document_id: Option<String>,
    pub title: String,
    pub content: String,
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn db_path(app: &AppHandle) -> Result<std::path::PathBuf, AppError> {
    let base = app.path().app_data_dir().map_err(|_| AppError::PathError)?;
    Ok(base.join("refx.db"))
}

fn open_db(app: &AppHandle) -> Result<Connection, AppError> {
    let path = db_path(app)?;
    let conn = Connection::open(path)?;
    conn.execute("PRAGMA foreign_keys = ON", [])?;
    Ok(conn)
}

/// Get the application data directory path
#[tauri::command]
pub fn get_app_data_dir(app: AppHandle) -> Result<String, AppError> {
    let path = app.path().app_data_dir().map_err(|_| AppError::PathError)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn ensure_app_directories(app: AppHandle) -> Result<(), AppError> {
    setup_app_directories(&app).await
}

#[tauri::command]
pub fn generate_document_id() -> String {
    format!("doc-{}", uuid::Uuid::new_v4())
}

pub async fn setup_app_directories(app: &AppHandle) -> Result<(), AppError> {
    let base_path = app.path().app_data_dir().map_err(|_| AppError::PathError)?;

    for dir in [
        base_path.clone(),
        base_path.join("pdfs"),
        base_path.join("thumbnails"),
        base_path.join("exports"),
        base_path.join("backups"),
    ] {
        if !dir.exists() {
            std::fs::create_dir_all(dir)?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn initialize_database(app: AppHandle) -> Result<(), AppError> {
    let conn = open_db(&app)?;

    conn.execute_batch(
        r#"
CREATE TABLE IF NOT EXISTS libraries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  color TEXT DEFAULT '#3b82f6',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  library_id TEXT NOT NULL,
  title TEXT NOT NULL,
  authors TEXT DEFAULT '[]',
  year INTEGER,
  abstract TEXT,
  doi TEXT,
  citation_key TEXT,
  source_path TEXT,
  imported_file_path TEXT,
  page_count INTEGER,
  has_ocr INTEGER DEFAULT 0,
  ocr_status TEXT DEFAULT 'pending',
  metadata_status TEXT DEFAULT 'incomplete',
  reading_stage TEXT DEFAULT 'unread',
  rating INTEGER DEFAULT 0,
  favorite INTEGER DEFAULT 0,
  last_opened_at TEXT,
  last_read_page INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#64748b',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS document_tags (
  document_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (document_id, tag_id),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  page_number INTEGER NOT NULL,
  kind TEXT NOT NULL,
  content TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  document_id TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_library_id ON documents(library_id);
CREATE INDEX IF NOT EXISTS idx_notes_document_id ON notes(document_id);
CREATE INDEX IF NOT EXISTS idx_annotations_document_id ON annotations(document_id);
        "#,
    )?;

    let count: i64 = conn.query_row("SELECT COUNT(*) FROM libraries", [], |r| r.get(0))?;
    if count == 0 {
        let now = now_iso();
        conn.execute(
            "INSERT INTO libraries (id, name, description, color, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params!["lib-default", "My Library", "Default local library", "#3b82f6", now, now],
        )?;
    }

    Ok(())
}

#[tauri::command]
pub fn list_libraries(app: AppHandle) -> Result<Vec<Library>, AppError> {
    let conn = open_db(&app)?;
    let mut stmt = conn.prepare("SELECT id, name, description, color, created_at, updated_at FROM libraries ORDER BY created_at")?;
    let rows = stmt.query_map([], |r| {
        Ok(Library {
            id: r.get(0)?,
            name: r.get(1)?,
            description: r.get(2)?,
            color: r.get(3)?,
            created_at: r.get(4)?,
            updated_at: r.get(5)?,
        })
    })?;
    Ok(rows.filter_map(Result::ok).collect())
}

#[tauri::command]
pub fn create_library(app: AppHandle, input: CreateLibraryInput) -> Result<Library, AppError> {
    let conn = open_db(&app)?;
    let id = format!("lib-{}", uuid::Uuid::new_v4());
    let now = now_iso();
    let name = input.name;
    let description = input.description.unwrap_or_default();
    let color = input.color.unwrap_or("#3b82f6".into());
    conn.execute(
        "INSERT INTO libraries (id, name, description, color, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, name, description, color, now, now],
    )?;
    Ok(Library {
        id,
        name,
        description,
        color,
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub fn list_documents_by_library(app: AppHandle, library_id: String) -> Result<Vec<Document>, AppError> {
    let conn = open_db(&app)?;
    let mut stmt = conn.prepare(r#"SELECT id, library_id, title, authors, year, abstract, doi, citation_key, source_path, imported_file_path, page_count, has_ocr, ocr_status, metadata_status, reading_stage, rating, favorite, last_opened_at, last_read_page, created_at, updated_at FROM documents WHERE library_id = ?1 ORDER BY updated_at DESC"#)?;
    let rows = stmt.query_map(params![library_id], map_document_row)?;
    Ok(rows.filter_map(Result::ok).collect())
}

#[tauri::command]
pub fn get_document_by_id(app: AppHandle, id: String) -> Result<Option<Document>, AppError> {
    let conn = open_db(&app)?;
    let mut stmt = conn.prepare(r#"SELECT id, library_id, title, authors, year, abstract, doi, citation_key, source_path, imported_file_path, page_count, has_ocr, ocr_status, metadata_status, reading_stage, rating, favorite, last_opened_at, last_read_page, created_at, updated_at FROM documents WHERE id = ?1"#)?;
    let doc = stmt.query_row(params![id], map_document_row).optional()?;
    Ok(doc)
}

fn map_document_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Document> {
    Ok(Document {
        id: row.get(0)?,
        library_id: row.get(1)?,
        title: row.get(2)?,
        authors: row.get(3)?,
        year: row.get(4)?,
        abstract_text: row.get(5)?,
        doi: row.get(6)?,
        citation_key: row.get(7)?,
        source_path: row.get(8)?,
        imported_file_path: row.get(9)?,
        page_count: row.get(10)?,
        has_ocr: row.get::<_, i64>(11)? == 1,
        ocr_status: row.get(12)?,
        metadata_status: row.get(13)?,
        reading_stage: row.get(14)?,
        rating: row.get(15)?,
        favorite: row.get::<_, i64>(16)? == 1,
        last_opened_at: row.get(17)?,
        last_read_page: row.get(18)?,
        created_at: row.get(19)?,
        updated_at: row.get(20)?,
    })
}

#[tauri::command]
pub fn create_document(app: AppHandle, input: CreateDocumentInput) -> Result<Document, AppError> {
    let conn = open_db(&app)?;
    let id = input.id.unwrap_or_else(|| format!("doc-{}", uuid::Uuid::new_v4()));
    let now = now_iso();
    conn.execute(
        r#"INSERT INTO documents (id, library_id, title, authors, year, abstract, doi, citation_key, source_path, imported_file_path, page_count, has_ocr, ocr_status, metadata_status, reading_stage, rating, favorite, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, NULL, 0, 'pending', 'incomplete', 'unread', 0, 0, ?11, ?11)"#,
        params![id, input.library_id, input.title, input.authors.unwrap_or("[]".into()), input.year, input.abstract_text, input.doi, input.citation_key, input.source_path, input.imported_file_path, now],
    )?;
    get_document_by_id(app, id)?.ok_or(rusqlite::Error::QueryReturnedNoRows.into())
}

#[tauri::command]
pub fn update_document_metadata(app: AppHandle, id: String, input: UpdateDocumentInput) -> Result<Option<Document>, AppError> {
    let conn = open_db(&app)?;
    let now = now_iso();
    conn.execute(
        r#"UPDATE documents SET
          title = COALESCE(?1, title),
          authors = COALESCE(?2, authors),
          year = COALESCE(?3, year),
          abstract = COALESCE(?4, abstract),
          doi = COALESCE(?5, doi),
          citation_key = COALESCE(?6, citation_key),
          metadata_status = COALESCE(?7, metadata_status),
          reading_stage = COALESCE(?8, reading_stage),
          rating = COALESCE(?9, rating),
          favorite = COALESCE(?10, favorite),
          last_opened_at = COALESCE(?11, last_opened_at),
          last_read_page = COALESCE(?12, last_read_page),
          updated_at = ?13
          WHERE id = ?14"#,
        params![input.title, input.authors, input.year, input.abstract_text, input.doi, input.citation_key, input.metadata_status, input.reading_stage, input.rating, input.favorite.map(|b| if b { 1 } else { 0 }), input.last_opened_at, input.last_read_page, now, id],
    )?;
    get_document_by_id(app, id)
}

#[tauri::command]
pub fn delete_document(app: AppHandle, id: String) -> Result<bool, AppError> {
    let conn = open_db(&app)?;
    let rows = conn.execute("DELETE FROM documents WHERE id = ?1", params![id])?;
    Ok(rows > 0)
}

#[tauri::command]
pub fn add_tag_to_document(app: AppHandle, document_id: String, tag_name: String) -> Result<(), AppError> {
    let conn = open_db(&app)?;
    let existing: Option<String> = conn
        .query_row("SELECT id FROM tags WHERE name = ?1", params![tag_name], |r| r.get(0))
        .optional()?;
    let tag_id = match existing {
        Some(id) => id,
        None => {
            let generated_id = format!("tag-{}", uuid::Uuid::new_v4());
            conn.execute(
                "INSERT INTO tags (id, name, created_at) VALUES (?1, ?2, ?3)",
                params![generated_id, tag_name, now_iso()],
            )?;
            generated_id
        }
    };
    conn.execute(
        "INSERT OR IGNORE INTO document_tags (document_id, tag_id) VALUES (?1, ?2)",
        params![document_id, tag_id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn remove_tag_from_document(app: AppHandle, document_id: String, tag_id: String) -> Result<(), AppError> {
    let conn = open_db(&app)?;
    conn.execute(
        "DELETE FROM document_tags WHERE document_id = ?1 AND tag_id = ?2",
        params![document_id, tag_id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn list_annotations_for_document(app: AppHandle, document_id: String) -> Result<Vec<Annotation>, AppError> {
    let conn = open_db(&app)?;
    let mut stmt = conn.prepare("SELECT id, document_id, page_number, kind, content, created_at FROM annotations WHERE document_id = ?1 ORDER BY created_at DESC")?;
    let rows = stmt.query_map(params![document_id], |r| {
        Ok(Annotation {
            id: r.get(0)?,
            document_id: r.get(1)?,
            page_number: r.get(2)?,
            kind: r.get(3)?,
            content: r.get(4)?,
            created_at: r.get(5)?,
        })
    })?;
    Ok(rows.filter_map(Result::ok).collect())
}

#[tauri::command]
pub fn create_note(app: AppHandle, input: CreateNoteInput) -> Result<Note, AppError> {
    let conn = open_db(&app)?;
    let id = format!("note-{}", uuid::Uuid::new_v4());
    let now = now_iso();
    conn.execute(
        "INSERT INTO notes (id, document_id, title, content, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, input.document_id, input.title, input.content, now, now],
    )?;
    Ok(Note { id, document_id: input.document_id, title: input.title, content: input.content, created_at: now.clone(), updated_at: now })
}

#[tauri::command]
pub fn list_notes(app: AppHandle) -> Result<Vec<Note>, AppError> {
    let conn = open_db(&app)?;
    let mut stmt = conn.prepare("SELECT id, document_id, title, content, created_at, updated_at FROM notes ORDER BY updated_at DESC")?;
    let rows = stmt.query_map([], |r| {
        Ok(Note {
            id: r.get(0)?,
            document_id: r.get(1)?,
            title: r.get(2)?,
            content: r.get(3)?,
            created_at: r.get(4)?,
            updated_at: r.get(5)?,
        })
    })?;
    Ok(rows.filter_map(Result::ok).collect())
}
