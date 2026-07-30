use serde::Serialize;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeHealth {
    pub status: &'static str,
    pub app_version: String,
    pub platform: &'static str,
    pub architecture: &'static str,
    pub app_data_directory: String,
}

#[tauri::command]
pub fn native_health(app: AppHandle) -> Result<NativeHealth, String> {
    let app_data_directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app_data_dir_unavailable: {error}"))?;

    Ok(NativeHealth {
        status: "ok",
        app_version: app.package_info().version.to_string(),
        platform: std::env::consts::OS,
        architecture: std::env::consts::ARCH,
        app_data_directory: app_data_directory.display().to_string(),
    })
}
