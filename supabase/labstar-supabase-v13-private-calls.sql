-- Labstar v13 — chamadas privadas de voz e vídeo com sinalização WebRTC.
-- Seguro para executar novamente. O áudio e o vídeo trafegam entre os participantes;
-- o Supabase armazena apenas a sessão e mensagens efêmeras de sinalização.

begin;

create table if not exists public.direct_call_sessions (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.direct_threads(id) on delete cascade,
  initiator_id uuid not null references public.members(id) on delete restrict,
  recipient_id uuid not null references public.members(id) on delete restrict,
  kind text not null check (kind in ('audio', 'video')),
  status text not null default 'ringing' check (status in ('ringing', 'accepted', 'rejected', 'ended', 'missed')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  constraint direct_call_distinct_members check (initiator_id <> recipient_id)
);

create index if not exists direct_call_sessions_recipient_status_idx
  on public.direct_call_sessions(recipient_id, status, created_at desc);

create index if not exists direct_call_sessions_thread_created_idx
  on public.direct_call_sessions(thread_id, created_at desc);

create table if not exists public.direct_call_signals (
  id bigint generated always as identity primary key,
  call_id uuid not null references public.direct_call_sessions(id) on delete cascade,
  sender_id uuid not null references public.members(id) on delete cascade,
  recipient_id uuid not null references public.members(id) on delete cascade,
  signal_type text not null check (signal_type in ('offer', 'answer', 'ice', 'hangup', 'reject')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint direct_call_signal_distinct_members check (sender_id <> recipient_id)
);

create index if not exists direct_call_signals_call_id_idx
  on public.direct_call_signals(call_id, id);

create or replace function public.is_direct_call_participant(target_call_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.direct_call_sessions call
    where call.id = target_call_id
      and public.current_member_id() in (call.initiator_id, call.recipient_id)
  );
$$;

revoke all on function public.is_direct_call_participant(uuid) from public;
grant execute on function public.is_direct_call_participant(uuid) to authenticated;

create or replace function public.create_direct_call(
  target_thread_id uuid,
  target_recipient_id uuid,
  target_kind text
)
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

  if target_kind not in ('audio', 'video') then
    raise exception 'invalid_call_kind';
  end if;

  if target_recipient_id is null or target_recipient_id = actor_id then
    raise exception 'invalid_call_recipient';
  end if;

  if not exists (
    select 1
    from public.direct_thread_members mine
    where mine.thread_id = target_thread_id
      and mine.member_id = actor_id
  ) or not exists (
    select 1
    from public.direct_thread_members recipient
    join public.members member on member.id = recipient.member_id
    where recipient.thread_id = target_thread_id
      and recipient.member_id = target_recipient_id
      and member.status = 'active'
  ) then
    raise exception 'direct_thread_access_denied';
  end if;

  if 2 <> (
    select count(*)
    from public.direct_thread_members participant
    where participant.thread_id = target_thread_id
  ) then
    raise exception 'private_call_requires_two_members';
  end if;

  update public.direct_call_sessions
  set status = 'missed', ended_at = coalesce(ended_at, now())
  where status = 'ringing'
    and created_at < now() - interval '60 seconds'
    and (initiator_id = actor_id or recipient_id = actor_id);

  if exists (
    select 1
    from public.direct_call_sessions active_call
    where active_call.status in ('ringing', 'accepted')
      and (
        actor_id in (active_call.initiator_id, active_call.recipient_id)
        or target_recipient_id in (active_call.initiator_id, active_call.recipient_id)
      )
  ) then
    raise exception 'participant_already_in_call';
  end if;

  insert into public.direct_call_sessions (
    thread_id,
    initiator_id,
    recipient_id,
    kind,
    status
  ) values (
    target_thread_id,
    actor_id,
    target_recipient_id,
    target_kind,
    'ringing'
  ) returning id into result_id;

  return result_id;
end;
$$;

revoke all on function public.create_direct_call(uuid, uuid, text) from public;
grant execute on function public.create_direct_call(uuid, uuid, text) to authenticated;

create or replace function public.set_direct_call_status(
  target_call_id uuid,
  target_status text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := public.current_member_id();
  current_call public.direct_call_sessions%rowtype;
begin
  if actor_id is null then
    raise exception 'active_member_required';
  end if;

  if target_status not in ('accepted', 'rejected', 'ended', 'missed') then
    raise exception 'invalid_call_status';
  end if;

  select * into current_call
  from public.direct_call_sessions
  where id = target_call_id
  for update;

  if current_call.id is null
    or actor_id not in (current_call.initiator_id, current_call.recipient_id) then
    raise exception 'direct_call_access_denied';
  end if;

  if current_call.status in ('rejected', 'ended', 'missed') then
    return;
  end if;

  if target_status in ('accepted', 'rejected')
    and actor_id <> current_call.recipient_id then
    raise exception 'only_recipient_can_answer';
  end if;

  if target_status = 'missed'
    and actor_id <> current_call.initiator_id then
    raise exception 'only_initiator_can_mark_missed';
  end if;

  if target_status = 'accepted' and current_call.status <> 'ringing' then
    raise exception 'call_not_ringing';
  end if;

  update public.direct_call_sessions
  set
    status = target_status,
    answered_at = case
      when target_status = 'accepted' then coalesce(answered_at, now())
      else answered_at
    end,
    ended_at = case
      when target_status in ('rejected', 'ended', 'missed') then coalesce(ended_at, now())
      else ended_at
    end
  where id = target_call_id;
end;
$$;

revoke all on function public.set_direct_call_status(uuid, text) from public;
grant execute on function public.set_direct_call_status(uuid, text) to authenticated;

create or replace function public.send_direct_call_signal(
  target_call_id uuid,
  target_recipient_id uuid,
  target_signal_type text,
  target_payload jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := public.current_member_id();
  current_call public.direct_call_sessions%rowtype;
  result_id bigint;
begin
  if actor_id is null then
    raise exception 'active_member_required';
  end if;

  if target_signal_type not in ('offer', 'answer', 'ice', 'hangup', 'reject') then
    raise exception 'invalid_call_signal';
  end if;

  select * into current_call
  from public.direct_call_sessions
  where id = target_call_id;

  if current_call.id is null
    or actor_id not in (current_call.initiator_id, current_call.recipient_id)
    or target_recipient_id not in (current_call.initiator_id, current_call.recipient_id)
    or target_recipient_id = actor_id then
    raise exception 'direct_call_signal_access_denied';
  end if;

  if current_call.status in ('rejected', 'ended', 'missed')
    and target_signal_type not in ('hangup', 'reject') then
    raise exception 'call_already_finished';
  end if;

  insert into public.direct_call_signals (
    call_id,
    sender_id,
    recipient_id,
    signal_type,
    payload
  ) values (
    target_call_id,
    actor_id,
    target_recipient_id,
    target_signal_type,
    coalesce(target_payload, '{}'::jsonb)
  ) returning id into result_id;

  return result_id;
end;
$$;

revoke all on function public.send_direct_call_signal(uuid, uuid, text, jsonb) from public;
grant execute on function public.send_direct_call_signal(uuid, uuid, text, jsonb) to authenticated;

alter table public.direct_call_sessions enable row level security;
alter table public.direct_call_signals enable row level security;

revoke all on public.direct_call_sessions from anon;
revoke all on public.direct_call_signals from anon;
revoke all on public.direct_call_sessions from authenticated;
revoke all on public.direct_call_signals from authenticated;
grant select on public.direct_call_sessions to authenticated;
grant select on public.direct_call_signals to authenticated;

drop policy if exists "direct_call_sessions_read" on public.direct_call_sessions;
create policy "direct_call_sessions_read"
on public.direct_call_sessions
for select
to authenticated
using (public.current_member_id() in (initiator_id, recipient_id));

drop policy if exists "direct_call_signals_read" on public.direct_call_signals;
create policy "direct_call_signals_read"
on public.direct_call_signals
for select
to authenticated
using (
  recipient_id = public.current_member_id()
  or sender_id = public.current_member_id()
);

do $$
begin
  alter publication supabase_realtime add table public.direct_call_sessions;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.direct_call_signals;
exception when duplicate_object then null;
end $$;

commit;

select 'Labstar v13 instalada: chamadas privadas seguras prontas.' as resultado;
