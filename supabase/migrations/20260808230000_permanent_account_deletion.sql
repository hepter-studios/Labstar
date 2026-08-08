-- Exclusao administrativa em duas etapas.
-- 1) remove_team_member suspende e bloqueia o acesso.
-- 2) delete_labstar_account apaga a identidade do Supabase Auth e anonimiza
--    o e-mail interno, preservando o nome usado no historico de mensagens.

begin;

alter table public.members
  add column if not exists auth_user_id uuid;

alter table public.members
  add column if not exists deleted_at timestamptz;

create unique index if not exists members_auth_user_id_unique_idx
  on public.members(auth_user_id)
  where auth_user_id is not null;

create or replace function public.remove_team_member(target_member_id uuid)
returns table (
  outcome text,
  member_id uuid,
  reason text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor public.members%rowtype;
  target public.members%rowtype;
begin
  select member.*
    into actor
    from public.members as member
   where member.auth_user_id = auth.uid()
      or (
        member.auth_user_id is null
        and lower(member.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
   order by (member.auth_user_id = auth.uid()) desc
   limit 1;

  if actor.id is null or actor.status <> 'active' or actor.deleted_at is not null then
    raise exception 'member_not_authorized' using errcode = '42501';
  end if;

  if actor.role not in ('owner', 'admin') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select member.*
    into target
    from public.members as member
   where member.id = target_member_id
     and member.deleted_at is null
   for update;

  if target.id is null then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;

  if target.id = actor.id or target.auth_user_id = auth.uid() then
    raise exception 'self_removal_forbidden' using errcode = '42501';
  end if;

  if target.role = 'owner' then
    raise exception 'owner_removal_forbidden' using errcode = '42501';
  end if;

  if actor.role = 'admin' and target.role = 'admin' then
    raise exception 'owner_required' using errcode = '42501';
  end if;

  update public.members
     set status = 'suspended',
         last_seen_at = now()
   where id = target.id;

  return query select 'suspended'::text, target.id, 'access_suspended'::text;
end;
$$;

create or replace function public.delete_labstar_account(
  target_email text,
  confirmation_email text
)
returns table (
  outcome text,
  member_id uuid,
  auth_identity_deleted boolean
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  actor public.members%rowtype;
  target public.members%rowtype;
  normalized_email text := lower(trim(coalesce(target_email, '')));
  normalized_confirmation text := lower(trim(coalesce(confirmation_email, '')));
  target_auth_user_id uuid;
  identity_was_deleted boolean := false;
begin
  if normalized_email = '' or normalized_email <> normalized_confirmation then
    raise exception 'confirmation_email_mismatch' using errcode = '22023';
  end if;

  select member.*
    into actor
    from public.members as member
   where member.auth_user_id = auth.uid()
      or (
        member.auth_user_id is null
        and lower(member.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
   order by (member.auth_user_id = auth.uid()) desc
   limit 1;

  if actor.id is null or actor.status <> 'active' or actor.deleted_at is not null then
    raise exception 'member_not_authorized' using errcode = '42501';
  end if;

  if actor.role not in ('owner', 'admin') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select auth_user.id
    into target_auth_user_id
    from auth.users as auth_user
   where lower(coalesce(auth_user.email, '')) = normalized_email
   limit 1;

  select member.*
    into target
    from public.members as member
   where member.deleted_at is null
     and (
       lower(member.email) = normalized_email
       or (target_auth_user_id is not null and member.auth_user_id = target_auth_user_id)
     )
   order by (member.auth_user_id = target_auth_user_id) desc
   limit 1
   for update;

  if target.id is null and target_auth_user_id is null then
    raise exception 'account_not_found' using errcode = 'P0002';
  end if;

  if target.id = actor.id or target_auth_user_id = auth.uid() then
    raise exception 'self_deletion_forbidden' using errcode = '42501';
  end if;

  if target.role = 'owner' then
    raise exception 'owner_deletion_forbidden' using errcode = '42501';
  end if;

  if actor.role = 'admin' and (target.id is null or target.role = 'admin') then
    raise exception 'owner_required' using errcode = '42501';
  end if;

  if target.id is not null and target.status <> 'suspended' then
    raise exception 'member_must_be_suspended' using errcode = '55000';
  end if;

  if target.id is not null then
    if target_auth_user_id is null then
      target_auth_user_id := target.auth_user_id;
    end if;

    update public.members
       set auth_user_id = null,
           email = 'deleted+' || replace(target.id::text, '-', '') || '@labstar.invalid',
           status = 'suspended',
           avatar_path = null,
           deleted_at = now(),
           last_seen_at = now()
     where id = target.id;
  end if;

  if target_auth_user_id is not null then
    delete from auth.users as auth_user
     where auth_user.id = target_auth_user_id;
    identity_was_deleted := found;
  end if;

  return query select 'deleted'::text, target.id, identity_was_deleted;
end;
$$;

revoke all on function public.remove_team_member(uuid) from public, anon;
revoke all on function public.delete_labstar_account(text, text) from public, anon;
grant execute on function public.remove_team_member(uuid) to authenticated;
grant execute on function public.delete_labstar_account(text, text) to authenticated;

comment on function public.delete_labstar_account(text, text) is
  'Exclui uma identidade Auth nao-owner apos suspensao e preserva autoria historica anonimizada.';

notify pgrst, 'reload schema';

commit;
