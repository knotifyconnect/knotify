-- ==========================================================================
-- WIPE ALL USER DATA — run once in the Supabase SQL Editor
-- ==========================================================================
-- This bypasses the referral_events immutability trigger and clears every
-- user-derived table. After running this, only fresh real signups will exist.
-- ==========================================================================

BEGIN;

-- Disable the immutability trigger so we can clear referral_events
ALTER TABLE referral_events DISABLE TRIGGER referral_events_block_delete;
ALTER TABLE referral_events DISABLE TRIGGER referral_events_block_update;

-- Truncate everything in dependency order (CASCADE handles FKs)
TRUNCATE TABLE
  referral_events,
  referrals,
  messages,
  conversations,
  updates,
  connections,
  jobs,
  company_members,
  companies,
  users
RESTART IDENTITY CASCADE;

-- Re-enable the trigger
ALTER TABLE referral_events ENABLE TRIGGER referral_events_block_delete;
ALTER TABLE referral_events ENABLE TRIGGER referral_events_block_update;

COMMIT;

-- Verify
SELECT 'users' AS t, COUNT(*) FROM users
UNION ALL SELECT 'connections', COUNT(*) FROM connections
UNION ALL SELECT 'jobs', COUNT(*) FROM jobs
UNION ALL SELECT 'companies', COUNT(*) FROM companies
UNION ALL SELECT 'updates', COUNT(*) FROM updates
UNION ALL SELECT 'referrals', COUNT(*) FROM referrals
UNION ALL SELECT 'referral_events', COUNT(*) FROM referral_events;
