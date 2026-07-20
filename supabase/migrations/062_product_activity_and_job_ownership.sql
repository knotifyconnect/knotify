-- Product telemetry, owned job distribution, and readable identity guarantees.
-- This migration intentionally stores only product route names and aggregate
-- session timing. It does not capture message contents, form values, or URLs.

create table if not exists public.user_activity_sessions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  session_key uuid not null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  active_seconds integer not null default 0 check (active_seconds >= 0),
  is_active boolean not null default true,
  page_views integer not null default 1 check (page_views >= 1),
  last_path text not null default '/' check (char_length(last_path) <= 160),
  device_type text not null default 'desktop' check (device_type in ('desktop', 'mobile', 'tablet')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, session_key)
);

create index if not exists user_activity_sessions_recent_idx
  on public.user_activity_sessions (last_seen_at desc);
create index if not exists user_activity_sessions_user_recent_idx
  on public.user_activity_sessions (user_id, last_seen_at desc);

alter table public.user_activity_sessions enable row level security;
drop policy if exists activity_sessions_select_owner on public.user_activity_sessions;
create policy activity_sessions_select_owner on public.user_activity_sessions
for select to authenticated
using (user_id = (select id from public.users where auth_id = auth.uid()));
drop policy if exists activity_sessions_insert_owner on public.user_activity_sessions;
create policy activity_sessions_insert_owner on public.user_activity_sessions
for insert to authenticated
with check (user_id = (select id from public.users where auth_id = auth.uid()));
drop policy if exists activity_sessions_update_owner on public.user_activity_sessions;
create policy activity_sessions_update_owner on public.user_activity_sessions
for update to authenticated
using (user_id = (select id from public.users where auth_id = auth.uid()))
with check (user_id = (select id from public.users where auth_id = auth.uid()));

alter table public.jobs
  add column if not exists visibility text not null default 'public';

alter table public.jobs drop constraint if exists jobs_visibility_check;
alter table public.jobs add constraint jobs_visibility_check
  check (visibility in ('public', 'network'));

create index if not exists jobs_owner_status_idx
  on public.jobs (posted_by, status, created_at desc);
create index if not exists jobs_visibility_status_idx
  on public.jobs (visibility, status, created_at desc);

-- Extend the generic notification feed for the referral workflow introduced
-- below. The original table uses an explicit type check constraint.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'connection_request', 'connection_accepted', 'message', 'event_rsvp',
    'job_referral_request'
  ));

create table if not exists public.job_referral_requests (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  requester_id uuid not null references public.users(id) on delete cascade,
  recipient_id uuid not null references public.users(id) on delete cascade,
  via_user_id uuid references public.users(id) on delete set null,
  note text check (char_length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, requester_id),
  check (requester_id <> recipient_id)
);

create index if not exists job_referral_requests_recipient_idx
  on public.job_referral_requests (recipient_id, status, created_at desc);
create index if not exists job_referral_requests_requester_idx
  on public.job_referral_requests (requester_id, created_at desc);

alter table public.job_referral_requests enable row level security;
drop policy if exists job_referral_requests_select_participant on public.job_referral_requests;
create policy job_referral_requests_select_participant on public.job_referral_requests
for select to authenticated
using (
  requester_id = (select id from public.users where auth_id = auth.uid())
  or recipient_id = (select id from public.users where auth_id = auth.uid())
  or via_user_id = (select id from public.users where auth_id = auth.uid())
);
drop policy if exists job_referral_requests_insert_requester on public.job_referral_requests;
create policy job_referral_requests_insert_requester on public.job_referral_requests
for insert to authenticated
with check (requester_id = (select id from public.users where auth_id = auth.uid()));
drop policy if exists job_referral_requests_update_recipient on public.job_referral_requests;
create policy job_referral_requests_update_recipient on public.job_referral_requests
for update to authenticated
using (recipient_id = (select id from public.users where auth_id = auth.uid()))
with check (recipient_id = (select id from public.users where auth_id = auth.uid()));

-- Repair UUID-derived legacy handles here as well as in the earlier identity
-- migration, so applying this product migration is sufficient for existing
-- installations that skipped that optional repair.
do $$
declare
  profile record;
  stem text;
  candidate text;
  suffix integer;
begin
  for profile in
    select id, full_name
    from public.users
    where username ~* '^user_[a-z0-9]{12}$'
    order by created_at, id
  loop
    stem := lower(coalesce(profile.full_name, 'new member'));
    stem := translate(stem, 'äöüßÄÖÜ', 'aousAOU');
    stem := regexp_replace(stem, '[^a-z0-9]+', '_', 'g');
    stem := trim(both '_' from stem);
    stem := left(stem, 26);
    if length(stem) < 3 then stem := 'new_member'; end if;

    candidate := stem;
    suffix := 2;
    while exists (select 1 from public.users u where lower(u.username) = candidate and u.id <> profile.id) loop
      candidate := left(stem, 32 - length('_' || suffix::text)) || '_' || suffix::text;
      suffix := suffix + 1;
    end loop;
    update public.users set username = candidate, updated_at = now() where id = profile.id;
  end loop;
end $$;

-- Defensively repair any historic case-only duplicates before installing the
-- case-insensitive uniqueness guarantee. The earliest account keeps its name.
do $$
declare
  profile record;
  stem text;
  candidate text;
  suffix integer;
begin
  for profile in
    select id, username
    from (
      select id, username, created_at,
             row_number() over (partition by lower(username) order by created_at, id) as duplicate_number
      from public.users
    ) ranked
    where duplicate_number > 1
    order by created_at, id
  loop
    stem := left(lower(profile.username), 26);
    suffix := 2;
    candidate := stem || '_2';
    while exists (select 1 from public.users u where lower(u.username) = candidate and u.id <> profile.id) loop
      suffix := suffix + 1;
      candidate := left(stem, 32 - length('_' || suffix::text)) || '_' || suffix::text;
    end loop;
    update public.users set username = candidate, updated_at = now() where id = profile.id;
  end loop;
end $$;

-- Usernames are API-normalized to lowercase. The expression index makes that
-- invariant a database guarantee too, including imports and admin operations.
create unique index if not exists users_username_lower_unique_idx
  on public.users (lower(username));
