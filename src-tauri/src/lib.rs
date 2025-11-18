use chrono::prelude::*;
use magic_wormhole::{transfer, transit, Code, MailboxConnection, Wormhole, WormholeError};
use once_cell::sync::Lazy;
use std::{collections::HashMap, net::SocketAddr, path::PathBuf, path::Path};
use tokio::fs::File;
use tauri::{AppHandle, Manager, Emitter};
use tokio::sync::Mutex;
use tokio_util::compat::TokioAsyncReadCompatExt;
use tokio_util::compat::TokioAsyncWriteCompatExt;
use uuid::Uuid;

pub mod files_json;
pub mod settings;

struct OpenRequests {
    request: transfer::ReceiveRequest,
}
static REQUESTS_HASHMAP: Lazy<Mutex<HashMap<String, OpenRequests>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

struct ActiveSend {
    code: String,
}
static ACTIVE_SENDS: Lazy<Mutex<HashMap<String, ActiveSend>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
async fn send_file_call(app_handle: AppHandle, file_path: &str, send_id: String) -> Result<String, String> {
    let config = transfer::APP_CONFIG.clone();

    // Create the mailbox connection
    let mailbox_connection = match MailboxConnection::create(config, 2).await {
        Ok(conn) => {
            let code = conn.code();
            let code_string = code.to_string();
            
            // Store the connection code for this send
            ACTIVE_SENDS.lock().await.insert(send_id.clone(), ActiveSend {
                code: code_string.clone(),
            });
            
            let _ = app_handle.emit("connection-code", serde_json::json!({
                "status": "success",
                "code": code_string.clone(),
                "send_id": send_id
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
                "file_name": Path::new(file_path).file_name().and_then(|os| os.to_str()).unwrap_or("unknown"),
                "error": error_msg.clone()
            }));
            return Err(error_msg);
        }
    };

    // Constructing default send_file(...) variables
    // TODO: (Temporary, should allow the user to change these themselves in a later build.)
    let relay_hint = transit::RelayHint::from_urls(
        None, // no friendly name
        [transit::DEFAULT_RELAY_SERVER.parse().unwrap()],
    )
    .unwrap();
    let relay_hints = vec![relay_hint];
    let abilities = transit::Abilities::ALL;
    let cancel_call = futures::future::pending::<()>();
    
    let path = Path::new(file_path);
    let file_name = path
        .file_name()
        .and_then(|os| os.to_str())
        .unwrap_or("unknown")
        .to_string();
    
    // Connect the wormhole
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

    let file = File::open(path)
        .await
        .map_err(|e| {
            let error_msg = format!("Failed to open file: {}", e);
            let _ = app_handle.emit("send-error", serde_json::json!({
                "id": send_id.clone(),
                "file_name": file_name.clone(),
                "error": error_msg.clone()
            }));
            error_msg
        })?;
    let metadata = file
        .metadata()
        .await
        .map_err(|e| {
            let error_msg = format!("Failed to get metadata: {}", e);
            let _ = app_handle.emit("send-error", serde_json::json!({
                "id": send_id.clone(),
                "file_name": file_name.clone(),
                "error": error_msg.clone()
            }));
            error_msg
        })?;
    let file_size = metadata.len();
    let mut compat_file = file.compat();

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

    // Send the file, optionally emitting progress updates
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
                "code": send_code.clone()
            }));
        },
        cancel_call,
    )
    .await
    .map_err(|e| {
        let error_message = format!("Failed to send file: {}", e);
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

#[tauri::command]
async fn cancel_send(send_id: String) -> Result<String, String> {
    // Remove from active sends
    let code = ACTIVE_SENDS.lock().await.remove(&send_id)
        .map(|s| s.code)
        .unwrap_or_default();
    
    if code.is_empty() {
        return Err("No active send found for this ID".to_string());
    }
    
    println!("Cancelled send with id: {} (code: {})", send_id, code);
    Ok(format!("Send cancelled (code: {})", code))
}



#[tauri::command]
async fn request_file_call(receive_code: &str) -> Result<String, String> {
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

    // Connecting to the mailbox
    //TODO: Allow customizable configs
    let config = transfer::APP_CONFIG.clone();
    let mailbox_connection = match MailboxConnection::connect(config, code, false).await {
        Ok(conn) => {
            println!("Successfully connected to the mailbox. Attempting to establish Wormhole...");
            conn
        }
        Err(e) => {
            let msg = format!("Failed to create mailbox: {}", e);
            println!("{}", msg);
            return Err(msg);
        }
    };
    let wormhole = Wormhole::connect(mailbox_connection).await.map_err(|e: WormholeError| {
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
    let cancel_call = futures::future::pending::<()>();

    let maybe_request = transfer::request_file(wormhole, relay_hints, abilities, cancel_call)
        .await
        .map_err(|e| format!("Failed to request file: {}", e))?;
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

#[tauri::command]
async fn receiving_file_deny(id: String) -> Result<String, String> {
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

// Function that takes in a wormhole code and attempts to build a ReceiveRequest and store it for later acceptance or denial.
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

#[tauri::command]
async fn receiving_file_accept(id: String, app_handle: AppHandle) -> Result<String, String> {
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
        let cancel = futures::future::pending::<()>(); //TODO: Add a proper timeout or cancel instead of leaving connections hanging forever.

        entry
            .request
            .accept(transit_handler, progress_handler, &mut compat_file, cancel)
            .await
            .map_err(|e| {
                let error_message = format!("Error accepting file: {}", e);
                println!("{}", error_message);
                let _ = error_app_handle.emit("download-error", serde_json::json!({
                    "id": error_id,
                    "file_name": error_file_name,
                    "error": error_message
                }));
                error_message
            })
            .and_then(|_| {
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
                })
            })?;
        Ok(format!(
            "File transfer completed! File saved to {}",
            file_path.display()
        ))
    } else {
        Err("No request found for this id".to_string())
    }
}

#[tauri::command]
async fn set_download_directory(app_handle: AppHandle, new_path: String) -> Result<(), String> {
    let new_path_buf = PathBuf::from(&new_path);

    // Check if path exists and is a directory
    if !new_path_buf.exists() {
        return Err("Provided path does not exist.".to_string());
    }
    if !new_path_buf.is_dir() {
        return Err("Provided path is not a directory.".to_string());
    }

    let app_settings_state = app_handle.state::<tokio::sync::Mutex<settings::AppSettings>>();
    let mut app_settings_lock = app_settings_state.lock().await;
    app_settings_lock.set_download_directory(new_path_buf);

    // Save settings
    let settings_path = settings::get_settings_path(&app_handle);
    if let Err(e) = settings::save_settings(&app_settings_lock, &settings_path) {
        return Err(format!("Failed to save settings: {}", e));
    }

    Ok(())
}

#[tauri::command]
async fn get_download_path(app_handle: AppHandle) -> Result<String, String> {
    let app_settings_state = app_handle.state::<tokio::sync::Mutex<settings::AppSettings>>();
    let app_settings_lock = app_settings_state.lock().await;
    let dir = app_settings_lock
        .get_download_directory()
        .to_string_lossy()
        .to_string();
    Ok(dir)
}

#[tauri::command]
async fn received_files_data(app_handle: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let files = files_json::get_received_files_json_data(app_handle).await?;
    Ok(files)
}

//TODO:: Create a function that checks if a file under that name/directory already exists and prompt the user to overwrite if they want instead of hard overwriting it.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_settings = settings::init_settings(app.handle());
            app.manage(Mutex::new(app_settings));

            files_json::init_received_files(app.handle());

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            send_file_call,
            cancel_send,
            request_file_call,
            receiving_file_accept,
            receiving_file_deny,
            set_download_directory,
            received_files_data,
            get_download_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
