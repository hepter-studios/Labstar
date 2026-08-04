-- Labstar v12 — restaura convites seguros diretamente pelo Supabase.
--
-- Motivo: a API externa da Fly.io deixou de ser uma dependência confiável para
-- um aplicativo interno que precisa continuar no plano gratuito. As tabelas
-- permanecem bloqueadas para o navegador; somente funções SECURITY DEFINER,
-- com autorização baseada em auth.uid(), ficam acessíveis.
--
-- Esta migração é idempotente e deve ser executada com ON_ERROR_STOP=1.

begin;

-- Falha antes de alterar permissões caso a fundação de convites não esteja
-- instalada. Assim não existe migração parcialmente aplicada.
do $$
begin
  if to_regprocedure('public.create_member_invite_link(text,text,text,text,text,text,integer)') is null
    or to_regprocedure('public.inspect_member_invite(text)') is null
    or to_regprocedure('public.accept_member_invite(text)') is null
    or to_regprocedure('public.list_member_invites()') is null
    or to_regprocedure('public.revoke_member_invite(uuid)') is null
  then
    raise exception 'labstar_invite_foundation_missing';
  end if;
end
$$;

-- A tabela continua inacessível diretamente. Toda operação passa pelas funções
-- auditáveis abaixo e pelas verificações de membro ativo, owner/admin e token.
revoke all on table public.member_invites from public, anon, authenticated;
alter table public.member_invites enable row level security;
alter table public.member_invites force row level security;

-- Fachada específica para clientes. Ela preserva a criação atômica já existente
-- e recoloca a regra que a API Rust aplicava: somente owner pode conceder admin.
create or replace function public.create_member_invite_link_client(
  invitation_kind text default 'quick',
  invited_email text default null,
  invited_name text default '',
  invited_role text default 'member',
  invited_job_title text default '',
  invited_area text default '',
  valid_for_hours integer default 48
)
returns table (
  invite_id uuid,
  invite_token text,
  invite_path text,
  kind text,
  email text,
  expires_at timestamptz,
  approval_required boolean
)
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if not public.current_member_can_manage() then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if lower(trim(coalesce(invited_role, ''))) = 'admin'
    and coalesce(public.current_member_role(), '') <> 'owner'
  then
    raise exception 'only_owner_can_grant_admin' using errcode = '42501';
  end if;

  return query
  select
    created.invite_id,
    created.invite_token,
    created.invite_path,
    created.kind,
    created.email,
    created.expires_at,
    created.approval_required
  from public.create_member_invite_link(
    invitation_kind,
    invited_email,
    invited_name,
    invited_role,
    invited_job_title,
    invited_area,
    valid_for_hours
  ) as created;
end;
$$;

-- A função interna de criação continua fechada; somente a fachada com a regra
-- adicional de delegação administrativa fica exposta ao usuário autenticado.
revoke all on function public.create_member_invite_link(text, text, text, text, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.create_member_invite_link_client(text, text, text, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.create_member_invite_link_client(text, text, text, text, text, text, integer)
  to authenticated;

-- Inspeção revela apenas validade, estado e dica mascarada do e-mail.
revoke all on function public.inspect_member_invite(text) from public, anon, authenticated;
grant execute on function public.inspect_member_invite(text) to anon, authenticated;

-- Aceite, listagem e revogação continuam protegidos pelas próprias funções e
-- recebem auth.uid()/JWT da sessão Supabase atual.
revoke all on function public.accept_member_invite(text) from public, anon, authenticated;
revoke all on function public.list_member_invites() from public, anon, authenticated;
revoke all on function public.revoke_member_invite(uuid) from public, anon, authenticated;
grant execute on function public.accept_member_invite(text) to authenticated;
grant execute on function public.list_member_invites() to authenticated;
grant execute on function public.revoke_member_invite(uuid) to authenticated;

commit;

select 'Labstar v12: convites seguros recuperados sem dependência da Fly.io.' as status;
