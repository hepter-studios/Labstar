# Arquitetura operacional — Labstar 11.2.7

Atualizado em 4 de agosto de 2026.

## Estado atual

A Fly.io não faz mais parte do caminho de execução do Labstar.

| Camada | Serviço | Responsabilidade |
| --- | --- | --- |
| Web/PWA | Cloudflare Pages | Interface React e arquivos estáticos |
| Identidade | Supabase Auth | Google, GitHub, sessão PKCE e renovação de token |
| Autorização e convites | PostgreSQL/Supabase RPC | Regras SECURITY DEFINER, RLS, tokens de uso único e vínculos de membro |
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
- `supabase/labstar-supabase-v12-direct-rpc-recovery.sql`: grants e fachada segura de criação.
- `.github/workflows/recover-supabase-rpc.yml`: backup, migração e auditoria automática.
- `src-tauri/src/lib.rs`: núcleo Tauri sem aquecimento ou conexão com Fly.io.
- `src-tauri/src/commands.rs`: diagnóstico nativo reportando `supabase-rpc`.
- `.github/workflows/release-windows.yml`: instaladores oficiais 11.2.7.

## Regra operacional

Não reintroduzir uma API externa somente para reproduzir regras que já estão
protegidas e transacionais no PostgreSQL. Uma nova camada central só deve ser
adicionada quando houver necessidade concreta que não possa ser atendida com
RLS/RPC, e deverá possuir plano de disponibilidade e custos antes da adoção.
