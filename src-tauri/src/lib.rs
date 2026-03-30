mod commands;
mod backup;

use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::{Manager, WindowEvent};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct PersistedWindowState {
    maximized: bool,
    fullscreen: bool,
}

fn window_state_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<PathBuf> {
    let app_data_dir = app.path().app_data_dir().ok()?;
    if fs::create_dir_all(&app_data_dir).is_err() {
        return None;
    }

    Some(app_data_dir.join("window-state.json"))
}

fn save_window_state<R: tauri::Runtime>(window: &tauri::Window<R>) {
    let Some(path) = window_state_path(&window.app_handle()) else {
        return;
    };

    let mut state = fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str::<PersistedWindowState>(&raw).ok())
        .unwrap_or_default();

    state.maximized = window.is_maximized().unwrap_or(false);
    state.fullscreen = window.is_fullscreen().unwrap_or(false);

    if let Ok(json) = serde_json::to_string_pretty(&state) {
        let _ = fs::write(path, json);
    }
}

fn restore_window_state<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    let Some(path) = window_state_path(&window.app_handle()) else {
        return;
    };

    let Ok(raw) = fs::read_to_string(path) else {
        return;
    };

    let Ok(state) = serde_json::from_str::<PersistedWindowState>(&raw) else {
        return;
    };

    if state.maximized {
        let _ = window.maximize();
    }

    if state.fullscreen {
        let _ = window.set_fullscreen(true);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_app_data_dir,
            commands::ensure_app_directories,
            commands::generate_document_id,
            commands::initialize_database,
            commands::list_libraries,
            commands::create_library,
            commands::update_library,
            commands::delete_library,
            commands::list_all_documents,
            commands::list_documents_by_library,
            commands::get_document_by_id,
            commands::create_document,
            commands::update_document_metadata,
            commands::delete_document,
            commands::merge_documents,
            commands::move_documents_to_library,
            commands::open_document_file_location,
            commands::import_book_cover,
            commands::start_book_cover_upload_session,
            commands::get_book_cover_upload_session_status,
            commands::create_document_relation,
            commands::update_document_relation,
            commands::delete_document_relation,
            commands::list_document_relations_for_library,
            commands::list_document_doi_references_for_document,
            commands::list_document_doi_references_pointing_to_document,
            commands::replace_document_doi_references,
            commands::recheck_document_doi_references,
            commands::rebuild_auto_citation_relations,
            commands::rebuild_auto_citation_relations_for_document,
            commands::list_graph_views,
            commands::create_graph_view,
            commands::update_graph_view,
            commands::delete_graph_view,
            commands::duplicate_graph_view,
            commands::list_graph_view_node_layouts,
            commands::upsert_graph_view_node_layout,
            commands::reset_graph_view_node_layouts,
            commands::add_tag_to_document,
            commands::remove_tag_from_document,
            commands::list_all_annotations,
            commands::list_annotations_for_document,
            commands::create_annotation,
            commands::delete_annotation,
            commands::create_note,
            commands::update_note,
            commands::list_notes,
            commands::delete_note,
            commands::get_settings,
            commands::set_settings,
            commands::clear_local_data,
            backup::create_backup,
            backup::list_backups,
            backup::delete_backup,
            backup::restore_backup,
            backup::run_scheduled_backup_if_due,
        ])
        .setup(|app| {
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;

            if let (Some(window), Some(icon)) = (
                app.get_webview_window("main"),
                app.default_window_icon().cloned(),
            ) {
                if let Err(error) = window.set_icon(icon) {
                    eprintln!("Failed to apply window icon: {}", error);
                }

                restore_window_state(&window);
            }

            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = commands::setup_app_directories(&app_handle).await {
                    eprintln!("Failed to setup app directories: {}", e);
                }
                if let Err(e) = commands::initialize_database(app_handle) {
                    eprintln!("Failed to initialize database: {}", e);
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }

            match event {
                WindowEvent::Moved(_)
                | WindowEvent::Resized(_)
                | WindowEvent::CloseRequested { .. }
                | WindowEvent::Destroyed => save_window_state(window),
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
