// This file contains all settings logic for the Tauri application.
// Creates and modifies the settings file, and provides public API functions for settings operations.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, Emitter};
use tokio::sync::Mutex;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub download_directory: PathBuf,
    pub received_files_directory: PathBuf,
    #[serde(default = "default_auto_extract")]
    pub auto_extract_tarballs: bool,
    #[serde(default = "default_folder_name_format")]
    pub default_folder_name_format: String,
}

fn default_auto_extract() -> bool {
    false
}

fn default_folder_name_format() -> String {
    "#-files-via-wyrmhole".to_string()
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

    pub fn get_auto_extract_tarballs(&self) -> bool {
        self.auto_extract_tarballs
    }

    pub fn set_auto_extract_tarballs(&mut self, value: bool) {
        self.auto_extract_tarballs = value;
    }

    pub fn get_default_folder_name_format(&self) -> &String {
        &self.default_folder_name_format
    }

    pub fn set_default_folder_name_format(&mut self, value: String) {
        self.default_folder_name_format = value;
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

// Get the app data path of the applications operating system and appends a sent_files.json.
pub fn get_sent_files_path(app_handle: &AppHandle) -> PathBuf {
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

    path.push("sent_files.json");
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
        auto_extract_tarballs: false,
        default_folder_name_format: default_folder_name_format(),
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

// Public API functions - these are called from lib.rs as secure bindings

pub async fn set_download_directory(app_handle: AppHandle, new_path: String) -> Result<(), String> {
    let new_path_buf = PathBuf::from(&new_path);

    // Check if path exists and is a directory
    if !new_path_buf.exists() {
        return Err("Provided path does not exist.".to_string());
    }
    if !new_path_buf.is_dir() {
        return Err("Provided path is not a directory.".to_string());
    }

    let app_settings_state = app_handle.state::<Mutex<AppSettings>>();
    let mut app_settings_lock = app_settings_state.lock().await;
    app_settings_lock.set_download_directory(new_path_buf);

    // Save settings
    let settings_path = get_settings_path(&app_handle);
    if let Err(e) = save_settings(&app_settings_lock, &settings_path) {
        return Err(format!("Failed to save settings: {}", e));
    }

    Ok(())
}

pub async fn get_download_path(app_handle: AppHandle) -> Result<String, String> {
    let app_settings_state = app_handle.state::<Mutex<AppSettings>>();
    let app_settings_lock = app_settings_state.lock().await;
    let dir = app_settings_lock
        .get_download_directory()
        .to_string_lossy()
        .to_string();
    Ok(dir)
}

pub async fn get_auto_extract_tarballs(app_handle: AppHandle) -> Result<bool, String> {
    let app_settings_state = app_handle.state::<Mutex<AppSettings>>();
    let app_settings_lock = app_settings_state.lock().await;
    Ok(app_settings_lock.get_auto_extract_tarballs())
}

pub async fn set_auto_extract_tarballs(app_handle: AppHandle, value: bool) -> Result<(), String> {
    let app_settings_state = app_handle.state::<Mutex<AppSettings>>();
    let mut app_settings_lock = app_settings_state.lock().await;
    app_settings_lock.set_auto_extract_tarballs(value);

    // Save settings
    let settings_path = get_settings_path(&app_handle);
    if let Err(e) = save_settings(&app_settings_lock, &settings_path) {
        return Err(format!("Failed to save settings: {}", e));
    }

    Ok(())
}

pub async fn get_default_folder_name_format(app_handle: AppHandle) -> Result<String, String> {
    let app_settings_state = app_handle.state::<Mutex<AppSettings>>();
    let app_settings_lock = app_settings_state.lock().await;
    Ok(app_settings_lock.get_default_folder_name_format().clone())
}

pub async fn set_default_folder_name_format(app_handle: AppHandle, value: String) -> Result<(), String> {
    let app_settings_state = app_handle.state::<Mutex<AppSettings>>();
    let mut app_settings_lock = app_settings_state.lock().await;
    app_settings_lock.set_default_folder_name_format(value.clone());

    // Save settings
    let settings_path = get_settings_path(&app_handle);
    if let Err(e) = save_settings(&app_settings_lock, &settings_path) {
        return Err(format!("Failed to save settings: {}", e));
    }

    // Emit event to notify frontend that the setting has been updated
    let _ = app_handle.emit("default-folder-name-format-updated", serde_json::json!({
        "value": value
    }));

    Ok(())
}

pub async fn export_received_files_json(app_handle: AppHandle, file_path: String) -> Result<(), String> {
    let received_files_path = get_received_files_path(&app_handle);
    
    // Read the JSON file content
    let json_content = fs::read_to_string(&received_files_path)
        .map_err(|e| format!("Failed to read received files JSON: {}", e))?;
    
    // Write to the user-selected location
    fs::write(&file_path, json_content)
        .map_err(|e| format!("Failed to write exported file: {}", e))?;
    
    Ok(())
}

pub async fn export_sent_files_json(app_handle: AppHandle, file_path: String) -> Result<(), String> {
    let sent_files_path = get_sent_files_path(&app_handle);
    
    // Read the JSON file content
    let json_content = fs::read_to_string(&sent_files_path)
        .map_err(|e| format!("Failed to read sent files JSON: {}", e))?;
    
    // Write to the user-selected location
    fs::write(&file_path, json_content)
        .map_err(|e| format!("Failed to write exported file: {}", e))?;
    
    Ok(())
}
