# Labstar — reconstrução completa a partir do GitHub

Este documento descreve como reconstruir o Labstar sem depender de conversas, arquivos locais de uma pessoa ou instaladores antigos.

## Regra de segurança

O repositório é privado. Nenhum segredo real deve ser escrito neste documento, no código, em issues, PRs ou logs. Segredos ficam somente em GitHub Actions Secrets, Fly Secrets, Supabase ou outro cofre aprovado.

## Estado atual antes dos merges

O trabalho ainda está separado em PRs/branches para permitir teste seguro:

| Parte | Branch / PR | Conteúdo |
| --- | --- | --- |
| Produção web atual | `main` | versão web atualmente publicada |
| Autenticação e migrações | `fix/auth-membership-access` / PR #3 | membros, autorização, SQL e hardening |
| Backend central | `feat/rust-backend-clean` / PR #5 | Axum/Tokio, membros, convites, Fly.io |
| Fundação desktop | `feat/tauri2-rust-foundation` / PR #1 | Tauri 2 e Rust local |
| Integração desktop | `feat/tauri-auth-rust-integration` / PR #7 | Tauri + OAuth + API Rust + instaladores |

Não faça merge somente para facilitar um build. Os PRs devem permanecer isolados até a matriz de testes ser concluída.

## 1. Requisitos de desenvolvimento

### Web e interface

- Git;
- Node.js 22;
- npm;
- acesso ao repositório privado.

### Desktop Windows

Além dos requisitos acima:

- Rust estável compatível com o `rust-version` do `src-tauri/Cargo.toml`;
- toolchain MSVC do Rust no Windows;
- Microsoft C++ Build Tools / Visual Studio Build Tools com Desktop development with C++;
- WebView2 Runtime;
- Windows 10/11 x64 para validar o instalador.

### Backend

- Rust estável;
- Docker para validar imagem de produção localmente;
- acesso seguro às variáveis do ambiente de backend.

## 2. Clonar a branch integrada do aplicativo

```bash
git clone https://github.com/macksonvictor/Labstar.git
cd Labstar
git checkout feat/tauri-auth-rust-integration
```

Confirme a branch antes de alterar qualquer coisa:

```bash
git branch --show-current
```

## 3. Instalar dependências web

Sempre prefira o lockfile versionado:

```bash
npm ci
```

O projeto usa `package-lock.json`. Não substitua `npm ci` por uma atualização arbitrária de dependências durante um build de validação.

## 4. Configurar o ambiente do frontend/Tauri

Crie `.env.local` a partir de `.env.example`.

Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Linux/macOS:

```bash
cp .env.example .env.local
```

As variáveis necessárias são documentadas em `ENVIRONMENT_SETUP.md`.

Nunca coloque em variáveis `VITE_*`:

- `service_role`;
- `sb_secret_*`;
- senha de banco;
- client secret OAuth;
- token privado da Fly.io;
- chave privada de assinatura.

## 5. Validar a aplicação web

```bash
npm run build
```

Para desenvolvimento:

```bash
npm run dev
```

## 6. Validar o núcleo Tauri/Rust

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --locked --manifest-path src-tauri/Cargo.toml --all-features
```

O `src-tauri/Cargo.lock` deve permanecer versionado.

## 7. Executar o aplicativo desktop em desenvolvimento

Depois de configurar `.env.local`:

```bash
npx tauri dev
```

Valide principalmente:

- abertura da janela;
- conexão com a API Rust;
- Google OAuth;
- callback `labstar://auth/callback`;
- troca de conta;
- preservação de convite pendente.

## 8. Gerar o instalador Windows

A forma oficial e reproduzível é o GitHub Actions:

`Actions → Gerar instalador Windows integrado`

O workflow:

1. usa Node.js 22;
2. instala dependências com `npm ci`;
3. instala Rust;
4. injeta somente configurações públicas necessárias ao frontend;
5. compila Tauri;
6. produz EXE/NSIS e MSI como Artifacts privados;
7. associa o build à branch e ao commit.

Nunca coloque EXE ou MSI no histórico Git.

## 9. Reconstruir o backend Rust

O backend está na branch `feat/rust-backend-clean` até o merge seguro.

```bash
git fetch origin
git checkout feat/rust-backend-clean
```

Validação:

```bash
cargo fmt --manifest-path backend/Cargo.toml -- --check
cargo clippy --locked --manifest-path backend/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --locked --manifest-path backend/Cargo.toml --all-features
```

Imagem de produção:

```bash
docker build -f backend/Dockerfile -t labstar-backend .
```

O deploy oficial usa `.github/workflows/deploy-rust-backend-fly.yml` e `backend/fly.toml`.

## 10. Reconstruir o banco e a autorização

Não improvise SQL. Use `DATABASE_BOOTSTRAP.md` e os arquivos versionados no PR #3.

Antes de qualquer migração:

1. confirmar o projeto/ambiente;
2. gerar backup;
3. baixar o backup para local seguro;
4. aplicar uma migração por vez;
5. validar cada etapa.

## 11. Serviços externos necessários

O código sozinho não substitui a configuração dos serviços. Uma reconstrução completa também precisa:

- projeto Supabase;
- Google OAuth configurado no Supabase;
- GitHub OAuth configurado no Supabase;
- PostgreSQL do Supabase;
- Fly.io para o backend;
- Cloudflare Pages para a versão web;
- GitHub Actions Secrets necessários.

Os nomes e responsabilidades estão em `ENVIRONMENT_SETUP.md`.

## 12. Ordem de validação depois de reconstruir

1. `/health/live`;
2. `/health/ready`;
3. smoke test CORS do Tauri;
4. build web;
5. Clippy/testes do Tauri;
6. EXE instalado em Windows limpo;
7. proprietário entra pelo Google;
8. troca de conta;
9. estados de membro;
10. convites;
11. callbacks;
12. MSI;
13. somente depois considerar merge/release.

## 13. O que não é fonte de verdade

- arquivos enviados por chat;
- EXE antigo;
- ZIP baixado sem commit identificado;
- cópia local de `.env`;
- instruções informais que contradigam o repositório.

A fonte de verdade é o GitHub: código, lockfiles, workflows, documentação, PRs, issues e commits identificados.
