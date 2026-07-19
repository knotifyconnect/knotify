-- ============================================================================
-- 061_notifications.sql — generic per-user notification feed + push subscriptions.
--
-- notifications: written by the API (service_role) on connection/message/RSVP
-- events, read by the owning user. Browser subscribes to realtime here, so it
-- needs a SELECT policy or the subscription goes silent (see 054_rls_lockdown.sql).
-- Reads/marks-as-read still go through the API, so SELECT is enough.
--
-- push_subscriptions: browser never queries this table directly (subscribe/
-- unsubscribe go through the API), so it stays fully server-only — RLS on,
-- no policies.
-- ============================================================================

begin;

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  actor_id uuid references users(id) on delete set null,
  type text not null check (type in (
    'connection_request', 'connection_accepted', 'message', 'event_rsvp'
  )),
  title text not null,
  body text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on notifications (user_id, created_at desc);

alter table notifications enable row level security;

drop policy if exists notifications_select_own on notifications;
create policy notifications_select_own on notifications
for select to authenticated
using (user_id = (select id from users where auth_id = auth.uid()));

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

commit;
