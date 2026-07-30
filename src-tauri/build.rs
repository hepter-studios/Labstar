fn main() {
    const COMMANDS: &[&str] = &[
        "native_health",
        "validate_deep_link",
        "build_invite_deep_link",
        "take_pending_deep_links",
        "focus_main_window",
    ];

    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("falha ao gerar o manifesto seguro do Tauri");
}
