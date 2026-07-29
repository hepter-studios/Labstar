-- Labstar v6 — perfis, cargos profissionais, reuniões e acabamento da central.
-- Seguro para executar novamente: não apaga dados existentes.

begin;

alter table public.members
  add column if not exists avatar_path text;

alter table public.members drop constraint if exists members_role_check;
alter table public.members add constraint members_role_check
  check (role in ('owner', 'admin', 'manager', 'member', 'viewer'));

-- Os emojis antigos deixam de ser usados. A interface desenha um escudo com
-- estrela sólida e aplica a cor configurada em cada cargo.
update public.job_roles
set icon = 'star'
where icon is distinct from 'star';

create or replace function public.update_own_profile(
  new_name text default null,
  new_avatar_path text default null
)
returns setof public.members
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_member_id() is null then
    raise exception 'member_not_found';
  end if;

  return query
  update public.members
  set
    name = case
      when new_name is null or char_length(trim(new_name)) < 2 then name
      else left(trim(new_name), 100)
    end,
    avatar_path = case
      when new_avatar_path is null then avatar_path
      else nullif(trim(new_avatar_path), '')
    end,
    last_seen_at = now()
  where id = public.current_member_id()
  returning *;
end;
$$;

create or replace function public.clear_own_avatar()
returns setof public.members
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_member_id() is null then
    raise exception 'member_not_found';
  end if;

  return query
  update public.members
  set avatar_path = null, last_seen_at = now()
  where id = public.current_member_id()
  returning *;
end;
$$;

revoke all on function public.update_own_profile(text, text) from public;
revoke all on function public.clear_own_avatar() from public;
grant execute on function public.update_own_profile(text, text) to authenticated;
grant execute on function public.clear_own_avatar() to authenticated;

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 120),
  agenda text not null default '',
  starts_at timestamptz not null,
  duration_minutes integer not null default 45
    check (duration_minutes between 5 and 480),
  created_by uuid references public.members(id) on delete set null,
  attendee_ids uuid[] not null default '{}'::uuid[],
  status text not null default 'scheduled'
    check (status in ('scheduled', 'live', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meetings_channel_starts_idx
  on public.meetings (channel_id, starts_at);

alter table public.meetings enable row level security;

drop policy if exists "meetings_read_channel" on public.meetings;
create policy "meetings_read_channel"
on public.meetings for select
to authenticated
using (public.can_member_access_channel(channel_id));

drop policy if exists "meetings_insert_member" on public.meetings;
create policy "meetings_insert_member"
on public.meetings for insert
to authenticated
with check (
  public.can_member_access_channel(channel_id)
  and public.current_member_role() <> 'viewer'
  and created_by = public.current_member_id()
);

drop policy if exists "meetings_update_owner" on public.meetings;
create policy "meetings_update_owner"
on public.meetings for update
to authenticated
using (
  created_by = public.current_member_id()
  or public.current_member_role() in ('owner', 'admin', 'manager')
)
with check (
  created_by = public.current_member_id()
  or public.current_member_role() in ('owner', 'admin', 'manager')
);

drop policy if exists "meetings_delete_owner" on public.meetings;
create policy "meetings_delete_owner"
on public.meetings for delete
to authenticated
using (
  created_by = public.current_member_id()
  or public.current_member_role() in ('owner', 'admin')
);

create or replace function public.notify_scheduled_meeting()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  channel_name text;
  creator_name text;
begin
  select name into channel_name from public.channels where id = new.channel_id;
  select name into creator_name from public.members where id = new.created_by;

  insert into public.notifications (recipient_id, title, body, channel_id)
  select
    member.id,
    'Reunião agendada: ' || new.title,
    coalesce(creator_name, 'Equipe') || ' agendou para '
      || to_char(new.starts_at at time zone 'America/Fortaleza', 'DD/MM/YYYY "às" HH24:MI')
      || ' em #' || coalesce(channel_name, 'reunião'),
    new.channel_id
  from public.members member
  where member.status = 'active'
    and member.id <> new.created_by
    and (
      cardinality(new.attendee_ids) = 0
      or member.id = any(new.attendee_ids)
    );

  return new;
end;
$$;

drop trigger if exists meeting_scheduled_notification on public.meetings;
create trigger meeting_scheduled_notification
after insert on public.meetings
for each row execute function public.notify_scheduled_meeting();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'meetings'
  ) then
    alter publication supabase_realtime add table public.meetings;
  end if;
end $$;

commit;

select 'Labstar v6 instalada com sucesso.' as status;
