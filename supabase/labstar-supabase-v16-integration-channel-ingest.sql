-- Labstar v16 — entrada real de eventos externos para canais.
-- Seguro para executar novamente. Não remove regras, mensagens ou integrações existentes.

begin;

alter table public.integration_rules
  add column if not exists webhook_token uuid not null default gen_random_uuid(),
  add column if not exists last_event_at timestamptz,
  add column if not exists delivered_count bigint not null default 0;

create unique index if not exists integration_rules_webhook_token_idx
  on public.integration_rules(webhook_token);

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
