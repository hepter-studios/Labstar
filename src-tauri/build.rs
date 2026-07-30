fn main() {
    const COMMANDS: &[&str] = &["native_health"];

    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("falha ao gerar o manifesto seguro do Tauri");
}
