-- Labstar — vínculo de organizações direto à identidade autenticada.
--
-- Objetivo: uma conta Supabase autenticada pode criar e possuir uma organização
-- sem virar automaticamente membro da organização legada Hepter Studios.
-- Isso separa identidade de conta (auth.users) de autorização dentro de uma org.

begin;

create table if not exists public.organization_accounts (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'manager', 'member', 'viewer')),
  joined_at timestamptz not null default now(),
  primary key (organization_id, auth_user_id)
);

create index if not exists organization_accounts_user_idx
  on public.organization_accounts (auth_user_id, organization_id);

-- Migra para o modelo por identidade as associações existentes que já possuem
-- auth_user_id. Não remove organization_members: o workspace legado continua intacto.
insert into public.organization_accounts (organization_id, auth_user_id, role, joined_at)
select
  membership.organization_id,
  member.auth_user_id,
  membership.role,
  membership.joined_at
from public.organization_members membership
join public.members member on member.id = membership.member_id
where member.auth_user_id is not null
on conflict (organization_id, auth_user_id)
do update set role = excluded.role;

create or replace function public.current_account_is_in_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.organization_accounts account_membership
    where account_membership.organization_id = target_organization_id
      and account_membership.auth_user_id = auth.uid()
  ) or exists (
    select 1
    from public.organization_members legacy_membership
    where legacy_membership.organization_id = target_organization_id
      and legacy_membership.member_id = public.current_member_id()
  );
$$;

create or replace function public.current_account_organization_role(target_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select membership.role
  from (
    select account_membership.role, 1 as priority
    from public.organization_accounts account_membership
    where account_membership.organization_id = target_organization_id
      and account_membership.auth_user_id = auth.uid()

    union all

    select legacy_membership.role, 2 as priority
    from public.organization_members legacy_membership
    where legacy_membership.organization_id = target_organization_id
      and legacy_membership.member_id = public.current_member_id()
  ) membership
  order by membership.priority
  limit 1;
$$;

revoke all on function public.current_account_is_in_organization(uuid) from public;
revoke all on function public.current_account_organization_role(uuid) from public;
grant execute on function public.current_account_is_in_organization(uuid) to authenticated;
grant execute on function public.current_account_organization_role(uuid) to authenticated;

alter table public.organization_accounts enable row level security;

drop policy if exists "organization_accounts_read" on public.organization_accounts;
create policy "organization_accounts_read"
on public.organization_accounts for select
to authenticated
using (
  auth_user_id = auth.uid()
  or public.current_account_organization_role(organization_id) in ('owner', 'admin')
);

grant select on public.organization_accounts to authenticated;

-- A organização só pode ser lida/alterada por uma identidade que realmente
-- pertença a ela. Login no Labstar, sozinho, nunca concede Hepter Studios.
drop policy if exists "organizations_read_member" on public.organizations;
drop policy if exists "organizations_read_account" on public.organizations;
create policy "organizations_read_account"
on public.organizations for select
to authenticated
using (public.current_account_is_in_organization(id));

drop policy if exists "organizations_update_admin" on public.organizations;
drop policy if exists "organizations_update_account_admin" on public.organizations;
create policy "organizations_update_account_admin"
on public.organizations for update
to authenticated
using (public.current_account_organization_role(id) in ('owner', 'admin'))
with check (public.current_account_organization_role(id) in ('owner', 'admin'));

drop policy if exists "organization_members_read_same_organization" on public.organization_members;
create policy "organization_members_read_same_organization"
on public.organization_members for select
to authenticated
using (public.current_account_is_in_organization(organization_id));

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
set search_path = public, auth, pg_temp
as $$
  with memberships as (
    select
      account_membership.organization_id,
      account_membership.role,
      1 as priority
    from public.organization_accounts account_membership
    where account_membership.auth_user_id = auth.uid()

    union all

    select
      legacy_membership.organization_id,
      legacy_membership.role,
      2 as priority
    from public.organization_members legacy_membership
    where legacy_membership.member_id = public.current_member_id()
  ), deduplicated as (
    select distinct on (membership.organization_id)
      membership.organization_id,
      membership.role
    from memberships membership
    order by membership.organization_id, membership.priority
  )
  select
    organization.id,
    organization.name,
    organization.slug,
    membership.role,
    organization.is_primary_legacy,
    organization.default_locale,
    organization.enabled_locales,
    organization.created_at
  from deduplicated membership
  join public.organizations organization on organization.id = membership.organization_id
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
set search_path = public, auth, pg_temp
as $$
declare
  caller_auth_id uuid := auth.uid();
  caller_email text;
  actor_member_id uuid;
  clean_name text;
  base_slug text;
  candidate_slug text;
  suffix integer := 2;
  owned_count integer := 0;
  created_organization public.organizations%rowtype;
begin
  if caller_auth_id is null then
    raise exception 'authentication_required';
  end if;

  select lower(trim(auth_user.email))
  into caller_email
  from auth.users auth_user
  where auth_user.id = caller_auth_id
    and auth_user.email is not null
    and auth_user.email_confirmed_at is not null;

  if caller_email is null then
    raise exception 'verified_email_required';
  end if;

  actor_member_id := public.current_member_id();

  -- Uma conta já vinculada a um membro suspenso/pendente não pode contornar esse
  -- estado criando outra organização. Contas sem membro legado podem criar a sua.
  if actor_member_id is not null and not public.current_member_is_active() then
    raise exception 'member_not_authorized';
  end if;

  select count(*)
  into owned_count
  from (
    select account_membership.organization_id
    from public.organization_accounts account_membership
    where account_membership.auth_user_id = caller_auth_id
      and account_membership.role = 'owner'

    union

    select legacy_membership.organization_id
    from public.organization_members legacy_membership
    where actor_member_id is not null
      and legacy_membership.member_id = actor_member_id
      and legacy_membership.role = 'owner'
  ) owned;

  if owned_count >= 25 then
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
  while exists (
    select 1
    from public.organizations organization
    where lower(organization.slug) = lower(candidate_slug)
  ) loop
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
  ) values (
    clean_name,
    candidate_slug,
    '',
    'en',
    array['en', 'pt-BR']::text[],
    false,
    actor_member_id
  )
  returning * into created_organization;

  insert into public.organization_accounts (organization_id, auth_user_id, role)
  values (created_organization.id, caller_auth_id, 'owner');

  if actor_member_id is not null then
    insert into public.organization_members (organization_id, member_id, role)
    values (created_organization.id, actor_member_id, 'owner')
    on conflict (organization_id, member_id)
    do update set role = excluded.role;
  end if;

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

commit;

select 'Labstar organization account memberships installed.' as status;
