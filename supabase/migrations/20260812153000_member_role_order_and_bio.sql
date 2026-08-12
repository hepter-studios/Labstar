-- Ordem individual dos cargos profissionais e bio opcional do perfil.
-- A posição 1 é a única fonte de verdade para o cargo principal do membro.

begin;

alter table public.members
  add column if not exists bio text not null default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'members_bio_length'
      and conrelid = 'public.members'::regclass
  ) then
    alter table public.members
      add constraint members_bio_length check (char_length(bio) <= 300);
  end if;
end $$;

alter table public.member_job_roles
  add column if not exists position integer;

with ranked as (
  select
    assignment.member_id,
    assignment.job_role_id,
    row_number() over (
      partition by assignment.member_id
      order by assignment.is_primary desc, role.position asc, assignment.job_role_id asc
    )::integer as member_position
  from public.member_job_roles as assignment
  join public.job_roles as role on role.id = assignment.job_role_id
)
update public.member_job_roles as assignment
set
  position = ranked.member_position,
  is_primary = ranked.member_position = 1
from ranked
where assignment.member_id = ranked.member_id
  and assignment.job_role_id = ranked.job_role_id;

alter table public.member_job_roles
  alter column position set default 1,
  alter column position set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'member_job_roles_position_positive'
      and conrelid = 'public.member_job_roles'::regclass
  ) then
    alter table public.member_job_roles
      add constraint member_job_roles_position_positive check (position >= 1);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'member_job_roles_primary_matches_position'
      and conrelid = 'public.member_job_roles'::regclass
  ) then
    alter table public.member_job_roles
      add constraint member_job_roles_primary_matches_position
      check (is_primary = (position = 1));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'member_job_roles_member_position_unique'
      and conrelid = 'public.member_job_roles'::regclass
  ) then
    alter table public.member_job_roles
      add constraint member_job_roles_member_position_unique unique (member_id, position);
  end if;
end $$;

create or replace function public.set_member_job_roles(
  target_member_id uuid,
  ordered_job_role_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_ids uuid[] := coalesce(ordered_job_role_ids, '{}'::uuid[]);
begin
  if not public.can_manage_professional_roles() then
    raise exception 'manage_roles_required' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_member_id::text, 0));

  if not exists (select 1 from public.members where id = target_member_id) then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;

  if cardinality(normalized_ids) <> (
    select count(distinct requested.role_id)::integer
    from unnest(normalized_ids) as requested(role_id)
  ) then
    raise exception 'duplicate_job_role' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(normalized_ids) as requested(role_id)
    left join public.job_roles as role on role.id = requested.role_id
    where role.id is null
  ) then
    raise exception 'job_role_not_found' using errcode = 'P0002';
  end if;

  delete from public.member_job_roles
  where member_id = target_member_id;

  insert into public.member_job_roles (member_id, job_role_id, is_primary, position)
  select
    target_member_id,
    requested.role_id,
    requested.ordinality = 1,
    requested.ordinality::integer
  from unnest(normalized_ids) with ordinality as requested(role_id, ordinality)
  order by requested.ordinality;
end;
$$;

revoke all on function public.set_member_job_roles(uuid, uuid[]) from public, anon;
grant execute on function public.set_member_job_roles(uuid, uuid[]) to authenticated;

drop function if exists public.update_own_profile(text, text);

create function public.update_own_profile(
  new_name text default null,
  new_avatar_path text default null,
  new_bio text default null
)
returns setof public.members
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.current_member_id() is null then
    raise exception 'member_not_found' using errcode = '42501';
  end if;

  return query
  update public.members
  set
    name = case
      when new_name is null or char_length(trim(new_name)) < 2 then name
      else left(trim(new_name), 100)
    end,
    avatar_path = case
      when new_avatar_path is null then avatar_path
      else nullif(trim(new_avatar_path), '')
    end,
    bio = case
      when new_bio is null then bio
      else left(trim(new_bio), 300)
    end,
    last_seen_at = now()
  where id = public.current_member_id()
  returning *;
end;
$$;

revoke all on function public.update_own_profile(text, text, text) from public, anon;
grant execute on function public.update_own_profile(text, text, text) to authenticated;

notify pgrst, 'reload schema';
commit;
