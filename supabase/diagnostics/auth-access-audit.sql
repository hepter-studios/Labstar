-- Labstar — auditoria somente de leitura para autenticação e membros.
-- Execute no SQL Editor do Supabase antes da migração v9.
-- Este script não altera nem remove dados.

-- 1. Resumo dos estados atuais.
select
  status,
  count(*) as quantidade
from public.members
group by status
order by status;

-- 2. Membros cadastrados e correspondência com Supabase Auth.
select
  member.id as member_id,
  lower(trim(member.email)) as member_email,
  member.name,
  member.status,
  member.role,
  member.created_at,
  member.last_seen_at,
  auth_user.id as auth_user_id,
  auth_user.email_confirmed_at,
  auth_user.last_sign_in_at,
  case
    when auth_user.id is null then 'sem_usuario_auth'
    when auth_user.email_confirmed_at is null then 'email_nao_confirmado'
    when member.status = 'suspended' then 'suspenso'
    when member.status = 'pending' then 'pendente'
    when member.status = 'active' then 'pronto_para_vincular'
    else 'estado_desconhecido'
  end as diagnostico
from public.members member
left join auth.users auth_user
  on lower(trim(auth_user.email)) = lower(trim(member.email))
order by member.created_at;

-- 3. Usuários Auth que não possuem membro. Eles podem ter sido criados porque
-- o login anterior usava shouldCreateUser=true mesmo para não convidados.
select
  auth_user.id as auth_user_id,
  lower(trim(auth_user.email)) as auth_email,
  auth_user.email_confirmed_at,
  auth_user.created_at,
  auth_user.last_sign_in_at
from auth.users auth_user
left join public.members member
  on lower(trim(member.email)) = lower(trim(auth_user.email))
where member.id is null
order by auth_user.created_at;

-- 4. Detecta e-mails que se tornariam duplicados após normalizar espaços e caixa.
select
  lower(trim(email)) as email_normalizado,
  count(*) as quantidade,
  array_agg(id order by created_at) as member_ids
from public.members
group by lower(trim(email))
having count(*) > 1;

-- 5. Detecta mais de um usuário Auth para o mesmo e-mail normalizado.
select
  lower(trim(email)) as email_normalizado,
  count(*) as quantidade,
  array_agg(id order by created_at) as auth_user_ids
from auth.users
where email is not null
group by lower(trim(email))
having count(*) > 1;
