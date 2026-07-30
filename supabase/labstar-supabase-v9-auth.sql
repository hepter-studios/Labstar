-- Labstar v9 — identidade estável, convites auditáveis e recuperação de membros existentes.
--
-- IMPORTANTE:
-- 1. Revise e faça backup antes de executar em produção.
-- 2. Este arquivo não é executado automaticamente pelo GitHub ou Cloudflare.
-- 3. Publique o frontend compatível na mesma janela de mudança.
-- 4. Nenhuma chave secreta deve ser inserida neste arquivo ou no frontend.

begin;

create extension if not exists pgcrypto;

-- O membro deixa de depender apenas do texto do e-mail e passa a ser vinculado
-- ao usuário autenticado do Supabase. O campo é inicialmente opcional para
-- preservar todos os membros já existentes.
alter table public.members
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create unique index if not exists members_auth_user_id_unique_idx
  on public.members (auth_user_id)
  where auth_user_id is not null;

create unique index if not exists members_email_normalized_unique_idx
  on public.members (lower(trim(email)));

-- Vincula automaticamente contas Auth já existentes a membros legados com o
-- mesmo e-mail. Contas sem correspondência permanecem sem acesso.
update public.members member
set auth_user_id = auth_user.id
from auth.users auth_user
where member.auth_user_id is null
  and auth_user.email is not null
  and lower(trim(member.email)) = lower(trim(auth_user.email));

create table if not exists public.member_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  normalized_email text generated always as (lower(trim(email))) stored,
  name text not null default '',
  role text not null default 'member'
    check (role in ('admin', 'manager', 'member', 'viewer')),
  job_title text not null default '',
  area text not null default '',
  assignments jsonb not null default '[]'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid references public.members(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  constraint member_invites_email_not_blank
    check (char_length(trim(email)) between 3 and 320)
);

create index if not exists member_invites_email_status_idx
  on public.member_invites (normalized_email, status, expires_at desc);

create unique index if not exists member_invites_one_pending_per_email_idx
  on public.member_invites (normalized_email)
  where status = 'pending';

alter table public.member_invites enable row level security;

-- Identidade principal para RLS. O fallback por e-mail existe apenas para a
-- transição dos membros legados; após o primeiro acesso, claim_my_membership()
-- grava auth_user_id e as políticas passam a usar o UUID estável.
create or replace function public.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select member.id
  from public.members member
  where member.auth_user_id = (select auth.uid())
     or (
       member.auth_user_id is null
       and lower(trim(member.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
     )
  order by (member.auth_user_id = (select auth.uid())) desc
  limit 1;
$$;

create or replace function public.current_member_is_active()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.members member
    where member.id = public.current_member_id()
      and member.status = 'active'
  );
$$;

create or replace function public.current_member_can_manage()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.members member
    where member.id = public.current_member_id()
      and member.status = 'active'
      and member.role in ('owner', 'admin')
  );
$$;

create or replace function public.current_member_role()
returns text
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select member.role
  from public.members member
  where member.id = public.current_member_id()
  limit 1;
$$;

revoke all on function public.current_member_id() from public;
revoke all on function public.current_member_is_active() from public;
revoke all on function public.current_member_can_manage() from public;
revoke all on function public.current_member_role() from public;
grant execute on function public.current_member_id() to authenticated;
grant execute on function public.current_member_is_active() to authenticated;
grant execute on function public.current_member_can_manage() to authenticated;
grant execute on function public.current_member_role() to authenticated;

-- Um administrador registra o convite no banco. O envio do e-mail será feito
-- por uma Edge Function protegida, nunca pelo navegador com chave secreta.
create or replace function public.create_member_invite(
  invited_email text,
  invited_name text default '',
  invited_role text default 'member',
  invited_job_title text default '',
  invited_area text default '',
  invited_assignments jsonb default '[]'::jsonb,
  valid_for_hours integer default 168
)
returns public.member_invites
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  result public.member_invites;
  normalized text;
begin
  if not public.current_member_can_manage() then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  normalized := lower(trim(invited_email));
  if normalized = '' or position('@' in normalized) < 2 then
    raise exception 'invalid_email' using errcode = '22023';
  end if;

  if invited_role not in ('admin', 'manager', 'member', 'viewer') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  -- Convites vencidos deixam de ocupar a restrição de convite pendente.
  update public.member_invites
  set status = 'expired'
  where status = 'pending'
    and expires_at <= now();

  insert into public.member_invites (
    email,
    name,
    role,
    job_title,
    area,
    assignments,
    status,
    invited_by,
    expires_at
  ) values (
    normalized,
    left(trim(coalesce(invited_name, '')), 100),
    invited_role,
    left(trim(coalesce(invited_job_title, '')), 120),
    left(trim(coalesce(invited_area, '')), 120),
    coalesce(invited_assignments, '[]'::jsonb),
    'pending',
    public.current_member_id(),
    now() + make_interval(hours => greatest(1, least(valid_for_hours, 720)))
  )
  on conflict (normalized_email) where status = 'pending'
  do update set
    email = excluded.email,
    name = excluded.name,
    role = excluded.role,
    job_title = excluded.job_title,
    area = excluded.area,
    assignments = excluded.assignments,
    invited_by = excluded.invited_by,
    created_at = now(),
    expires_at = excluded.expires_at,
    accepted_by = null,
    accepted_at = null,
    revoked_at = null
  returning * into result;

  return result;
end;
$$;

-- Executada após uma autenticação válida. A função consulta o e-mail confirmado
-- diretamente em auth.users, aceita um convite válido ou vincula um membro
-- legado. Usuários suspensos nunca são reativados automaticamente.
create or replace function public.claim_my_membership()
returns setof public.members
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  caller_id uuid := auth.uid();
  caller_email text;
  existing_member public.members;
  matching_invite public.member_invites;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select lower(trim(auth_user.email))
  into caller_email
  from auth.users auth_user
  where auth_user.id = caller_id
    and auth_user.email is not null
    and auth_user.email_confirmed_at is not null;

  if caller_email is null then
    raise exception 'verified_email_required' using errcode = '28000';
  end if;

  -- Conta já vinculada: nunca depende novamente do texto do e-mail.
  select member.*
  into existing_member
  from public.members member
  where member.auth_user_id = caller_id
  limit 1;

  if found then
    update public.members
    set last_seen_at = now()
    where id = existing_member.id
    returning * into existing_member;

    return next existing_member;
    return;
  end if;

  -- Recuperação compatível com o sistema anterior, que cadastrava membros pelo
  -- e-mail antes de possuir auth_user_id.
  select member.*
  into existing_member
  from public.members member
  where member.auth_user_id is null
    and lower(trim(member.email)) = caller_email
  for update
  limit 1;

  if found then
    update public.members
    set auth_user_id = caller_id,
        email = caller_email,
        last_seen_at = now()
    where id = existing_member.id
    returning * into existing_member;

    return next existing_member;
    return;
  end if;

  update public.member_invites
  set status = 'expired'
  where status = 'pending'
    and expires_at <= now();

  select invitation.*
  into matching_invite
  from public.member_invites invitation
  where invitation.normalized_email = caller_email
    and invitation.status = 'pending'
    and invitation.expires_at > now()
  order by invitation.created_at desc
  for update
  limit 1;

  if not found then
    return;
  end if;

  insert into public.members (
    auth_user_id,
    email,
    name,
    status,
    role,
    job_title,
    area,
    assignments,
    last_seen_at
  ) values (
    caller_id,
    caller_email,
    coalesce(nullif(trim(matching_invite.name), ''), split_part(caller_email, '@', 1)),
    'active',
    matching_invite.role,
    matching_invite.job_title,
    matching_invite.area,
    matching_invite.assignments,
    now()
  )
  returning * into existing_member;

  update public.member_invites
  set status = 'accepted',
      accepted_by = caller_id,
      accepted_at = now()
  where id = matching_invite.id;

  return next existing_member;
end;
$$;

revoke all on function public.create_member_invite(text, text, text, text, text, jsonb, integer) from public;
revoke all on function public.claim_my_membership() from public;
grant execute on function public.create_member_invite(text, text, text, text, text, jsonb, integer) to authenticated;
grant execute on function public.claim_my_membership() to authenticated;

-- Membros ativos podem ver a equipe. Pendentes e suspensos conseguem ler apenas
-- sua própria linha para o aplicativo mostrar o estado correto, sem expor dados
-- da empresa.
drop policy if exists "members_read" on public.members;
drop policy if exists "members_read_active_or_self" on public.members;
create policy "members_read_active_or_self"
on public.members for select
to authenticated
using (
  public.current_member_is_active()
  or id = public.current_member_id()
);

drop policy if exists "member_invites_manage" on public.member_invites;
create policy "member_invites_manage"
on public.member_invites for all
to authenticated
using (public.current_member_can_manage())
with check (public.current_member_can_manage());

grant select, insert, update, delete on public.member_invites to authenticated;

commit;

select 'Labstar v9 preparada: identidade estável e convites auditáveis.' as status;
