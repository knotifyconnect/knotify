-- Replace legacy UUID-derived handles with deterministic, readable handles.
-- New profiles are handled in the API; this repairs accounts already in use.

do $$
declare
  profile record;
  stem text;
  candidate text;
  suffix integer;
begin
  for profile in
    select id, full_name
    from public.users
    where username ~* '^user_[a-z0-9]{12}$'
    order by created_at, id
  loop
    stem := lower(coalesce(profile.full_name, 'new member'));
    stem := translate(stem, 'äöüßÄÖÜ', 'aousAOU');
    stem := regexp_replace(stem, '[^a-z0-9]+', '_', 'g');
    stem := trim(both '_' from stem);
    stem := left(stem, 26);
    if length(stem) < 3 then
      stem := 'new_member';
    end if;

    candidate := stem;
    suffix := 2;
    while exists (select 1 from public.users u where lower(u.username) = lower(candidate) and u.id <> profile.id) loop
      candidate := left(stem, 32 - length('_' || suffix::text)) || '_' || suffix::text;
      suffix := suffix + 1;
    end loop;

    update public.users
    set username = candidate,
        updated_at = now()
    where id = profile.id;
  end loop;
end $$;

-- Message list/read/delivery and graph traversals are the hottest paths.
create index if not exists conversation_participants_user_conversation_idx
  on public.conversation_participants (user_id, conversation_id);

create index if not exists messages_unread_by_conversation_idx
  on public.messages (conversation_id, sender_id, created_at desc)
  where read_at is null and deleted_at is null;

create index if not exists messages_undelivered_by_conversation_idx
  on public.messages (conversation_id, sender_id, created_at desc)
  where delivered_at is null and deleted_at is null;

create index if not exists connections_accepted_requester_idx
  on public.connections (requester_id, addressee_id)
  where status = 'accepted';

create index if not exists connections_accepted_addressee_idx
  on public.connections (addressee_id, requester_id)
  where status = 'accepted';

create index if not exists jobs_open_created_idx
  on public.jobs (created_at desc)
  where status = 'open';
