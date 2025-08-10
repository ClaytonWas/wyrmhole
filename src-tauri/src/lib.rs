use std::collections::HashMap;
use once_cell::sync::Lazy;
use tokio::sync::Mutex;
use uuid::Uuid;
use magic_wormhole::{transfer::APP_CONFIG, Code, MailboxConnection, Wormhole, WormholeError};

static WORMHOLES: Lazy<Mutex<HashMap<String, Wormhole>>> = Lazy::new(|| Mutex::new(HashMap::new()));

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
async fn receiving_file_request(receive_code: &str) -> Result<String, String> {
    // This function is called from the React frontend expecting to receive a file using a code.
    // It expects a code as a string, which is provided by user input.
    let mut code_string = receive_code.trim();

    // If it starts with "wormhole receive ", strip prefix
    let prefix = "wormhole receive ";
    if code_string.starts_with(prefix) {
        code_string = &code_string[prefix.len()..];
        code_string = code_string.trim_start();
    }

    if code_string.is_empty() {
        println!("No code provided for receiving file.");
        return Err("No code provided for receiving file.".to_string());
    }
    println!("Received code: {} from React frontend.", code_string);

    // Parse the code string into a Code object
    // This will validate the format of the code and return an error if it is invalid
        let code = code_string.parse::<Code>().map_err(|err| {
        let error_message = format!("Error parsing code: {}", err);
        println!("{}", error_message);
        error_message
    })?;
    println!("Successfully parsed code: {:?}", code);

    // Now that we have a valid code, we can proceed to connect to the mailbox and establish a Wormhole connection
    let config = APP_CONFIG.clone(); // Use the global APP_CONFIG for the mailbox connection for now, can change in the future to allow custom rendezvous relays.
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

    let mut wormhole = Wormhole::connect(mailbox_connection).await.map_err(|e| {
        let msg = format!("Failed to connect to Wormhole: {}", e);
        println!("{}", msg);
        msg
    })?;

    println!("Wormhole connection established successfully.");
    
    // Now that we have a Wormhole connection, we can proceed to receive the file from peer
    // Receive transit info (first message)
    let transit_bytes = wormhole.receive().await.map_err(|e| {
        let msg = format!("Failed to receive transit info: {}", e);
        println!("{}", msg);
        msg
    })?;
    let transit_info = String::from_utf8_lossy(&transit_bytes).to_string();
    //println!("Transit info: {}", transit_info);

    // Receive file offer (second message)
    let offer_bytes = wormhole.receive().await.map_err(|e| {
        let msg = format!("Failed to receive file offer: {}", e);
        println!("{}", msg);
        msg
    })?;
    let file_offer = String::from_utf8_lossy(&offer_bytes).to_string();
    //println!("File offer: {}", file_offer);

    // Return this information as a JSON blob for the user to evaluate.
    let id = Uuid::new_v4().to_string();
    WORMHOLES.lock().await.insert(id.clone(), wormhole);

    Ok(format!(r#"{{"id":"{}","transit_info":{},"file_offer":{}}}"#, id, transit_info, file_offer))
}

#[tauri::command]
async fn receiving_file_deny(id: String) -> Result<String, String> {
    // This function is called when the user denies the file offer.
    // It will close the Wormhole connection associated with the given ID.
    let mut wormholes = WORMHOLES.lock().await;
    if let Some(wormhole) = wormholes.remove(&id) {
        if let Err(e) = wormhole.close().await {
            println!("Error closing wormhole: {}", e);
            return Err(format!("Failed to close wormhole: {}", e));
        }
        println!("receiving_file_deny closing wormhole with id: {}", id);
        Ok("File offer denied and wormhole closed".to_string())
    } else {
        Err("No wormhole found for this ID".to_string())
    }
}

#[tauri::command]
async fn receiving_file_accept(id: String) -> Result<String, String> {
    let mut wormholes = WORMHOLES.lock().await;
    if let Some(mut wormhole) = wormholes.remove(&id) {
        println!("receiving_file_accept closing wormhole with id: {}", id);
        // Proceed with file transfer...
        // This is the next thing to implement.
        // Dont forget to handle the file transfer logic here when you back back to this.
        Ok("File transfer started".to_string())
    } else {
        Err("No wormhole found for this id".to_string())
    }
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![receiving_file_request, receiving_file_accept, receiving_file_deny])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
