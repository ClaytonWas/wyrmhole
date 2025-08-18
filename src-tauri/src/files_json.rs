// This file creates and modifies the file receive and sent card history for the Tauri application.
use chrono::prelude::*;
use serde::{Deserialize, Serialize};
use std::fs;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

use crate::settings;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReceivedFile {
    pub file_name: String,
    pub file_size: u64,
    pub file_extension: String,
    pub progress: u8,
    pub status: String,
    pub download_url: PathBuf,
    pub download_time: DateTime<Local>,
    pub connection_type: String, // Cast from ConnectionType to String because serde doesn't have a serializer for ConnectionType and I don't know if it will even matter.
    pub peer_address: SocketAddr,
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
pub fn save_received_files(
    files: &Vec<ReceivedFile>,
    path: &Path,
) -> Result<(), Box<dyn std::error::Error>> {
    let json = serde_json::to_string_pretty(files)?;
    fs::write(path, json)?;
    Ok(())
}

// Adds a new received file to the list and saves the updated list.
pub fn add_received_file(
    app_handle: AppHandle,
    new_file: ReceivedFile,
) -> Result<Vec<ReceivedFile>, String> {
    let path = settings::get_received_files_path(&app_handle);
    let mut files = init_received_files(&app_handle); // Load current files

    files.push(new_file); // Add the new file

    match save_received_files(&files, &path) {
        Ok(_) => Ok(files), // Return updated list on success
        Err(e) => Err(format!("Failed to save received files: {}", e)),
    }
}
