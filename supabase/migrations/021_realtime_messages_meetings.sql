-- Enable realtime events for relationship-action flows.
-- Messages need INSERT events for live threads.
-- Meetings need INSERT/UPDATE events for pinned coffee action cards.

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
      and tablename = 'messages'
  ) then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'meetings'
  ) then
    execute 'alter publication supabase_realtime add table public.meetings';
  end if;
end $$;

alter table public.messages replica identity full;
alter table public.meetings replica identity full;
