-- 039_invites.sql — personal invite links + referral attribution.
--
-- Every member gets a stable personal invite code (the shareable link is
-- knotify.pro/signup?invite=<code>). When someone joins through a code we record
-- one row in `invites` (inviter -> invitee), set users.invited_by, auto-connect
-- the two, and grant the newcomer a small welcome bonus. The inviter's reward is
-- intentionally NOT a flat per-signup payout (that is trivially gameable): it is
-- earned through credibility quests that count invitees who actually completed
-- onboarding (see VERIFIED invite_* quests in routes/quests.ts).

-- Personal invite code + who invited this user. Code is generated lazily by the
-- API the first time the member opens their invite page.
alter table users add column if not exists invite_code text;
alter table users add column if not exists invited_by uuid references users(id) on delete set null;

create unique index if not exists users_invite_code_key on users(invite_code) where invite_code is not null;
create index if not exists users_invited_by_idx on users(invited_by);

-- One row per successful referral. invitee_id is unique: a member can only be
-- attributed to a single inviter, set once at join time and never reassigned.
create table if not exists invites (
  id          uuid primary key default gen_random_uuid(),
  inviter_id  uuid not null references users(id) on delete cascade,
  invitee_id  uuid not null references users(id) on delete cascade,
  code        text not null,
  created_at  timestamptz not null default now(),
  unique (invitee_id)
);

create index if not exists invites_inviter_idx on invites(inviter_id);
