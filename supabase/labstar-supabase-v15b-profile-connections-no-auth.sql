-- Labstar v15b — garante que a conexão pública do GitHub não seja tratada como autenticação.
-- Execute após a v15. Não altera usuários Auth, sessões, convites ou permissões.

begin;

create or replace function public.set_own_github_profile(new_github_profile jsonb)
returns setof public.members
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := public.current_member_id();
  username text;
begin
  if actor_id is null then
    raise exception 'active_member_required';
  end if;

  if new_github_profile is null or jsonb_typeof(new_github_profile) <> 'object' then
    raise exception 'invalid_github_profile';
  end if;

  username := trim(coalesce(new_github_profile ->> 'username', ''));
  if username !~ '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$' then
    raise exception 'invalid_github_username';
  end if;

  return query
  update public.members
  set
    github_profile = jsonb_build_object(
      'username', username,
      'name', left(coalesce(new_github_profile ->> 'name', ''), 120),
      'avatarUrl', left(coalesce(new_github_profile ->> 'avatarUrl', ''), 500),
      'profileUrl', 'https://github.com/' || username,
      'bio', left(coalesce(new_github_profile ->> 'bio', ''), 300),
      'company', left(coalesce(new_github_profile ->> 'company', ''), 120),
      'location', left(coalesce(new_github_profile ->> 'location', ''), 120),
      'publicRepos', greatest(0, least(1000000, coalesce((new_github_profile ->> 'publicRepos')::integer, 0))),
      'followers', greatest(0, least(100000000, coalesce((new_github_profile ->> 'followers')::integer, 0))),
      'following', greatest(0, least(100000000, coalesce((new_github_profile ->> 'following')::integer, 0))),
      'connectedAt', now(),
      'source', 'github_public_profile',
      'verified', false
    ),
    last_seen_at = now()
  where id = actor_id
  returning *;
end;
$$;

revoke all on function public.set_own_github_profile(jsonb) from public;
grant execute on function public.set_own_github_profile(jsonb) to authenticated;

commit;

select 'Labstar v15b instalada: perfil GitHub separado da autenticação.' as status;
