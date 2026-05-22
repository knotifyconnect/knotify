ALTER TABLE referrals
  DROP CONSTRAINT IF EXISTS referrals_status_check;

ALTER TABLE referrals
  ADD CONSTRAINT referrals_status_check
  CHECK (
    status IN (
      'requested',
      'declined',
      'in_progress',
      'submitted',
      'under_review',
      'interview',
      'rejected',
      'hired',
      'converted'
    )
  );

ALTER TABLE referrals
  ADD COLUMN IF NOT EXISTS hr_decision_note TEXT CHECK (char_length(hr_decision_note) <= 600),
  ADD COLUMN IF NOT EXISTS hr_decision_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hr_decision_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS referrals_status_idx ON referrals (status);
