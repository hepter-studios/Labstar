-- Labstar v14 — normalização de privilégios das comunicações privadas.
-- Idempotente e sem exclusão de dados.

begin;

alter table public.direct_threads enable row level security;
alter table public.direct_thread_members enable row level security;
alter table public.direct_messages enable row level security;
alter table public.direct_message_attachments enable row level security;
alter table public.direct_call_sessions enable row level security;
alter table public.direct_call_signals enable row level security;

revoke all privileges on table public.direct_threads from public, anon, authenticated;
revoke all privileges on table public.direct_thread_members from public, anon, authenticated;
revoke all privileges on table public.direct_messages from public, anon, authenticated;
revoke all privileges on table public.direct_message_attachments from public, anon, authenticated;
revoke all privileges on table public.direct_call_sessions from public, anon, authenticated;
revoke all privileges on table public.direct_call_signals from public, anon, authenticated;

grant select on table public.direct_threads to authenticated;
grant select on table public.direct_thread_members to authenticated;
grant select, insert, update, delete on table public.direct_messages to authenticated;
grant select, insert, delete on table public.direct_message_attachments to authenticated;
grant select on table public.direct_call_sessions to authenticated;
grant select on table public.direct_call_signals to authenticated;

revoke all on function public.current_member_id() from public, anon, authenticated;
revoke all on function public.is_direct_thread_member(uuid) from public, anon, authenticated;
revoke all on function public.get_or_create_direct_thread(uuid) from public, anon, authenticated;
revoke all on function public.list_direct_threads() from public, anon, authenticated;
revoke all on function public.mark_direct_thread_read(uuid) from public, anon, authenticated;
revoke all on function public.is_direct_call_participant(uuid) from public, anon, authenticated;
revoke all on function public.create_direct_call(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.set_direct_call_status(uuid, text) from public, anon, authenticated;
revoke all on function public.send_direct_call_signal(uuid, uuid, text, jsonb) from public, anon, authenticated;

grant execute on function public.current_member_id() to authenticated;
grant execute on function public.is_direct_thread_member(uuid) to authenticated;
grant execute on function public.get_or_create_direct_thread(uuid) to authenticated;
grant execute on function public.list_direct_threads() to authenticated;
grant execute on function public.mark_direct_thread_read(uuid) to authenticated;
grant execute on function public.is_direct_call_participant(uuid) to authenticated;
grant execute on function public.create_direct_call(uuid, uuid, text) to authenticated;
grant execute on function public.set_direct_call_status(uuid, text) to authenticated;
grant execute on function public.send_direct_call_signal(uuid, uuid, text, jsonb) to authenticated;

-- Qualquer estrutura legada preservada permanece inacessível ao cliente.
do $legacy_lockdown$
declare
  legacy_table record;
begin
  for legacy_table in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and (
        c.relname like 'direct_messages_legacy_pre_v9%'
        or c.relname like 'direct_message_attachments_legacy_pre_v9%'
      )
  loop
    execute format(
      'alter table %I.%I enable row level security',
      legacy_table.schema_name,
      legacy_table.table_name
    );
    execute format(
      'revoke all privileges on table %I.%I from public, anon, authenticated',
      legacy_table.schema_name,
      legacy_table.table_name
    );
  end loop;
end;
$legacy_lockdown$;

commit;

select 'Labstar v14 instalada: privilégios privados normalizados.' as resultado;
