-- Compatibilidade com o formato real de members.assignments (text[]).
-- Mantida separada para que ambientes que já tenham executado a migração base
-- recebam a correção de forma idempotente.

begin;

create or replace function public.member_can_access_labstar_channel(target_channel_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  actor public.members%rowtype;
  target public.channels%rowtype;
begin
  select * into actor
  from public.members
  where id = public.labstar_current_member_id()
    and status = 'active'
    and deleted_at is null;

  if actor.id is null then
    return false;
  end if;

  select * into target
  from public.channels
  where id = target_channel_id;

  if target.id is null then
    return false;
  end if;

  if actor.role in ('owner', 'admin')
    or public.member_has_labstar_permission('manage_channels', actor.id)
    or public.member_has_labstar_permission('manage_private_channels', actor.id) then
    return true;
  end if;

  if not coalesce(target.is_private, false)
    and cardinality(coalesce(target.allowed_roles, '{}'::text[])) = 0
    and cardinality(coalesce(target.allowed_assignments, '{}'::text[])) = 0
    and cardinality(coalesce(target.allowed_job_roles, '{}'::uuid[])) = 0
    and cardinality(coalesce(target.allowed_member_ids, '{}'::uuid[])) = 0 then
    return true;
  end if;

  if actor.role = any(coalesce(target.allowed_roles, '{}'::text[])) then
    return true;
  end if;

  if actor.id = any(coalesce(target.allowed_member_ids, '{}'::uuid[])) then
    return true;
  end if;

  if exists (
    select 1
    from public.member_job_roles as assignment
    where assignment.member_id = actor.id
      and assignment.job_role_id = any(coalesce(target.allowed_job_roles, '{}'::uuid[]))
  ) then
    return true;
  end if;

  if exists (
    select 1
    from unnest(coalesce(actor.assignments, '{}'::text[])) as assignment(value)
    where assignment.value = any(coalesce(target.allowed_assignments, '{}'::text[]))
  ) then
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.member_can_access_labstar_channel(uuid) from public, anon;
grant execute on function public.member_can_access_labstar_channel(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
