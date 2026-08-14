begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(56);

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

select ok(
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'members' and column_name = 'bio'),
  'o perfil possui bio opcional persistida'
);
select ok(
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'member_job_roles' and column_name = 'position'),
  'a atribuição de cargo possui ordem individual'
);
select is(
  (select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'member_job_roles' and column_name = 'position'),
  'NO',
  'a ordem individual nunca fica nula'
);
select ok(
  exists (select 1 from pg_constraint where conname = 'member_job_roles_member_position_unique' and conrelid = 'public.member_job_roles'::regclass),
  'um membro não pode ter dois cargos na mesma posição'
);
select ok(
  exists (select 1 from pg_constraint where conname = 'member_job_roles_primary_matches_position' and conrelid = 'public.member_job_roles'::regclass),
  'o cargo principal é obrigatoriamente a posição 1'
);
select ok(
  exists (select 1 from pg_constraint where conname = 'member_job_roles_position_positive' and conrelid = 'public.member_job_roles'::regclass),
  'a ordem individual começa em 1'
);
select ok(
  to_regprocedure('public.set_member_job_roles(uuid,uuid[])') is not null,
  'a atualização atômica da ordem dos cargos existe'
);
select ok(
  has_function_privilege('authenticated', 'public.set_member_job_roles(uuid,uuid[])', 'EXECUTE'),
  'authenticated pode chamar a rotina que revalida manage_roles'
);
select ok(
  not has_function_privilege('anon', 'public.set_member_job_roles(uuid,uuid[])', 'EXECUTE'),
  'anon não pode alterar cargos profissionais'
);
select ok(
  lower(pg_get_functiondef('public.set_member_job_roles(uuid,uuid[])'::regprocedure)) like '%can_manage_professional_roles%',
  'a rotina revalida a permissão profissional no servidor'
);
select ok(
  lower(pg_get_functiondef('public.set_member_job_roles(uuid,uuid[])'::regprocedure)) like '%pg_advisory_xact_lock%',
  'atualizações concorrentes do mesmo membro são serializadas sem elevar privilégios'
);
select ok(
  not (select prosecdef from pg_proc where oid = 'public.set_member_job_roles(uuid,uuid[])'::regprocedure),
  'a rotina atômica também respeita RLS como o usuário chamador'
);
select ok(
  to_regprocedure('public.update_own_profile(text,text,text)') is not null,
  'a atualização protegida do perfil aceita bio'
);
select ok(
  to_regprocedure('public.update_own_profile(text,text)') is null,
  'a assinatura antiga do perfil foi removida'
);
select ok(
  to_regprocedure('public.update_own_display_name(text)') is not null,
  'o nome global é atualizado somente pela própria conta'
);
select ok(
  exists (
    select 1
    from pg_trigger trigger_row
    join pg_class relation on relation.oid = trigger_row.tgrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'members'
      and trigger_row.tgname = 'protect_member_owned_profile_fields'
      and not trigger_row.tgisinternal
  ),
  'campos pessoais do membro são protegidos contra edição administrativa'
);
select ok(not has_table_privilege('anon', 'public._sqlx_migrations', 'SELECT'), 'anon não lê o histórico interno do backend Rust');
select ok(not has_table_privilege('anon', 'public._sqlx_migrations', 'INSERT'), 'anon não cria versões falsas do backend Rust');
select ok(not has_table_privilege('anon', 'public._sqlx_migrations', 'UPDATE'), 'anon não altera versões do backend Rust');
select ok(not has_table_privilege('anon', 'public._sqlx_migrations', 'DELETE'), 'anon não apaga versões do backend Rust');
select ok(not has_table_privilege('authenticated', 'public._sqlx_migrations', 'SELECT'), 'clientes autenticados não leem o histórico interno do backend Rust');
select ok(not has_table_privilege('authenticated', 'public._sqlx_migrations', 'INSERT'), 'clientes autenticados não criam versões falsas do backend Rust');
select ok(not has_table_privilege('authenticated', 'public._sqlx_migrations', 'UPDATE'), 'clientes autenticados não alteram versões do backend Rust');
select ok(not has_table_privilege('authenticated', 'public._sqlx_migrations', 'DELETE'), 'clientes autenticados não apagam versões do backend Rust');
select ok(
  lower(pg_get_functiondef('public.sync_own_achievements()'::regprocedure)) like '%(''space_veteran'', least(message_count, 1000), 1000)%',
  'a conquista veterano exige mil mensagens'
);
select ok(
  lower(pg_get_functiondef('public.sync_own_achievements()'::regprocedure)) like '%(''mission_engineer'', least(project_count, 25), 25)%',
  'a conquista engenheiro exige 25 projetos distintos'
);
select ok(
  lower(pg_get_functiondef('public.sync_own_achievements()'::regprocedure)) like '%when current.unlocked_at is not null then current.unlocked_at%',
  'conquistas já obtidas são preservadas após aumentar a dificuldade'
);
select ok(
  lower(pg_get_functiondef('public.sync_own_achievements()'::regprocedure)) like '%(''channel_explorer'', least(conversation_count, 5), 5)%',
  'explorar canais mede colaboração dentro da organização'
);
select ok(
  lower(pg_get_functiondef('public.sync_own_achievements()'::regprocedure)) like '%(''constellation_architect'', least(conversation_count, 15), 15)%',
  'arquiteto de constelações exige participação ampla dentro da organização'
);
select ok(
  lower(pg_get_functiondef('public.sync_own_achievements()'::regprocedure)) like '%on conflict on constraint member_achievements_pkey%',
  'a sincronização não confunde a coluna achievement_key com o parâmetro de saída'
);
select is(
  (select count(*)::bigint from public.member_achievements where achievement_key in ('organization_founder', 'universe_architect')),
  0::bigint,
  'missões de criar organização foram removidas do progresso persistido'
);
select ok(
  lower(pg_get_functiondef('public.sync_own_achievements()'::regprocedure)) like '%(''engineering_master'', least(project_count, 50), 50)%',
  'a 16ª conquista preserva o Flow 1 e exige cinquenta projetos distintos'
);
select ok(
  lower(pg_get_functiondef('public.sync_own_achievements()'::regprocedure)) not like '%(''welcome_aboard'', 1, 1)%',
  'entrar no Labstar não concede conquista automaticamente'
);
select ok(
  lower(pg_get_functiondef('public.sync_own_achievements()'::regprocedure)) like '%char_length(trim(coalesce(member.bio, ''''))) >= 2%or char_length(trim(coalesce(member.avatar_path, ''''))) >= 2%',
  'a conquista mais fácil exige personalizar o perfil com bio ou foto'
);
select ok(
  lower(pg_get_functiondef('public.sync_own_achievements()'::regprocedure)) like '%(''first_transmission'', least(message_count, 10), 10)%',
  'a primeira conquista de mensagens exige dez envios'
);
select ok(
  lower(pg_get_functiondef('public.sync_own_achievements()'::regprocedure)) like '%(''mission_preparation'', least(project_count, 2), 2)%',
  'a conquista substituta exige atualizar dois projetos'
);

select * from finish();
rollback;
