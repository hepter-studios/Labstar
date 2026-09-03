-- Labstar — Egress reduction and notification deduplication
-- Safe to run repeatedly. Does not remove messages or files.

begin;

-- The v16 notification function already handles announcement/rules channels.
-- An older trigger can still exist in databases upgraded in-place; if present,
-- it creates a second notification for the same channel message.
drop trigger if exists channel_announcement_notification on public.channel_messages;

-- Keep the query paths used by chat/home/search predictable as the workspace grows.
create index if not exists channel_messages_channel_created_idx
  on public.channel_messages(channel_id, created_at desc);

create index if not exists channel_message_attachments_message_idx
  on public.channel_message_attachments(message_id);

create index if not exists notifications_recipient_read_created_idx
  on public.notifications(recipient_id, is_read, created_at desc);

-- Remove only the known historical duplicate pattern: a generic notification
-- for the same announcement message when the canonical announcement notification
-- already exists for the same recipient.
delete from public.notifications duplicate_notification
where duplicate_notification.event_type = 'general'
  and duplicate_notification.entity_id is not null
  and exists (
    select 1
    from public.notifications canonical_notification
    where canonical_notification.recipient_id = duplicate_notification.recipient_id
      and canonical_notification.entity_id = duplicate_notification.entity_id
      and canonical_notification.event_type = 'announcement'
      and canonical_notification.channel_id is not distinct from duplicate_notification.channel_id
      and canonical_notification.title = duplicate_notification.title
  );

commit;

select 'Labstar Egress reduction migration installed.' as status;
