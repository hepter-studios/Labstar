-- A operação continua atômica e revalida manage_roles, mas também respeita
-- diretamente as políticas RLS de member_job_roles como o usuário chamador.

begin;

alter function public.set_member_job_roles(uuid, uuid[]) security invoker;

commit;
