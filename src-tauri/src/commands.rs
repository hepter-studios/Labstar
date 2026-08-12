use crate::{
    deep_links::PendingDeepLinks,
    profile_connections,
    security::{self, ValidatedDeepLink},
};
use serde::Serialize;
use tauri::{AppHandle, Manager, State, UserAttentionType};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;

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
    pub backend_transport: &'static str,
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
        backend_transport: "supabase-rpc",
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
        .unminimize()
        .map_err(|error| format!("main_window_restore_failed: {error}"))?;
    window
        .set_focus()
        .map_err(|error| format!("main_window_focus_failed: {error}"))?;
    Ok(())
}

#[tauri::command]
pub fn request_main_window_attention(app: AppHandle, critical: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main_window_not_found".to_string())?;

    window
        .request_user_attention(Some(if critical {
            UserAttentionType::Critical
        } else {
            UserAttentionType::Informational
        }))
        .map_err(|error| format!("main_window_attention_failed: {error}"))?;
    Ok(())
}

#[tauri::command]
pub fn show_native_notification(app: AppHandle, title: String, body: String) -> Result<(), String> {
    let safe_title = title.trim().chars().take(90).collect::<String>();
    let safe_body = body.trim().chars().take(280).collect::<String>();
    if safe_title.is_empty() {
        return Err("notification_title_required".to_string());
    }

    app.notification()
        .builder()
        .title(safe_title)
        .body(safe_body)
        .show()
        .map_err(|error| format!("native_notification_failed: {error}"))
}

#[tauri::command]
pub fn open_auth_url(app: AppHandle, url: String) -> Result<(), String> {
    let safe_url = security::validate_auth_start_url(&url).map_err(|error| error.to_string())?;
    app.opener()
        .open_url(safe_url, None::<&str>)
        .map_err(|error| format!("oauth_browser_open_failed: {error}"))
}

#[tauri::command]
pub fn open_profile_connection_url(app: AppHandle, url: String) -> Result<(), String> {
    let safe_url = profile_connections::validate_github_authorization_url(&url)
        .map_err(|error| error.to_string())?;
    app.opener()
        .open_url(safe_url, None::<&str>)
        .map_err(|error| format!("profile_connection_browser_open_failed: {error}"))
}

#[tauri::command]
pub fn exit_mobile_app(app: AppHandle) {
    #[cfg(mobile)]
    app.exit(0);

    #[cfg(not(mobile))]
    let _ = app;
}
