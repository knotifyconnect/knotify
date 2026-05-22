CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  posted_by UUID NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  required_skills TEXT[],
  location TEXT DEFAULT 'Munich',
  is_remote BOOLEAN DEFAULT false,
  salary_min INTEGER,
  salary_max INTEGER,
  status TEXT CHECK (status IN ('open', 'closed', 'draft')) DEFAULT 'open',
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX jobs_company_idx ON jobs (company_id);
CREATE INDEX jobs_status_idx ON jobs (status);
