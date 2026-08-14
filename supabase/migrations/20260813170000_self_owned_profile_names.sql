-- Labstar — nomes de perfil pertencem à própria conta.
--
-- Regras:
-- - account_profiles.display_name é a fonte global do nome escolhido;
-- - o cadastro legado members continua sincronizado para mensagens e diretórios;
-- - administradores gerenciam acesso e trabalho, mas não nome, bio ou avatar;
-- - operações internas sem sessão de usuário continuam disponíveis ao backend.

begin;

insert into public.account_profiles (auth_user_id, display_name)
select member.auth_user_id, left(trim(member.name), 100)
from public.members member
where member.auth_user_id is not null
  and char_length(trim(member.name)) >= 2
on conflict (auth_user_id)
do update set
  display_name = case
    when char_length(trim(public.account_profiles.display_name)) < 2
      then excluded.display_name
    else public.account_profiles.display_name
  end,
  updated_at = case
    when char_length(trim(public.account_profiles.display_name)) < 2
      then now()
    else public.account_profiles.updated_at
  end;

create or replace function public.update_own_display_name(new_display_name text)
returns text
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  caller_auth_id uuid := auth.uid();
  caller_member_id uuid;
  clean_name text := trim(coalesce(new_display_name, ''));
begin
  if caller_auth_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if char_length(clean_name) < 2 or char_length(clean_name) > 100 then
    raise exception 'invalid_profile_name' using errcode = '22023';
  end if;

  insert into public.account_profiles (auth_user_id, display_name)
  values (caller_auth_id, clean_name)
  on conflict (auth_user_id)
  do update set
    display_name = excluded.display_name,
    updated_at = now();

  caller_member_id := public.current_member_id();
  if caller_member_id is not null then
    update public.members
    set name = clean_name,
        last_seen_at = now()
    where id = caller_member_id;
  end if;

  return clean_name;
end;
$$;

revoke all on function public.update_own_display_name(text) from public, anon;
grant execute on function public.update_own_display_name(text) to authenticated;

create or replace function public.protect_member_owned_profile_fields()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_temp
as $$
declare
  caller_member_id uuid;
begin
  -- Chamadas internas do backend não carregam auth.uid(). As chamadas feitas por
  -- uma sessão autenticada só podem mudar campos pessoais da própria pessoa.
  if auth.uid() is null then
    return new;
  end if;

  caller_member_id := public.current_member_id();
  if caller_member_id is distinct from old.id
     and (
       new.name is distinct from old.name
       or new.bio is distinct from old.bio
       or new.avatar_path is distinct from old.avatar_path
     ) then
    raise exception 'member_profile_self_managed' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_member_owned_profile_fields() from public, anon, authenticated;

drop trigger if exists protect_member_owned_profile_fields on public.members;
create trigger protect_member_owned_profile_fields
before update of name, bio, avatar_path on public.members
for each row
execute function public.protect_member_owned_profile_fields();

create or replace function public.list_organization_accounts(target_organization_id uuid)
returns table (
  auth_user_id uuid,
  email text,
  display_name text,
  role text,
  joined_at timestamptz,
  is_current_user boolean
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  caller_role text;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;

  caller_role := public.current_account_organization_role(target_organization_id);
  if caller_role not in ('owner', 'admin') then
    raise exception 'permission_denied';
  end if;

  return query
  select
    account.auth_user_id,
    lower(coalesce(auth_user.email, ''))::text,
    coalesce(
      nullif(trim(profile.display_name), ''),
      nullif(trim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(auth_user.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(auth_user.email, ''), '@', 1), ''),
      'Membro Labstar'
    )::text,
    account.role,
    account.joined_at,
    account.auth_user_id = auth.uid()
  from public.organization_accounts account
  left join auth.users auth_user on auth_user.id = account.auth_user_id
  left join public.account_profiles profile on profile.auth_user_id = account.auth_user_id
  where account.organization_id = target_organization_id
  order by
    case account.role
      when 'owner' then 1
      when 'admin' then 2
      when 'manager' then 3
      when 'member' then 4
      else 5
    end,
    lower(coalesce(auth_user.email, '')),
    account.joined_at;
end;
$$;

revoke all on function public.list_organization_accounts(uuid) from public, anon;
grant execute on function public.list_organization_accounts(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
