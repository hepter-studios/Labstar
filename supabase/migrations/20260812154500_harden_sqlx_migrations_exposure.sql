-- A tabela de controle do backend Rust não faz parte da API pública.
-- O serviço administrativo mantém acesso direto/service role; clientes não.

begin;

revoke all privileges on table public._sqlx_migrations from anon, authenticated;

commit;
