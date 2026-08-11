-- Labstar — handles globais únicos para organizações e contas.
--
-- Regras:
-- - nome de exibição pode se repetir;
-- - @handle de organização é único sem diferenciar maiúsculas/minúsculas;
-- - @username de conta é único sem diferenciar maiúsculas/minúsculas;
-- - a validação crítica vive no PostgreSQL, não apenas no frontend.

begin;

-- A tabela de organizações já possuía índice case-insensitive. Recriamos de forma
-- explícita/idempotente para garantir a regra em qualquer ambiente atualizado.
create unique index if not exists organizations_slug_lower_idx
  on public.organizations (lower(slug));

create table if not exists public.account_profiles (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  username text,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_profiles_username_format check (
    username is null
    or (
      char_length(username) between 3 and 39
      and username ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'
      and username !~ '--'
    )
  )
);

create unique index if not exists account_profiles_username_lower_unique_idx
  on public.account_profiles (lower(username))
  where username is not null;

alter table public.account_profiles enable row level security;

drop policy if exists "account_profiles_read_self" on public.account_profiles;
create policy "account_profiles_read_self"
on public.account_profiles for select
to authenticated
using (auth_user_id = auth.uid());

drop policy if exists "account_profiles_update_self" on public.account_profiles;
create policy "account_profiles_update_self"
on public.account_profiles for update
to authenticated
using (auth_user_id = auth.uid())
with check (auth_user_id = auth.uid());

grant select, update on public.account_profiles to authenticated;

create or replace function public.normalize_global_handle(input_value text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select trim(both '-' from regexp_replace(
    lower(trim(coalesce(input_value, ''))),
    '[^a-z0-9-]+',
    '-',
    'g'
  ));
$$;

revoke all on function public.normalize_global_handle(text) from public;
grant execute on function public.normalize_global_handle(text) to authenticated;

create or replace function public.organization_handle_available(candidate text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  normalized text := public.normalize_global_handle(candidate);
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;

  if char_length(normalized) < 3 or char_length(normalized) > 48
     or normalized !~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'
     or normalized ~ '--' then
    return false;
  end if;

  return not exists (
    select 1
    from public.organizations organization
    where lower(organization.slug) = lower(normalized)
  );
end;
$$;

revoke all on function public.organization_handle_available(text) from public;
grant execute on function public.organization_handle_available(text) to authenticated;

create or replace function public.username_available(candidate text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  normalized text := public.normalize_global_handle(candidate);
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;

  if char_length(normalized) < 3 or char_length(normalized) > 39
     or normalized !~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'
     or normalized ~ '--' then
    return false;
  end if;

  return not exists (
    select 1
    from public.account_profiles profile
    where lower(profile.username) = lower(normalized)
      and profile.auth_user_id <> auth.uid()
  );
end;
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to authenticated;

create or replace function public.claim_username(desired_username text)
returns text
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  caller_id uuid := auth.uid();
  normalized text := public.normalize_global_handle(desired_username);
begin
  if caller_id is null then
    raise exception 'authentication_required';
  end if;

  if char_length(normalized) < 3 or char_length(normalized) > 39
     or normalized !~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'
     or normalized ~ '--' then
    raise exception 'invalid_username';
  end if;

  if exists (
    select 1
    from public.account_profiles profile
    where lower(profile.username) = lower(normalized)
      and profile.auth_user_id <> caller_id
  ) then
    raise exception 'username_taken';
  end if;

  insert into public.account_profiles (auth_user_id, username)
  values (caller_id, normalized)
  on conflict (auth_user_id)
  do update set
    username = excluded.username,
    updated_at = now();

  return normalized;
exception
  when unique_violation then
    raise exception 'username_taken';
end;
$$;

revoke all on function public.claim_username(text) from public;
grant execute on function public.claim_username(text) to authenticated;

-- Criação de organização: quando o usuário escolhe explicitamente um handle,
-- ele nunca é alterado silenciosamente para "-2". Se estiver ocupado, falha.
-- Quando o handle é deixado vazio, o sistema pode gerar um disponível pelo nome.
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
  requested_slug text;
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

  requested_slug := nullif(public.normalize_global_handle(desired_slug), '');

  if requested_slug is not null then
    if char_length(requested_slug) < 3 or char_length(requested_slug) > 48
       or requested_slug !~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'
       or requested_slug ~ '--' then
      raise exception 'invalid_organization_handle';
    end if;

    if exists (
      select 1 from public.organizations organization
      where lower(organization.slug) = lower(requested_slug)
    ) then
      raise exception 'organization_handle_taken';
    end if;

    candidate_slug := requested_slug;
  else
    base_slug := public.normalize_global_handle(clean_name);
    if char_length(base_slug) < 3 then
      base_slug := 'org-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    end if;
    base_slug := left(base_slug, 48);
    base_slug := trim(both '-' from base_slug);
    candidate_slug := base_slug;

    while exists (
      select 1 from public.organizations organization
      where lower(organization.slug) = lower(candidate_slug)
    ) loop
      candidate_slug := left(base_slug, greatest(3, 47 - char_length(suffix::text))) || '-' || suffix::text;
      suffix := suffix + 1;
    end loop;
  end if;

  begin
    insert into public.organizations (
      name, slug, description, default_locale, enabled_locales,
      is_primary_legacy, created_by
    ) values (
      clean_name, candidate_slug, '', 'en', array['en', 'pt-BR']::text[],
      false, actor_member_id
    ) returning * into created_organization;
  exception
    when unique_violation then
      raise exception 'organization_handle_taken';
  end;

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

select 'Labstar global handles and usernames installed.' as status;
