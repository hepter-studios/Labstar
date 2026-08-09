-- Labstar — ações destrutivas v3.
-- Corrige falhas em que limpeza de arquivos podia abortar a exclusão das
-- mensagens e reinstala a exclusão permanente de conta de forma atômica.

begin;

alter table public.members
  add column if not exists auth_user_id uuid;

alter table public.members
  add column if not exists deleted_at timestamptz;

create unique index if not exists members_auth_user_id_unique_idx
  on public.members(auth_user_id)
  where auth_user_id is not null;

create or replace function public.clear_channel_chat(target_channel_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  actor public.members%rowtype;
  target_space_id uuid;
  deleted_count integer := 0;
  may_manage boolean := false;
begin
  if target_channel_id is null then
    raise exception 'channel_required' using errcode = '22023';
  end if;

  select member.*
    into actor
    from public.members as member
   where member.deleted_at is null
     and (
       member.auth_user_id = auth.uid()
       or (
         member.auth_user_id is null
         and lower(member.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
       )
     )
   order by (member.auth_user_id = auth.uid()) desc
   limit 1;

  if actor.id is null or actor.status <> 'active' then
    raise exception 'active_member_required' using errcode = '42501';
  end if;

  may_manage := actor.role in ('owner', 'admin')
    or exists (
      select 1
        from public.member_job_roles as assignment
        join public.job_roles as job_role on job_role.id = assignment.job_role_id
       where assignment.member_id = actor.id
         and 'manage_channels' = any(coalesce(job_role.permissions, '{}'::text[]))
    );

  if not may_manage then
    raise exception 'manage_channels_required' using errcode = '42501';
  end if;

  select channel.space_id
    into target_space_id
    from public.channels as channel
   where channel.id = target_channel_id;

  if target_space_id is null then
    raise exception 'channel_not_found' using errcode = 'P0002';
  end if;

  -- A operação principal é apagar as mensagens. Falha na limpeza física de
  -- anexos não pode impedir o botão de limpar chat de funcionar.
  delete from public.channel_messages
   where channel_id = target_channel_id;
  get diagnostics deleted_count = row_count;

  begin
    delete from storage.objects
     where bucket_id = 'labstar-files'
       and name like 'spaces/' || target_space_id::text || '/channels/' || target_channel_id::text || '/%';
  exception when others then
    raise warning 'labstar_channel_storage_cleanup_failed: %', sqlerrm;
  end;

  return deleted_count;
end;
$$;

create or replace function public.clear_direct_conversation(target_thread_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  actor public.members%rowtype;
  deleted_count integer := 0;
begin
  if target_thread_id is null then
    raise exception 'direct_thread_required' using errcode = '22023';
  end if;

  select member.*
    into actor
    from public.members as member
   where member.deleted_at is null
     and (
       member.auth_user_id = auth.uid()
       or (
         member.auth_user_id is null
         and lower(member.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
       )
     )
   order by (member.auth_user_id = auth.uid()) desc
   limit 1;

  if actor.id is null or actor.status <> 'active' then
    raise exception 'active_member_required' using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.direct_thread_members as membership
     where membership.thread_id = target_thread_id
       and membership.member_id = actor.id
  ) then
    raise exception 'direct_thread_access_denied' using errcode = '42501';
  end if;

  delete from public.direct_messages
   where thread_id = target_thread_id;
  get diagnostics deleted_count = row_count;

  begin
    delete from storage.objects
     where bucket_id = 'labstar-files'
       and name like 'direct/' || target_thread_id::text || '/%';
  exception when others then
    raise warning 'labstar_direct_storage_cleanup_failed: %', sqlerrm;
  end;

  return deleted_count;
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
set search_path = public, auth, storage, pg_temp
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
   where member.deleted_at is null
     and (
       member.auth_user_id = auth.uid()
       or (
         member.auth_user_id is null
         and lower(member.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
       )
     )
   order by (member.auth_user_id = auth.uid()) desc
   limit 1;

  if actor.id is null or actor.status <> 'active' then
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

  if target.id is not null then
    if target_auth_user_id is null then
      target_auth_user_id := target.auth_user_id;
    end if;

    update public.members
       set status = 'suspended',
           last_seen_at = now()
     where id = target.id;

    delete from public.member_job_roles
     where member_id = target.id;

    if coalesce(target.avatar_path, '') <> '' then
      begin
        delete from storage.objects
         where bucket_id = 'labstar-files'
           and name = target.avatar_path;
      exception when others then
        raise warning 'labstar_avatar_storage_cleanup_failed: %', sqlerrm;
      end;
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
    begin
      delete from auth.users as auth_user
       where auth_user.id = target_auth_user_id;
      identity_was_deleted := found;
    exception when others then
      raise exception 'auth_identity_delete_failed'
        using errcode = 'P0001', detail = sqlerrm;
    end;
  end if;

  return query select 'deleted'::text, target.id, identity_was_deleted;
end;
$$;

revoke all on function public.clear_channel_chat(uuid) from public, anon;
revoke all on function public.clear_direct_conversation(uuid) from public, anon;
revoke all on function public.delete_labstar_account(text, text) from public, anon;

grant execute on function public.clear_channel_chat(uuid) to authenticated;
grant execute on function public.clear_direct_conversation(uuid) to authenticated;
grant execute on function public.delete_labstar_account(text, text) to authenticated;

comment on function public.clear_channel_chat(uuid) is
  'Apaga mensagens do canal; falha de limpeza de anexos nao bloqueia a operacao principal.';
comment on function public.clear_direct_conversation(uuid) is
  'Apaga mensagens de uma conversa direta; falha de limpeza de anexos nao bloqueia a operacao principal.';
comment on function public.delete_labstar_account(text, text) is
  'Bloqueia e anonimiza o membro e remove a identidade Auth de forma atomica.';

notify pgrst, 'reload schema';

commit;
