-- Labstar v9 — perguntas de segurança, bloqueio de tentativas e mensagens privadas.
-- Idempotente: pode ser executada novamente sem apagar dados.
begin;

create extension if not exists pgcrypto;

create table if not exists public.member_security_questions (
  member_id uuid primary key references public.members(id) on delete cascade,
  question_1 text not null,
  answer_1_hash text not null,
  question_2 text not null,
  answer_2_hash text not null,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.member_security_questions enable row level security;
revoke all on public.member_security_questions from anon, authenticated;

create or replace function public.set_own_security_questions(p_question_1 text, p_answer_1 text, p_question_2 text, p_answer_2 text)
returns void language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if not public.current_member_is_active() then raise exception 'member_not_active'; end if;
  if length(trim(p_question_1)) < 8 or length(trim(p_question_2)) < 8 then raise exception 'question_too_short'; end if;
  if lower(trim(p_question_1)) = lower(trim(p_question_2)) then raise exception 'questions_must_differ'; end if;
  if length(trim(p_answer_1)) < 3 or length(trim(p_answer_2)) < 3 then raise exception 'answer_too_short'; end if;
  insert into public.member_security_questions(member_id, question_1, answer_1_hash, question_2, answer_2_hash, last_verified_at)
  values (auth.uid(), trim(p_question_1), crypt(lower(trim(p_answer_1)), gen_salt('bf')), trim(p_question_2), crypt(lower(trim(p_answer_2)), gen_salt('bf')), now())
  on conflict (member_id) do update set question_1=excluded.question_1, answer_1_hash=excluded.answer_1_hash,
    question_2=excluded.question_2, answer_2_hash=excluded.answer_2_hash, failed_attempts=0, locked_until=null,
    last_verified_at=now(), updated_at=now();
end $$;

create or replace function public.get_own_security_challenge()
returns table(configured boolean, verified boolean, question_index integer, question text, locked_until timestamptz, attempts_remaining integer)
language plpgsql security definer set search_path = public, pg_temp as $$
declare q public.member_security_questions%rowtype; idx integer;
begin
  select * into q from public.member_security_questions where member_id=auth.uid();
  if not found then return query select false, false, 0, ''::text, null::timestamptz, 5; return; end if;
  idx := case when mod(q.failed_attempts, 2)=0 then 1 else 2 end;
  return query select true, coalesce(q.last_verified_at > now() - interval '12 hours', false), idx,
    case when idx=1 then q.question_1 else q.question_2 end, q.locked_until, greatest(0, 5-q.failed_attempts);
end $$;

create or replace function public.verify_own_security_answer(p_question_index integer, p_answer text)
returns table(success boolean, locked_until timestamptz, attempts_remaining integer)
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare q public.member_security_questions%rowtype; valid boolean; failures integer; next_lock timestamptz;
begin
  select * into q from public.member_security_questions where member_id=auth.uid() for update;
  if not found then raise exception 'security_not_configured'; end if;
  if q.locked_until is not null and q.locked_until > now() then return query select false, q.locked_until, 0; return; end if;
  valid := case when p_question_index=1 then q.answer_1_hash=crypt(lower(trim(p_answer)),q.answer_1_hash)
                when p_question_index=2 then q.answer_2_hash=crypt(lower(trim(p_answer)),q.answer_2_hash) else false end;
  if valid then
    update public.member_security_questions set failed_attempts=0, locked_until=null, last_verified_at=now(), updated_at=now() where member_id=auth.uid();
    return query select true, null::timestamptz, 5; return;
  end if;
  failures := q.failed_attempts + 1;
  next_lock := case when failures >= 5 then now()+interval '15 minutes' else null end;
  update public.member_security_questions set failed_attempts=case when failures>=5 then 0 else failures end,
    locked_until=next_lock, updated_at=now() where member_id=auth.uid();
  return query select false, next_lock, case when next_lock is null then 5-failures else 0 end;
end $$;

revoke all on function public.set_own_security_questions(text,text,text,text) from public;
revoke all on function public.get_own_security_challenge() from public;
revoke all on function public.verify_own_security_answer(integer,text) from public;
grant execute on function public.set_own_security_questions(text,text,text,text) to authenticated;
grant execute on function public.get_own_security_challenge() to authenticated;
grant execute on function public.verify_own_security_answer(integer,text) to authenticated;

create table if not exists public.direct_conversations (
  id uuid primary key default gen_random_uuid(), pair_key text not null unique,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.direct_conversation_members (
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  joined_at timestamptz not null default now(), last_read_at timestamptz,
  primary key(conversation_id,member_id)
);
create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  author_id uuid not null references public.members(id) on delete cascade default auth.uid(),
  body text not null check(length(trim(body)) between 1 and 12000), edited_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists direct_messages_conversation_idx on public.direct_messages(conversation_id,created_at);
create index if not exists direct_members_member_idx on public.direct_conversation_members(member_id);

alter table public.direct_conversations enable row level security;
alter table public.direct_conversation_members enable row level security;
alter table public.direct_messages enable row level security;

create or replace function public.is_direct_conversation_member(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.direct_conversation_members where conversation_id=p_conversation_id and member_id=auth.uid())
$$;
revoke all on function public.is_direct_conversation_member(uuid) from public;
grant execute on function public.is_direct_conversation_member(uuid) to authenticated;

drop policy if exists direct_conversations_read on public.direct_conversations;
create policy direct_conversations_read on public.direct_conversations for select to authenticated using(public.is_direct_conversation_member(id));
drop policy if exists direct_members_read on public.direct_conversation_members;
create policy direct_members_read on public.direct_conversation_members for select to authenticated using(public.is_direct_conversation_member(conversation_id));
drop policy if exists direct_messages_read on public.direct_messages;
create policy direct_messages_read on public.direct_messages for select to authenticated using(public.is_direct_conversation_member(conversation_id));
drop policy if exists direct_messages_insert on public.direct_messages;
create policy direct_messages_insert on public.direct_messages for insert to authenticated with check(author_id=auth.uid() and public.is_direct_conversation_member(conversation_id));
drop policy if exists direct_messages_update on public.direct_messages;
create policy direct_messages_update on public.direct_messages for update to authenticated using(author_id=auth.uid()) with check(author_id=auth.uid());
drop policy if exists direct_messages_delete on public.direct_messages;
create policy direct_messages_delete on public.direct_messages for delete to authenticated using(author_id=auth.uid());
grant select on public.direct_conversations, public.direct_conversation_members to authenticated;
grant select,insert,update,delete on public.direct_messages to authenticated;

create or replace function public.get_or_create_direct_conversation(p_other_member_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare key text; conversation uuid;
begin
  if p_other_member_id=auth.uid() then raise exception 'cannot_message_self'; end if;
  if not public.current_member_is_active() or not exists(select 1 from public.members where id=p_other_member_id and status='active') then raise exception 'member_not_active'; end if;
  key := least(auth.uid()::text,p_other_member_id::text)||':'||greatest(auth.uid()::text,p_other_member_id::text);
  insert into public.direct_conversations(pair_key) values(key) on conflict(pair_key) do update set updated_at=public.direct_conversations.updated_at returning id into conversation;
  insert into public.direct_conversation_members(conversation_id,member_id) values(conversation,auth.uid()),(conversation,p_other_member_id) on conflict do nothing;
  return conversation;
end $$;
revoke all on function public.get_or_create_direct_conversation(uuid) from public;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;

do $$ begin alter publication supabase_realtime add table public.direct_messages; exception when duplicate_object then null; end $$;
commit;
select 'Labstar v9 instalada: segurança e mensagens privadas ativas.' as resultado;
