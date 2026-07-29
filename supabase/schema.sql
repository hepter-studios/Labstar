-- Execute este arquivo uma única vez no SQL Editor do Supabase.
-- Ele cria o banco da Labstar e protege todos os dados com RLS.

create extension if not exists pgcrypto;

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'suspended')),
  role text not null default 'member'
    check (role in ('owner', 'admin', 'manager', 'member')),
  job_title text not null default '',
  area text not null default '',
  assignments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create unique index if not exists members_email_lower_idx
  on public.members (lower(email));

create table if not exists public.workspaces (
  id text primary key,
  nodes jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.members enable row level security;
alter table public.workspaces enable row level security;

create or replace function public.current_member_is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.members
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and status = 'active'
  );
$$;

create or replace function public.current_member_can_manage()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.members
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and status = 'active'
      and role in ('owner', 'admin')
  );
$$;

revoke all on function public.current_member_is_active() from public;
revoke all on function public.current_member_can_manage() from public;
grant execute on function public.current_member_is_active() to authenticated;
grant execute on function public.current_member_can_manage() to authenticated;

drop policy if exists "members_read" on public.members;
create policy "members_read"
on public.members for select
to authenticated
using (
  public.current_member_is_active()
);

drop policy if exists "members_insert_admin" on public.members;
create policy "members_insert_admin"
on public.members for insert
to authenticated
with check (public.current_member_can_manage());

drop policy if exists "members_update_admin" on public.members;
create policy "members_update_admin"
on public.members for update
to authenticated
using (public.current_member_can_manage())
with check (public.current_member_can_manage());

drop policy if exists "members_update_own_last_seen" on public.members;

drop policy if exists "workspace_read_active" on public.workspaces;
create policy "workspace_read_active"
on public.workspaces for select
to authenticated
using (public.current_member_is_active());

drop policy if exists "workspace_insert_active" on public.workspaces;
create policy "workspace_insert_active"
on public.workspaces for insert
to authenticated
with check (public.current_member_is_active());

drop policy if exists "workspace_update_active" on public.workspaces;
create policy "workspace_update_active"
on public.workspaces for update
to authenticated
using (public.current_member_is_active())
with check (public.current_member_is_active());

insert into public.members (
  email,
  name,
  status,
  role,
  job_title,
  area
) values (
  'hepterstudios@gmail.com',
  'Mackson Victor',
  'active',
  'owner',
  'Fundador',
  'Direção'
)
on conflict ((lower(email))) do update set
  name = 'Mackson Victor',
  status = 'active',
  role = 'owner';

insert into public.workspaces (id, nodes)
values ('labstar-main', '[]'::jsonb)
on conflict (id) do nothing;
