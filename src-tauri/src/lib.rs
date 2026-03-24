mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_app_data_dir,
            commands::ensure_app_directories,
            commands::generate_document_id,
            commands::initialize_database,
            commands::list_libraries,
            commands::create_library,
            commands::list_all_documents,
            commands::list_documents_by_library,
            commands::get_document_by_id,
            commands::create_document,
            commands::update_document_metadata,
            commands::delete_document,
            commands::add_tag_to_document,
            commands::remove_tag_from_document,
            commands::list_annotations_for_document,
            commands::create_note,
            commands::list_notes,
            commands::get_settings,
            commands::set_settings,
            commands::clear_local_data,
        ])
        .setup(|app| {
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
