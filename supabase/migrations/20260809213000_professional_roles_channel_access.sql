-- Labstar — cargos profissionais, canais privados e exclusão local de mensagens.
-- A regra principal é simples: o cliente mostra a experiência, mas o banco decide
-- quem pode ver, publicar, administrar e atribuir cargos.

begin;

alter table public.members add column if not exists auth_user_id uuid;
alter table public.members add column if not exists deleted_at timestamptz;

alter table public.channels add column if not exists is_private boolean not null default false;
alter table public.channels add column if not exists read_only boolean not null default false;
alter table public.channels add column if not exists allowed_job_roles uuid[] not null default '{}'::uuid[];
alter table public.channels add column if not exists allowed_member_ids uuid[] not null default '{}'::uuid[];

update public.channels
set is_private = true
where not is_private
  and (
    cardinality(coalesce(allowed_roles, '{}'::text[])) > 0
    or cardinality(coalesce(allowed_assignments, '{}'::text[])) > 0
  );

create index if not exists channels_allowed_job_roles_gin
  on public.channels using gin (allowed_job_roles);
create index if not exists channels_allowed_member_ids_gin
  on public.channels using gin (allowed_member_ids);

create or replace function public.labstar_current_member_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select member.id
  from public.members as member
  where member.status = 'active'
    and member.deleted_at is null
    and (
      member.auth_user_id = auth.uid()
      or (
        member.auth_user_id is null
        and lower(member.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
    )
  order by (member.auth_user_id = auth.uid()) desc
  limit 1;
$$;

create or replace function public.member_has_labstar_permission(permission_name text, target_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.member_job_roles as assignment
    join public.job_roles as role on role.id = assignment.job_role_id
    where assignment.member_id = target_member_id
      and permission_name = any(coalesce(role.permissions, '{}'::text[]))
  );
$$;

create or replace function public.can_manage_professional_roles()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with actor as (
    select member.id, member.role
    from public.members as member
    where member.id = public.labstar_current_member_id()
    limit 1
  )
  select exists (
    select 1
    from actor
    where actor.role in ('owner', 'admin')
      or public.member_has_labstar_permission('manage_roles', actor.id)
      or public.member_has_labstar_permission('manage_members', actor.id)
  );
$$;

create or replace function public.can_create_labstar_channels()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with actor as (
    select member.id, member.role
    from public.members as member
    where member.id = public.labstar_current_member_id()
    limit 1
  )
  select exists (
    select 1
    from actor
    where actor.role in ('owner', 'admin')
      or public.member_has_labstar_permission('create_channels', actor.id)
      or public.member_has_labstar_permission('manage_channels', actor.id)
  );
$$;

create or replace function public.can_manage_labstar_channels()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with actor as (
    select member.id, member.role
    from public.members as member
    where member.id = public.labstar_current_member_id()
    limit 1
  )
  select exists (
    select 1
    from actor
    where actor.role in ('owner', 'admin')
      or public.member_has_labstar_permission('manage_channels', actor.id)
      or public.member_has_labstar_permission('manage_private_channels', actor.id)
  );
$$;

create or replace function public.can_moderate_labstar_content()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with actor as (
    select member.id, member.role
    from public.members as member
    where member.id = public.labstar_current_member_id()
    limit 1
  )
  select exists (
    select 1
    from actor
    where actor.role in ('owner', 'admin')
      or public.member_has_labstar_permission('manage_channels', actor.id)
      or public.member_has_labstar_permission('moderate_content', actor.id)
  );
$$;

create or replace function public.member_can_access_labstar_channel(target_channel_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  actor public.members%rowtype;
  target public.channels%rowtype;
begin
  select * into actor
  from public.members
  where id = public.labstar_current_member_id()
    and status = 'active'
    and deleted_at is null;

  if actor.id is null then
    return false;
  end if;

  select * into target
  from public.channels
  where id = target_channel_id;

  if target.id is null then
    return false;
  end if;

  if actor.role in ('owner', 'admin')
    or public.member_has_labstar_permission('manage_channels', actor.id)
    or public.member_has_labstar_permission('manage_private_channels', actor.id) then
    return true;
  end if;

  if not coalesce(target.is_private, false)
    and cardinality(coalesce(target.allowed_roles, '{}'::text[])) = 0
    and cardinality(coalesce(target.allowed_assignments, '{}'::text[])) = 0
    and cardinality(coalesce(target.allowed_job_roles, '{}'::uuid[])) = 0
    and cardinality(coalesce(target.allowed_member_ids, '{}'::uuid[])) = 0 then
    return true;
  end if;

  if actor.role = any(coalesce(target.allowed_roles, '{}'::text[])) then
    return true;
  end if;

  if actor.id = any(coalesce(target.allowed_member_ids, '{}'::uuid[])) then
    return true;
  end if;

  if exists (
    select 1
    from public.member_job_roles as assignment
    where assignment.member_id = actor.id
      and assignment.job_role_id = any(coalesce(target.allowed_job_roles, '{}'::uuid[]))
  ) then
    return true;
  end if;

  if exists (
    select 1
    from unnest(coalesce(actor.assignments, '{}'::text[])) as assignment(value)
    where assignment.value = any(coalesce(target.allowed_assignments, '{}'::text[]))
  ) then
    return true;
  end if;

  return false;
end;
$$;

create or replace function public.member_can_post_labstar_channel(target_channel_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  actor public.members%rowtype;
  target public.channels%rowtype;
begin
  if not public.member_can_access_labstar_channel(target_channel_id) then
    return false;
  end if;

  select * into actor
  from public.members
  where id = public.labstar_current_member_id();

  select * into target
  from public.channels
  where id = target_channel_id;

  if actor.id is null or target.id is null then
    return false;
  end if;

  if public.can_moderate_labstar_content() then
    return true;
  end if;

  if actor.role = 'viewer' then
    return false;
  end if;

  if coalesce(target.read_only, false) then
    return false;
  end if;

  return target.type = 'text';
end;
$$;

revoke all on function public.labstar_current_member_id() from public, anon;
revoke all on function public.member_has_labstar_permission(text, uuid) from public, anon;
revoke all on function public.can_manage_professional_roles() from public, anon;
revoke all on function public.can_create_labstar_channels() from public, anon;
revoke all on function public.can_manage_labstar_channels() from public, anon;
revoke all on function public.can_moderate_labstar_content() from public, anon;
revoke all on function public.member_can_access_labstar_channel(uuid) from public, anon;
revoke all on function public.member_can_post_labstar_channel(uuid) from public, anon;

grant execute on function public.labstar_current_member_id() to authenticated;
grant execute on function public.member_has_labstar_permission(text, uuid) to authenticated;
grant execute on function public.can_manage_professional_roles() to authenticated;
grant execute on function public.can_create_labstar_channels() to authenticated;
grant execute on function public.can_manage_labstar_channels() to authenticated;
grant execute on function public.can_moderate_labstar_content() to authenticated;
grant execute on function public.member_can_access_labstar_channel(uuid) to authenticated;
grant execute on function public.member_can_post_labstar_channel(uuid) to authenticated;

-- Cargos profissionais podem ser lidos pela equipe para badges e perfis, mas
-- somente liderança autorizada pode criar/editar/atribuir.
alter table public.job_roles enable row level security;
alter table public.member_job_roles enable row level security;

do $$
declare policy_row record;
begin
  for policy_row in select policyname from pg_policies where schemaname = 'public' and tablename = 'job_roles'
  loop execute format('drop policy if exists %I on public.job_roles', policy_row.policyname); end loop;
  for policy_row in select policyname from pg_policies where schemaname = 'public' and tablename = 'member_job_roles'
  loop execute format('drop policy if exists %I on public.member_job_roles', policy_row.policyname); end loop;
end $$;

create policy "job_roles_read_active"
on public.job_roles for select to authenticated
using (public.labstar_current_member_id() is not null);

create policy "job_roles_insert_leadership"
on public.job_roles for insert to authenticated
with check (public.can_manage_professional_roles());

create policy "job_roles_update_leadership"
on public.job_roles for update to authenticated
using (public.can_manage_professional_roles())
with check (public.can_manage_professional_roles());

create policy "job_roles_delete_leadership"
on public.job_roles for delete to authenticated
using (public.can_manage_professional_roles());

create policy "member_job_roles_read_active"
on public.member_job_roles for select to authenticated
using (public.labstar_current_member_id() is not null);

create policy "member_job_roles_insert_leadership"
on public.member_job_roles for insert to authenticated
with check (public.can_manage_professional_roles());

create policy "member_job_roles_update_leadership"
on public.member_job_roles for update to authenticated
using (public.can_manage_professional_roles())
with check (public.can_manage_professional_roles());

create policy "member_job_roles_delete_leadership"
on public.member_job_roles for delete to authenticated
using (public.can_manage_professional_roles());

grant select, insert, update, delete on public.job_roles to authenticated;
grant select, insert, update, delete on public.member_job_roles to authenticated;

-- Canais: as políticas anteriores eram permissivas para a experiência antiga.
-- Substituímos todas por uma única fonte de verdade que também esconde canais
-- privados da própria consulta do cliente.
alter table public.channels enable row level security;
alter table public.channel_messages enable row level security;
alter table public.channel_message_attachments enable row level security;

do $$
declare policy_row record;
begin
  for policy_row in select policyname from pg_policies where schemaname = 'public' and tablename = 'channels'
  loop execute format('drop policy if exists %I on public.channels', policy_row.policyname); end loop;
  for policy_row in select policyname from pg_policies where schemaname = 'public' and tablename = 'channel_messages'
  loop execute format('drop policy if exists %I on public.channel_messages', policy_row.policyname); end loop;
  for policy_row in select policyname from pg_policies where schemaname = 'public' and tablename = 'channel_message_attachments'
  loop execute format('drop policy if exists %I on public.channel_message_attachments', policy_row.policyname); end loop;
end $$;

create policy "channels_read_authorized"
on public.channels for select to authenticated
using (public.member_can_access_labstar_channel(id));

create policy "channels_create_authorized"
on public.channels for insert to authenticated
with check (public.can_create_labstar_channels());

create policy "channels_update_authorized"
on public.channels for update to authenticated
using (public.can_manage_labstar_channels())
with check (public.can_manage_labstar_channels());

create policy "channels_delete_authorized"
on public.channels for delete to authenticated
using (public.can_manage_labstar_channels());

create policy "channel_messages_read_authorized"
on public.channel_messages for select to authenticated
using (public.member_can_access_labstar_channel(channel_id));

create policy "channel_messages_insert_authorized"
on public.channel_messages for insert to authenticated
with check (
  author_id = public.labstar_current_member_id()
  and public.member_can_post_labstar_channel(channel_id)
);

create policy "channel_messages_update_authorized"
on public.channel_messages for update to authenticated
using (
  public.member_can_access_labstar_channel(channel_id)
  and (
    author_id = public.labstar_current_member_id()
    or public.can_moderate_labstar_content()
  )
)
with check (
  public.member_can_access_labstar_channel(channel_id)
  and (
    author_id = public.labstar_current_member_id()
    or public.can_moderate_labstar_content()
  )
);

create policy "channel_messages_delete_authorized"
on public.channel_messages for delete to authenticated
using (
  public.member_can_access_labstar_channel(channel_id)
  and (
    author_id = public.labstar_current_member_id()
    or public.can_moderate_labstar_content()
  )
);

create policy "channel_attachments_read_authorized"
on public.channel_message_attachments for select to authenticated
using (
  exists (
    select 1
    from public.channel_messages as message
    where message.id = message_id
      and public.member_can_access_labstar_channel(message.channel_id)
  )
);

create policy "channel_attachments_insert_authorized"
on public.channel_message_attachments for insert to authenticated
with check (
  exists (
    select 1
    from public.channel_messages as message
    where message.id = message_id
      and message.author_id = public.labstar_current_member_id()
      and public.member_can_post_labstar_channel(message.channel_id)
  )
);

create policy "channel_attachments_delete_authorized"
on public.channel_message_attachments for delete to authenticated
using (
  exists (
    select 1
    from public.channel_messages as message
    where message.id = message_id
      and public.member_can_access_labstar_channel(message.channel_id)
      and (
        message.author_id = public.labstar_current_member_id()
        or public.can_moderate_labstar_content()
      )
  )
);

grant select, insert, update, delete on public.channels to authenticated;
grant select, insert, update, delete on public.channel_messages to authenticated;
grant select, insert, delete on public.channel_message_attachments to authenticated;

-- “Apagar para mim” não destrói o conteúdo compartilhado: grava apenas a
-- preferência daquele membro. “Apagar para todos” continua removendo a mensagem.
create table if not exists public.hidden_direct_messages (
  member_id uuid not null references public.members(id) on delete cascade,
  message_id uuid not null references public.direct_messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (member_id, message_id)
);

create table if not exists public.hidden_channel_messages (
  member_id uuid not null references public.members(id) on delete cascade,
  message_id uuid not null references public.channel_messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (member_id, message_id)
);

create index if not exists hidden_direct_messages_member_idx
  on public.hidden_direct_messages(member_id, created_at desc);
create index if not exists hidden_channel_messages_member_idx
  on public.hidden_channel_messages(member_id, created_at desc);

alter table public.hidden_direct_messages enable row level security;
alter table public.hidden_channel_messages enable row level security;

drop policy if exists "hidden_direct_own_read" on public.hidden_direct_messages;
drop policy if exists "hidden_direct_own_insert" on public.hidden_direct_messages;
drop policy if exists "hidden_direct_own_delete" on public.hidden_direct_messages;
create policy "hidden_direct_own_read" on public.hidden_direct_messages
for select to authenticated using (member_id = public.labstar_current_member_id());
create policy "hidden_direct_own_insert" on public.hidden_direct_messages
for insert to authenticated with check (member_id = public.labstar_current_member_id());
create policy "hidden_direct_own_delete" on public.hidden_direct_messages
for delete to authenticated using (member_id = public.labstar_current_member_id());

drop policy if exists "hidden_channel_own_read" on public.hidden_channel_messages;
drop policy if exists "hidden_channel_own_insert" on public.hidden_channel_messages;
drop policy if exists "hidden_channel_own_delete" on public.hidden_channel_messages;
create policy "hidden_channel_own_read" on public.hidden_channel_messages
for select to authenticated using (member_id = public.labstar_current_member_id());
create policy "hidden_channel_own_insert" on public.hidden_channel_messages
for insert to authenticated with check (member_id = public.labstar_current_member_id());
create policy "hidden_channel_own_delete" on public.hidden_channel_messages
for delete to authenticated using (member_id = public.labstar_current_member_id());

grant select, insert, delete on public.hidden_direct_messages to authenticated;
grant select, insert, delete on public.hidden_channel_messages to authenticated;

notify pgrst, 'reload schema';
commit;
