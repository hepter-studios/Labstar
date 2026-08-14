-- Entrar no Labstar não concede conquista: todas exigem uma ação real do membro.

begin;

delete from public.member_achievements
where achievement_key = 'welcome_aboard';

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
  conversation_count integer := 0;
  profile_ready integer := 0;
begin
  if actor_id is null then
    raise exception 'achievement_member_not_authorized' using errcode = '42501';
  end if;

  select case
    when char_length(trim(coalesce(member.name, ''))) >= 2
      and (
        char_length(trim(coalesce(member.bio, ''))) >= 2
        or char_length(trim(coalesce(member.avatar_path, ''))) >= 2
      )
    then 1 else 0 end
  into profile_ready
  from public.members member
  where member.id = actor_id;

  if to_regclass('public.channel_messages') is not null then
    execute 'select count(*)::integer from public.channel_messages where author_id = $1'
      into message_count using actor_id;
    execute 'select count(distinct channel_id)::integer from public.channel_messages where author_id = $1'
      into conversation_count using actor_id;
  end if;

  if to_regclass('public.direct_messages') is not null then
    execute 'select $2 + count(*)::integer from public.direct_messages where author_id = $1'
      into message_count using actor_id, message_count;
    execute 'select $2 + count(distinct thread_id)::integer from public.direct_messages where author_id = $1'
      into conversation_count using actor_id, conversation_count;
  end if;

  if to_regclass('public.project_profiles') is not null then
    execute 'select count(*)::integer from public.project_profiles where updated_by = $1'
      into project_count using actor_id;
  end if;

  if to_regclass('public.member_job_roles') is not null then
    execute 'select count(*)::integer from public.member_job_roles where member_id = $1'
      into role_count using actor_id;
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
    ('profile_in_orbit', profile_ready, 1),
    ('first_transmission', least(message_count, 10), 10),
    ('mission_preparation', least(project_count, 2), 2),
    ('stellar_communicator', least(message_count, 50), 50),
    ('project_pioneer', least(project_count, 3), 3),
    ('multi_mission', least(role_count, 2), 2),
    ('channel_explorer', least(conversation_count, 5), 5),
    ('orbital_coffee', least(message_count, 100), 100),
    ('constellation_voice', least(message_count, 250), 250),
    ('long_range_radio', least(message_count, 500), 500),
    ('space_veteran', least(message_count, 1000), 1000),
    ('idea_fisher', least(project_count, 10), 10),
    ('mission_engineer', least(project_count, 25), 25),
    ('engineering_master', least(project_count, 50), 50),
    ('versatile_crew', least(role_count, 4), 4),
    ('constellation_architect', least(conversation_count, 15), 15)
  ) as candidate(achievement_key, progress, target)
  on conflict on constraint member_achievements_pkey do update set
    progress = greatest(current.progress, excluded.progress),
    target = excluded.target,
    unlocked_at = case
      when current.unlocked_at is not null then current.unlocked_at
      when greatest(current.progress, excluded.progress) >= excluded.target then now()
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
