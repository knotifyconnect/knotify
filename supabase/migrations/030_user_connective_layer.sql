-- Phase 2: the connective layer on users.
-- persona, interests, goals, and newcomer/origin context. These tags are the
-- vocabulary that people, events and gigs are all matched on.
-- (languages TEXT[] already exists from migration 018.)

alter table users add column if not exists persona text
  check (persona is null or persona in ('student', 'professional', 'professor', 'investor'));
alter table users add column if not exists interests text[] not null default '{}';
alter table users add column if not exists goals text[] not null default '{}';
alter table users add column if not exists is_international boolean;
alter table users add column if not exists home_country text;
alter table users add column if not exists munich_tenure text;

create index if not exists users_persona_idx on users(persona);
-- GIN indexes make tag-overlap matching (the recommendation engine) fast.
create index if not exists users_interests_idx on users using gin(interests);
create index if not exists users_goals_idx on users using gin(goals);
