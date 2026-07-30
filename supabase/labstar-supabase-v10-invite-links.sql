-- Labstar v10 — convites por link de uso único, OAuth e aprovação segura.
--
-- Execute somente depois de revisar e aplicar a migração v9.
-- Este arquivo não é executado automaticamente pelo GitHub ou Cloudflare.

begin;

create extension if not exists pgcrypto;

alter table public.member_invites
  add column if not exists token_hash text,
  add column if not exists token_hint text,
  add column if not exists kind text not null default 'personal',
  add column if not exists max_uses integer not null default 1,
  add column if not exists use_count integer not null default 0,
  add column if not exists approval_required boolean not null default false,
  add column if not exists consumed_at timestamptz;

-- Convites rápidos não precisam conhecer o e-mail antes do aceite.
alter table public.member_invites
  alter column email drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'member_invites_kind_check'
      and conrelid = 'public.member_invites'::regclass
  ) then
    alter table public.member_invites
      add constraint member_invites_kind_check
      check (kind in ('personal', 'quick'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'member_invites_usage_check'
      and conrelid = 'public.member_invites'::regclass
  ) then
    alter table public.member_invites
      add constraint member_invites_usage_check
      check (max_uses = 1 and use_count between 0 and max_uses);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'member_invites_personal_email_check'
      and conrelid = 'public.member_invites'::regclass
  ) then
    alter table public.member_invites
      add constraint member_invites_personal_email_check
      check (
        (kind = 'personal' and email is not null and char_length(trim(email)) between 3 and 320)
        or (kind = 'quick' and email is null)
      );
  end if;
end $$;

create unique index if not exists member_invites_token_hash_unique_idx
  on public.member_invites (token_hash)
  where token_hash is not null;

create index if not exists member_invites_pending_expiry_idx
  on public.member_invites (status, expires_at)
  where status = 'pending';

-- Convites antigos sem token deixam de bloquear um novo convite pessoal.
update public.member_invites
set status = 'revoked', revoked_at = coalesce(revoked_at, now())
where status = 'pending'
  and token_hash is null;

-- A função antiga criava convites sem link. A assinatura é removida para impedir
-- uso acidental depois da instalação da v10.
drop function if exists public.create_member_invite(text, text, text, text, text, jsonb, integer);

create or replace function public.create_member_invite_link(
  invitation_kind text default 'quick',
  invited_email text default null,
  invited_name text default '',
  invited_role text default 'member',
  invited_job_title text default '',
  invited_area text default '',
  valid_for_hours integer default 48
)
returns table (
  invite_id uuid,
  invite_token text,
  invite_path text,
  kind text,
  email text,
  expires_at timestamptz,
  approval_required boolean
)
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  raw_token text;
  hashed_token text;
  normalized_target_email text;
  created_invite public.member_invites;
begin
  if not public.current_member_can_manage() then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  invitation_kind := lower(trim(coalesce(invitation_kind, 'quick')));
  if invitation_kind not in ('personal', 'quick') then
    raise exception 'invalid_invite_kind' using errcode = '22023';
  end if;

  if invited_role not in ('admin', 'manager', 'member', 'viewer') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  if invitation_kind = 'personal' then
    normalized_target_email := lower(trim(coalesce(invited_email, '')));
    if normalized_target_email = '' or position('@' in normalized_target_email) < 2 then
      raise exception 'personal_invite_requires_email' using errcode = '22023';
    end if;

    -- Só existe um convite pessoal pendente para o mesmo endereço.
    update public.member_invites as pending_invite
    set status = 'revoked', revoked_at = now()
    where pending_invite.status = 'pending'
      and pending_invite.kind = 'personal'
      and pending_invite.normalized_email = normalized_target_email;
  else
    normalized_target_email := null;
  end if;

  update public.member_invites as expired_invite
  set status = 'expired'
  where expired_invite.status = 'pending'
    and expired_invite.expires_at <= now();

  raw_token := encode(gen_random_bytes(32), 'hex');
  hashed_token := encode(digest(raw_token, 'sha256'), 'hex');

  insert into public.member_invites (
    email,
    name,
    role,
    job_title,
    area,
    assignments,
    status,
    invited_by,
    expires_at,
    token_hash,
    token_hint,
    kind,
    max_uses,
    use_count,
    approval_required
  ) values (
    normalized_target_email,
    left(trim(coalesce(invited_name, '')), 100),
    invited_role,
    left(trim(coalesce(invited_job_title, '')), 120),
    left(trim(coalesce(invited_area, '')), 120),
    '[]'::jsonb,
    'pending',
    public.current_member_id(),
    now() + make_interval(hours => greatest(1, least(valid_for_hours, 720))),
    hashed_token,
    left(raw_token, 8),
    invitation_kind,
    1,
    0,
    invitation_kind = 'quick'
  )
  returning * into created_invite;

  return query select
    created_invite.id,
    raw_token,
    '/?invite=' || raw_token,
    created_invite.kind,
    created_invite.email,
    created_invite.expires_at,
    created_invite.approval_required;
end;
$$;

-- Consulta pública e limitada: não revela o token, o nome, o cargo ou permissões.
create or replace function public.inspect_member_invite(invite_token text)
returns table (
  valid boolean,
  status text,
  kind text,
  email_hint text,
  expires_at timestamptz,
  approval_required boolean
)
language plpgsql
security definer
stable
set search_path = public, extensions, pg_temp
as $$
declare
  invitation public.member_invites;
  hashed_token text;
begin
  if invite_token is null or invite_token !~ '^[0-9a-f]{64}$' then
    return query select false, 'invalid'::text, null::text, null::text, null::timestamptz, null::boolean;
    return;
  end if;

  hashed_token := encode(digest(invite_token, 'sha256'), 'hex');

  select item.* into invitation
  from public.member_invites item
  where item.token_hash = hashed_token
  limit 1;

  if not found then
    return query select false, 'invalid'::text, null::text, null::text, null::timestamptz, null::boolean;
    return;
  end if;

  if invitation.status <> 'pending' or invitation.use_count >= invitation.max_uses then
    return query select false, invitation.status, invitation.kind, null::text, invitation.expires_at, invitation.approval_required;
    return;
  end if;

  if invitation.expires_at <= now() then
    return query select false, 'expired'::text, invitation.kind, null::text, invitation.expires_at, invitation.approval_required;
    return;
  end if;

  return query select
    true,
    'pending'::text,
    invitation.kind,
    case
      when invitation.email is null then null
      else left(split_part(invitation.email, '@', 1), 1) || '***@' || split_part(invitation.email, '@', 2)
    end,
    invitation.expires_at,
    invitation.approval_required;
end;
$$;

create or replace function public.accept_member_invite(invite_token text)
returns setof public.members
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  caller_id uuid := auth.uid();
  caller_email text;
  caller_name text;
  hashed_token text;
  invitation public.member_invites;
  existing_member public.members;
  desired_status text;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if invite_token is null or invite_token !~ '^[0-9a-f]{64}$' then
    raise exception 'invite_invalid_or_expired' using errcode = '22023';
  end if;

  select
    lower(trim(auth_user.email)),
    coalesce(
      nullif(trim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(auth_user.raw_user_meta_data ->> 'name'), ''),
      split_part(lower(trim(auth_user.email)), '@', 1)
    )
  into caller_email, caller_name
  from auth.users auth_user
  where auth_user.id = caller_id
    and auth_user.email is not null
    and auth_user.email_confirmed_at is not null;

  if caller_email is null then
    raise exception 'verified_email_required' using errcode = '28000';
  end if;

  hashed_token := encode(digest(invite_token, 'sha256'), 'hex');

  select item.* into invitation
  from public.member_invites item
  where item.token_hash = hashed_token
  for update;

  if not found
    or invitation.status <> 'pending'
    or invitation.expires_at <= now()
    or invitation.use_count >= invitation.max_uses
  then
    raise exception 'invite_invalid_or_expired' using errcode = '22023';
  end if;

  if invitation.kind = 'personal'
    and invitation.normalized_email <> caller_email
  then
    raise exception 'invite_email_mismatch' using errcode = '42501';
  end if;

  select member.* into existing_member
  from public.members member
  where member.auth_user_id = caller_id
  limit 1
  for update;

  if not found then
    select member.* into existing_member
    from public.members member
    where lower(trim(member.email)) = caller_email
    limit 1
    for update;
  end if;

  if found and existing_member.auth_user_id is not null and existing_member.auth_user_id <> caller_id then
    raise exception 'member_already_linked' using errcode = '42501';
  end if;

  if found and existing_member.status = 'suspended' then
    raise exception 'member_suspended' using errcode = '42501';
  end if;

  desired_status := case when invitation.approval_required then 'pending' else 'active' end;

  if found then
    update public.members
    set auth_user_id = caller_id,
        email = caller_email,
        name = case
          when char_length(trim(existing_member.name)) >= 2 then existing_member.name
          when char_length(trim(invitation.name)) >= 2 then invitation.name
          else caller_name
        end,
        status = case when existing_member.status = 'active' then 'active' else desired_status end,
        role = case
          when existing_member.status = 'active' or existing_member.role = 'owner' then existing_member.role
          else invitation.role
        end,
        job_title = case
          when existing_member.status = 'active' or trim(invitation.job_title) = '' then existing_member.job_title
          else invitation.job_title
        end,
        area = case
          when existing_member.status = 'active' or trim(invitation.area) = '' then existing_member.area
          else invitation.area
        end,
        last_seen_at = now()
    where id = existing_member.id
    returning * into existing_member;
  else
    insert into public.members (
      auth_user_id,
      email,
      name,
      status,
      role,
      job_title,
      area,
      assignments,
      last_seen_at
    ) values (
      caller_id,
      caller_email,
      coalesce(nullif(trim(invitation.name), ''), caller_name),
      desired_status,
      invitation.role,
      invitation.job_title,
      invitation.area,
      invitation.assignments,
      now()
    )
    returning * into existing_member;
  end if;

  update public.member_invites
  set status = 'accepted',
      accepted_by = caller_id,
      accepted_at = now(),
      consumed_at = now(),
      use_count = use_count + 1
  where id = invitation.id;

  return next existing_member;
end;
$$;

create or replace function public.list_member_invites()
returns table (
  id uuid,
  kind text,
  email text,
  status text,
  role text,
  area text,
  token_hint text,
  approval_required boolean,
  created_at timestamptz,
  expires_at timestamptz,
  accepted_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
begin
  if not public.current_member_can_manage() then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  return query
  select
    invitation.id,
    invitation.kind,
    invitation.email,
    invitation.status,
    invitation.role,
    invitation.area,
    invitation.token_hint,
    invitation.approval_required,
    invitation.created_at,
    invitation.expires_at,
    invitation.accepted_at
  from public.member_invites invitation
  order by invitation.created_at desc;
end;
$$;

create or replace function public.revoke_member_invite(target_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.current_member_can_manage() then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  update public.member_invites
  set status = 'revoked', revoked_at = now()
  where id = target_invite_id
    and status = 'pending';
end;
$$;

revoke all on function public.create_member_invite_link(text, text, text, text, text, text, integer) from public;
revoke all on function public.inspect_member_invite(text) from public;
revoke all on function public.accept_member_invite(text) from public;
revoke all on function public.list_member_invites() from public;
revoke all on function public.revoke_member_invite(uuid) from public;

grant execute on function public.create_member_invite_link(text, text, text, text, text, text, integer) to authenticated;
grant execute on function public.inspect_member_invite(text) to anon, authenticated;
grant execute on function public.accept_member_invite(text) to authenticated;
grant execute on function public.list_member_invites() to authenticated;
grant execute on function public.revoke_member_invite(uuid) to authenticated;

commit;

select 'Labstar v10 preparada: convites de uso único com Google e GitHub.' as status;
