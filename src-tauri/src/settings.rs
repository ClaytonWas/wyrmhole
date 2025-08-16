// This file contains the settings for the Tauri application.
// Creates and modifies the settings file.
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::fs;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub download_directory: PathBuf,
}

// Gets the config path of the applications operating system and appends a settings.json.
fn get_settings_path(app_handle: &AppHandle) -> PathBuf {
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

// Creates an instance of AppSettings with default values.
fn create_default_settings(app_handle: &AppHandle) -> AppSettings {
    let download_dir = app_handle.path().download_dir().unwrap_or_else(|e| {
        eprintln!("Could not get download directory, using a fallback: {}", e);
        // Using `std::env::current_dir` as a fallback.
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
    });

    AppSettings {
        download_directory: download_dir,
    }
}

// Initializes wyrmhole settings.json.
pub fn init_settings(app_handle: &AppHandle) -> AppSettings {
    let settings_path = get_settings_path(app_handle);

    // Attempt to load settings from file.
    if settings_path.exists() {
        if let Ok(content) = fs::read_to_string(&settings_path) {
            if let Ok(settings) = serde_json::from_str::<AppSettings>(&content) {
                println!("Settings loaded successfully from {}.", settings_path.display());
                return settings;
            } else {
                eprintln!("Failed to parse settings.json, creating a new file with defaults at {}", settings_path.display());
            }
        } else {
            eprintln!("Failed to read settings.json, creating a new file with defaults at {}", settings_path.display());
        }
    } else {
        println!("settings.json not found, creating a new file with defaults at {}", settings_path.display());
    }

    // If loading failed or file didn't exist, create and save default settings.
    let default_settings = create_default_settings(app_handle);
    if let Err(e) = save_settings(&default_settings, &settings_path) {
        eprintln!("Failed to save default settings: {}", e);
    }
    default_settings
}

// Saves the current AppSettings struct information to the settings.json file.
pub fn save_settings(settings: &AppSettings, path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let json = serde_json::to_string_pretty(settings)?;
    fs::write(path, json)?;
    Ok(())
}