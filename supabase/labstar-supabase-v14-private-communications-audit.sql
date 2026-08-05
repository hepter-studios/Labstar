-- Labstar v14 — auditoria detalhada das comunicações privadas.
-- Não altera dados. Lista exatamente qualquer garantia que falhar.

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
  ('authenticated.function.current_member_id', coalesce(has_function_privilege('authenticated', 'public.current_member_id()', 'EXECUTE'), false)),
  ('authenticated.function.is_direct_thread_member', coalesce(has_function_privilege('authenticated', 'public.is_direct_thread_member(uuid)', 'EXECUTE'), false)),
  ('authenticated.function.get_or_create_direct_thread', coalesce(has_function_privilege('authenticated', 'public.get_or_create_direct_thread(uuid)', 'EXECUTE'), false)),
  ('authenticated.function.list_direct_threads', coalesce(has_function_privilege('authenticated', 'public.list_direct_threads()', 'EXECUTE'), false)),
  ('authenticated.function.mark_direct_thread_read', coalesce(has_function_privilege('authenticated', 'public.mark_direct_thread_read(uuid)', 'EXECUTE'), false)),
  ('authenticated.function.is_direct_call_participant', coalesce(has_function_privilege('authenticated', 'public.is_direct_call_participant(uuid)', 'EXECUTE'), false)),
  ('authenticated.function.create_direct_call', coalesce(has_function_privilege('authenticated', 'public.create_direct_call(uuid,uuid,text)', 'EXECUTE'), false)),
  ('authenticated.function.set_direct_call_status', coalesce(has_function_privilege('authenticated', 'public.set_direct_call_status(uuid,text)', 'EXECUTE'), false)),
  ('authenticated.function.send_direct_call_signal', coalesce(has_function_privilege('authenticated', 'public.send_direct_call_signal(uuid,uuid,text,jsonb)', 'EXECUTE'), false));

insert into private_communications_audit values
  ('anon.function.current_member_id.denied', not coalesce(has_function_privilege('anon', 'public.current_member_id()', 'EXECUTE'), false)),
  ('anon.function.get_or_create_direct_thread.denied', not coalesce(has_function_privilege('anon', 'public.get_or_create_direct_thread(uuid)', 'EXECUTE'), false)),
  ('anon.function.create_direct_call.denied', not coalesce(has_function_privilege('anon', 'public.create_direct_call(uuid,uuid,text)', 'EXECUTE'), false)),
  ('anon.function.set_direct_call_status.denied', not coalesce(has_function_privilege('anon', 'public.set_direct_call_status(uuid,text)', 'EXECUTE'), false)),
  ('anon.function.send_direct_call_signal.denied', not coalesce(has_function_privilege('anon', 'public.send_direct_call_signal(uuid,uuid,text,jsonb)', 'EXECUTE'), false));

insert into private_communications_audit values
  ('authenticated.direct_threads.select', coalesce(has_table_privilege('authenticated', 'public.direct_threads', 'SELECT'), false)),
  ('authenticated.direct_thread_members.select', coalesce(has_table_privilege('authenticated', 'public.direct_thread_members', 'SELECT'), false)),
  ('authenticated.direct_messages.select', coalesce(has_table_privilege('authenticated', 'public.direct_messages', 'SELECT'), false)),
  ('authenticated.direct_messages.insert', coalesce(has_table_privilege('authenticated', 'public.direct_messages', 'INSERT'), false)),
  ('authenticated.direct_messages.update', coalesce(has_table_privilege('authenticated', 'public.direct_messages', 'UPDATE'), false)),
  ('authenticated.direct_messages.delete', coalesce(has_table_privilege('authenticated', 'public.direct_messages', 'DELETE'), false)),
  ('authenticated.direct_message_attachments.select', coalesce(has_table_privilege('authenticated', 'public.direct_message_attachments', 'SELECT'), false)),
  ('authenticated.direct_message_attachments.insert', coalesce(has_table_privilege('authenticated', 'public.direct_message_attachments', 'INSERT'), false)),
  ('authenticated.direct_message_attachments.delete', coalesce(has_table_privilege('authenticated', 'public.direct_message_attachments', 'DELETE'), false)),
  ('authenticated.direct_call_sessions.select', coalesce(has_table_privilege('authenticated', 'public.direct_call_sessions', 'SELECT'), false)),
  ('authenticated.direct_call_sessions.insert.denied', not coalesce(has_table_privilege('authenticated', 'public.direct_call_sessions', 'INSERT'), false)),
  ('authenticated.direct_call_sessions.update.denied', not coalesce(has_table_privilege('authenticated', 'public.direct_call_sessions', 'UPDATE'), false)),
  ('authenticated.direct_call_sessions.delete.denied', not coalesce(has_table_privilege('authenticated', 'public.direct_call_sessions', 'DELETE'), false)),
  ('authenticated.direct_call_signals.select', coalesce(has_table_privilege('authenticated', 'public.direct_call_signals', 'SELECT'), false)),
  ('authenticated.direct_call_signals.insert.denied', not coalesce(has_table_privilege('authenticated', 'public.direct_call_signals', 'INSERT'), false)),
  ('authenticated.direct_call_signals.update.denied', not coalesce(has_table_privilege('authenticated', 'public.direct_call_signals', 'UPDATE'), false)),
  ('authenticated.direct_call_signals.delete.denied', not coalesce(has_table_privilege('authenticated', 'public.direct_call_signals', 'DELETE'), false));

insert into private_communications_audit values
  ('anon.direct_threads.denied', not coalesce(has_table_privilege('anon', 'public.direct_threads', 'SELECT'), false)),
  ('anon.direct_thread_members.denied', not coalesce(has_table_privilege('anon', 'public.direct_thread_members', 'SELECT'), false)),
  ('anon.direct_messages.denied', not coalesce(has_table_privilege('anon', 'public.direct_messages', 'SELECT'), false)),
  ('anon.direct_message_attachments.denied', not coalesce(has_table_privilege('anon', 'public.direct_message_attachments', 'SELECT'), false)),
  ('anon.direct_call_sessions.denied', not coalesce(has_table_privilege('anon', 'public.direct_call_sessions', 'SELECT'), false)),
  ('anon.direct_call_signals.denied', not coalesce(has_table_privilege('anon', 'public.direct_call_signals', 'SELECT'), false));

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

-- Valida cada política pelo par tabela/nome. Isso evita que políticas da tabela
-- legada preservada alterem a contagem da auditoria.
insert into private_communications_audit values
  ('policies.private_tables.complete', not exists (
    select 1
    from (values
      ('direct_threads', 'direct_threads_read'),
      ('direct_thread_members', 'direct_thread_members_read'),
      ('direct_messages', 'direct_messages_read'),
      ('direct_messages', 'direct_messages_insert'),
      ('direct_messages', 'direct_messages_update'),
      ('direct_messages', 'direct_messages_delete'),
      ('direct_message_attachments', 'direct_attachments_read'),
      ('direct_message_attachments', 'direct_attachments_insert'),
      ('direct_message_attachments', 'direct_attachments_delete'),
      ('direct_call_sessions', 'direct_call_sessions_read'),
      ('direct_call_signals', 'direct_call_signals_read')
    ) as expected(tablename, policyname)
    where not exists (
      select 1
      from pg_policies actual
      where actual.schemaname = 'public'
        and actual.tablename = expected.tablename
        and actual.policyname = expected.policyname
    )
  ));

insert into private_communications_audit values
  ('policies.storage.complete', not exists (
    select 1
    from (values
      ('labstar_direct_files_read'),
      ('labstar_direct_files_insert'),
      ('labstar_direct_files_delete')
    ) as expected(policyname)
    where not exists (
      select 1
      from pg_policies actual
      where actual.schemaname = 'storage'
        and actual.tablename = 'objects'
        and actual.policyname = expected.policyname
    )
  ));

insert into private_communications_audit values
  ('realtime.private_tables.published', not exists (
    select 1
    from (values
      ('direct_messages'),
      ('direct_message_attachments'),
      ('direct_call_sessions'),
      ('direct_call_signals')
    ) as expected(tablename)
    where not exists (
      select 1
      from pg_publication_tables actual
      where actual.pubname = 'supabase_realtime'
        and actual.schemaname = 'public'
        and actual.tablename = expected.tablename
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
        or coalesce(has_table_privilege('anon', format('%I.%I', n.nspname, c.relname), 'SELECT'), false)
        or coalesce(has_table_privilege('authenticated', format('%I.%I', n.nspname, c.relname), 'SELECT'), false)
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
