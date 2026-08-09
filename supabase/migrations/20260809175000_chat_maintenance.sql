-- Labstar — manutenção segura de histórico de chat.
-- Canais: apenas quem possui manage_channels pode limpar o histórico compartilhado.
-- Mensagens diretas: qualquer participante pode limpar a conversa inteira, para ambos.

begin;

create or replace function public.clear_channel_chat(target_channel_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deleted_count integer := 0;
begin
  if target_channel_id is null then
    raise exception 'channel_required';
  end if;

  if not public.current_member_is_active() then
    raise exception 'active_member_required';
  end if;

  if not public.current_member_has_permission('manage_channels') then
    raise exception 'manage_channels_required';
  end if;

  if not exists (select 1 from public.channels where id = target_channel_id) then
    raise exception 'channel_not_found';
  end if;

  delete from public.channel_messages
  where channel_id = target_channel_id;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.clear_channel_chat(uuid) from public;
grant execute on function public.clear_channel_chat(uuid) to authenticated;

create or replace function public.clear_direct_conversation(target_thread_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deleted_count integer := 0;
begin
  if target_thread_id is null then
    raise exception 'direct_thread_required';
  end if;

  if not public.is_direct_thread_member(target_thread_id) then
    raise exception 'direct_thread_access_denied';
  end if;

  delete from public.direct_messages
  where thread_id = target_thread_id;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.clear_direct_conversation(uuid) from public;
grant execute on function public.clear_direct_conversation(uuid) to authenticated;

commit;
