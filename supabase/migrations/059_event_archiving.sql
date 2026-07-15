alter table public.events
  add column if not exists archived_at timestamptz;

create index if not exists events_active_starts_at_idx
  on public.events (starts_at)
  where archived_at is null;
