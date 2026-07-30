mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .setup(|app| {
            log::info!(
                "Labstar {} iniciado em {}-{}",
                app.package_info().version,
                std::env::consts::OS,
                std::env::consts::ARCH
            );
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![commands::native_health])
        .run(tauri::generate_context!())
        .expect("erro fatal ao executar o núcleo Tauri da Labstar");
}
