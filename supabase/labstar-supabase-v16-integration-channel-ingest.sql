-- Labstar v16 — entrada real de eventos externos para canais.
-- Seguro para executar novamente. Não remove regras, mensagens ou integrações existentes.

begin;

alter table public.integration_rules
  add column if not exists webhook_token uuid not null default gen_random_uuid(),
  add column if not exists last_event_at timestamptz,
  add column if not exists delivered_count bigint not null default 0;

-- integration_rules foi criada originalmente usando auth.uid() como autor padrão.
-- No Labstar, members.id é resolvido pelo e-mail/sessão e não precisa ser o mesmo
-- UUID do Supabase Auth. Usar current_member_id() mantém a FK íntegra.
alter table public.integration_rules
  alter column created_by set default public.current_member_id();

-- Owner/admin sempre podem configurar os canais de integração. Os demais membros
-- continuam seguindo a permissão granular manage_channels.
drop policy if exists "integration_rules_manage" on public.integration_rules;
create policy "integration_rules_manage"
on public.integration_rules
for all
to authenticated
using (
  public.current_member_role() in ('owner', 'admin')
  or public.current_member_has_permission('manage_channels')
)
with check (
  public.current_member_role() in ('owner', 'admin')
  or public.current_member_has_permission('manage_channels')
);

grant select, insert, update, delete on public.integration_rules to authenticated;

create unique index if not exists integration_rules_webhook_token_idx
  on public.integration_rules(webhook_token);

create table if not exists public.integration_event_receipts (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.integration_rules(id) on delete cascade,
  event_key text not null,
  created_at timestamptz not null default now(),
  unique(rule_id, event_key)
);

alter table public.integration_event_receipts enable row level security;
revoke all on table public.integration_event_receipts from public, anon, authenticated;
grant select, insert, delete on table public.integration_event_receipts to service_role;

-- delivered_count nunca confia no JSON recebido: ele sempre é recalculado
-- pelos recibos efetivamente aceitos para a regra.
create or replace function public.enforce_integration_delivery_count()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  select count(*)
  into new.delivered_count
  from public.integration_event_receipts receipt
  where receipt.rule_id = new.id;
  return new;
end;
$$;

revoke all on function public.enforce_integration_delivery_count() from public, anon, authenticated;

drop trigger if exists integration_delivery_count_guard on public.integration_rules;
create trigger integration_delivery_count_guard
before update of delivered_count on public.integration_rules
for each row execute function public.enforce_integration_delivery_count();

create or replace function public.sync_integration_delivery_stats()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_rule uuid;
begin
  if tg_op = 'DELETE' then
    target_rule := old.rule_id;
  else
    target_rule := new.rule_id;
  end if;

  update public.integration_rules
  set delivered_count = (
        select count(*)
        from public.integration_event_receipts receipt
        where receipt.rule_id = target_rule
      ),
      last_event_at = case when tg_op = 'INSERT' then now() else last_event_at end,
      updated_at = now()
  where id = target_rule;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_integration_delivery_stats() from public, anon, authenticated;

drop trigger if exists integration_event_receipt_stats_insert on public.integration_event_receipts;
create trigger integration_event_receipt_stats_insert
after insert on public.integration_event_receipts
for each row execute function public.sync_integration_delivery_stats();

drop trigger if exists integration_event_receipt_stats_delete on public.integration_event_receipts;
create trigger integration_event_receipt_stats_delete
after delete on public.integration_event_receipts
for each row execute function public.sync_integration_delivery_stats();

-- Autor técnico para mensagens geradas por integrações. Mantemos suspenso para
-- não aparecer como pessoa disponível, mas a FK de channel_messages continua íntegra.
insert into public.members (
  email,
  name,
  status,
  role,
  job_title,
  area
) values (
  'integrations@system.labstar',
  'Labstar Integrations',
  'suspended',
  'viewer',
  'Automação',
  'Sistema'
)
on conflict ((lower(email))) do update set
  name = excluded.name,
  status = 'suspended',
  role = 'viewer',
  job_title = 'Automação',
  area = 'Sistema';

-- A v15 tratava members.assignments como text[], mas a coluna real é jsonb.
-- Recriamos o gatilho antigo aqui para que qualquer mensagem em canal restrito
-- use a comparação correta entre o array JSON do membro e allowed_assignments.
create or replace function public.notify_channel_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  author_name text;
  channel_row public.channels%rowtype;
  replied_author uuid;
  recipient record;
  is_everyone boolean;
  is_announcement boolean;
  mentioned boolean;
  event_name text;
begin
  select * into channel_row from public.channels where id = new.channel_id;
  select name into author_name from public.members where id = new.author_id;
  if new.reply_to is not null then
    select author_id into replied_author from public.channel_messages where id = new.reply_to;
  end if;

  is_everyone := lower(coalesce(new.body, '')) ~ '@(todos|all|everyone)(\s|$|[,.!:;])';
  is_announcement := channel_row.type in ('announcement', 'rules');

  for recipient in
    select member.id, member.name
    from public.members member
    where member.status = 'active'
      and member.id <> new.author_id
      and (
        cardinality(coalesce(channel_row.allowed_roles, '{}'::text[])) = 0
        or member.role = any(channel_row.allowed_roles)
      )
      and (
        cardinality(coalesce(channel_row.allowed_assignments, '{}'::text[])) = 0
        or exists (
          select 1
          from jsonb_array_elements_text(
            case
              when jsonb_typeof(coalesce(member.assignments, '[]'::jsonb)) = 'array'
                then coalesce(member.assignments, '[]'::jsonb)
              else '[]'::jsonb
            end
          ) as assignment(value)
          where assignment.value = any(coalesce(channel_row.allowed_assignments, '{}'::text[]))
        )
      )
  loop
    mentioned := lower(coalesce(new.body, '')) like '%@' || lower(recipient.name) || '%';
    if is_announcement or is_everyone or mentioned or recipient.id = replied_author then
      event_name := case
        when recipient.id = replied_author then 'channel_reply'
        when is_announcement then 'announcement'
        else 'channel_mention'
      end;
      perform public.push_labstar_notification(
        recipient.id,
        case
          when recipient.id = replied_author then coalesce(author_name, 'Alguém') || ' respondeu você'
          when is_announcement then 'Novo aviso em #' || coalesce(channel_row.name, 'canal')
          else coalesce(author_name, 'Alguém') || ' mencionou você'
        end,
        left(coalesce(nullif(trim(new.body), ''), 'Nova atualização no canal.'), 260),
        new.channel_id,
        event_name,
        new.id
      );
    end if;
  end loop;
  return new;
end;
$$;

-- O trigger já existe desde a v15; recriá-lo deixa explícito que usa a função corrigida.
drop trigger if exists channel_message_notification on public.channel_messages;
create trigger channel_message_notification
after insert on public.channel_messages
for each row execute function public.notify_channel_message_insert();

-- Mensagens automáticas em canais comuns também devem aparecer na Central de
-- notificações. Canais announcement/rules já são cobertos pelo gatilho acima e
-- são ignorados aqui para evitar notificação duplicada.
create or replace function public.notify_integration_channel_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  integration_author uuid;
  channel_row public.channels%rowtype;
  recipient record;
begin
  select id
  into integration_author
  from public.members
  where lower(email) = 'integrations@system.labstar'
  limit 1;

  if integration_author is null or new.author_id is distinct from integration_author then
    return new;
  end if;

  select * into channel_row from public.channels where id = new.channel_id;
  if channel_row.id is null or channel_row.type in ('announcement', 'rules') then
    return new;
  end if;

  for recipient in
    select member.id
    from public.members member
    where member.status = 'active'
      and (
        cardinality(coalesce(channel_row.allowed_roles, '{}'::text[])) = 0
        or member.role = any(channel_row.allowed_roles)
      )
      and (
        cardinality(coalesce(channel_row.allowed_assignments, '{}'::text[])) = 0
        or exists (
          select 1
          from jsonb_array_elements_text(
            case
              when jsonb_typeof(coalesce(member.assignments, '[]'::jsonb)) = 'array'
                then coalesce(member.assignments, '[]'::jsonb)
              else '[]'::jsonb
            end
          ) as assignment(value)
          where assignment.value = any(coalesce(channel_row.allowed_assignments, '{}'::text[]))
        )
      )
  loop
    perform public.push_labstar_notification(
      recipient.id,
      'Novo aviso em #' || coalesce(channel_row.name, 'canal'),
      left(coalesce(nullif(trim(new.body), ''), 'Nova atualização de integração.'), 260),
      new.channel_id,
      'integration_event',
      new.id
    );
  end loop;

  return new;
end;
$$;

revoke all on function public.notify_integration_channel_message_insert() from public, anon, authenticated;

drop trigger if exists integration_channel_message_notification on public.channel_messages;
create trigger integration_channel_message_notification
after insert on public.channel_messages
for each row execute function public.notify_integration_channel_message_insert();

-- O token pode ser rotacionado somente por quem já pode gerenciar canais.
create or replace function public.rotate_integration_webhook_token(target_rule_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  next_token uuid := gen_random_uuid();
begin
  if public.current_member_role() not in ('owner', 'admin')
     and not public.current_member_has_permission('manage_channels') then
    raise exception 'manage_channels_required';
  end if;

  update public.integration_rules
  set webhook_token = next_token,
      updated_at = now()
  where id = target_rule_id;

  if not found then
    raise exception 'integration_rule_not_found';
  end if;

  return next_token;
end;
$$;

revoke all on function public.rotate_integration_webhook_token(uuid) from public, anon;
grant execute on function public.rotate_integration_webhook_token(uuid) to authenticated;

commit;

select 'Labstar v16 instalada: webhooks de integrações podem entregar avisos aos canais.' as status;
