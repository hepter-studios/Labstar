-- Labstar — exclusão de conta somente pelo serviço Rust e correções finais de acesso.
-- A service role permanece fora do frontend/Tauri. Esta migração remove a RPC
-- antiga que permitia ao cliente alcançar auth.users por SECURITY DEFINER.

begin;

drop function if exists public.delete_labstar_account(text, text);

create or replace function public.finalize_labstar_account_deletion(
  target_member_id uuid,
  target_email text
)
returns table (
  member_id uuid,
  avatar_path text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.members%rowtype;
begin
  if target_member_id is null or nullif(trim(target_email), '') is null then
    raise exception 'account_target_required' using errcode = '22023';
  end if;

  select member.*
    into target
    from public.members as member
   where member.id = target_member_id
     and member.deleted_at is null
   for update;

  if target.id is null then
    raise exception 'account_not_found' using errcode = 'P0002';
  end if;
  if lower(trim(target.email)) <> lower(trim(target_email)) then
    raise exception 'account_email_mismatch' using errcode = '22023';
  end if;
  if target.role = 'owner' then
    raise exception 'owner_deletion_forbidden' using errcode = '42501';
  end if;
  if target.status <> 'suspended' then
    raise exception 'member_must_be_suspended' using errcode = '55000';
  end if;

  delete from public.member_job_roles
   where member_job_roles.member_id = target.id;

  update public.members as member
     set auth_user_id = null,
         email = 'deleted+' || replace(target.id::text, '-', '') || '@deleted.invalid',
         avatar_path = null,
         assignments = '[]'::jsonb,
         role = 'member',
         status = 'suspended',
         deleted_at = now()
   where member.id = target.id;

  return query select target.id, target.avatar_path;
end;
$$;

revoke all on function public.finalize_labstar_account_deletion(uuid, text)
  from public, anon, authenticated;
grant execute on function public.finalize_labstar_account_deletion(uuid, text)
  to service_role;

comment on function public.finalize_labstar_account_deletion(uuid, text) is
  'Finaliza a anonimização depois que a API Rust remove a identidade no Supabase Auth; executável apenas por service_role.';

-- Limpar um canal continua sendo uma ação compartilhada e administrativa.
create or replace function public.clear_channel_chat(target_channel_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  target_space_id uuid;
  deleted_count integer := 0;
begin
  if target_channel_id is null then
    raise exception 'channel_required' using errcode = '22023';
  end if;
  if public.labstar_current_member_id() is null then
    raise exception 'active_member_required' using errcode = '42501';
  end if;
  if not public.can_manage_labstar_channels() then
    raise exception 'manage_channels_required' using errcode = '42501';
  end if;

  select channel.space_id
    into target_space_id
    from public.channels as channel
   where channel.id = target_channel_id;
  if target_space_id is null then
    raise exception 'channel_not_found' using errcode = 'P0002';
  end if;

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

revoke all on function public.clear_channel_chat(uuid) from public, anon;
grant execute on function public.clear_channel_chat(uuid) to authenticated;

-- Limpar DM passa a significar ocultar o histórico apenas para quem solicitou.
-- Nenhum participante pode apagar unilateralmente o histórico do outro.
create or replace function public.clear_direct_conversation(target_thread_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid;
  hidden_count integer := 0;
begin
  if target_thread_id is null then
    raise exception 'direct_thread_required' using errcode = '22023';
  end if;

  actor_id := public.labstar_current_member_id();
  if actor_id is null then
    raise exception 'active_member_required' using errcode = '42501';
  end if;
  if not exists (
    select 1
      from public.direct_thread_members as membership
     where membership.thread_id = target_thread_id
       and membership.member_id = actor_id
  ) then
    raise exception 'direct_thread_access_denied' using errcode = '42501';
  end if;

  insert into public.hidden_direct_messages (member_id, message_id)
  select actor_id, message.id
    from public.direct_messages as message
   where message.thread_id = target_thread_id
  on conflict (member_id, message_id) do nothing;
  get diagnostics hidden_count = row_count;

  return hidden_count;
end;
$$;

revoke all on function public.clear_direct_conversation(uuid) from public, anon;
grant execute on function public.clear_direct_conversation(uuid) to authenticated;

comment on function public.clear_direct_conversation(uuid) is
  'Oculta o histórico da conversa direta somente para o participante autenticado.';

-- Reinstala a função com o tipo real de members.assignments (jsonb) e mantém
-- a herança categoria -> canal como regra obrigatória para canais privados.
create or replace function public.member_can_access_labstar_channel(target_channel_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  actor public.members%rowtype;
  target public.channels%rowtype;
begin
  select * into actor
  from public.members
  where id = public.labstar_current_member_id()
    and status = 'active'
    and deleted_at is null;
  if actor.id is null then return false; end if;

  select * into target from public.channels where id = target_channel_id;
  if target.id is null then return false; end if;

  if actor.role in ('owner', 'admin')
     or public.member_has_labstar_permission('manage_channels', actor.id)
     or public.member_has_labstar_permission('manage_private_channels', actor.id) then
    return true;
  end if;

  if coalesce(target.inherit_category_access, true)
     and target.category_id is not null
     and not public.member_can_access_labstar_category(target.category_id) then
    return false;
  end if;

  if not coalesce(target.is_private, false)
     and cardinality(coalesce(target.allowed_roles, '{}'::text[])) = 0
     and cardinality(coalesce(target.allowed_assignments, '{}'::text[])) = 0
     and cardinality(coalesce(target.allowed_job_roles, '{}'::uuid[])) = 0
     and cardinality(coalesce(target.allowed_member_ids, '{}'::uuid[])) = 0 then
    return true;
  end if;

  if actor.role = any(coalesce(target.allowed_roles, '{}'::text[])) then return true; end if;
  if actor.id = any(coalesce(target.allowed_member_ids, '{}'::uuid[])) then return true; end if;
  if exists (
    select 1 from public.member_job_roles as assignment
    where assignment.member_id = actor.id
      and assignment.job_role_id = any(coalesce(target.allowed_job_roles, '{}'::uuid[]))
  ) then return true; end if;
  if exists (
    select 1
      from jsonb_array_elements_text(
        case
          when jsonb_typeof(actor.assignments) = 'array' then actor.assignments
          else '[]'::jsonb
        end
      ) as assignment(value)
     where assignment.value = any(coalesce(target.allowed_assignments, '{}'::text[]))
  ) then return true; end if;

  return false;
end;
$$;

revoke all on function public.member_can_access_labstar_channel(uuid) from public, anon;
grant execute on function public.member_can_access_labstar_channel(uuid) to authenticated;

-- CSO = Chief Scientific Officer / Diretora Científica. O carmesim é de
-- identidade do cargo e deliberadamente difere do vermelho destrutivo da UI.
update public.job_roles
   set department = 'Diretoria Científica',
       color = '#8B1E3F'
 where lower(trim(name)) = 'cso';

notify pgrst, 'reload schema';
commit;
