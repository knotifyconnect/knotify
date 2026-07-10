-- ============================================================================
-- 055_users_pii_and_credibility.sql
--
-- Two independent fixes bundled so you only apply one migration:
--
--   (S2) Stop the public anon key from reading users' private contact info.
--   (R2) Make credibility-score recomputation atomic (kills a race).
--
-- Safe alongside a running app: the API uses the service_role key, which is
-- unaffected by both changes. Apply the same way as migration 054 (Supabase
-- dashboard → SQL Editor → paste → Run). Then test the app briefly.
-- ============================================================================

begin;

-- ── S2: users PII lockdown ───────────────────────────────────────────────────
-- The users_read_all policy (migration 015) lets ANY authenticated caller read
-- the whole users row directly via the public anon key — including email,
-- contact_email, contact_phone, linkedin_url, and precise location. The API
-- only ever returns safe columns; this makes the direct anon path match by
-- granting column-level SELECT on everything EXCEPT the sensitive fields.
--
-- Built dynamically from the live schema, so it can't fail on a column-name
-- typo and automatically covers columns added in future migrations.
revoke select on public.users from anon, authenticated;

do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ')
  into cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'users'
    and column_name not in (
      'email', 'contact_email', 'contact_phone', 'linkedin_url',
      'location_lat', 'location_lng', 'location_point'
    );
  execute format('grant select (%s) on public.users to authenticated', cols);
end;
$$;

-- ── R2: atomic credibility recompute ─────────────────────────────────────────
-- Replaces the app's read-sum-write (which could lose an update when two quests
-- complete at once) with a single UPDATE. security definer + service_role-only
-- execute so only the server can call it.
create or replace function public.recompute_credibility(p_user_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.users
     set credibility_score = coalesce(
       (select sum(points_awarded) from public.user_quests where user_id = p_user_id),
       0
     )
   where id = p_user_id
  returning credibility_score;
$$;

revoke all on function public.recompute_credibility(uuid) from public, anon, authenticated;
grant execute on function public.recompute_credibility(uuid) to service_role;

commit;
