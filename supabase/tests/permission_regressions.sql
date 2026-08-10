begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(20);

select ok(
  to_regprocedure('public.delete_labstar_account(text,text)') is null,
  'a RPC de exclusão administrativa antiga não existe'
);
select ok(
  to_regprocedure('public.finalize_labstar_account_deletion(uuid,text)') is not null,
  'a finalização server-side existe'
);
select ok(
  not has_function_privilege('authenticated', 'public.finalize_labstar_account_deletion(uuid,text)', 'EXECUTE'),
  'authenticated não executa a finalização administrativa'
);
select ok(
  not has_function_privilege('anon', 'public.finalize_labstar_account_deletion(uuid,text)', 'EXECUTE'),
  'anon não executa a finalização administrativa'
);
select ok(
  has_function_privilege('service_role', 'public.finalize_labstar_account_deletion(uuid,text)', 'EXECUTE'),
  'somente o serviço administrativo pode finalizar a exclusão'
);
select ok(
  lower(pg_get_functiondef('public.finalize_labstar_account_deletion(uuid,text)'::regprocedure)) like '%assignments = ''[]''::jsonb%',
  'a finalização limpa assignments usando o tipo jsonb real'
);

select ok((select relrowsecurity from pg_class where oid = 'public.channels'::regclass), 'RLS está ativa em canais');
select ok((select relrowsecurity from pg_class where oid = 'public.channel_messages'::regclass), 'RLS está ativa em mensagens de canal');
select ok((select relrowsecurity from pg_class where oid = 'public.hidden_direct_messages'::regclass), 'RLS está ativa nas ocultações de DM');

select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'channels' and policyname = 'channels_read_authorized'),
  'canais possuem política de leitura autorizada'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'channel_messages' and policyname = 'channel_messages_insert_authorized'),
  'mensagens possuem política de escrita autorizada'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hidden_direct_messages' and policyname = 'hidden_direct_own_insert'),
  'ocultação de DM só aceita o próprio membro'
);

select is(
  (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'members' and column_name = 'assignments'),
  'jsonb',
  'members.assignments preserva o contrato jsonb publicado'
);
select ok(
  lower(pg_get_functiondef('public.member_can_access_labstar_channel(uuid)'::regprocedure)) like '%jsonb_array_elements_text%actor.assignments%',
  'acesso a canais normaliza assignments jsonb com segurança'
);
select ok(
  lower(pg_get_functiondef('public.member_can_access_labstar_channel(uuid)'::regprocedure)) like '%member_can_access_labstar_category(target.category_id)%',
  'acesso ao canal herda a restrição da categoria'
);

select ok(
  lower(pg_get_functiondef('public.clear_direct_conversation(uuid)'::regprocedure)) not like '%delete from public.direct_messages%',
  'limpar DM não apaga o histórico compartilhado'
);
select ok(
  lower(pg_get_functiondef('public.clear_direct_conversation(uuid)'::regprocedure)) like '%insert into public.hidden_direct_messages%',
  'limpar DM oculta mensagens para o participante atual'
);
select ok(
  has_function_privilege('authenticated', 'public.clear_channel_chat(uuid)', 'EXECUTE'),
  'authenticated pode chamar a rotina que revalida permissão de canal'
);

select is(
  (select department from public.job_roles where lower(trim(name)) = 'cso' limit 1),
  'Diretoria Científica',
  'CSO significa Diretoria Científica'
);
select is(
  upper((select color from public.job_roles where lower(trim(name)) = 'cso' limit 1)),
  '#8B1E3F',
  'CSO usa carmesim profundo distinto da cor destrutiva'
);

select * from finish();
rollback;
