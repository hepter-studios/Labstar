mod commands;
mod deep_links;
mod security;

use deep_links::PendingDeepLinks;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // Deve ser o primeiro plugin: no desktop, uma segunda abertura apenas
    // entrega o deep link à instância já existente e traz a janela para frente.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(
        |app, arguments, _working_directory| {
            // Não registra os argumentos: eles podem conter token de convite
            // ou código temporário do OAuth.
            log::info!(
                "Solicitação de segunda instância recebida com {} argumento(s)",
                arguments.len()
            );

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        },
    ));

    let builder = builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_log::Builder::new().build());

    builder
        .setup(|app| {
            app.manage(PendingDeepLinks::default());

            let app_data_directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_directory)?;

            use tauri_plugin_deep_link::DeepLinkExt;

            // Em desenvolvimento no Windows e no Linux, registra o esquema
            // estático para permitir testar labstar:// sem instalar o bundle.
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
                            // O payload contém somente valores já validados pelo Rust.
                            // Códigos OAuth nunca são escritos nos logs.
                            let _ = handle.emit("labstar://deep-link", parsed);
                        }
                        Err(error) => log::warn!("Deep link rejeitado: {error}"),
                    }
                }

                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            });

            log::info!(
                "Labstar {} iniciado em {}-{}; dados nativos em {}",
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
            commands::open_auth_url
        ])
        .run(tauri::generate_context!())
        .expect("erro fatal ao executar o núcleo Tauri da Labstar");
}
