use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashMap};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream, UdpSocket};
use std::path::PathBuf;
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Manager};
use base64::Engine;

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
    pub commentary_text: Option<String>,
    pub commentary_updated_at: Option<String>,
    pub cover_image_path: Option<String>,
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
pub struct DocumentRelation {
    pub id: String,
    pub source_document_id: String,
    pub target_document_id: String,
    pub link_type: String,
    pub link_origin: String,
    pub relation_status: Option<String>,
    pub confidence: Option<f64>,
    pub label: Option<String>,
    pub notes: Option<String>,
    pub match_method: Option<String>,
    pub raw_reference_text: Option<String>,
    pub normalized_reference_text: Option<String>,
    pub normalized_title: Option<String>,
    pub normalized_first_author: Option<String>,
    pub reference_index: Option<i64>,
    pub parse_confidence: Option<f64>,
    pub parse_warnings: Option<String>,
    pub match_debug_info: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentDoiReference {
    pub id: String,
    pub source_document_id: String,
    pub doi: String,
    pub matched_document_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphView {
    pub id: String,
    pub library_id: String,
    pub name: String,
    pub description: Option<String>,
    pub relation_filter: String,
    pub color_mode: String,
    pub size_mode: String,
    pub scope_mode: String,
    pub neighborhood_depth: String,
    pub focus_mode: bool,
    pub hide_orphans: bool,
    pub confidence_threshold: f64,
    pub year_min: Option<i64>,
    pub year_max: Option<i64>,
    pub selected_document_id: Option<String>,
    pub document_ids_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphViewNodeLayout {
    pub graph_view_id: String,
    pub document_id: String,
    pub position_x: f64,
    pub position_y: f64,
    pub pinned: bool,
    pub hidden: bool,
    pub updated_at: String,
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
    pub commentary_text: Option<String>,
    pub commentary_updated_at: Option<String>,
    pub cover_image_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeDocumentsInput {
    pub primary_document_id: String,
    pub duplicate_document_ids: Vec<String>,
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
    pub commentary_text: Option<String>,
    pub commentary_updated_at: Option<String>,
    pub cover_image_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceDocumentDoiReferencesInput {
    pub source_document_id: String,
    pub dois: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartBookCoverUploadSessionResult {
    pub token: String,
    pub url: String,
    pub urls: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookCoverUploadSessionStatus {
    pub status: String,
    pub image_path: Option<String>,
}

#[derive(Debug, Clone)]
struct BookCoverUploadSession {
    status: String,
    image_path: Option<String>,
    expires_at_unix: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PhoneCoverUploadPayload {
    file_name: String,
    mime_type: Option<String>,
    data_base64: String,
}

static BOOK_COVER_UPLOAD_SESSIONS: OnceLock<Mutex<HashMap<String, BookCoverUploadSession>>> =
    OnceLock::new();
static BOOK_COVER_UPLOAD_SERVER: OnceLock<()> = OnceLock::new();
const BOOK_COVER_UPLOAD_PORT: u16 = 38473;

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
pub struct CreateAnnotationInput {
    pub document_id: String,
    pub page_number: i64,
    pub kind: String,
    pub content: Option<String>,
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
pub struct CreateDocumentRelationInput {
    pub source_document_id: String,
    pub target_document_id: String,
    pub link_type: String,
    pub link_origin: String,
    pub relation_status: Option<String>,
    pub confidence: Option<f64>,
    pub label: Option<String>,
    pub notes: Option<String>,
    pub match_method: Option<String>,
    pub raw_reference_text: Option<String>,
    pub normalized_reference_text: Option<String>,
    pub normalized_title: Option<String>,
    pub normalized_first_author: Option<String>,
    pub reference_index: Option<i64>,
    pub parse_confidence: Option<f64>,
    pub parse_warnings: Option<String>,
    pub match_debug_info: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDocumentRelationInput {
    pub link_type: Option<String>,
    pub relation_status: Option<String>,
    pub confidence: Option<f64>,
    pub label: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateGraphViewInput {
    pub library_id: String,
    pub name: String,
    pub description: Option<String>,
    pub relation_filter: String,
    pub color_mode: String,
    pub size_mode: String,
    pub scope_mode: String,
    pub neighborhood_depth: String,
    pub focus_mode: bool,
    pub hide_orphans: bool,
    pub confidence_threshold: f64,
    pub year_min: Option<i64>,
    pub year_max: Option<i64>,
    pub selected_document_id: Option<String>,
    pub document_ids_json: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateGraphViewInput {
    pub name: Option<String>,
    pub description: Option<String>,
    pub relation_filter: Option<String>,
    pub color_mode: Option<String>,
    pub size_mode: Option<String>,
    pub scope_mode: Option<String>,
    pub neighborhood_depth: Option<String>,
    pub focus_mode: Option<bool>,
    pub hide_orphans: Option<bool>,
    pub confidence_threshold: Option<f64>,
    pub year_min: Option<i64>,
    pub year_max: Option<i64>,
    pub selected_document_id: Option<String>,
    pub document_ids_json: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertGraphViewNodeLayoutInput {
    pub graph_view_id: String,
    pub document_id: String,
    pub position_x: f64,
    pub position_y: f64,
    pub pinned: Option<bool>,
    pub hidden: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuildAutoCitationRelationsInput {
    pub library_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuildAutoCitationRelationsForDocumentInput {
    pub document_id: String,
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

fn book_cover_upload_sessions(
) -> &'static Mutex<HashMap<String, BookCoverUploadSession>> {
    BOOK_COVER_UPLOAD_SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn book_covers_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    let base = app.path().app_data_dir().map_err(|_| AppError::PathError)?;
    let path = base.join("thumbnails").join("book-covers");
    std::fs::create_dir_all(&path)?;
    Ok(path)
}

fn normalize_image_extension(file_name: &str, mime_type: Option<&str>) -> &'static str {
    let lower_name = file_name.to_lowercase();
    let lower_mime = mime_type.unwrap_or_default().to_lowercase();

    if lower_name.ends_with(".png") || lower_mime == "image/png" {
        "png"
    } else if lower_name.ends_with(".webp") || lower_mime == "image/webp" {
        "webp"
    } else {
        "jpg"
    }
}

fn is_private_ipv4(ip: &str) -> bool {
    ip.starts_with("10.")
        || ip.starts_with("192.168.")
        || ip
            .split('.')
            .collect::<Vec<_>>()
            .as_slice()
            .get(0..2)
            .map(|parts| {
                parts[0] == "172"
                    && parts[1]
                        .parse::<u8>()
                        .map(|second| (16..=31).contains(&second))
                        .unwrap_or(false)
            })
            .unwrap_or(false)
}

fn local_ip_priority(ip: &str) -> u8 {
    if ip.starts_with("192.168.") {
        0
    } else if ip.starts_with("10.") {
        1
    } else if ip.starts_with("172.") && is_private_ipv4(ip) {
        2
    } else if is_private_ipv4(ip) {
        3
    } else {
        4
    }
}

fn detect_local_ip_address() -> Result<String, AppError> {
    let socket = UdpSocket::bind("0.0.0.0:0")?;
    socket.connect("8.8.8.8:80")?;
    Ok(socket.local_addr()?.ip().to_string())
}

fn detect_local_ip_addresses() -> Vec<String> {
    let mut candidates = Vec::new();

    if cfg!(target_os = "windows") {
        if let Ok(output) = Command::new("ipconfig").output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                let trimmed = line.trim();
                if !trimmed.contains("IPv4") {
                    continue;
                }
                let Some((_, value)) = trimmed.split_once(':') else {
                    continue;
                };
                let ip = value.trim().trim_end_matches("(Preferred)").trim().to_string();
                if ip.is_empty() || ip.starts_with("169.254.") {
                    continue;
                }
                if !candidates.iter().any(|existing| existing == &ip) {
                    candidates.push(ip);
                }
            }
        }
    }

    if let Ok(primary) = detect_local_ip_address() {
        if !candidates.iter().any(|existing| existing == &primary) {
            candidates.push(primary);
        }
    }

    candidates.sort_by_key(|ip| (local_ip_priority(ip), ip.clone()));
    candidates
}

fn write_http_response(
    stream: &mut TcpStream,
    status_line: &str,
    content_type: &str,
    body: &[u8],
) -> Result<(), AppError> {
    let header = format!(
        "HTTP/1.1 {status_line}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(header.as_bytes())?;
    stream.write_all(body)?;
    Ok(())
}

fn build_phone_cover_upload_page(token: &str) -> String {
    format!(
        r#"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Upload Book Cover</title>
  <style>
    body {{ font-family: system-ui, sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }}
    main {{ max-width: 28rem; margin: 0 auto; padding: 2rem 1rem; }}
    .card {{ background: white; border: 1px solid #e2e8f0; border-radius: 1rem; padding: 1.25rem; box-shadow: 0 10px 30px rgba(15,23,42,.08); }}
    h1 {{ font-size: 1.1rem; margin: 0 0 .5rem; }}
    p {{ color: #475569; line-height: 1.5; }}
    input, button {{ width: 100%; box-sizing: border-box; border-radius: .8rem; font: inherit; }}
    input {{ padding: .9rem; border: 1px solid #cbd5e1; background: #fff; }}
    button {{ margin-top: .85rem; padding: .9rem; border: 0; background: #0f766e; color: white; font-weight: 600; }}
    button[disabled] {{ opacity: .6; }}
    .status {{ margin-top: .9rem; font-size: .95rem; min-height: 1.4rem; }}
  </style>
</head>
<body>
  <main>
    <div class="card">
      <h1>Upload book cover</h1>
      <p>Take a photo or choose one from your phone. It will upload directly to your desktop app on this local network.</p>
      <input id="file" type="file" accept="image/*" capture="environment" />
      <button id="submit">Upload cover</button>
      <div class="status" id="status"></div>
    </div>
  </main>
  <script>
    const fileInput = document.getElementById('file');
    const button = document.getElementById('submit');
    const status = document.getElementById('status');

    button.addEventListener('click', async () => {{
      const file = fileInput.files && fileInput.files[0];
      if (!file) {{
        status.textContent = 'Choose a photo first.';
        return;
      }}

      button.disabled = true;
      status.textContent = 'Uploading...';

      try {{
        const dataUrl = await new Promise((resolve, reject) => {{
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error || new Error('Could not read the image.'));
          reader.readAsDataURL(file);
        }});

        const base64 = String(dataUrl).split(',')[1] || '';
        const response = await fetch('/cover-upload/{token}', {{
          method: 'POST',
          headers: {{ 'Content-Type': 'application/json' }},
          body: JSON.stringify({{
            fileName: file.name || 'cover.jpg',
            mimeType: file.type || 'image/jpeg',
            dataBase64: base64,
          }}),
        }});

        if (!response.ok) {{
          throw new Error(await response.text() || 'Upload failed.');
        }}

        status.textContent = 'Cover uploaded. You can go back to the desktop app.';
      }} catch (error) {{
        status.textContent = error instanceof Error ? error.message : 'Upload failed.';
      }} finally {{
        button.disabled = false;
      }}
    }});
  </script>
</body>
</html>"#
    )
}

fn handle_book_cover_upload_request(
    app: &AppHandle,
    stream: &mut TcpStream,
    method: &str,
    path: &str,
    body: &[u8],
) -> Result<(), AppError> {
    let token = path.trim_start_matches("/cover-upload/").trim();
    if token.is_empty() {
        return write_http_response(stream, "404 Not Found", "text/plain; charset=utf-8", b"Not found");
    }

    {
        let sessions = book_cover_upload_sessions()
            .lock()
            .map_err(|_| AppError::Validation("Cover upload session lock failed.".into()))?;
        let Some(session) = sessions.get(token) else {
            return write_http_response(stream, "404 Not Found", "text/plain; charset=utf-8", b"Upload session not found.");
        };
        if session.expires_at_unix < chrono::Utc::now().timestamp() {
            return write_http_response(stream, "410 Gone", "text/plain; charset=utf-8", b"Upload session expired.");
        }
    }

    match method {
        "GET" => {
            let html = build_phone_cover_upload_page(token);
            write_http_response(stream, "200 OK", "text/html; charset=utf-8", html.as_bytes())
        }
        "POST" => {
            let payload: PhoneCoverUploadPayload = serde_json::from_slice(body)
                .map_err(|error| AppError::Validation(format!("Invalid upload payload: {error}")))?;
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(payload.data_base64.as_bytes())
                .map_err(|error| AppError::Validation(format!("Could not decode uploaded image: {error}")))?;
            let extension = normalize_image_extension(&payload.file_name, payload.mime_type.as_deref());
            let cover_path = book_covers_dir(app)?.join(format!("upload-{token}.{extension}"));
            std::fs::write(&cover_path, bytes)?;

            let mut sessions = book_cover_upload_sessions()
                .lock()
                .map_err(|_| AppError::Validation("Cover upload session lock failed.".into()))?;
            if let Some(session) = sessions.get_mut(token) {
                session.status = "completed".into();
                session.image_path = Some(cover_path.to_string_lossy().to_string());
            }

            write_http_response(stream, "200 OK", "text/plain; charset=utf-8", b"Uploaded")
        }
        _ => write_http_response(
            stream,
            "405 Method Not Allowed",
            "text/plain; charset=utf-8",
            b"Method not allowed",
        ),
    }
}

fn process_book_cover_upload_connection(
    app: &AppHandle,
    mut stream: TcpStream,
) -> Result<(), AppError> {
    let mut buffer = Vec::new();
    let mut header_end = None;

    while header_end.is_none() {
        let mut chunk = [0_u8; 4096];
        let bytes_read = stream.read(&mut chunk)?;
        if bytes_read == 0 {
            break;
        }
        buffer.extend_from_slice(&chunk[..bytes_read]);
        header_end = buffer
            .windows(4)
            .position(|window| window == b"\r\n\r\n")
            .map(|index| index + 4);
    }

    let header_end = header_end
        .ok_or_else(|| AppError::Validation("Malformed HTTP request.".into()))?;

    let header_text = String::from_utf8_lossy(&buffer[..header_end]).into_owned();
    let mut lines = header_text.lines();
    let request_line = lines
        .next()
        .ok_or_else(|| AppError::Validation("Missing HTTP request line.".into()))?;
    let mut request_parts = request_line.split_whitespace();
    let method = request_parts
        .next()
        .ok_or_else(|| AppError::Validation("Missing HTTP method.".into()))?
        .to_string();
    let path = request_parts
        .next()
        .ok_or_else(|| AppError::Validation("Missing HTTP path.".into()))?
        .to_string();
    let content_length = lines
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            if !name.eq_ignore_ascii_case("Content-Length") {
                return None;
            }
            value.trim().parse::<usize>().ok()
        })
        .unwrap_or(0);

    while buffer.len().saturating_sub(header_end) < content_length {
        let mut chunk = [0_u8; 4096];
        let bytes_read = stream.read(&mut chunk)?;
        if bytes_read == 0 {
            break;
        }
        buffer.extend_from_slice(&chunk[..bytes_read]);
    }

    let available_body_len = buffer.len().saturating_sub(header_end);
    if available_body_len < content_length {
        return Err(AppError::Validation("Incomplete HTTP request body.".into()));
    }

    let body = &buffer[header_end..header_end + content_length];

    if path == "/" {
        return write_http_response(
            &mut stream,
            "302 Found",
            "text/plain; charset=utf-8",
            b"Redirecting",
        );
    }

    if path.starts_with("/cover-upload/") {
        return handle_book_cover_upload_request(app, &mut stream, &method, &path, body);
    }

    write_http_response(&mut stream, "404 Not Found", "text/plain; charset=utf-8", b"Not found")
}

fn ensure_book_cover_upload_server(app: &AppHandle) -> Result<(), AppError> {
    if BOOK_COVER_UPLOAD_SERVER.get().is_some() {
        return Ok(());
    }

    let listener = TcpListener::bind(("0.0.0.0", BOOK_COVER_UPLOAD_PORT))?;
    let app_handle = app.clone();

    std::thread::spawn(move || {
        for stream in listener.incoming() {
            match stream {
                Ok(stream) => {
                    if let Err(error) = process_book_cover_upload_connection(&app_handle, stream) {
                        eprintln!("Book cover upload request failed: {}", error);
                    }
                }
                Err(error) => {
                    eprintln!("Book cover upload connection failed: {}", error);
                }
            }
        }
    });

    let _ = BOOK_COVER_UPLOAD_SERVER.set(());
    Ok(())
}

fn import_book_cover_file(app: &AppHandle, source_path: &str) -> Result<String, AppError> {
    let source = PathBuf::from(source_path);
    if !source.exists() {
        return Err(AppError::Validation("Selected image file was not found.".into()));
    }

    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_else(|| "jpg".into());
    let target_path = book_covers_dir(app)?.join(format!("cover-{}.{}", uuid::Uuid::new_v4(), extension));
    std::fs::copy(source, &target_path)?;
    Ok(target_path.to_string_lossy().to_string())
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
  commentary_text TEXT,
  commentary_updated_at TEXT,
  cover_image_path TEXT,
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
CREATE TABLE IF NOT EXISTS document_relations (
  id TEXT PRIMARY KEY,
  source_document_id TEXT NOT NULL,
  target_document_id TEXT NOT NULL,
  link_type TEXT NOT NULL,
  link_origin TEXT NOT NULL,
  relation_status TEXT DEFAULT 'confirmed',
  confidence REAL,
  label TEXT,
  notes TEXT,
  match_method TEXT,
  raw_reference_text TEXT,
  normalized_reference_text TEXT,
  normalized_title TEXT,
  normalized_first_author TEXT,
  reference_index INTEGER,
  parse_confidence REAL,
  parse_warnings TEXT,
  match_debug_info TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (source_document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (target_document_id) REFERENCES documents(id) ON DELETE CASCADE,
  UNIQUE (source_document_id, target_document_id, link_type, link_origin)
);
CREATE TABLE IF NOT EXISTS document_doi_references (
  id TEXT PRIMARY KEY,
  source_document_id TEXT NOT NULL,
  doi TEXT NOT NULL,
  matched_document_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (source_document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (matched_document_id) REFERENCES documents(id) ON DELETE SET NULL,
  UNIQUE (source_document_id, doi)
);
CREATE TABLE IF NOT EXISTS graph_views (
  id TEXT PRIMARY KEY,
  library_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  relation_filter TEXT NOT NULL DEFAULT 'all',
  color_mode TEXT NOT NULL DEFAULT 'density',
  size_mode TEXT NOT NULL DEFAULT 'total_degree',
  scope_mode TEXT NOT NULL DEFAULT 'mapped',
  neighborhood_depth TEXT NOT NULL DEFAULT 'full',
  focus_mode INTEGER NOT NULL DEFAULT 0,
  hide_orphans INTEGER NOT NULL DEFAULT 1,
  confidence_threshold REAL NOT NULL DEFAULT 0,
  year_min INTEGER,
  year_max INTEGER,
  selected_document_id TEXT,
  document_ids_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE,
  FOREIGN KEY (selected_document_id) REFERENCES documents(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS graph_view_node_layouts (
  graph_view_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  position_x REAL NOT NULL,
  position_y REAL NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (graph_view_id, document_id),
  FOREIGN KEY (graph_view_id) REFERENCES graph_views(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_library_id ON documents(library_id);
CREATE INDEX IF NOT EXISTS idx_notes_document_id ON notes(document_id);
CREATE INDEX IF NOT EXISTS idx_annotations_document_id ON annotations(document_id);
CREATE INDEX IF NOT EXISTS idx_document_relations_source_document_id ON document_relations(source_document_id);
CREATE INDEX IF NOT EXISTS idx_document_relations_target_document_id ON document_relations(target_document_id);
CREATE INDEX IF NOT EXISTS idx_document_relations_link_origin ON document_relations(link_origin);
CREATE INDEX IF NOT EXISTS idx_document_doi_references_source_document_id ON document_doi_references(source_document_id);
CREATE INDEX IF NOT EXISTS idx_document_doi_references_matched_document_id ON document_doi_references(matched_document_id);
CREATE INDEX IF NOT EXISTS idx_graph_views_library_id ON graph_views(library_id);
CREATE INDEX IF NOT EXISTS idx_graph_view_node_layouts_graph_view_id ON graph_view_node_layouts(graph_view_id);
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
    ensure_column(&conn, "documents", "commentary_text", "TEXT")?;
    ensure_column(&conn, "documents", "commentary_updated_at", "TEXT")?;
    ensure_column(&conn, "documents", "cover_image_path", "TEXT")?;
    ensure_column(&conn, "document_relations", "match_method", "TEXT")?;
    ensure_column(&conn, "document_relations", "raw_reference_text", "TEXT")?;
    ensure_column(&conn, "document_relations", "relation_status", "TEXT DEFAULT 'confirmed'")?;
    ensure_column(&conn, "document_relations", "normalized_reference_text", "TEXT")?;
    ensure_column(&conn, "document_relations", "normalized_title", "TEXT")?;
    ensure_column(&conn, "document_relations", "normalized_first_author", "TEXT")?;
    ensure_column(&conn, "document_relations", "reference_index", "INTEGER")?;
    ensure_column(&conn, "document_relations", "parse_confidence", "REAL")?;
    ensure_column(&conn, "document_relations", "parse_warnings", "TEXT")?;
    ensure_column(&conn, "document_relations", "match_debug_info", "TEXT")?;
    conn.execute(
        r#"
        UPDATE document_relations
        SET relation_status = CASE
          WHEN link_origin = 'auto' AND link_type = 'citation' THEN 'auto_confirmed'
          ELSE 'confirmed'
        END
        WHERE relation_status IS NULL
        "#,
        [],
    )?;
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

fn ensure_tag_exists(conn: &Connection, tag_name: &str) -> Result<String, AppError> {
    let existing: Option<String> = conn
        .query_row(
            "SELECT id FROM tags WHERE name = ?1",
            params![tag_name],
            |row| row.get(0),
        )
        .optional()?;

    match existing {
        Some(id) => Ok(id),
        None => {
            let generated_id = format!("tag-{}", uuid::Uuid::new_v4());
            conn.execute(
                "INSERT INTO tags (id, name, created_at) VALUES (?1, ?2, ?3)",
                params![generated_id, tag_name, now_iso()],
            )?;
            Ok(generated_id)
        }
    }
}

fn parse_json_string_array(value: Option<String>) -> Vec<String> {
    value
        .and_then(|raw| serde_json::from_str::<Vec<String>>(&raw).ok())
        .unwrap_or_default()
}

fn merge_string_lists(primary: Vec<String>, duplicate: Vec<String>) -> Vec<String> {
    let mut seen = BTreeSet::new();
    let mut merged = Vec::new();

    for item in primary.into_iter().chain(duplicate.into_iter()) {
        let normalized = item.trim();
        if normalized.is_empty() {
            continue;
        }

        let key = normalized.to_lowercase();
        if seen.insert(key) {
            merged.push(normalized.to_string());
        }
    }

    merged
}

fn choose_non_empty(primary: Option<String>, duplicate: Option<String>) -> Option<String> {
    match primary {
        Some(value) if !value.trim().is_empty() => Some(value),
        _ => duplicate.filter(|value| !value.trim().is_empty()),
    }
}

fn merge_distinct_text(primary: Option<String>, duplicate: Option<String>) -> Option<String> {
    match (
        primary.filter(|value| !value.trim().is_empty()),
        duplicate.filter(|value| !value.trim().is_empty()),
    ) {
        (Some(primary_value), Some(duplicate_value)) => {
            if primary_value.trim().eq_ignore_ascii_case(duplicate_value.trim()) {
                Some(primary_value)
            } else {
                Some(format!("{}\n\n{}", primary_value.trim(), duplicate_value.trim()))
            }
        }
        (Some(primary_value), None) => Some(primary_value),
        (None, Some(duplicate_value)) => Some(duplicate_value),
        (None, None) => None,
    }
}

fn reading_stage_rank(value: &str) -> i64 {
    match value {
        "finished" => 3,
        "reading" => 2,
        "unread" => 1,
        _ => 0,
    }
}

fn metadata_status_rank(value: &str) -> i64 {
    match value {
        "complete" => 3,
        "partial" => 2,
        "missing" => 1,
        _ => 0,
    }
}

fn processing_status_rank(value: &str) -> i64 {
    match value {
        "complete" => 5,
        "processing" => 4,
        "queued" => 3,
        "pending" => 2,
        "skipped" => 1,
        _ => 0,
    }
}

fn merge_relation_duplicates(conn: &Connection) -> Result<(), AppError> {
    #[derive(Clone)]
    struct RelationRow {
        id: String,
        source_document_id: String,
        target_document_id: String,
        link_type: String,
        link_origin: String,
        relation_status: Option<String>,
        confidence: Option<f64>,
        label: Option<String>,
        notes: Option<String>,
        updated_at: String,
    }

    let mut stmt = conn.prepare(
        r#"
        SELECT
          id,
          source_document_id,
          target_document_id,
          link_type,
          link_origin,
          relation_status,
          confidence,
          label,
          notes,
          updated_at,
          created_at
        FROM document_relations
        ORDER BY source_document_id, target_document_id, link_type, link_origin, updated_at DESC, created_at DESC, id DESC
        "#,
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(RelationRow {
            id: row.get(0)?,
            source_document_id: row.get(1)?,
            target_document_id: row.get(2)?,
            link_type: row.get(3)?,
            link_origin: row.get(4)?,
            relation_status: row.get(5)?,
            confidence: row.get(6)?,
            label: row.get(7)?,
            notes: row.get(8)?,
            updated_at: row.get(9)?,
        })
    })?;

    let mut grouped: HashMap<(String, String, String, String), Vec<RelationRow>> = HashMap::new();
    for row in rows {
        let row = row?;
        grouped
            .entry((
                row.source_document_id.clone(),
                row.target_document_id.clone(),
                row.link_type.clone(),
                row.link_origin.clone(),
            ))
            .or_default()
            .push(row);
    }

    for rows in grouped.values() {
        if rows.len() <= 1 {
            continue;
        }

        let keeper = &rows[0];
        let merged_label = rows
            .iter()
            .filter_map(|row| row.label.clone())
            .find(|value| !value.trim().is_empty());
        let merged_notes = rows.iter().fold(None, |acc, row| merge_distinct_text(acc, row.notes.clone()));
        let merged_status = rows
            .iter()
            .filter_map(|row| row.relation_status.clone())
            .max_by_key(|value| {
                match value.as_str() {
                    "confirmed" => 4,
                    "auto_confirmed" => 3,
                    "proposed" => 2,
                    "rejected" => 1,
                    _ => 0,
                }
            });
        let merged_confidence = rows
            .iter()
            .filter_map(|row| row.confidence)
            .max_by(|left, right| left.partial_cmp(right).unwrap_or(std::cmp::Ordering::Equal));

        conn.execute(
            r#"UPDATE document_relations SET
              relation_status = COALESCE(?1, relation_status),
              confidence = COALESCE(?2, confidence),
              label = COALESCE(?3, label),
              notes = COALESCE(?4, notes),
              updated_at = ?5
              WHERE id = ?6"#,
            params![
                merged_status,
                merged_confidence,
                merged_label,
                merged_notes,
                keeper.updated_at,
                keeper.id
            ],
        )?;

        for duplicate in rows.iter().skip(1) {
            conn.execute(
                "DELETE FROM document_relations WHERE id = ?1",
                params![duplicate.id.clone()],
            )?;
        }
    }

    conn.execute(
        "DELETE FROM document_relations WHERE source_document_id = target_document_id",
        [],
    )?;

    Ok(())
}

#[tauri::command]
pub fn import_book_cover(app: AppHandle, source_path: String) -> Result<String, AppError> {
    import_book_cover_file(&app, &source_path)
}

#[tauri::command]
pub fn start_book_cover_upload_session(
    app: AppHandle,
) -> Result<StartBookCoverUploadSessionResult, AppError> {
    ensure_book_cover_upload_server(&app)?;
    let token = format!("cover-{}", uuid::Uuid::new_v4());
    let expires_at_unix = chrono::Utc::now().timestamp() + (15 * 60);
    let local_ips = detect_local_ip_addresses();
    if local_ips.is_empty() {
        return Err(AppError::Validation(
            "Could not determine a local network address for phone upload.".into(),
        ));
    }
    let urls = local_ips
        .iter()
        .map(|ip| format!("http://{ip}:{BOOK_COVER_UPLOAD_PORT}/cover-upload/{token}"))
        .collect::<Vec<_>>();
    let url = urls[0].clone();

    let mut sessions = book_cover_upload_sessions()
        .lock()
        .map_err(|_| AppError::Validation("Cover upload session lock failed.".into()))?;
    sessions.insert(
        token.clone(),
        BookCoverUploadSession {
            status: "pending".into(),
            image_path: None,
            expires_at_unix,
        },
    );

    Ok(StartBookCoverUploadSessionResult { token, url, urls })
}

#[tauri::command]
pub fn get_book_cover_upload_session_status(
    token: String,
) -> Result<BookCoverUploadSessionStatus, AppError> {
    let mut sessions = book_cover_upload_sessions()
        .lock()
        .map_err(|_| AppError::Validation("Cover upload session lock failed.".into()))?;
    let now = chrono::Utc::now().timestamp();

    if let Some(session) = sessions.get(&token) {
        if session.expires_at_unix < now {
            sessions.remove(&token);
            return Ok(BookCoverUploadSessionStatus {
                status: "expired".into(),
                image_path: None,
            });
        }

        return Ok(BookCoverUploadSessionStatus {
            status: session.status.clone(),
            image_path: session.image_path.clone(),
        });
    }

    Ok(BookCoverUploadSessionStatus {
        status: "missing".into(),
        image_path: None,
    })
}

#[tauri::command]
pub fn list_documents_by_library(
    app: AppHandle,
    library_id: String,
) -> Result<Vec<Document>, AppError> {
    let conn = open_db(&app)?;
    let mut stmt = conn.prepare(r#"SELECT id, library_id, document_type, title, authors, year, abstract, doi, isbn, publisher, citation_key, source_path, imported_file_path, extracted_text_path, search_text, text_hash, text_extracted_at, text_extraction_status, page_count, has_extracted_text, has_ocr, has_ocr_text, ocr_status, metadata_status, metadata_provenance, metadata_user_edited_fields, indexing_status, tag_suggestions, rejected_tag_suggestions, tag_suggestion_text_hash, tag_suggestion_status, classification_result, classification_text_hash, classification_status, processing_error, processing_updated_at, last_processed_at, reading_stage, rating, favorite, last_opened_at, last_read_page, commentary_text, commentary_updated_at, cover_image_path, created_at, updated_at FROM documents WHERE library_id = ?1 ORDER BY updated_at DESC"#)?;
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
    let mut stmt = conn.prepare(r#"SELECT id, library_id, document_type, title, authors, year, abstract, doi, isbn, publisher, citation_key, source_path, imported_file_path, extracted_text_path, search_text, text_hash, text_extracted_at, text_extraction_status, page_count, has_extracted_text, has_ocr, has_ocr_text, ocr_status, metadata_status, metadata_provenance, metadata_user_edited_fields, indexing_status, tag_suggestions, rejected_tag_suggestions, tag_suggestion_text_hash, tag_suggestion_status, classification_result, classification_text_hash, classification_status, processing_error, processing_updated_at, last_processed_at, reading_stage, rating, favorite, last_opened_at, last_read_page, commentary_text, commentary_updated_at, cover_image_path, created_at, updated_at FROM documents ORDER BY updated_at DESC"#)?;
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
    let mut stmt = conn.prepare(r#"SELECT id, library_id, document_type, title, authors, year, abstract, doi, isbn, publisher, citation_key, source_path, imported_file_path, extracted_text_path, search_text, text_hash, text_extracted_at, text_extraction_status, page_count, has_extracted_text, has_ocr, has_ocr_text, ocr_status, metadata_status, metadata_provenance, metadata_user_edited_fields, indexing_status, tag_suggestions, rejected_tag_suggestions, tag_suggestion_text_hash, tag_suggestion_status, classification_result, classification_text_hash, classification_status, processing_error, processing_updated_at, last_processed_at, reading_stage, rating, favorite, last_opened_at, last_read_page, commentary_text, commentary_updated_at, cover_image_path, created_at, updated_at FROM documents WHERE id = ?1"#)?;
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
        commentary_text: row.get(42)?,
        commentary_updated_at: row.get(43)?,
        cover_image_path: row.get(44)?,
        created_at: row.get(45)?,
        updated_at: row.get(46)?,
    })
}

fn map_document_relation_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<DocumentRelation> {
    Ok(DocumentRelation {
        id: row.get(0)?,
        source_document_id: row.get(1)?,
        target_document_id: row.get(2)?,
        link_type: row.get(3)?,
        link_origin: row.get(4)?,
        relation_status: row.get(5)?,
        confidence: row.get(6)?,
        label: row.get(7)?,
        notes: row.get(8)?,
        match_method: row.get(9)?,
        raw_reference_text: row.get(10)?,
        normalized_reference_text: row.get(11)?,
        normalized_title: row.get(12)?,
        normalized_first_author: row.get(13)?,
        reference_index: row.get(14)?,
        parse_confidence: row.get(15)?,
        parse_warnings: row.get(16)?,
        match_debug_info: row.get(17)?,
        created_at: row.get(18)?,
        updated_at: row.get(19)?,
    })
}

fn map_graph_view_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<GraphView> {
    Ok(GraphView {
        id: row.get(0)?,
        library_id: row.get(1)?,
        name: row.get(2)?,
        description: row.get(3)?,
        relation_filter: row.get(4)?,
        color_mode: row.get(5)?,
        size_mode: row.get(6)?,
        scope_mode: row.get(7)?,
        neighborhood_depth: row.get(8)?,
        focus_mode: row.get::<_, i64>(9)? == 1,
        hide_orphans: row.get::<_, i64>(10)? == 1,
        confidence_threshold: row.get(11)?,
        year_min: row.get(12)?,
        year_max: row.get(13)?,
        selected_document_id: row.get(14)?,
        document_ids_json: row.get(15)?,
        created_at: row.get(16)?,
        updated_at: row.get(17)?,
    })
}

fn map_graph_view_node_layout_row(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<GraphViewNodeLayout> {
    Ok(GraphViewNodeLayout {
        graph_view_id: row.get(0)?,
        document_id: row.get(1)?,
        position_x: row.get(2)?,
        position_y: row.get(3)?,
        pinned: row.get::<_, i64>(4)? == 1,
        hidden: row.get::<_, i64>(5)? == 1,
        updated_at: row.get(6)?,
    })
}

fn map_document_doi_reference_row(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<DocumentDoiReference> {
    Ok(DocumentDoiReference {
        id: row.get(0)?,
        source_document_id: row.get(1)?,
        doi: row.get(2)?,
        matched_document_id: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

fn document_exists(conn: &Connection, id: &str) -> Result<bool, AppError> {
    let exists: Option<String> = conn
        .query_row("SELECT id FROM documents WHERE id = ?1", params![id], |row| row.get(0))
        .optional()?;
    Ok(exists.is_some())
}

fn list_relations_for_library(
    conn: &Connection,
    library_id: &str,
) -> Result<Vec<DocumentRelation>, AppError> {
    let mut stmt = conn.prepare(
        r#"
        SELECT
          dr.id,
          dr.source_document_id,
          dr.target_document_id,
          dr.link_type,
          dr.link_origin,
          dr.relation_status,
          dr.confidence,
          dr.label,
          dr.notes,
          dr.match_method,
          dr.raw_reference_text,
          dr.normalized_reference_text,
          dr.normalized_title,
          dr.normalized_first_author,
          dr.reference_index,
          dr.parse_confidence,
          dr.parse_warnings,
          dr.match_debug_info,
          dr.created_at,
          dr.updated_at
        FROM document_relations dr
        INNER JOIN documents source_doc ON source_doc.id = dr.source_document_id
        INNER JOIN documents target_doc ON target_doc.id = dr.target_document_id
        WHERE source_doc.library_id = ?1 AND target_doc.library_id = ?1
        ORDER BY dr.updated_at DESC, dr.created_at DESC
        "#,
    )?;
    let rows = stmt.query_map(params![library_id], map_document_relation_row)?;
    Ok(rows.filter_map(Result::ok).collect())
}

fn normalize_doi_value(input: &str) -> String {
    input
        .trim()
        .trim_matches(|character: char| matches!(character, '.' | ',' | ';' | ':' | ')' | ']' | '}' | '"' | '\''))
        .to_lowercase()
        .replace("https://doi.org/", "")
        .replace("http://doi.org/", "")
        .replace("doi:", "")
        .trim()
        .to_string()
}

fn resolve_matching_document_id_for_doi(
    conn: &Connection,
    source_document_id: &str,
    doi: &str,
) -> Result<Option<String>, AppError> {
    let normalized_doi = normalize_doi_value(doi);
    if normalized_doi.is_empty() {
        return Ok(None);
    }

    let mut stmt = conn.prepare(
        r#"
        SELECT id, doi
        FROM documents
        WHERE id != ?1
          AND doi IS NOT NULL
          AND TRIM(doi) != ''
        ORDER BY updated_at DESC, created_at DESC
        "#,
    )?;
    let rows = stmt.query_map(params![source_document_id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;

    for row in rows {
        let (document_id, candidate_doi) = row?;
        if normalize_doi_value(&candidate_doi) == normalized_doi {
            return Ok(Some(document_id));
        }
    }

    Ok(None)
}

fn list_document_doi_references_for_source(
    conn: &Connection,
    source_document_id: &str,
) -> Result<Vec<DocumentDoiReference>, AppError> {
    let mut stmt = conn.prepare(
        r#"
        SELECT
          id,
          source_document_id,
          doi,
          matched_document_id,
          created_at,
          updated_at
        FROM document_doi_references
        WHERE source_document_id = ?1
        ORDER BY updated_at DESC, created_at DESC
        "#,
    )?;
    let rows = stmt.query_map(params![source_document_id], map_document_doi_reference_row)?;
    Ok(rows.filter_map(Result::ok).collect())
}

fn list_document_doi_references_pointing_to_target_document(
    conn: &Connection,
    document_id: &str,
) -> Result<Vec<DocumentDoiReference>, AppError> {
    let mut stmt = conn.prepare(
        r#"
        SELECT
          id,
          source_document_id,
          doi,
          matched_document_id,
          created_at,
          updated_at
        FROM document_doi_references
        WHERE matched_document_id = ?1
        ORDER BY updated_at DESC, created_at DESC
        "#,
    )?;
    let rows = stmt.query_map(params![document_id], map_document_doi_reference_row)?;
    Ok(rows.filter_map(Result::ok).collect())
}

fn graph_view_exists(conn: &Connection, id: &str) -> Result<bool, AppError> {
    let exists: Option<String> = conn
        .query_row("SELECT id FROM graph_views WHERE id = ?1", params![id], |row| row.get(0))
        .optional()?;
    Ok(exists.is_some())
}

fn list_graph_views_for_library(
    conn: &Connection,
    library_id: &str,
) -> Result<Vec<GraphView>, AppError> {
    let mut stmt = conn.prepare(
        r#"
        SELECT
          id,
          library_id,
          name,
          description,
          relation_filter,
          color_mode,
          size_mode,
          scope_mode,
          neighborhood_depth,
          focus_mode,
          hide_orphans,
          confidence_threshold,
          year_min,
          year_max,
          selected_document_id,
          document_ids_json,
          created_at,
          updated_at
        FROM graph_views
        WHERE library_id = ?1
        ORDER BY updated_at DESC, created_at DESC
        "#,
    )?;
    let rows = stmt.query_map(params![library_id], map_graph_view_row)?;
    Ok(rows.filter_map(Result::ok).collect())
}

fn list_graph_view_layouts_for_view(
    conn: &Connection,
    graph_view_id: &str,
) -> Result<Vec<GraphViewNodeLayout>, AppError> {
    let mut stmt = conn.prepare(
        r#"
        SELECT
          graph_view_id,
          document_id,
          position_x,
          position_y,
          pinned,
          hidden,
          updated_at
        FROM graph_view_node_layouts
        WHERE graph_view_id = ?1
        ORDER BY updated_at DESC
        "#,
    )?;
    let rows = stmt.query_map(params![graph_view_id], map_graph_view_node_layout_row)?;
    Ok(rows.filter_map(Result::ok).collect())
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
        r#"INSERT INTO documents (id, library_id, document_type, title, authors, year, abstract, doi, isbn, publisher, citation_key, source_path, imported_file_path, extracted_text_path, search_text, text_hash, text_extracted_at, text_extraction_status, page_count, has_extracted_text, has_ocr, has_ocr_text, ocr_status, metadata_status, metadata_provenance, metadata_user_edited_fields, indexing_status, tag_suggestions, rejected_tag_suggestions, tag_suggestion_text_hash, tag_suggestion_status, classification_result, classification_text_hash, classification_status, processing_error, processing_updated_at, last_processed_at, reading_stage, rating, favorite, commentary_text, commentary_updated_at, cover_image_path, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32, ?33, ?34, ?35, ?36, ?37, 'unread', 0, 0, ?38, ?39, ?40, ?41, ?41)"#,
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
            input.commentary_text,
            input.commentary_updated_at,
            input.cover_image_path,
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
          commentary_text = COALESCE(?41, commentary_text),
          commentary_updated_at = COALESCE(?42, commentary_updated_at),
          cover_image_path = COALESCE(?43, cover_image_path),
          updated_at = ?44
          WHERE id = ?45"#,
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
            input.commentary_text,
            input.commentary_updated_at,
            input.cover_image_path,
            now,
            id
        ],
    )?;
    get_document_by_id(app, id)
}

#[tauri::command]
pub fn delete_document(app: AppHandle, id: String) -> Result<bool, AppError> {
    let conn = open_db(&app)?;
    let (imported_file_path, extracted_text_path, cover_image_path): (Option<String>, Option<String>, Option<String>) = conn
        .query_row(
            "SELECT imported_file_path, extracted_text_path, cover_image_path FROM documents WHERE id = ?1",
            params![id.clone()],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()?
        .unwrap_or((None, None, None));
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
        if let Some(path) = cover_image_path {
            let cover_file = std::path::PathBuf::from(path);
            if cover_file.exists() {
                std::fs::remove_file(cover_file)?;
            }
        }
    }
    Ok(rows > 0)
}

#[tauri::command]
pub fn merge_documents(
    app: AppHandle,
    input: MergeDocumentsInput,
) -> Result<Option<Document>, AppError> {
    let unique_duplicate_ids: Vec<String> = input
        .duplicate_document_ids
        .into_iter()
        .filter(|id| id != &input.primary_document_id)
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();

    if unique_duplicate_ids.is_empty() {
        return get_document_by_id(app, input.primary_document_id);
    }

    let mut conn = open_db(&app)?;
    let primary_library_id: String = conn.query_row(
        "SELECT library_id FROM documents WHERE id = ?1",
        params![input.primary_document_id.clone()],
        |row| row.get(0),
    )?;

    let mut duplicate_file_cleanup_paths: Vec<String> = Vec::new();
    let tx = conn.transaction()?;

    let primary_before = tx
        .query_row(
            r#"SELECT
                title,
                authors,
                year,
                abstract,
                doi,
                isbn,
                publisher,
                citation_key,
                source_path,
                imported_file_path,
                extracted_text_path,
                search_text,
                text_hash,
                text_extracted_at,
                text_extraction_status,
                page_count,
                has_extracted_text,
                has_ocr,
                has_ocr_text,
                ocr_status,
                metadata_status,
                metadata_provenance,
                metadata_user_edited_fields,
                indexing_status,
                tag_suggestions,
                rejected_tag_suggestions,
                tag_suggestion_text_hash,
                tag_suggestion_status,
                classification_result,
                classification_text_hash,
                classification_status,
                processing_error,
                processing_updated_at,
                last_processed_at,
                reading_stage,
                rating,
                favorite,
                last_opened_at,
                last_read_page,
                commentary_text,
                commentary_updated_at,
                cover_image_path,
                updated_at
            FROM documents
            WHERE id = ?1"#,
            params![input.primary_document_id.clone()],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<i64>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, Option<String>>(7)?,
                    row.get::<_, Option<String>>(8)?,
                    row.get::<_, Option<String>>(9)?,
                    row.get::<_, Option<String>>(10)?,
                    row.get::<_, Option<String>>(11)?,
                    row.get::<_, Option<String>>(12)?,
                    row.get::<_, Option<String>>(13)?,
                    row.get::<_, String>(14)?,
                    row.get::<_, Option<i64>>(15)?,
                    row.get::<_, bool>(16)?,
                    row.get::<_, bool>(17)?,
                    row.get::<_, bool>(18)?,
                    row.get::<_, String>(19)?,
                    row.get::<_, String>(20)?,
                    row.get::<_, Option<String>>(21)?,
                    row.get::<_, Option<String>>(22)?,
                    row.get::<_, String>(23)?,
                    row.get::<_, Option<String>>(24)?,
                    row.get::<_, Option<String>>(25)?,
                    row.get::<_, Option<String>>(26)?,
                    row.get::<_, String>(27)?,
                    row.get::<_, Option<String>>(28)?,
                    row.get::<_, Option<String>>(29)?,
                    row.get::<_, String>(30)?,
                    row.get::<_, Option<String>>(31)?,
                    row.get::<_, Option<String>>(32)?,
                    row.get::<_, Option<String>>(33)?,
                    row.get::<_, String>(34)?,
                    row.get::<_, i64>(35)?,
                    row.get::<_, bool>(36)?,
                    row.get::<_, Option<String>>(37)?,
                    row.get::<_, Option<i64>>(38)?,
                    row.get::<_, Option<String>>(39)?,
                    row.get::<_, Option<String>>(40)?,
                    row.get::<_, Option<String>>(41)?,
                    row.get::<_, String>(42)?,
                ))
            },
        )?;

    let (
        mut merged_title,
        mut merged_authors,
        mut merged_year,
        mut merged_abstract,
        mut merged_doi,
        mut merged_isbn,
        mut merged_publisher,
        mut merged_citation_key,
        mut merged_source_path,
        mut merged_imported_file_path,
        mut merged_extracted_text_path,
        mut merged_search_text,
        mut merged_text_hash,
        mut merged_text_extracted_at,
        mut merged_text_extraction_status,
        mut merged_page_count,
        mut merged_has_extracted_text,
        mut merged_has_ocr,
        mut merged_has_ocr_text,
        mut merged_ocr_status,
        mut merged_metadata_status,
        mut merged_metadata_provenance,
        mut merged_metadata_user_edited_fields,
        mut merged_indexing_status,
        mut merged_tag_suggestions,
        mut merged_rejected_tag_suggestions,
        mut merged_tag_suggestion_text_hash,
        mut merged_tag_suggestion_status,
        mut merged_classification_result,
        mut merged_classification_text_hash,
        mut merged_classification_status,
        mut merged_processing_error,
        mut merged_processing_updated_at,
        mut merged_last_processed_at,
        mut merged_reading_stage,
        mut merged_rating,
        mut merged_favorite,
        mut merged_last_opened_at,
        mut merged_last_read_page,
        mut merged_commentary_text,
        mut merged_commentary_updated_at,
        mut merged_cover_image_path,
        _primary_updated_at,
    ) = primary_before;

    let primary_tags = document_tags(&tx, &input.primary_document_id)?;
    let mut merged_tags = primary_tags;

    for duplicate_id in unique_duplicate_ids.iter() {
        let duplicate_row: Option<(
            String,
            String,
            Option<i64>,
            Option<String>,
            Option<String>,
            Option<String>,
            Option<String>,
            Option<String>,
            Option<String>,
            Option<String>,
            Option<String>,
            Option<String>,
            Option<String>,
            Option<String>,
            String,
            Option<i64>,
            bool,
            bool,
            bool,
            String,
            String,
            Option<String>,
            Option<String>,
            String,
            Option<String>,
            Option<String>,
            Option<String>,
            String,
            Option<String>,
            Option<String>,
            String,
            Option<String>,
            Option<String>,
            Option<String>,
            String,
            i64,
            bool,
            Option<String>,
            Option<i64>,
            Option<String>,
            Option<String>,
            Option<String>,
        )> = tx
            .query_row(
                r#"SELECT
                    title,
                    authors,
                    year,
                    abstract,
                    doi,
                    isbn,
                    publisher,
                    citation_key,
                    source_path,
                    imported_file_path,
                    extracted_text_path,
                    search_text,
                    text_hash,
                    text_extracted_at,
                    text_extraction_status,
                    page_count,
                    has_extracted_text,
                    has_ocr,
                    has_ocr_text,
                    ocr_status,
                    metadata_status,
                    metadata_provenance,
                    metadata_user_edited_fields,
                    indexing_status,
                    tag_suggestions,
                    rejected_tag_suggestions,
                    tag_suggestion_text_hash,
                    tag_suggestion_status,
                    classification_result,
                    classification_text_hash,
                    classification_status,
                    processing_error,
                    processing_updated_at,
                    last_processed_at,
                    reading_stage,
                    rating,
                    favorite,
                    last_opened_at,
                    last_read_page,
                    commentary_text,
                    commentary_updated_at,
                    cover_image_path
                FROM documents
                WHERE id = ?1"#,
                params![duplicate_id.clone()],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                        row.get(6)?,
                        row.get(7)?,
                        row.get(8)?,
                        row.get(9)?,
                        row.get(10)?,
                        row.get(11)?,
                        row.get(12)?,
                        row.get(13)?,
                        row.get(14)?,
                        row.get(15)?,
                        row.get(16)?,
                        row.get(17)?,
                        row.get(18)?,
                        row.get(19)?,
                        row.get(20)?,
                        row.get(21)?,
                        row.get(22)?,
                        row.get(23)?,
                        row.get(24)?,
                        row.get(25)?,
                        row.get(26)?,
                        row.get(27)?,
                        row.get(28)?,
                        row.get(29)?,
                        row.get(30)?,
                        row.get(31)?,
                        row.get(32)?,
                        row.get(33)?,
                        row.get(34)?,
                        row.get(35)?,
                        row.get(36)?,
                        row.get(37)?,
                        row.get(38)?,
                        row.get(39)?,
                        row.get(40)?,
                        row.get(41)?,
                    ))
                },
            )
            .optional()?;

        let Some((
            duplicate_title,
            duplicate_authors,
            duplicate_year,
            duplicate_abstract,
            duplicate_doi,
            duplicate_isbn,
            duplicate_publisher,
            duplicate_citation_key,
            duplicate_source_path,
            duplicate_imported_file_path,
            duplicate_extracted_text_path,
            duplicate_search_text,
            duplicate_text_hash,
            duplicate_text_extracted_at,
            duplicate_text_extraction_status,
            duplicate_page_count,
            duplicate_has_extracted_text,
            duplicate_has_ocr,
            duplicate_has_ocr_text,
            duplicate_ocr_status,
            duplicate_metadata_status,
            duplicate_metadata_provenance,
            duplicate_metadata_user_edited_fields,
            duplicate_indexing_status,
            duplicate_tag_suggestions,
            duplicate_rejected_tag_suggestions,
            duplicate_tag_suggestion_text_hash,
            duplicate_tag_suggestion_status,
            duplicate_classification_result,
            duplicate_classification_text_hash,
            duplicate_classification_status,
            duplicate_processing_error,
            duplicate_processing_updated_at,
            duplicate_last_processed_at,
            duplicate_reading_stage,
            duplicate_rating,
            duplicate_favorite,
            duplicate_last_opened_at,
            duplicate_last_read_page,
            duplicate_commentary_text,
            duplicate_commentary_updated_at,
            duplicate_cover_image_path,
        )) = duplicate_row else {
            continue;
        };

        let duplicate_library_id: String = tx.query_row(
            "SELECT library_id FROM documents WHERE id = ?1",
            params![duplicate_id.clone()],
            |row| row.get(0),
        )?;

        if duplicate_library_id != primary_library_id {
            return Err(AppError::Validation(
                "Duplicate documents must belong to the same library.".to_string(),
            ));
        }

        merged_title = if merged_title.trim().is_empty() {
            duplicate_title
        } else {
            merged_title
        };
        merged_authors = serde_json::to_string(&merge_string_lists(
            parse_json_string_array(Some(merged_authors)),
            parse_json_string_array(Some(duplicate_authors)),
        ))
        .map_err(|error| AppError::Validation(error.to_string()))?;
        merged_year = merged_year.or(duplicate_year);
        merged_abstract = merge_distinct_text(merged_abstract, duplicate_abstract);
        merged_doi = choose_non_empty(merged_doi, duplicate_doi);
        merged_isbn = choose_non_empty(merged_isbn, duplicate_isbn);
        merged_publisher = choose_non_empty(merged_publisher, duplicate_publisher);
        merged_citation_key = choose_non_empty(merged_citation_key, duplicate_citation_key);
        merged_source_path = choose_non_empty(merged_source_path, duplicate_source_path.clone());
        merged_imported_file_path = choose_non_empty(merged_imported_file_path, duplicate_imported_file_path.clone());
        merged_extracted_text_path = choose_non_empty(merged_extracted_text_path, duplicate_extracted_text_path.clone());
        merged_search_text = choose_non_empty(merged_search_text, duplicate_search_text);
        merged_text_hash = choose_non_empty(merged_text_hash, duplicate_text_hash);
        merged_text_extracted_at = choose_non_empty(merged_text_extracted_at, duplicate_text_extracted_at);
        if processing_status_rank(&duplicate_text_extraction_status) > processing_status_rank(&merged_text_extraction_status) {
            merged_text_extraction_status = duplicate_text_extraction_status;
        }
        merged_page_count = merged_page_count.or(duplicate_page_count);
        merged_has_extracted_text = merged_has_extracted_text || duplicate_has_extracted_text;
        merged_has_ocr = merged_has_ocr || duplicate_has_ocr;
        merged_has_ocr_text = merged_has_ocr_text || duplicate_has_ocr_text;
        if processing_status_rank(&duplicate_ocr_status) > processing_status_rank(&merged_ocr_status) {
            merged_ocr_status = duplicate_ocr_status;
        }
        if metadata_status_rank(&duplicate_metadata_status) > metadata_status_rank(&merged_metadata_status) {
            merged_metadata_status = duplicate_metadata_status;
        }
        merged_metadata_provenance = choose_non_empty(merged_metadata_provenance, duplicate_metadata_provenance);
        merged_metadata_user_edited_fields =
            choose_non_empty(merged_metadata_user_edited_fields, duplicate_metadata_user_edited_fields);
        if processing_status_rank(&duplicate_indexing_status) > processing_status_rank(&merged_indexing_status) {
            merged_indexing_status = duplicate_indexing_status;
        }
        merged_tag_suggestions = serde_json::to_string(&merge_string_lists(
            parse_json_string_array(merged_tag_suggestions),
            parse_json_string_array(duplicate_tag_suggestions),
        ))
        .ok()
        .filter(|value| value != "[]");
        merged_rejected_tag_suggestions = serde_json::to_string(&merge_string_lists(
            parse_json_string_array(merged_rejected_tag_suggestions),
            parse_json_string_array(duplicate_rejected_tag_suggestions),
        ))
        .ok()
        .filter(|value| value != "[]");
        merged_tag_suggestion_text_hash =
            choose_non_empty(merged_tag_suggestion_text_hash, duplicate_tag_suggestion_text_hash);
        if processing_status_rank(&duplicate_tag_suggestion_status) > processing_status_rank(&merged_tag_suggestion_status) {
            merged_tag_suggestion_status = duplicate_tag_suggestion_status;
        }
        merged_classification_result = choose_non_empty(merged_classification_result, duplicate_classification_result);
        merged_classification_text_hash =
            choose_non_empty(merged_classification_text_hash, duplicate_classification_text_hash);
        if processing_status_rank(&duplicate_classification_status) > processing_status_rank(&merged_classification_status) {
            merged_classification_status = duplicate_classification_status;
        }
        merged_processing_error = merge_distinct_text(merged_processing_error, duplicate_processing_error);
        merged_processing_updated_at = choose_non_empty(merged_processing_updated_at, duplicate_processing_updated_at);
        merged_last_processed_at = choose_non_empty(merged_last_processed_at, duplicate_last_processed_at);
        if reading_stage_rank(&duplicate_reading_stage) > reading_stage_rank(&merged_reading_stage) {
            merged_reading_stage = duplicate_reading_stage;
        }
        if duplicate_rating > merged_rating {
            merged_rating = duplicate_rating;
        }
        merged_favorite = merged_favorite || duplicate_favorite;
        merged_last_opened_at = choose_non_empty(merged_last_opened_at, duplicate_last_opened_at);
        if duplicate_last_read_page.unwrap_or(0) > merged_last_read_page.unwrap_or(0) {
            merged_last_read_page = duplicate_last_read_page;
        }
        merged_commentary_text = merge_distinct_text(merged_commentary_text, duplicate_commentary_text);
        merged_commentary_updated_at = choose_non_empty(merged_commentary_updated_at, duplicate_commentary_updated_at);
        merged_cover_image_path = choose_non_empty(merged_cover_image_path, duplicate_cover_image_path.clone());

        merged_tags = merge_string_lists(merged_tags, document_tags(&tx, duplicate_id)?);

        if let Some(path) = duplicate_imported_file_path {
            duplicate_file_cleanup_paths.push(path);
        }
        if let Some(path) = duplicate_extracted_text_path {
            duplicate_file_cleanup_paths.push(path);
        }
        if let Some(path) = duplicate_cover_image_path {
            duplicate_file_cleanup_paths.push(path);
        }

        tx.execute(
            "UPDATE notes SET document_id = ?1 WHERE document_id = ?2",
            params![input.primary_document_id.clone(), duplicate_id.clone()],
        )?;
        tx.execute(
            "UPDATE annotations SET document_id = ?1 WHERE document_id = ?2",
            params![input.primary_document_id.clone(), duplicate_id.clone()],
        )?;
        tx.execute(
            "UPDATE OR IGNORE graph_view_node_layouts SET document_id = ?1 WHERE document_id = ?2",
            params![input.primary_document_id.clone(), duplicate_id.clone()],
        )?;
        tx.execute(
            "DELETE FROM graph_view_node_layouts WHERE document_id = ?1",
            params![duplicate_id.clone()],
        )?;
        tx.execute(
            "UPDATE document_relations SET source_document_id = ?1 WHERE source_document_id = ?2",
            params![input.primary_document_id.clone(), duplicate_id.clone()],
        )?;
        tx.execute(
            "UPDATE document_relations SET target_document_id = ?1 WHERE target_document_id = ?2",
            params![input.primary_document_id.clone(), duplicate_id.clone()],
        )?;
        tx.execute(
            "UPDATE graph_views SET selected_document_id = ?1 WHERE selected_document_id = ?2",
            params![input.primary_document_id.clone(), duplicate_id.clone()],
        )?;
        tx.execute(
            "INSERT OR IGNORE INTO document_tags (document_id, tag_id) SELECT ?1, tag_id FROM document_tags WHERE document_id = ?2",
            params![input.primary_document_id.clone(), duplicate_id.clone()],
        )?;
    }

    let graph_views_to_update: Vec<(String, Option<String>)> = {
        let mut stmt = tx.prepare("SELECT id, document_ids_json FROM graph_views WHERE library_id = ?1")?;
        let rows = stmt.query_map(params![primary_library_id.clone()], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
        })?;
        rows.filter_map(Result::ok).collect()
    };

    for (graph_view_id, document_ids_json) in graph_views_to_update {
        let document_ids = parse_json_string_array(document_ids_json);
        let mut next_document_ids = Vec::new();
        let mut seen = BTreeSet::new();

        for document_id in document_ids {
            let next_id = if unique_duplicate_ids.iter().any(|duplicate_id| duplicate_id == &document_id) {
                input.primary_document_id.clone()
            } else {
                document_id
            };

            if seen.insert(next_id.clone()) {
                next_document_ids.push(next_id);
            }
        }

        tx.execute(
            "UPDATE graph_views SET document_ids_json = ?1 WHERE id = ?2",
            params![
                serde_json::to_string(&next_document_ids).map_err(|error| AppError::Validation(error.to_string()))?,
                graph_view_id
            ],
        )?;
    }

    tx.execute(
        r#"UPDATE documents SET
          title = ?1,
          authors = ?2,
          year = ?3,
          abstract = ?4,
          doi = ?5,
          isbn = ?6,
          publisher = ?7,
          citation_key = ?8,
          source_path = ?9,
          imported_file_path = ?10,
          extracted_text_path = ?11,
          search_text = ?12,
          text_hash = ?13,
          text_extracted_at = ?14,
          text_extraction_status = ?15,
          page_count = ?16,
          has_extracted_text = ?17,
          has_ocr = ?18,
          has_ocr_text = ?19,
          ocr_status = ?20,
          metadata_status = ?21,
          metadata_provenance = ?22,
          metadata_user_edited_fields = ?23,
          indexing_status = ?24,
          tag_suggestions = ?25,
          rejected_tag_suggestions = ?26,
          tag_suggestion_text_hash = ?27,
          tag_suggestion_status = ?28,
          classification_result = ?29,
          classification_text_hash = ?30,
          classification_status = ?31,
          processing_error = ?32,
          processing_updated_at = ?33,
          last_processed_at = ?34,
          reading_stage = ?35,
          rating = ?36,
          favorite = ?37,
          last_opened_at = ?38,
          last_read_page = ?39,
          commentary_text = ?40,
          commentary_updated_at = ?41,
          cover_image_path = ?42,
          updated_at = ?43
          WHERE id = ?44"#,
        params![
            merged_title,
            merged_authors,
            merged_year,
            merged_abstract,
            merged_doi,
            merged_isbn,
            merged_publisher,
            merged_citation_key,
            merged_source_path,
            merged_imported_file_path,
            merged_extracted_text_path,
            merged_search_text,
            merged_text_hash,
            merged_text_extracted_at,
            merged_text_extraction_status,
            merged_page_count,
            if merged_has_extracted_text { 1 } else { 0 },
            if merged_has_ocr { 1 } else { 0 },
            if merged_has_ocr_text { 1 } else { 0 },
            merged_ocr_status,
            merged_metadata_status,
            merged_metadata_provenance,
            merged_metadata_user_edited_fields,
            merged_indexing_status,
            merged_tag_suggestions,
            merged_rejected_tag_suggestions,
            merged_tag_suggestion_text_hash,
            merged_tag_suggestion_status,
            merged_classification_result,
            merged_classification_text_hash,
            merged_classification_status,
            merged_processing_error,
            merged_processing_updated_at,
            merged_last_processed_at,
            merged_reading_stage,
            merged_rating,
            if merged_favorite { 1 } else { 0 },
            merged_last_opened_at,
            merged_last_read_page,
            merged_commentary_text,
            merged_commentary_updated_at,
            merged_cover_image_path,
            now_iso(),
            input.primary_document_id.clone()
        ],
    )?;

    for tag in merged_tags {
        let normalized = tag.trim();
        if normalized.is_empty() {
            continue;
        }
        let tag_id = ensure_tag_exists(&tx, normalized)?;
        tx.execute(
            "INSERT OR IGNORE INTO document_tags (document_id, tag_id) VALUES (?1, ?2)",
            params![input.primary_document_id.clone(), tag_id],
        )?;
    }

    merge_relation_duplicates(&tx)?;
    backfill_document_comment_numbers(&tx)?;

    for duplicate_id in unique_duplicate_ids.iter() {
        tx.execute("DELETE FROM document_tags WHERE document_id = ?1", params![duplicate_id.clone()])?;
        tx.execute("DELETE FROM documents WHERE id = ?1", params![duplicate_id.clone()])?;
    }

    tx.commit()?;

    let retained_paths = [
        get_document_by_id(app.clone(), input.primary_document_id.clone())?
            .and_then(|document| document.imported_file_path),
        get_document_by_id(app.clone(), input.primary_document_id.clone())?
            .and_then(|document| document.extracted_text_path),
        get_document_by_id(app.clone(), input.primary_document_id.clone())?
            .and_then(|document| document.cover_image_path),
    ]
    .into_iter()
    .flatten()
    .collect::<BTreeSet<_>>();

    for path in duplicate_file_cleanup_paths {
        if retained_paths.contains(&path) {
            continue;
        }
        let file_path = std::path::PathBuf::from(path);
        if file_path.exists() {
            let _ = std::fs::remove_file(file_path);
        }
    }

    get_document_by_id(app, input.primary_document_id)
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
pub fn create_document_relation(
    app: AppHandle,
    input: CreateDocumentRelationInput,
) -> Result<DocumentRelation, AppError> {
    if input.source_document_id == input.target_document_id {
        return Err(AppError::Validation(
            "A document cannot be linked to itself.".to_string(),
        ));
    }

    let conn = open_db(&app)?;
    if !document_exists(&conn, &input.source_document_id)? {
        return Err(AppError::Validation(
            "Source document was not found.".to_string(),
        ));
    }
    if !document_exists(&conn, &input.target_document_id)? {
        return Err(AppError::Validation(
            "Target document was not found.".to_string(),
        ));
    }

    let source_library_id: String = conn.query_row(
        "SELECT library_id FROM documents WHERE id = ?1",
        params![input.source_document_id.clone()],
        |row| row.get(0),
    )?;
    let target_library_id: String = conn.query_row(
        "SELECT library_id FROM documents WHERE id = ?1",
        params![input.target_document_id.clone()],
        |row| row.get(0),
    )?;

    if source_library_id != target_library_id {
        return Err(AppError::Validation(
            "Relations can only be created between documents in the same library.".to_string(),
        ));
    }

    let existing: Option<DocumentRelation> = conn
        .query_row(
            r#"
            SELECT
              id,
              source_document_id,
              target_document_id,
              link_type,
              link_origin,
              relation_status,
              confidence,
              label,
              notes,
              match_method,
              raw_reference_text,
              normalized_reference_text,
              normalized_title,
              normalized_first_author,
              reference_index,
              parse_confidence,
              parse_warnings,
              match_debug_info,
              created_at,
              updated_at
            FROM document_relations
            WHERE source_document_id = ?1
              AND target_document_id = ?2
              AND link_type = ?3
              AND link_origin = ?4
            "#,
            params![
                input.source_document_id.clone(),
                input.target_document_id.clone(),
                input.link_type.clone(),
                input.link_origin.clone()
            ],
            map_document_relation_row,
        )
        .optional()?;

    if let Some(relation) = existing {
        return Ok(relation);
    }

    let id = format!("rel-{}", uuid::Uuid::new_v4());
    let now = now_iso();
    conn.execute(
        r#"
        INSERT INTO document_relations (
          id,
          source_document_id,
          target_document_id,
          link_type,
          link_origin,
          relation_status,
          confidence,
          label,
          notes,
          match_method,
          raw_reference_text,
          normalized_reference_text,
          normalized_title,
          normalized_first_author,
          reference_index,
          parse_confidence,
          parse_warnings,
          match_debug_info,
          created_at,
          updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?19)
        "#,
        params![
            id.clone(),
            input.source_document_id,
            input.target_document_id,
            input.link_type,
            input.link_origin,
            input.relation_status,
            input.confidence,
            input.label,
            input.notes,
            input.match_method,
            input.raw_reference_text,
            input.normalized_reference_text,
            input.normalized_title,
            input.normalized_first_author,
            input.reference_index,
            input.parse_confidence,
            input.parse_warnings,
            input.match_debug_info,
            now
        ],
    )?;

    conn.query_row(
        r#"
        SELECT
          id,
          source_document_id,
          target_document_id,
          link_type,
          link_origin,
          relation_status,
          confidence,
          label,
          notes,
          match_method,
          raw_reference_text,
          normalized_reference_text,
          normalized_title,
          normalized_first_author,
          reference_index,
          parse_confidence,
          parse_warnings,
          match_debug_info,
          created_at,
          updated_at
        FROM document_relations
        WHERE id = ?1
        "#,
        params![id],
        map_document_relation_row,
    )
    .map_err(AppError::from)
}

#[tauri::command]
pub fn delete_document_relation(app: AppHandle, id: String) -> Result<bool, AppError> {
    let conn = open_db(&app)?;
    let rows = conn.execute("DELETE FROM document_relations WHERE id = ?1", params![id])?;
    Ok(rows > 0)
}

#[tauri::command]
pub fn update_document_relation(
    app: AppHandle,
    id: String,
    input: UpdateDocumentRelationInput,
) -> Result<Option<DocumentRelation>, AppError> {
    let conn = open_db(&app)?;
    let now = now_iso();
    conn.execute(
        r#"UPDATE document_relations SET
          link_type = COALESCE(?1, link_type),
          relation_status = COALESCE(?2, relation_status),
          confidence = COALESCE(?3, confidence),
          label = COALESCE(?4, label),
          notes = COALESCE(?5, notes),
          updated_at = ?6
          WHERE id = ?7"#,
        params![
            input.link_type,
            input.relation_status,
            input.confidence,
            input.label,
            input.notes,
            now,
            id
        ],
    )?;

    conn.query_row(
        r#"
        SELECT
          id,
          source_document_id,
          target_document_id,
          link_type,
          link_origin,
          relation_status,
          confidence,
          label,
          notes,
          match_method,
          raw_reference_text,
          normalized_reference_text,
          normalized_title,
          normalized_first_author,
          reference_index,
          parse_confidence,
          parse_warnings,
          match_debug_info,
          created_at,
          updated_at
        FROM document_relations
        WHERE id = ?1
        "#,
        params![id],
        map_document_relation_row,
    )
    .optional()
    .map_err(AppError::from)
}

#[tauri::command]
pub fn list_document_relations_for_library(
    app: AppHandle,
    library_id: String,
) -> Result<Vec<DocumentRelation>, AppError> {
    let conn = open_db(&app)?;
    list_relations_for_library(&conn, &library_id)
}

#[tauri::command]
pub fn list_document_doi_references_for_document(
    app: AppHandle,
    document_id: String,
) -> Result<Vec<DocumentDoiReference>, AppError> {
    let conn = open_db(&app)?;
    list_document_doi_references_for_source(&conn, &document_id)
}

#[tauri::command]
pub fn list_document_doi_references_pointing_to_document(
    app: AppHandle,
    document_id: String,
) -> Result<Vec<DocumentDoiReference>, AppError> {
    let conn = open_db(&app)?;
    list_document_doi_references_pointing_to_target_document(&conn, &document_id)
}

#[tauri::command]
pub fn replace_document_doi_references(
    app: AppHandle,
    input: ReplaceDocumentDoiReferencesInput,
) -> Result<Vec<DocumentDoiReference>, AppError> {
    let mut conn = open_db(&app)?;
    let tx = conn.transaction()?;
    let now = now_iso();

    tx.execute(
        "DELETE FROM document_doi_references WHERE source_document_id = ?1",
        params![input.source_document_id.clone()],
    )?;

    let unique_dois = input
        .dois
        .into_iter()
        .map(|doi| normalize_doi_value(&doi))
        .filter(|doi| !doi.is_empty())
        .collect::<BTreeSet<_>>();

    for doi in unique_dois {
        let matched_document_id =
            resolve_matching_document_id_for_doi(&tx, &input.source_document_id, &doi)?;
        tx.execute(
            r#"
            INSERT INTO document_doi_references (
              id,
              source_document_id,
              doi,
              matched_document_id,
              created_at,
              updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?5)
            "#,
            params![
                format!("dref-{}", uuid::Uuid::new_v4()),
                input.source_document_id,
                doi,
                matched_document_id,
                now,
            ],
        )?;
    }

    let references = list_document_doi_references_for_source(&tx, &input.source_document_id)?;
    tx.commit()?;
    Ok(references)
}

#[tauri::command]
pub fn recheck_document_doi_references(app: AppHandle) -> Result<Vec<DocumentDoiReference>, AppError> {
    let mut conn = open_db(&app)?;
    let tx = conn.transaction()?;

    let references: Vec<(String, String, String)> = {
        let mut stmt = tx.prepare(
            r#"
            SELECT id, source_document_id, doi
            FROM document_doi_references
            ORDER BY updated_at DESC, created_at DESC
            "#,
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?;
        rows.filter_map(Result::ok).collect()
    };

    let now = now_iso();
    for (reference_id, source_document_id, doi) in references {
        let matched_document_id = resolve_matching_document_id_for_doi(&tx, &source_document_id, &doi)?;
        tx.execute(
            r#"
            UPDATE document_doi_references
            SET matched_document_id = ?1,
                updated_at = ?2
            WHERE id = ?3
            "#,
            params![matched_document_id, now, reference_id],
        )?;
    }

    let refreshed = {
        let mut stmt = tx.prepare(
            r#"
            SELECT
              id,
              source_document_id,
              doi,
              matched_document_id,
              created_at,
              updated_at
            FROM document_doi_references
            ORDER BY updated_at DESC, created_at DESC
            "#,
        )?;
        let rows = stmt.query_map([], map_document_doi_reference_row)?;
        rows.filter_map(Result::ok).collect::<Vec<_>>()
    };
    tx.commit()?;
    Ok(refreshed)
}

#[tauri::command]
pub fn rebuild_auto_citation_relations(
    app: AppHandle,
    input: RebuildAutoCitationRelationsInput,
) -> Result<Vec<DocumentRelation>, AppError> {
    let conn = open_db(&app)?;
    conn.execute(
        r#"
        DELETE FROM document_relations
        WHERE link_origin = 'auto'
          AND link_type = 'citation'
          AND (
            relation_status IS NULL
            OR relation_status = 'auto_confirmed'
            OR relation_status = 'proposed'
          )
          AND source_document_id IN (
            SELECT id FROM documents WHERE library_id = ?1
          )
          AND target_document_id IN (
            SELECT id FROM documents WHERE library_id = ?1
          )
        "#,
        params![input.library_id.clone()],
    )?;

    list_relations_for_library(&conn, &input.library_id)
}

#[tauri::command]
pub fn rebuild_auto_citation_relations_for_document(
    app: AppHandle,
    input: RebuildAutoCitationRelationsForDocumentInput,
) -> Result<Vec<DocumentRelation>, AppError> {
    let conn = open_db(&app)?;
    let library_id: String = conn.query_row(
        "SELECT library_id FROM documents WHERE id = ?1",
        params![input.document_id.clone()],
        |row| row.get(0),
    )?;

    conn.execute(
        r#"
        DELETE FROM document_relations
        WHERE link_origin = 'auto'
          AND link_type = 'citation'
          AND (
            relation_status IS NULL
            OR relation_status = 'auto_confirmed'
            OR relation_status = 'proposed'
          )
          AND source_document_id = ?1
        "#,
        params![input.document_id],
    )?;

    list_relations_for_library(&conn, &library_id)
}

#[tauri::command]
pub fn list_graph_views(app: AppHandle, library_id: String) -> Result<Vec<GraphView>, AppError> {
    let conn = open_db(&app)?;
    list_graph_views_for_library(&conn, &library_id)
}

#[tauri::command]
pub fn create_graph_view(
    app: AppHandle,
    input: CreateGraphViewInput,
) -> Result<GraphView, AppError> {
    let conn = open_db(&app)?;
    if get_library_by_id(&conn, &input.library_id)?.is_none() {
        return Err(AppError::Validation(
            "Library was not found for this graph view.".to_string(),
        ));
    }

    let id = format!("graph-view-{}", uuid::Uuid::new_v4());
    let now = now_iso();
    conn.execute(
        r#"
        INSERT INTO graph_views (
          id,
          library_id,
          name,
          description,
          relation_filter,
          color_mode,
          size_mode,
          scope_mode,
          neighborhood_depth,
          focus_mode,
          hide_orphans,
          confidence_threshold,
          year_min,
          year_max,
          selected_document_id,
          document_ids_json,
          created_at,
          updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?17)
        "#,
        params![
            id.clone(),
            input.library_id,
            input.name,
            input.description,
            input.relation_filter,
            input.color_mode,
            input.size_mode,
            input.scope_mode,
            input.neighborhood_depth,
            if input.focus_mode { 1 } else { 0 },
            if input.hide_orphans { 1 } else { 0 },
            input.confidence_threshold,
            input.year_min,
            input.year_max,
            input.selected_document_id,
            input.document_ids_json,
            now
        ],
    )?;

    conn.query_row(
        r#"
        SELECT
          id,
          library_id,
          name,
          description,
          relation_filter,
          color_mode,
          size_mode,
          scope_mode,
          neighborhood_depth,
          focus_mode,
          hide_orphans,
          confidence_threshold,
          year_min,
          year_max,
          selected_document_id,
          document_ids_json,
          created_at,
          updated_at
        FROM graph_views
        WHERE id = ?1
        "#,
        params![id],
        map_graph_view_row,
    )
    .map_err(AppError::from)
}

#[tauri::command]
pub fn update_graph_view(
    app: AppHandle,
    id: String,
    input: UpdateGraphViewInput,
) -> Result<Option<GraphView>, AppError> {
    let conn = open_db(&app)?;
    let now = now_iso();
    conn.execute(
        r#"UPDATE graph_views SET
          name = COALESCE(?1, name),
          description = COALESCE(?2, description),
          relation_filter = COALESCE(?3, relation_filter),
          color_mode = COALESCE(?4, color_mode),
          size_mode = COALESCE(?5, size_mode),
          scope_mode = COALESCE(?6, scope_mode),
          neighborhood_depth = COALESCE(?7, neighborhood_depth),
          focus_mode = COALESCE(?8, focus_mode),
          hide_orphans = COALESCE(?9, hide_orphans),
          confidence_threshold = COALESCE(?10, confidence_threshold),
          year_min = COALESCE(?11, year_min),
          year_max = COALESCE(?12, year_max),
          selected_document_id = COALESCE(?13, selected_document_id),
          document_ids_json = COALESCE(?14, document_ids_json),
          updated_at = ?15
          WHERE id = ?16"#,
        params![
            input.name,
            input.description,
            input.relation_filter,
            input.color_mode,
            input.size_mode,
            input.scope_mode,
            input.neighborhood_depth,
            input.focus_mode.map(|value| if value { 1 } else { 0 }),
            input.hide_orphans.map(|value| if value { 1 } else { 0 }),
            input.confidence_threshold,
            input.year_min,
            input.year_max,
            input.selected_document_id,
            input.document_ids_json,
            now,
            id
        ],
    )?;

    conn.query_row(
        r#"
        SELECT
          id,
          library_id,
          name,
          description,
          relation_filter,
          color_mode,
          size_mode,
          scope_mode,
          neighborhood_depth,
          focus_mode,
          hide_orphans,
          confidence_threshold,
          year_min,
          year_max,
          selected_document_id,
          document_ids_json,
          created_at,
          updated_at
        FROM graph_views
        WHERE id = ?1
        "#,
        params![id],
        map_graph_view_row,
    )
    .optional()
    .map_err(AppError::from)
}

#[tauri::command]
pub fn delete_graph_view(app: AppHandle, id: String) -> Result<bool, AppError> {
    let conn = open_db(&app)?;
    let rows = conn.execute("DELETE FROM graph_views WHERE id = ?1", params![id])?;
    Ok(rows > 0)
}

#[tauri::command]
pub fn duplicate_graph_view(app: AppHandle, id: String) -> Result<GraphView, AppError> {
    let conn = open_db(&app)?;
    let existing = conn.query_row(
        r#"
        SELECT
          id,
          library_id,
          name,
          description,
          relation_filter,
          color_mode,
          size_mode,
          scope_mode,
          neighborhood_depth,
          focus_mode,
          hide_orphans,
          confidence_threshold,
          year_min,
          year_max,
          selected_document_id,
          document_ids_json,
          created_at,
          updated_at
        FROM graph_views
        WHERE id = ?1
        "#,
        params![id.clone()],
        map_graph_view_row,
    )?;

    let new_id = format!("graph-view-{}", uuid::Uuid::new_v4());
    let now = now_iso();
    conn.execute(
        r#"
        INSERT INTO graph_views (
          id,
          library_id,
          name,
          description,
          relation_filter,
          color_mode,
          size_mode,
          scope_mode,
          neighborhood_depth,
          focus_mode,
          hide_orphans,
          confidence_threshold,
          year_min,
          year_max,
          selected_document_id,
          document_ids_json,
          created_at,
          updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?17)
        "#,
        params![
            new_id.clone(),
            existing.library_id,
            format!("{} Copy", existing.name),
            existing.description,
            existing.relation_filter,
            existing.color_mode,
            existing.size_mode,
            existing.scope_mode,
            existing.neighborhood_depth,
            if existing.focus_mode { 1 } else { 0 },
            if existing.hide_orphans { 1 } else { 0 },
            existing.confidence_threshold,
            existing.year_min,
            existing.year_max,
            existing.selected_document_id,
            existing.document_ids_json,
            now.clone()
        ],
    )?;

    conn.execute(
        r#"
        INSERT INTO graph_view_node_layouts (
          graph_view_id,
          document_id,
          position_x,
          position_y,
          pinned,
          hidden,
          updated_at
        )
        SELECT
          ?1,
          document_id,
          position_x,
          position_y,
          pinned,
          hidden,
          ?2
        FROM graph_view_node_layouts
        WHERE graph_view_id = ?3
        "#,
        params![new_id.clone(), now, id],
    )?;

    conn.query_row(
        r#"
        SELECT
          id,
          library_id,
          name,
          description,
          relation_filter,
          color_mode,
          size_mode,
          scope_mode,
          neighborhood_depth,
          focus_mode,
          hide_orphans,
          confidence_threshold,
          year_min,
          year_max,
          selected_document_id,
          document_ids_json,
          created_at,
          updated_at
        FROM graph_views
        WHERE id = ?1
        "#,
        params![new_id],
        map_graph_view_row,
    )
    .map_err(AppError::from)
}

#[tauri::command]
pub fn list_graph_view_node_layouts(
    app: AppHandle,
    graph_view_id: String,
) -> Result<Vec<GraphViewNodeLayout>, AppError> {
    let conn = open_db(&app)?;
    list_graph_view_layouts_for_view(&conn, &graph_view_id)
}

#[tauri::command]
pub fn upsert_graph_view_node_layout(
    app: AppHandle,
    input: UpsertGraphViewNodeLayoutInput,
) -> Result<GraphViewNodeLayout, AppError> {
    let conn = open_db(&app)?;
    if !graph_view_exists(&conn, &input.graph_view_id)? {
        return Err(AppError::Validation(
            "Graph view was not found.".to_string(),
        ));
    }
    if !document_exists(&conn, &input.document_id)? {
        return Err(AppError::Validation(
            "Document was not found for this graph view layout.".to_string(),
        ));
    }

    let now = now_iso();
    conn.execute(
        r#"
        INSERT INTO graph_view_node_layouts (
          graph_view_id,
          document_id,
          position_x,
          position_y,
          pinned,
          hidden,
          updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        ON CONFLICT(graph_view_id, document_id) DO UPDATE SET
          position_x = excluded.position_x,
          position_y = excluded.position_y,
          pinned = COALESCE(excluded.pinned, graph_view_node_layouts.pinned),
          hidden = COALESCE(excluded.hidden, graph_view_node_layouts.hidden),
          updated_at = excluded.updated_at
        "#,
        params![
            input.graph_view_id.clone(),
            input.document_id.clone(),
            input.position_x,
            input.position_y,
            if input.pinned.unwrap_or(false) { 1 } else { 0 },
            if input.hidden.unwrap_or(false) { 1 } else { 0 },
            now
        ],
    )?;

    conn.query_row(
        r#"
        SELECT
          graph_view_id,
          document_id,
          position_x,
          position_y,
          pinned,
          hidden,
          updated_at
        FROM graph_view_node_layouts
        WHERE graph_view_id = ?1 AND document_id = ?2
        "#,
        params![input.graph_view_id, input.document_id],
        map_graph_view_node_layout_row,
    )
    .map_err(AppError::from)
}

#[tauri::command]
pub fn reset_graph_view_node_layouts(
    app: AppHandle,
    graph_view_id: String,
    document_id: Option<String>,
) -> Result<(), AppError> {
    let conn = open_db(&app)?;
    if let Some(document_id) = document_id {
        conn.execute(
            "DELETE FROM graph_view_node_layouts WHERE graph_view_id = ?1 AND document_id = ?2",
            params![graph_view_id, document_id],
        )?;
    } else {
        conn.execute(
            "DELETE FROM graph_view_node_layouts WHERE graph_view_id = ?1",
            params![graph_view_id],
        )?;
    }
    Ok(())
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
pub fn create_annotation(app: AppHandle, input: CreateAnnotationInput) -> Result<Annotation, AppError> {
    let conn = open_db(&app)?;
    let id = format!("annotation-{}", uuid::Uuid::new_v4());
    let now = now_iso();

    conn.execute(
        "INSERT INTO annotations (id, document_id, page_number, kind, content, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            id,
            input.document_id,
            input.page_number,
            input.kind,
            input.content,
            now,
        ],
    )?;

    Ok(Annotation {
        id,
        document_id: input.document_id,
        page_number: input.page_number,
        kind: input.kind,
        content: input.content,
        created_at: now,
    })
}

#[tauri::command]
pub fn delete_annotation(app: AppHandle, id: String) -> Result<bool, AppError> {
    let conn = open_db(&app)?;
    let deleted = conn.execute("DELETE FROM annotations WHERE id = ?1", params![id])?;
    Ok(deleted > 0)
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
    conn.execute("DELETE FROM graph_view_node_layouts", [])?;
    conn.execute("DELETE FROM graph_views", [])?;
    conn.execute("DELETE FROM document_relations", [])?;
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
