-- Labstar v15b — mantém a conexão GitHub separada da autenticação.
-- Execute após a v15. Não altera usuários Auth, sessões, convites ou permissões.

begin;

-- A entrega final possui somente GitHub. Remove qualquer estrutura provisória
-- de Instagram que tenha sido criada pela primeira versão da migração.
drop function if exists public.set_own_instagram_username(text);
alter table public.members drop constraint if exists members_instagram_username_check;
alter table public.members drop column if exists instagram_username;

-- O navegador não pode gravar um perfil GitHub como verificado. A gravação
-- passa exclusivamente pelo callback OAuth seguro da função de borda.
drop function if exists public.set_own_github_profile(jsonb);

create or replace function public.clear_own_github_profile()
returns setof public.members
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := public.current_member_id();
begin
  if actor_id is null then
    raise exception 'active_member_required';
  end if;

  return query
  update public.members
  set github_profile = '{}'::jsonb, last_seen_at = now()
  where id = actor_id
  returning *;
end;
$$;

revoke all on function public.clear_own_github_profile() from public;
grant execute on function public.clear_own_github_profile() to authenticated;

commit;

select 'Labstar v15b instalada: somente GitHub e sem alteração do login.' as status;
