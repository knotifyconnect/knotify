-- Phase 5 (start): peer events + gigs exchange.

-- Events are peer-created (study group, coffee, tour, company visit). Tagged with
-- the same interest taxonomy so they match into discovery later.
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references users(id) on delete cascade,
  title text not null,
  description text,
  location text,
  starts_at timestamptz not null,
  interests text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists events_starts_at_idx on events(starts_at);
create index if not exists events_host_idx on events(host_id);

create table if not exists event_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);
create index if not exists event_rsvps_event_idx on event_rsvps(event_id);

-- Gigs: offers from credible members (CV review, referral, mentorship, tour, advice).
-- Reward is paid or in-kind (coffee). Creating a gig is gated behind credibility >= 70.
create table if not exists gigs (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references users(id) on delete cascade,
  gig_type text not null check (gig_type in ('cv_review','referral','mentorship','tour','advice','other')),
  title text not null,
  description text,
  reward_type text not null default 'coffee' check (reward_type in ('coffee','paid','free')),
  price_eur integer,
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now()
);
create index if not exists gigs_status_idx on gigs(status);
create index if not exists gigs_provider_idx on gigs(provider_id);
