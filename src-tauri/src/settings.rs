use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};

const SETTINGS_FILE: &str = "settings-v1.json";
const SETTINGS_TMP_FILE: &str = "settings-v1.json.tmp";
const MAX_DEVICE_ID_LENGTH: usize = 512;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    pub version: u32,
    pub start_view: String,
    pub density: String,
    pub nebula_intensity: String,
    pub reduced_motion: bool,
    pub desktop_notifications: bool,
    pub mention_notifications: bool,
    pub interface_sounds: bool,
    pub message_sounds: bool,
    pub preferred_microphone: String,
    pub preferred_camera: String,
    pub confirm_destructive_actions: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            version: 1,
            start_view: "colaboracao".to_string(),
            density: "comfortable".to_string(),
            nebula_intensity: "subtle".to_string(),
            reduced_motion: false,
            desktop_notifications: true,
            mention_notifications: true,
            interface_sounds: true,
            message_sounds: true,
            preferred_microphone: String::new(),
            preferred_camera: String::new(),
            confirm_destructive_actions: true,
        }
    }
}

impl AppSettings {
    fn validated(mut self) -> Result<Self, String> {
        self.version = 1;
        if !matches!(
            self.start_view.as_str(),
            "mapa" | "visao" | "colaboracao" | "equipe"
        ) {
            return Err("settings_invalid_start_view".to_string());
        }
        if !matches!(self.density.as_str(), "comfortable" | "compact") {
            return Err("settings_invalid_density".to_string());
        }
        if !matches!(
            self.nebula_intensity.as_str(),
            "off" | "subtle" | "visible"
        ) {
            return Err("settings_invalid_nebula_intensity".to_string());
        }
        validate_device_id(&self.preferred_microphone)?;
        validate_device_id(&self.preferred_camera)?;
        Ok(self)
    }
}

#[tauri::command]
pub fn load_app_settings(app: AppHandle) -> Result<AppSettings, String> {
    let path = settings_path(&app)?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }

    let bytes = fs::read(&path).map_err(|_| "settings_read_failed".to_string())?;
    let parsed = serde_json::from_slice::<AppSettings>(&bytes)
        .map_err(|_| "settings_invalid_file".to_string())?;
    parsed.validated()
}

#[tauri::command]
pub fn save_app_settings(app: AppHandle, settings: AppSettings) -> Result<AppSettings, String> {
    let settings = settings.validated()?;
    let path = settings_path(&app)?;
    let parent = path
        .parent()
        .ok_or_else(|| "settings_directory_invalid".to_string())?;
    fs::create_dir_all(parent).map_err(|_| "settings_directory_create_failed".to_string())?;

    let temporary = parent.join(SETTINGS_TMP_FILE);
    let payload = serde_json::to_vec_pretty(&settings)
        .map_err(|_| "settings_serialize_failed".to_string())?;
    fs::write(&temporary, payload).map_err(|_| "settings_write_failed".to_string())?;
    replace_atomically(&temporary, &path)?;
    Ok(settings)
}

#[tauri::command]
pub fn reset_app_settings(app: AppHandle) -> Result<AppSettings, String> {
    let path = settings_path(&app)?;
    if path.exists() {
        fs::remove_file(path).map_err(|_| "settings_reset_failed".to_string())?;
    }
    Ok(AppSettings::default())
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|directory| directory.join(SETTINGS_FILE))
        .map_err(|_| "settings_directory_unavailable".to_string())
}

fn replace_atomically(source: &Path, destination: &Path) -> Result<(), String> {
    if destination.exists() {
        fs::remove_file(destination).map_err(|_| "settings_replace_failed".to_string())?;
    }
    fs::rename(source, destination).map_err(|_| "settings_replace_failed".to_string())
}

fn validate_device_id(value: &str) -> Result<(), String> {
    if value.len() > MAX_DEVICE_ID_LENGTH || value.chars().any(char::is_control) {
        return Err("settings_invalid_device_id".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_invalid_enums_and_long_device_ids() {
        let invalid_view = AppSettings {
            start_view: "unknown".into(),
            ..Default::default()
        };
        assert_eq!(
            invalid_view.validated().unwrap_err(),
            "settings_invalid_start_view"
        );

        let invalid_density = AppSettings {
            density: "huge".into(),
            ..Default::default()
        };
        assert_eq!(
            invalid_density.validated().unwrap_err(),
            "settings_invalid_density"
        );

        let invalid_device = AppSettings {
            preferred_microphone: "x".repeat(MAX_DEVICE_ID_LENGTH + 1),
            ..Default::default()
        };
        assert_eq!(
            invalid_device.validated().unwrap_err(),
            "settings_invalid_device_id"
        );
    }

    #[test]
    fn accepts_supported_settings() {
        let settings = AppSettings::default().validated().unwrap();
        assert_eq!(settings.start_view, "colaboracao");
        assert_eq!(settings.density, "comfortable");
    }
}
