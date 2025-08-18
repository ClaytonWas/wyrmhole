// This file contains the settings for the Tauri application.
// Creates and modifies the settings file.
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub download_directory: PathBuf,
    pub received_files_directory: PathBuf,
}

impl AppSettings {
    pub fn get_download_directory(&self) -> &PathBuf {
        &self.download_directory
    }

    pub fn get_received_files_directory(&self) -> &PathBuf {
        &self.received_files_directory
    }

    pub fn set_download_directory(&mut self, path: PathBuf) {
        self.download_directory = path;
    }

    pub fn set_received_files_directory(&mut self, path: PathBuf) {
        self.received_files_directory = path;
    }
}

// Gets the config path of the applications operating system and appends a settings.json.
pub fn get_settings_path(app_handle: &AppHandle) -> PathBuf {
    let mut path = app_handle.path().app_config_dir().unwrap_or_else(|e| {
        eprintln!("Could not get app config directory: {}", e);
        PathBuf::from(".")
    });

    // Ensure the config directory exists before writing to it.
    if !path.exists() {
        if let Err(e) = fs::create_dir_all(&path) {
            eprintln!("Failed to create config directory: {}", e);
        }
    }

    path.push("settings.json");
    path
}

// Get the app data path of the applications operating system and appends a receivedFiles.json.
pub fn get_received_files_path(app_handle: &AppHandle) -> PathBuf {
    let mut path = app_handle.path().app_data_dir().unwrap_or_else(|e| {
        eprintln!("Could not get app config directory: {}", e);
        PathBuf::from(".")
    });

    // Ensure the config directory exists before writing to it.
    if !path.exists() {
        if let Err(e) = fs::create_dir_all(&path) {
            eprintln!("Failed to create config directory: {}", e);
        }
    }

    path.push("received_files.json");
    path
}

// Creates an instance of AppSettings with default values.
fn create_default_settings(app_handle: &AppHandle) -> AppSettings {
    let download_dir = app_handle.path().download_dir().unwrap_or_else(|e| {
        eprintln!("Could not get app data directory: {}", e);
        PathBuf::from(".")
    });
    let received_dir = get_received_files_path(app_handle);

    AppSettings {
        download_directory: download_dir,
        received_files_directory: received_dir,
    }
}

// Initializes wyrmhole settings.json.
pub fn init_settings(app_handle: &AppHandle) -> AppSettings {
    let settings_path = get_settings_path(app_handle);

    // Attempt to load settings from file.
    if settings_path.exists() {
        if let Ok(content) = fs::read_to_string(&settings_path) {
            if let Ok(settings) = serde_json::from_str::<AppSettings>(&content) {
                println!(
                    "Settings loaded successfully from {}.",
                    settings_path.display()
                );
                return settings;
            } else {
                eprintln!(
                    "Failed to parse settings.json, creating a new file with defaults at {}",
                    settings_path.display()
                );
            }
        } else {
            eprintln!(
                "Failed to read settings.json, creating a new file with defaults at {}",
                settings_path.display()
            );
        }
    } else {
        println!(
            "settings.json not found, creating a new file with defaults at {}",
            settings_path.display()
        );
    }

    // If loading failed or file didn't exist, create and save default settings.
    let default_settings = create_default_settings(app_handle);
    if let Err(e) = save_settings(&default_settings, &settings_path) {
        eprintln!("Failed to save default settings: {}", e);
    }
    default_settings
}

// Saves the current AppSettings struct information to the settings.json file.
pub fn save_settings(
    settings: &AppSettings,
    path: &Path,
) -> Result<(), Box<dyn std::error::Error>> {
    let json = serde_json::to_string_pretty(settings)?;
    fs::write(path, json)?;
    Ok(())
}
