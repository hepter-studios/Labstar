-- Fase 3 — autorização dos canais privados de reunião.
-- O WebRTC transporta áudio e vídeo entre os participantes. O Supabase Realtime
-- transporta somente Presence, sinalização, controles e o chat efêmero da sala.

begin;

drop policy if exists "labstar_meetings_receive" on realtime.messages;
create policy "labstar_meetings_receive"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension in ('broadcast', 'presence')
  and (select realtime.topic()) like 'voice:%'
  and exists (
    select 1
    from public.channels channel
    join public.members member
      on member.id = public.current_member_id()
    where channel.id::text = split_part((select realtime.topic()), ':', 2)
      and channel.type = 'voice'
      and member.status = 'active'
      and (
        member.role in ('owner', 'admin')
        or (
          (
            coalesce(cardinality(channel.allowed_roles), 0) = 0
            or member.role = any(channel.allowed_roles)
          )
          and (
            coalesce(cardinality(channel.allowed_assignments), 0) = 0
            or coalesce(member.assignments, '{}'::text[]) && channel.allowed_assignments
          )
        )
      )
  )
);

drop policy if exists "labstar_meetings_send" on realtime.messages;
create policy "labstar_meetings_send"
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension in ('broadcast', 'presence')
  and (select realtime.topic()) like 'voice:%'
  and exists (
    select 1
    from public.channels channel
    join public.members member
      on member.id = public.current_member_id()
    where channel.id::text = split_part((select realtime.topic()), ':', 2)
      and channel.type = 'voice'
      and member.status = 'active'
      and (
        member.role in ('owner', 'admin')
        or (
          (
            coalesce(cardinality(channel.allowed_roles), 0) = 0
            or member.role = any(channel.allowed_roles)
          )
          and (
            coalesce(cardinality(channel.allowed_assignments), 0) = 0
            or coalesce(member.assignments, '{}'::text[]) && channel.allowed_assignments
          )
        )
      )
  )
);

commit;
