# Mapa interno do projeto Labstar

Atualizado em 31 de julho de 2026.

Este documento responde três perguntas para qualquer pessoa da equipe ou agente Codex:

1. o que existe no projeto;
2. onde cada parte está;
3. qual branch ou serviço contém cada responsabilidade.

## Por que Rust não aparece na porcentagem principal do GitHub

O repositório usa `main` como branch padrão. A branch `main` ainda representa a produção web atual e não contém `src-tauri/Cargo.toml` nem o backend Rust novo. O código Rust está nos PRs e branches de integração abaixo.

O gráfico de linguagens da página principal é calculado sobre a branch padrão. Portanto, Rust só aparecerá corretamente nessa porcentagem depois que a integração for testada e incorporada com segurança à `main`.

Isso não significa que o Rust esteja ausente. Ele já existe em duas camadas:

- Rust local do Tauri em `src-tauri/`;
- API central Rust no diretório `backend/` da branch `feat/rust-backend-clean`.

## Visão geral dos ambientes

| Ambiente | Endereço ou local | Responsabilidade |
| --- | --- | --- |
| Web atual | `https://labstar.pages.dev` | interface web/PWA publicada |
| API Rust | `https://labstar-api-mackson.fly.dev` | autorização, membros e convites |
| Supabase | projeto `pgzwyngxsxnheulvusdq` | Auth, PostgreSQL, Storage e Realtime |
| Desktop | Artifacts privados do GitHub Actions | aplicativo Tauri 2 para Windows |
| Código | repositório privado `macksonvictor/Labstar` | fonte, documentação, PRs e workflows |

## Branches e responsabilidades

| Branch | Responsabilidade | PR |
| --- | --- | --- |
| `main` | produção web atual | — |
| `feat/rust-backend-clean` | API central Rust, Docker e Fly.io | #5 |
| `fix/auth-membership-access` | fundação de autenticação, membros e convites | #3 |
| `feat/auth-rust-api-integration` | interface ligada à API Rust | #6 |
| `feat/tauri2-rust-foundation` | fundação desktop Tauri 2 e Rust local | #1 |
| `feat/tauri-auth-rust-integration` | integração desktop, OAuth, API e instaladores | #7 |

Os PRs são empilhados. A ordem não deve ser alterada sem revisão técnica.

## Mapa de diretórios

### Interface React

- `src/`: aplicação web e interface do desktop.
- `src/components/AccessControl.tsx`: telas de login, bloqueio, troca de conta e criação de convite.
- `src/lib/auth-client.ts`: cliente público do Supabase Auth.
- `src/lib/access.ts`: coordenação do fluxo de identidade, sessão, convite e troca de conta.
- `src/lib/backend.ts`: cliente HTTP tipado da API Rust.
- `src/lib/native.ts`: ponte entre React e os comandos Tauri.
- `src/access-control.css`: estilos das telas de acesso.

React apresenta estados e envia comandos. Ele não deve decidir regras críticas de autorização.

### Aplicativo desktop Tauri 2

- `src-tauri/Cargo.toml`: dependências Rust do aplicativo desktop.
- `src-tauri/src/lib.rs`: inicialização do Tauri e plugins.
- `src-tauri/src/commands.rs`: comandos nativos expostos à interface.
- `src-tauri/src/security.rs`: validação de URLs, callbacks e deep links.
- `src-tauri/capabilities/desktop-main.json`: permissões explícitas da janela principal.
- `src-tauri/tauri.conf.json`: janela, CSP, ícones, bundle e esquema `labstar://`.
- `src-tauri/Cargo.lock`: versões Rust travadas e reproduzíveis.

O Rust local cuida de recursos nativos, não das regras centrais do negócio.

### Backend Rust

Na branch `feat/rust-backend-clean`:

- `backend/src/`: API Axum/Tokio.
- `backend/src/main.rs`: inicialização HTTP e encerramento gracioso.
- módulos de configuração, autenticação, membros, convites e erros tipados;
- `backend/Dockerfile`: imagem de produção;
- `backend/fly.toml`: configuração da aplicação Fly.io.

Endpoints principais:

- `GET /health/live`;
- `GET /health/ready`;
- `GET /v1/me`;
- `POST /v1/invites`;
- `GET /v1/invites`;
- `GET /v1/invites/{token}`;
- `POST /v1/invites/{token}/accept`;
- `DELETE /v1/invites/{id}`.

### Supabase e banco

- `supabase/`: scripts históricos e migrações preservadas.
- migrações de acesso aplicadas em quatro etapas: vínculo Auth, convites, endurecimento e bloqueio do frontend.
- backup manual privado gerado pelo GitHub Actions antes das mudanças.

Nunca execute novamente uma migração sem confirmar o ambiente, gerar novo backup e revisar o SQL.

### Workflows

- `.github/workflows/`: validação, build, backup e deploy.
- `build-windows-integrated.yml`: gera EXE e MSI privados.
- workflows de validação verificam TypeScript, Vite, Rustfmt, Clippy e testes Rust.
- workflow da Fly.io publica somente a branch do backend.

### Documentação

- `README.md`: entrada principal e estado atual.
- `docs/PROJECT_MAP.md`: este mapa.
- `docs/TEAM_ONBOARDING.md`: como trabalhar no projeto sem quebrar nada.
- `docs/ARCHITECTURE_DECISIONS.md`: decisões que não devem ser revertidas sem discussão.
- `docs/INTERNATIONAL_RELEASE_ROADMAP.md`: plano até o lançamento internacional.
- `docs/CODEX_HANDOFF.md`: instruções específicas para continuidade com Codex.
- `CONTRIBUTING.md`: padrão de branches, commits, PRs e testes.

## Identidade e autorização

Google e GitHub comprovam identidade. Eles não concedem acesso ao Labstar.

A API Rust valida:

- sessão confirmada;
- e-mail confirmado;
- vínculo `members.auth_user_id = auth.uid()`;
- status do membro;
- papel e permissões;
- convite válido quando necessário.

Estados esperados:

- `active`: entra normalmente;
- `pending`: aguarda aprovação;
- `suspended`: permanece bloqueado;
- não cadastrado: permanece bloqueado;
- convite pessoal com e-mail errado: recusado.

## Contas conhecidas na auditoria

- `hepterstudios@gmail.com`: proprietário ativo e identidade principal de teste;
- `brunosouto.book2@gmail.com`: membro ativo ainda sem usuário Auth na última auditoria;
- `macksongaspar@gmail.com`: membro ativo;
- `jhonan@gmail.com`: membro suspenso;
- `mackson777@gmail.com`: identidade retornada pelo GitHub, não autorizada como proprietário.

Não alterar vínculos diretamente para contornar testes. Uma segunda identidade do proprietário deve ser conectada por um fluxo explícito e auditável.

## Onde baixar e onde guardar

- instaladores: GitHub Actions > `Gerar instalador Windows integrado` > Artifacts;
- backup do banco: Artifact privado do workflow de backup e cópia local segura do proprietário;
- pacotes de migração: somente em local seguro e na documentação interna;
- secrets: GitHub Actions Secrets, Fly Secrets ou Supabase, nunca no código.

## Regra final

Nenhuma pessoa ou agente deve:

- fazer merge antes da matriz de testes;
- enviar segredo em commit, issue, PR ou log;
- mover autorização crítica para React;
- reativar suspenso por convite;
- transformar uma identidade social em proprietário automaticamente;
- publicar instalador sem assinatura e validação final.
