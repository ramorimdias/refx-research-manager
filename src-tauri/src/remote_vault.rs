use crate::backup;
use crate::commands::AppError;
use chrono::{DateTime, Duration, Utc};
use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{params, params_from_iter, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const REMOTE_VAULT_FORMAT_VERSION: u32 = 1;
const REMOTE_VAULT_MANIFEST_FILE: &str = "refx-vault.json";
const REMOTE_VAULT_SNAPSHOT_FILE: &str = "state/snapshot.json";
const REMOTE_VAULT_LEASE_FILE: &str = "locks/write-lease.json";
const REMOTE_CACHE_DIR: &str = "remote-cache";
const REMOTE_LEASE_TTL_MINUTES: i64 = 120;

const REMOTE_SYNC_TABLES: [&str; 13] = [
    "libraries",
    "documents",
    "tags",
    "document_tags",
    "notes",
    "annotations",
    "document_relations",
    "document_doi_references",
    "document_keywords",
    "references",
    "work_references",
    "graph_views",
    "graph_view_node_layouts",
];

const REMOTE_SYNC_DELETE_ORDER: [&str; 13] = [
    "graph_view_node_layouts",
    "graph_views",
    "work_references",
    "references",
    "document_keywords",
    "document_doi_references",
    "document_relations",
    "annotations",
    "notes",
    "document_tags",
    "tags",
    "documents",
    "libraries",
];

const REMOTE_SYNC_INSERT_ORDER: [&str; 13] = [
    "libraries",
    "documents",
    "tags",
    "document_tags",
    "notes",
    "annotations",
    "document_relations",
    "document_doi_references",
    "document_keywords",
    "references",
    "work_references",
    "graph_views",
    "graph_view_node_layouts",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigureRemoteVaultInput {
    pub path: String,
    pub cache_limit_mb: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrateToRemoteVaultInput {
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrateRemoteVaultToLocalInput {
    pub clear_remote_cache: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetRemoteVaultStatusInput {
    pub acquire_lease: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RemoteVaultSyncDirtyState {
    pub snapshot_tables_dirty: bool,
    pub blob_pdf_dirty: bool,
    pub blob_text_dirty: bool,
    pub blob_thumbnail_dirty: bool,
    pub reader_state_dirty: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PersistedRemoteVaultSyncState {
    pub dirty: Option<RemoteVaultSyncDirtyState>,
    pub highest_priority: Option<String>,
    pub has_pending_sync: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushRemoteVaultInput {
    pub dirty_state: Option<RemoteVaultSyncDirtyState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteVaultActionResult {
    pub status: RemoteVaultStatus,
    pub message: String,
    pub safety_backup_path: Option<String>,
    pub copied_file_count: i64,
    pub copied_byte_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteVaultBackupInput {
    pub automatic: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunScheduledRemoteVaultBackupInput {
    pub interval_days: i64,
    pub keep_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteVaultBackupMetadata {
    pub id: String,
    pub file_name: String,
    pub path: String,
    pub created_at: String,
    pub revision: i64,
    pub file_size: i64,
    pub automatic: bool,
    pub document_count: i64,
    pub note_count: i64,
    pub relation_count: i64,
    pub blob_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreRemoteVaultBackupResult {
    pub backup: RemoteVaultBackupMetadata,
    pub safety_backup: RemoteVaultBackupMetadata,
    pub status: RemoteVaultStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteVaultBackupArchive {
    format_version: u32,
    backup_id: String,
    created_at: String,
    vault_id: String,
    revision: i64,
    automatic: bool,
    manifest: RemoteVaultManifest,
    files: Vec<RemoteVaultBlob>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteVaultStatus {
    pub enabled: bool,
    pub mode: String,
    pub is_writable: bool,
    pub is_offline: bool,
    pub path: Option<String>,
    pub vault_id: Option<String>,
    pub device_id: String,
    pub revision: Option<i64>,
    pub remote_updated_at: Option<String>,
    pub remote_last_pulled_at: Option<String>,
    pub remote_last_pushed_at: Option<String>,
    pub active_lease: Option<RemoteVaultLease>,
    pub message: String,
    pub cache_bytes: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteVaultLease {
    pub device_id: String,
    pub hostname: String,
    pub created_at: String,
    pub expires_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteVaultManifest {
    format_version: u32,
    vault_id: String,
    updated_at: String,
    revision: i64,
    device_id: String,
    snapshot_sha256: Option<String>,
    #[serde(default)]
    files: Vec<RemoteVaultBlob>,
    active_lease: Option<RemoteVaultLease>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteVaultSnapshot {
    format_version: u32,
    vault_id: String,
    updated_at: String,
    revision: i64,
    device_id: String,
    #[serde(default)]
    tables: HashMap<String, Vec<Map<String, Value>>>,
    #[serde(default)]
    files: Vec<RemoteVaultBlob>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteVaultBlob {
    kind: String,
    document_id: String,
    relative_path: String,
    sha256: String,
    size: i64,
    updated_at: String,
}

#[derive(Debug, Clone)]
struct RemoteVaultConfig {
    path: PathBuf,
    vault_id: String,
    device_id: String,
    cache_limit_mb: i64,
    last_pulled_at: Option<String>,
    last_pushed_at: Option<String>,
}

#[derive(Debug, Clone)]
struct BlobCopyStats {
    copied_file_count: i64,
    copied_byte_count: i64,
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    app.path().app_data_dir().map_err(|_| AppError::PathError)
}

fn db_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    Ok(app_data_dir(app)?.join("refx.db"))
}

fn open_db(app: &AppHandle) -> Result<Connection, AppError> {
    let conn = Connection::open(db_path(app)?)?;
    conn.execute("PRAGMA foreign_keys = ON", [])?;
    Ok(conn)
}

fn json_setting<T: Serialize>(value: T) -> Result<String, AppError> {
    serde_json::to_string(&value)
        .map_err(|error| AppError::Validation(format!("Could not encode setting: {error}")))
}

fn read_setting(conn: &Connection, key: &str) -> Result<Option<String>, AppError> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map_err(AppError::from)
}

fn parse_setting_string(raw: Option<String>) -> Option<String> {
    raw.and_then(|value| {
        serde_json::from_str::<String>(&value)
            .ok()
            .or_else(|| if value.trim().is_empty() { None } else { Some(value) })
    })
}

fn parse_setting_bool(raw: Option<String>) -> bool {
    raw.and_then(|value| serde_json::from_str::<bool>(&value).ok())
        .unwrap_or(false)
}

fn parse_setting_i64(raw: Option<String>, fallback: i64) -> i64 {
    raw.and_then(|value| serde_json::from_str::<i64>(&value).ok())
        .unwrap_or(fallback)
}

fn set_setting(conn: &Connection, key: &str, value: String) -> Result<(), AppError> {
    conn.execute(
        r#"
        INSERT INTO settings (key, value, updated_at)
        VALUES (?1, ?2, ?3)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
        "#,
        params![key, value, now_iso()],
    )?;
    Ok(())
}

fn set_setting_json<T: Serialize>(conn: &Connection, key: &str, value: T) -> Result<(), AppError> {
    set_setting(conn, key, json_setting(value)?)
}

fn read_setting_json<T: for<'de> Deserialize<'de>>(conn: &Connection, key: &str) -> Result<Option<T>, AppError> {
    let Some(raw) = read_setting(conn, key)? else {
        return Ok(None);
    };
    if raw.trim().is_empty() {
        return Ok(None);
    }

    serde_json::from_str::<T>(&raw)
        .map(Some)
        .map_err(|error| AppError::Validation(format!("Could not parse setting {key}: {error}")))
}

fn ensure_remote_device_id(conn: &Connection) -> Result<String, AppError> {
    if let Some(device_id) = parse_setting_string(read_setting(conn, "remoteDeviceId")?) {
        if !device_id.trim().is_empty() {
            return Ok(device_id);
        }
    }

    let device_id = format!("device-{}", uuid::Uuid::new_v4());
    set_setting_json(conn, "remoteDeviceId", &device_id)?;
    Ok(device_id)
}

fn read_remote_config(conn: &Connection) -> Result<Option<RemoteVaultConfig>, AppError> {
    if !parse_setting_bool(read_setting(conn, "remoteVaultEnabled")?) {
        return Ok(None);
    }

    let Some(path) = parse_setting_string(read_setting(conn, "remoteVaultPath")?) else {
        return Ok(None);
    };
    if path.trim().is_empty() {
        return Ok(None);
    }

    let vault_id = parse_setting_string(read_setting(conn, "remoteVaultId")?)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| format!("vault-{}", uuid::Uuid::new_v4()));
    let device_id = ensure_remote_device_id(conn)?;
    let cache_limit_mb = parse_setting_i64(read_setting(conn, "remoteCacheLimitMb")?, 2048);
    Ok(Some(RemoteVaultConfig {
        path: PathBuf::from(path),
        vault_id,
        device_id,
        cache_limit_mb,
        last_pulled_at: parse_setting_string(read_setting(conn, "remoteLastPulledAt")?),
        last_pushed_at: parse_setting_string(read_setting(conn, "remoteLastPushedAt")?),
    }))
}

fn store_remote_config(conn: &Connection, config: &RemoteVaultConfig) -> Result<(), AppError> {
    set_setting_json(conn, "remoteVaultEnabled", true)?;
    set_setting_json(
        conn,
        "remoteVaultPath",
        &config.path.to_string_lossy().to_string(),
    )?;
    set_setting_json(conn, "remoteVaultId", &config.vault_id)?;
    set_setting_json(conn, "remoteDeviceId", &config.device_id)?;
    set_setting_json(conn, "remoteCacheLimitMb", config.cache_limit_mb)?;
    Ok(())
}

fn disable_remote_config(conn: &Connection) -> Result<(), AppError> {
    set_setting_json(conn, "remoteVaultEnabled", false)?;
    set_setting_json(conn, "remoteVaultPath", "")?;
    set_setting_json(conn, "remoteVaultId", "")?;
    set_setting_json(conn, "remoteLastPulledAt", "")?;
    set_setting_json(conn, "remoteLastPushedAt", "")?;
    Ok(())
}

fn hostname() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "Unknown device".to_string())
}

fn ensure_vault_layout(root: &Path) -> Result<(), AppError> {
    for path in [
        root,
        &root.join("state"),
        &root.join("blobs"),
        &root.join("blobs").join("pdfs"),
        &root.join("blobs").join("document-text"),
        &root.join("blobs").join("thumbnails"),
        &root.join("locks"),
    ] {
        if !path.exists() {
            fs::create_dir_all(path)?;
        }
    }
    Ok(())
}

fn manifest_path(root: &Path) -> PathBuf {
    root.join(REMOTE_VAULT_MANIFEST_FILE)
}

fn snapshot_path(root: &Path) -> PathBuf {
    root.join(REMOTE_VAULT_SNAPSHOT_FILE)
}

fn lease_path(root: &Path) -> PathBuf {
    root.join(REMOTE_VAULT_LEASE_FILE)
}

fn vault_backups_dir(root: &Path) -> PathBuf {
    root.join("backups")
}

fn vault_backup_archive_path(backup_dir: &Path) -> PathBuf {
    backup_dir.join("vault-backup.json")
}

fn read_manifest(root: &Path) -> Result<Option<RemoteVaultManifest>, AppError> {
    let path = manifest_path(root);
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(path)?;
    serde_json::from_str::<RemoteVaultManifest>(&raw)
        .map(Some)
        .map_err(|error| AppError::Validation(format!("Could not read remote vault manifest: {error}")))
}

fn write_manifest(root: &Path, manifest: &RemoteVaultManifest) -> Result<(), AppError> {
    ensure_vault_layout(root)?;
    let payload = serde_json::to_string_pretty(manifest)
        .map_err(|error| AppError::Validation(format!("Could not serialize remote vault manifest: {error}")))?;
    fs::write(manifest_path(root), payload)?;
    Ok(())
}

fn read_snapshot(root: &Path) -> Result<RemoteVaultSnapshot, AppError> {
    let path = snapshot_path(root);
    if !path.exists() {
        return Err(AppError::Validation(
            "This remote vault does not have a snapshot yet.".to_string(),
        ));
    }
    let raw = fs::read_to_string(path)?;
    serde_json::from_str::<RemoteVaultSnapshot>(&raw)
        .map_err(|error| AppError::Validation(format!("Could not read remote vault snapshot: {error}")))
}

fn read_lease(root: &Path) -> Result<Option<RemoteVaultLease>, AppError> {
    let path = lease_path(root);
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(path)?;
    serde_json::from_str::<RemoteVaultLease>(&raw)
        .map(Some)
        .map_err(|error| AppError::Validation(format!("Could not read remote vault lease: {error}")))
}

fn lease_is_valid(lease: &RemoteVaultLease) -> bool {
    DateTime::parse_from_rfc3339(&lease.expires_at)
        .map(|expires_at| expires_at.with_timezone(&Utc) > Utc::now())
        .unwrap_or(false)
}

fn write_lease(root: &Path, device_id: &str) -> Result<RemoteVaultLease, AppError> {
    ensure_vault_layout(root)?;
    let created_at = Utc::now();
    let lease = RemoteVaultLease {
        device_id: device_id.to_string(),
        hostname: hostname(),
        created_at: created_at.to_rfc3339(),
        expires_at: (created_at + Duration::minutes(REMOTE_LEASE_TTL_MINUTES)).to_rfc3339(),
    };
    let payload = serde_json::to_string_pretty(&lease)
        .map_err(|error| AppError::Validation(format!("Could not serialize remote vault lease: {error}")))?;
    fs::write(lease_path(root), payload)?;
    Ok(lease)
}

fn acquire_or_respect_lease(
    root: &Path,
    device_id: &str,
) -> Result<(Option<RemoteVaultLease>, bool), AppError> {
    let existing = read_lease(root)?;
    if let Some(lease) = existing {
        if lease.device_id != device_id && lease_is_valid(&lease) {
            return Ok((Some(lease), false));
        }
    }

    let lease = write_lease(root, device_id)?;
    Ok((Some(lease), true))
}

fn create_empty_manifest(vault_id: String, device_id: String) -> RemoteVaultManifest {
    RemoteVaultManifest {
        format_version: REMOTE_VAULT_FORMAT_VERSION,
        vault_id,
        updated_at: now_iso(),
        revision: 0,
        device_id,
        snapshot_sha256: None,
        files: Vec::new(),
        active_lease: None,
    }
}

fn cache_root(app: &AppHandle) -> Result<PathBuf, AppError> {
    Ok(app_data_dir(app)?.join(REMOTE_CACHE_DIR))
}

fn vault_status(
    app: &AppHandle,
    conn: &Connection,
    acquire_lease: bool,
) -> Result<RemoteVaultStatus, AppError> {
    let device_id = ensure_remote_device_id(conn)?;
    let cache_bytes = directory_size(&cache_root(app)?)?;
    let Some(mut config) = read_remote_config(conn)? else {
        return Ok(RemoteVaultStatus {
            enabled: false,
            mode: "local".to_string(),
            is_writable: true,
            is_offline: false,
            path: None,
            vault_id: None,
            device_id,
            revision: None,
            remote_updated_at: None,
            remote_last_pulled_at: None,
            remote_last_pushed_at: None,
            active_lease: None,
            message: "Using local library storage.".to_string(),
            cache_bytes,
        });
    };

    if !config.path.exists() {
        return Ok(RemoteVaultStatus {
            enabled: true,
            mode: "remoteOfflineCache".to_string(),
            is_writable: false,
            is_offline: true,
            path: Some(config.path.to_string_lossy().to_string()),
            vault_id: Some(config.vault_id),
            device_id: config.device_id,
            revision: None,
            remote_updated_at: None,
            remote_last_pulled_at: config.last_pulled_at,
            remote_last_pushed_at: config.last_pushed_at,
            active_lease: None,
            message: "Remote vault is unavailable. Cached library data is read-only.".to_string(),
            cache_bytes,
        });
    }

    ensure_vault_layout(&config.path)?;
    let mut manifest = read_manifest(&config.path)?.unwrap_or_else(|| {
        create_empty_manifest(config.vault_id.clone(), config.device_id.clone())
    });
    config.vault_id = manifest.vault_id.clone();
    store_remote_config(conn, &config)?;

    let (active_lease, is_writer) = if acquire_lease {
        let (lease, writer) = acquire_or_respect_lease(&config.path, &config.device_id)?;
        manifest.active_lease = lease.clone();
        write_manifest(&config.path, &manifest)?;
        (lease, writer)
    } else {
        let lease = read_lease(&config.path)?.filter(lease_is_valid);
        let writer = lease
            .as_ref()
            .map(|lease| lease.device_id == config.device_id)
            .unwrap_or(false);
        (lease, writer)
    };

    let mode = if is_writer { "remoteWriter" } else { "remoteReader" };
    let message = if is_writer {
        "Remote vault connected. This device holds the write lease.".to_string()
    } else if let Some(lease) = active_lease.as_ref() {
        format!(
            "Remote vault is read-only because {} holds the write lease.",
            lease.hostname
        )
    } else {
        "Remote vault connected. This device has released the write lease.".to_string()
    };

    Ok(RemoteVaultStatus {
        enabled: true,
        mode: mode.to_string(),
        is_writable: is_writer,
        is_offline: false,
        path: Some(config.path.to_string_lossy().to_string()),
        vault_id: Some(config.vault_id),
        device_id: config.device_id,
        revision: Some(manifest.revision),
        remote_updated_at: Some(manifest.updated_at),
        remote_last_pulled_at: config.last_pulled_at,
        remote_last_pushed_at: config.last_pushed_at,
        active_lease,
        message,
        cache_bytes,
    })
}

#[tauri::command]
pub fn configure_remote_vault(
    app: AppHandle,
    input: ConfigureRemoteVaultInput,
) -> Result<RemoteVaultStatus, AppError> {
    let conn = open_db(&app)?;
    let path = PathBuf::from(input.path.trim());
    if input.path.trim().is_empty() {
        return Err(AppError::Validation(
            "Choose a folder for the Refx vault first.".to_string(),
        ));
    }
    ensure_vault_layout(&path)?;

    let device_id = ensure_remote_device_id(&conn)?;
    let manifest = read_manifest(&path)?.unwrap_or_else(|| {
        create_empty_manifest(format!("vault-{}", uuid::Uuid::new_v4()), device_id.clone())
    });
    write_manifest(&path, &manifest)?;

    let config = RemoteVaultConfig {
        path,
        vault_id: manifest.vault_id,
        device_id,
        cache_limit_mb: input.cache_limit_mb.unwrap_or(2048).max(64),
        last_pulled_at: parse_setting_string(read_setting(&conn, "remoteLastPulledAt")?),
        last_pushed_at: parse_setting_string(read_setting(&conn, "remoteLastPushedAt")?),
    };
    store_remote_config(&conn, &config)?;
    vault_status(&app, &conn, true)
}

#[tauri::command]
pub fn get_remote_vault_status(
    app: AppHandle,
    input: Option<GetRemoteVaultStatusInput>,
) -> Result<RemoteVaultStatus, AppError> {
    let conn = open_db(&app)?;
    let acquire_lease = input.and_then(|value| value.acquire_lease).unwrap_or(false);
    vault_status(&app, &conn, acquire_lease)
}

#[tauri::command]
pub fn get_remote_vault_sync_state(app: AppHandle) -> Result<Option<PersistedRemoteVaultSyncState>, AppError> {
    let conn = open_db(&app)?;
    read_setting_json(&conn, "remoteVaultSyncState")
}

#[tauri::command]
pub fn set_remote_vault_sync_state(
    app: AppHandle,
    input: PersistedRemoteVaultSyncState,
) -> Result<(), AppError> {
    let conn = open_db(&app)?;
    set_setting_json(&conn, "remoteVaultSyncState", input)
}

#[tauri::command]
pub fn migrate_to_remote_vault(
    app: AppHandle,
    input: MigrateToRemoteVaultInput,
) -> Result<RemoteVaultActionResult, AppError> {
    let target_path = PathBuf::from(input.path.trim());
    if target_path.exists() {
        if snapshot_path(&target_path).exists() {
            return Err(AppError::Validation(
                "This folder already contains a populated Refx vault. Use Join Existing Vault instead, or choose an empty folder for migration.".to_string(),
            ));
        }

        if let Some(manifest) = read_manifest(&target_path)? {
            if manifest.revision > 0 || !manifest.files.is_empty() {
                return Err(AppError::Validation(
                    "This folder already contains a populated Refx vault. Use Join Existing Vault instead, or choose an empty folder for migration.".to_string(),
                ));
            }
        }
    }

    let backup_dir = app_data_dir(&app)?.join("backups");
    fs::create_dir_all(&backup_dir)?;
    let safety_backup_path = backup_dir.join(format!(
        "refx-pre-remote-migration-{}.refxbackup.json",
        Utc::now().format("%Y%m%d-%H%M%S")
    ));
    let safety_backup = backup::create_backup(
        app.clone(),
        backup::CreateBackupInput {
            scope: "full".to_string(),
            automatic: Some(false),
            output_path: Some(safety_backup_path.to_string_lossy().to_string()),
        },
    )?;

    configure_remote_vault(
        app.clone(),
        ConfigureRemoteVaultInput {
            path: target_path.to_string_lossy().to_string(),
            cache_limit_mb: None,
        },
    )?;
    let pushed = push_remote_vault(app, None)?;
    Ok(RemoteVaultActionResult {
        status: pushed.status,
        message: format!(
            "Migration complete. Safety backup created at {}.",
            safety_backup.file_name
        ),
        safety_backup_path: Some(safety_backup.path),
        copied_file_count: pushed.copied_file_count,
        copied_byte_count: pushed.copied_byte_count,
    })
}

fn require_remote_writer(
    conn: &Connection,
) -> Result<(RemoteVaultConfig, RemoteVaultManifest), AppError> {
    let Some(config) = read_remote_config(conn)? else {
        return Err(AppError::Validation(
            "Remote vault is not configured.".to_string(),
        ));
    };
    if !config.path.exists() {
        return Err(AppError::Validation(
            "Remote vault is unavailable.".to_string(),
        ));
    }
    ensure_vault_layout(&config.path)?;
    let (lease, writer) = acquire_or_respect_lease(&config.path, &config.device_id)?;
    if !writer {
        let holder = lease
            .map(|lease| lease.hostname)
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "another device".to_string());
        return Err(AppError::Validation(format!(
            "Remote vault is read-only because {holder} holds the write lease."
        )));
    }
    let mut manifest = read_manifest(&config.path)?
        .unwrap_or_else(|| create_empty_manifest(config.vault_id.clone(), config.device_id.clone()));
    manifest.active_lease = lease;
    manifest.vault_id = config.vault_id.clone();
    write_manifest(&config.path, &manifest)?;
    Ok((config, manifest))
}

#[tauri::command]
pub fn push_remote_vault(
    app: AppHandle,
    input: Option<PushRemoteVaultInput>,
) -> Result<RemoteVaultActionResult, AppError> {
    let conn = open_db(&app)?;
    let (config, existing_manifest) = require_remote_writer(&conn)?;
    let revision = existing_manifest.revision + 1;
    let dirty_state = input
        .and_then(|value| value.dirty_state)
        .unwrap_or(RemoteVaultSyncDirtyState {
            snapshot_tables_dirty: true,
            blob_pdf_dirty: true,
            blob_text_dirty: true,
            blob_thumbnail_dirty: true,
            reader_state_dirty: false,
        });
    let (snapshot, stats) = build_snapshot(
        &app,
        &conn,
        &config.path,
        &config.vault_id,
        &config.device_id,
        revision,
        &existing_manifest.files,
        &dirty_state,
    )?;

    let payload = serde_json::to_string_pretty(&snapshot)
        .map_err(|error| AppError::Validation(format!("Could not serialize remote snapshot: {error}")))?;
    let snapshot_path = snapshot_path(&config.path);
    if let Some(parent) = snapshot_path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&snapshot_path, payload.as_bytes())?;
    let snapshot_sha256 = sha256_bytes(payload.as_bytes());

    let lease = read_lease(&config.path)?;
    let manifest = RemoteVaultManifest {
        format_version: REMOTE_VAULT_FORMAT_VERSION,
        vault_id: config.vault_id.clone(),
        updated_at: snapshot.updated_at.clone(),
        revision,
        device_id: config.device_id.clone(),
        snapshot_sha256: Some(snapshot_sha256),
        files: snapshot.files.clone(),
        active_lease: lease,
    };
    write_manifest(&config.path, &manifest)?;
    set_setting_json(&conn, "remoteLastPushedAt", &snapshot.updated_at)?;

    Ok(RemoteVaultActionResult {
        status: vault_status(&app, &conn, false)?,
        message: format!("Pushed remote vault revision {revision}."),
        safety_backup_path: None,
        copied_file_count: stats.copied_file_count,
        copied_byte_count: stats.copied_byte_count,
    })
}

#[tauri::command]
pub fn pull_remote_vault(app: AppHandle) -> Result<RemoteVaultActionResult, AppError> {
    let conn = open_db(&app)?;
    let Some(config) = read_remote_config(&conn)? else {
        return Err(AppError::Validation(
            "Remote vault is not configured.".to_string(),
        ));
    };
    if !config.path.exists() {
        return Err(AppError::Validation(
            "Remote vault is unavailable.".to_string(),
        ));
    }

    let snapshot = read_snapshot(&config.path)?;
    replace_local_tables_from_snapshot(&app, snapshot.clone())?;
    set_setting_json(&conn, "remoteLastPulledAt", &now_iso())?;

    Ok(RemoteVaultActionResult {
        status: vault_status(&app, &conn, true)?,
        message: format!("Pulled remote vault revision {}.", snapshot.revision),
        safety_backup_path: None,
        copied_file_count: 0,
        copied_byte_count: 0,
    })
}

#[tauri::command]
pub fn release_remote_vault_lease(app: AppHandle) -> Result<RemoteVaultStatus, AppError> {
    let conn = open_db(&app)?;
    if let Some(config) = read_remote_config(&conn)? {
        let path = lease_path(&config.path);
        if path.exists() {
            if let Some(lease) = read_lease(&config.path)? {
                if lease.device_id == config.device_id {
                    fs::remove_file(path)?;
                }
            }
        }
    }
    vault_status(&app, &conn, false)
}

#[tauri::command]
pub fn migrate_remote_vault_to_local(
    app: AppHandle,
    input: Option<MigrateRemoteVaultToLocalInput>,
) -> Result<RemoteVaultActionResult, AppError> {
    let conn = open_db(&app)?;
    let Some(config) = read_remote_config(&conn)? else {
        return Err(AppError::Validation(
            "Remote vault is not configured.".to_string(),
        ));
    };
    if !config.path.exists() {
        return Err(AppError::Validation(
            "Remote vault is unavailable. Reconnect to the vault before moving the library back to local storage.".to_string(),
        ));
    }

    let snapshot = read_snapshot(&config.path)?;
    replace_local_tables_from_snapshot(&app, snapshot.clone())?;

    let mut copied_file_count = 0i64;
    let mut copied_byte_count = 0i64;
    let mut db = open_db(&app)?;
    let tx = db.transaction()?;
    for blob in snapshot.files.iter() {
        let source = config.path.join(&blob.relative_path);
        if !source.exists() || !source.is_file() {
            return Err(AppError::Validation(format!(
                "Remote vault blob is missing: {}",
                blob.relative_path
            )));
        }

        let target = materialized_local_path_for_blob(&app, blob)?;
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(&source, &target)?;
        let (sha256, size) = hash_file(&target)?;
        if sha256 != blob.sha256 || size != blob.size {
            let _ = fs::remove_file(&target);
            return Err(AppError::Validation(format!(
                "Local migration verification failed for {}.",
                blob.relative_path
            )));
        }

        let target_string = target.to_string_lossy().to_string();
        match blob.kind.as_str() {
            "pdf" => {
                tx.execute(
                    "UPDATE documents SET imported_file_path = ?1, source_path = NULL, updated_at = ?2 WHERE id = ?3",
                    params![target_string, now_iso(), blob.document_id],
                )?;
            }
            "documentText" => {
                tx.execute(
                    "UPDATE documents SET extracted_text_path = ?1, updated_at = ?2 WHERE id = ?3",
                    params![target_string, now_iso(), blob.document_id],
                )?;
            }
            "thumbnail" => {
                tx.execute(
                    "UPDATE documents SET cover_image_path = ?1, updated_at = ?2 WHERE id = ?3",
                    params![target_string, now_iso(), blob.document_id],
                )?;
            }
            _ => {}
        }
        copied_file_count += 1;
        copied_byte_count += blob.size;
    }
    tx.commit()?;

    let lease_file = lease_path(&config.path);
    if lease_file.exists() {
        if let Some(lease) = read_lease(&config.path)? {
            if lease.device_id == config.device_id {
                let _ = fs::remove_file(lease_file);
            }
        }
    }

    if input.and_then(|value| value.clear_remote_cache).unwrap_or(true) {
        let remote_cache = cache_root(&app)?;
        if remote_cache.exists() {
            fs::remove_dir_all(&remote_cache)?;
        }
        fs::create_dir_all(cache_root(&app)?)?;
    }

    disable_remote_config(&conn)?;

    Ok(RemoteVaultActionResult {
        status: vault_status(&app, &conn, false)?,
        message: format!(
            "Moved {} file{} back to local storage and disconnected from the remote vault.",
            copied_file_count,
            if copied_file_count == 1 { "" } else { "s" }
        ),
        safety_backup_path: None,
        copied_file_count,
        copied_byte_count,
    })
}

#[tauri::command]
pub fn cache_remote_document_file(
    app: AppHandle,
    document_id: String,
) -> Result<Option<String>, AppError> {
    cache_remote_document_file_for_document(&app, &document_id)
}

#[tauri::command]
pub fn clear_remote_cache(app: AppHandle) -> Result<RemoteVaultActionResult, AppError> {
    let conn = open_db(&app)?;
    let Some(config) = read_remote_config(&conn)? else {
        return Err(AppError::Validation(
            "Remote vault is not configured.".to_string(),
        ));
    };
    if !snapshot_path(&config.path).exists() {
        return Err(AppError::Validation(
            "Remote vault has no verified snapshot yet. Push or migrate before freeing local space.".to_string(),
        ));
    }

    let base = app_data_dir(&app)?;
    for dir_name in [REMOTE_CACHE_DIR, "pdfs", "document-text", "search", "thumbnails"] {
        let path = base.join(dir_name);
        if path.exists() {
            fs::remove_dir_all(&path)?;
        }
        fs::create_dir_all(&path)?;
    }

    Ok(RemoteVaultActionResult {
        status: vault_status(&app, &conn, false)?,
        message: "Local cached bulk files were cleared. Remote files stay in the vault and will be re-cached on demand.".to_string(),
        safety_backup_path: None,
        copied_file_count: 0,
        copied_byte_count: 0,
    })
}

#[tauri::command]
pub fn create_remote_vault_backup(
    app: AppHandle,
    input: RemoteVaultBackupInput,
) -> Result<RemoteVaultBackupMetadata, AppError> {
    push_remote_vault(app.clone(), None)?;
    let conn = open_db(&app)?;
    let Some(config) = read_remote_config(&conn)? else {
        return Err(AppError::Validation(
            "Remote vault is not configured.".to_string(),
        ));
    };
    let manifest = read_manifest(&config.path)?.ok_or_else(|| {
        AppError::Validation("Remote vault manifest was not found.".to_string())
    })?;
    let snapshot = read_snapshot(&config.path)?;
    let created_at = now_iso();
    let backup_id = format!(
        "refx-vault-backup-{}{}",
        Utc::now().format("%Y%m%d-%H%M%S"),
        if input.automatic.unwrap_or(false) { "-auto" } else { "" }
    );
    let backup_dir = vault_backups_dir(&config.path).join(&backup_id);
    fs::create_dir_all(backup_dir.join("state"))?;
    fs::create_dir_all(backup_dir.join("blobs"))?;

    fs::copy(manifest_path(&config.path), backup_dir.join(REMOTE_VAULT_MANIFEST_FILE))?;
    fs::copy(snapshot_path(&config.path), backup_dir.join(REMOTE_VAULT_SNAPSHOT_FILE))?;

    for blob in manifest.files.iter() {
        copy_vault_blob(&config.path, &backup_dir, blob)?;
    }

    let archive = RemoteVaultBackupArchive {
        format_version: REMOTE_VAULT_FORMAT_VERSION,
        backup_id: backup_id.clone(),
        created_at,
        vault_id: config.vault_id,
        revision: manifest.revision,
        automatic: input.automatic.unwrap_or(false),
        manifest,
        files: snapshot.files,
    };
    let payload = serde_json::to_string_pretty(&archive)
        .map_err(|error| AppError::Validation(format!("Could not serialize vault backup: {error}")))?;
    fs::write(vault_backup_archive_path(&backup_dir), payload)?;
    metadata_from_vault_backup_dir(&backup_dir)
}

#[tauri::command]
pub fn list_remote_vault_backups(app: AppHandle) -> Result<Vec<RemoteVaultBackupMetadata>, AppError> {
    let conn = open_db(&app)?;
    let Some(config) = read_remote_config(&conn)? else {
        return Ok(Vec::new());
    };
    let backups_dir = vault_backups_dir(&config.path);
    if !backups_dir.exists() {
        return Ok(Vec::new());
    }

    let mut backups = Vec::new();
    for entry in fs::read_dir(backups_dir)? {
        let entry = entry?;
        if !entry.metadata()?.is_dir() {
            continue;
        }
        if let Ok(metadata) = metadata_from_vault_backup_dir(&entry.path()) {
            backups.push(metadata);
        }
    }
    backups.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    Ok(backups)
}

#[tauri::command]
pub fn delete_remote_vault_backup(path: String) -> Result<bool, AppError> {
    let backup_dir = PathBuf::from(path);
    if !backup_dir.exists() {
        return Ok(false);
    }
    if !vault_backup_archive_path(&backup_dir).exists() {
        return Err(AppError::Validation(
            "Selected folder is not a Refx vault backup.".to_string(),
        ));
    }
    fs::remove_dir_all(backup_dir)?;
    Ok(true)
}

#[tauri::command]
pub fn restore_remote_vault_backup(
    app: AppHandle,
    path: String,
) -> Result<RestoreRemoteVaultBackupResult, AppError> {
    let safety_backup = create_remote_vault_backup(
        app.clone(),
        RemoteVaultBackupInput {
            automatic: Some(false),
        },
    )?;
    let conn = open_db(&app)?;
    let (config, current_manifest) = require_remote_writer(&conn)?;
    let backup_dir = PathBuf::from(path);
    let backup = metadata_from_vault_backup_dir(&backup_dir)?;
    let archive = read_vault_backup_archive(&backup_dir)?;
    let mut snapshot = read_backup_snapshot(&backup_dir)?;
    let restored_at = now_iso();
    let next_revision = current_manifest.revision + 1;

    for blob in archive.files.iter() {
        copy_vault_blob(&backup_dir, &config.path, blob)?;
    }

    snapshot.revision = next_revision;
    snapshot.updated_at = restored_at.clone();
    snapshot.device_id = config.device_id.clone();
    let payload = serde_json::to_string_pretty(&snapshot)
        .map_err(|error| AppError::Validation(format!("Could not serialize restored vault snapshot: {error}")))?;
    fs::write(snapshot_path(&config.path), payload.as_bytes())?;
    let snapshot_sha256 = sha256_bytes(payload.as_bytes());

    let manifest = RemoteVaultManifest {
        format_version: REMOTE_VAULT_FORMAT_VERSION,
        vault_id: config.vault_id.clone(),
        updated_at: restored_at.clone(),
        revision: next_revision,
        device_id: config.device_id.clone(),
        snapshot_sha256: Some(snapshot_sha256),
        files: snapshot.files.clone(),
        active_lease: read_lease(&config.path)?,
    };
    write_manifest(&config.path, &manifest)?;
    replace_local_tables_from_snapshot(&app, snapshot)?;
    set_setting_json(&conn, "remoteLastPulledAt", &restored_at)?;
    set_setting_json(&conn, "remoteLastPushedAt", &restored_at)?;

    Ok(RestoreRemoteVaultBackupResult {
        backup,
        safety_backup,
        status: vault_status(&app, &conn, false)?,
    })
}

#[tauri::command]
pub fn run_scheduled_remote_vault_backup_if_due(
    app: AppHandle,
    input: RunScheduledRemoteVaultBackupInput,
) -> Result<Option<RemoteVaultBackupMetadata>, AppError> {
    if input.interval_days < 1 {
        return Err(AppError::Validation(
            "Automatic backup interval must be at least 1 day.".to_string(),
        ));
    }
    if input.keep_count < 1 || input.keep_count > 10 {
        return Err(AppError::Validation(
            "Automatic backup retention must be between 1 and 10 backups.".to_string(),
        ));
    }

    let conn = open_db(&app)?;
    if read_remote_config(&conn)?.is_none() {
        return Ok(None);
    }
    let last_run = parse_setting_string(read_setting(&conn, "remoteVaultBackupLastRunAt")?);
    let due = last_run
        .and_then(|value| DateTime::parse_from_rfc3339(&value).ok())
        .map(|value| Utc::now() - value.with_timezone(&Utc) >= Duration::days(input.interval_days))
        .unwrap_or(true);
    if !due {
        return Ok(None);
    }

    let backup = create_remote_vault_backup(
        app.clone(),
        RemoteVaultBackupInput {
            automatic: Some(true),
        },
    )?;
    let conn = open_db(&app)?;
    set_setting_json(&conn, "remoteVaultBackupLastRunAt", now_iso())?;
    prune_old_remote_vault_backups(&app, input.keep_count)?;
    Ok(Some(backup))
}

fn read_vault_backup_archive(backup_dir: &Path) -> Result<RemoteVaultBackupArchive, AppError> {
    let raw = fs::read_to_string(vault_backup_archive_path(backup_dir))?;
    serde_json::from_str::<RemoteVaultBackupArchive>(&raw)
        .map_err(|error| AppError::Validation(format!("Could not read vault backup metadata: {error}")))
}

fn read_backup_snapshot(backup_dir: &Path) -> Result<RemoteVaultSnapshot, AppError> {
    let raw = fs::read_to_string(backup_dir.join(REMOTE_VAULT_SNAPSHOT_FILE))?;
    serde_json::from_str::<RemoteVaultSnapshot>(&raw)
        .map_err(|error| AppError::Validation(format!("Could not read vault backup snapshot: {error}")))
}

fn metadata_from_vault_backup_dir(backup_dir: &Path) -> Result<RemoteVaultBackupMetadata, AppError> {
    let archive = read_vault_backup_archive(backup_dir)?;
    let snapshot = read_backup_snapshot(backup_dir)?;
    let document_count = snapshot
        .tables
        .get("documents")
        .map(|rows| rows.len() as i64)
        .unwrap_or(0);
    let note_count = snapshot
        .tables
        .get("notes")
        .map(|rows| rows.len() as i64)
        .unwrap_or(0);
    let relation_count = snapshot
        .tables
        .get("document_relations")
        .map(|rows| rows.len() as i64)
        .unwrap_or(0);
    let file_name = backup_dir
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("vault-backup")
        .to_string();

    Ok(RemoteVaultBackupMetadata {
        id: archive.backup_id,
        file_name,
        path: backup_dir.to_string_lossy().to_string(),
        created_at: archive.created_at,
        revision: archive.revision,
        file_size: directory_size(backup_dir)?,
        automatic: archive.automatic,
        document_count,
        note_count,
        relation_count,
        blob_count: archive.files.len() as i64,
    })
}

fn copy_vault_blob(source_root: &Path, target_root: &Path, blob: &RemoteVaultBlob) -> Result<(), AppError> {
    let source = source_root.join(&blob.relative_path);
    if !source.exists() || !source.is_file() {
        return Err(AppError::Validation(format!(
            "Vault blob is missing: {}",
            blob.relative_path
        )));
    }
    let target = target_root.join(&blob.relative_path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::copy(&source, &target)?;
    let (sha256, size) = hash_file(&target)?;
    if sha256 != blob.sha256 || size != blob.size {
        let _ = fs::remove_file(&target);
        return Err(AppError::Validation(format!(
            "Vault backup verification failed for {}.",
            blob.relative_path
        )));
    }
    Ok(())
}

fn prune_old_remote_vault_backups(app: &AppHandle, keep_count: i64) -> Result<(), AppError> {
    let mut automatic_backups = list_remote_vault_backups(app.clone())?
        .into_iter()
        .filter(|backup| backup.automatic)
        .collect::<Vec<_>>();
    automatic_backups.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    for backup in automatic_backups.into_iter().skip(keep_count as usize) {
        let _ = delete_remote_vault_backup(backup.path);
    }
    Ok(())
}

fn build_snapshot(
    app: &AppHandle,
    conn: &Connection,
    vault_root: &Path,
    vault_id: &str,
    device_id: &str,
    revision: i64,
    previous_files: &[RemoteVaultBlob],
    dirty_state: &RemoteVaultSyncDirtyState,
) -> Result<(RemoteVaultSnapshot, BlobCopyStats), AppError> {
    let should_refresh_tables = dirty_state.snapshot_tables_dirty || dirty_state.reader_state_dirty;
    let mut tables = if should_refresh_tables {
        let mut tables = HashMap::new();
        for table in REMOTE_SYNC_TABLES {
            tables.insert(table.to_string(), read_table(conn, table)?);
        }
        tables
    } else if let Ok(previous_snapshot) = read_snapshot(vault_root) {
        previous_snapshot.tables
    } else {
        let mut tables = HashMap::new();
        for table in REMOTE_SYNC_TABLES {
            tables.insert(table.to_string(), read_table(conn, table)?);
        }
        tables
    };

    let (files, stats) = collect_document_blobs(vault_root, &tables, previous_files, dirty_state)?;
    strip_local_document_paths(&mut tables);
    let updated_at = now_iso();
    let _ = app;
    Ok((
        RemoteVaultSnapshot {
            format_version: REMOTE_VAULT_FORMAT_VERSION,
            vault_id: vault_id.to_string(),
            updated_at,
            revision,
            device_id: device_id.to_string(),
            tables,
            files,
        },
        stats,
    ))
}

fn read_table(conn: &Connection, table: &str) -> Result<Vec<Map<String, Value>>, AppError> {
    validate_sql_identifier(table)?;
    let mut stmt = conn.prepare(&format!("SELECT * FROM \"{table}\""))?;
    let column_names = stmt
        .column_names()
        .iter()
        .map(|name| name.to_string())
        .collect::<Vec<_>>();
    let rows = stmt.query_map([], |row| {
        let mut out = Map::new();
        for (index, column_name) in column_names.iter().enumerate() {
            out.insert(column_name.clone(), sqlite_value_to_json(row.get_ref(index)?));
        }
        Ok(out)
    })?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    Ok(result)
}

fn sqlite_value_to_json(value: ValueRef<'_>) -> Value {
    match value {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(value) => Value::from(value),
        ValueRef::Real(value) => Value::from(value),
        ValueRef::Text(value) => Value::String(String::from_utf8_lossy(value).to_string()),
        ValueRef::Blob(value) => Value::String(String::from_utf8_lossy(value).to_string()),
    }
}

fn json_to_sql_value(value: Option<&Value>) -> SqlValue {
    match value {
        Some(Value::Null) | None => SqlValue::Null,
        Some(Value::Bool(value)) => SqlValue::Integer(if *value { 1 } else { 0 }),
        Some(Value::Number(value)) => {
            if let Some(integer) = value.as_i64() {
                SqlValue::Integer(integer)
            } else if let Some(float) = value.as_f64() {
                SqlValue::Real(float)
            } else {
                SqlValue::Null
            }
        }
        Some(Value::String(value)) => SqlValue::Text(value.clone()),
        Some(other) => SqlValue::Text(other.to_string()),
    }
}

fn validate_sql_identifier(value: &str) -> Result<(), AppError> {
    if value.chars().all(|character| character.is_alphanumeric() || character == '_') {
        Ok(())
    } else {
        Err(AppError::Validation(format!(
            "Invalid SQL identifier: {value}"
        )))
    }
}

fn table_columns(conn: &Connection, table: &str) -> Result<Vec<String>, AppError> {
    validate_sql_identifier(table)?;
    let mut stmt = conn.prepare(&format!("PRAGMA table_info(\"{table}\")"))?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
    let mut columns = Vec::new();
    for row in rows {
        columns.push(row?);
    }
    Ok(columns)
}

fn insert_table_rows(
    conn: &Connection,
    table: &str,
    rows: &[Map<String, Value>],
) -> Result<(), AppError> {
    if rows.is_empty() {
        return Ok(());
    }
    validate_sql_identifier(table)?;
    let db_columns = table_columns(conn, table)?;
    let db_column_set = db_columns.iter().cloned().collect::<HashSet<_>>();

    for row in rows {
        let columns = db_columns
            .iter()
            .filter(|column| db_column_set.contains(*column) && row.contains_key(*column))
            .cloned()
            .collect::<Vec<_>>();
        if columns.is_empty() {
            continue;
        }

        let quoted_columns = columns
            .iter()
            .map(|column| format!("\"{column}\""))
            .collect::<Vec<_>>()
            .join(", ");
        let placeholders = (1..=columns.len())
            .map(|index| format!("?{index}"))
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!("INSERT OR REPLACE INTO \"{table}\" ({quoted_columns}) VALUES ({placeholders})");
        let values = columns
            .iter()
            .map(|column| json_to_sql_value(row.get(column)))
            .collect::<Vec<_>>();
        conn.execute(&sql, params_from_iter(values))?;
    }

    Ok(())
}

fn replace_local_tables_from_snapshot(
    app: &AppHandle,
    snapshot: RemoteVaultSnapshot,
) -> Result<(), AppError> {
    let mut conn = open_db(app)?;
    let tx = conn.transaction()?;
    tx.execute_batch("PRAGMA foreign_keys = OFF;")?;
    for table in REMOTE_SYNC_DELETE_ORDER {
        validate_sql_identifier(table)?;
        tx.execute(&format!("DELETE FROM \"{table}\""), [])?;
    }
    for table in REMOTE_SYNC_INSERT_ORDER {
        let rows = snapshot.tables.get(table).map(Vec::as_slice).unwrap_or(&[]);
        insert_table_rows(&tx, table, rows)?;
    }
    apply_remote_cache_paths(app, &tx, &snapshot.files)?;
    tx.execute_batch("PRAGMA foreign_keys = ON;")?;
    tx.commit()?;
    Ok(())
}

fn strip_local_document_paths(tables: &mut HashMap<String, Vec<Map<String, Value>>>) {
    if let Some(documents) = tables.get_mut("documents") {
        for document in documents {
            for key in [
                "source_path",
                "imported_file_path",
                "extracted_text_path",
                "cover_image_path",
            ] {
                document.insert(key.to_string(), Value::Null);
            }
        }
    }
}

fn value_as_string(row: &Map<String, Value>, key: &str) -> Option<String> {
    row.get(key).and_then(|value| match value {
        Value::String(value) if !value.trim().is_empty() => Some(value.clone()),
        _ => None,
    })
}

fn collect_document_blobs(
    vault_root: &Path,
    tables: &HashMap<String, Vec<Map<String, Value>>>,
    previous_files: &[RemoteVaultBlob],
    dirty_state: &RemoteVaultSyncDirtyState,
) -> Result<(Vec<RemoteVaultBlob>, BlobCopyStats), AppError> {
    let mut files = Vec::new();
    let mut copied_file_count = 0;
    let mut copied_byte_count = 0;
    let previous_by_key = previous_files
        .iter()
        .map(|blob| ((blob.kind.clone(), blob.document_id.clone()), blob.clone()))
        .collect::<HashMap<_, _>>();

    let documents = tables.get("documents").map(Vec::as_slice).unwrap_or(&[]);
    for document in documents {
        let Some(document_id) = value_as_string(document, "id") else {
            continue;
        };
        let library_id = value_as_string(document, "library_id").unwrap_or_else(|| "unfiled".to_string());

        let pdf_candidates = [
            value_as_string(document, "imported_file_path"),
            value_as_string(document, "source_path"),
        ];
        if let Some((blob, copied)) = collect_blob_for_document(
            vault_root,
            previous_by_key.get(&("pdf".to_string(), document_id.clone())),
            "pdf",
            &document_id,
            &format!("blobs/pdfs/{library_id}/{document_id}.pdf"),
            pdf_candidates.into_iter().flatten().map(PathBuf::from).collect(),
            dirty_state.blob_pdf_dirty || dirty_state.snapshot_tables_dirty,
        )? {
            copied_file_count += if copied { 1 } else { 0 };
            copied_byte_count += if copied { blob.size } else { 0 };
            files.push(blob);
        }

        if let Some(text_path) = value_as_string(document, "extracted_text_path") {
            let source = PathBuf::from(text_path);
            let extension = path_extension_or(&source, "json");
            if let Some((blob, copied)) = collect_blob_for_document(
                vault_root,
                previous_by_key.get(&("documentText".to_string(), document_id.clone())),
                "documentText",
                &document_id,
                &format!("blobs/document-text/{document_id}.{extension}"),
                vec![source],
                dirty_state.blob_text_dirty || dirty_state.snapshot_tables_dirty,
            )? {
                copied_file_count += if copied { 1 } else { 0 };
                copied_byte_count += if copied { blob.size } else { 0 };
                files.push(blob);
            }
        }

        if let Some(cover_path) = value_as_string(document, "cover_image_path") {
            let source = PathBuf::from(cover_path);
            let extension = path_extension_or(&source, "jpg");
            if let Some((blob, copied)) = collect_blob_for_document(
                vault_root,
                previous_by_key.get(&("thumbnail".to_string(), document_id.clone())),
                "thumbnail",
                &document_id,
                &format!("blobs/thumbnails/{document_id}.{extension}"),
                vec![source],
                dirty_state.blob_thumbnail_dirty || dirty_state.snapshot_tables_dirty,
            )? {
                copied_file_count += if copied { 1 } else { 0 };
                copied_byte_count += if copied { blob.size } else { 0 };
                files.push(blob);
            }
        }
    }

    Ok((
        files,
        BlobCopyStats {
            copied_file_count,
            copied_byte_count,
        },
    ))
}

fn collect_blob_for_document(
    vault_root: &Path,
    previous_blob: Option<&RemoteVaultBlob>,
    kind: &str,
    document_id: &str,
    relative_path: &str,
    candidates: Vec<PathBuf>,
    should_refresh_blob: bool,
) -> Result<Option<(RemoteVaultBlob, bool)>, AppError> {
    if !should_refresh_blob {
        return Ok(previous_blob.cloned().map(|blob| (blob, false)));
    }

    let target = vault_root.join(relative_path);
    let previous_source = previous_blob
        .map(|blob| vault_root.join(&blob.relative_path))
        .filter(|path| path.exists() && path.is_file());
    let source = candidates
        .into_iter()
        .find(|path| path.exists() && path.is_file())
        .or(previous_source);

    let Some(source) = source else {
        return Ok(previous_blob.cloned().map(|blob| (blob, false)));
    };

    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }

    let (source_sha256, source_size) = hash_file(&source)?;
    let normalized_relative_path = relative_path.replace('\\', "/");
    if let Some(previous_blob) = previous_blob {
        let previous_target = vault_root.join(&previous_blob.relative_path);
        if previous_blob.relative_path == normalized_relative_path
            && previous_blob.sha256 == source_sha256
            && previous_blob.size == source_size
            && previous_target.exists()
            && previous_target.is_file()
        {
            let (existing_target_sha256, existing_target_size) = hash_file(&previous_target)?;
            if existing_target_sha256 == source_sha256 && existing_target_size == source_size {
                return Ok(Some((previous_blob.clone(), false)));
            }
        }
    }

    let mut copied = false;
    if source != target {
        fs::copy(&source, &target)?;
        copied = true;
    }

    let (sha256, size) = hash_file(&target)?;
    if sha256 != source_sha256 || size != source_size {
        let _ = fs::remove_file(&target);
        return Err(AppError::Validation(format!(
            "Remote blob verification failed for document {document_id}."
        )));
    }

    Ok(Some((
        RemoteVaultBlob {
            kind: kind.to_string(),
            document_id: document_id.to_string(),
            relative_path: normalized_relative_path,
            sha256,
            size,
            updated_at: now_iso(),
        },
        copied,
    )))
}

fn path_extension_or(path: &Path, fallback: &str) -> String {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| value.trim().trim_start_matches('.').to_ascii_lowercase())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| fallback.to_string())
}

fn apply_remote_cache_paths(
    app: &AppHandle,
    conn: &Connection,
    files: &[RemoteVaultBlob],
) -> Result<(), AppError> {
    for blob in files {
        let local_path = cache_path_for_blob(app, blob)?;
        let local_path_string = local_path.to_string_lossy().to_string();
        match blob.kind.as_str() {
            "pdf" => {
                conn.execute(
                    "UPDATE documents SET imported_file_path = ?1, source_path = NULL WHERE id = ?2",
                    params![local_path_string, blob.document_id],
                )?;
            }
            "documentText" => {
                conn.execute(
                    "UPDATE documents SET extracted_text_path = ?1 WHERE id = ?2",
                    params![local_path_string, blob.document_id],
                )?;
            }
            "thumbnail" => {
                conn.execute(
                    "UPDATE documents SET cover_image_path = ?1 WHERE id = ?2",
                    params![local_path_string, blob.document_id],
                )?;
            }
            _ => {}
        }
    }
    Ok(())
}

fn materialized_local_path_for_blob(
    app: &AppHandle,
    blob: &RemoteVaultBlob,
) -> Result<PathBuf, AppError> {
    let base = app_data_dir(app)?;
    let extension = Path::new(&blob.relative_path)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.trim().trim_start_matches('.').to_ascii_lowercase())
        .filter(|value| !value.is_empty());

    Ok(match blob.kind.as_str() {
        "pdf" => base.join("pdfs").join(format!("{}.pdf", blob.document_id)),
        "documentText" => base.join("document-text").join(format!(
            "{}.{}",
            blob.document_id,
            extension.unwrap_or_else(|| "json".to_string())
        )),
        "thumbnail" => base.join("thumbnails").join(format!(
            "{}.{}",
            blob.document_id,
            extension.unwrap_or_else(|| "jpg".to_string())
        )),
        _ => base.join("files").join(
            Path::new(&blob.relative_path)
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("blob.bin"),
        ),
    })
}

fn cache_path_for_blob(app: &AppHandle, blob: &RemoteVaultBlob) -> Result<PathBuf, AppError> {
    Ok(cache_root(app)?.join(&blob.relative_path))
}

pub fn cache_remote_document_file_for_document(
    app: &AppHandle,
    document_id: &str,
) -> Result<Option<String>, AppError> {
    let conn = open_db(app)?;
    let Some(config) = read_remote_config(&conn)? else {
        return Ok(None);
    };

    let existing: Option<String> = conn
        .query_row(
            "SELECT imported_file_path FROM documents WHERE id = ?1",
            params![document_id],
            |row| row.get::<_, Option<String>>(0),
        )
        .optional()?
        .flatten();
    if let Some(path) = existing.as_deref() {
        let path = PathBuf::from(path);
        if path.exists() && path.is_file() {
            return Ok(Some(path.to_string_lossy().to_string()));
        }
    }

    if !config.path.exists() {
        return Ok(None);
    }

    let files = match read_snapshot(&config.path) {
        Ok(snapshot) => snapshot.files,
        Err(_) => read_manifest(&config.path)?.map(|manifest| manifest.files).unwrap_or_default(),
    };
    let Some(blob) = files
        .into_iter()
        .find(|blob| blob.kind == "pdf" && blob.document_id == document_id)
    else {
        return Ok(None);
    };

    let remote_path = config.path.join(&blob.relative_path);
    if !remote_path.exists() || !remote_path.is_file() {
        return Ok(None);
    }

    let local_path = cache_path_for_blob(app, &blob)?;
    if let Some(parent) = local_path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::copy(&remote_path, &local_path)?;
    let (sha256, _) = hash_file(&local_path)?;
    if sha256 != blob.sha256 {
        let _ = fs::remove_file(&local_path);
        return Err(AppError::Validation(
            "Cached PDF failed integrity verification.".to_string(),
        ));
    }

    let local_path_string = local_path.to_string_lossy().to_string();
    conn.execute(
        "UPDATE documents SET imported_file_path = ?1, source_path = NULL WHERE id = ?2",
        params![local_path_string, document_id],
    )?;
    enforce_remote_cache_limit(app, config.cache_limit_mb)?;
    Ok(Some(local_path_string))
}

fn sha256_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn hash_file(path: &Path) -> Result<(String, i64), AppError> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut size = 0i64;
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
        size += read as i64;
    }
    Ok((format!("{:x}", hasher.finalize()), size))
}

fn directory_size(path: &Path) -> Result<i64, AppError> {
    if !path.exists() {
        return Ok(0);
    }

    let mut total = 0i64;
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let metadata = entry.metadata()?;
        if metadata.is_dir() {
            total += directory_size(&entry.path())?;
        } else {
            total += metadata.len() as i64;
        }
    }
    Ok(total)
}

fn enforce_remote_cache_limit(app: &AppHandle, cache_limit_mb: i64) -> Result<(), AppError> {
    let max_bytes = cache_limit_mb.max(64) * 1024 * 1024;
    let root = cache_root(app)?;
    if !root.exists() {
        return Ok(());
    }

    let mut files = Vec::new();
    collect_cache_files(&root, &mut files)?;
    let mut total = files.iter().map(|(_, size, _)| *size).sum::<i64>();
    if total <= max_bytes {
        return Ok(());
    }

    files.sort_by_key(|(_, _, modified)| *modified);
    for (path, size, _) in files {
        if total <= max_bytes {
            break;
        }
        if fs::remove_file(&path).is_ok() {
            total -= size;
        }
    }
    Ok(())
}

fn collect_cache_files(
    root: &Path,
    files: &mut Vec<(PathBuf, i64, std::time::SystemTime)>,
) -> Result<(), AppError> {
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let metadata = entry.metadata()?;
        if metadata.is_dir() {
            collect_cache_files(&entry.path(), files)?;
        } else {
            files.push((
                entry.path(),
                metadata.len() as i64,
                metadata.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH),
            ));
        }
    }
    Ok(())
}
