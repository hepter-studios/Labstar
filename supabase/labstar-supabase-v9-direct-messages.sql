-- Labstar v9 — Mensagens Diretas privadas, persistentes e em tempo real.
-- Seguro para executar novamente. Não apaga conversas nem dados existentes.

begin;

create or replace function public.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id
  from public.members
  where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and status = 'active'
  limit 1;
$$;

revoke all on function public.current_member_id() from public;
grant execute on function public.current_member_id() to authenticated;

create table if not exists public.direct_threads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.direct_thread_members (
  thread_id uuid not null references public.direct_threads(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (thread_id, member_id)
);

create index if not exists direct_thread_members_member_idx
  on public.direct_thread_members(member_id, thread_id);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.direct_threads(id) on delete cascade,
  author_id uuid not null references public.members(id) on delete restrict,
  body text not null default '',
  reply_to uuid references public.direct_messages(id) on delete set null,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create index if not exists direct_messages_thread_created_idx
  on public.direct_messages(thread_id, created_at);

create table if not exists public.direct_message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.direct_messages(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists direct_message_attachments_message_idx
  on public.direct_message_attachments(message_id);

create or replace function public.is_direct_thread_member(target_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.direct_thread_members dtm
    where dtm.thread_id = target_thread_id
      and dtm.member_id = public.current_member_id()
  );
$$;

revoke all on function public.is_direct_thread_member(uuid) from public;
grant execute on function public.is_direct_thread_member(uuid) to authenticated;

create or replace function public.get_or_create_direct_thread(other_member_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := public.current_member_id();
  result_id uuid;
begin
  if actor_id is null then
    raise exception 'active_member_required';
  end if;

  if other_member_id is null or other_member_id = actor_id then
    raise exception 'invalid_direct_recipient';
  end if;

  if not exists (
    select 1 from public.members
    where id = other_member_id and status = 'active'
  ) then
    raise exception 'recipient_not_available';
  end if;

  select dt.id
  into result_id
  from public.direct_threads dt
  where exists (
    select 1 from public.direct_thread_members a
    where a.thread_id = dt.id and a.member_id = actor_id
  )
  and exists (
    select 1 from public.direct_thread_members b
    where b.thread_id = dt.id and b.member_id = other_member_id
  )
  and 2 = (
    select count(*) from public.direct_thread_members c where c.thread_id = dt.id
  )
  order by dt.updated_at desc
  limit 1;

  if result_id is null then
    insert into public.direct_threads default values returning id into result_id;
    insert into public.direct_thread_members (thread_id, member_id)
    values (result_id, actor_id), (result_id, other_member_id);
  end if;

  return result_id;
end;
$$;

revoke all on function public.get_or_create_direct_thread(uuid) from public;
grant execute on function public.get_or_create_direct_thread(uuid) to authenticated;

create or replace function public.list_direct_threads()
returns table (
  thread_id uuid,
  other_member_id uuid,
  updated_at timestamptz,
  last_message_body text,
  last_message_at timestamptz,
  unread_count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (
    select public.current_member_id() as member_id
  )
  select
    dt.id as thread_id,
    other.member_id as other_member_id,
    dt.updated_at,
    last_message.body as last_message_body,
    last_message.created_at as last_message_at,
    coalesce(unread.total, 0) as unread_count
  from me
  join public.direct_thread_members mine on mine.member_id = me.member_id
  join public.direct_threads dt on dt.id = mine.thread_id
  join lateral (
    select dtm.member_id
    from public.direct_thread_members dtm
    where dtm.thread_id = dt.id
      and dtm.member_id <> me.member_id
    order by dtm.joined_at
    limit 1
  ) other on true
  left join lateral (
    select dm.body, dm.created_at
    from public.direct_messages dm
    where dm.thread_id = dt.id
    order by dm.created_at desc
    limit 1
  ) last_message on true
  left join lateral (
    select count(*)::bigint as total
    from public.direct_messages dm
    where dm.thread_id = dt.id
      and dm.author_id <> me.member_id
      and dm.created_at > mine.last_read_at
  ) unread on true
  order by coalesce(last_message.created_at, dt.updated_at) desc;
$$;

revoke all on function public.list_direct_threads() from public;
grant execute on function public.list_direct_threads() to authenticated;

create or replace function public.mark_direct_thread_read(target_thread_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.direct_thread_members
  set last_read_at = now()
  where thread_id = target_thread_id
    and member_id = public.current_member_id();
$$;

revoke all on function public.mark_direct_thread_read(uuid) from public;
grant execute on function public.mark_direct_thread_read(uuid) to authenticated;

create or replace function public.touch_direct_thread()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.direct_threads
  set updated_at = now()
  where id = coalesce(new.thread_id, old.thread_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists direct_message_touch_thread on public.direct_messages;
create trigger direct_message_touch_thread
after insert or update or delete on public.direct_messages
for each row execute function public.touch_direct_thread();

alter table public.direct_threads enable row level security;
alter table public.direct_thread_members enable row level security;
alter table public.direct_messages enable row level security;
alter table public.direct_message_attachments enable row level security;

drop policy if exists "direct_threads_read" on public.direct_threads;
create policy "direct_threads_read" on public.direct_threads
for select to authenticated
using (public.is_direct_thread_member(id));

drop policy if exists "direct_thread_members_read" on public.direct_thread_members;
create policy "direct_thread_members_read" on public.direct_thread_members
for select to authenticated
using (public.is_direct_thread_member(thread_id));

drop policy if exists "direct_messages_read" on public.direct_messages;
create policy "direct_messages_read" on public.direct_messages
for select to authenticated
using (public.is_direct_thread_member(thread_id));

drop policy if exists "direct_messages_insert" on public.direct_messages;
create policy "direct_messages_insert" on public.direct_messages
for insert to authenticated
with check (
  public.is_direct_thread_member(thread_id)
  and author_id = public.current_member_id()
);

drop policy if exists "direct_messages_update" on public.direct_messages;
create policy "direct_messages_update" on public.direct_messages
for update to authenticated
using (
  public.is_direct_thread_member(thread_id)
  and author_id = public.current_member_id()
)
with check (
  public.is_direct_thread_member(thread_id)
  and author_id = public.current_member_id()
);

drop policy if exists "direct_messages_delete" on public.direct_messages;
create policy "direct_messages_delete" on public.direct_messages
for delete to authenticated
using (
  public.is_direct_thread_member(thread_id)
  and author_id = public.current_member_id()
);

drop policy if exists "direct_attachments_read" on public.direct_message_attachments;
create policy "direct_attachments_read" on public.direct_message_attachments
for select to authenticated
using (
  exists (
    select 1
    from public.direct_messages dm
    where dm.id = message_id
      and public.is_direct_thread_member(dm.thread_id)
  )
);

drop policy if exists "direct_attachments_insert" on public.direct_message_attachments;
create policy "direct_attachments_insert" on public.direct_message_attachments
for insert to authenticated
with check (
  exists (
    select 1
    from public.direct_messages dm
    where dm.id = message_id
      and dm.author_id = public.current_member_id()
      and public.is_direct_thread_member(dm.thread_id)
  )
);

drop policy if exists "direct_attachments_delete" on public.direct_message_attachments;
create policy "direct_attachments_delete" on public.direct_message_attachments
for delete to authenticated
using (
  exists (
    select 1
    from public.direct_messages dm
    where dm.id = message_id
      and dm.author_id = public.current_member_id()
      and public.is_direct_thread_member(dm.thread_id)
  )
);

grant select on public.direct_threads to authenticated;
grant select on public.direct_thread_members to authenticated;
grant select, insert, update, delete on public.direct_messages to authenticated;
grant select, insert, delete on public.direct_message_attachments to authenticated;

-- Acesso privado aos anexos de DMs dentro do bucket já usado pela Labstar.
-- Estrutura: direct/<thread_uuid>/<message_uuid>/<arquivo>
drop policy if exists "labstar_direct_files_read" on storage.objects;
create policy "labstar_direct_files_read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'labstar-files'
  and (storage.foldername(name))[1] = 'direct'
  and public.is_direct_thread_member(((storage.foldername(name))[2])::uuid)
);

drop policy if exists "labstar_direct_files_insert" on storage.objects;
create policy "labstar_direct_files_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'labstar-files'
  and (storage.foldername(name))[1] = 'direct'
  and public.is_direct_thread_member(((storage.foldername(name))[2])::uuid)
);

drop policy if exists "labstar_direct_files_delete" on storage.objects;
create policy "labstar_direct_files_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'labstar-files'
  and (storage.foldername(name))[1] = 'direct'
  and public.is_direct_thread_member(((storage.foldername(name))[2])::uuid)
);

do $$
begin
  alter publication supabase_realtime add table public.direct_messages;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.direct_message_attachments;
exception when duplicate_object then null;
end $$;

commit;

select 'Labstar v9 instalada: mensagens diretas privadas prontas.' as resultado;
