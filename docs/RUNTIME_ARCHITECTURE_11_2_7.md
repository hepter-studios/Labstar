# Arquitetura operacional — Labstar 11.2.9

Atualizado em 9 de agosto de 2026.

## Estado atual

A aplicação comum continua sem depender de uma API própria. A única exceção é
a exclusão administrativa de uma identidade do Supabase Auth: essa operação
exige credencial de `service_role`, portanto passa por um serviço Rust estreito
e protegido. Navegação, mensagens, convites e permissões comuns continuam em
Supabase RPC/RLS.

| Camada | Serviço | Responsabilidade |
| --- | --- | --- |
| Web/PWA | Cloudflare Pages | Interface React e arquivos estáticos |
| Identidade | Supabase Auth | Google, GitHub, sessão PKCE e renovação de token |
| Autorização e convites | PostgreSQL/Supabase RPC | Regras SECURITY DEFINER, RLS, tokens de uso único e vínculos de membro |
| Operação administrativa | API Rust/Fly.io | Valida a sessão e o cargo, remove a identidade Auth com credencial protegida e chama somente a finalização server-side |
| Dados | Supabase PostgreSQL | Membros, espaços, mensagens e configurações persistentes |
| Arquivos/tempo real | Supabase Storage e Realtime | Mídias e sincronização |
| Desktop | Tauri 2 + Rust | Janela nativa, deep links, instância única, configurações locais e proteção do runtime |

## Segurança dos convites

- `member_invites` permanece sem acesso direto para `anon` e `authenticated`.
- O cliente chama somente funções PostgreSQL explicitamente liberadas.
- `auth.uid()` identifica o usuário da sessão.
- Apenas owner/admin criam convites.
- Apenas owner concede nível administrativo.
- Convites pessoais validam o e-mail confirmado.
- Convites continuam com hash SHA-256, uso único, expiração, revogação e aceite atômico.

## Arquivos de referência

- `src/lib/backend.ts`: cliente das RPCs seguras e leitura autorizada do membro.
- `backend/`: serviço Rust exclusivo para operações que exigem credencial administrativa protegida.
- `supabase/migrations/20260810010000_server_side_account_deletion_and_permission_hardening.sql`: remove a RPC Auth antiga e libera a finalização somente para `service_role`.
- `supabase/labstar-supabase-v12-direct-rpc-recovery.sql`: grants e fachada segura de criação.
- `.github/workflows/recover-supabase-rpc.yml`: backup, migração e auditoria automática.
- `src-tauri/src/lib.rs`: núcleo Tauri sem aquecimento ou conexão com Fly.io.
- `src-tauri/src/commands.rs`: diagnóstico nativo reportando `supabase-rpc`.
- `.github/workflows/release-windows.yml`: instaladores oficiais 11.2.7.

## Regra operacional

Não usar a API Rust para reproduzir regras que já estão protegidas e
transacionais no PostgreSQL. A exceção atual existe porque o Admin API do
Supabase Auth não pode receber sua credencial no navegador nem no Tauri. A API
deve continuar pequena, sem fallback para uma RPC executável por `authenticated`.
