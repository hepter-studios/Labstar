-- Labstar v15c — autorização GitHub exclusiva para o perfil público.
-- Não altera Supabase Auth, login, sessão, convites, auth_user_id, cargos ou permissões.

begin;

create table if not exists public.profile_connection_states (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  provider text not null check (provider in ('github')),
  state_hash text not null unique,
  code_verifier text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists profile_connection_states_expiry_idx
  on public.profile_connection_states(expires_at)
  where used_at is null;

alter table public.profile_connection_states enable row level security;
revoke all on table public.profile_connection_states from public, anon, authenticated;
grant select, insert, update, delete on table public.profile_connection_states to service_role;

create or replace function public.consume_profile_connection_state(target_state_hash text)
returns table(member_id uuid, code_verifier text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.profile_connection_states
  where expires_at < now() - interval '1 day'
     or used_at < now() - interval '1 day';

  return query
  update public.profile_connection_states
  set used_at = now()
  where state_hash = target_state_hash
    and provider = 'github'
    and used_at is null
    and expires_at > now()
  returning profile_connection_states.member_id, profile_connection_states.code_verifier;
end;
$$;

revoke all on function public.consume_profile_connection_state(text) from public, anon, authenticated;
grant execute on function public.consume_profile_connection_state(text) to service_role;

-- Somente o callback seguro com service_role grava um GitHub verificado.
-- O cliente autenticado continua autorizado apenas a remover sua própria conexão.
revoke all on function public.set_own_github_profile(jsonb) from authenticated;

grant execute on function public.clear_own_github_profile() to authenticated;
grant execute on function public.set_own_instagram_username(text) to authenticated;

commit;

select 'Labstar v15c instalada: GitHub conectado ao perfil sem alterar o login.' as status;
