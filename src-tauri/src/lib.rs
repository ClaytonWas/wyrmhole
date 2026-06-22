// This file provides secure Tauri command bindings that delegate to specialized modules.
// All file transfer logic is in files.rs, settings logic is in settings.rs, etc.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WindowEvent,
};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_notification::NotificationExt;
use tokio::sync::Mutex;

// Sync mirror of `minimize_on_close` so the window-close event handler (which is
// not async) can read it without locking the tokio Mutex around AppSettings.
#[derive(Clone)]
struct MinimizeOnClose(Arc<AtomicBool>);

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
async fn cancel_download(download_id: String) -> Result<String, String> {
    files::cancel_download(download_id).await
}

#[tauri::command]
async fn cancel_all_transfers(app_handle: AppHandle) -> Result<String, String> {
    files::cancel_all_transfers(app_handle).await
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
async fn get_relay_server_url(app_handle: AppHandle) -> Result<Option<String>, String> {
    settings::get_relay_server_url(app_handle).await
}

#[tauri::command]
async fn set_relay_server_url(app_handle: AppHandle, value: Option<String>) -> Result<(), String> {
    settings::set_relay_server_url(app_handle, value).await
}

#[tauri::command]
async fn get_minimize_on_start(app_handle: AppHandle) -> Result<bool, String> {
    settings::get_minimize_on_start(app_handle).await
}

#[tauri::command]
async fn set_minimize_on_start(app_handle: AppHandle, value: bool) -> Result<(), String> {
    settings::set_minimize_on_start(app_handle, value).await
}

#[tauri::command]
async fn get_minimize_on_close(app_handle: AppHandle) -> Result<bool, String> {
    settings::get_minimize_on_close(app_handle).await
}

#[tauri::command]
async fn set_minimize_on_close(app_handle: AppHandle, value: bool) -> Result<(), String> {
    settings::set_minimize_on_close(app_handle.clone(), value).await?;
    // Keep the sync mirror used by the close handler in step with the setting.
    app_handle
        .state::<MinimizeOnClose>()
        .0
        .store(value, Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
async fn get_autostart(app_handle: AppHandle) -> Result<bool, String> {
    // Source of truth is the OS (registry / launch agent), not settings.json.
    app_handle
        .autolaunch()
        .is_enabled()
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_autostart(app_handle: AppHandle, value: bool) -> Result<(), String> {
    let manager = app_handle.autolaunch();
    if value {
        manager.enable().map_err(|e| e.to_string())
    } else {
        manager.disable().map_err(|e| e.to_string())
    }
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

#[tauri::command]
async fn test_relay_server(app_handle: AppHandle) -> Result<String, String> {
    files::test_relay_server(app_handle).await
}

// Reveal and focus the main window (used by the tray menu and left-click).
fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // WebKitGTK's DMABUF renderer causes a blank window on some Linux setups
    // (certain GPU drivers, compositors, and VMs — e.g. KDE/X11 on Debian).
    // Disable it unless the user has set the variable themselves, so the
    // override `WEBKIT_DISABLE_DMABUF_RENDERER=0` still re-enables hardware
    // acceleration on systems where it works correctly.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        // SAFETY: this runs at the very start of `run()`, before any other
        // threads are spawned, so there is no concurrent access to the env.
        unsafe {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            let app_settings = settings::init_settings(app.handle());
            let minimize_on_start = app_settings.get_minimize_on_start();
            let minimize_on_close = app_settings.get_minimize_on_close();
            app.manage(Mutex::new(app_settings));

            // Sync mirror read by the (non-async) window-close handler.
            app.manage(MinimizeOnClose(Arc::new(AtomicBool::new(
                minimize_on_close,
            ))));

            files_json::init_received_files(app.handle());
            files_json::init_sent_files(app.handle());

            // System tray: a menu with Show / Quit, plus left-click to reveal.
            let show_item = MenuItem::with_id(app, "show", "Show wyrmhole", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("wyrmhole")
                .menu(&tray_menu)
                // Don't pop the menu on a normal left-click; we handle that below.
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            // Show the window after state is restored (prevents flashing), unless
            // the user chose to start minimized to the tray.
            if !minimize_on_start
                && let Some(window) = app.get_webview_window("main")
            {
                window
                    .show()
                    .unwrap_or_else(|e| eprintln!("Failed to show window: {}", e));
            }

            Ok(())
        })
        // When "minimize on close" is enabled, closing the window hides it to the
        // tray instead of quitting; otherwise the close proceeds and the app exits.
        // The tray's "Quit" item always exits.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let minimize_on_close = window
                    .app_handle()
                    .state::<MinimizeOnClose>()
                    .0
                    .load(Ordering::Relaxed);
                if minimize_on_close {
                    api.prevent_close();
                    window
                        .hide()
                        .unwrap_or_else(|e| eprintln!("Failed to hide window: {}", e));
                    let _ = window
                        .app_handle()
                        .notification()
                        .builder()
                        .title("wyrmhole")
                        .body("wyrmhole is still running in the tray")
                        .show();
                }
            }
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            send_file_call,
            send_multiple_files_call,
            cancel_send,
            cancel_download,
            cancel_all_transfers,
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
            get_relay_server_url,
            set_relay_server_url,
            get_minimize_on_start,
            set_minimize_on_start,
            get_minimize_on_close,
            set_minimize_on_close,
            get_autostart,
            set_autostart,
            export_received_files_json,
            export_sent_files_json,
            test_relay_server
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
