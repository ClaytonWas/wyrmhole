use magic_wormhole::{transfer::APP_CONFIG, Code, MailboxConnection, Wormhole, WormholeError};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn receiving_file(receive_code: &str) -> Result<String, String> {
    // This function is called from the React frontend to receive a file using a code.
    // It expects a code as a string, which is provided by the user in the frontend
    let code_string = receive_code.trim();
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
    let config = APP_CONFIG.clone();
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
    println!("Transit info: {}", transit_info);

    // Receive file offer (second message)
    let offer_bytes = wormhole.receive().await.map_err(|e| {
        let msg = format!("Failed to receive file offer: {}", e);
        println!("{}", msg);
        msg
    })?;
    let file_offer = String::from_utf8_lossy(&offer_bytes).to_string();
    println!("File offer: {}", file_offer);

    // Return this information as a JSON blob for the user to evaluate.
    let json_blob = format!(
        "{{\"transit_info\":{},\"file_offer\":{}}}",
        transit_info, file_offer
    );

    Ok(json_blob)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, receiving_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
