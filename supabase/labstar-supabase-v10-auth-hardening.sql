-- Labstar v10 — endurecimento final da autenticação.
-- Execute imediatamente depois de labstar-supabase-v10-invite-links.sql.
--
-- Objetivo:
-- - membros antigos já cadastrados continuam sendo recuperados pelo e-mail verificado;
-- - convites novos NUNCA são aceitos somente pelo e-mail;
-- - todo convite novo exige o token de uso único em accept_member_invite().

begin;

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

  -- Conta já vinculada: reconhece somente pelo UUID estável.
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

  -- Compatibilidade exclusivamente para registros que já existiam antes da v9.
  -- Uma linha em members precisa existir previamente e ainda não pode estar
  -- vinculada a outro usuário. Nenhuma linha de member_invites é consultada aqui.
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
  end if;
end;
$$;

revoke all on function public.claim_my_membership() from public;
grant execute on function public.claim_my_membership() to authenticated;

commit;

select 'Labstar v10 endurecida: convites novos exigem token de uso único.' as status;
