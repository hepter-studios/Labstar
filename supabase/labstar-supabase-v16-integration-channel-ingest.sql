-- Labstar v16 — entrada real de eventos externos para canais.
-- Seguro para executar novamente. Não remove regras, mensagens ou integrações existentes.

begin;

alter table public.integration_rules
  add column if not exists webhook_token uuid not null default gen_random_uuid(),
  add column if not exists last_event_at timestamptz,
  add column if not exists delivered_count bigint not null default 0;

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

create or replace function public.sync_integration_delivery_stats()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_rule uuid := coalesce(new.rule_id, old.rule_id);
begin
  update public.integration_rules
  set delivered_count = (
        select count(*)
        from public.integration_event_receipts receipt
        where receipt.rule_id = target_rule
      ),
      last_event_at = case when tg_op = 'INSERT' then now() else last_event_at end,
      updated_at = now()
  where id = target_rule;
  return coalesce(new, old);
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

-- O contador é derivado dos recibos. Uma atualização externa nunca pode reduzi-lo.
create or replace function public.keep_integration_delivery_count_monotonic()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.delivered_count < old.delivered_count then
    new.delivered_count := old.delivered_count;
  end if;
  return new;
end;
$$;

drop trigger if exists integration_delivery_count_guard on public.integration_rules;
create trigger integration_delivery_count_guard
before update of delivered_count on public.integration_rules
for each row execute function public.keep_integration_delivery_count_monotonic();

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
  if not public.current_member_has_permission('manage_channels') then
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
