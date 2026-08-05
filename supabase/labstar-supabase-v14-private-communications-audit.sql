-- Labstar v14 — auditoria detalhada das comunicações privadas.
-- Falha com a lista exata das garantias que não foram satisfeitas.

begin;

create temporary table private_communications_audit (
  check_name text primary key,
  passed boolean not null
) on commit drop;

insert into private_communications_audit values
  ('table.direct_threads.exists', to_regclass('public.direct_threads') is not null),
  ('table.direct_thread_members.exists', to_regclass('public.direct_thread_members') is not null),
  ('table.direct_messages.exists', to_regclass('public.direct_messages') is not null),
  ('table.direct_message_attachments.exists', to_regclass('public.direct_message_attachments') is not null),
  ('table.direct_call_sessions.exists', to_regclass('public.direct_call_sessions') is not null),
  ('table.direct_call_signals.exists', to_regclass('public.direct_call_signals') is not null);

insert into private_communications_audit values
  ('authenticated.function.current_member_id', has_function_privilege('authenticated', 'public.current_member_id()', 'EXECUTE')),
  ('authenticated.function.is_direct_thread_member', has_function_privilege('authenticated', 'public.is_direct_thread_member(uuid)', 'EXECUTE')),
  ('authenticated.function.get_or_create_direct_thread', has_function_privilege('authenticated', 'public.get_or_create_direct_thread(uuid)', 'EXECUTE')),
  ('authenticated.function.list_direct_threads', has_function_privilege('authenticated', 'public.list_direct_threads()', 'EXECUTE')),
  ('authenticated.function.mark_direct_thread_read', has_function_privilege('authenticated', 'public.mark_direct_thread_read(uuid)', 'EXECUTE')),
  ('authenticated.function.is_direct_call_participant', has_function_privilege('authenticated', 'public.is_direct_call_participant(uuid)', 'EXECUTE')),
  ('authenticated.function.create_direct_call', has_function_privilege('authenticated', 'public.create_direct_call(uuid,uuid,text)', 'EXECUTE')),
  ('authenticated.function.set_direct_call_status', has_function_privilege('authenticated', 'public.set_direct_call_status(uuid,text)', 'EXECUTE')),
  ('authenticated.function.send_direct_call_signal', has_function_privilege('authenticated', 'public.send_direct_call_signal(uuid,uuid,text,jsonb)', 'EXECUTE'));

insert into private_communications_audit values
  ('anon.function.current_member_id.denied', not has_function_privilege('anon', 'public.current_member_id()', 'EXECUTE')),
  ('anon.function.get_or_create_direct_thread.denied', not has_function_privilege('anon', 'public.get_or_create_direct_thread(uuid)', 'EXECUTE')),
  ('anon.function.create_direct_call.denied', not has_function_privilege('anon', 'public.create_direct_call(uuid,uuid,text)', 'EXECUTE')),
  ('anon.function.set_direct_call_status.denied', not has_function_privilege('anon', 'public.set_direct_call_status(uuid,text)', 'EXECUTE')),
  ('anon.function.send_direct_call_signal.denied', not has_function_privilege('anon', 'public.send_direct_call_signal(uuid,uuid,text,jsonb)', 'EXECUTE'));

insert into private_communications_audit values
  ('authenticated.direct_threads.select', has_table_privilege('authenticated', 'public.direct_threads', 'SELECT')),
  ('authenticated.direct_thread_members.select', has_table_privilege('authenticated', 'public.direct_thread_members', 'SELECT')),
  ('authenticated.direct_messages.select', has_table_privilege('authenticated', 'public.direct_messages', 'SELECT')),
  ('authenticated.direct_messages.insert', has_table_privilege('authenticated', 'public.direct_messages', 'INSERT')),
  ('authenticated.direct_messages.update', has_table_privilege('authenticated', 'public.direct_messages', 'UPDATE')),
  ('authenticated.direct_messages.delete', has_table_privilege('authenticated', 'public.direct_messages', 'DELETE')),
  ('authenticated.direct_message_attachments.select', has_table_privilege('authenticated', 'public.direct_message_attachments', 'SELECT')),
  ('authenticated.direct_message_attachments.insert', has_table_privilege('authenticated', 'public.direct_message_attachments', 'INSERT')),
  ('authenticated.direct_message_attachments.delete', has_table_privilege('authenticated', 'public.direct_message_attachments', 'DELETE')),
  ('authenticated.direct_call_sessions.select', has_table_privilege('authenticated', 'public.direct_call_sessions', 'SELECT')),
  ('authenticated.direct_call_sessions.insert.denied', not has_table_privilege('authenticated', 'public.direct_call_sessions', 'INSERT')),
  ('authenticated.direct_call_sessions.update.denied', not has_table_privilege('authenticated', 'public.direct_call_sessions', 'UPDATE')),
  ('authenticated.direct_call_sessions.delete.denied', not has_table_privilege('authenticated', 'public.direct_call_sessions', 'DELETE')),
  ('authenticated.direct_call_signals.select', has_table_privilege('authenticated', 'public.direct_call_signals', 'SELECT')),
  ('authenticated.direct_call_signals.insert.denied', not has_table_privilege('authenticated', 'public.direct_call_signals', 'INSERT')),
  ('authenticated.direct_call_signals.update.denied', not has_table_privilege('authenticated', 'public.direct_call_signals', 'UPDATE')),
  ('authenticated.direct_call_signals.delete.denied', not has_table_privilege('authenticated', 'public.direct_call_signals', 'DELETE'));

insert into private_communications_audit values
  ('anon.direct_threads.denied', not has_table_privilege('anon', 'public.direct_threads', 'SELECT')),
  ('anon.direct_thread_members.denied', not has_table_privilege('anon', 'public.direct_thread_members', 'SELECT')),
  ('anon.direct_messages.denied', not has_table_privilege('anon', 'public.direct_messages', 'SELECT')),
  ('anon.direct_message_attachments.denied', not has_table_privilege('anon', 'public.direct_message_attachments', 'SELECT')),
  ('anon.direct_call_sessions.denied', not has_table_privilege('anon', 'public.direct_call_sessions', 'SELECT')),
  ('anon.direct_call_signals.denied', not has_table_privilege('anon', 'public.direct_call_signals', 'SELECT'));

insert into private_communications_audit values
  ('rls.all_private_tables', coalesce((
    select count(*) = 6 and bool_and(c.relrowsecurity)
    from pg_class c
    where c.oid in (
      'public.direct_threads'::regclass,
      'public.direct_thread_members'::regclass,
      'public.direct_messages'::regclass,
      'public.direct_message_attachments'::regclass,
      'public.direct_call_sessions'::regclass,
      'public.direct_call_signals'::regclass
    )
  ), false));

insert into private_communications_audit values
  ('policies.private_tables.complete', (
    select count(*) = 12
    from pg_policies
    where schemaname = 'public'
      and policyname in (
        'direct_threads_read',
        'direct_thread_members_read',
        'direct_messages_read',
        'direct_messages_insert',
        'direct_messages_update',
        'direct_messages_delete',
        'direct_attachments_read',
        'direct_attachments_insert',
        'direct_attachments_delete',
        'direct_call_sessions_read',
        'direct_call_signals_read',
        'direct_call_signals_read'
      )
  ));

-- A contagem acima usa nomes únicos; esta verificação explícita evita falso positivo.
update private_communications_audit
set passed = (
  select count(*) = 11
  from pg_policies
  where schemaname = 'public'
    and policyname in (
      'direct_threads_read',
      'direct_thread_members_read',
      'direct_messages_read',
      'direct_messages_insert',
      'direct_messages_update',
      'direct_messages_delete',
      'direct_attachments_read',
      'direct_attachments_insert',
      'direct_attachments_delete',
      'direct_call_sessions_read',
      'direct_call_signals_read'
    )
)
where check_name = 'policies.private_tables.complete';

insert into private_communications_audit values
  ('policies.storage.complete', (
    select count(*) = 3
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'labstar_direct_files_read',
        'labstar_direct_files_insert',
        'labstar_direct_files_delete'
      )
  ));

insert into private_communications_audit values
  ('realtime.private_tables.published', (
    select count(*) = 4
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename in (
        'direct_messages',
        'direct_message_attachments',
        'direct_call_sessions',
        'direct_call_signals'
      )
  ));

insert into private_communications_audit values
  ('legacy.tables.locked', not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and (
        c.relname like 'direct_messages_legacy_pre_v9%'
        or c.relname like 'direct_message_attachments_legacy_pre_v9%'
      )
      and (
        not c.relrowsecurity
        or has_table_privilege('anon', format('%I.%I', n.nspname, c.relname), 'SELECT')
        or has_table_privilege('authenticated', format('%I.%I', n.nspname, c.relname), 'SELECT')
      )
  ));

select
  case when passed then 'OK' else 'FAIL' end as status,
  check_name
from private_communications_audit
order by passed, check_name;

do $audit$
declare
  failed_checks text;
begin
  select string_agg(check_name, ', ' order by check_name)
  into failed_checks
  from private_communications_audit
  where not passed;

  if failed_checks is not null then
    raise exception 'private_communications_audit_failed: %', failed_checks;
  end if;
end;
$audit$;

commit;

select 'Auditoria das comunicações privadas aprovada.' as resultado;
