-- Labstar v7 — canal de voz padrão, autorização Realtime e experiência de reunião.
-- Seguro para executar novamente: não apaga dados nem duplica salas existentes.

begin;

create or replace function public.ensure_default_voice_channel(
  target_space_id uuid,
  actor_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  meetings_category_id uuid;
begin
  if target_space_id is null
    or not exists (
      select 1
      from public.collaboration_spaces
      where id = target_space_id
    )
  then
    return;
  end if;

  -- Um Espaço que já possui qualquer canal de voz não recebe duplicação.
  if exists (
    select 1
    from public.channels
    where space_id = target_space_id
      and type = 'voice'
  )
  then
    return;
  end if;

  select id
  into meetings_category_id
  from public.channel_categories
  where space_id = target_space_id
    and lower(translate(name, 'õôóãáàâéêíúç', 'oooaaaaeeiuc')) in ('reunioes', 'reuniao')
  order by position, created_at
  limit 1;

  if meetings_category_id is null then
    insert into public.channel_categories (space_id, name, position)
    values (
      target_space_id,
      'Reuniões',
      coalesce((
        select max(position) + 10
        from public.channel_categories
        where space_id = target_space_id
      ), 10)
    )
    returning id into meetings_category_id;
  end if;

  insert into public.channels (
    space_id,
    category_id,
    name,
    description,
    type,
    allowed_roles,
    allowed_assignments,
    position,
    created_by
  )
  values (
    target_space_id,
    meetings_category_id,
    'sala-geral',
    'Sala de voz principal deste Espaço para reuniões rápidas e encontros agendados.',
    'voice',
    '{}'::text[],
    '{}'::text[],
    10,
    actor_id
  );
end;
$$;

revoke all on function public.ensure_default_voice_channel(uuid, uuid) from public;

create or replace function public.provision_default_voice_channel()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.ensure_default_voice_channel(new.id, new.created_by);
  return new;
end;
$$;

drop trigger if exists collaboration_space_default_voice on public.collaboration_spaces;
create trigger collaboration_space_default_voice
after insert on public.collaboration_spaces
for each row execute function public.provision_default_voice_channel();

-- Corrige todos os Espaços já criados, incluindo Labstar, Mompy e futuros
-- Espaços inseridos antes desta migração.
do $$
declare
  space_record record;
begin
  for space_record in
    select id, created_by
    from public.collaboration_spaces
  loop
    perform public.ensure_default_voice_channel(space_record.id, space_record.created_by);
  end loop;
end;
$$;

-- Converte com segurança o tópico "voice:<uuid>" usado pelo Realtime.
create or replace function public.voice_channel_id_from_topic(topic_name text)
returns uuid
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  channel_text text;
begin
  if topic_name is null or topic_name !~* '^voice:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return null;
  end if;

  channel_text := split_part(topic_name, ':', 2);
  return channel_text::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

revoke all on function public.voice_channel_id_from_topic(text) from public;
grant execute on function public.voice_channel_id_from_topic(text) to authenticated;

-- Canais privados de voz usam Broadcast para sinalização WebRTC e Presence
-- para mostrar os participantes. O acesso segue as mesmas permissões do canal.
drop policy if exists "labstar_voice_realtime_read" on realtime.messages;
create policy "labstar_voice_realtime_read"
on realtime.messages
for select
to authenticated
using (
  extension in ('broadcast', 'presence')
  and public.can_member_access_channel(
    public.voice_channel_id_from_topic(realtime.topic())
  )
);

drop policy if exists "labstar_voice_realtime_write" on realtime.messages;
create policy "labstar_voice_realtime_write"
on realtime.messages
for insert
to authenticated
with check (
  extension in ('broadcast', 'presence')
  and public.can_member_access_channel(
    public.voice_channel_id_from_topic(realtime.topic())
  )
);

commit;

select 'Labstar v7 instalada com sucesso: todos os Espaços possuem voz.' as status;
