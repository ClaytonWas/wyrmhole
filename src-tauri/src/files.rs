// This file contains all file transfer logic for the Tauri application.
// It handles sending files, receiving files, tarball operations, and transfer state management.

use chrono::prelude::*;
use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use futures::FutureExt;
use magic_wormhole::{transfer, transit, Code, MailboxConnection, Wormhole, WormholeError};
use once_cell::sync::Lazy;
use std::{
    collections::HashMap,
    net::SocketAddr,
    path::Path,
    path::PathBuf,
    time::Instant,
};
use tar::{Archive, Builder};
use tauri::{AppHandle, Emitter, Manager};
use tokio::fs::File;
use tokio::sync::{oneshot, Mutex};
use tokio_util::compat::TokioAsyncReadCompatExt;
use tokio_util::compat::TokioAsyncWriteCompatExt;
use uuid::Uuid;

use crate::files_json;
use crate::settings;

// State structures for tracking active transfers
struct OpenRequests {
    request: transfer::ReceiveRequest,
}

struct ActiveSend {
    code: String,
    cancel_tx: Option<oneshot::Sender<()>>,
}

struct ActiveDownload {
    cancel_tx: oneshot::Sender<()>,
    file_name: String,
}

struct ActiveConnection {
    cancel_tx: oneshot::Sender<()>,
}

// Static hash maps for tracking active transfers
static REQUESTS_HASHMAP: Lazy<Mutex<HashMap<String, OpenRequests>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

static ACTIVE_SENDS: Lazy<Mutex<HashMap<String, ActiveSend>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

static ACTIVE_DOWNLOADS: Lazy<Mutex<HashMap<String, ActiveDownload>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

static ACTIVE_CONNECTIONS: Lazy<Mutex<HashMap<String, ActiveConnection>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

// Public API functions - these are called from lib.rs as secure bindings

pub async fn send_file_call(
    app_handle: AppHandle,
    file_path: &str,
    send_id: String,
) -> Result<String, String> {
    let overall_start = Instant::now();
    let config = transfer::APP_CONFIG.clone();

    // Get file name early for status updates
    let path = Path::new(file_path);
    let file_name = path
        .file_name()
        .and_then(|os| os.to_str())
        .unwrap_or("unknown")
        .to_string();

    // Emit "Preparing..." status before mailbox connection
    let _ = app_handle.emit(
        "send-progress",
        serde_json::json!({
            "id": send_id.clone(),
            "file_name": file_name.clone(),
            "sent": 0,
            "total": 0,
            "percentage": 0,
            "code": "",
            "status": "preparing"
        }),
    );

    // Create cancel channel for this send
    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();

    // Create the mailbox connection
    let mailbox_connection = match MailboxConnection::create(config, 2).await {
        Ok(conn) => {
            let code = conn.code();
            let code_string = code.to_string();

            // Store the connection code and cancel sender for this send
            ACTIVE_SENDS.lock().await.insert(
                send_id.clone(),
                ActiveSend {
                    code: code_string.clone(),
                    cancel_tx: Some(cancel_tx),
                },
            );

            let _ = app_handle.emit(
                "connection-code",
                serde_json::json!({
                    "status": "success",
                    "code": code_string.clone(),
                    "send_id": send_id
                }),
            );

            // Emit "Waiting..." status after mailbox connection is established
            let _ = app_handle.emit(
                "send-progress",
                serde_json::json!({
                    "id": send_id.clone(),
                    "file_name": file_name.clone(),
                    "sent": 0,
                    "total": 0,
                    "percentage": 0,
                    "code": code_string.clone(),
                    "status": "waiting"
                }),
            );

            conn
        }
        Err(e) => {
            let error_msg = format!("Failed to connect: {}", e);
            let _ = app_handle.emit(
                "connection-code",
                serde_json::json!({
                    "status": "error",
                    "message": error_msg.clone()
                }),
            );
            let _ = app_handle.emit(
                "send-error",
                serde_json::json!({
                    "id": send_id,
                    "file_name": file_name.clone(),
                    "error": error_msg.clone()
                }),
            );
            return Err(error_msg);
        }
    };

    // Construct relay hints, preferring a user-configured relay server if available.
    let relay_hints = build_relay_hints(&app_handle).await;
    let abilities = transit::Abilities::ALL;

    // Use the cancel receiver as the cancel future
    let cancel_call = cancel_rx.map(|_| ());

    // Connect the wormhole - this will wait until the receiver connects
    let wormhole = Wormhole::connect(mailbox_connection).await.map_err(|e| {
        let msg = format!("Failed to connect to Wormhole: {}", e);
        println!("[wyrmhole][files][error] {}", msg);
        let _ = app_handle.emit(
            "send-error",
            serde_json::json!({
                "id": send_id.clone(),
                "file_name": file_name.clone(),
                "error": msg.clone()
            }),
        );
        msg
    })?;

    // Verify the path exists and convert to absolute path
    if !path.exists() {
        let error_msg = format!("File or folder does not exist: {}", file_path);
        let _ = app_handle.emit(
            "send-error",
            serde_json::json!({
                "id": send_id.clone(),
                "file_name": file_name.clone(),
                "error": error_msg.clone()
            }),
        );
        return Err(error_msg);
    }

    // Convert to absolute path (but avoid canonicalize on Windows to prevent \\?\ prefix issues)
    let absolute_path = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .map_err(|e| format!("Failed to get current directory: {}", e))?
            .join(path)
    };

    // Verify the path exists
    if !absolute_path.exists() {
        let error_msg = format!("Path does not exist: {}", absolute_path.display());
        let _ = app_handle.emit(
            "send-error",
            serde_json::json!({
                "id": send_id.clone(),
                "file_name": file_name.clone(),
                "error": error_msg.clone()
            }),
        );
        return Err(error_msg);
    }

    // Clone values needed for progress handler
    let progress_id = send_id.clone();
    let progress_file_name = file_name.clone();
    let progress_app_handle = app_handle.clone();
    let error_app_handle = app_handle.clone();
    let error_id = send_id.clone();
    let error_file_name = file_name.clone();

    // Get the connection code before the closure (since closure can't be async)
    let send_code = {
        let active_sends = ACTIVE_SENDS.lock().await;
        active_sends
            .get(&send_id)
            .map(|s| s.code.clone())
            .unwrap_or_default()
    };

    // Check if it's a folder - if so, create a tarball first
    let is_folder = absolute_path.is_dir();

    if is_folder {
        let tar_start = Instant::now();
        // For folders, create a tarball first to ensure proper transfer
        // Emit "Packaging..." status
        let _ = app_handle.emit(
            "send-progress",
            serde_json::json!({
                "id": send_id.clone(),
                "file_name": format!("{}.gz", file_name.clone()),
                "sent": 0,
                "total": 0,
                "percentage": 0,
                "code": send_code.clone(),
                "status": "packaging"
            }),
        );

        // Create temporary tarball
        let temp_dir = std::env::temp_dir();
        let tarball_name = format!("{}.gz", file_name);
        let tarball_path = temp_dir.join(format!(
            "wyrmhole_send_{}_{}",
            Uuid::new_v4(),
            &tarball_name
        ));

        // Create the tarball (synchronous operation, run in blocking task)
        let tarball_size = tokio::task::spawn_blocking({
            let absolute_path = absolute_path.clone();
            let tarball_path = tarball_path.clone();
            let folder_name = file_name.clone();
            move || create_tarball_from_folder(&absolute_path, &tarball_path, &folder_name)
        })
        .await
        .map_err(|e| format!("Failed to create tarball: {}", e))??;

        println!(
            "[wyrmhole][perf][files] Created tarball: {} ({} bytes) from folder: {} in {:?}",
            tarball_path.display(),
            tarball_size,
            absolute_path.display(),
            tar_start.elapsed()
        );

        // Open the tarball file for sending
        let file = File::open(&tarball_path).await.map_err(|e| {
            let error_msg = format!("Failed to open tarball: {}", e);
            let _ = error_app_handle.emit(
                "send-error",
                serde_json::json!({
                    "id": error_id,
                    "file_name": error_file_name,
                    "error": error_msg.clone()
                }),
            );
            let tarball_path_clone = tarball_path.clone();
            tokio::spawn(async move {
                let _ = tokio::fs::remove_file(&tarball_path_clone).await;
            });
            error_msg
        })?;

        // Get the actual file size
        let actual_tarball_size = file
            .metadata()
            .await
            .map_err(|e| format!("Failed to get tarball file metadata: {}", e))?
            .len();

        let mut compat_file = file.compat();
        let progress_file_name = tarball_name.clone();

        // Send the tarball using send_file
        let transfer_start = Instant::now();
        transfer::send_file(
            wormhole,
            relay_hints,
            &mut compat_file,
            tarball_name.clone(),
            actual_tarball_size,
            abilities,
            |_info| {
                println!("[wyrmhole][files][info] Transit established for folder send");
            },
            // Progress handler (no per-chunk logging for performance)
            move |sent, total| {
                let percentage = if total > 0 {
                    (sent as f64 / total as f64 * 100.0) as u64
                } else {
                    0
                };

                let _ = progress_app_handle.emit(
                    "send-progress",
                    serde_json::json!({
                        "id": progress_id,
                        "file_name": progress_file_name,
                        "sent": sent,
                        "total": total,
                        "percentage": percentage,
                        "code": send_code.clone(),
                        "status": "sending"
                    }),
                );
            },
            cancel_call,
        )
        .await
        .map_err(|e| {
            let error_message = format!(
                "Failed to send folder: {} (tarball: {})",
                e,
                tarball_path.display()
            );
            println!(
                "[wyrmhole][files][error] Send folder failed: {}",
                error_message
            );
            let _ = error_app_handle.emit(
                "send-error",
                serde_json::json!({
                    "id": error_id,
                    "file_name": error_file_name,
                    "error": error_message.clone()
                }),
            );
            let tarball_path_clone = tarball_path.clone();
            tokio::spawn(async move {
                let _ = tokio::fs::remove_file(&tarball_path_clone).await;
            });
            error_message
        })?;

        let elapsed = transfer_start.elapsed();
        if elapsed.as_secs_f64() > 0.0 {
            let mb = actual_tarball_size as f64 / (1024.0 * 1024.0);
            let mbps = mb / elapsed.as_secs_f64();
            println!(
            "[wyrmhole][perf][files] Folder transfer complete: {:.2} MiB in {:?} ({:.2} MiB/s)",
                mb, elapsed, mbps
            );
        }

        // Clean up temporary tarball
        let _ = tokio::fs::remove_file(&tarball_path).await;

        // Remove from active sends when complete and get the code
        let connection_code = {
            let active_sends = ACTIVE_SENDS.lock().await;
            active_sends
                .get(&send_id)
                .map(|s| s.code.clone())
                .unwrap_or_default()
        };
        ACTIVE_SENDS.lock().await.remove(&send_id);

        // Add to sent files history (for folder, use the tarball name without extension)
        let tarball_name_without_ext = tarball_name
            .strip_suffix(".gz")
            .unwrap_or(&tarball_name)
            .to_string();

        let _ = files_json::add_sent_file(
            app_handle.clone(),
            files_json::SentFile {
                file_name: tarball_name_without_ext,
                file_size: actual_tarball_size,
                file_extension: "gz".to_string(),
                file_paths: vec![absolute_path.clone()],
                send_time: Local::now(),
                connection_code,
            },
        );

        return Ok(format!(
            "Successfully sent folder '{}' ({} bytes)",
            file_path, actual_tarball_size
        ));
    }

    // For files, send directly using send_file (not a folder)
    let file_size = std::fs::metadata(&absolute_path)
        .map_err(|e| format!("Failed to get file metadata: {}", e))?
        .len();

    println!(
        "[wyrmhole][files][info] Sending file: {} (absolute path: {})",
        file_path,
        absolute_path.display()
    );

    // Open the file for sending
    let file = File::open(&absolute_path).await.map_err(|e| {
        let error_msg = format!("Failed to open file: {}", e);
        let _ = error_app_handle.emit(
            "send-error",
            serde_json::json!({
                "id": error_id,
                "file_name": error_file_name,
                "error": error_msg.clone()
            }),
        );
        error_msg
    })?;

    let mut compat_file = file.compat();

    // Send the file using send_file
    let transfer_start = Instant::now();
    transfer::send_file(
        wormhole,
        relay_hints,
        &mut compat_file,
        file_name.clone(),
        file_size,
        abilities,
        |_info| {
            println!("[wyrmhole][files][info] Transit established for single-file send");
        },
        // Progress handler (no per-chunk logging for performance)
        move |sent, total| {
            let percentage = if total > 0 {
                (sent as f64 / total as f64 * 100.0) as u64
            } else {
                0
            };

            let _ = progress_app_handle.emit(
                "send-progress",
                serde_json::json!({
                    "id": progress_id,
                    "file_name": progress_file_name,
                    "sent": sent,
                    "total": total,
                    "percentage": percentage,
                    "code": send_code.clone(),
                    "status": "sending"
                }),
            );
        },
        cancel_call,
    )
    .await
    .map_err(|e| {
        let error_message = format!(
            "Failed to send file: {} (path: {})",
            e,
            absolute_path.display()
        );
        println!(
            "[wyrmhole][files][error] Send file failed: {}",
            error_message
        );
        let _ = error_app_handle.emit(
            "send-error",
            serde_json::json!({
                "id": error_id,
                "file_name": error_file_name,
                "error": error_message.clone()
            }),
        );
        error_message
    })?;

    let elapsed = transfer_start.elapsed();
    if elapsed.as_secs_f64() > 0.0 {
        let mb = file_size as f64 / (1024.0 * 1024.0);
        let mbps = mb / elapsed.as_secs_f64();
        println!(
            "[wyrmhole][perf][files] File transfer complete: {:.2} MiB in {:?} ({:.2} MiB/s)",
            mb, elapsed, mbps
        );
    }

    // Remove from active sends when complete and get the code
    let connection_code = {
        let active_sends = ACTIVE_SENDS.lock().await;
        active_sends
            .get(&send_id)
            .map(|s| s.code.clone())
            .unwrap_or_default()
    };
    ACTIVE_SENDS.lock().await.remove(&send_id);

    // Add to sent files history
    let file_extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_string();

    // Remove extension from file_name if it exists
    let file_name_without_ext =
        if !file_extension.is_empty() && file_name.ends_with(&format!(".{}", file_extension)) {
            file_name
                .strip_suffix(&format!(".{}", file_extension))
                .unwrap_or(&file_name)
                .to_string()
        } else {
            file_name.clone()
        };

    let _ = files_json::add_sent_file(
        app_handle.clone(),
        files_json::SentFile {
            file_name: file_name_without_ext,
            file_size,
            file_extension,
            file_paths: vec![absolute_path.clone()],
            send_time: Local::now(),
            connection_code,
        },
    );

    println!(
        "[wyrmhole][perf][files] send_file_call finished for '{}' in {:?}",
        file_path,
        overall_start.elapsed()
    );

    Ok(format!(
        "Successfully sent file '{}' ({} bytes)",
        file_path, file_size
    ))
}

pub async fn send_multiple_files_call(
    app_handle: AppHandle,
    file_paths: Vec<String>,
    send_id: String,
    folder_name: Option<String>,
) -> Result<String, String> {
    if file_paths.is_empty() {
        return Err("No files provided".to_string());
    }

    let overall_start = Instant::now();

    // Generate a display name for the folder and tarball
    let display_name = if let Some(custom_name) = folder_name {
        // Use custom name if provided
        custom_name
    } else if file_paths.len() == 1 {
        // Check if it's a single folder - if so, use the folder name
        let path = Path::new(&file_paths[0]);
        if path.is_dir() {
            // Single folder - use the folder name
            path.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("folder")
                .to_string()
        } else {
            // Single file - use the file name
            path.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("file")
                .to_string()
        }
    } else {
        // Multiple files/folders - use the default format from settings
        let app_settings_state = app_handle.state::<tokio::sync::Mutex<settings::AppSettings>>();
        let app_settings_lock = app_settings_state.lock().await;
        let format_template = app_settings_lock.get_default_folder_name_format().clone();
        drop(app_settings_lock);

        // If the format is empty or just whitespace, default to "#-files-via-wyrmhole"
        let format_template = if format_template.trim().is_empty() {
            "#-files-via-wyrmhole".to_string()
        } else {
            format_template
        };

        // Replace # with the number of files
        format_template.replace("#", &file_paths.len().to_string())
    };

    // Calculate the tarball name immediately
    let tarball_name = format!("{}.gz", display_name);

    // Emit an initial progress event with "Preparing..." status
    // This happens synchronously before any async operations, so the frontend gets the correct name right away
    // Note: connection code will be empty initially, but will be updated when the mailbox connection is created
    println!(
        "Emitting initial progress event for send_id: {} with filename: {}",
        send_id, tarball_name
    );
    let _ = app_handle.emit(
        "send-progress",
        serde_json::json!({
            "id": send_id.clone(),
            "file_name": tarball_name.clone(),
            "sent": 0,
            "total": 0,
            "percentage": 0,
            "code": "",  // Will be updated when connection code is available
            "status": "preparing"
        }),
    );
    println!("Initial progress event emitted for send_id: {}", send_id);

    // Emit "Waiting..." status after files are copied, before mailbox connection
    let _ = app_handle.emit(
        "send-progress",
        serde_json::json!({
            "id": send_id.clone(),
            "file_name": tarball_name.clone(),
            "sent": 0,
            "total": 0,
            "percentage": 0,
            "code": "",
            "status": "waiting"
        }),
    );

    // Create cancel channel for this send (before mailbox connection)
    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();

    // Send the folder using send_file_or_folder (which will create a tarball automatically)
    let config = transfer::APP_CONFIG.clone();

    // Create the mailbox connection
    let mailbox_start = Instant::now();
    let mailbox_connection = match MailboxConnection::create(config, 2).await {
        Ok(conn) => {
            let code = conn.code();
            let code_string = code.to_string();

            // Store the connection code and cancel sender for this send
            ACTIVE_SENDS.lock().await.insert(
                send_id.clone(),
                ActiveSend {
                    code: code_string.clone(),
                    cancel_tx: Some(cancel_tx),
                },
            );

            let _ = app_handle.emit(
                "connection-code",
                serde_json::json!({
                    "status": "success",
                    "code": code_string.clone(),
                    "send_id": send_id
                }),
            );

            // Keep "Waiting..." status - it will change to "Sending..." when transfer actually begins
            // Update the code in the waiting status now that we have it
            let _ = app_handle.emit(
                "send-progress",
                serde_json::json!({
                    "id": send_id.clone(),
                    "file_name": tarball_name.clone(),
                    "sent": 0,
                    "total": 0,
                    "percentage": 0,
                    "code": code_string.clone(),
                    "status": "waiting"
                }),
            );

            conn
        }
        Err(e) => {
            let error_msg = format!("Failed to connect: {}", e);
            let _ = app_handle.emit(
                "connection-code",
                serde_json::json!({
                    "status": "error",
                    "message": error_msg.clone()
                }),
            );
            let _ = app_handle.emit(
                "send-error",
                serde_json::json!({
                    "id": send_id,
                    "file_name": display_name.clone(),
                    "error": error_msg.clone()
                }),
            );
            return Err(error_msg);
        }
    };

    // Construct relay hints, preferring a user-configured relay server if available.
    let relay_hints = build_relay_hints(&app_handle).await;
    let abilities = transit::Abilities::ALL;

    // Use the cancel receiver as the cancel future
    let cancel_call = cancel_rx.map(|_| ());

    // Connect the wormhole - this will wait until the receiver connects
    let wormhole = Wormhole::connect(mailbox_connection).await.map_err(|e| {
        let msg = format!("Failed to connect to Wormhole: {}", e);
        let _ = app_handle.emit(
            "send-error",
            serde_json::json!({
                "id": send_id.clone(),
                "file_name": display_name.clone(),
                "error": msg.clone()
            }),
        );
        msg
    })?;

    println!(
        "[wyrmhole][perf][files] Mailbox + wormhole established for multi-file send in {:?}",
        mailbox_start.elapsed()
    );

    // Receiver has connected! Now create the tarball and show "Packaging..." status
    // Get the connection code first
    let send_code = {
        let active_sends = ACTIVE_SENDS.lock().await;
        active_sends
            .get(&send_id)
            .map(|s| s.code.clone())
            .unwrap_or_default()
    };

    // Emit "Packaging..." status while creating tarball
    let _ = app_handle.emit(
        "send-progress",
        serde_json::json!({
            "id": send_id.clone(),
            "file_name": tarball_name.clone(),
            "sent": 0,
            "total": 0,
            "percentage": 0,
            "code": send_code.clone(),
            "status": "packaging"
        }),
    );

    // Clone values needed for progress handler
    let progress_id = send_id.clone();
    let progress_app_handle = app_handle.clone();
    let error_app_handle = app_handle.clone();
    let error_id = send_id.clone();
    let error_file_name = display_name.clone();

    // Create a tarball from the original file paths (no extra temp folder copy).
    // Use a unique temp filename per send to avoid races when multiple sends share the same display_name.
    let temp_dir = std::env::temp_dir();
    let tarball_path = temp_dir.join(format!(
        "wyrmhole_send_{}_{}",
        Uuid::new_v4(),
        &tarball_name
    ));

    // Use the tarball name (with .gz) for progress events since that's what's actually being sent
    let progress_file_name = tarball_name.clone();

    // Use the same display_name for the folder inside the tarball
    let tarball_folder_name = display_name.clone();

    // Create the tarball (synchronous operation, run in blocking task) directly from the provided paths.
    let tar_start = Instant::now();
    let tarball_size = tokio::task::spawn_blocking({
        let tarball_path = tarball_path.clone();
        let tarball_folder_name = tarball_folder_name.clone();
        let file_paths = file_paths.clone();
        move || {
            create_tarball_from_paths(&file_paths, &tarball_path, &tarball_folder_name)
        }
    })
    .await
    .map_err(|e| format!("Failed to create tarball: {}", e))??;

    println!(
        "[wyrmhole][perf][files] Created tarball: {} ({} bytes) from {} files in {:?}",
        tarball_path.display(),
        tarball_size,
        file_paths.len(),
        tar_start.elapsed()
    );

    // Open the tarball file for sending
    let file = File::open(&tarball_path).await.map_err(|e| {
        let error_msg = format!("Failed to open tarball: {}", e);
        let _ = app_handle.emit(
            "send-error",
            serde_json::json!({
                "id": send_id.clone(),
                "file_name": display_name.clone(),
                "error": error_msg.clone()
            }),
        );
        let tarball_path_clone = tarball_path.clone();
        tokio::spawn(async move {
            let _ = tokio::fs::remove_file(&tarball_path_clone).await;
        });
        error_msg
    })?;

    // Get the actual file size from the opened file to ensure accuracy
    let actual_tarball_size = file
        .metadata()
        .await
        .map_err(|e| format!("Failed to get tarball file metadata: {}", e))?
        .len();

    println!(
        "Tarball file opened: {} bytes (reported: {} bytes)",
        actual_tarball_size, tarball_size
    );

    // Use the actual file size for sending
    let file_size_to_send = actual_tarball_size;

    let mut compat_file = file.compat();

    // Send the tarball using send_file
    let transfer_start = Instant::now();
    transfer::send_file(
        wormhole,
        relay_hints,
        &mut compat_file,
        tarball_name.clone(),
        file_size_to_send,
        abilities,
        |_info| {
            println!("[wyrmhole][files][info] Transit established for multi-file send");
        },
        // Progress handler (no per-chunk logging for performance)
        move |sent, total| {
            let percentage = if total > 0 {
                (sent as f64 / total as f64 * 100.0) as u64
            } else {
                0
            };

            let _ = progress_app_handle.emit(
                "send-progress",
                serde_json::json!({
                    "id": progress_id,
                    "file_name": progress_file_name,
                    "sent": sent,
                    "total": total,
                    "percentage": percentage,
                    "code": send_code.clone(),
                    "status": "sending"
                }),
            );
        },
        cancel_call,
    )
    .await
    .map_err(|e| {
        let error_message = format!(
            "Failed to send files: {} (tarball: {})",
            e,
            tarball_path.display()
        );
        println!(
            "[wyrmhole][files][error] Multi-file send failed: {}",
            error_message
        );
        let _ = error_app_handle.emit(
            "send-error",
            serde_json::json!({
                "id": error_id,
                "file_name": error_file_name,
                "error": error_message.clone()
            }),
        );
        let tarball_path_clone = tarball_path.clone();
        tokio::spawn(async move {
            let _ = tokio::fs::remove_file(&tarball_path_clone).await;
        });
        error_message
    })?;

    let elapsed = transfer_start.elapsed();
    if elapsed.as_secs_f64() > 0.0 {
        let mb = file_size_to_send as f64 / (1024.0 * 1024.0);
        let mbps = mb / elapsed.as_secs_f64();
        println!(
            "[wyrmhole][perf][files] Multi-file transfer complete: {:.2} MiB in {:?} ({:.2} MiB/s)",
            mb, elapsed, mbps
        );
    }

    // Clean up temporary tarball
    let _ = tokio::fs::remove_file(&tarball_path).await;

    // Remove from active sends when complete and get the code
    let connection_code = {
        let active_sends = ACTIVE_SENDS.lock().await;
        active_sends
            .get(&send_id)
            .map(|s| s.code.clone())
            .unwrap_or_default()
    };
    ACTIVE_SENDS.lock().await.remove(&send_id);

    // Add to sent files history (for multiple files, use the tarball name without extension)
    // Store all file paths
    let all_file_paths: Vec<PathBuf> = file_paths.iter().map(PathBuf::from).collect();

    // Remove .gz extension from tarball name
    let tarball_name_without_ext = tarball_name
        .strip_suffix(".gz")
        .unwrap_or(&tarball_name)
        .to_string();

    let _ = files_json::add_sent_file(
        app_handle.clone(),
        files_json::SentFile {
            file_name: tarball_name_without_ext,
            file_size: file_size_to_send,
            file_extension: "gz".to_string(),
            file_paths: all_file_paths,
            send_time: Local::now(),
            connection_code,
        },
    );

    println!(
        "[wyrmhole][perf][files] send_multiple_files_call finished for {} file(s) in {:?}",
        file_paths.len(),
        overall_start.elapsed()
    );

    Ok(format!("Successfully sent {} file(s)", file_paths.len()))
}

pub async fn cancel_send(send_id: String, app_handle: AppHandle) -> Result<String, String> {
    // Get the cancel sender and remove from active sends
    let cancel_tx = {
        let mut active_sends = ACTIVE_SENDS.lock().await;
        if let Some(active_send) = active_sends.remove(&send_id) {
            active_send.cancel_tx
        } else {
            return Err("No active send found for this ID".to_string());
        }
    };

    // Send the cancel signal
    if let Some(tx) = cancel_tx {
        let _ = tx.send(());
        println!("Cancelled send with id: {}", send_id);

        // Emit a send-error event to notify the frontend
        let _ = app_handle.emit(
            "send-error",
            serde_json::json!({
                "id": send_id.clone(),
                "file_name": "Transfer cancelled",
                "error": "Transfer cancelled by user"
            }),
        );

        Ok("Send cancelled".to_string())
    } else {
        Err("No cancel channel found for this send".to_string())
    }
}

pub async fn request_file_call(
    receive_code: &str,
    connection_id: String,
) -> Result<String, String> {
    // Parsing input
    let mut code_string = receive_code.trim();
    let prefix = "wormhole receive ";
    if code_string.starts_with(prefix) {
        code_string = &code_string[prefix.len()..];
        code_string = code_string.trim_start();
    }
    if code_string.is_empty() {
        println!("[wyrmhole][files][error] No code provided for receiving file");
        return Err("No code provided for receiving file.".to_string());
    }
    let code = code_string.parse::<Code>().map_err(|err| {
        let error_message = format!("Error parsing code: {}", err);
        println!("[wyrmhole][files][error] {}", error_message);
        error_message
    })?;
    println!("[wyrmhole][files][info] Parsed receive code: {:?}", code);

    // Create cancel channel for this connection
    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();

    // Store the connection with cancel channel
    {
        let mut active_connections = ACTIVE_CONNECTIONS.lock().await;
        active_connections.insert(connection_id.clone(), ActiveConnection { cancel_tx });
    }

    // Connecting to the mailbox
    //TODO: Allow customizable configs
    let config = transfer::APP_CONFIG.clone();
    let mailbox_connection = match MailboxConnection::connect(config, code, false).await {
        Ok(conn) => {
            println!(
                "[wyrmhole][files][info] Connected to mailbox, establishing Wormhole..."
            );
            conn
        }
        Err(e) => {
            // Remove from active connections on error
            ACTIVE_CONNECTIONS.lock().await.remove(&connection_id);
            let msg = format!("Failed to create mailbox: {}", e);
            println!("[wyrmhole][files][error] {}", msg);
            return Err(msg);
        }
    };
    let connection_id_clone = connection_id.clone();
    let wormhole = Wormhole::connect(mailbox_connection)
        .await
        .map_err(|e: WormholeError| {
            // Remove from active connections on error
            let connection_id_clone = connection_id_clone.clone();
            tokio::spawn(async move {
                ACTIVE_CONNECTIONS.lock().await.remove(&connection_id_clone);
            });
        let msg = format!("Failed to connect to Wormhole: {}", e);
        println!("[wyrmhole][files][error] {}", msg);
        msg
        })?;

    // Constructing default request_file(...) variables
    // TODO: (Temporary, should allow the use to change these themselves in a later build.)
    let relay_hint = transit::RelayHint::from_urls(
        None, // no friendly name
        [transit::DEFAULT_RELAY_SERVER.parse().unwrap()],
    )
    .unwrap();
    let relay_hints = vec![relay_hint];
    let abilities = transit::Abilities::ALL;

    // Use the cancel receiver as the cancel future
    let cancel_call = cancel_rx.map(|_| ());

    let connection_id_clone2 = connection_id.clone();
    let maybe_request = transfer::request_file(wormhole, relay_hints, abilities, cancel_call)
        .await
        .map_err(|e| {
            // Remove from active connections on error
            let connection_id_clone = connection_id_clone2.clone();
            tokio::spawn(async move {
                ACTIVE_CONNECTIONS.lock().await.remove(&connection_id_clone);
            });
            format!("Failed to request file: {}", e)
        })?;

    // Remove from active connections on success
    ACTIVE_CONNECTIONS.lock().await.remove(&connection_id);
    if let Some(receive_request) = maybe_request {
        let file_name = receive_request.file_name().to_string().to_owned();
        let file_size = receive_request.file_size();

        // Store OpenRequests entry with the ReceiveRequest for answering later.
        let id = Uuid::new_v4().to_string();
        let entry = OpenRequests {
            request: receive_request,
        };
        REQUESTS_HASHMAP.lock().await.insert(id.clone(), entry);

        println!(
            "[wyrmhole][files][info] Incoming file offer: {} ({} bytes)",
            file_name, file_size
        );

        let response = serde_json::json!({
            "id": id,
            "file_name": file_name,
            "file_size": file_size,
        });
        Ok(response.to_string())
    } else {
        println!("[wyrmhole][files][info] No file offered by sender (canceled or empty)");
        Err("No file was offered by the sender (canceled or empty).".to_string())
    }
}

pub async fn cancel_connection(connection_id: String) -> Result<String, String> {
    // Get the cancel sender and remove from active connections
    let cancel_tx = {
        let mut active_connections = ACTIVE_CONNECTIONS.lock().await;
        if let Some(active_connection) = active_connections.remove(&connection_id) {
            active_connection.cancel_tx
        } else {
            return Err("No active connection found for this ID".to_string());
        }
    };

    // Send the cancel signal
    let _ = cancel_tx.send(());
    println!(
        "[wyrmhole][files][info] Cancelled connection with id: {}",
        connection_id
    );

    Ok("Connection cancelled".to_string())
}

pub async fn receiving_file_deny(id: String) -> Result<String, String> {
    // This function is called when the user denies the file offer.
    // It will close the Wormhole connection associated with the given ID.
    let mut requests = REQUESTS_HASHMAP.lock().await;
    if let Some(entry) = requests.remove(&id) {
        if let Err(e) = entry.request.reject().await {
            println!("[wyrmhole][files][error] Failed to close request: {}", e);
            return Err(format!("Failed to close request: {}", e));
        }
        println!(
            "[wyrmhole][files][info] receiving_file_deny closed request with id: {}",
            id
        );
        Ok("File offer denied and request closed".to_string())
    } else {
        Err("No request found for this ID".to_string())
    }
}

pub async fn receiving_file_accept(id: String, app_handle: AppHandle) -> Result<String, String> {
    let mut requests: tokio::sync::MutexGuard<'_, HashMap<String, OpenRequests>> =
        REQUESTS_HASHMAP.lock().await;
    if let Some(entry) = requests.remove(&id) {
        println!(
            "[wyrmhole][files][info] receiving_file_accept for id: {}, file: {}",
            id,
            entry.request.file_name()
        );

        // Build the transit handler and get variables available for JSON metadata file.
        // connection_type is mapped to String because I don't know if ConnectionType struct will be needed and serde doesn't have a default serializer for it.
        let mut connection_type: String = String::new();
        let mut peer_address: SocketAddr = "0.0.0.0:0".parse().unwrap();
        let transit_handler = |info: transit::TransitInfo| {
            println!("[wyrmhole][files][info] Transit info: {:?}", info);
            let connection_type_str = match info.conn_type {
                transit::ConnectionType::Direct => "direct".to_string(),
                transit::ConnectionType::Relay { ref name } => {
                    if let Some(n) = name {
                        format!("relay ({})", n)
                    } else {
                        "relay".to_string()
                    }
                }
                _ => "unknown".to_string(),
            };
            connection_type = connection_type_str;
            peer_address = info.peer_addr.to_owned();
        };

        // Build the full file path by joining the directory and the filename
        // Get the download directory from settings using app_handle
        let app_settings_state = app_handle.state::<tokio::sync::Mutex<settings::AppSettings>>();
        let app_settings_lock = app_settings_state.lock().await;
        let download_dir = app_settings_lock.get_download_directory().to_path_buf();
        drop(app_settings_lock); // Drop lock so we can get the app_handle again later.
        let file_name_with_extension = entry.request.file_name();

        // Clone values needed for progress handler and error handling
        let progress_id = id.clone();
        let progress_file_name = file_name_with_extension.clone();
        let progress_app_handle = app_handle.clone();
        let error_app_handle = app_handle.clone();
        let error_id = id.clone();
        let error_file_name = file_name_with_extension.clone();

        let progress_handler = move |transferred: u64, total: u64| {
            let percentage = if total > 0 {
                (transferred as f64 / total as f64 * 100.0) as u64
            } else {
                0
            };
            let _ = progress_app_handle.emit(
                "download-progress",
                serde_json::json!({
                    "id": progress_id,
                    "file_name": progress_file_name,
                    "transferred": transferred,
                    "total": total,
                    "percentage": percentage
                }),
            );
        };
        let file_size = entry.request.file_size();

        // Check and create the download directory if it doesn't exist
        if let Err(e) = tokio::fs::create_dir_all(&download_dir).await {
            let error_msg = format!("Failed to create download directory: {}", e);
            let _ = error_app_handle.emit(
                "download-error",
                serde_json::json!({
                    "id": error_id,
                    "file_name": error_file_name,
                    "error": error_msg
                }),
            );
            return Err(error_msg);
        }

        // Find a unique file path (adds number incrementer if file already exists)
        let file_path = find_unique_file_path(&download_dir, &file_name_with_extension);

        // Get the final filename (may have been modified with incrementer)
        let final_file_name_with_extension = file_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(&file_name_with_extension)
            .to_string();

        // Parse the final filename for JSON metadata
        let file_name = final_file_name_with_extension
            .rsplit_once('.')
            .map(|(before, _)| before.to_string())
            .unwrap_or_else(|| final_file_name_with_extension.clone());
        let file_extension = final_file_name_with_extension
            .rsplit_once('.')
            .map(|(_, after)| after.to_string())
            .unwrap_or_default();

        // Create the file at the full, correct path
        let file = tokio::fs::File::create(&file_path).await.map_err(|e| {
            let error_msg = format!(
                "Failed to create file at path: {}: {}",
                file_path.display(),
                e
            );
            let _ = error_app_handle.emit(
                "download-error",
                serde_json::json!({
                    "id": error_id,
                    "file_name": error_file_name,
                    "error": error_msg
                }),
            );
            error_msg
        })?;

        let mut compat_file = file.compat_write();

        // Create cancel channel for this download
        let (cancel_tx, cancel_rx) = oneshot::channel::<()>();

        // Store the cancel sender and file name in ACTIVE_DOWNLOADS
        let download_file_name = file_name_with_extension.clone();
        ACTIVE_DOWNLOADS.lock().await.insert(
            id.clone(),
            ActiveDownload {
                cancel_tx,
                file_name: download_file_name.clone(),
            },
        );

        // Use the cancel receiver as the cancel future
        let cancel = cancel_rx.map(|_| ());

        entry
            .request
            .accept(transit_handler, progress_handler, &mut compat_file, cancel)
            .await
            .map_err(|e| {
                let error_message = format!("Error accepting file: {}", e);
                println!("[wyrmhole][files][error] {}", error_message);
                // Remove from active downloads on error
                let id_clone = id.clone();
                tokio::spawn(async move {
                    ACTIVE_DOWNLOADS.lock().await.remove(&id_clone);
                });
                let _ = error_app_handle.emit(
                    "download-error",
                    serde_json::json!({
                        "id": error_id,
                        "file_name": error_file_name,
                        "error": error_message
                    }),
                );
                error_message
            })?;

        // Remove from active downloads when complete
        ACTIVE_DOWNLOADS.lock().await.remove(&id);

        // Check if the file is a tarball (.tar.gz, .tgz, or .gz from wyrmhole folder transfers)
        let is_tarball = final_file_name_with_extension.ends_with(".tar.gz")
            || final_file_name_with_extension.ends_with(".tgz")
            || final_file_name_with_extension.ends_with(".gz");

        if is_tarball {
            // Check if auto-extract is enabled
            let app_settings_state =
                app_handle.state::<tokio::sync::Mutex<settings::AppSettings>>();
            let app_settings_lock = app_settings_state.lock().await;
            let auto_extract = app_settings_lock.get_auto_extract_tarballs();
            drop(app_settings_lock);

            if auto_extract {
                // Auto-extract enabled - extract the tarball
                let extracted_files = tokio::task::spawn_blocking({
                    let file_path = file_path.clone();
                    let download_dir = download_dir.clone();
                    move || extract_tarball(&file_path, &download_dir)
                })
                .await
                .map_err(|e| format!("Failed to extract tarball: {}", e))??;

                let file_count = extracted_files.len();

                // Add all extracted files to the received files JSON
                for (extracted_file_name, extracted_file_size) in extracted_files {
                    let (name, ext) = extracted_file_name
                        .rsplit_once('.')
                        .map(|(n, e)| (n.to_string(), e.to_string()))
                        .unwrap_or_else(|| (extracted_file_name.clone(), String::new()));

                    let _ = files_json::add_received_file(
                        app_handle.clone(),
                        files_json::ReceivedFile {
                            file_name: name,
                            file_size: extracted_file_size,
                            file_extension: ext,
                            download_url: download_dir.clone(),
                            download_time: Local::now(),
                            connection_type: connection_type.clone(),
                            peer_address,
                        },
                    );
                }

                // Remove the tarball file after extraction
                let file_path_clone = file_path.clone();
                tokio::spawn(async move {
                    let _ = tokio::fs::remove_file(&file_path_clone).await;
                });

                Ok(format!(
                    "Tarball extracted! {} file(s) saved to {}",
                    file_count,
                    download_dir.display()
                ))
            } else {
                // Auto-extract disabled - keep as tarball file
                files_json::add_received_file(
                    app_handle,
                    files_json::ReceivedFile {
                        file_name,
                        file_size,
                        file_extension,
                        download_url: download_dir,
                        download_time: Local::now(),
                        connection_type,
                        peer_address,
                    },
                )
                .map_err(|e| {
                    println!("[wyrmhole][files][error] Failed to add received file: {}", e);
                    e
                })?;

                Ok(format!(
                    "File transfer completed! Tarball saved to {} (auto-extract is disabled)",
                    file_path.display()
                ))
            }
        } else {
            // Regular file - add to received files JSON
            files_json::add_received_file(
                app_handle,
                files_json::ReceivedFile {
                    file_name,
                    file_size,
                    file_extension,
                    download_url: download_dir,
                    download_time: Local::now(),
                    connection_type,
                    peer_address,
                },
            )
            .map_err(|e| {
                println!("[wyrmhole][files][error] Failed to add received file: {}", e);
                e
            })?;

            Ok(format!(
                "File transfer completed! File saved to {}",
                file_path.display()
            ))
        }
    } else {
        Err("No request found for this id".to_string())
    }
}

pub async fn cancel_download(
    download_id: String,
    _app_handle: AppHandle,
) -> Result<String, String> {
    // Get the cancel sender and file name, then remove from active downloads
    let (cancel_tx, _file_name) = {
        let mut active_downloads = ACTIVE_DOWNLOADS.lock().await;
        if let Some(active_download) = active_downloads.remove(&download_id) {
            (active_download.cancel_tx, active_download.file_name)
        } else {
            return Err("No active download found for this ID".to_string());
        }
    };

    // Send the cancel signal
    let _ = cancel_tx.send(());
    println!(
        "[wyrmhole][files][info] Cancelled download with id: {}",
        download_id
    );

    // Don't emit error event for user cancellations - frontend handles dismissal directly
    // The frontend's onDismiss callback will remove it from the UI immediately

    Ok("Download cancelled".to_string())
}

// Helper functions

/// Build relay hints based on user configuration, falling back to DEFAULT_RELAY_SERVER.
async fn build_relay_hints(app_handle: &AppHandle) -> Vec<transit::RelayHint> {
    let app_settings_state = app_handle.state::<tokio::sync::Mutex<settings::AppSettings>>();
    let app_settings_lock = app_settings_state.lock().await;
    let user_relay = app_settings_lock
        .get_relay_server_url()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    drop(app_settings_lock);

    let mut urls = Vec::new();

    if let Some(custom) = user_relay {
        if let Ok(url) = custom.parse() {
            urls.push(url);
        } else {
            eprintln!(
                "[wyrmhole][files][warn] Invalid relay_server_url in settings, falling back to default: {}",
                custom
            );
        }
    }

    if urls.is_empty() {
        urls.push(transit::DEFAULT_RELAY_SERVER.parse().unwrap());
    }

    let relay_hint = transit::RelayHint::from_urls(None, urls).unwrap();
    vec![relay_hint]
}

/// Validate the currently configured relay URL or the default relay configuration.
/// This is used by the Settings UI "Test relay" button.
pub async fn test_relay_server(app_handle: AppHandle) -> Result<String, String> {
    let app_settings_state = app_handle.state::<tokio::sync::Mutex<settings::AppSettings>>();
    let app_settings_lock = app_settings_state.lock().await;
    let user_relay = app_settings_lock
        .get_relay_server_url()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    drop(app_settings_lock);

    if let Some(custom) = user_relay {
        // Validate custom relay URL
        let url = custom
            .parse()
            .map_err(|e| format!("Invalid relay URL: {}", e))?;

        transit::RelayHint::from_urls(None, [url])
            .map_err(|e| format!("Invalid relay configuration: {}", e))?;

        Ok(format!(
            "Custom relay URL looks valid and will be used: {}",
            custom
        ))
    } else {
        // No custom URL: validate the default relay configuration and report it
        let default_url = transit::DEFAULT_RELAY_SERVER
            .parse()
            .map_err(|e| format!("Internal error parsing default relay URL: {}", e))?;

        transit::RelayHint::from_urls(None, [default_url])
            .map_err(|e| format!("Default relay configuration appears invalid: {}", e))?;

        Ok(format!(
            "No custom relay configured. Default relay will be used: {}",
            transit::DEFAULT_RELAY_SERVER
        ))
    }
}

/// Helper function to create a tarball from a folder
/// Wraps files in a folder with a friendly name (e.g., "4_files_wyrmhole_send")
fn create_tarball_from_folder(
    folder_path: &Path,
    output_path: &Path,
    folder_name: &str,
) -> Result<u64, String> {
    let tar_gz = std::fs::File::create(output_path)
        .map_err(|e| format!("Failed to create tarball file: {}", e))?;

    // Use a faster compression level to reduce CPU time; transfer is usually bottlenecked by network, not disk.
    let enc = GzEncoder::new(tar_gz, Compression::fast());
    let mut tar = Builder::new(enc);

    // Add the entire folder to the tarball with the friendly folder name
    tar.append_dir_all(folder_name, folder_path)
        .map_err(|e| format!("Failed to add folder to tarball: {}", e))?;

    // Finish the tarball - this closes and flushes everything
    tar.finish()
        .map_err(|e| format!("Failed to finish tarball: {}", e))?;

    // Get the file size after everything is written
    // tar.finish() already closes and flushes the file, so we can safely read metadata
    let metadata = std::fs::metadata(output_path)
        .map_err(|e| format!("Failed to get tarball metadata: {}", e))?;

    let size = metadata.len();
    println!(
        "[wyrmhole][perf][files] Tarball created: {} bytes (folder: {})",
        size, folder_name
    );

    Ok(size)
}

/// Helper function to create a tarball directly from a list of file and directory paths.
/// All entries are wrapped under a single top-level folder in the archive (`folder_name`).
fn create_tarball_from_paths(
    paths: &[String],
    output_path: &Path,
    folder_name: &str,
) -> Result<u64, String> {
    let tar_gz = std::fs::File::create(output_path)
        .map_err(|e| format!("Failed to create tarball file: {}", e))?;

    let enc = GzEncoder::new(tar_gz, Compression::fast());
    let mut tar = Builder::new(enc);

    for file_path in paths {
        let src_path = Path::new(file_path);
        if !src_path.exists() {
            return Err(format!("File or folder does not exist: {}", file_path));
        }

        if src_path.is_dir() {
            // Add the directory and its contents under folder_name/<dir_name>
            let name = src_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("folder");
            let dest_prefix = Path::new(folder_name).join(name);
            tar.append_dir_all(&dest_prefix, src_path)
                .map_err(|e| format!("Failed to add directory to tarball: {}", e))?;
        } else {
            // Add a single file under folder_name/<file_name>
            let name = src_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("file");
            let dest = Path::new(folder_name).join(name);
            tar.append_path_with_name(src_path, &dest)
                .map_err(|e| format!("Failed to add file to tarball: {}", e))?;
        }
    }

    tar.finish()
        .map_err(|e| format!("Failed to finish tarball: {}", e))?;

    let metadata = std::fs::metadata(output_path)
        .map_err(|e| format!("Failed to get tarball metadata: {}", e))?;

    let size = metadata.len();
    println!(
        "[wyrmhole][perf][files] Tarball created from paths: {} bytes (folder: {})",
        size, folder_name
    );

    Ok(size)
}

/// Helper function to extract a tarball and return list of extracted files
fn extract_tarball(tarball_path: &Path, output_dir: &Path) -> Result<Vec<(String, u64)>, String> {
    let tar_gz =
        std::fs::File::open(tarball_path).map_err(|e| format!("Failed to open tarball: {}", e))?;

    let dec = GzDecoder::new(tar_gz);
    let mut archive = Archive::new(dec);

    let mut extracted_files = Vec::new();

    for entry_result in archive
        .entries()
        .map_err(|e| format!("Failed to read tarball entries: {}", e))?
    {
        let mut entry = entry_result.map_err(|e| format!("Failed to read entry: {}", e))?;

        // Get the path first (before using entry mutably)
        let path = entry
            .path()
            .map_err(|e| format!("Failed to get entry path: {}", e))?;

        // Check if it's a directory
        let is_dir = entry.header().entry_type().is_dir();

        // Skip directories
        if is_dir {
            continue;
        }

        // Get the relative path from the tarball (preserve directory structure)
        let path_str = path.to_string_lossy().to_string();

        // Use the filename for display (last component of path)
        let display_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| path_str.clone());

        // Extract to output directory, preserving relative path
        let output_path = output_dir.join(&path_str);

        // Create parent directories if needed
        if let Some(parent) = output_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }

        // Extract the file
        let mut outfile = std::fs::File::create(&output_path)
            .map_err(|e| format!("Failed to create output file: {}", e))?;

        std::io::copy(&mut entry, &mut outfile)
            .map_err(|e| format!("Failed to extract file: {}", e))?;

        // Get file size
        let metadata = std::fs::metadata(&output_path)
            .map_err(|e| format!("Failed to get file metadata: {}", e))?;

        extracted_files.push((display_name, metadata.len()));
    }

    Ok(extracted_files)
}

/// Helper function to find a unique filename by appending a number if the file already exists
fn find_unique_file_path(download_dir: &Path, file_name_with_extension: &str) -> PathBuf {
    let base_path = download_dir.join(file_name_with_extension);

    // If the file doesn't exist, return the original path
    if !base_path.exists() {
        return base_path;
    }

    // Split filename and extension
    let (file_name, extension) = file_name_with_extension
        .rsplit_once('.')
        .map(|(name, ext)| (name.to_string(), format!(".{}", ext)))
        .unwrap_or_else(|| (file_name_with_extension.to_string(), String::new()));

    // Try incrementing numbers until we find a unique filename
    let mut counter = 1;
    loop {
        let new_file_name = format!("{}({}){}", file_name, counter, extension);
        let new_path = download_dir.join(&new_file_name);

        if !new_path.exists() {
            return new_path;
        }

        counter += 1;

        // Safety check to prevent infinite loops (unlikely but good practice)
        if counter > 10000 {
            // Fall back to adding a timestamp
            let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
            let fallback_name = format!("{}_{}{}", file_name, timestamp, extension);
            return download_dir.join(fallback_name);
        }
    }
}
