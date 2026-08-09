begin;

create extension if not exists pg_net with schema extensions;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  device_id text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  platform text not null default 'web-pwa',
  user_agent text not null default '',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_device_unique unique (member_id, device_id),
  constraint push_subscriptions_endpoint_https check (endpoint like 'https://%'),
  constraint push_subscriptions_platform_check check (platform in ('web-pwa', 'ios-pwa', 'tauri'))
);

create index if not exists push_subscriptions_member_enabled_idx
  on public.push_subscriptions(member_id, enabled)
  where enabled;

alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from public, anon, authenticated;
grant select, delete on table public.push_subscriptions to authenticated;

drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own
  on public.push_subscriptions for select to authenticated
  using (member_id = public.current_member_id());

drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own
  on public.push_subscriptions for delete to authenticated
  using (member_id = public.current_member_id());

create or replace function public.upsert_push_subscription(
  p_device_id text,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_platform text default 'web-pwa',
  p_user_agent text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := public.current_member_id();
  subscription_id uuid;
begin
  if actor_id is null then raise exception 'member_required'; end if;
  if length(trim(p_device_id)) not between 8 and 200 then raise exception 'invalid_device_id'; end if;
  if p_endpoint not like 'https://%' or length(p_endpoint) > 2048 then raise exception 'invalid_push_endpoint'; end if;
  if length(p_p256dh) not between 20 and 500 or length(p_auth) not between 8 and 200 then raise exception 'invalid_push_keys'; end if;
  if p_platform not in ('web-pwa', 'ios-pwa', 'tauri') then raise exception 'invalid_push_platform'; end if;

  delete from public.push_subscriptions
   where member_id = actor_id
     and device_id = trim(p_device_id)
     and endpoint <> p_endpoint;

  insert into public.push_subscriptions (
    member_id, device_id, endpoint, p256dh, auth, platform, user_agent, enabled, updated_at
  ) values (
    actor_id, trim(p_device_id), p_endpoint, p_p256dh, p_auth, p_platform, left(coalesce(p_user_agent, ''), 500), true, now()
  )
  on conflict (endpoint) do update set
    device_id = excluded.device_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    platform = excluded.platform,
    user_agent = excluded.user_agent,
    enabled = true,
    updated_at = now()
  where push_subscriptions.member_id = actor_id
  returning id into subscription_id;

  if subscription_id is null then raise exception 'push_endpoint_owned_by_another_member'; end if;
  return subscription_id;
end;
$$;

create or replace function public.remove_push_subscription(p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  removed_count integer;
begin
  delete from public.push_subscriptions
   where member_id = public.current_member_id()
     and endpoint = p_endpoint;
  get diagnostics removed_count = row_count;
  return removed_count > 0;
end;
$$;

revoke all on function public.upsert_push_subscription(text, text, text, text, text, text) from public, anon;
revoke all on function public.remove_push_subscription(text) from public, anon;
grant execute on function public.upsert_push_subscription(text, text, text, text, text, text) to authenticated;
grant execute on function public.remove_push_subscription(text) to authenticated;

create or replace function public.enqueue_labstar_push()
returns trigger
language plpgsql
security definer
set search_path = public, net, vault, pg_temp
as $$
declare
  webhook_secret text;
begin
  select decrypted_secret
    into webhook_secret
    from vault.decrypted_secrets
   where name = 'labstar_push_webhook_secret'
   order by created_at desc
   limit 1;

  if coalesce(webhook_secret, '') = '' then return new; end if;

  perform net.http_post(
    url := 'https://pgzwyngxsxnheulvusdq.supabase.co/functions/v1/labstar-push',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-labstar-push-secret', webhook_secret
    ),
    body := jsonb_build_object('notification_id', new.id),
    timeout_milliseconds := 4000
  );
  return new;
exception when others then
  raise warning 'Labstar push enqueue failed for notification %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists notifications_enqueue_labstar_push on public.notifications;
create trigger notifications_enqueue_labstar_push
  after insert on public.notifications
  for each row execute function public.enqueue_labstar_push();

commit;
