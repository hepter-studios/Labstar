mod commands;
mod security;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // Deve ser o primeiro plugin: no desktop, uma segunda abertura apenas
    // entrega o deep link à instância já existente e traz a janela para frente.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(
        |app, arguments, _working_directory| {
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
        .plugin(tauri_plugin_log::Builder::new().build());

    builder
        .setup(|app| {
            let app_data_directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_directory)?;

            // Em desenvolvimento no Windows e no Linux, registra o esquema
            // estático para permitir testar labstar:// sem instalar o bundle.
            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register_all()?;
            }

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
            commands::focus_main_window
        ])
        .run(tauri::generate_context!())
        .expect("erro fatal ao executar o núcleo Tauri da Labstar");
}
