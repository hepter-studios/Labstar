# Núcleo desktop da Labstar

Esta pasta contém a fundação Tauri 2 + Rust. Ela permanece isolada da publicação web até passar por validação e revisão.

## Pré-requisitos no Windows

- Node.js 22;
- Rust estável com toolchain MSVC;
- Microsoft C++ Build Tools;
- Microsoft Edge WebView2.

## Validação local

```powershell
npm ci
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --all-features
```

## Executar em desenvolvimento

Instale a CLI Tauri 2 de forma travada:

```powershell
cargo install tauri-cli --version "^2.11" --locked
cargo tauri dev
```

## Regra de segurança

A interface não recebe acesso geral ao computador. Toda operação nativa deve ser implementada como comando Rust validado e liberada explicitamente em `capabilities/desktop-main.json`.
