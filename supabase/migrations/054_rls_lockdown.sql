-- ============================================================================
-- 054_rls_lockdown.sql — Close the "RLS disabled in public" exposure.
--
-- WHY: The web app ships the public anon key. Every table in the `public`
-- schema is reachable through PostgREST with that key, and Row-Level Security
-- is the ONLY thing gating browser access. Roughly half the tables never had
-- RLS enabled — including private Companion chat, invite tokens, and the
-- app_settings row that holds the access mode + team invite code. With RLS
-- off, anyone holding the (public) anon key can read/write them directly.
--
-- The API uses the service_role key, which BYPASSES RLS, so enabling RLS with
-- no browser policy locks a table to server-only access without touching the
-- API. service_role still needs table GRANTs (see migration 049) — unaffected.
--
-- ⚠️ APPLY TO STAGING FIRST AND TEST REALTIME. The browser subscribes to
-- Postgres changes on `messages` (already has a SELECT policy) and `meetings`
-- (this migration adds one). Supabase Realtime enforces RLS, so a table with
-- RLS on and no SELECT policy will stop delivering realtime events to the
-- browser. `messages` and `meetings` are the only tables the anon key touches
-- directly (verified against apps/web); everything else is server-only.
-- ============================================================================

begin;

-- ── 1. Enable RLS on every postgres-owned table in `public` that still lacks
--        it. Tables that already have RLS + policies are unaffected (idempotent).
--        Tables with no browser policy become server-only (service_role bypasses).
do $$
declare
  tbl text;
begin
  for tbl in
    select format('%I.%I', n.nspname, c.relname)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relrowsecurity = false
      and pg_get_userbyid(c.relowner) = 'postgres'
  loop
    execute format('alter table %s enable row level security', tbl);
  end loop;
end;
$$;

-- ── 2. meetings: browser subscribes to realtime here, so it needs a
--        participants-only SELECT policy or the subscription goes silent.
--        Writes still go through the API (service_role), so SELECT is enough.
drop policy if exists meetings_select_participants on meetings;
create policy meetings_select_participants on meetings
for select to authenticated
using (
  initiator_id = (select id from users where auth_id = auth.uid())
  or invitee_id = (select id from users where auth_id = auth.uid())
);

commit;

-- ============================================================================
-- 3. REVIEW-REQUIRED (left commented — apply after confirming column names):
--    users_read_all exposes the ENTIRE users row (contact_email, contact_phone,
--    linkedin_url, precise location) to any authenticated caller via the anon
--    key. The API already returns only safe columns; lock the direct path down
--    to match by replacing the blanket policy with column-level grants.
--
--    revoke select on users from anon, authenticated;
--    grant select (
--      id, auth_id, full_name, username, avatar_url, bio, headline,
--      location_city, status, university, current_company, is_hr, is_admin,
--      credibility_score, persona, interests, goals, is_international,
--      home_country, munich_tenure, created_at
--      -- deliberately excluded: contact_email, contact_phone, email,
--      -- linkedin_url, location_lat, location_lng, location_point
--    ) on users to authenticated;
-- ============================================================================
