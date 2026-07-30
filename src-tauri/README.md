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

## Deep links nativos

O aplicativo registra o esquema:

```text
labstar://
```

Formatos aceitos pelo núcleo Rust:

```text
labstar://invite/<token-hexadecimal-de-64-caracteres>
labstar://auth/callback?code=<codigo-temporario>&invite=<token-opcional>
https://labstar.pages.dev/?invite=<token>
```

O Rust rejeita outros esquemas, hosts, caminhos, parâmetros duplicados, tokens malformados e valores OAuth excessivos. Tokens e códigos nunca devem ser escritos nos logs.

No Windows e Linux, o plugin de instância única entrega o link à janela existente. O núcleo guarda os links recebidos antes do React carregar e os disponibiliza pelo comando `take_pending_deep_links`.

## Comandos nativos atuais

- `native_health`: diagnóstico tipado do executável e do diretório de dados;
- `validate_deep_link`: valida e normaliza convite ou callback OAuth;
- `build_invite_deep_link`: cria um link `labstar://invite/...` somente a partir de token válido;
- `take_pending_deep_links`: entrega uma única vez os links recebidos durante a inicialização;
- `focus_main_window`: restaura o foco da janela principal.

## Regra de segurança

A interface não recebe acesso geral ao computador. Toda operação nativa deve ser implementada como comando Rust validado e liberada explicitamente em `capabilities/desktop-main.json`.

Segredos do Supabase, Client Secrets de Google/GitHub e chaves `service_role` nunca pertencem ao React, ao repositório ou ao binário distribuído.
