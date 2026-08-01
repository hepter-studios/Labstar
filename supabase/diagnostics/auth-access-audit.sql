-- Labstar — auditoria consolidada e somente de leitura para autenticação e membros.
-- Execute no SQL Editor do Supabase antes da migração v9.
-- Este script não cria, altera nem remove dados.
-- Ele retorna UM único relatório para o Supabase não esconder resultados anteriores.

with member_auth as (
  select
    lower(trim(member.email)) as email,
    member.id as member_id,
    member.name as member_name,
    member.status as member_status,
    member.role as member_role,
    member.created_at as member_created_at,
    member.last_seen_at,
    auth_user.id as auth_user_id,
    auth_user.email_confirmed_at,
    auth_user.last_sign_in_at,
    case
      when auth_user.id is null then 'membro_sem_usuario_auth'
      when auth_user.email_confirmed_at is null then 'email_auth_nao_confirmado'
      when member.status = 'suspended' then 'membro_suspenso'
      when member.status = 'pending' then 'membro_pendente'
      when member.status = 'active' then 'membro_ativo_pronto_para_vincular'
      else 'estado_de_membro_desconhecido'
    end as diagnostico
  from public.members member
  left join auth.users auth_user
    on lower(trim(auth_user.email)) = lower(trim(member.email))
),
auth_without_member as (
  select
    lower(trim(auth_user.email)) as email,
    auth_user.id as auth_user_id,
    auth_user.email_confirmed_at,
    auth_user.last_sign_in_at,
    auth_user.created_at as auth_created_at
  from auth.users auth_user
  left join public.members member
    on lower(trim(member.email)) = lower(trim(auth_user.email))
  where member.id is null
),
member_duplicates as (
  select
    lower(trim(email)) as email,
    count(*) as quantidade,
    array_agg(id order by created_at) as ids
  from public.members
  group by lower(trim(email))
  having count(*) > 1
),
auth_duplicates as (
  select
    lower(trim(email)) as email,
    count(*) as quantidade,
    array_agg(id order by created_at) as ids
  from auth.users
  where email is not null
  group by lower(trim(email))
  having count(*) > 1
)
select
  'membro'::text as tipo,
  member_auth.email,
  member_auth.member_id::text,
  member_auth.auth_user_id::text,
  member_auth.member_name,
  member_auth.member_status,
  member_auth.member_role,
  (member_auth.email_confirmed_at is not null) as email_confirmado,
  member_auth.last_sign_in_at,
  member_auth.diagnostico,
  jsonb_build_object(
    'member_created_at', member_auth.member_created_at,
    'last_seen_at', member_auth.last_seen_at
  ) as detalhes
from member_auth

union all

select
  'auth_sem_membro'::text as tipo,
  auth_without_member.email,
  null::text as member_id,
  auth_without_member.auth_user_id::text,
  null::text as member_name,
  null::text as member_status,
  null::text as member_role,
  (auth_without_member.email_confirmed_at is not null) as email_confirmado,
  auth_without_member.last_sign_in_at,
  'usuario_auth_sem_cadastro_em_members'::text as diagnostico,
  jsonb_build_object('auth_created_at', auth_without_member.auth_created_at) as detalhes
from auth_without_member

union all

select
  'email_duplicado_em_members'::text as tipo,
  member_duplicates.email,
  null::text as member_id,
  null::text as auth_user_id,
  null::text as member_name,
  null::text as member_status,
  null::text as member_role,
  null::boolean as email_confirmado,
  null::timestamptz as last_sign_in_at,
  'corrigir_antes_da_migracao'::text as diagnostico,
  jsonb_build_object('quantidade', member_duplicates.quantidade, 'ids', member_duplicates.ids) as detalhes
from member_duplicates

union all

select
  'email_duplicado_em_auth'::text as tipo,
  auth_duplicates.email,
  null::text as member_id,
  null::text as auth_user_id,
  null::text as member_name,
  null::text as member_status,
  null::text as member_role,
  null::boolean as email_confirmado,
  null::timestamptz as last_sign_in_at,
  'corrigir_antes_da_migracao'::text as diagnostico,
  jsonb_build_object('quantidade', auth_duplicates.quantidade, 'ids', auth_duplicates.ids) as detalhes
from auth_duplicates

order by tipo, email;
