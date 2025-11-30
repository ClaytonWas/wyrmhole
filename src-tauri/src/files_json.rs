// This file creates and modifies the file receive and sent card history for the Tauri application.
use chrono::prelude::*;
use serde::{Deserialize, Serialize};
use std::fs;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

use crate::settings;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReceivedFile {
    pub file_name: String,
    pub file_size: u64,
    pub file_extension: String,
    pub download_url: PathBuf,
    pub download_time: DateTime<Local>,
    pub connection_type: String, // Cast from ConnectionType to String because serde doesn't have a serializer for ConnectionType and I don't know if it will even matter.
    pub peer_address: SocketAddr,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SentFile {
    pub file_name: String,
    pub file_size: u64,
    pub file_extension: String,
    pub file_paths: Vec<PathBuf>,
    pub send_time: DateTime<Local>,
    pub connection_code: String,
}

// Initializes a received_files.json file.
// It attempts to load existing file data; if unsuccessful, it creates an empty array.
pub fn init_received_files(app_handle: &AppHandle) -> Vec<ReceivedFile> {
    // Pulls the value from the settings.rs AppSettings struct instead of calling directly to the OS to allow user reassignments.
    let received_files_path = settings::get_received_files_path(app_handle);

    // Attempt to load received files from the JSON file.
    if received_files_path.exists() {
        if let Ok(content) = fs::read_to_string(&received_files_path) {
            if let Ok(files) = serde_json::from_str::<Vec<ReceivedFile>>(&content) {
                println!(
                    "Received files loaded successfully from {}.",
                    received_files_path.display()
                );
                return files;
            } else {
                eprintln!(
                    "Failed to parse received_files.json, creating a new empty file at {}",
                    received_files_path.display()
                );
            }
        } else {
            eprintln!(
                "Failed to read received_files.json, creating a new empty file with defaults at {}",
                received_files_path.display()
            );
        }
    } else {
        println!(
            "received_files.json not found, creating a new empty file at {}",
            received_files_path.display()
        );
    }

    // If loading failed or file didn't exist, create and save an empty list.
    let default_files = Vec::new(); // Initialize as an empty vector (functions as an empty JSON array)
    if let Err(e) = save_received_files(&default_files, &received_files_path) {
        eprintln!("Failed to save initial empty received files: {}", e);
    }
    default_files
}

// Saves the current list of `ReceivedFile` structs to the `received_files.json` file.
pub fn save_received_files(files: &Vec<ReceivedFile>, path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let json = serde_json::to_string_pretty(files)?;
    fs::write(path, json)?;
    Ok(())
}

// Adds a new received file to the list and saves the updated list.
pub fn add_received_file(app_handle: AppHandle, new_file: ReceivedFile) -> Result<Vec<ReceivedFile>, String> {
    let path = settings::get_received_files_path(&app_handle);
    let mut files = init_received_files(&app_handle); // Load current files

    files.push(new_file.clone()); // Add the new file

    match save_received_files(&files, &path) {
        Ok(_) => {
            // Emit event to notify frontend
            let _ = app_handle.emit("received-file-added", serde_json::json!({
                "file": {
                    "file_name": new_file.file_name,
                    "file_size": new_file.file_size,
                    "file_extension": new_file.file_extension,
                    "download_url": new_file.download_url.to_string_lossy().to_string(),
                    "download_time": new_file.download_time.to_rfc3339(),
                    "connection_type": new_file.connection_type,
                    "peer_address": new_file.peer_address.to_string(),
                }
            }));
            Ok(files) // Return updated list on success
        },
        Err(e) => Err(format!("Failed to save received files: {}", e)),
    }
}

pub async fn get_received_files_json_data(app_handle: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let received_files_path = settings::get_received_files_path(&app_handle);
    println!("Reading received files history from: {}", received_files_path.display());
    
    // Read the file contents into a string
    let contents = fs::read_to_string(&received_files_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    
    // Parse it as a JSON array
    let files: Vec<serde_json::Value> = serde_json::from_str(&contents)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;
    
    Ok(files)
}

// Initializes a sent_files.json file.
// It attempts to load existing file data; if unsuccessful, it creates an empty array.
pub fn init_sent_files(app_handle: &AppHandle) -> Vec<SentFile> {
    let sent_files_path = settings::get_sent_files_path(app_handle);

    // Attempt to load sent files from the JSON file.
    if sent_files_path.exists() {
        if let Ok(content) = fs::read_to_string(&sent_files_path) {
            if let Ok(files) = serde_json::from_str::<Vec<SentFile>>(&content) {
                println!(
                    "Sent files loaded successfully from {}.",
                    sent_files_path.display()
                );
                return files;
            } else {
                eprintln!(
                    "Failed to parse sent_files.json, creating a new empty file at {}",
                    sent_files_path.display()
                );
            }
        } else {
            eprintln!(
                "Failed to read sent_files.json, creating a new empty file with defaults at {}",
                sent_files_path.display()
            );
        }
    } else {
        println!(
            "sent_files.json not found, creating a new empty file at {}",
            sent_files_path.display()
        );
    }

    // If loading failed or file didn't exist, create and save an empty list.
    let default_files = Vec::new();
    if let Err(e) = save_sent_files(&default_files, &sent_files_path) {
        eprintln!("Failed to save initial empty sent files: {}", e);
    }
    default_files
}

// Saves the current list of `SentFile` structs to the `sent_files.json` file.
pub fn save_sent_files(files: &Vec<SentFile>, path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let json = serde_json::to_string_pretty(files)?;
    fs::write(path, json)?;
    Ok(())
}

// Adds a new sent file to the list and saves the updated list.
pub fn add_sent_file(app_handle: AppHandle, new_file: SentFile) -> Result<Vec<SentFile>, String> {
    let path = settings::get_sent_files_path(&app_handle);
    let mut files = init_sent_files(&app_handle); // Load current files

    files.push(new_file.clone()); // Add the new file

    match save_sent_files(&files, &path) {
        Ok(_) => {
            // Emit event to notify frontend
            let file_paths_str: Vec<String> = new_file.file_paths.iter()
                .map(|p| p.to_string_lossy().to_string())
                .collect();
            let _ = app_handle.emit("sent-file-added", serde_json::json!({
                "file": {
                    "file_name": new_file.file_name,
                    "file_size": new_file.file_size,
                    "file_extension": new_file.file_extension,
                    "file_paths": file_paths_str,
                    "send_time": new_file.send_time.to_rfc3339(),
                    "connection_code": new_file.connection_code,
                }
            }));
            Ok(files) // Return updated list on success
        },
        Err(e) => Err(format!("Failed to save sent files: {}", e)),
    }
}

pub async fn get_sent_files_json_data(app_handle: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let sent_files_path = settings::get_sent_files_path(&app_handle);
    println!("Reading sent files history from: {}", sent_files_path.display());
    
    // Read the file contents into a string
    let contents = fs::read_to_string(&sent_files_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    
    // Parse it as a JSON array
    let files: Vec<serde_json::Value> = serde_json::from_str(&contents)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;
    
    Ok(files)
}