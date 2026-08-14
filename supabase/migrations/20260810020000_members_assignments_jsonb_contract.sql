-- Corrige o contrato confirmado pelo banco publicado: members.assignments é
-- jsonb. A migração anterior tratava a coluna como text[], o que só aparecia
-- em tempo de execução nas rotinas SECURITY DEFINER.

begin;

do $$
declare
  assignments_type text;
begin
  select c.udt_name
    into assignments_type
    from information_schema.columns as c
   where c.table_schema = 'public'
     and c.table_name = 'members'
     and c.column_name = 'assignments';

  if assignments_type is distinct from 'jsonb' then
    raise exception 'unexpected_members_assignments_type: %', coalesce(assignments_type, '<missing>')
      using errcode = '42804';
  end if;
end;
$$;

create or replace function public.finalize_labstar_account_deletion(
  target_member_id uuid,
  target_email text
)
returns table (
  member_id uuid,
  avatar_path text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.members%rowtype;
begin
  if target_member_id is null or nullif(trim(target_email), '') is null then
    raise exception 'account_target_required' using errcode = '22023';
  end if;

  select member.*
    into target
    from public.members as member
   where member.id = target_member_id
     and member.deleted_at is null
   for update;

  if target.id is null then
    raise exception 'account_not_found' using errcode = 'P0002';
  end if;
  if lower(trim(target.email)) <> lower(trim(target_email)) then
    raise exception 'account_email_mismatch' using errcode = '22023';
  end if;
  if target.role = 'owner' then
    raise exception 'owner_deletion_forbidden' using errcode = '42501';
  end if;
  if target.status <> 'suspended' then
    raise exception 'member_must_be_suspended' using errcode = '55000';
  end if;

  delete from public.member_job_roles
   where member_job_roles.member_id = target.id;

  update public.members as member
     set auth_user_id = null,
         email = 'deleted+' || replace(target.id::text, '-', '') || '@deleted.invalid',
         avatar_path = null,
         assignments = '[]'::jsonb,
         role = 'member',
         status = 'suspended',
         deleted_at = now()
   where member.id = target.id;

  return query select target.id, target.avatar_path;
end;
$$;

revoke all on function public.finalize_labstar_account_deletion(uuid, text)
  from public, anon, authenticated;
grant execute on function public.finalize_labstar_account_deletion(uuid, text)
  to service_role;

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
  if actor.id is null then return false; end if;

  select * into target from public.channels where id = target_channel_id;
  if target.id is null then return false; end if;

  if actor.role in ('owner', 'admin')
     or public.member_has_labstar_permission('manage_channels', actor.id)
     or public.member_has_labstar_permission('manage_private_channels', actor.id) then
    return true;
  end if;

  if coalesce(target.inherit_category_access, true)
     and target.category_id is not null
     and not public.member_can_access_labstar_category(target.category_id) then
    return false;
  end if;

  if not coalesce(target.is_private, false)
     and cardinality(coalesce(target.allowed_roles, '{}'::text[])) = 0
     and cardinality(coalesce(target.allowed_assignments, '{}'::text[])) = 0
     and cardinality(coalesce(target.allowed_job_roles, '{}'::uuid[])) = 0
     and cardinality(coalesce(target.allowed_member_ids, '{}'::uuid[])) = 0 then
    return true;
  end if;

  if actor.role = any(coalesce(target.allowed_roles, '{}'::text[])) then return true; end if;
  if actor.id = any(coalesce(target.allowed_member_ids, '{}'::uuid[])) then return true; end if;
  if exists (
    select 1 from public.member_job_roles as assignment
    where assignment.member_id = actor.id
      and assignment.job_role_id = any(coalesce(target.allowed_job_roles, '{}'::uuid[]))
  ) then return true; end if;
  if exists (
    select 1
      from jsonb_array_elements_text(
        case
          when jsonb_typeof(actor.assignments) = 'array' then actor.assignments
          else '[]'::jsonb
        end
      ) as assignment(value)
     where assignment.value = any(coalesce(target.allowed_assignments, '{}'::text[]))
  ) then return true; end if;

  return false;
end;
$$;

revoke all on function public.member_can_access_labstar_channel(uuid) from public, anon;
grant execute on function public.member_can_access_labstar_channel(uuid) to authenticated;

commit;
