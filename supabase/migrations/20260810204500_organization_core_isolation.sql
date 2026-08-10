-- Labstar organization core isolation
-- Additive migration: keeps all legacy Hepter Studios records intact.

begin;

create or replace function public.primary_labstar_organization_id()
returns uuid
language sql
immutable
set search_path = public, pg_temp
as $$
  select '00000000-0000-4000-8000-000000000001'::uuid;
$$;

-- The organization foundation must already exist.
do $$
begin
  if to_regclass('public.organizations') is null
    or to_regclass('public.organization_members') is null
    or not exists (
      select 1 from public.organizations
      where id = public.primary_labstar_organization_id()
        and is_primary_legacy
    )
  then
    raise exception 'organizations_foundation_required';
  end if;
end $$;

-- Keep the legacy team attached to the primary organization without changing member rows.
insert into public.organization_members (organization_id, member_id, role)
select
  public.primary_labstar_organization_id(),
  member.id,
  case when member.role in ('owner','admin','manager','member','viewer') then member.role else 'member' end
from public.members member
on conflict (organization_id, member_id) do nothing;

-- Add an organization boundary to every data surface that already exists.
do $$
declare
  target_table text;
  target_tables text[] := array[
    'workspaces','collaboration_spaces','channel_categories','channels',
    'channel_messages','channel_message_attachments','hidden_channel_messages',
    'social_posts','meetings','integration_rules','job_roles','member_job_roles',
    'notifications','direct_threads','direct_thread_members','direct_messages',
    'direct_message_attachments','hidden_direct_messages','direct_call_sessions',
    'direct_call_signals','project_document_assets'
  ];
begin
  foreach target_table in array target_tables loop
    if to_regclass('public.' || target_table) is null then
      continue;
    end if;

    execute format('alter table public.%I add column if not exists organization_id uuid', target_table);
    execute format('update public.%I set organization_id = $1 where organization_id is null', target_table)
      using public.primary_labstar_organization_id();
    execute format(
      'alter table public.%I alter column organization_id set default public.primary_labstar_organization_id()',
      target_table
    );
    execute format('alter table public.%I alter column organization_id set not null', target_table);
    execute format(
      'create index if not exists %I on public.%I (organization_id)',
      left(target_table || '_organization_idx', 63),
      target_table
    );
  end loop;
end $$;

-- Correct child organization IDs from their real parent. Existing data still resolves to Hepter Studios.
do $$
begin
  if to_regclass('public.channel_categories') is not null then
    update public.channel_categories c set organization_id = s.organization_id
    from public.collaboration_spaces s where c.space_id = s.id;
  end if;
  if to_regclass('public.channels') is not null then
    update public.channels c set organization_id = s.organization_id
    from public.collaboration_spaces s where c.space_id = s.id;
  end if;
  if to_regclass('public.social_posts') is not null then
    update public.social_posts c set organization_id = s.organization_id
    from public.collaboration_spaces s where c.space_id = s.id;
  end if;
  if to_regclass('public.integration_rules') is not null then
    update public.integration_rules c set organization_id = s.organization_id
    from public.collaboration_spaces s where c.space_id = s.id;
  end if;
  if to_regclass('public.channel_messages') is not null then
    update public.channel_messages m set organization_id = c.organization_id
    from public.channels c where m.channel_id = c.id;
  end if;
  if to_regclass('public.meetings') is not null then
    update public.meetings m set organization_id = c.organization_id
    from public.channels c where m.channel_id = c.id;
  end if;
  if to_regclass('public.notifications') is not null then
    update public.notifications n set organization_id = c.organization_id
    from public.channels c where n.channel_id = c.id and n.channel_id is not null;
  end if;
  if to_regclass('public.channel_message_attachments') is not null then
    update public.channel_message_attachments a set organization_id = m.organization_id
    from public.channel_messages m where a.message_id = m.id;
  end if;
  if to_regclass('public.hidden_channel_messages') is not null then
    update public.hidden_channel_messages h set organization_id = m.organization_id
    from public.channel_messages m where h.message_id = m.id;
  end if;
  if to_regclass('public.member_job_roles') is not null then
    update public.member_job_roles a set organization_id = r.organization_id
    from public.job_roles r where a.job_role_id = r.id;
  end if;
  if to_regclass('public.direct_thread_members') is not null then
    update public.direct_thread_members m set organization_id = t.organization_id
    from public.direct_threads t where m.thread_id = t.id;
  end if;
  if to_regclass('public.direct_messages') is not null then
    update public.direct_messages m set organization_id = t.organization_id
    from public.direct_threads t where m.thread_id = t.id;
  end if;
  if to_regclass('public.direct_message_attachments') is not null then
    update public.direct_message_attachments a set organization_id = m.organization_id
    from public.direct_messages m where a.message_id = m.id;
  end if;
  if to_regclass('public.hidden_direct_messages') is not null then
    update public.hidden_direct_messages h set organization_id = m.organization_id
    from public.direct_messages m where h.message_id = m.id;
  end if;
  if to_regclass('public.direct_call_sessions') is not null then
    update public.direct_call_sessions c set organization_id = t.organization_id
    from public.direct_threads t where c.thread_id = t.id;
  end if;
  if to_regclass('public.direct_call_signals') is not null then
    update public.direct_call_signals s set organization_id = c.organization_id
    from public.direct_call_sessions c where s.call_id = c.id;
  end if;
end $$;

-- Restrictive RLS is ANDed with the existing permission policies.
create or replace procedure public.install_organization_boundary(target_table text)
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if to_regclass('public.' || target_table) is null then return; end if;
  execute format('alter table public.%I enable row level security', target_table);
  execute format('drop policy if exists organization_boundary on public.%I', target_table);
  execute format(
    'create policy organization_boundary on public.%I as restrictive for all to authenticated using (public.current_member_is_in_organization(organization_id)) with check (public.current_member_is_in_organization(organization_id))',
    target_table
  );
end;
$$;

do $$
declare
  target_table text;
  target_tables text[] := array[
    'workspaces','collaboration_spaces','channel_categories','channels',
    'channel_messages','channel_message_attachments','hidden_channel_messages',
    'social_posts','meetings','integration_rules','job_roles','member_job_roles',
    'notifications','direct_threads','direct_thread_members','direct_messages',
    'direct_message_attachments','hidden_direct_messages','direct_call_sessions',
    'direct_call_signals','project_document_assets'
  ];
begin
  foreach target_table in array target_tables loop
    call public.install_organization_boundary(target_table);
  end loop;
end $$;

drop procedure public.install_organization_boundary(text);

-- Global identities can only be read when they share at least one organization.
create or replace function public.members_share_organization(target_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_member_id = public.current_member_id()
    or exists (
      select 1
      from public.organization_members mine
      join public.organization_members theirs on theirs.organization_id = mine.organization_id
      where mine.member_id = public.current_member_id()
        and theirs.member_id = target_member_id
    );
$$;

alter table public.members enable row level security;
drop policy if exists members_organization_boundary on public.members;
create policy members_organization_boundary on public.members
as restrictive for select to authenticated
using (public.members_share_organization(id));

-- Organization-aware member listing for the frontend migration.
create or replace function public.list_organization_members(target_organization_id uuid)
returns table (
  member_id uuid,
  email text,
  name text,
  status text,
  global_role text,
  organization_role text,
  job_title text,
  area text,
  avatar_path text,
  joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.current_member_is_in_organization(target_organization_id) then
    raise exception 'organization_access_denied';
  end if;

  return query
  select m.id, m.email, m.name, m.status, m.role, om.role, m.job_title, m.area, m.avatar_path, om.joined_at
  from public.organization_members om
  join public.members m on m.id = om.member_id
  where om.organization_id = target_organization_id
    and m.email not like '%@labstar.invalid'
  order by om.joined_at, lower(m.name);
end;
$$;

-- Empty workspace containers for secondary organizations. Legacy IDs remain unchanged.
create or replace function public.ensure_organization_workspaces(target_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.current_member_is_in_organization(target_organization_id) then
    raise exception 'organization_access_denied';
  end if;
  if target_organization_id = public.primary_labstar_organization_id() then return; end if;

  insert into public.workspaces (id, nodes, updated_at, organization_id)
  values
    ('org:' || target_organization_id::text || ':main', '[]'::jsonb, now(), target_organization_id),
    ('org:' || target_organization_id::text || ':work-items-v1', '[]'::jsonb, now(), target_organization_id)
  on conflict (id) do nothing;
end;
$$;

-- Provision workspace containers for secondary organizations already created during the foundation rollout.
do $$
declare
  org record;
begin
  for org in select id from public.organizations where not is_primary_legacy loop
    insert into public.workspaces (id, nodes, updated_at, organization_id)
    values
      ('org:' || org.id::text || ':main', '[]'::jsonb, now(), org.id),
      ('org:' || org.id::text || ':work-items-v1', '[]'::jsonb, now(), org.id)
    on conflict (id) do nothing;
  end loop;
end $$;

create table if not exists public.organization_audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_member_id uuid references public.members(id) on delete set null,
  action text not null,
  entity_type text not null default '',
  entity_id text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists organization_audit_log_org_created_idx
  on public.organization_audit_log(organization_id, created_at desc);

alter table public.organization_audit_log enable row level security;
drop policy if exists organization_audit_log_read on public.organization_audit_log;
create policy organization_audit_log_read on public.organization_audit_log
for select to authenticated
using (
  public.current_member_is_in_organization(organization_id)
  and public.current_member_organization_role(organization_id) in ('owner','admin')
);

grant execute on function public.primary_labstar_organization_id() to authenticated;
grant execute on function public.members_share_organization(uuid) to authenticated;
grant execute on function public.list_organization_members(uuid) to authenticated;
grant execute on function public.ensure_organization_workspaces(uuid) to authenticated;
grant select on public.organization_audit_log to authenticated;

commit;

select 'organization core isolation installed; Hepter Studios legacy data preserved' as status;
