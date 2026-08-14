-- Labstar — gestão segura de organizações.
-- Permite editar a organização, gerenciar proprietários/cargos e excluir
-- organizações secundárias sem conceder qualquer acesso à organização legada.

begin;

create or replace function public.update_organization_profile(
  target_organization_id uuid,
  organization_name text,
  desired_slug text
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
  caller_role text;
  clean_name text;
  clean_slug text;
  organization_row public.organizations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;

  caller_role := public.current_account_organization_role(target_organization_id);
  if caller_role not in ('owner', 'admin') then
    raise exception 'permission_denied';
  end if;

  select *
  into organization_row
  from public.organizations organization
  where organization.id = target_organization_id
  for update;

  if not found then
    raise exception 'organization_not_found';
  end if;

  clean_name := trim(coalesce(organization_name, ''));
  if char_length(clean_name) < 2 or char_length(clean_name) > 80 then
    raise exception 'invalid_organization_name';
  end if;

  clean_slug := lower(trim(coalesce(desired_slug, '')));
  clean_slug := translate(
    clean_slug,
    'áàâãäéèêëíìîïóòôõöúùûüçñ',
    'aaaaaeeeeiiiiooooouuuucn'
  );
  clean_slug := regexp_replace(clean_slug, '[^a-z0-9]+', '-', 'g');
  clean_slug := trim(both '-' from clean_slug);

  if char_length(clean_slug) < 3 or char_length(clean_slug) > 48
     or clean_slug !~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$' then
    raise exception 'invalid_organization_handle';
  end if;

  if exists (
    select 1
    from public.organizations other
    where other.id <> target_organization_id
      and lower(other.slug) = lower(clean_slug)
  ) then
    raise exception 'organization_handle_taken';
  end if;

  update public.organizations organization
  set name = clean_name,
      slug = clean_slug,
      updated_at = now()
  where organization.id = target_organization_id
  returning * into organization_row;

  return query
  select
    organization_row.id,
    organization_row.name,
    organization_row.slug,
    caller_role,
    organization_row.is_primary_legacy,
    organization_row.default_locale,
    organization_row.enabled_locales,
    organization_row.created_at;
end;
$$;

revoke all on function public.update_organization_profile(uuid, text, text) from public;
grant execute on function public.update_organization_profile(uuid, text, text) to authenticated;

create or replace function public.list_organization_accounts(target_organization_id uuid)
returns table (
  auth_user_id uuid,
  email text,
  display_name text,
  role text,
  joined_at timestamptz,
  is_current_user boolean
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  caller_role text;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;

  caller_role := public.current_account_organization_role(target_organization_id);
  if caller_role not in ('owner', 'admin') then
    raise exception 'permission_denied';
  end if;

  return query
  select
    account.auth_user_id,
    lower(coalesce(auth_user.email, ''))::text,
    coalesce(
      nullif(trim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(auth_user.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(auth_user.email, ''), '@', 1), ''),
      'Membro Labstar'
    )::text,
    account.role,
    account.joined_at,
    account.auth_user_id = auth.uid()
  from public.organization_accounts account
  left join auth.users auth_user on auth_user.id = account.auth_user_id
  where account.organization_id = target_organization_id
  order by
    case account.role
      when 'owner' then 1
      when 'admin' then 2
      when 'manager' then 3
      when 'member' then 4
      else 5
    end,
    lower(coalesce(auth_user.email, '')),
    account.joined_at;
end;
$$;

revoke all on function public.list_organization_accounts(uuid) from public;
grant execute on function public.list_organization_accounts(uuid) to authenticated;

create or replace function public.set_organization_account_role(
  target_organization_id uuid,
  target_auth_user_id uuid,
  new_role text
)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  caller_role text;
  previous_role text;
  owner_count integer;
  legacy_member_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;

  caller_role := public.current_account_organization_role(target_organization_id);
  if caller_role <> 'owner' then
    raise exception 'owner_required';
  end if;

  if new_role not in ('owner', 'admin', 'manager', 'member', 'viewer') then
    raise exception 'invalid_role';
  end if;

  select account.role
  into previous_role
  from public.organization_accounts account
  where account.organization_id = target_organization_id
    and account.auth_user_id = target_auth_user_id
  for update;

  if previous_role is null then
    raise exception 'organization_member_not_found';
  end if;

  if previous_role = 'owner' and new_role <> 'owner' then
    select count(*)
    into owner_count
    from public.organization_accounts account
    where account.organization_id = target_organization_id
      and account.role = 'owner';

    if owner_count <= 1 then
      raise exception 'organization_requires_owner';
    end if;
  end if;

  update public.organization_accounts account
  set role = new_role
  where account.organization_id = target_organization_id
    and account.auth_user_id = target_auth_user_id;

  select member.id
  into legacy_member_id
  from public.members member
  where member.auth_user_id = target_auth_user_id
  limit 1;

  if legacy_member_id is not null then
    update public.organization_members membership
    set role = new_role
    where membership.organization_id = target_organization_id
      and membership.member_id = legacy_member_id;
  end if;
end;
$$;

revoke all on function public.set_organization_account_role(uuid, uuid, text) from public;
grant execute on function public.set_organization_account_role(uuid, uuid, text) to authenticated;

create or replace function public.delete_organization(
  target_organization_id uuid,
  confirmation_slug text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  caller_role text;
  organization_row public.organizations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;

  caller_role := public.current_account_organization_role(target_organization_id);
  if caller_role <> 'owner' then
    raise exception 'owner_required';
  end if;

  select *
  into organization_row
  from public.organizations organization
  where organization.id = target_organization_id
  for update;

  if not found then
    raise exception 'organization_not_found';
  end if;

  if organization_row.is_primary_legacy then
    raise exception 'primary_organization_protected';
  end if;

  if lower(trim(coalesce(confirmation_slug, ''))) <> lower(organization_row.slug) then
    raise exception 'organization_delete_confirmation_mismatch';
  end if;

  delete from public.organizations organization
  where organization.id = target_organization_id;

  return target_organization_id;
end;
$$;

revoke all on function public.delete_organization(uuid, text) from public;
grant execute on function public.delete_organization(uuid, text) to authenticated;

commit;

select 'Labstar organization management installed.' as status;
