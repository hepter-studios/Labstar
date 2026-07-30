use crate::{
    deep_links::PendingDeepLinks,
    security::{self, ValidatedDeepLink},
};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeHealth {
    pub status: &'static str,
    pub app_version: String,
    pub platform: &'static str,
    pub architecture: &'static str,
    pub build_profile: &'static str,
    pub app_data_directory: String,
    pub deep_link_scheme: &'static str,
}

#[tauri::command]
pub fn native_health(app: AppHandle) -> Result<NativeHealth, String> {
    let app_data_directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app_data_dir_unavailable: {error}"))?;

    std::fs::create_dir_all(&app_data_directory)
        .map_err(|error| format!("app_data_dir_create_failed: {error}"))?;

    Ok(NativeHealth {
        status: "ok",
        app_version: app.package_info().version.to_string(),
        platform: std::env::consts::OS,
        architecture: std::env::consts::ARCH,
        build_profile: if cfg!(debug_assertions) {
            "debug"
        } else {
            "release"
        },
        app_data_directory: app_data_directory.display().to_string(),
        deep_link_scheme: "labstar",
    })
}

#[tauri::command]
pub fn validate_deep_link(raw: String) -> Result<ValidatedDeepLink, String> {
    security::parse_deep_link(&raw).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn build_invite_deep_link(token: String) -> Result<String, String> {
    security::build_invite_deep_link(&token).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn take_pending_deep_links(
    pending: State<'_, PendingDeepLinks>,
) -> Result<Vec<ValidatedDeepLink>, String> {
    pending.drain()
}

#[tauri::command]
pub fn focus_main_window(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main_window_not_found".to_string())?;

    window
        .show()
        .map_err(|error| format!("main_window_show_failed: {error}"))?;
    window
        .set_focus()
        .map_err(|error| format!("main_window_focus_failed: {error}"))?;
    Ok(())
}
