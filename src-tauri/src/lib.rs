// This file provides secure Tauri command bindings that delegate to specialized modules.
// All file transfer logic is in files.rs, settings logic is in settings.rs, etc.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{
    AppHandle, Emitter, Manager, WindowEvent,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_notification::NotificationExt;
use tokio::sync::Mutex;

// Sync mirror of `minimize_on_close` so the window-close event handler (which is
// not async) can read it without locking the tokio Mutex around AppSettings.
#[derive(Clone)]
struct MinimizeOnClose(Arc<AtomicBool>);

// Name of the event the frontend listens for to start a send for OS-provided
// paths. The payload is the full batch, which the frontend sends as one package.
const SEND_FROM_OS_EVENT: &str = "send-files-from-os";

// How long to wait for more paths before dispatching a batch. Windows launches
// one process per file on a multi-selection, so those arrive as separate
// single-instance forwards within a few milliseconds; this window coalesces
// them (and the cold-start argv) into a single send.
const BATCH_DEBOUNCE_MS: u64 = 700;

// Accumulates OS-provided paths (cold-start argv + single-instance/open-event
// forwards) and flushes them to the frontend as one batch once they stop
// arriving and the frontend is listening. `generation` invalidates stale flush
// timers when a newer path arrives.
#[derive(Default)]
struct OsSendQueue(std::sync::Mutex<OsSendQueueInner>);

#[derive(Default)]
struct OsSendQueueInner {
    paths: Vec<String>,
    generation: u64,
    frontend_ready: bool,
}

// Pull real filesystem paths out of a launch argument vector. Skips the
// executable (first arg) and any `-`-prefixed flags, and keeps only arguments
// that actually exist on disk so stray tokens don't get treated as files.
fn extract_file_paths(args: &[String]) -> Vec<String> {
    args.iter()
        .skip(1)
        .filter(|a| !a.starts_with('-'))
        .filter(|a| std::path::Path::new(a.as_str()).exists())
        .cloned()
        .collect()
}

// Add OS-provided paths to the batch and schedule a debounced flush. Safe to
// call before the frontend is ready (paths just wait in the queue).
fn enqueue_os_paths(app: &AppHandle, new_paths: Vec<String>) {
    if new_paths.is_empty() {
        return;
    }
    show_main_window(app);

    let generation = {
        let queue = app.state::<OsSendQueue>();
        let mut q = queue.0.lock().unwrap();
        for p in new_paths {
            if !q.paths.contains(&p) {
                q.paths.push(p);
            }
        }
        q.generation += 1;
        q.generation
    };

    schedule_flush(app.clone(), generation);
}

// After the debounce window, dispatch the batch if no newer path arrived and the
// frontend is listening; otherwise leave it for the next trigger to flush.
fn schedule_flush(app: AppHandle, generation: u64) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(BATCH_DEBOUNCE_MS)).await;

        let paths = {
            let queue = app.state::<OsSendQueue>();
            let mut q = queue.0.lock().unwrap();
            if q.generation != generation || !q.frontend_ready {
                return;
            }
            std::mem::take(&mut q.paths)
        };

        if !paths.is_empty() {
            let _ = app.emit(SEND_FROM_OS_EVENT, paths);
            show_main_window(&app);
        }
    });
}

pub mod context_menu;
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

// Called by the frontend once its `send-files-from-os` listener is attached.
// Marks the queue ready and triggers a flush so any paths buffered during a
// cold start get dispatched as one batch.
#[tauri::command]
fn frontend_ready(app: AppHandle) {
    let generation = {
        let queue = app.state::<OsSendQueue>();
        let mut q = queue.0.lock().unwrap();
        q.frontend_ready = true;
        q.generation += 1;
        q.generation
    };
    schedule_flush(app, generation);
}

// Whether the OS "Send via wyrmhole" context-menu entry is currently registered
// for this user. Reads live OS state so the Settings toggle reflects reality.
#[tauri::command]
fn get_context_menu_enabled() -> Result<bool, String> {
    context_menu::is_enabled()
}

// Opt-in registration of the context-menu entry, driven by the Settings toggle.
// The installer never modifies this; only an explicit user action does.
#[tauri::command]
fn set_context_menu_enabled(value: bool) -> Result<(), String> {
    context_menu::set_enabled(value)
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
        // Must be the FIRST plugin registered. When a second launch happens
        // (e.g. the user picks "Send via wyrmhole" while the app is already in
        // the tray), its argv is forwarded here instead of starting a new
        // process; we turn the paths into a send on the existing instance.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            enqueue_os_paths(app, extract_file_paths(&argv));
        }))
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

            // Paths this process was launched with (file-manager context-menu
            // entry on a cold start). Queued now; dispatched as one batch once
            // the frontend signals it's ready via `frontend_ready`.
            let launch_paths = extract_file_paths(&std::env::args().collect::<Vec<_>>());
            let launched_with_files = !launch_paths.is_empty();
            app.manage(OsSendQueue::default());
            if launched_with_files {
                enqueue_os_paths(app.handle(), launch_paths);
            }

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
            // the user chose to start minimized to the tray. Launching via a
            // file-manager "Send via wyrmhole" entry always shows the window so
            // the transfer code is visible, overriding start-minimized.
            if (!minimize_on_start || launched_with_files)
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
            test_relay_server,
            frontend_ready,
            get_context_menu_enabled,
            set_context_menu_enabled
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {
            // macOS delivers files chosen via Finder Services / "Open With" as
            // Apple "open" events rather than argv, so handle them here. Other
            // platforms route through argv + single-instance above.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = _event {
                let paths: Vec<String> = urls
                    .iter()
                    .filter_map(|u| u.to_file_path().ok())
                    .map(|p| p.to_string_lossy().into_owned())
                    .collect();
                enqueue_os_paths(_app_handle, paths);
            }
        });
}
