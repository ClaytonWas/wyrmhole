// This file provides secure Tauri command bindings that delegate to specialized modules.
// All file transfer logic is in files.rs, settings logic is in settings.rs, etc.

use tauri::{AppHandle, Manager};
use tokio::sync::Mutex;

pub mod files;
pub mod files_json;
pub mod settings;

// Secure bindings - these are the only functions exposed to the frontend
// All actual logic is delegated to the appropriate modules

#[tauri::command]
async fn send_file_call(
    app_handle: AppHandle,
    file_path: &str,
    send_id: String,
) -> Result<String, String> {
    files::send_file_call(app_handle, file_path, send_id).await
}

#[tauri::command]
async fn send_multiple_files_call(
    app_handle: AppHandle,
    file_paths: Vec<String>,
    send_id: String,
    folder_name: Option<String>,
) -> Result<String, String> {
    files::send_multiple_files_call(app_handle, file_paths, send_id, folder_name).await
}

#[tauri::command]
async fn cancel_send(send_id: String, app_handle: AppHandle) -> Result<String, String> {
    files::cancel_send(send_id, app_handle).await
}

#[tauri::command]
async fn cancel_download(download_id: String, app_handle: AppHandle) -> Result<String, String> {
    files::cancel_download(download_id, app_handle).await
}

#[tauri::command]
async fn request_file_call(receive_code: &str, connection_id: String) -> Result<String, String> {
    files::request_file_call(receive_code, connection_id).await
}

#[tauri::command]
async fn cancel_connection(connection_id: String) -> Result<String, String> {
    files::cancel_connection(connection_id).await
}

#[tauri::command]
async fn receiving_file_accept(id: String, app_handle: AppHandle) -> Result<String, String> {
    files::receiving_file_accept(id, app_handle).await
}

#[tauri::command]
async fn receiving_file_deny(id: String) -> Result<String, String> {
    files::receiving_file_deny(id).await
}

#[tauri::command]
async fn set_download_directory(app_handle: AppHandle, new_path: String) -> Result<(), String> {
    settings::set_download_directory(app_handle, new_path).await
}

#[tauri::command]
async fn get_download_path(app_handle: AppHandle) -> Result<String, String> {
    settings::get_download_path(app_handle).await
}

#[tauri::command]
async fn get_auto_extract_tarballs(app_handle: AppHandle) -> Result<bool, String> {
    settings::get_auto_extract_tarballs(app_handle).await
}

#[tauri::command]
async fn set_auto_extract_tarballs(app_handle: AppHandle, value: bool) -> Result<(), String> {
    settings::set_auto_extract_tarballs(app_handle, value).await
}

#[tauri::command]
async fn get_default_folder_name_format(app_handle: AppHandle) -> Result<String, String> {
    settings::get_default_folder_name_format(app_handle).await
}

#[tauri::command]
async fn set_default_folder_name_format(
    app_handle: AppHandle,
    value: String,
) -> Result<(), String> {
    settings::set_default_folder_name_format(app_handle, value).await
}

#[tauri::command]
async fn received_files_data(app_handle: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let files = files_json::get_received_files_json_data(app_handle).await?;
    Ok(files)
}

#[tauri::command]
async fn export_received_files_json(
    app_handle: AppHandle,
    file_path: String,
) -> Result<(), String> {
    settings::export_received_files_json(app_handle, file_path).await
}

#[tauri::command]
async fn sent_files_data(app_handle: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let files = files_json::get_sent_files_json_data(app_handle).await?;
    Ok(files)
}

#[tauri::command]
async fn export_sent_files_json(app_handle: AppHandle, file_path: String) -> Result<(), String> {
    settings::export_sent_files_json(app_handle, file_path).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            let app_settings = settings::init_settings(app.handle());
            app.manage(Mutex::new(app_settings));

            files_json::init_received_files(app.handle());
            files_json::init_sent_files(app.handle());

            // Make window visible after state is restored (prevents flashing)
            if let Some(window) = app.get_webview_window("main") {
                window
                    .show()
                    .unwrap_or_else(|e| eprintln!("Failed to show window: {}", e));
            }

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            send_file_call,
            send_multiple_files_call,
            cancel_send,
            cancel_download,
            request_file_call,
            cancel_connection,
            receiving_file_accept,
            receiving_file_deny,
            set_download_directory,
            received_files_data,
            sent_files_data,
            get_download_path,
            get_auto_extract_tarballs,
            set_auto_extract_tarballs,
            get_default_folder_name_format,
            set_default_folder_name_format,
            export_received_files_json,
            export_sent_files_json
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
