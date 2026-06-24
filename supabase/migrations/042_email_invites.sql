-- 042_email_invites.sql — hybrid invite model.
--
-- Two kinds of invite now exist:
--   'link'  — the member's reusable shareable code. Grants access (reach), but
--             does NOT earn credibility milestones (can't be farmed).
--   'email' — a verified 1:1 invite tied to a specific email address. Only a
--             signup with that confirmed email can redeem it. These are the
--             "vouches" that count toward the inviter's credibility.

-- Distinguish how an attribution happened.
alter table invites add column if not exists kind text not null default 'link';

-- Pending verified invites, before the friend has signed up.
create table if not exists email_invites (
  id          uuid primary key default gen_random_uuid(),
  inviter_id  uuid not null references users(id) on delete cascade,
  email       text not null,
  token       text not null unique,
  status      text not null default 'pending',  -- pending | accepted | revoked
  accepted_by uuid references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  unique (inviter_id, email)
);

create index if not exists email_invites_email_idx on email_invites (lower(email));
create index if not exists email_invites_token_idx on email_invites (token);
