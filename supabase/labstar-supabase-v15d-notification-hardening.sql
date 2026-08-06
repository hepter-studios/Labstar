-- Labstar v15d — correção complementar dos gatilhos de notificações.
-- Execute após v15 e v15b. Não altera autenticação nem remove dados.

begin;

create or replace function public.notify_job_role_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  role_name text;
  target_member uuid;
  target_role uuid;
begin
  if tg_op = 'DELETE' then
    target_member := old.member_id;
    target_role := old.job_role_id;
  else
    target_member := new.member_id;
    target_role := new.job_role_id;
  end if;

  select name into role_name
  from public.job_roles
  where id = target_role;

  perform public.push_labstar_notification(
    target_member,
    case when tg_op = 'DELETE' then 'Cargo removido' else 'Novo cargo atribuído' end,
    coalesce(role_name, 'Cargo profissional')
      || case when tg_op = 'DELETE'
        then ' foi removido do seu perfil.'
        else ' foi adicionado ao seu perfil.'
      end,
    null,
    case when tg_op = 'DELETE' then 'job_role_removed' else 'job_role_added' end,
    target_role
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

commit;

select 'Labstar v15d instalada: gatilhos de cargos validados.' as status;
