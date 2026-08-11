-- Labstar — conquistas persistentes do perfil.
--
-- A interface nunca decide que uma conquista foi obtida. Esta função calcula
-- progresso com dados do banco e grava somente para o membro autenticado.

begin;

create table if not exists public.member_achievements (
  member_id uuid not null references public.members(id) on delete cascade,
  achievement_key text not null check (achievement_key ~ '^[a-z0-9_]{3,64}$'),
  progress integer not null default 0 check (progress >= 0),
  target integer not null default 1 check (target > 0),
  unlocked_at timestamptz,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (member_id, achievement_key)
);

create index if not exists member_achievements_unlocked_idx
  on public.member_achievements(member_id, unlocked_at desc nulls last);

alter table public.member_achievements enable row level security;

drop policy if exists "member_achievements_read_own" on public.member_achievements;
create policy "member_achievements_read_own"
on public.member_achievements for select
to authenticated
using (member_id = public.labstar_current_member_id());

revoke all on public.member_achievements from public, anon;
grant select on public.member_achievements to authenticated;

create or replace function public.sync_own_achievements()
returns table (
  achievement_key text,
  progress integer,
  target integer,
  unlocked_at timestamptz,
  details jsonb
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  actor_id uuid := public.labstar_current_member_id();
  message_count integer := 0;
  project_count integer := 0;
  role_count integer := 0;
  organization_count integer := 0;
  profile_ready integer := 0;
begin
  if actor_id is null then
    raise exception 'achievement_member_not_authorized' using errcode = '42501';
  end if;

  select case
    when char_length(trim(coalesce(member.name, ''))) >= 2
      and char_length(trim(coalesce(member.job_title, ''))) >= 2
      and char_length(trim(coalesce(member.area, ''))) >= 2
      and char_length(trim(coalesce(member.avatar_path, ''))) >= 2
    then 1 else 0 end
  into profile_ready
  from public.members member
  where member.id = actor_id;

  if to_regclass('public.channel_messages') is not null then
    execute 'select count(*)::integer from public.channel_messages where author_id = $1'
      into message_count using actor_id;
  end if;

  if to_regclass('public.direct_messages') is not null then
    execute 'select $2 + count(*)::integer from public.direct_messages where author_id = $1'
      into message_count using actor_id, message_count;
  end if;

  if to_regclass('public.project_profiles') is not null then
    execute 'select count(*)::integer from public.project_profiles where updated_by = $1'
      into project_count using actor_id;
  end if;

  if to_regclass('public.member_job_roles') is not null then
    execute 'select count(*)::integer from public.member_job_roles where member_id = $1'
      into role_count using actor_id;
  end if;

  if to_regclass('public.organization_accounts') is not null
     and to_regclass('public.organizations') is not null then
    execute $query$
      select count(*)::integer
      from public.organization_accounts account
      join public.organizations organization on organization.id = account.organization_id
      where account.auth_user_id = auth.uid()
        and account.role = 'owner'
        and organization.created_by = $1
    $query$ into organization_count using actor_id;
  end if;

  insert into public.member_achievements as current (
    member_id,
    achievement_key,
    progress,
    target,
    unlocked_at,
    details,
    updated_at
  )
  select
    actor_id,
    candidate.achievement_key,
    candidate.progress,
    candidate.target,
    case when candidate.progress >= candidate.target then now() else null end,
    '{}'::jsonb,
    now()
  from (values
    ('welcome_aboard', 1, 1),
    ('profile_in_orbit', profile_ready, 1),
    ('first_transmission', least(message_count, 1), 1),
    ('stellar_communicator', least(message_count, 10), 10),
    ('project_pioneer', least(project_count, 1), 1),
    ('multi_mission', least(role_count, 2), 2),
    ('organization_founder', least(organization_count, 1), 1)
  ) as candidate(achievement_key, progress, target)
  on conflict (member_id, achievement_key) do update set
    progress = greatest(current.progress, excluded.progress),
    target = excluded.target,
    unlocked_at = case
      when greatest(current.progress, excluded.progress) >= excluded.target
      then coalesce(current.unlocked_at, now())
      else null
    end,
    details = excluded.details,
    updated_at = now();

  return query
  select
    achievement.achievement_key,
    achievement.progress,
    achievement.target,
    achievement.unlocked_at,
    achievement.details
  from public.member_achievements achievement
  where achievement.member_id = actor_id
  order by achievement.unlocked_at desc nulls last, achievement.achievement_key;
end;
$$;

revoke all on function public.sync_own_achievements() from public, anon;
grant execute on function public.sync_own_achievements() to authenticated;

commit;
