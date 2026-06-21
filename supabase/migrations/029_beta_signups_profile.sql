-- Enrich beta_signups with the fields that seed the connective layer:
-- name, role, interests, and whether the person is an international newcomer.
-- These are captured on the waiting list so we know our audience before launch.

alter table beta_signups add column if not exists name text;
alter table beta_signups add column if not exists role text
  check (role is null or role in ('student', 'professional', 'professor', 'investor', 'company'));
alter table beta_signups add column if not exists interests text[] not null default '{}';
alter table beta_signups add column if not exists is_international boolean;

create index if not exists beta_signups_role_idx on beta_signups(role);
