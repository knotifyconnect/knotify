-- Phase 4: side quests + credibility.
-- credibility_score is earned by completing verifiable quests (not gameable: each
-- quest's condition is checked server-side against real profile/network state).
-- The quest catalog itself lives in code; we only persist completions here.

alter table users add column if not exists credibility_score integer not null default 0;
create index if not exists users_credibility_idx on users(credibility_score desc);

create table if not exists user_quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  quest_key text not null,
  points_awarded integer not null default 0,
  completed_at timestamptz not null default now(),
  unique (user_id, quest_key)
);

create index if not exists user_quests_user_idx on user_quests(user_id);
