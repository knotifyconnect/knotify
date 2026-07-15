-- Curated imports may have only a calendar date; the time is intentionally unavailable.
alter table public.events
  add column if not exists time_tba boolean not null default false;
