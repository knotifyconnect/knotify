-- ============================================================================
-- 056_tour_state.sql
--
-- Adds a server-side flag so the guided onboarding tour (spotlight coach-marks
-- over Home/Map/Messages/Quests) auto-runs exactly once per user and can be
-- replayed on demand from Settings without losing the "already seen it" state
-- on other devices.
-- ============================================================================

begin;

alter table public.users
  add column if not exists tour_completed_at timestamptz;

commit;
