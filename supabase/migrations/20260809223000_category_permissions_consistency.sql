-- Labstar — categorias privadas, herança de acesso e permissões profissionais consistentes.
-- Esta migração é aditiva e reaplicável: mantém a administração existente e
-- adiciona uma fonte de verdade para categoria -> canal -> mensagem.

begin;

alter table public.channel_categories
  add column if not exists is_private boolean not null default false,
  add column if not exists read_only boolean not null default false,
  add column if not exists allowed_roles text[] not null default '{}'::text[],
  add column if not exists allowed_job_roles uuid[] not null default '{}'::uuid[],
  add column if not exists allowed_member_ids uuid[] not null default '{}'::uuid[];

alter table public.channels
  add column if not exists inherit_category_access boolean not null default true;

create index if not exists channel_categories_allowed_job_roles_gin
  on public.channel_categories using gin (allowed_job_roles);
create index if not exists channel_categories_allowed_member_ids_gin
  on public.channel_categories using gin (allowed_member_ids);

create or replace function public.can_manage_labstar_members()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with actor as (
    select member.id, member.role
    from public.members as member
    where member.id = public.labstar_current_member_id()
      and member.status = 'active'
      and member.deleted_at is null
    limit 1
  )
  select exists (
    select 1 from actor
    where actor.role in ('owner', 'admin')
       or public.member_has_labstar_permission('manage_members', actor.id)
  );
$$;

-- Gerenciar pessoas e gerenciar cargos são capacidades separadas.
create or replace function public.can_manage_professional_roles()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with actor as (
    select member.id, member.role
    from public.members as member
    where member.id = public.labstar_current_member_id()
      and member.status = 'active'
      and member.deleted_at is null
    limit 1
  )
  select exists (
    select 1 from actor
    where actor.role in ('owner', 'admin')
       or public.member_has_labstar_permission('manage_roles', actor.id)
  );
$$;

revoke all on function public.can_manage_labstar_members() from public, anon;
revoke all on function public.can_manage_professional_roles() from public, anon;
grant execute on function public.can_manage_labstar_members() to authenticated;
grant execute on function public.can_manage_professional_roles() to authenticated;

-- Um cargo com manage_members pode administrar pessoas comuns, mas nunca pode
-- criar, promover ou alterar owner/admin. As políticas administrativas antigas
-- continuam atendendo owner/admin e são combinadas pelo PostgreSQL.
drop policy if exists "members_insert_professional_manager" on public.members;
create policy "members_insert_professional_manager"
on public.members for insert to authenticated
with check (
  public.can_manage_labstar_members()
  and role not in ('owner', 'admin')
);

drop policy if exists "members_update_professional_manager" on public.members;
create policy "members_update_professional_manager"
on public.members for update to authenticated
using (
  public.can_manage_labstar_members()
  and role not in ('owner', 'admin')
)
with check (
  public.can_manage_labstar_members()
  and role not in ('owner', 'admin')
);

create or replace function public.member_can_access_labstar_category(target_category_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  actor public.members%rowtype;
  target public.channel_categories%rowtype;
begin
  select * into actor
  from public.members
  where id = public.labstar_current_member_id()
    and status = 'active'
    and deleted_at is null;

  if actor.id is null then return false; end if;

  select * into target
  from public.channel_categories
  where id = target_category_id;

  if target.id is null then return false; end if;

  if actor.role in ('owner', 'admin')
     or public.member_has_labstar_permission('manage_channels', actor.id)
     or public.member_has_labstar_permission('manage_private_channels', actor.id) then
    return true;
  end if;

  if not coalesce(target.is_private, false)
     and cardinality(coalesce(target.allowed_roles, '{}'::text[])) = 0
     and cardinality(coalesce(target.allowed_job_roles, '{}'::uuid[])) = 0
     and cardinality(coalesce(target.allowed_member_ids, '{}'::uuid[])) = 0 then
    return true;
  end if;

  if actor.role = any(coalesce(target.allowed_roles, '{}'::text[])) then return true; end if;
  if actor.id = any(coalesce(target.allowed_member_ids, '{}'::uuid[])) then return true; end if;

  if exists (
    select 1
    from public.member_job_roles assignment
    where assignment.member_id = actor.id
      and assignment.job_role_id = any(coalesce(target.allowed_job_roles, '{}'::uuid[]))
  ) then
    return true;
  end if;

  return false;
end;
$$;

create or replace function public.member_can_post_labstar_category(target_category_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  actor public.members%rowtype;
  target public.channel_categories%rowtype;
begin
  if not public.member_can_access_labstar_category(target_category_id) then return false; end if;

  select * into actor from public.members where id = public.labstar_current_member_id();
  select * into target from public.channel_categories where id = target_category_id;

  if actor.id is null or target.id is null then return false; end if;
  if public.can_moderate_labstar_content() then return true; end if;
  if actor.role = 'viewer' then return false; end if;
  return not coalesce(target.read_only, false);
end;
$$;

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
    select 1 from public.member_job_roles assignment
    where assignment.member_id = actor.id
      and assignment.job_role_id = any(coalesce(target.allowed_job_roles, '{}'::uuid[]))
  ) then return true; end if;

  if exists (
    select 1
    from unnest(coalesce(actor.assignments, '{}'::text[])) assignment(value)
    where assignment.value = any(coalesce(target.allowed_assignments, '{}'::text[]))
  ) then return true; end if;

  return false;
end;
$$;

create or replace function public.member_can_post_labstar_channel(target_channel_id uuid)
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
  if not public.member_can_access_labstar_channel(target_channel_id) then return false; end if;

  select * into actor from public.members where id = public.labstar_current_member_id();
  select * into target from public.channels where id = target_channel_id;

  if actor.id is null or target.id is null then return false; end if;
  if public.can_moderate_labstar_content() then return true; end if;
  if actor.role = 'viewer' then return false; end if;

  if coalesce(target.inherit_category_access, true)
     and target.category_id is not null
     and not public.member_can_post_labstar_category(target.category_id) then
    return false;
  end if;

  if coalesce(target.read_only, false) then return false; end if;
  return target.type = 'text';
end;
$$;

revoke all on function public.member_can_access_labstar_category(uuid) from public, anon;
revoke all on function public.member_can_post_labstar_category(uuid) from public, anon;
grant execute on function public.member_can_access_labstar_category(uuid) to authenticated;
grant execute on function public.member_can_post_labstar_category(uuid) to authenticated;

alter table public.channel_categories enable row level security;

do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='channel_categories'
  loop execute format('drop policy if exists %I on public.channel_categories', p.policyname); end loop;
end $$;

create policy "channel_categories_read_authorized"
on public.channel_categories for select to authenticated
using (public.member_can_access_labstar_category(id));

create policy "channel_categories_insert_authorized"
on public.channel_categories for insert to authenticated
with check (public.can_create_labstar_channels());

create policy "channel_categories_update_authorized"
on public.channel_categories for update to authenticated
using (public.can_manage_labstar_channels())
with check (public.can_manage_labstar_channels());

create policy "channel_categories_delete_authorized"
on public.channel_categories for delete to authenticated
using (public.can_manage_labstar_channels());

grant select, insert, update, delete on public.channel_categories to authenticated;

notify pgrst, 'reload schema';
commit;
