# API administrativa do Labstar

Serviço Rust estreito para operações que exigem a credencial administrativa do
Supabase. A credencial `SUPABASE_SERVICE_ROLE_KEY` nunca é enviada ao frontend
ou ao aplicativo Tauri.

## Endpoint

- `GET /health/live`: liveness sem tocar em dados.
- `GET /health/ready`: readiness que confirma acesso autenticado ao PostgREST do
  Supabase antes de declarar o serviço apto a receber tráfego.
- `DELETE /v1/admin/accounts`: valida o bearer token no Supabase Auth, confirma
  owner/admin ativo, impede autoexclusão e exclusão de owner, exige suspensão e
  remove a identidade Auth antes de anonimizar o cadastro.

Não existe fallback no cliente para a antiga RPC `delete_labstar_account`.

## Configuração

Copie apenas os nomes de `backend/.env.example` para o gerenciador de secrets do
ambiente. Não preencha nem versione um arquivo `.env` com valores reais.

Para validar:

```bash
cargo fmt --manifest-path backend/Cargo.toml --all -- --check
cargo clippy --locked --manifest-path backend/Cargo.toml --all-targets -- -D warnings
cargo test --locked --manifest-path backend/Cargo.toml
```

## Ordem de publicação

1. Configurar os secrets protegidos do serviço.
2. Publicar e verificar `/health/live` e `/health/ready`.
3. Aplicar a migração `20260810010000_server_side_account_deletion_and_permission_hardening.sql` com backup.
4. Executar `supabase/tests/permission_regressions.sql`.
5. Publicar o frontend com `VITE_LABSTAR_API_URL` apontando para o serviço.

Em uma falha operacional, mantenha a exclusão indisponível. Nunca restaure a RPC
Auth para `authenticated` como atalho.
