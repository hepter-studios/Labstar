-- Serializa alterações concorrentes sem exigir permissão UPDATE em members.
-- A operação permanece SECURITY INVOKER e sujeita às políticas RLS.

begin;

create or replace function public.set_member_job_roles(
  target_member_id uuid,
  ordered_job_role_ids uuid[]
)
returns void
language plpgsql
security invoker
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

commit;
