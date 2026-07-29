-- Labstar v8 — correção das políticas da Central de Integrações.
-- Seguro para executar novamente. Não remove tabelas nem apaga dados.

begin;

-- Confirma explicitamente as funções de autorização usadas pelo esquema Labstar.
-- CREATE OR REPLACE preserva as políticas e permissões já existentes.
create or replace function public.current_member_is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.members
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and status = 'active'
  );
$$;

revoke all on function public.current_member_is_active() from public;
grant execute on function public.current_member_is_active() to authenticated;

create table if not exists public.integration_rules (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.collaboration_spaces(id) on delete cascade,
  provider text not null check (provider in ('github','discord','monitoring','billing','support')),
  name text not null,
  endpoint text not null default '',
  channel_id uuid references public.channels(id) on delete set null,
  events text[] not null default '{}',
  enabled boolean not null default true,
  renewal_date date,
  created_by uuid references public.members(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists integration_rules_space_idx
  on public.integration_rules(space_id);
create index if not exists integration_rules_renewal_idx
  on public.integration_rules(renewal_date) where enabled;

alter table public.integration_rules enable row level security;

drop policy if exists "integration_rules_read" on public.integration_rules;
create policy "integration_rules_read"
on public.integration_rules
for select
to authenticated
using (public.current_member_is_active());

drop policy if exists "integration_rules_manage" on public.integration_rules;
create policy "integration_rules_manage"
on public.integration_rules
for all
to authenticated
using (public.current_member_has_permission('manage_channels'))
with check (public.current_member_has_permission('manage_channels'));

grant select, insert, update, delete
on public.integration_rules
to authenticated;

do $$
begin
  alter publication supabase_realtime
    add table public.integration_rules;
exception
  when duplicate_object then null;
end
$$;

commit;

select 'Labstar v8 corrigida e instalada com sucesso.' as resultado;
