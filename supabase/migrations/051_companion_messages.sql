-- Companion chat: one continuous per-user timeline with the Relationship OS companion.
-- No RLS, matching relationship_insights/relationship_feedback — service-role client,
-- user_id scoping enforced in application code via requireAuth.
create table if not exists companion_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  suggestions jsonb,
  created_at timestamptz not null default now()
);
create index if not exists companion_messages_user_created_idx on companion_messages (user_id, created_at);
