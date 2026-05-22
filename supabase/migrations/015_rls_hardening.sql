-- Full RLS hardening for active MVP tables.
-- Safe to run after earlier migrations.

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE cv_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_events ENABLE ROW LEVEL SECURITY;

-- USERS
DROP POLICY IF EXISTS users_read ON users;
DROP POLICY IF EXISTS users_update ON users;
DROP POLICY IF EXISTS users_read_all ON users;
DROP POLICY IF EXISTS users_insert_self ON users;
DROP POLICY IF EXISTS users_update_self ON users;
DROP POLICY IF EXISTS users_delete_self ON users;

CREATE POLICY users_read_all ON users
FOR SELECT TO authenticated
USING (true);

CREATE POLICY users_insert_self ON users
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = auth_id);

CREATE POLICY users_update_self ON users
FOR UPDATE TO authenticated
USING (auth.uid() = auth_id)
WITH CHECK (auth.uid() = auth_id);

CREATE POLICY users_delete_self ON users
FOR DELETE TO authenticated
USING (auth.uid() = auth_id);

-- CONNECTIONS
DROP POLICY IF EXISTS connections_read ON connections;
DROP POLICY IF EXISTS connections_select_participants ON connections;
DROP POLICY IF EXISTS connections_insert_requester ON connections;
DROP POLICY IF EXISTS connections_update_participants ON connections;
DROP POLICY IF EXISTS connections_delete_participants ON connections;

CREATE POLICY connections_select_participants ON connections
FOR SELECT TO authenticated
USING (
  requester_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR addressee_id = (SELECT id FROM users WHERE auth_id = auth.uid())
);

CREATE POLICY connections_insert_requester ON connections
FOR INSERT TO authenticated
WITH CHECK (requester_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY connections_update_participants ON connections
FOR UPDATE TO authenticated
USING (
  requester_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR addressee_id = (SELECT id FROM users WHERE auth_id = auth.uid())
)
WITH CHECK (
  requester_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR addressee_id = (SELECT id FROM users WHERE auth_id = auth.uid())
);

CREATE POLICY connections_delete_participants ON connections
FOR DELETE TO authenticated
USING (
  requester_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR addressee_id = (SELECT id FROM users WHERE auth_id = auth.uid())
);

-- SKILLS
DROP POLICY IF EXISTS skills_select_all ON skills;
DROP POLICY IF EXISTS skills_insert_owner ON skills;
DROP POLICY IF EXISTS skills_update_owner ON skills;
DROP POLICY IF EXISTS skills_delete_owner ON skills;

CREATE POLICY skills_select_all ON skills
FOR SELECT TO authenticated
USING (true);

CREATE POLICY skills_insert_owner ON skills
FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY skills_update_owner ON skills
FOR UPDATE TO authenticated
USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()))
WITH CHECK (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY skills_delete_owner ON skills
FOR DELETE TO authenticated
USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- CV ANALYSES
DROP POLICY IF EXISTS cv_analyses_select_owner ON cv_analyses;
DROP POLICY IF EXISTS cv_analyses_insert_owner ON cv_analyses;
DROP POLICY IF EXISTS cv_analyses_update_owner ON cv_analyses;
DROP POLICY IF EXISTS cv_analyses_delete_owner ON cv_analyses;

CREATE POLICY cv_analyses_select_owner ON cv_analyses
FOR SELECT TO authenticated
USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY cv_analyses_insert_owner ON cv_analyses
FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY cv_analyses_update_owner ON cv_analyses
FOR UPDATE TO authenticated
USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()))
WITH CHECK (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY cv_analyses_delete_owner ON cv_analyses
FOR DELETE TO authenticated
USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- COMPANIES
DROP POLICY IF EXISTS companies_select_all ON companies;
DROP POLICY IF EXISTS companies_insert_creator ON companies;
DROP POLICY IF EXISTS companies_update_manager ON companies;
DROP POLICY IF EXISTS companies_delete_manager ON companies;

CREATE POLICY companies_select_all ON companies
FOR SELECT TO authenticated
USING (true);

CREATE POLICY companies_insert_creator ON companies
FOR INSERT TO authenticated
WITH CHECK (created_by = (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY companies_update_manager ON companies
FOR UPDATE TO authenticated
USING (
  created_by = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR id IN (
    SELECT company_id
    FROM company_members
    WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      AND role IN ('hr', 'admin')
      AND confirmed = true
  )
)
WITH CHECK (
  created_by = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR id IN (
    SELECT company_id
    FROM company_members
    WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      AND role IN ('hr', 'admin')
      AND confirmed = true
  )
);

CREATE POLICY companies_delete_manager ON companies
FOR DELETE TO authenticated
USING (
  created_by = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR id IN (
    SELECT company_id
    FROM company_members
    WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      AND role IN ('hr', 'admin')
      AND confirmed = true
  )
);

-- COMPANY MEMBERS
DROP POLICY IF EXISTS company_members_select_visible ON company_members;
DROP POLICY IF EXISTS company_members_insert_manager ON company_members;
DROP POLICY IF EXISTS company_members_update_manager ON company_members;
DROP POLICY IF EXISTS company_members_delete_manager ON company_members;

CREATE POLICY company_members_select_visible ON company_members
FOR SELECT TO authenticated
USING (
  user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR company_id IN (
    SELECT id
    FROM companies
    WHERE created_by = (SELECT id FROM users WHERE auth_id = auth.uid())
  )
  OR company_id IN (
    SELECT company_id
    FROM company_members
    WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      AND role IN ('hr', 'admin')
      AND confirmed = true
  )
);

CREATE POLICY company_members_insert_manager ON company_members
FOR INSERT TO authenticated
WITH CHECK (
  company_id IN (
    SELECT id
    FROM companies
    WHERE created_by = (SELECT id FROM users WHERE auth_id = auth.uid())
  )
  OR company_id IN (
    SELECT company_id
    FROM company_members
    WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      AND role IN ('hr', 'admin')
      AND confirmed = true
  )
);

CREATE POLICY company_members_update_manager ON company_members
FOR UPDATE TO authenticated
USING (
  company_id IN (
    SELECT id
    FROM companies
    WHERE created_by = (SELECT id FROM users WHERE auth_id = auth.uid())
  )
  OR company_id IN (
    SELECT company_id
    FROM company_members
    WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      AND role IN ('hr', 'admin')
      AND confirmed = true
  )
)
WITH CHECK (
  company_id IN (
    SELECT id
    FROM companies
    WHERE created_by = (SELECT id FROM users WHERE auth_id = auth.uid())
  )
  OR company_id IN (
    SELECT company_id
    FROM company_members
    WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      AND role IN ('hr', 'admin')
      AND confirmed = true
  )
);

CREATE POLICY company_members_delete_manager ON company_members
FOR DELETE TO authenticated
USING (
  company_id IN (
    SELECT id
    FROM companies
    WHERE created_by = (SELECT id FROM users WHERE auth_id = auth.uid())
  )
  OR company_id IN (
    SELECT company_id
    FROM company_members
    WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      AND role IN ('hr', 'admin')
      AND confirmed = true
  )
);

-- JOBS
DROP POLICY IF EXISTS jobs_select_open_or_manager ON jobs;
DROP POLICY IF EXISTS jobs_insert_manager ON jobs;
DROP POLICY IF EXISTS jobs_update_manager ON jobs;
DROP POLICY IF EXISTS jobs_delete_manager ON jobs;

CREATE POLICY jobs_select_open_or_manager ON jobs
FOR SELECT TO authenticated
USING (
  status = 'open'
  OR company_id IN (
    SELECT id
    FROM companies
    WHERE created_by = (SELECT id FROM users WHERE auth_id = auth.uid())
  )
  OR company_id IN (
    SELECT company_id
    FROM company_members
    WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      AND role IN ('hr', 'admin')
      AND confirmed = true
  )
);

CREATE POLICY jobs_insert_manager ON jobs
FOR INSERT TO authenticated
WITH CHECK (
  company_id IN (
    SELECT id
    FROM companies
    WHERE created_by = (SELECT id FROM users WHERE auth_id = auth.uid())
  )
  OR company_id IN (
    SELECT company_id
    FROM company_members
    WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      AND role IN ('hr', 'admin')
      AND confirmed = true
  )
);

CREATE POLICY jobs_update_manager ON jobs
FOR UPDATE TO authenticated
USING (
  company_id IN (
    SELECT id
    FROM companies
    WHERE created_by = (SELECT id FROM users WHERE auth_id = auth.uid())
  )
  OR company_id IN (
    SELECT company_id
    FROM company_members
    WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      AND role IN ('hr', 'admin')
      AND confirmed = true
  )
)
WITH CHECK (
  company_id IN (
    SELECT id
    FROM companies
    WHERE created_by = (SELECT id FROM users WHERE auth_id = auth.uid())
  )
  OR company_id IN (
    SELECT company_id
    FROM company_members
    WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      AND role IN ('hr', 'admin')
      AND confirmed = true
  )
);

CREATE POLICY jobs_delete_manager ON jobs
FOR DELETE TO authenticated
USING (
  company_id IN (
    SELECT id
    FROM companies
    WHERE created_by = (SELECT id FROM users WHERE auth_id = auth.uid())
  )
  OR company_id IN (
    SELECT company_id
    FROM company_members
    WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      AND role IN ('hr', 'admin')
      AND confirmed = true
  )
);

-- REFERRALS
DROP POLICY IF EXISTS referrals_read ON referrals;
DROP POLICY IF EXISTS referrals_select_visible ON referrals;
DROP POLICY IF EXISTS referrals_insert_participant ON referrals;
DROP POLICY IF EXISTS referrals_update_visible ON referrals;
DROP POLICY IF EXISTS referrals_delete_visible ON referrals;

CREATE POLICY referrals_select_visible ON referrals
FOR SELECT TO authenticated
USING (
  applicant_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR referrer_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR company_id IN (
    SELECT id
    FROM companies
    WHERE created_by = (SELECT id FROM users WHERE auth_id = auth.uid())
  )
  OR company_id IN (
    SELECT company_id
    FROM company_members
    WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      AND role IN ('hr', 'admin')
      AND confirmed = true
  )
);

CREATE POLICY referrals_insert_participant ON referrals
FOR INSERT TO authenticated
WITH CHECK (
  applicant_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR referrer_id = (SELECT id FROM users WHERE auth_id = auth.uid())
);

CREATE POLICY referrals_update_visible ON referrals
FOR UPDATE TO authenticated
USING (
  applicant_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR referrer_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR company_id IN (
    SELECT id
    FROM companies
    WHERE created_by = (SELECT id FROM users WHERE auth_id = auth.uid())
  )
  OR company_id IN (
    SELECT company_id
    FROM company_members
    WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      AND role IN ('hr', 'admin')
      AND confirmed = true
  )
)
WITH CHECK (
  applicant_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR referrer_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR company_id IN (
    SELECT id
    FROM companies
    WHERE created_by = (SELECT id FROM users WHERE auth_id = auth.uid())
  )
  OR company_id IN (
    SELECT company_id
    FROM company_members
    WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      AND role IN ('hr', 'admin')
      AND confirmed = true
  )
);

CREATE POLICY referrals_delete_visible ON referrals
FOR DELETE TO authenticated
USING (
  applicant_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR referrer_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR company_id IN (
    SELECT id
    FROM companies
    WHERE created_by = (SELECT id FROM users WHERE auth_id = auth.uid())
  )
  OR company_id IN (
    SELECT company_id
    FROM company_members
    WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      AND role IN ('hr', 'admin')
      AND confirmed = true
  )
);

-- CONVERSATIONS
DROP POLICY IF EXISTS conversations_select_participant ON conversations;
DROP POLICY IF EXISTS conversations_insert_any_authenticated ON conversations;

CREATE POLICY conversations_select_participant ON conversations
FOR SELECT TO authenticated
USING (
  id IN (
    SELECT conversation_id
    FROM conversation_participants
    WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  )
);

CREATE POLICY conversations_insert_any_authenticated ON conversations
FOR INSERT TO authenticated
WITH CHECK (true);

-- CONVERSATION PARTICIPANTS
DROP POLICY IF EXISTS conversation_participants_select_visible ON conversation_participants;
DROP POLICY IF EXISTS conversation_participants_insert_self ON conversation_participants;
DROP POLICY IF EXISTS conversation_participants_delete_self ON conversation_participants;

CREATE POLICY conversation_participants_select_visible ON conversation_participants
FOR SELECT TO authenticated
USING (
  conversation_id IN (
    SELECT conversation_id
    FROM conversation_participants
    WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  )
);

CREATE POLICY conversation_participants_insert_self ON conversation_participants
FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY conversation_participants_delete_self ON conversation_participants
FOR DELETE TO authenticated
USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- MESSAGES
DROP POLICY IF EXISTS messages_read ON messages;
DROP POLICY IF EXISTS messages_select_participant ON messages;
DROP POLICY IF EXISTS messages_insert_sender ON messages;
DROP POLICY IF EXISTS messages_update_participant ON messages;

CREATE POLICY messages_select_participant ON messages
FOR SELECT TO authenticated
USING (
  conversation_id IN (
    SELECT conversation_id
    FROM conversation_participants
    WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  )
);

CREATE POLICY messages_insert_sender ON messages
FOR INSERT TO authenticated
WITH CHECK (
  sender_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  AND conversation_id IN (
    SELECT conversation_id
    FROM conversation_participants
    WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  )
);

CREATE POLICY messages_update_participant ON messages
FOR UPDATE TO authenticated
USING (
  conversation_id IN (
    SELECT conversation_id
    FROM conversation_participants
    WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  )
)
WITH CHECK (
  conversation_id IN (
    SELECT conversation_id
    FROM conversation_participants
    WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  )
);

-- UPDATES
DROP POLICY IF EXISTS updates_select_all ON updates;
DROP POLICY IF EXISTS updates_insert_owner ON updates;
DROP POLICY IF EXISTS updates_update_owner ON updates;
DROP POLICY IF EXISTS updates_delete_owner ON updates;

CREATE POLICY updates_select_all ON updates
FOR SELECT TO authenticated
USING (true);

CREATE POLICY updates_insert_owner ON updates
FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY updates_update_owner ON updates
FOR UPDATE TO authenticated
USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()))
WITH CHECK (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY updates_delete_owner ON updates
FOR DELETE TO authenticated
USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- REFERRAL EVENTS
DROP POLICY IF EXISTS referral_events_select_visible ON referral_events;
DROP POLICY IF EXISTS referral_events_insert_actor_or_system ON referral_events;

CREATE POLICY referral_events_select_visible ON referral_events
FOR SELECT TO authenticated
USING (
  referral_id IN (
    SELECT id
    FROM referrals
    WHERE applicant_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      OR referrer_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      OR company_id IN (
        SELECT id
        FROM companies
        WHERE created_by = (SELECT id FROM users WHERE auth_id = auth.uid())
      )
      OR company_id IN (
        SELECT company_id
        FROM company_members
        WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
          AND role IN ('hr', 'admin')
          AND confirmed = true
      )
  )
);

CREATE POLICY referral_events_insert_actor_or_system ON referral_events
FOR INSERT TO authenticated
WITH CHECK (
  referral_id IN (
    SELECT id
    FROM referrals
    WHERE applicant_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      OR referrer_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      OR company_id IN (
        SELECT id
        FROM companies
        WHERE created_by = (SELECT id FROM users WHERE auth_id = auth.uid())
      )
      OR company_id IN (
        SELECT company_id
        FROM company_members
        WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
          AND role IN ('hr', 'admin')
          AND confirmed = true
      )
  )
  AND (
    actor_id IS NULL
    OR actor_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  )
);
