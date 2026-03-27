use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Command;
use tauri::{AppHandle, Manager};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("DB error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("Path error: could not resolve app data directory")]
    PathError,
    #[error("{0}")]
    Validation(String),
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
    pub document_type: String,
    pub title: String,
    pub authors: String,
    pub tags: Vec<String>,
    pub year: Option<i64>,
    pub abstract_text: Option<String>,
    pub doi: Option<String>,
    pub isbn: Option<String>,
    pub publisher: Option<String>,
    pub citation_key: Option<String>,
    pub source_path: Option<String>,
    pub imported_file_path: Option<String>,
    pub extracted_text_path: Option<String>,
    pub search_text: Option<String>,
    pub text_hash: Option<String>,
    pub text_extracted_at: Option<String>,
    pub text_extraction_status: String,
    pub page_count: Option<i64>,
    pub has_extracted_text: bool,
    pub has_ocr: bool,
    pub has_ocr_text: bool,
    pub ocr_status: String,
    pub metadata_status: String,
    pub metadata_provenance: Option<String>,
    pub metadata_user_edited_fields: Option<String>,
    pub indexing_status: String,
    pub tag_suggestions: Option<String>,
    pub rejected_tag_suggestions: Option<String>,
    pub tag_suggestion_text_hash: Option<String>,
    pub tag_suggestion_status: String,
    pub classification_result: Option<String>,
    pub classification_text_hash: Option<String>,
    pub classification_status: String,
    pub processing_error: Option<String>,
    pub processing_updated_at: Option<String>,
    pub last_processed_at: Option<String>,
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
    pub page_number: Option<i64>,
    pub location_hint: Option<String>,
    pub comment_number: Option<i64>,
    pub position_x: Option<f64>,
    pub position_y: Option<f64>,
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
pub struct UpdateLibraryInput {
    pub name: Option<String>,
    pub description: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDocumentInput {
    pub id: Option<String>,
    pub library_id: String,
    pub document_type: Option<String>,
    pub title: String,
    pub authors: Option<String>,
    pub year: Option<i64>,
    pub abstract_text: Option<String>,
    pub doi: Option<String>,
    pub isbn: Option<String>,
    pub publisher: Option<String>,
    pub citation_key: Option<String>,
    pub source_path: Option<String>,
    pub imported_file_path: Option<String>,
    pub extracted_text_path: Option<String>,
    pub search_text: Option<String>,
    pub text_hash: Option<String>,
    pub text_extracted_at: Option<String>,
    pub text_extraction_status: Option<String>,
    pub page_count: Option<i64>,
    pub has_extracted_text: Option<bool>,
    pub has_ocr: Option<bool>,
    pub has_ocr_text: Option<bool>,
    pub ocr_status: Option<String>,
    pub metadata_status: Option<String>,
    pub metadata_provenance: Option<String>,
    pub metadata_user_edited_fields: Option<String>,
    pub indexing_status: Option<String>,
    pub tag_suggestions: Option<String>,
    pub rejected_tag_suggestions: Option<String>,
    pub tag_suggestion_text_hash: Option<String>,
    pub tag_suggestion_status: Option<String>,
    pub classification_result: Option<String>,
    pub classification_text_hash: Option<String>,
    pub classification_status: Option<String>,
    pub processing_error: Option<String>,
    pub processing_updated_at: Option<String>,
    pub last_processed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDocumentInput {
    pub document_type: Option<String>,
    pub title: Option<String>,
    pub authors: Option<String>,
    pub source_path: Option<String>,
    pub imported_file_path: Option<String>,
    pub extracted_text_path: Option<String>,
    pub search_text: Option<String>,
    pub text_hash: Option<String>,
    pub text_extracted_at: Option<String>,
    pub text_extraction_status: Option<String>,
    pub page_count: Option<i64>,
    pub has_extracted_text: Option<bool>,
    pub has_ocr_text: Option<bool>,
    pub year: Option<i64>,
    pub abstract_text: Option<String>,
    pub doi: Option<String>,
    pub isbn: Option<String>,
    pub publisher: Option<String>,
    pub citation_key: Option<String>,
    pub metadata_status: Option<String>,
    pub metadata_provenance: Option<String>,
    pub metadata_user_edited_fields: Option<String>,
    pub indexing_status: Option<String>,
    pub tag_suggestions: Option<String>,
    pub rejected_tag_suggestions: Option<String>,
    pub tag_suggestion_text_hash: Option<String>,
    pub tag_suggestion_status: Option<String>,
    pub classification_result: Option<String>,
    pub classification_text_hash: Option<String>,
    pub classification_status: Option<String>,
    pub processing_error: Option<String>,
    pub processing_updated_at: Option<String>,
    pub last_processed_at: Option<String>,
    pub reading_stage: Option<String>,
    pub rating: Option<i64>,
    pub favorite: Option<bool>,
    pub has_ocr: Option<bool>,
    pub ocr_status: Option<String>,
    pub last_opened_at: Option<String>,
    pub last_read_page: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNoteInput {
    pub document_id: Option<String>,
    pub page_number: Option<i64>,
    pub location_hint: Option<String>,
    pub comment_number: Option<i64>,
    pub position_x: Option<f64>,
    pub position_y: Option<f64>,
    pub title: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateNoteInput {
    pub page_number: Option<i64>,
    pub location_hint: Option<String>,
    pub comment_number: Option<i64>,
    pub position_x: Option<f64>,
    pub position_y: Option<f64>,
    pub title: Option<String>,
    pub content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetSettingsInput {
    pub values: HashMap<String, String>,
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

fn ensure_column(conn: &Connection, table: &str, column: &str, definition: &str) -> Result<(), AppError> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
    let columns: Vec<String> = rows.filter_map(Result::ok).collect();
    if !columns.iter().any(|existing| existing == column) {
        conn.execute(&format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"), [])?;
    }
    Ok(())
}

fn document_tags(conn: &Connection, document_id: &str) -> Result<Vec<String>, AppError> {
    let mut stmt = conn.prepare(
        r#"SELECT tags.name
           FROM tags
           INNER JOIN document_tags ON document_tags.tag_id = tags.id
           WHERE document_tags.document_id = ?1
           ORDER BY tags.name"#,
    )?;
    let rows = stmt.query_map(params![document_id], |row| row.get::<_, String>(0))?;
    Ok(rows.filter_map(Result::ok).collect())
}

fn get_library_by_id(conn: &Connection, id: &str) -> Result<Option<Library>, AppError> {
    let library = conn
        .query_row(
            "SELECT id, name, description, color, created_at, updated_at FROM libraries WHERE id = ?1",
            params![id],
            |r| {
                Ok(Library {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    description: r.get(2)?,
                    color: r.get(3)?,
                    created_at: r.get(4)?,
                    updated_at: r.get(5)?,
                })
            },
        )
        .optional()?;
    Ok(library)
}

fn next_document_comment_number(conn: &Connection, document_id: &str) -> Result<i64, AppError> {
    let max_comment_number: Option<i64> = conn
        .query_row(
            "SELECT MAX(comment_number) FROM notes WHERE document_id = ?1",
            params![document_id],
            |row| row.get(0),
        )
        .optional()?
        .flatten();

    Ok(max_comment_number.unwrap_or(0) + 1)
}

fn backfill_document_comment_numbers(conn: &Connection) -> Result<(), AppError> {
    let mut stmt = conn.prepare(
        r#"SELECT id, document_id, comment_number
           FROM notes
           WHERE document_id IS NOT NULL
           ORDER BY document_id, created_at, id"#,
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<i64>>(2)?,
        ))
    })?;

    let mut next_numbers: HashMap<String, i64> = HashMap::new();
    for row in rows {
        let (note_id, document_id, existing_comment_number) = row?;
        let next_number = next_numbers.entry(document_id.clone()).or_insert(1);

        if let Some(existing_value) = existing_comment_number {
            *next_number = (*next_number).max(existing_value + 1);
            continue;
        }

        conn.execute(
            "UPDATE notes SET comment_number = ?1 WHERE id = ?2",
            params![*next_number, note_id],
        )?;
        *next_number += 1;
    }

    Ok(())
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
        base_path.join("document-text"),
        base_path.join("search"),
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
  document_type TEXT NOT NULL DEFAULT 'pdf',
  title TEXT NOT NULL,
  authors TEXT DEFAULT '[]',
  year INTEGER,
  abstract TEXT,
  doi TEXT,
  isbn TEXT,
  publisher TEXT,
  citation_key TEXT,
  source_path TEXT,
  imported_file_path TEXT,
  extracted_text_path TEXT,
  search_text TEXT,
  text_hash TEXT,
  text_extracted_at TEXT,
  text_extraction_status TEXT NOT NULL DEFAULT 'pending',
  page_count INTEGER,
  has_extracted_text INTEGER DEFAULT 0,
  has_ocr INTEGER DEFAULT 0,
  has_ocr_text INTEGER DEFAULT 0,
  ocr_status TEXT DEFAULT 'pending',
  metadata_status TEXT DEFAULT 'missing',
  metadata_provenance TEXT,
  metadata_user_edited_fields TEXT,
  indexing_status TEXT DEFAULT 'pending',
  tag_suggestions TEXT,
  rejected_tag_suggestions TEXT,
  tag_suggestion_text_hash TEXT,
  tag_suggestion_status TEXT DEFAULT 'pending',
  classification_result TEXT,
  classification_text_hash TEXT,
  classification_status TEXT DEFAULT 'pending',
  processing_error TEXT,
  processing_updated_at TEXT,
  last_processed_at TEXT,
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
  page_number INTEGER,
  location_hint TEXT,
  comment_number INTEGER,
  position_x REAL,
  position_y REAL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_library_id ON documents(library_id);
CREATE INDEX IF NOT EXISTS idx_notes_document_id ON notes(document_id);
CREATE INDEX IF NOT EXISTS idx_annotations_document_id ON annotations(document_id);
        "#,
    )?;

    ensure_column(&conn, "documents", "search_text", "TEXT")?;
    ensure_column(&conn, "documents", "extracted_text_path", "TEXT")?;
    ensure_column(&conn, "documents", "text_hash", "TEXT")?;
    ensure_column(&conn, "documents", "text_extracted_at", "TEXT")?;
    ensure_column(&conn, "documents", "text_extraction_status", "TEXT NOT NULL DEFAULT 'pending'")?;
    ensure_column(&conn, "documents", "indexing_status", "TEXT NOT NULL DEFAULT 'pending'")?;
    ensure_column(&conn, "documents", "tag_suggestion_status", "TEXT NOT NULL DEFAULT 'pending'")?;
    ensure_column(&conn, "documents", "classification_result", "TEXT")?;
    ensure_column(&conn, "documents", "classification_text_hash", "TEXT")?;
    ensure_column(&conn, "documents", "classification_status", "TEXT NOT NULL DEFAULT 'pending'")?;
    ensure_column(&conn, "documents", "metadata_provenance", "TEXT")?;
    ensure_column(&conn, "documents", "metadata_user_edited_fields", "TEXT")?;
    ensure_column(&conn, "documents", "processing_error", "TEXT")?;
    ensure_column(&conn, "documents", "processing_updated_at", "TEXT")?;
    ensure_column(&conn, "documents", "last_processed_at", "TEXT")?;
    ensure_column(&conn, "documents", "tag_suggestions", "TEXT")?;
    ensure_column(&conn, "documents", "rejected_tag_suggestions", "TEXT")?;
    ensure_column(&conn, "documents", "tag_suggestion_text_hash", "TEXT")?;
    ensure_column(&conn, "documents", "has_extracted_text", "INTEGER NOT NULL DEFAULT 0")?;
    ensure_column(&conn, "documents", "has_ocr_text", "INTEGER NOT NULL DEFAULT 0")?;
    ensure_column(&conn, "documents", "document_type", "TEXT NOT NULL DEFAULT 'pdf'")?;
    ensure_column(&conn, "documents", "isbn", "TEXT")?;
    ensure_column(&conn, "documents", "publisher", "TEXT")?;
    ensure_column(&conn, "notes", "page_number", "INTEGER")?;
    ensure_column(&conn, "notes", "location_hint", "TEXT")?;
    ensure_column(&conn, "notes", "comment_number", "INTEGER")?;
    ensure_column(&conn, "notes", "position_x", "REAL")?;
    ensure_column(&conn, "notes", "position_y", "REAL")?;
    backfill_document_comment_numbers(&conn)?;
    conn.execute(
        "UPDATE documents SET metadata_status = 'missing' WHERE metadata_status IS NULL OR metadata_status = '' OR metadata_status = 'incomplete'",
        [],
    )?;
    conn.execute(
        "UPDATE documents SET metadata_status = 'complete' WHERE metadata_status = 'verified'",
        [],
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
pub fn update_library(
    app: AppHandle,
    id: String,
    input: UpdateLibraryInput,
) -> Result<Option<Library>, AppError> {
    let conn = open_db(&app)?;
    let now = now_iso();
    conn.execute(
        r#"UPDATE libraries SET
          name = COALESCE(?1, name),
          description = COALESCE(?2, description),
          color = COALESCE(?3, color),
          updated_at = ?4
          WHERE id = ?5"#,
        params![input.name, input.description, input.color, now, id],
    )?;

    get_library_by_id(&conn, &id)
}

#[tauri::command]
pub fn delete_library(app: AppHandle, id: String) -> Result<bool, AppError> {
    let conn = open_db(&app)?;
    let library_count: i64 = conn.query_row("SELECT COUNT(*) FROM libraries", [], |r| r.get(0))?;
    if library_count <= 1 {
        return Err(AppError::Validation(
            "At least one library must remain.".to_string(),
        ));
    }

    let mut text_stmt = conn.prepare(
        "SELECT extracted_text_path FROM documents WHERE library_id = ?1 AND extracted_text_path IS NOT NULL",
    )?;
    let text_rows = text_stmt.query_map(params![id.clone()], |row| row.get::<_, String>(0))?;
    let extracted_text_paths: Vec<String> = text_rows.filter_map(Result::ok).collect();

    let rows = conn.execute("DELETE FROM libraries WHERE id = ?1", params![id.clone()])?;
    if rows == 0 {
        return Ok(false);
    }

    let base_path = app.path().app_data_dir().map_err(|_| AppError::PathError)?;
    let library_dir = base_path.join("pdfs").join(id);
    if library_dir.exists() {
        std::fs::remove_dir_all(library_dir)?;
    }

    for path in extracted_text_paths {
        let extracted_text_file = std::path::PathBuf::from(path);
        if extracted_text_file.exists() {
            std::fs::remove_file(extracted_text_file)?;
        }
    }

    Ok(true)
}

#[tauri::command]
pub fn open_document_file_location(path: String) -> Result<(), AppError> {
    let target = std::path::PathBuf::from(&path);
    if !target.exists() {
        return Err(AppError::Validation(format!(
            "File not found: {}",
            target.to_string_lossy()
        )));
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(format!("/select,{}", target.to_string_lossy()))
            .spawn()?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open").arg("-R").arg(&target).spawn()?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let directory = target.parent().ok_or_else(|| {
            AppError::Validation("Could not resolve the parent directory.".to_string())
        })?;
        Command::new("xdg-open").arg(directory).spawn()?;
    }

    Ok(())
}

#[tauri::command]
pub fn list_documents_by_library(
    app: AppHandle,
    library_id: String,
) -> Result<Vec<Document>, AppError> {
    let conn = open_db(&app)?;
    let mut stmt = conn.prepare(r#"SELECT id, library_id, document_type, title, authors, year, abstract, doi, isbn, publisher, citation_key, source_path, imported_file_path, extracted_text_path, search_text, text_hash, text_extracted_at, text_extraction_status, page_count, has_extracted_text, has_ocr, has_ocr_text, ocr_status, metadata_status, metadata_provenance, metadata_user_edited_fields, indexing_status, tag_suggestions, rejected_tag_suggestions, tag_suggestion_text_hash, tag_suggestion_status, classification_result, classification_text_hash, classification_status, processing_error, processing_updated_at, last_processed_at, reading_stage, rating, favorite, last_opened_at, last_read_page, created_at, updated_at FROM documents WHERE library_id = ?1 ORDER BY updated_at DESC"#)?;
    let rows = stmt.query_map(params![library_id], map_document_row)?;
    let mut documents = Vec::new();
    for row in rows {
        let mut document = row?;
        document.tags = document_tags(&conn, &document.id)?;
        documents.push(document);
    }
    Ok(documents)
}

#[tauri::command]
pub fn list_all_documents(app: AppHandle) -> Result<Vec<Document>, AppError> {
    let conn = open_db(&app)?;
    let mut stmt = conn.prepare(r#"SELECT id, library_id, document_type, title, authors, year, abstract, doi, isbn, publisher, citation_key, source_path, imported_file_path, extracted_text_path, search_text, text_hash, text_extracted_at, text_extraction_status, page_count, has_extracted_text, has_ocr, has_ocr_text, ocr_status, metadata_status, metadata_provenance, metadata_user_edited_fields, indexing_status, tag_suggestions, rejected_tag_suggestions, tag_suggestion_text_hash, tag_suggestion_status, classification_result, classification_text_hash, classification_status, processing_error, processing_updated_at, last_processed_at, reading_stage, rating, favorite, last_opened_at, last_read_page, created_at, updated_at FROM documents ORDER BY updated_at DESC"#)?;
    let rows = stmt.query_map([], map_document_row)?;
    let mut documents = Vec::new();
    for row in rows {
        let mut document = row?;
        document.tags = document_tags(&conn, &document.id)?;
        documents.push(document);
    }
    Ok(documents)
}

#[tauri::command]
pub fn get_document_by_id(app: AppHandle, id: String) -> Result<Option<Document>, AppError> {
    let conn = open_db(&app)?;
    let mut stmt = conn.prepare(r#"SELECT id, library_id, document_type, title, authors, year, abstract, doi, isbn, publisher, citation_key, source_path, imported_file_path, extracted_text_path, search_text, text_hash, text_extracted_at, text_extraction_status, page_count, has_extracted_text, has_ocr, has_ocr_text, ocr_status, metadata_status, metadata_provenance, metadata_user_edited_fields, indexing_status, tag_suggestions, rejected_tag_suggestions, tag_suggestion_text_hash, tag_suggestion_status, classification_result, classification_text_hash, classification_status, processing_error, processing_updated_at, last_processed_at, reading_stage, rating, favorite, last_opened_at, last_read_page, created_at, updated_at FROM documents WHERE id = ?1"#)?;
    let doc = stmt.query_row(params![id], map_document_row).optional()?;
    match doc {
        Some(mut document) => {
            document.tags = document_tags(&conn, &document.id)?;
            Ok(Some(document))
        }
        None => Ok(None),
    }
}

fn map_document_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Document> {
    Ok(Document {
        id: row.get(0)?,
        library_id: row.get(1)?,
        document_type: row.get(2)?,
        title: row.get(3)?,
        authors: row.get(4)?,
        tags: Vec::new(),
        year: row.get(5)?,
        abstract_text: row.get(6)?,
        doi: row.get(7)?,
        isbn: row.get(8)?,
        publisher: row.get(9)?,
        citation_key: row.get(10)?,
        source_path: row.get(11)?,
        imported_file_path: row.get(12)?,
        extracted_text_path: row.get(13)?,
        search_text: row.get(14)?,
        text_hash: row.get(15)?,
        text_extracted_at: row.get(16)?,
        text_extraction_status: row.get(17)?,
        page_count: row.get(18)?,
        has_extracted_text: row.get::<_, i64>(19)? == 1,
        has_ocr: row.get::<_, i64>(20)? == 1,
        has_ocr_text: row.get::<_, i64>(21)? == 1,
        ocr_status: row.get(22)?,
        metadata_status: row.get(23)?,
        metadata_provenance: row.get(24)?,
        metadata_user_edited_fields: row.get(25)?,
        indexing_status: row.get(26)?,
        tag_suggestions: row.get(27)?,
        rejected_tag_suggestions: row.get(28)?,
        tag_suggestion_text_hash: row.get(29)?,
        tag_suggestion_status: row.get(30)?,
        classification_result: row.get(31)?,
        classification_text_hash: row.get(32)?,
        classification_status: row.get(33)?,
        processing_error: row.get(34)?,
        processing_updated_at: row.get(35)?,
        last_processed_at: row.get(36)?,
        reading_stage: row.get(37)?,
        rating: row.get(38)?,
        favorite: row.get::<_, i64>(39)? == 1,
        last_opened_at: row.get(40)?,
        last_read_page: row.get(41)?,
        created_at: row.get(42)?,
        updated_at: row.get(43)?,
    })
}

#[tauri::command]
pub fn create_document(app: AppHandle, input: CreateDocumentInput) -> Result<Document, AppError> {
    let conn = open_db(&app)?;
    let id = input
        .id
        .unwrap_or_else(|| format!("doc-{}", uuid::Uuid::new_v4()));
    let now = now_iso();
    let document_type = input.document_type.unwrap_or("pdf".into());
    let authors = input.authors.unwrap_or("[]".into());
    let text_extraction_status = input.text_extraction_status.unwrap_or("pending".into());
    let ocr_status = input.ocr_status.unwrap_or("pending".into());
    let metadata_status = input.metadata_status.unwrap_or("missing".into());
    let indexing_status = input.indexing_status.unwrap_or("pending".into());
    let tag_suggestion_status = input.tag_suggestion_status.unwrap_or("pending".into());
    let classification_status = input.classification_status.unwrap_or("pending".into());
    conn.execute(
        r#"INSERT INTO documents (id, library_id, document_type, title, authors, year, abstract, doi, isbn, publisher, citation_key, source_path, imported_file_path, extracted_text_path, search_text, text_hash, text_extracted_at, text_extraction_status, page_count, has_extracted_text, has_ocr, has_ocr_text, ocr_status, metadata_status, metadata_provenance, metadata_user_edited_fields, indexing_status, tag_suggestions, rejected_tag_suggestions, tag_suggestion_text_hash, tag_suggestion_status, classification_result, classification_text_hash, classification_status, processing_error, processing_updated_at, last_processed_at, reading_stage, rating, favorite, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32, ?33, ?34, ?35, ?36, ?37, ?38, 'unread', 0, 0, ?39, ?39)"#,
        params![
            id,
            input.library_id,
            document_type,
            input.title,
            authors,
            input.year,
            input.abstract_text,
            input.doi,
            input.isbn,
            input.publisher,
            input.citation_key,
            input.source_path,
            input.imported_file_path,
            input.extracted_text_path,
            input.search_text,
            input.text_hash,
            input.text_extracted_at,
            text_extraction_status,
            input.page_count,
            input.has_extracted_text.map(|b| if b { 1 } else { 0 }).unwrap_or(0),
            input.has_ocr.map(|b| if b { 1 } else { 0 }).unwrap_or(0),
            input.has_ocr_text.map(|b| if b { 1 } else { 0 }).unwrap_or(0),
            ocr_status,
            metadata_status,
            input.metadata_provenance,
            input.metadata_user_edited_fields,
            indexing_status,
            input.tag_suggestions,
            input.rejected_tag_suggestions,
            input.tag_suggestion_text_hash,
            tag_suggestion_status,
            input.classification_result,
            input.classification_text_hash,
            classification_status,
            input.processing_error,
            input.processing_updated_at,
            input.last_processed_at,
            now
        ],
    )?;
    get_document_by_id(app, id)?.ok_or(rusqlite::Error::QueryReturnedNoRows.into())
}

#[tauri::command]
pub fn update_document_metadata(
    app: AppHandle,
    id: String,
    input: UpdateDocumentInput,
) -> Result<Option<Document>, AppError> {
    let conn = open_db(&app)?;
    let now = now_iso();
    conn.execute(
        r#"UPDATE documents SET
          title = COALESCE(?1, title),
          document_type = COALESCE(?2, document_type),
          authors = COALESCE(?3, authors),
          source_path = COALESCE(?4, source_path),
          imported_file_path = COALESCE(?5, imported_file_path),
          extracted_text_path = COALESCE(?6, extracted_text_path),
          search_text = COALESCE(?7, search_text),
          text_hash = COALESCE(?8, text_hash),
          text_extracted_at = COALESCE(?9, text_extracted_at),
          text_extraction_status = COALESCE(?10, text_extraction_status),
          page_count = COALESCE(?11, page_count),
          has_extracted_text = COALESCE(?12, has_extracted_text),
          has_ocr = COALESCE(?13, has_ocr),
          has_ocr_text = COALESCE(?14, has_ocr_text),
          ocr_status = COALESCE(?15, ocr_status),
          year = COALESCE(?16, year),
          abstract = COALESCE(?17, abstract),
          doi = COALESCE(?18, doi),
          isbn = COALESCE(?19, isbn),
          publisher = COALESCE(?20, publisher),
          citation_key = COALESCE(?21, citation_key),
          metadata_status = COALESCE(?22, metadata_status),
          metadata_provenance = COALESCE(?23, metadata_provenance),
          metadata_user_edited_fields = COALESCE(?24, metadata_user_edited_fields),
          indexing_status = COALESCE(?25, indexing_status),
          tag_suggestions = COALESCE(?26, tag_suggestions),
          rejected_tag_suggestions = COALESCE(?27, rejected_tag_suggestions),
          tag_suggestion_text_hash = COALESCE(?28, tag_suggestion_text_hash),
          tag_suggestion_status = COALESCE(?29, tag_suggestion_status),
          classification_result = COALESCE(?30, classification_result),
          classification_text_hash = COALESCE(?31, classification_text_hash),
          classification_status = COALESCE(?32, classification_status),
          processing_error = COALESCE(?33, processing_error),
          processing_updated_at = COALESCE(?34, processing_updated_at),
          last_processed_at = COALESCE(?35, last_processed_at),
          reading_stage = COALESCE(?36, reading_stage),
          rating = COALESCE(?37, rating),
          favorite = COALESCE(?38, favorite),
          last_opened_at = COALESCE(?39, last_opened_at),
          last_read_page = COALESCE(?40, last_read_page),
          updated_at = ?41
          WHERE id = ?42"#,
        params![
            input.title,
            input.document_type,
            input.authors,
            input.source_path,
            input.imported_file_path,
            input.extracted_text_path,
            input.search_text,
            input.text_hash,
            input.text_extracted_at,
            input.text_extraction_status,
            input.page_count,
            input.has_extracted_text.map(|b| if b { 1 } else { 0 }),
            input.has_ocr.map(|b| if b { 1 } else { 0 }),
            input.has_ocr_text.map(|b| if b { 1 } else { 0 }),
            input.ocr_status,
            input.year,
            input.abstract_text,
            input.doi,
            input.isbn,
            input.publisher,
            input.citation_key,
            input.metadata_status,
            input.metadata_provenance,
            input.metadata_user_edited_fields,
            input.indexing_status,
            input.tag_suggestions,
            input.rejected_tag_suggestions,
            input.tag_suggestion_text_hash,
            input.tag_suggestion_status,
            input.classification_result,
            input.classification_text_hash,
            input.classification_status,
            input.processing_error,
            input.processing_updated_at,
            input.last_processed_at,
            input.reading_stage,
            input.rating,
            input.favorite.map(|b| if b { 1 } else { 0 }),
            input.last_opened_at,
            input.last_read_page,
            now,
            id
        ],
    )?;
    get_document_by_id(app, id)
}

#[tauri::command]
pub fn delete_document(app: AppHandle, id: String) -> Result<bool, AppError> {
    let conn = open_db(&app)?;
    let (imported_file_path, extracted_text_path): (Option<String>, Option<String>) = conn
        .query_row(
            "SELECT imported_file_path, extracted_text_path FROM documents WHERE id = ?1",
            params![id.clone()],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?
        .unwrap_or((None, None));
    let rows = conn.execute("DELETE FROM documents WHERE id = ?1", params![id])?;
    if rows > 0 {
        if let Some(path) = imported_file_path {
            let local_file = std::path::PathBuf::from(path);
            if local_file.exists() {
                std::fs::remove_file(local_file)?;
            }
        }
        if let Some(path) = extracted_text_path {
            let extracted_text_file = std::path::PathBuf::from(path);
            if extracted_text_file.exists() {
                std::fs::remove_file(extracted_text_file)?;
            }
        }
    }
    Ok(rows > 0)
}

#[tauri::command]
pub fn move_documents_to_library(
    app: AppHandle,
    document_ids: Vec<String>,
    target_library_id: String,
) -> Result<Vec<Document>, AppError> {
    let unique_document_ids: Vec<String> = document_ids
        .into_iter()
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect();

    if unique_document_ids.is_empty() {
        return Ok(Vec::new());
    }

    let mut conn = open_db(&app)?;
    let target_library_exists: Option<String> = conn
        .query_row(
            "SELECT id FROM libraries WHERE id = ?1",
            params![target_library_id.clone()],
            |row| row.get(0),
        )
        .optional()?;

    if target_library_exists.is_none() {
        return Err(AppError::Validation(
            "Target library was not found.".to_string(),
        ));
    }

    let base_path = app.path().app_data_dir().map_err(|_| AppError::PathError)?;
    let target_library_dir = base_path.join("pdfs").join(&target_library_id);
    std::fs::create_dir_all(&target_library_dir)?;

    let now = now_iso();
    let tx = conn.transaction()?;
    let mut moved_ids = Vec::new();

    for document_id in unique_document_ids {
        let document_row: Option<(String, Option<String>)> = tx
            .query_row(
                "SELECT library_id, imported_file_path FROM documents WHERE id = ?1",
                params![document_id.clone()],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;

        let Some((current_library_id, imported_file_path)) = document_row else {
            continue;
        };

        if current_library_id == target_library_id {
            continue;
        }

        let mut next_imported_file_path = imported_file_path.clone();
        if let Some(current_path) = imported_file_path {
            let current_file_path = std::path::PathBuf::from(&current_path);
            if current_file_path.exists() {
                let extension = current_file_path
                    .extension()
                    .and_then(|value| value.to_str())
                    .unwrap_or("pdf");
                let target_file_path =
                    target_library_dir.join(format!("{}.{}", document_id, extension));

                if current_file_path != target_file_path {
                    if let Some(parent) = target_file_path.parent() {
                        std::fs::create_dir_all(parent)?;
                    }
                    if target_file_path.exists() {
                        std::fs::remove_file(&target_file_path)?;
                    }
                    std::fs::rename(&current_file_path, &target_file_path)?;
                }

                next_imported_file_path =
                    Some(target_file_path.to_string_lossy().to_string());
            }
        }

        tx.execute(
            r#"UPDATE documents SET
              library_id = ?1,
              imported_file_path = COALESCE(?2, imported_file_path),
              updated_at = ?3
              WHERE id = ?4"#,
            params![
                target_library_id.clone(),
                next_imported_file_path,
                now.clone(),
                document_id.clone()
            ],
        )?;

        moved_ids.push(document_id);
    }

    tx.commit()?;

    let mut moved_documents = Vec::new();
    for document_id in moved_ids {
        if let Some(document) = get_document_by_id(app.clone(), document_id)? {
            moved_documents.push(document);
        }
    }

    Ok(moved_documents)
}

#[tauri::command]
pub fn add_tag_to_document(
    app: AppHandle,
    document_id: String,
    tag_name: String,
) -> Result<(), AppError> {
    let conn = open_db(&app)?;
    let existing: Option<String> = conn
        .query_row(
            "SELECT id FROM tags WHERE name = ?1",
            params![tag_name],
            |r| r.get(0),
        )
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
pub fn remove_tag_from_document(
    app: AppHandle,
    document_id: String,
    tag_name: String,
) -> Result<(), AppError> {
    let conn = open_db(&app)?;
    let tag_id: Option<String> = conn
        .query_row(
            "SELECT id FROM tags WHERE name = ?1",
            params![tag_name],
            |r| r.get(0),
        )
        .optional()?;

    let Some(tag_id) = tag_id else {
        return Ok(());
    };

    conn.execute(
        "DELETE FROM document_tags WHERE document_id = ?1 AND tag_id = ?2",
        params![document_id, tag_id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn list_annotations_for_document(
    app: AppHandle,
    document_id: String,
) -> Result<Vec<Annotation>, AppError> {
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
pub fn list_all_annotations(app: AppHandle) -> Result<Vec<Annotation>, AppError> {
    let conn = open_db(&app)?;
    let mut stmt = conn.prepare(
        "SELECT id, document_id, page_number, kind, content, created_at FROM annotations ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([], |r| {
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
    let document_id = input.document_id;
    let page_number = input.page_number;
    let location_hint = input.location_hint;
    let position_x = input.position_x;
    let position_y = input.position_y;
    let title = input.title;
    let content = input.content;
    let comment_number = match (&document_id, input.comment_number) {
        (_, Some(value)) => Some(value),
        (Some(document_id), None) => Some(next_document_comment_number(&conn, document_id)?),
        (None, None) => None,
    };
    conn.execute(
        "INSERT INTO notes (id, document_id, page_number, location_hint, comment_number, position_x, position_y, title, content, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            id,
            document_id,
            page_number,
            location_hint,
            comment_number,
            position_x,
            position_y,
            title,
            content,
            now,
            now
        ],
    )?;
    Ok(Note {
        id,
        document_id,
        page_number,
        location_hint,
        comment_number,
        position_x,
        position_y,
        title,
        content,
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub fn update_note(
    app: AppHandle,
    id: String,
    input: UpdateNoteInput,
) -> Result<Option<Note>, AppError> {
    let conn = open_db(&app)?;
    let now = now_iso();
    conn.execute(
        r#"UPDATE notes SET
          page_number = COALESCE(?1, page_number),
          location_hint = COALESCE(?2, location_hint),
          comment_number = COALESCE(?3, comment_number),
          position_x = COALESCE(?4, position_x),
          position_y = COALESCE(?5, position_y),
          title = COALESCE(?6, title),
          content = COALESCE(?7, content),
          updated_at = ?8
          WHERE id = ?9"#,
        params![
            input.page_number,
            input.location_hint,
            input.comment_number,
            input.position_x,
            input.position_y,
            input.title,
            input.content,
            now,
            id
        ],
    )?;

    let note = conn
        .query_row(
            "SELECT id, document_id, page_number, location_hint, comment_number, position_x, position_y, title, content, created_at, updated_at FROM notes WHERE id = ?1",
            params![id],
            |r| {
                Ok(Note {
                    id: r.get(0)?,
                    document_id: r.get(1)?,
                    page_number: r.get(2)?,
                    location_hint: r.get(3)?,
                    comment_number: r.get(4)?,
                    position_x: r.get(5)?,
                    position_y: r.get(6)?,
                    title: r.get(7)?,
                    content: r.get(8)?,
                    created_at: r.get(9)?,
                    updated_at: r.get(10)?,
                })
            },
        )
        .optional()?;

    Ok(note)
}

#[tauri::command]
pub fn list_notes(app: AppHandle) -> Result<Vec<Note>, AppError> {
    let conn = open_db(&app)?;
    let mut stmt = conn.prepare("SELECT id, document_id, page_number, location_hint, comment_number, position_x, position_y, title, content, created_at, updated_at FROM notes ORDER BY updated_at DESC")?;
    let rows = stmt.query_map([], |r| {
        Ok(Note {
            id: r.get(0)?,
            document_id: r.get(1)?,
            page_number: r.get(2)?,
            location_hint: r.get(3)?,
            comment_number: r.get(4)?,
            position_x: r.get(5)?,
            position_y: r.get(6)?,
            title: r.get(7)?,
            content: r.get(8)?,
            created_at: r.get(9)?,
            updated_at: r.get(10)?,
        })
    })?;
    Ok(rows.filter_map(Result::ok).collect())
}

#[tauri::command]
pub fn delete_note(app: AppHandle, id: String) -> Result<bool, AppError> {
    let conn = open_db(&app)?;
    let rows = conn.execute("DELETE FROM notes WHERE id = ?1", params![id])?;
    Ok(rows > 0)
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Result<HashMap<String, String>, AppError> {
    let conn = open_db(&app)?;
    let mut stmt = conn.prepare("SELECT key, value FROM settings ORDER BY key")?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
    let mut settings = HashMap::new();
    for row in rows {
        let (key, value) = row?;
        settings.insert(key, value);
    }
    Ok(settings)
}

#[tauri::command]
pub fn set_settings(app: AppHandle, input: SetSettingsInput) -> Result<(), AppError> {
    let conn = open_db(&app)?;
    let now = now_iso();

    for (key, value) in input.values {
        conn.execute(
            r#"INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"#,
            params![key, value, now],
        )?;
    }

    Ok(())
}

#[tauri::command]
pub fn clear_local_data(app: AppHandle) -> Result<(), AppError> {
    let conn = open_db(&app)?;
    conn.execute("DELETE FROM document_tags", [])?;
    conn.execute("DELETE FROM annotations", [])?;
    conn.execute("DELETE FROM notes", [])?;
    conn.execute("DELETE FROM tags", [])?;
    conn.execute("DELETE FROM documents", [])?;
    conn.execute("DELETE FROM libraries", [])?;

    let base_path = app.path().app_data_dir().map_err(|_| AppError::PathError)?;
    for dir_name in ["pdfs", "document-text", "search", "thumbnails", "exports", "backups"] {
        let dir = base_path.join(dir_name);
        if dir.exists() {
            std::fs::remove_dir_all(&dir)?;
        }
        std::fs::create_dir_all(&dir)?;
    }

    let now = now_iso();
    conn.execute(
        "INSERT INTO libraries (id, name, description, color, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params!["lib-default", "My Library", "Default local library", "#3b82f6", now, now],
    )?;

    Ok(())
}
