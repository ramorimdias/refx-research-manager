use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
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

/// Get the application data directory path
#[tauri::command]
pub fn get_app_data_dir(app: AppHandle) -> Result<String, AppError> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|_| AppError::PathError)?;
    Ok(path.to_string_lossy().to_string())
}

/// Ensure all required application directories exist
#[tauri::command]
pub async fn ensure_app_directories(app: AppHandle) -> Result<(), AppError> {
    setup_app_directories(&app).await
}

/// Generate a unique document ID
#[tauri::command]
pub fn generate_document_id() -> String {
    format!("doc-{}", uuid_v4())
}

/// Setup application directories
pub async fn setup_app_directories(app: &AppHandle) -> Result<(), AppError> {
    let base_path = app
        .path()
        .app_data_dir()
        .map_err(|_| AppError::PathError)?;

    let directories = vec![
        base_path.clone(),
        base_path.join("pdfs"),
        base_path.join("thumbnails"),
        base_path.join("exports"),
        base_path.join("backups"),
    ];

    for dir in directories {
        if !dir.exists() {
            std::fs::create_dir_all(&dir)?;
        }
    }

    Ok(())
}

/// Simple UUID v4 generator (basic implementation)
fn uuid_v4() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let random: u64 = (timestamp as u64) ^ (std::process::id() as u64 * 0x517cc1b727220a95);
    format!(
        "{:08x}-{:04x}-4{:03x}-{:04x}-{:012x}",
        (random >> 96) as u32,
        (random >> 80) as u16 & 0xffff,
        (random >> 64) as u16 & 0x0fff,
        ((random >> 48) as u16 & 0x3fff) | 0x8000,
        random as u64 & 0xffffffffffff
    )
}
