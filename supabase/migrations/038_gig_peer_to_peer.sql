-- 038_gig_peer_to_peer.sql — peer-to-peer gig booking, reviews, admin moderation.
--
-- Gigs already exist (offers from credible members). This adds the missing
-- two-sided flow: a seeker requests a gig, the provider accepts/declines and
-- later marks it completed, the seeker can review it, and reviews feed the
-- provider's credibility. Payment is informational for now but the columns are
-- structured so a real processor can be added later without another migration.

-- ── gigs: moderation + audit columns ────────────────────────────────────────
alter table gigs add column if not exists updated_at  timestamptz not null default now();
alter table gigs add column if not exists is_featured boolean     not null default false;

-- ── gig_requests: a seeker booking a provider's gig ─────────────────────────
create table if not exists gig_requests (
  id              uuid primary key default gen_random_uuid(),
  gig_id          uuid not null references gigs(id)          on delete cascade,
  seeker_id       uuid not null references users(id)         on delete cascade,
  provider_id     uuid not null references users(id)         on delete cascade,
  conversation_id uuid references conversations(id)          on delete set null,
  message         text,
  status          text not null default 'pending'
    check (status in ('pending','accepted','declined','completed','cancelled')),
  -- payment is informational today; structured for a future processor
  price_eur       integer,
  currency        text    not null default 'EUR',
  is_paid         boolean not null default false,
  paid_at         timestamptz,
  responded_at    timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists gig_requests_gig_idx      on gig_requests(gig_id);
create index if not exists gig_requests_seeker_idx   on gig_requests(seeker_id);
create index if not exists gig_requests_provider_idx on gig_requests(provider_id);
create index if not exists gig_requests_status_idx   on gig_requests(status);

-- One active request per seeker per gig (they can re-request after a terminal state)
create unique index if not exists gig_requests_active_unique
  on gig_requests(gig_id, seeker_id)
  where status in ('pending','accepted');

-- ── gig_reviews: seeker rates provider after completion ─────────────────────
create table if not exists gig_reviews (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references gig_requests(id) on delete cascade,
  gig_id      uuid not null references gigs(id)         on delete cascade,
  reviewer_id uuid not null references users(id)        on delete cascade,
  provider_id uuid not null references users(id)        on delete cascade,
  rating      integer not null check (rating between 1 and 5),
  comment     text,
  created_at  timestamptz not null default now(),
  unique (request_id)
);
create index if not exists gig_reviews_provider_idx on gig_reviews(provider_id);
create index if not exists gig_reviews_gig_idx      on gig_reviews(gig_id);
