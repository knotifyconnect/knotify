ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_read ON users FOR SELECT TO authenticated USING (true);
CREATE POLICY users_update ON users FOR UPDATE TO authenticated USING (auth.uid() = auth_id);

CREATE POLICY connections_read ON connections FOR SELECT TO authenticated
USING (
  requester_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR addressee_id = (SELECT id FROM users WHERE auth_id = auth.uid())
);

CREATE POLICY referrals_read ON referrals FOR SELECT TO authenticated
USING (
  applicant_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR referrer_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR company_id IN (
    SELECT company_id FROM company_members
    WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      AND role IN ('hr', 'admin')
  )
);

CREATE POLICY messages_read ON messages FOR SELECT TO authenticated
USING (
  conversation_id IN (
    SELECT conversation_id FROM conversation_participants
    WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  )
);
