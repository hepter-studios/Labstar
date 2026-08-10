-- Labstar — arquivos/imagens em documentos de projeto + cargo CSO.
-- Mantém os arquivos do README fora do Markdown e usa referências estáveis,
-- resolvidas por URLs assinadas no cliente.

begin;

create table if not exists public.project_document_assets (
  id uuid primary key default gen_random_uuid(),
  node_id text not null,
  file_name text not null check (char_length(trim(file_name)) between 1 and 240),
  file_path text not null unique,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists project_document_assets_node_created_idx
  on public.project_document_assets(node_id, created_at);

alter table public.project_document_assets enable row level security;

drop policy if exists "project_document_assets_read" on public.project_document_assets;
create policy "project_document_assets_read"
on public.project_document_assets for select
to authenticated
using (public.current_active_member_id() is not null);

drop policy if exists "project_document_assets_insert" on public.project_document_assets;
create policy "project_document_assets_insert"
on public.project_document_assets for insert
to authenticated
with check (public.can_manage_projects());

drop policy if exists "project_document_assets_update" on public.project_document_assets;
create policy "project_document_assets_update"
on public.project_document_assets for update
to authenticated
using (public.can_manage_projects())
with check (public.can_manage_projects());

drop policy if exists "project_document_assets_delete" on public.project_document_assets;
create policy "project_document_assets_delete"
on public.project_document_assets for delete
to authenticated
using (public.can_manage_projects());

grant select, insert, update, delete on public.project_document_assets to authenticated;

create or replace function public.stamp_project_document_asset()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.created_by is null then
    new.created_by := public.current_active_member_id();
  end if;
  return new;
end;
$$;

drop trigger if exists project_document_assets_stamp on public.project_document_assets;
create trigger project_document_assets_stamp
before insert on public.project_document_assets
for each row execute function public.stamp_project_document_asset();

-- Cargo profissional solicitado para a diretoria. Sem permissões administrativas
-- extras por padrão: a liderança pode concedê-las depois, se necessário.
insert into public.job_roles (name, department, color, icon, position, permissions)
select 'CSO', 'Diretoria Científica', '#8B1E3F', 'star', 16, '{}'::text[]
where not exists (
  select 1 from public.job_roles where lower(trim(name)) = 'cso'
);

notify pgrst, 'reload schema';
commit;
