mod commands;
mod deep_links;
mod security;
mod settings;

use deep_links::PendingDeepLinks;
use tauri::{Emitter, Manager};

#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    WindowEvent,
};
#[cfg(desktop)]
use tauri_plugin_notification::NotificationExt;

const WEBVIEW_CACHE_RESET_MARKER: &str = "webview-cache-reset-11.0.4";

#[cfg(desktop)]
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(
        |app, arguments, _working_directory| {
            log::info!(
                "Solicitação de segunda instância recebida com {} argumento(s)",
                arguments.len()
            );
            show_main_window(app);
        },
    ));

    let builder = builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_log::Builder::new().build());

    #[cfg(desktop)]
    let builder = builder.on_window_event(|window, event| {
        if window.label() != "main" {
            return;
        }

        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = window.hide();
            let _ = window
                .app_handle()
                .notification()
                .builder()
                .title("Labstar continua ativo")
                .body("Mensagens e chamadas privadas continuarão chegando pela bandeja do sistema.")
                .show();
        }
    });

    builder
        .setup(|app| {
            app.manage(PendingDeepLinks::default());

            let app_data_directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_directory)?;

            #[cfg(desktop)]
            {
                let open_item = MenuItem::with_id(
                    app,
                    "open-labstar",
                    "Abrir Labstar",
                    true,
                    None::<&str>,
                )?;
                let quit_item = MenuItem::with_id(
                    app,
                    "quit-labstar",
                    "Sair do Labstar",
                    true,
                    None::<&str>,
                )?;
                let menu = Menu::with_items(app, &[&open_item, &quit_item])?;

                let mut tray_builder = TrayIconBuilder::with_id("labstar-tray")
                    .tooltip("Labstar — mensagens e chamadas em segundo plano")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "open-labstar" => show_main_window(app),
                        "quit-labstar" => app.exit(0),
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            show_main_window(tray.app_handle());
                        }
                    });

                if let Some(icon) = app.default_window_icon().cloned() {
                    tray_builder = tray_builder.icon(icon);
                }

                tray_builder.build(app)?;
            }

            #[cfg(windows)]
            {
                let marker = app_data_directory.join(WEBVIEW_CACHE_RESET_MARKER);
                if !marker.exists() {
                    if let Some(window) = app.get_webview_window("main") {
                        match window.clear_all_browsing_data() {
                            Ok(()) => {
                                std::fs::write(&marker, b"cleared")?;
                                log::info!(
                                    "Cache visual do WebView2 removido para a migração 11.0.4"
                                );
                                if let Err(error) = window.reload() {
                                    log::warn!(
                                        "Cache removido, mas a recarga inicial falhou: {error}"
                                    );
                                }
                            }
                            Err(error) => log::warn!(
                                "Não foi possível limpar o cache visual do WebView2: {error}"
                            ),
                        }
                    }
                }
            }

            use tauri_plugin_deep_link::DeepLinkExt;

            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            app.deep_link().register_all()?;

            if let Some(urls) = app.deep_link().get_current()? {
                let pending = app.state::<PendingDeepLinks>();
                for url in urls {
                    if let Err(error) = pending.ingest(url.as_str()) {
                        log::warn!("Deep link inicial rejeitado: {error}");
                    }
                }
            }

            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                let Some(pending) = handle.try_state::<PendingDeepLinks>() else {
                    log::error!("Estado de deep links indisponível");
                    return;
                };

                for url in event.urls() {
                    match pending.ingest(url.as_str()) {
                        Ok(parsed) => {
                            let _ = handle.emit("labstar://deep-link", parsed);
                        }
                        Err(error) => log::warn!("Deep link rejeitado: {error}"),
                    }
                }

                #[cfg(desktop)]
                show_main_window(&handle);
            });

            log::info!(
                "Labstar {} iniciado em {}-{}; dados nativos em {}; acesso: supabase-rpc",
                app.package_info().version,
                std::env::consts::OS,
                std::env::consts::ARCH,
                app_data_directory.display()
            );
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::native_health,
            commands::validate_deep_link,
            commands::build_invite_deep_link,
            commands::take_pending_deep_links,
            commands::focus_main_window,
            commands::request_main_window_attention,
            commands::show_native_notification,
            commands::open_auth_url,
            settings::load_app_settings,
            settings::save_app_settings,
            settings::reset_app_settings
        ])
        .run(tauri::generate_context!())
        .expect("erro fatal ao executar o núcleo Tauri da Labstar");
}
