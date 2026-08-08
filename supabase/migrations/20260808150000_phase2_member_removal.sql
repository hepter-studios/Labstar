create or replace function public.remove_team_member(target_member_id uuid)
returns table (
  outcome text,
  member_id uuid,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.members%rowtype;
  target public.members%rowtype;
  has_message_history boolean := false;
begin
  select member.*
    into actor
    from public.members as member
   where member.auth_user_id = auth.uid()
      or (
        member.auth_user_id is null
        and lower(member.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
   order by (member.auth_user_id = auth.uid()) desc
   limit 1;

  if actor.id is null or actor.status <> 'active' then
    raise exception 'member_not_authorized' using errcode = '42501';
  end if;

  if actor.role not in ('owner', 'admin') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select member.*
    into target
    from public.members as member
   where member.id = target_member_id
   for update;

  if target.id is null then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;

  if target.id = actor.id then
    raise exception 'self_removal_forbidden' using errcode = '42501';
  end if;

  if target.role = 'owner' then
    raise exception 'owner_removal_forbidden' using errcode = '42501';
  end if;

  select
    exists(select 1 from public.channel_messages where author_id::text = target.id::text)
    or exists(select 1 from public.direct_messages where author_id::text = target.id::text)
    into has_message_history;

  if has_message_history then
    update public.members
       set status = 'suspended',
           last_seen_at = now()
     where id = target.id;
    return query select 'suspended'::text, target.id, 'history_preserved'::text;
    return;
  end if;

  begin
    delete from public.members where id = target.id;
    return query select 'removed'::text, target.id, 'access_removed'::text;
  exception
    when foreign_key_violation then
      update public.members
         set status = 'suspended',
             last_seen_at = now()
       where id = target.id;
      return query select 'suspended'::text, target.id, 'linked_records_preserved'::text;
  end;
end;
$$;

revoke all on function public.remove_team_member(uuid) from public;
grant execute on function public.remove_team_member(uuid) to authenticated;
