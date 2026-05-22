CREATE TABLE referrals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  applicant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  initiated_by TEXT CHECK (initiated_by IN ('applicant', 'referrer')) NOT NULL,
  applicant_note TEXT CHECK (char_length(applicant_note) <= 500),
  status TEXT CHECK (
    status IN (
      'requested',
      'declined',
      'in_progress',
      'submitted',
      'converted'
    )
  ) DEFAULT 'requested',
  relationship_type TEXT CHECK (relationship_type IN ('classmate', 'colleague', 'project', 'other')),
  relationship_duration TEXT,
  observed_work_directly BOOLEAN,
  rating_problem_solving INTEGER CHECK (rating_problem_solving BETWEEN 1 AND 3),
  rating_collaboration INTEGER CHECK (rating_collaboration BETWEEN 1 AND 3),
  rating_role_relevance INTEGER CHECK (rating_role_relevance BETWEEN 1 AND 3),
  note_problem_solving TEXT CHECK (char_length(note_problem_solving) <= 300),
  note_collaboration TEXT CHECK (char_length(note_collaboration) <= 300),
  note_role_relevance TEXT CHECK (char_length(note_role_relevance) <= 300),
  overall_rating INTEGER CHECK (overall_rating BETWEEN 1 AND 3),
  recommendation_text TEXT CHECK (char_length(recommendation_text) <= 280),
  accountability_confirmed BOOLEAN DEFAULT false,
  hr_flagged BOOLEAN DEFAULT false,
  hr_flag_reason TEXT,
  declined_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (job_id, applicant_id),
  CHECK (applicant_id != referrer_id)
);

CREATE INDEX referrals_job_idx ON referrals (job_id);
CREATE INDEX referrals_applicant_idx ON referrals (applicant_id);
CREATE INDEX referrals_referrer_idx ON referrals (referrer_id);
CREATE INDEX referrals_company_idx ON referrals (company_id);
