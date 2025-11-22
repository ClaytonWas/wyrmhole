// This file contains all file transfer logic for the Tauri application.
// It handles sending files, receiving files, tarball operations, and transfer state management.

use chrono::prelude::*;
use magic_wormhole::{transfer, transit, Code, MailboxConnection, Wormhole, WormholeError};
use once_cell::sync::Lazy;
use std::{collections::HashMap, net::SocketAddr, path::PathBuf, path::Path};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{Mutex, oneshot};
use tokio::fs::File;
use tokio_util::compat::TokioAsyncReadCompatExt;
use tokio_util::compat::TokioAsyncWriteCompatExt;
use uuid::Uuid;
use futures::FutureExt;
use tar::{Archive, Builder};
use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;

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

pub async fn send_file_call(app_handle: AppHandle, file_path: &str, send_id: String) -> Result<String, String> {
    let config = transfer::APP_CONFIG.clone();

    // Get file name early for status updates
    let path = Path::new(file_path);
    let file_name = path
        .file_name()
        .and_then(|os| os.to_str())
        .unwrap_or("unknown")
        .to_string();

    // Emit "Preparing..." status before mailbox connection
    let _ = app_handle.emit("send-progress", serde_json::json!({
        "id": send_id.clone(),
        "file_name": file_name.clone(),
        "sent": 0,
        "total": 0,
        "percentage": 0,
        "code": "",
        "status": "preparing"
    }));

    // Create cancel channel for this send
    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();

    // Create the mailbox connection
    let mailbox_connection = match MailboxConnection::create(config, 2).await {
        Ok(conn) => {
            let code = conn.code();
            let code_string = code.to_string();
            
            // Store the connection code and cancel sender for this send
            ACTIVE_SENDS.lock().await.insert(send_id.clone(), ActiveSend {
                code: code_string.clone(),
                cancel_tx: Some(cancel_tx),
            });
            
            let _ = app_handle.emit("connection-code", serde_json::json!({
                "status": "success",
                "code": code_string.clone(),
                "send_id": send_id
            }));
            
            // Emit "Waiting..." status after mailbox connection is established
            let _ = app_handle.emit("send-progress", serde_json::json!({
                "id": send_id.clone(),
                "file_name": file_name.clone(),
                "sent": 0,
                "total": 0,
                "percentage": 0,
                "code": code_string.clone(),
                "status": "waiting"
            }));
            
            conn
        },
        Err(e) => {
            let error_msg = format!("Failed to connect: {}", e);
            let _ = app_handle.emit("connection-code", serde_json::json!({
                "status": "error",
                "message": error_msg.clone()
            }));
            let _ = app_handle.emit("send-error", serde_json::json!({
                "id": send_id,
                "file_name": file_name.clone(),
                "error": error_msg.clone()
            }));
            return Err(error_msg);
        }
    };

    // Constructing default send_file_or_folder(...) variables
    // TODO: (Temporary, should allow the user to change these themselves in a later build.)
    let relay_hint = transit::RelayHint::from_urls(
        None, // no friendly name
        [transit::DEFAULT_RELAY_SERVER.parse().unwrap()],
    )
    .unwrap();
    let relay_hints = vec![relay_hint];
    let abilities = transit::Abilities::ALL;
    
    // Use the cancel receiver as the cancel future
    let cancel_call = cancel_rx.map(|_| ());
    
    // Connect the wormhole - this will wait until the receiver connects
    let wormhole = Wormhole::connect(mailbox_connection).await.map_err(|e| {
        let msg = format!("Failed to connect to Wormhole: {}", e);
        println!("{}", msg);
        let _ = app_handle.emit("send-error", serde_json::json!({
            "id": send_id.clone(),
            "file_name": file_name.clone(),
            "error": msg.clone()
        }));
        msg
    })?;

    // Verify the path exists and convert to absolute path
    if !path.exists() {
        let error_msg = format!("File or folder does not exist: {}", file_path);
        let _ = app_handle.emit("send-error", serde_json::json!({
            "id": send_id.clone(),
            "file_name": file_name.clone(),
            "error": error_msg.clone()
        }));
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
        let _ = app_handle.emit("send-error", serde_json::json!({
            "id": send_id.clone(),
            "file_name": file_name.clone(),
            "error": error_msg.clone()
        }));
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
        active_sends.get(&send_id)
            .map(|s| s.code.clone())
            .unwrap_or_default()
    };

    // Check if it's a folder - if so, create a tarball first
    let is_folder = absolute_path.is_dir();
    
    if is_folder {
        // For folders, create a tarball first to ensure proper transfer
        // Emit "Packaging..." status
        let _ = app_handle.emit("send-progress", serde_json::json!({
            "id": send_id.clone(),
            "file_name": format!("{}.gz", file_name.clone()),
            "sent": 0,
            "total": 0,
            "percentage": 0,
            "code": send_code.clone(),
            "status": "packaging"
        }));
        
        // Create temporary tarball
        let temp_dir = std::env::temp_dir();
        let tarball_name = format!("{}.gz", file_name);
        let tarball_path = temp_dir.join(format!("wyrmhole_send_{}_{}", Uuid::new_v4(), &tarball_name));
        
        // Create the tarball (synchronous operation, run in blocking task)
        let tarball_size = tokio::task::spawn_blocking({
            let absolute_path = absolute_path.clone();
            let tarball_path = tarball_path.clone();
            let folder_name = file_name.clone();
            move || create_tarball_from_folder(&absolute_path, &tarball_path, &folder_name)
        })
        .await
        .map_err(|e| format!("Failed to create tarball: {}", e))??;
        
        println!("Created tarball: {} ({} bytes) from folder: {}", tarball_path.display(), tarball_size, absolute_path.display());
        
        // Open the tarball file for sending
        let file = File::open(&tarball_path).await.map_err(|e| {
            let error_msg = format!("Failed to open tarball: {}", e);
            let _ = error_app_handle.emit("send-error", serde_json::json!({
                "id": error_id,
                "file_name": error_file_name,
                "error": error_msg.clone()
            }));
            let tarball_path_clone = tarball_path.clone();
            tokio::spawn(async move {
                let _ = tokio::fs::remove_file(&tarball_path_clone).await;
            });
            error_msg
        })?;
        
        // Get the actual file size
        let actual_tarball_size = file.metadata().await
            .map_err(|e| format!("Failed to get tarball file metadata: {}", e))?
            .len();
        
        let mut compat_file = file.compat();
        let progress_file_name = tarball_name.clone();
        
        // Send the tarball using send_file
        transfer::send_file(
            wormhole,
            relay_hints,
            &mut compat_file,
            tarball_name.clone(),
            actual_tarball_size,
            abilities,
            |_info| println!("Transit established!"),
            // Progress handler
            move |sent, total| {
                println!("Progress: {}/{}", sent, total);
                let percentage = if total > 0 {
                    (sent as f64 / total as f64 * 100.0) as u64
                } else {
                    0
                };
                
                let _ = progress_app_handle.emit("send-progress", serde_json::json!({
                    "id": progress_id,
                    "file_name": progress_file_name,
                    "sent": sent,
                    "total": total,
                    "percentage": percentage,
                    "code": send_code.clone(),
                    "status": "sending"
                }));
            },
            cancel_call,
        )
        .await
        .map_err(|e| {
            let error_message = format!("Failed to send folder: {} (tarball: {})", e, tarball_path.display());
            println!("Send error details: {}", error_message);
            let _ = error_app_handle.emit("send-error", serde_json::json!({
                "id": error_id,
                "file_name": error_file_name,
                "error": error_message.clone()
            }));
            let tarball_path_clone = tarball_path.clone();
            tokio::spawn(async move {
                let _ = tokio::fs::remove_file(&tarball_path_clone).await;
            });
            error_message
        })?;
        
        // Clean up temporary tarball
        let _ = tokio::fs::remove_file(&tarball_path).await;
        
        // Remove from active sends when complete
        ACTIVE_SENDS.lock().await.remove(&send_id);
        
        return Ok(format!(
            "Successfully sent folder '{}' ({} bytes)",
            file_path, actual_tarball_size
        ));
    }
    
    // For files, send directly using send_file (not a folder)
    let file_size = std::fs::metadata(&absolute_path)
        .map_err(|e| format!("Failed to get file metadata: {}", e))?
        .len();

    println!("Sending file: {} (absolute path: {})", file_path, absolute_path.display());

    // Open the file for sending
    let file = File::open(&absolute_path).await.map_err(|e| {
        let error_msg = format!("Failed to open file: {}", e);
        let _ = error_app_handle.emit("send-error", serde_json::json!({
            "id": error_id,
            "file_name": error_file_name,
            "error": error_msg.clone()
        }));
        error_msg
    })?;

    let mut compat_file = file.compat();

    // Send the file using send_file
    transfer::send_file(
        wormhole,
        relay_hints,
        &mut compat_file,
        file_name.clone(),
        file_size,
        abilities,
        |_info| println!("Transit established!"),
        // Progress handler
        move |sent, total| {
            println!("Progress: {}/{}", sent, total);
            let percentage = if total > 0 {
                (sent as f64 / total as f64 * 100.0) as u64
            } else {
                0
            };
            
            let _ = progress_app_handle.emit("send-progress", serde_json::json!({
                "id": progress_id,
                "file_name": progress_file_name,
                "sent": sent,
                "total": total,
                "percentage": percentage,
                "code": send_code.clone(),
                "status": "sending"
            }));
        },
        cancel_call,
    )
    .await
    .map_err(|e| {
        let error_message = format!("Failed to send file: {} (path: {})", e, absolute_path.display());
        println!("Send error details: {}", error_message);
        let _ = error_app_handle.emit("send-error", serde_json::json!({
            "id": error_id,
            "file_name": error_file_name,
            "error": error_message.clone()
        }));
        error_message
    })?;

    // Remove from active sends when complete
    ACTIVE_SENDS.lock().await.remove(&send_id);
    
    Ok(format!(
        "Successfully sent file '{}' ({} bytes)",
        file_path, file_size
    ))
}

pub async fn send_multiple_files_call(app_handle: AppHandle, file_paths: Vec<String>, send_id: String, folder_name: Option<String>) -> Result<String, String> {
    if file_paths.is_empty() {
        return Err("No files provided".to_string());
    }
    
    // Create a temporary folder to hold all files
    let temp_dir = std::env::temp_dir();
    let temp_folder_name = format!("wyrmhole_send_{}", Uuid::new_v4());
    let temp_folder_path = temp_dir.join(&temp_folder_name);
    
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
    println!("Emitting initial progress event for send_id: {} with filename: {}", send_id, tarball_name);
    let _ = app_handle.emit("send-progress", serde_json::json!({
        "id": send_id.clone(),
        "file_name": tarball_name.clone(),
        "sent": 0,
        "total": 0,
        "percentage": 0,
        "code": "",  // Will be updated when connection code is available
        "status": "preparing"
    }));
    println!("Initial progress event emitted for send_id: {}", send_id);
    
    // Copy all files into the temp folder (run in blocking task for file operations)
    tokio::task::spawn_blocking({
        let file_paths = file_paths.clone();
        let temp_folder_path = temp_folder_path.clone();
        move || {
            // Use std::fs for synchronous operations in blocking task
            std::fs::create_dir_all(&temp_folder_path)
                .map_err(|e| format!("Failed to create temp folder: {}", e))?;
            
            for file_path in &file_paths {
                let source_path = Path::new(file_path);
                if !source_path.exists() {
                    return Err(format!("File does not exist: {}", file_path));
                }
                
                let file_name = source_path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("unknown");
                let dest_path = temp_folder_path.join(file_name);
                
                if source_path.is_file() {
                    // Copy file
                    std::fs::copy(source_path, &dest_path)
                        .map_err(|e| format!("Failed to copy file {}: {}", file_path, e))?;
                } else if source_path.is_dir() {
                    // Copy directory recursively using a helper
                    copy_dir_all_sync(source_path, &dest_path)
                        .map_err(|e| format!("Failed to copy directory {}: {}", file_path, e))?;
                }
            }
            
            Ok::<(), String>(())
        }
    })
    .await
    .map_err(|e| format!("Failed to copy files: {}", e))?
    .map_err(|e| e)?;
    
    // Emit "Waiting..." status after files are copied, before mailbox connection
    let _ = app_handle.emit("send-progress", serde_json::json!({
        "id": send_id.clone(),
        "file_name": tarball_name.clone(),
        "sent": 0,
        "total": 0,
        "percentage": 0,
        "code": "",
        "status": "waiting"
    }));
    
    // Create cancel channel for this send (before mailbox connection)
    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();
    
    // Send the folder using send_file_or_folder (which will create a tarball automatically)
    let config = transfer::APP_CONFIG.clone();
    
    // Create the mailbox connection
    let mailbox_connection = match MailboxConnection::create(config, 2).await {
        Ok(conn) => {
            let code = conn.code();
            let code_string = code.to_string();
            
            // Store the connection code and cancel sender for this send
            ACTIVE_SENDS.lock().await.insert(send_id.clone(), ActiveSend {
                code: code_string.clone(),
                cancel_tx: Some(cancel_tx),
            });
            
            let _ = app_handle.emit("connection-code", serde_json::json!({
                "status": "success",
                "code": code_string.clone(),
                "send_id": send_id
            }));
            
            // Keep "Waiting..." status - it will change to "Sending..." when transfer actually begins
            // Update the code in the waiting status now that we have it
            let _ = app_handle.emit("send-progress", serde_json::json!({
                "id": send_id.clone(),
                "file_name": tarball_name.clone(),
                "sent": 0,
                "total": 0,
                "percentage": 0,
                "code": code_string.clone(),
                "status": "waiting"
            }));
            
            conn
        },
        Err(e) => {
            let error_msg = format!("Failed to connect: {}", e);
            let _ = app_handle.emit("connection-code", serde_json::json!({
                "status": "error",
                "message": error_msg.clone()
            }));
            let _ = app_handle.emit("send-error", serde_json::json!({
                "id": send_id,
                "file_name": display_name.clone(),
                "error": error_msg.clone()
            }));
            // Clean up temp folder
            let temp_folder_path_clone = temp_folder_path.clone();
            tokio::spawn(async move {
                let _ = tokio::fs::remove_dir_all(&temp_folder_path_clone).await;
            });
            return Err(error_msg);
        }
    };
    
    // Constructing default send_file_or_folder(...) variables
    let relay_hint = transit::RelayHint::from_urls(
        None,
        [transit::DEFAULT_RELAY_SERVER.parse().unwrap()],
    )
    .unwrap();
    let relay_hints = vec![relay_hint];
    let abilities = transit::Abilities::ALL;
    
    // Use the cancel receiver as the cancel future
    let cancel_call = cancel_rx.map(|_| ());
    
    // Connect the wormhole - this will wait until the receiver connects
    let wormhole = Wormhole::connect(mailbox_connection).await.map_err(|e| {
        let msg = format!("Failed to connect to Wormhole: {}", e);
        let _ = app_handle.emit("send-error", serde_json::json!({
            "id": send_id.clone(),
            "file_name": display_name.clone(),
            "error": msg.clone()
        }));
        let temp_folder_path_clone = temp_folder_path.clone();
        tokio::spawn(async move {
            let _ = tokio::fs::remove_dir_all(&temp_folder_path_clone).await;
        });
        msg
    })?;
    
    // Receiver has connected! Now create the tarball and show "Packaging..." status
    // Get the connection code first
    let send_code = {
        let active_sends = ACTIVE_SENDS.lock().await;
        active_sends.get(&send_id)
            .map(|s| s.code.clone())
            .unwrap_or_default()
    };
    
    // Emit "Packaging..." status while creating tarball
    let _ = app_handle.emit("send-progress", serde_json::json!({
        "id": send_id.clone(),
        "file_name": tarball_name.clone(),
        "sent": 0,
        "total": 0,
        "percentage": 0,
        "code": send_code.clone(),
        "status": "packaging"
    }));
    
    // Clone values needed for progress handler
    let progress_id = send_id.clone();
    let progress_app_handle = app_handle.clone();
    let error_app_handle = app_handle.clone();
    let error_id = send_id.clone();
    let error_file_name = display_name.clone();
    
    // Verify the temp folder exists and has files
    if !temp_folder_path.exists() {
        let error_msg = format!("Temp folder does not exist: {}", temp_folder_path.display());
        let _ = app_handle.emit("send-error", serde_json::json!({
            "id": send_id.clone(),
            "file_name": display_name.clone(),
            "error": error_msg.clone()
        }));
        let temp_folder_path_clone = temp_folder_path.clone();
        tokio::spawn(async move {
            let _ = tokio::fs::remove_dir_all(&temp_folder_path_clone).await;
        });
        return Err(error_msg);
    }
    
    // Create a tarball from the temp folder
    let tarball_path = temp_dir.join(&tarball_name);
    
    // Use the tarball name (with .gz) for progress events since that's what's actually being sent
    let progress_file_name = tarball_name.clone();
    
    // Use the same display_name for the folder inside the tarball
    let tarball_folder_name = display_name.clone();
    
    // Create the tarball (synchronous operation, run in blocking task)
    let tarball_size = tokio::task::spawn_blocking({
        let temp_folder_path = temp_folder_path.clone();
        let tarball_path = tarball_path.clone();
        let tarball_folder_name = tarball_folder_name.clone();
        move || create_tarball_from_folder(&temp_folder_path, &tarball_path, &tarball_folder_name)
    })
    .await
    .map_err(|e| format!("Failed to create tarball: {}", e))??;
    
    println!("Created tarball: {} ({} bytes) from {} files", tarball_path.display(), tarball_size, file_paths.len());
    
    // Open the tarball file for sending
    let file = File::open(&tarball_path).await.map_err(|e| {
        let error_msg = format!("Failed to open tarball: {}", e);
        let _ = app_handle.emit("send-error", serde_json::json!({
            "id": send_id.clone(),
            "file_name": display_name.clone(),
            "error": error_msg.clone()
        }));
        let temp_folder_path_clone = temp_folder_path.clone();
        let tarball_path_clone = tarball_path.clone();
        tokio::spawn(async move {
            let _ = tokio::fs::remove_dir_all(&temp_folder_path_clone).await;
            let _ = tokio::fs::remove_file(&tarball_path_clone).await;
        });
        error_msg
    })?;
    
    // Get the actual file size from the opened file to ensure accuracy
    let actual_tarball_size = file.metadata().await
        .map_err(|e| format!("Failed to get tarball file metadata: {}", e))?
        .len();
    
    println!("Tarball file opened: {} bytes (reported: {} bytes)", actual_tarball_size, tarball_size);
    
    // Use the actual file size for sending
    let file_size_to_send = actual_tarball_size;
    
    let mut compat_file = file.compat();
    
    // Send the tarball using send_file
    transfer::send_file(
        wormhole,
        relay_hints,
        &mut compat_file,
        tarball_name.clone(),
        file_size_to_send,
        abilities,
        |_info| println!("Transit established!"),
        // Progress handler
        move |sent, total| {
            println!("Progress: {}/{}", sent, total);
            let percentage = if total > 0 {
                (sent as f64 / total as f64 * 100.0) as u64
            } else {
                0
            };
            
            let _ = progress_app_handle.emit("send-progress", serde_json::json!({
                "id": progress_id,
                "file_name": progress_file_name,
                "sent": sent,
                "total": total,
                "percentage": percentage,
                "code": send_code.clone(),
                "status": "sending"
            }));
        },
        cancel_call,
    )
    .await
    .map_err(|e| {
        let error_message = format!("Failed to send files: {} (tarball: {})", e, tarball_path.display());
        println!("Send error details: {}", error_message);
        let _ = error_app_handle.emit("send-error", serde_json::json!({
            "id": error_id,
            "file_name": error_file_name,
            "error": error_message.clone()
        }));
        let temp_folder_path_clone = temp_folder_path.clone();
        let tarball_path_clone = tarball_path.clone();
        tokio::spawn(async move {
            let _ = tokio::fs::remove_dir_all(&temp_folder_path_clone).await;
            let _ = tokio::fs::remove_file(&tarball_path_clone).await;
        });
        error_message
    })?;
    
    // Clean up temporary folder and tarball
    let _ = tokio::fs::remove_dir_all(&temp_folder_path).await;
    let _ = tokio::fs::remove_file(&tarball_path).await;
    
    // Remove from active sends when complete
    ACTIVE_SENDS.lock().await.remove(&send_id);
    
    Ok(format!(
        "Successfully sent {} file(s)",
        file_paths.len()
    ))
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
        let _ = app_handle.emit("send-error", serde_json::json!({
            "id": send_id.clone(),
            "file_name": "Transfer cancelled",
            "error": "Transfer cancelled by user"
        }));
        
        Ok("Send cancelled".to_string())
    } else {
        Err("No cancel channel found for this send".to_string())
    }
}

pub async fn request_file_call(receive_code: &str, connection_id: String) -> Result<String, String> {
    // Parsing input
    let mut code_string = receive_code.trim();
    let prefix = "wormhole receive ";
    if code_string.starts_with(prefix) {
        code_string = &code_string[prefix.len()..];
        code_string = code_string.trim_start();
    }
    if code_string.is_empty() {
        println!("No code provided for receiving file.");
        return Err("No code provided for receiving file.".to_string());
    }
    let code = code_string.parse::<Code>().map_err(|err| {
        let error_message = format!("Error parsing code: {}", err);
        println!("{}", error_message);
        error_message
    })?;
    println!("Successfully parsed code: {:?}", code);

    // Create cancel channel for this connection
    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();
    
    // Store the connection with cancel channel
    {
        let mut active_connections = ACTIVE_CONNECTIONS.lock().await;
        active_connections.insert(connection_id.clone(), ActiveConnection {
            cancel_tx,
        });
    }

    // Connecting to the mailbox
    //TODO: Allow customizable configs
    let config = transfer::APP_CONFIG.clone();
    let mailbox_connection = match MailboxConnection::connect(config, code, false).await {
        Ok(conn) => {
            println!("Successfully connected to the mailbox. Attempting to establish Wormhole...");
            conn
        }
        Err(e) => {
            // Remove from active connections on error
            ACTIVE_CONNECTIONS.lock().await.remove(&connection_id);
            let msg = format!("Failed to create mailbox: {}", e);
            println!("{}", msg);
            return Err(msg);
        }
    };
    let connection_id_clone = connection_id.clone();
    let wormhole = Wormhole::connect(mailbox_connection).await.map_err(|e: WormholeError| {
        // Remove from active connections on error
        let connection_id_clone = connection_id_clone.clone();
        tokio::spawn(async move {
            ACTIVE_CONNECTIONS.lock().await.remove(&connection_id_clone);
        });
        let msg = format!("Failed to connect to Wormhole: {}", e);
        println!("{}", msg);
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

        println!("Incoming file: {} ({} bytes)", file_name, file_size);

        let response = serde_json::json!({
            "id": id,
            "file_name": file_name,
            "file_size": file_size,
        });
        Ok(response.to_string())
    } else {
        println!("No file was offered by the sender (canceled or empty).");
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
    println!("Cancelled connection with id: {}", connection_id);
    
    Ok("Connection cancelled".to_string())
}

pub async fn receiving_file_deny(id: String) -> Result<String, String> {
    // This function is called when the user denies the file offer.
    // It will close the Wormhole connection associated with the given ID.
    let mut requests = REQUESTS_HASHMAP.lock().await;
    if let Some(entry) = requests.remove(&id) {
        if let Err(e) = entry.request.reject().await {
            println!("Error closing request: {}", e);
            return Err(format!("Failed to close request: {}", e));
        }
        println!("receiving_file_deny closing request with id: {}", id);
        Ok("File offer denied and request closed".to_string())
    } else {
        Err("No request found for this ID".to_string())
    }
}

pub async fn receiving_file_accept(id: String, app_handle: AppHandle) -> Result<String, String> {
    let mut requests: tokio::sync::MutexGuard<'_, HashMap<String, OpenRequests>> = REQUESTS_HASHMAP.lock().await;
    if let Some(entry) = requests.remove(&id) {
        println!("receiving_file_accept closing request with id: {}", id);
        println!("File name: {}", entry.request.file_name());

        // Build the transit handler and get variables available for JSON metadata file.
        // connection_type is mapped to String because I don't know if ConnectionType struct will be needed and serde doesn't have a default serializer for it.
        let mut connection_type: String = String::new();
        let mut peer_address: SocketAddr = "0.0.0.0:0".parse().unwrap();
        let transit_handler = |info: transit::TransitInfo| {
            println!("Transit info: {:?}", info);
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
            println!("Progress: {}/{}", transferred, total);
            let percentage = if total > 0 {
                (transferred as f64 / total as f64 * 100.0) as u64
            } else {
                0
            };
            let _ = progress_app_handle.emit("download-progress", serde_json::json!({
                "id": progress_id,
                "file_name": progress_file_name,
                "transferred": transferred,
                "total": total,
                "percentage": percentage
            }));
        };
        let file_size = entry.request.file_size();

        // Check and create the download directory if it doesn't exist
        if let Err(e) = tokio::fs::create_dir_all(&download_dir).await {
            let error_msg = format!("Failed to create download directory: {}", e);
            let _ = error_app_handle.emit("download-error", serde_json::json!({
                "id": error_id,
                "file_name": error_file_name,
                "error": error_msg
            }));
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
            let _ = error_app_handle.emit("download-error", serde_json::json!({
                "id": error_id,
                "file_name": error_file_name,
                "error": error_msg
            }));
            error_msg
        })?;

        let mut compat_file = file.compat_write();
        
        // Create cancel channel for this download
        let (cancel_tx, cancel_rx) = oneshot::channel::<()>();
        
        // Store the cancel sender and file name in ACTIVE_DOWNLOADS
        let download_file_name = file_name_with_extension.clone();
        ACTIVE_DOWNLOADS.lock().await.insert(id.clone(), ActiveDownload {
            cancel_tx,
            file_name: download_file_name.clone(),
        });
        
        // Use the cancel receiver as the cancel future
        let cancel = cancel_rx.map(|_| ());

        entry
            .request
            .accept(transit_handler, progress_handler, &mut compat_file, cancel)
            .await
            .map_err(|e| {
                let error_message = format!("Error accepting file: {}", e);
                println!("{}", error_message);
                // Remove from active downloads on error
                let id_clone = id.clone();
                tokio::spawn(async move {
                    ACTIVE_DOWNLOADS.lock().await.remove(&id_clone);
                });
                let _ = error_app_handle.emit("download-error", serde_json::json!({
                    "id": error_id,
                    "file_name": error_file_name,
                    "error": error_message
                }));
                error_message
            })?;
        
        // Remove from active downloads when complete
        ACTIVE_DOWNLOADS.lock().await.remove(&id);
        
        // Check if the file is a tarball (.tar.gz, .tgz, or .gz from wyrmhole folder transfers)
        let is_tarball = final_file_name_with_extension.ends_with(".tar.gz") || 
                        final_file_name_with_extension.ends_with(".tgz") ||
                        final_file_name_with_extension.ends_with(".gz");
        
        if is_tarball {
            // Check if auto-extract is enabled
            let app_settings_state = app_handle.state::<tokio::sync::Mutex<settings::AppSettings>>();
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
                            peer_address: peer_address.clone(),
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
                        file_name: file_name,
                        file_size: file_size,
                        file_extension: file_extension,
                        download_url: download_dir,
                        download_time: Local::now(),
                        connection_type: connection_type,
                        peer_address: peer_address,
                    },
                )
                .map_err(|e| {
                    println!("Failed to add received file: {}", e);
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
                    file_name: file_name,
                    file_size: file_size,
                    file_extension: file_extension,
                    download_url: download_dir,
                    download_time: Local::now(),
                    connection_type: connection_type,
                    peer_address: peer_address,
                },
            )
            .map_err(|e| {
                println!("Failed to add received file: {}", e);
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

pub async fn cancel_download(download_id: String, _app_handle: AppHandle) -> Result<String, String> {
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
    println!("Cancelled download with id: {}", download_id);
    
    // Don't emit error event for user cancellations - frontend handles dismissal directly
    // The frontend's onDismiss callback will remove it from the UI immediately
    
    Ok("Download cancelled".to_string())
}

// Helper functions

/// Helper function to create a tarball from a folder
/// Wraps files in a folder with a friendly name (e.g., "4_files_wyrmhole_send")
fn create_tarball_from_folder(folder_path: &Path, output_path: &Path, folder_name: &str) -> Result<u64, String> {
    let tar_gz = std::fs::File::create(output_path)
        .map_err(|e| format!("Failed to create tarball file: {}", e))?;
    
    let enc = GzEncoder::new(tar_gz, Compression::default());
    let mut tar = Builder::new(enc);
    
    // Add the entire folder to the tarball with the friendly folder name
    tar.append_dir_all(folder_name, folder_path)
        .map_err(|e| format!("Failed to add folder to tarball: {}", e))?;
    
    // Finish the tarball - this closes and flushes everything
    tar.finish().map_err(|e| format!("Failed to finish tarball: {}", e))?;
    
    // Get the file size after everything is written
    // tar.finish() already closes and flushes the file, so we can safely read metadata
    let metadata = std::fs::metadata(output_path)
        .map_err(|e| format!("Failed to get tarball metadata: {}", e))?;
    
    let size = metadata.len();
    println!("Tarball created: {} bytes (folder name: {})", size, folder_name);
    
    Ok(size)
}

/// Helper function to recursively copy a directory (synchronous version for blocking tasks)
fn copy_dir_all_sync(src: &Path, dst: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dst)
        .map_err(|e| format!("Failed to create directory: {}", e))?;
    
    for entry in std::fs::read_dir(src)
        .map_err(|e| format!("Failed to read directory: {}", e))? {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();
        let file_name = path.file_name().unwrap();
        let dst_path = dst.join(file_name);
        
        if path.is_dir() {
            copy_dir_all_sync(&path, &dst_path)?;
        } else {
            std::fs::copy(&path, &dst_path)
                .map_err(|e| format!("Failed to copy file: {}", e))?;
        }
    }
    
    Ok(())
}

/// Helper function to extract a tarball and return list of extracted files
fn extract_tarball(tarball_path: &Path, output_dir: &Path) -> Result<Vec<(String, u64)>, String> {
    let tar_gz = std::fs::File::open(tarball_path)
        .map_err(|e| format!("Failed to open tarball: {}", e))?;
    
    let dec = GzDecoder::new(tar_gz);
    let mut archive = Archive::new(dec);
    
    let mut extracted_files = Vec::new();
    
    for entry_result in archive.entries()
        .map_err(|e| format!("Failed to read tarball entries: {}", e))? {
        let mut entry = entry_result.map_err(|e| format!("Failed to read entry: {}", e))?;
        
        // Get the path first (before using entry mutably)
        let path = entry.path()
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
        let display_name = path.file_name()
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

