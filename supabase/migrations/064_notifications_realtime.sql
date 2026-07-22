-- Make the existing notification client subscription functional and preserve
-- complete UPDATE payloads so unread badge deltas can be applied locally.

do $$
begin
  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    raise exception 'Publication supabase_realtime does not exist';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end $$;

alter table public.notifications replica identity full;

-- The API already emits ask_reply notifications. Keep the database constraint
-- aligned so those inserts no longer fail while installing Realtime support.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'connection_request', 'connection_accepted', 'message', 'event_rsvp',
    'job_referral_request', 'ask_reply'
  ));
