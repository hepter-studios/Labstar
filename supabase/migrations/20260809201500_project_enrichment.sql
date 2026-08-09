-- Labstar — enriquecimento de projetos.
-- Metadados avançados ficam separados do JSON estrutural do mapa para não
-- poluir o núcleo base e para permitir evolução independente.

begin;

alter table public.members add column if not exists auth_user_id uuid;
alter table public.members add column if not exists deleted_at timestamptz;

create table if not exists public.project_profiles (
  node_id text primary key,
  logo_path text,
  document_title text not null default 'README',
  document_url text,
  document_markdown text,
  tags text[] not null default '{}'::text[],
  tech_stack text[] not null default '{}'::text[],
  version text,
  due_date date,
  next_milestone text,
  updated_by uuid references public.members(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists project_profiles_updated_idx
  on public.project_profiles(updated_at desc);

create or replace function public.current_active_member_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select member.id
    from public.members as member
   where member.deleted_at is null
     and member.status = 'active'
     and (
       member.auth_user_id = auth.uid()
       or (
         member.auth_user_id is null
         and lower(member.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
       )
     )
   order by (member.auth_user_id = auth.uid()) desc
   limit 1;
$$;

create or replace function public.can_manage_projects()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with actor as (
    select member.id, member.role
      from public.members as member
     where member.id = public.current_active_member_id()
     limit 1
  )
  select exists (
    select 1
      from actor
     where actor.role in ('owner', 'admin')
        or exists (
          select 1
            from public.member_job_roles as assignment
            join public.job_roles as job_role on job_role.id = assignment.job_role_id
           where assignment.member_id = actor.id
             and 'manage_projects' = any(coalesce(job_role.permissions, '{}'::text[]))
        )
  );
$$;

revoke all on function public.current_active_member_id() from public, anon;
revoke all on function public.can_manage_projects() from public, anon;
grant execute on function public.current_active_member_id() to authenticated;
grant execute on function public.can_manage_projects() to authenticated;

alter table public.project_profiles enable row level security;

drop policy if exists "project_profiles_read" on public.project_profiles;
create policy "project_profiles_read"
on public.project_profiles for select
to authenticated
using (public.current_active_member_id() is not null);

drop policy if exists "project_profiles_insert" on public.project_profiles;
create policy "project_profiles_insert"
on public.project_profiles for insert
to authenticated
with check (public.can_manage_projects());

drop policy if exists "project_profiles_update" on public.project_profiles;
create policy "project_profiles_update"
on public.project_profiles for update
to authenticated
using (public.can_manage_projects())
with check (public.can_manage_projects());

drop policy if exists "project_profiles_delete" on public.project_profiles;
create policy "project_profiles_delete"
on public.project_profiles for delete
to authenticated
using (public.can_manage_projects());

grant select, insert, update, delete on public.project_profiles to authenticated;

-- Logos dos projetos: projects/<node_id>/logo-....
drop policy if exists "labstar_project_assets_read" on storage.objects;
create policy "labstar_project_assets_read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'labstar-files'
  and (storage.foldername(name))[1] = 'projects'
  and public.current_active_member_id() is not null
);

drop policy if exists "labstar_project_assets_insert" on storage.objects;
create policy "labstar_project_assets_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'labstar-files'
  and (storage.foldername(name))[1] = 'projects'
  and public.can_manage_projects()
);

drop policy if exists "labstar_project_assets_update" on storage.objects;
create policy "labstar_project_assets_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'labstar-files'
  and (storage.foldername(name))[1] = 'projects'
  and public.can_manage_projects()
)
with check (
  bucket_id = 'labstar-files'
  and (storage.foldername(name))[1] = 'projects'
  and public.can_manage_projects()
);

drop policy if exists "labstar_project_assets_delete" on storage.objects;
create policy "labstar_project_assets_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'labstar-files'
  and (storage.foldername(name))[1] = 'projects'
  and public.can_manage_projects()
);

create or replace function public.stamp_project_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  new.updated_by := public.current_active_member_id();
  return new;
end;
$$;

drop trigger if exists project_profiles_stamp on public.project_profiles;
create trigger project_profiles_stamp
before insert or update on public.project_profiles
for each row execute function public.stamp_project_profile();

notify pgrst, 'reload schema';
commit;
