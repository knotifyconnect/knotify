-- Companion long-term memory: durable facts/preferences the model itself
-- flags as worth remembering across conversations (not just the recent
-- scrollback). No RLS, matching the rest of the engine tables.
create table if not exists companion_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  fact text not null,
  created_at timestamptz not null default now()
);
create index if not exists companion_memory_user_created_idx on companion_memory (user_id, created_at);
