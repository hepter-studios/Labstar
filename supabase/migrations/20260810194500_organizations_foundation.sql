-- Labstar — fundação multi-organização.
-- A organização atual da Hepter Studios é preservada como organização primária.
-- Esta migração é aditiva: não altera, move ou apaga workspaces, espaços, canais,
-- mensagens, projetos, cargos ou integrações existentes.

begin;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 80),
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,47}[a-z0-9]$'),
  description text not null default '',
  default_locale text not null default 'en' check (default_locale in ('en', 'pt-BR')),
  enabled_locales text[] not null default array['en', 'pt-BR']::text[],
  is_primary_legacy boolean not null default false,
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists organizations_slug_lower_idx
  on public.organizations (lower(slug));

create unique index if not exists organizations_single_primary_legacy_idx
  on public.organizations ((is_primary_legacy))
  where is_primary_legacy;

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'manager', 'member', 'viewer')),
  joined_at timestamptz not null default now(),
  primary key (organization_id, member_id)
);

create index if not exists organization_members_member_idx
  on public.organization_members (member_id, organization_id);

-- UUID estável também usado pelo frontend como fallback antes da migração chegar.
insert into public.organizations (
  id,
  name,
  slug,
  description,
  default_locale,
  enabled_locales,
  is_primary_legacy,
  created_by
)
select
  '00000000-0000-4000-8000-000000000001'::uuid,
  'Hepter Studios',
  'hepter-studios',
  'Organização original do Labstar. Mantém exatamente os dados e a estrutura já existentes.',
  'en',
  array['en', 'pt-BR']::text[],
  true,
  (
    select id
    from public.members
    where role = 'owner'
    order by created_at asc
    limit 1
  )
where not exists (
  select 1 from public.organizations where is_primary_legacy
)
on conflict (id) do nothing;

-- Apenas cria o vínculo organizacional dos membros atuais. Nenhum registro de
-- public.members é atualizado e nenhuma permissão existente é reescrita.
insert into public.organization_members (organization_id, member_id, role)
select
  '00000000-0000-4000-8000-000000000001'::uuid,
  member.id,
  case
    when member.role in ('owner', 'admin', 'manager', 'member', 'viewer') then member.role
    else 'member'
  end
from public.members member
where exists (
  select 1
  from public.organizations organization
  where organization.id = '00000000-0000-4000-8000-000000000001'::uuid
)
on conflict (organization_id, member_id) do nothing;

create or replace function public.current_member_is_in_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organization_members membership
    where membership.organization_id = target_organization_id
      and membership.member_id = public.current_member_id()
  );
$$;

create or replace function public.current_member_organization_role(target_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select membership.role
  from public.organization_members membership
  where membership.organization_id = target_organization_id
    and membership.member_id = public.current_member_id()
  limit 1;
$$;

revoke all on function public.current_member_is_in_organization(uuid) from public;
revoke all on function public.current_member_organization_role(uuid) from public;
grant execute on function public.current_member_is_in_organization(uuid) to authenticated;
grant execute on function public.current_member_organization_role(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

drop policy if exists "organizations_read_member" on public.organizations;
create policy "organizations_read_member"
on public.organizations for select
to authenticated
using (public.current_member_is_in_organization(id));

drop policy if exists "organizations_update_admin" on public.organizations;
create policy "organizations_update_admin"
on public.organizations for update
to authenticated
using (public.current_member_organization_role(id) in ('owner', 'admin'))
with check (public.current_member_organization_role(id) in ('owner', 'admin'));

drop policy if exists "organization_members_read_same_organization" on public.organization_members;
create policy "organization_members_read_same_organization"
on public.organization_members for select
to authenticated
using (public.current_member_is_in_organization(organization_id));

grant select, update on public.organizations to authenticated;
grant select on public.organization_members to authenticated;

create or replace function public.list_my_organizations()
returns table (
  id uuid,
  name text,
  slug text,
  role text,
  is_primary_legacy boolean,
  default_locale text,
  enabled_locales text[],
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    organization.id,
    organization.name,
    organization.slug,
    membership.role,
    organization.is_primary_legacy,
    organization.default_locale,
    organization.enabled_locales,
    organization.created_at
  from public.organization_members membership
  join public.organizations organization on organization.id = membership.organization_id
  where membership.member_id = public.current_member_id()
  order by organization.is_primary_legacy desc, lower(organization.name), organization.created_at;
$$;

revoke all on function public.list_my_organizations() from public;
grant execute on function public.list_my_organizations() to authenticated;

create or replace function public.create_organization(
  organization_name text,
  desired_slug text default null
)
returns table (
  id uuid,
  name text,
  slug text,
  role text,
  is_primary_legacy boolean,
  default_locale text,
  enabled_locales text[],
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid;
  clean_name text;
  base_slug text;
  candidate_slug text;
  suffix integer := 2;
  created_organization public.organizations%rowtype;
begin
  actor_id := public.current_member_id();
  if actor_id is null or not public.current_member_is_active() then
    raise exception 'member_not_authorized';
  end if;

  if (
    select count(*)
    from public.organization_members membership
    where membership.member_id = actor_id
      and membership.role = 'owner'
  ) >= 25 then
    raise exception 'organization_limit_reached';
  end if;

  clean_name := trim(coalesce(organization_name, ''));
  if char_length(clean_name) < 2 or char_length(clean_name) > 80 then
    raise exception 'invalid_organization_name';
  end if;

  base_slug := lower(trim(coalesce(nullif(desired_slug, ''), clean_name)));
  base_slug := translate(
    base_slug,
    'áàâãäéèêëíìîïóòôõöúùûüçñ',
    'aaaaaeeeeiiiiooooouuuucn'
  );
  base_slug := regexp_replace(base_slug, '[^a-z0-9]+', '-', 'g');
  base_slug := trim(both '-' from base_slug);
  base_slug := left(base_slug, 48);
  base_slug := trim(both '-' from base_slug);

  if char_length(base_slug) < 3 then
    base_slug := 'org-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  end if;

  candidate_slug := base_slug;
  while exists (select 1 from public.organizations organization where lower(organization.slug) = lower(candidate_slug)) loop
    candidate_slug := left(base_slug, greatest(3, 47 - char_length(suffix::text))) || '-' || suffix::text;
    suffix := suffix + 1;
  end loop;

  insert into public.organizations (
    name,
    slug,
    description,
    default_locale,
    enabled_locales,
    is_primary_legacy,
    created_by
  )
  values (
    clean_name,
    candidate_slug,
    '',
    'en',
    array['en', 'pt-BR']::text[],
    false,
    actor_id
  )
  returning * into created_organization;

  insert into public.organization_members (organization_id, member_id, role)
  values (created_organization.id, actor_id, 'owner');

  return query
  select
    created_organization.id,
    created_organization.name,
    created_organization.slug,
    'owner'::text,
    created_organization.is_primary_legacy,
    created_organization.default_locale,
    created_organization.enabled_locales,
    created_organization.created_at;
end;
$$;

revoke all on function public.create_organization(text, text) from public;
grant execute on function public.create_organization(text, text) to authenticated;

create or replace function public.touch_organization_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists organizations_touch_updated_at on public.organizations;
create trigger organizations_touch_updated_at
before update on public.organizations
for each row execute function public.touch_organization_updated_at();

commit;

select 'Labstar organizations foundation installed without modifying legacy workspace data.' as status;
