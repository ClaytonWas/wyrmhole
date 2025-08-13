use std::collections::HashMap;
use once_cell::sync::Lazy;
use tokio::sync::Mutex;
use tokio_util::compat::TokioAsyncWriteCompatExt; 
use uuid::Uuid;
use magic_wormhole::{transfer, transit, Code, MailboxConnection, Wormhole, WormholeError};

struct OpenRequests {
    request: transfer::ReceiveRequest,
}
static REQUESTS_HASHMAP: Lazy<Mutex<HashMap<String, OpenRequests>>> = Lazy::new(|| Mutex::new(HashMap::new()));


// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
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
        Err(WormholeError::UnclaimedNameplate(e)) => {
            let msg = format!("Failed to connect to mailbox: No sender found for this code. {}", e);
            println!("{}", msg);
            return Err(msg);
        }
        Err(e) => {
            let msg = format!("Failed to connect: {}", e);
            println!("{}", msg);
            return Err(msg);
        }
    };
    let wormhole = Wormhole::connect(mailbox_connection).await.map_err(|e| {
        let msg = format!("Failed to connect to Wormhole: {}", e);
        println!("{}", msg);
        msg
    })?;

    // Constructing default request_file(...) variables
    // TODO: (Temporary, should allow the use to change these themselves in a later build.)
    let relay_hint = transit::RelayHint::from_urls(
        None, // no friendly name
        [transit::DEFAULT_RELAY_SERVER.parse().unwrap()]
    ).unwrap();
    let relay_hints = vec![relay_hint];
    let abilities = transit::Abilities::ALL;
    let cancel_call = futures::future::pending::<()>();

    let maybe_request = transfer::request_file(wormhole, relay_hints, abilities, cancel_call).await
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
#[tauri::command]
async fn receiving_file_accept(id: String) -> Result<String, String> {
    let mut requests = REQUESTS_HASHMAP.lock().await;
    if let Some(entry) = requests.remove(&id) {
        println!("receiving_file_accept closing request with id: {}", id);
        println!("File name: {}", entry.request.file_name());


        let transit_handler = |info: transit::TransitInfo| {
            println!("Transit info: {:?}", info);
        };
        let progress_handler = |transferred: u64, total: u64| {
            println!("Progress: {}/{}", transferred, total);
        };
        let file = tokio::fs::File::create(entry.request.file_name()).await.unwrap();
        let mut compat_file = file.compat_write();
        let cancel = futures::future::pending::<()>();
        
        entry.request.accept(transit_handler, progress_handler, &mut compat_file, cancel).await.map_err(|e| {
            let error_message = format!("Error accepting file: {}", e);
            println!("{}", error_message);
            error_message
        })?;
        Ok("File transfer Completed".to_string())
    } else {
        Err("No request found for this id".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![request_file_call, receiving_file_accept, receiving_file_deny])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
