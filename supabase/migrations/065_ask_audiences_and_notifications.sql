-- Make Ask targeting an enforceable audience contract.
--
-- `ask_recipients` stores explicit multi-person audiences. All Ask tables are
-- server-only: the web app reads and writes through the API, which can enforce
-- the same audience rules for feeds, deep links, replies, and reactions.

begin;

alter table public.user_asks
  drop constraint if exists user_asks_audience_type_check;

alter table public.user_asks
  add constraint user_asks_audience_type_check
  check (audience_type in ('everyone', 'interest', 'persona', 'people'));

create table if not exists public.ask_recipients (
  ask_id uuid not null references public.user_asks(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (ask_id, user_id)
);

create index if not exists ask_recipients_user_ask_idx
  on public.ask_recipients (user_id, ask_id);

grant select, insert, update, delete on table public.ask_recipients to service_role;

alter table public.user_asks enable row level security;
alter table public.ask_replies enable row level security;
alter table public.ask_reactions enable row level security;
alter table public.ask_recipients enable row level security;

-- These tables are not queried directly by the browser. Removing the original
-- public/authenticated policies prevents a user from bypassing API audience
-- checks with the public Supabase key. service_role continues to bypass RLS.
drop policy if exists "asks_select" on public.user_asks;
drop policy if exists "asks_insert" on public.user_asks;
drop policy if exists "asks_update" on public.user_asks;
drop policy if exists "asks_delete" on public.user_asks;
drop policy if exists "areply_select" on public.ask_replies;
drop policy if exists "areply_insert" on public.ask_replies;
drop policy if exists "areply_delete" on public.ask_replies;
drop policy if exists "areact_select" on public.ask_reactions;
drop policy if exists "areact_insert" on public.ask_reactions;
drop policy if exists "areact_delete" on public.ask_reactions;

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'connection_request', 'connection_accepted', 'message', 'event_rsvp',
    'job_referral_request', 'ask_reply', 'ask_created', 'ask_activity'
  ));

commit;
