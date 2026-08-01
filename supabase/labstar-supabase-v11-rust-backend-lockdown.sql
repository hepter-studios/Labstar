-- Labstar v11 — bloqueia o acesso direto do frontend aos convites.
-- Execute SOMENTE depois de:
-- 1. labstar-supabase-v9-auth.sql
-- 2. labstar-supabase-v10-invite-links.sql
-- 3. labstar-supabase-v10-auth-hardening.sql
--
-- A partir desta versão, criação, inspeção, aceite, listagem e revogação
-- de convites são responsabilidade exclusiva da API Rust.

begin;

-- O backend conecta ao PostgreSQL por uma credencial privada e executa
-- transações diretamente. O trigger antigo dependia de auth.uid(), que
-- existe nas chamadas do PostgREST, mas não numa conexão PostgreSQL do
-- servidor. A autorização equivalente e mais completa agora está no Rust:
-- somente owner/admin gerenciam convites e somente owner concede admin.
drop trigger if exists member_invites_role_delegation on public.member_invites;

-- Nenhum navegador ou aplicativo cliente recebe acesso direto à tabela.
revoke all on table public.member_invites from anon;
revoke all on table public.member_invites from authenticated;

alter table public.member_invites enable row level security;
alter table public.member_invites force row level security;

-- Remove políticas antigas de cliente. A conexão privada do backend usa a
-- função proprietária do PostgreSQL e não depende destas políticas.
drop policy if exists member_invites_select_admin on public.member_invites;
drop policy if exists member_invites_insert_admin on public.member_invites;
drop policy if exists member_invites_update_admin on public.member_invites;
drop policy if exists member_invites_delete_admin on public.member_invites;
drop policy if exists member_invites_select_own on public.member_invites;
drop policy if exists member_invites_insert_owner_admin on public.member_invites;
drop policy if exists member_invites_update_owner_admin on public.member_invites;
drop policy if exists member_invites_delete_owner_admin on public.member_invites;

-- As RPCs antigas não ficam acessíveis ao frontend depois da migração.
do $$
begin
  if to_regprocedure('public.create_member_invite_link(text,text,text,text,text,text,integer)') is not null then
    execute 'revoke all on function public.create_member_invite_link(text,text,text,text,text,text,integer) from public, anon, authenticated';
  end if;

  if to_regprocedure('public.accept_member_invite(text)') is not null then
    execute 'revoke all on function public.accept_member_invite(text) from public, anon, authenticated';
  end if;

  if to_regprocedure('public.inspect_member_invite(text)') is not null then
    execute 'revoke all on function public.inspect_member_invite(text) from public, anon, authenticated';
  end if;

  if to_regprocedure('public.claim_my_membership()') is not null then
    execute 'revoke all on function public.claim_my_membership() from public, anon, authenticated';
  end if;
end
$$;

-- Garante os vínculos estáveis exigidos pela API Rust.
create unique index if not exists members_auth_user_id_unique
  on public.members(auth_user_id)
  where auth_user_id is not null;

create unique index if not exists members_email_normalized_unique
  on public.members(lower(trim(email)));

create unique index if not exists member_invites_token_hash_unique
  on public.member_invites(token_hash)
  where token_hash is not null;

commit;

select 'Labstar v11: convites controlados exclusivamente pelo backend Rust.' as status;
