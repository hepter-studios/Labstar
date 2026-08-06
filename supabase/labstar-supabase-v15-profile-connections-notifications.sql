-- Labstar v15 — perfil GitHub e central abrangente de notificações.
-- Seguro para executar novamente. Não remove perfis, mensagens ou notificações existentes.

begin;

alter table public.members
  add column if not exists github_profile jsonb not null default '{}'::jsonb;

alter table public.members drop constraint if exists members_github_profile_object_check;
alter table public.members add constraint members_github_profile_object_check
  check (jsonb_typeof(github_profile) = 'object');

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.members(id) on delete cascade,
  title text not null,
  body text not null default '',
  channel_id uuid references public.channels(id) on delete set null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications
  add column if not exists event_type text not null default 'general',
  add column if not exists entity_id uuid;

create index if not exists notifications_recipient_created_idx
  on public.notifications(recipient_id, created_at desc);

create index if not exists notifications_recipient_unread_idx
  on public.notifications(recipient_id, is_read, created_at desc);

create unique index if not exists notifications_event_entity_unique
  on public.notifications(recipient_id, event_type, entity_id)
  where entity_id is not null;

alter table public.notifications enable row level security;

drop policy if exists "notifications_read_own" on public.notifications;
create policy "notifications_read_own"
on public.notifications for select
to authenticated
using (recipient_id = public.current_member_id());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
on public.notifications for update
to authenticated
using (recipient_id = public.current_member_id())
with check (recipient_id = public.current_member_id());

grant select, update on public.notifications to authenticated;

create or replace function public.push_labstar_notification(
  target_recipient uuid,
  notification_title text,
  notification_body text default '',
  target_channel uuid default null,
  target_event_type text default 'general',
  target_entity uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if target_recipient is null or not exists (
    select 1 from public.members where id = target_recipient
  ) then
    return;
  end if;

  insert into public.notifications (
    recipient_id,
    title,
    body,
    channel_id,
    event_type,
    entity_id
  ) values (
    target_recipient,
    left(trim(coalesce(notification_title, 'Atualização do Labstar')), 160),
    left(trim(coalesce(notification_body, '')), 700),
    target_channel,
    left(trim(coalesce(target_event_type, 'general')), 60),
    target_entity
  );
exception
  when unique_violation then null;
end;
$$;

revoke all on function public.push_labstar_notification(uuid, text, text, uuid, text, uuid) from public;

create or replace function public.notify_direct_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  author_name text;
  recipient record;
begin
  select name into author_name from public.members where id = new.author_id;

  for recipient in
    select member_id
    from public.direct_thread_members
    where thread_id = new.thread_id
      and member_id <> new.author_id
  loop
    perform public.push_labstar_notification(
      recipient.member_id,
      coalesce(author_name, 'Alguém') || ' enviou uma mensagem',
      left(coalesce(nullif(trim(new.body), ''), 'Enviou um arquivo ou imagem.'), 220),
      null,
      'direct_message',
      new.id
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists direct_message_notification on public.direct_messages;
create trigger direct_message_notification
after insert on public.direct_messages
for each row execute function public.notify_direct_message_insert();

create or replace function public.notify_channel_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  author_name text;
  channel_row public.channels%rowtype;
  replied_author uuid;
  recipient record;
  is_everyone boolean;
  is_announcement boolean;
  mentioned boolean;
  event_name text;
begin
  select * into channel_row from public.channels where id = new.channel_id;
  select name into author_name from public.members where id = new.author_id;
  if new.reply_to is not null then
    select author_id into replied_author from public.channel_messages where id = new.reply_to;
  end if;

  is_everyone := lower(coalesce(new.body, '')) ~ '@(todos|all|everyone)(\s|$|[,.!:;])';
  is_announcement := channel_row.type in ('announcement', 'rules');

  for recipient in
    select member.id, member.name
    from public.members member
    where member.status = 'active'
      and member.id <> new.author_id
      and (
        cardinality(coalesce(channel_row.allowed_roles, '{}'::text[])) = 0
        or member.role = any(channel_row.allowed_roles)
      )
      and (
        cardinality(coalesce(channel_row.allowed_assignments, '{}'::text[])) = 0
        or coalesce(member.assignments, '{}'::text[]) && channel_row.allowed_assignments
      )
  loop
    mentioned := lower(coalesce(new.body, '')) like '%@' || lower(recipient.name) || '%';
    if is_announcement or is_everyone or mentioned or recipient.id = replied_author then
      event_name := case
        when recipient.id = replied_author then 'channel_reply'
        when is_announcement then 'announcement'
        else 'channel_mention'
      end;
      perform public.push_labstar_notification(
        recipient.id,
        case
          when recipient.id = replied_author then coalesce(author_name, 'Alguém') || ' respondeu você'
          when is_announcement then 'Novo aviso em #' || coalesce(channel_row.name, 'canal')
          else coalesce(author_name, 'Alguém') || ' mencionou você'
        end,
        left(coalesce(nullif(trim(new.body), ''), 'Nova atualização no canal.'), 260),
        new.channel_id,
        event_name,
        new.id
      );
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists channel_message_notification on public.channel_messages;
create trigger channel_message_notification
after insert on public.channel_messages
for each row execute function public.notify_channel_message_insert();

create or replace function public.notify_meeting_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  channel_name text;
  creator_name text;
  recipient record;
  event_name text;
  title_text text;
  body_text text;
begin
  select name into channel_name from public.channels where id = new.channel_id;
  select name into creator_name from public.members where id = new.created_by;

  if tg_op = 'INSERT' then
    event_name := 'meeting_scheduled';
    title_text := 'Reunião agendada: ' || new.title;
    body_text := coalesce(creator_name, 'Equipe') || ' agendou para '
      || to_char(new.starts_at at time zone 'America/Fortaleza', 'DD/MM/YYYY "às" HH24:MI')
      || ' em #' || coalesce(channel_name, 'reunião');
  elsif new.status = 'cancelled' and old.status is distinct from new.status then
    event_name := 'meeting_cancelled';
    title_text := 'Reunião cancelada: ' || new.title;
    body_text := 'O encontro em #' || coalesce(channel_name, 'reunião') || ' foi cancelado.';
  elsif new.starts_at is distinct from old.starts_at or new.title is distinct from old.title then
    event_name := 'meeting_updated';
    title_text := 'Reunião atualizada: ' || new.title;
    body_text := 'Novo horário: '
      || to_char(new.starts_at at time zone 'America/Fortaleza', 'DD/MM/YYYY "às" HH24:MI')
      || ' em #' || coalesce(channel_name, 'reunião');
  else
    return new;
  end if;

  for recipient in
    select member.id
    from public.members member
    where member.status = 'active'
      and member.id <> new.created_by
      and (
        cardinality(coalesce(new.attendee_ids, '{}'::uuid[])) = 0
        or member.id = any(new.attendee_ids)
      )
  loop
    perform public.push_labstar_notification(
      recipient.id,
      title_text,
      body_text,
      new.channel_id,
      event_name,
      new.id
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists meeting_scheduled_notification on public.meetings;
drop trigger if exists meeting_change_notification on public.meetings;
create trigger meeting_change_notification
after insert or update on public.meetings
for each row execute function public.notify_meeting_change();

create or replace function public.notify_social_post_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  recipient record;
  event_name text;
  title_text text;
  body_text text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status
    and new.scheduled_for is not distinct from old.scheduled_for then
    return new;
  end if;

  if new.status not in ('review', 'scheduled', 'published') then
    return new;
  end if;

  event_name := 'social_' || new.status;
  title_text := case new.status
    when 'review' then 'Conteúdo aguardando revisão'
    when 'scheduled' then 'Publicação agendada'
    else 'Conteúdo publicado'
  end;
  body_text := new.title || case
    when new.scheduled_for is not null then ' · ' || to_char(new.scheduled_for at time zone 'America/Fortaleza', 'DD/MM "às" HH24:MI')
    else ''
  end;

  for recipient in
    select id from public.members
    where status = 'active' and id is distinct from new.owner_id
  loop
    perform public.push_labstar_notification(
      recipient.id,
      title_text,
      body_text,
      null,
      event_name,
      new.id
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists social_post_notification on public.social_posts;
create trigger social_post_notification
after insert or update on public.social_posts
for each row execute function public.notify_social_post_change();

create or replace function public.notify_integration_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  recipient record;
  days_left integer;
begin
  if not new.enabled then return new; end if;

  if new.renewal_date is not null then
    days_left := new.renewal_date - current_date;
    if days_left between 0 and 30 then
      for recipient in
        select id from public.members
        where status = 'active' and role in ('owner', 'admin', 'manager')
      loop
        perform public.push_labstar_notification(
          recipient.id,
          'Renovação próxima: ' || new.name,
          case when days_left = 0 then 'A integração vence hoje.' else 'Faltam ' || days_left || ' dias para a renovação.' end,
          new.channel_id,
          'integration_renewal',
          new.id
        );
      end loop;
    end if;
  end if;

  if tg_op = 'UPDATE' and old.enabled is distinct from new.enabled then
    for recipient in
      select id from public.members
      where status = 'active' and role in ('owner', 'admin')
    loop
      perform public.push_labstar_notification(
        recipient.id,
        'Integração ativada: ' || new.name,
        'O provedor ' || new.provider || ' voltou a enviar eventos ao Labstar.',
        new.channel_id,
        'integration_enabled',
        new.id
      );
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists integration_rule_notification on public.integration_rules;
create trigger integration_rule_notification
after insert or update on public.integration_rules
for each row execute function public.notify_integration_change();

create or replace function public.notify_member_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  manager record;
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    for manager in
      select id from public.members
      where status = 'active' and role in ('owner', 'admin') and id <> new.id
    loop
      perform public.push_labstar_notification(
        manager.id,
        'Novo acesso aguardando aprovação',
        new.name || ' (' || new.email || ') precisa de revisão.',
        null,
        'member_pending',
        new.id
      );
    end loop;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    perform public.push_labstar_notification(
      new.id,
      case new.status
        when 'active' then 'Seu acesso foi aprovado'
        when 'suspended' then 'Seu acesso foi suspenso'
        else 'Seu acesso está em análise'
      end,
      'O status da sua conta no Labstar foi alterado pela administração.',
      null,
      'member_status_' || new.status,
      new.id
    );
  end if;

  if tg_op = 'UPDATE' and new.role is distinct from old.role then
    perform public.push_labstar_notification(
      new.id,
      'Nível de acesso atualizado',
      'Seu novo nível no Labstar é ' || new.role || '.',
      null,
      'member_role_changed',
      new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists member_change_notification on public.members;
create trigger member_change_notification
after insert or update on public.members
for each row execute function public.notify_member_change();

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

  select name into role_name from public.job_roles where id = target_role;

  perform public.push_labstar_notification(
    target_member,
    case when tg_op = 'DELETE' then 'Cargo removido' else 'Novo cargo atribuído' end,
    coalesce(role_name, 'Cargo profissional') || case when tg_op = 'DELETE' then ' foi removido do seu perfil.' else ' foi adicionado ao seu perfil.' end,
    null,
    case when tg_op = 'DELETE' then 'job_role_removed' else 'job_role_added' end,
    target_role
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists member_job_role_notification on public.member_job_roles;
create trigger member_job_role_notification
after insert or delete on public.member_job_roles
for each row execute function public.notify_job_role_assignment();

create or replace function public.notify_direct_call_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  initiator_name text;
begin
  select name into initiator_name from public.members where id = new.initiator_id;

  if tg_op = 'INSERT' then
    perform public.push_labstar_notification(
      new.recipient_id,
      case new.kind when 'video' then 'Chamada de vídeo recebida' else 'Chamada de voz recebida' end,
      coalesce(initiator_name, 'Um membro') || ' está chamando você.',
      null,
      'direct_call_incoming',
      new.id
    );
  elsif new.status = 'missed' and old.status is distinct from new.status then
    perform public.push_labstar_notification(
      new.recipient_id,
      'Chamada perdida',
      'Você perdeu uma chamada de ' || coalesce(initiator_name, 'um membro') || '.',
      null,
      'direct_call_missed',
      new.id
    );
  elsif new.status = 'rejected' and old.status is distinct from new.status then
    perform public.push_labstar_notification(
      new.initiator_id,
      'Chamada recusada',
      'A chamada não foi atendida.',
      null,
      'direct_call_rejected',
      new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists direct_call_notification on public.direct_call_sessions;
create trigger direct_call_notification
after insert or update on public.direct_call_sessions
for each row execute function public.notify_direct_call_change();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

commit;

select 'Labstar v15 instalada: GitHub e notificações abrangentes prontos.' as status;
