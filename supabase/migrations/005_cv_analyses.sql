CREATE TABLE cv_analyses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cv_file_url TEXT NOT NULL,
  raw_text TEXT,
  career_paths JSONB,
  extracted_skills JSONB,
  analysis_status TEXT CHECK (analysis_status IN ('pending', 'complete', 'failed')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
