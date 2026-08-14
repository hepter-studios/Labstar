-- Labstar v15c — OAuth real do GitHub exclusivo para o perfil público.
-- Não altera Supabase Auth, login, sessão, convites, auth_user_id, cargos ou permissões.

begin;

create table if not exists public.profile_connection_states (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  provider text not null default 'github' check (provider = 'github'),
  state_hash text not null unique,
  return_to text not null,
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

create or replace function public.consume_github_profile_state(target_state_hash text)
returns table(member_id uuid, return_to text)
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
  returning profile_connection_states.member_id, profile_connection_states.return_to;
end;
$$;

create or replace function public.set_member_github_profile(
  target_member_id uuid,
  new_github_profile jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  username text;
  github_id text;
begin
  if target_member_id is null
    or not exists (
      select 1 from public.members
      where id = target_member_id and status = 'active'
    )
  then
    raise exception 'active_member_required';
  end if;

  if new_github_profile is null or jsonb_typeof(new_github_profile) <> 'object' then
    raise exception 'invalid_github_profile';
  end if;

  username := trim(coalesce(new_github_profile ->> 'username', ''));
  github_id := trim(coalesce(new_github_profile ->> 'githubId', ''));

  if username !~ '^[A-Za-z0-9][A-Za-z0-9-]{0,38}$'
    or username ~ '-$'
    or github_id !~ '^[0-9]{1,30}$'
  then
    raise exception 'invalid_github_profile';
  end if;

  update public.members
  set
    github_profile = jsonb_build_object(
      'githubId', github_id,
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
      'source', 'github_oauth',
      'verified', true
    ),
    last_seen_at = now()
  where id = target_member_id;
end;
$$;

revoke all on function public.consume_github_profile_state(text) from public, anon, authenticated;
revoke all on function public.set_member_github_profile(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.consume_github_profile_state(text) to service_role;
grant execute on function public.set_member_github_profile(uuid, jsonb) to service_role;

commit;

select 'Labstar v15c instalada: OAuth GitHub de perfil pronto e separado do login.' as status;
