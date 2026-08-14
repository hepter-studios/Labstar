-- Labstar v9 compatibility — preserva estruturas antigas incompatíveis.
-- Este arquivo nunca apaga dados. Ele apenas renomeia tabelas legadas para
-- liberar os nomes usados pela implementação atual de mensagens diretas.

begin;

do $compatibility$
declare
  legacy_messages_name text;
  legacy_attachments_name text;
begin
  if to_regclass('public.direct_message_attachments') is not null
     and (
       not exists (
         select 1
         from information_schema.columns
         where table_schema = 'public'
           and table_name = 'direct_message_attachments'
           and column_name = 'message_id'
       )
       or not exists (
         select 1
         from information_schema.columns
         where table_schema = 'public'
           and table_name = 'direct_message_attachments'
           and column_name = 'file_path'
       )
     ) then
    legacy_attachments_name := case
      when to_regclass('public.direct_message_attachments_legacy_pre_v9') is null
        then 'direct_message_attachments_legacy_pre_v9'
      else 'direct_message_attachments_legacy_pre_v9_' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS')
    end;

    execute format(
      'alter table public.direct_message_attachments rename to %I',
      legacy_attachments_name
    );
    execute format('alter table public.%I enable row level security', legacy_attachments_name);
    execute format('revoke all on table public.%I from anon, authenticated', legacy_attachments_name);
    raise notice 'Tabela antiga de anexos preservada como public.%', legacy_attachments_name;
  end if;

  if to_regclass('public.direct_messages') is not null
     and not exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'direct_messages'
         and column_name = 'thread_id'
     ) then
    legacy_messages_name := case
      when to_regclass('public.direct_messages_legacy_pre_v9') is null
        then 'direct_messages_legacy_pre_v9'
      else 'direct_messages_legacy_pre_v9_' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS')
    end;

    execute format(
      'alter table public.direct_messages rename to %I',
      legacy_messages_name
    );
    execute format('alter table public.%I enable row level security', legacy_messages_name);
    execute format('revoke all on table public.%I from anon, authenticated', legacy_messages_name);
    raise notice 'Tabela antiga de mensagens preservada como public.%', legacy_messages_name;
  end if;
end;
$compatibility$;

commit;

select 'Compatibilidade v9 concluída sem perda de dados.' as resultado;
