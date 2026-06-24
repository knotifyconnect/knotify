-- 043_feedback.sql — in-app beta feedback.
-- Users submit structured feedback (bug / suggestion / other) from a floating
-- widget; admins triage and mark resolved.

create table if not exists feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id) on delete set null,
  type        text not null default 'other',   -- bug | suggestion | other
  message     text not null,
  page        text,                              -- route the user was on
  user_agent  text,
  status      text not null default 'open',      -- open | resolved
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists feedback_status_idx on feedback (status, created_at desc);
