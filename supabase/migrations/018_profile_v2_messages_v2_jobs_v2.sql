-- ═══════════════════════════════════════════════════════════════════════════
-- 018  Profile v2 · Messages v2 · Jobs v2
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Extend users table ────────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS headline       TEXT CHECK (char_length(headline) <= 120),
  ADD COLUMN IF NOT EXISTS website_url    TEXT CHECK (char_length(website_url) <= 200),
  ADD COLUMN IF NOT EXISTS github_url     TEXT CHECK (char_length(github_url) <= 200),
  ADD COLUMN IF NOT EXISTS languages      TEXT[] DEFAULT '{}';

-- Extend bio from 160 → 500 chars
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_bio_check;
ALTER TABLE users ADD CONSTRAINT users_bio_check CHECK (char_length(bio) <= 500);

-- ── 2. Skill catalog (curated master list) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS skill_catalog (
  id      SERIAL PRIMARY KEY,
  name    TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL  -- 'Tech' | 'Design' | 'Business' | 'Science' | 'Other'
);

-- Drop old free-text skills table and replace with join table
-- (Keep old table for backward compat — rename it; idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'skills' AND table_schema = 'public') THEN
    ALTER TABLE skills RENAME TO skills_legacy;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS user_skills (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id   INTEGER NOT NULL REFERENCES skill_catalog(id) ON DELETE CASCADE,
  source     TEXT CHECK (source IN ('cv_extracted', 'manual')) DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, skill_id)
);

CREATE INDEX IF NOT EXISTS user_skills_user_idx ON user_skills (user_id);

-- ── 3. Seed skill_catalog ────────────────────────────────────────────────────
INSERT INTO skill_catalog (name, category) VALUES
  -- Tech
  ('Python',              'Tech'),
  ('JavaScript',          'Tech'),
  ('TypeScript',          'Tech'),
  ('React',               'Tech'),
  ('Node.js',             'Tech'),
  ('SQL',                 'Tech'),
  ('PostgreSQL',          'Tech'),
  ('MongoDB',             'Tech'),
  ('Redis',               'Tech'),
  ('GraphQL',             'Tech'),
  ('REST APIs',           'Tech'),
  ('Docker',              'Tech'),
  ('Kubernetes',          'Tech'),
  ('AWS',                 'Tech'),
  ('GCP',                 'Tech'),
  ('Azure',               'Tech'),
  ('Git',                 'Tech'),
  ('Linux',               'Tech'),
  ('Java',                'Tech'),
  ('C++',                 'Tech'),
  ('Go',                  'Tech'),
  ('Rust',                'Tech'),
  ('Swift',               'Tech'),
  ('Kotlin',              'Tech'),
  ('Flutter',             'Tech'),
  ('React Native',        'Tech'),
  ('TensorFlow',          'Tech'),
  ('PyTorch',             'Tech'),
  ('Machine Learning',    'Tech'),
  ('Deep Learning',       'Tech'),
  ('NLP',                 'Tech'),
  ('Computer Vision',     'Tech'),
  ('Data Engineering',    'Tech'),
  ('Spark',               'Tech'),
  ('Tableau',             'Tech'),
  ('Power BI',            'Tech'),
  ('Cybersecurity',       'Tech'),
  ('Blockchain',          'Tech'),
  ('Solidity',            'Tech'),
  -- Design
  ('Figma',               'Design'),
  ('Sketch',              'Design'),
  ('Adobe XD',            'Design'),
  ('UI Design',           'Design'),
  ('UX Research',         'Design'),
  ('Prototyping',         'Design'),
  ('Design Systems',      'Design'),
  ('Motion Design',       'Design'),
  ('Illustration',        'Design'),
  ('3D Modeling',         'Design'),
  ('Blender',             'Design'),
  -- Business
  ('Product Management',  'Business'),
  ('Agile',               'Business'),
  ('Scrum',               'Business'),
  ('OKRs',                'Business'),
  ('Market Research',     'Business'),
  ('Growth Hacking',      'Business'),
  ('SEO',                 'Business'),
  ('Content Marketing',   'Business'),
  ('Sales',               'Business'),
  ('Fundraising',         'Business'),
  ('Financial Modeling',  'Business'),
  ('Business Strategy',   'Business'),
  ('Operations',          'Business'),
  ('People Management',   'Business'),
  ('Public Speaking',     'Business'),
  -- Science
  ('Statistics',          'Science'),
  ('R',                   'Science'),
  ('MATLAB',              'Science'),
  ('Bioinformatics',      'Science'),
  ('Computational Biology','Science'),
  ('Chemistry',           'Science'),
  ('Physics',             'Science'),
  ('Robotics',            'Science'),
  ('Control Systems',     'Science'),
  ('Signal Processing',   'Science')
ON CONFLICT (name) DO NOTHING;

-- ── 4. Education entries ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_education (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  institution TEXT NOT NULL CHECK (char_length(institution) <= 200),
  degree      TEXT CHECK (char_length(degree) <= 100),       -- e.g. "Bachelor of Science"
  field       TEXT CHECK (char_length(field) <= 100),        -- e.g. "Computer Science"
  start_year  SMALLINT,
  end_year    SMALLINT,
  description TEXT CHECK (char_length(description) <= 500),
  sort_order  SMALLINT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_education_user_idx ON user_education (user_id);

-- ── 5. Experience entries ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_experience (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company     TEXT NOT NULL CHECK (char_length(company) <= 200),
  role        TEXT NOT NULL CHECK (char_length(role) <= 120),
  start_date  DATE,
  end_date    DATE,                            -- NULL = current
  description TEXT CHECK (char_length(description) <= 800),
  sort_order  SMALLINT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_experience_user_idx ON user_experience (user_id);

-- ── 6. Message reactions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_reactions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id  UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji       TEXT NOT NULL CHECK (emoji IN ('❤️','👍','😂','🙌','🔥')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS message_reactions_msg_idx ON message_reactions (message_id);

-- Add delivered_at column to messages (seen already tracked via read_at)
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

-- ── 7. Saved jobs ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_jobs (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id     UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, job_id)
);

-- Add employment_type to jobs
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS employment_type TEXT
    CHECK (employment_type IN ('full_time','part_time','contract','internship','freelance'));

-- ── 8. Pending cafe suggestions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pending_cafes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  suggested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  address     TEXT NOT NULL,
  notes       TEXT CHECK (char_length(notes) <= 400),
  status      TEXT CHECK (status IN ('pending','approved','rejected')) DEFAULT 'pending',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Add current_checkins count to cafes (updated by trigger)
ALTER TABLE cafes
  ADD COLUMN IF NOT EXISTS current_checkins INTEGER DEFAULT 0;

-- Trigger: recompute current_checkins whenever a checkin is inserted/deleted
-- A checkin counts if created_at > NOW() - INTERVAL '3 hours'
CREATE OR REPLACE FUNCTION refresh_cafe_checkin_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE cafes
  SET current_checkins = (
    SELECT COUNT(*)
    FROM cafe_checkins
    WHERE cafe_id = COALESCE(NEW.cafe_id, OLD.cafe_id)
      AND created_at > NOW() - INTERVAL '3 hours'
  )
  WHERE id = COALESCE(NEW.cafe_id, OLD.cafe_id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_cafe_checkin_count ON cafe_checkins;
CREATE TRIGGER trg_cafe_checkin_count
AFTER INSERT OR DELETE ON cafe_checkins
FOR EACH ROW EXECUTE FUNCTION refresh_cafe_checkin_count();

-- ── 9. Seed real Munich cafes/coworking venues ───────────────────────────────
-- Per-row ON CONFLICT (slug) for idempotency (safe to re-run)
INSERT INTO cafes (name, slug, address, city, perk_text, hours_text, lat, lng, is_active) VALUES
  ('Café Luitpold',                 'cafe-luitpold',         'Brienner Str. 11, 80333 Munich',     'Munich', '10% off any drink',  'Mon–Sat 8am–8pm',    48.143190, 11.570160, true),
  ('Lost Weekend',                  'lost-weekend',          'Schellingstr. 3, 80799 Munich',      'Munich', 'Free filter coffee', 'Daily 9am–10pm',     48.151340, 11.581310, true),
  ('Zentralcafé',                   'zentralcafe',           'Marienplatz 28, 80331 Munich',       'Munich', '10% off food',       'Mon–Fri 8am–7pm',    48.136970, 11.575620, true),
  ('Café Jasmin',                   'cafe-jasmin',           'Steinheilstr. 20, 80333 Munich',     'Munich', 'Free Hausgebäck',    'Mon–Sat 9am–8pm',    48.149070, 11.569370, true),
  ('Schmalznudel (Café Frischhut)', 'schmalznudel',          'Prälat-Zistl-Str. 8, 80331 Munich',  'Munich', '10% off',            'Thu–Tue 8am–6pm',    48.136180, 11.574150, true),
  ('Café am Beethovenplatz',        'cafe-beethovenplatz',   'Goethestr. 51, 80336 Munich',        'Munich', 'Free tea refill',    'Mon–Sun 9am–1am',    48.133020, 11.563760, true),
  ('The Workspace Maxvorstadt',     'workspace-maxvorstadt', 'Türkenstr. 85, 80799 Munich',        'Munich', 'Free hot drink',     'Mon–Fri 8am–8pm',    48.152250, 11.583440, true),
  ('Mindspace Munich',              'mindspace-munich',      'Rosenheimer Str. 143c, 81671 Munich','Munich', '1hr free desk',      'Mon–Fri 9am–6pm',    48.125660, 11.603020, true),
  ('Betahaus Munich',               'betahaus-munich',       'Rosenheimer Str. 145d, 81671 Munich','Munich', 'Free coffee intro',  'Mon–Fri 9am–6pm',    48.125280, 11.602190, true),
  ('Café Rischart am Marienplatz',  'rischart-marienplatz',  'Marienplatz 18, 80331 Munich',       'Munich', '10% off pastries',   'Mon–Sat 7am–8pm',    48.137310, 11.575900, true),
  ('TU Munich Mensa',               'tum-mensa',             'Arcisstr. 17, 80333 Munich',         'Munich', 'Student discount',   'Mon–Fri 11am–2pm',   48.149720, 11.568760, true),
  ('Milk & Honey Coffee',           'milk-honey-coffee',     'Klenzestr. 63, 80469 Munich',        'Munich', 'Free shot upgrade',  'Mon–Sun 8am–6pm',    48.129280, 11.574370, true),
  ('Man Versus Machine',            'man-versus-machine',    'Müllerstr. 23, 80469 Munich',        'Munich', 'Latte art on us',    'Mon–Fri 7:30am–5pm', 48.130920, 11.569410, true),
  ('Flat White Munich',             'flat-white-munich',     'Frauenplatz 3, 80331 Munich',        'Munich', 'Free biscuit',       'Mon–Sat 8am–6pm',    48.138290, 11.573740, true)
ON CONFLICT (slug) DO NOTHING;

-- ── 10. RLS for new tables ────────────────────────────────────────────────────
ALTER TABLE user_education     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_experience    ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_skills        ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_jobs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_cafes      ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first for idempotency, then re-create
DROP POLICY IF EXISTS "education_select"  ON user_education;
DROP POLICY IF EXISTS "education_insert"  ON user_education;
DROP POLICY IF EXISTS "education_update"  ON user_education;
DROP POLICY IF EXISTS "education_delete"  ON user_education;
DROP POLICY IF EXISTS "experience_select" ON user_experience;
DROP POLICY IF EXISTS "experience_insert" ON user_experience;
DROP POLICY IF EXISTS "experience_update" ON user_experience;
DROP POLICY IF EXISTS "experience_delete" ON user_experience;
DROP POLICY IF EXISTS "uskills_select"    ON user_skills;
DROP POLICY IF EXISTS "uskills_insert"    ON user_skills;
DROP POLICY IF EXISTS "uskills_delete"    ON user_skills;
DROP POLICY IF EXISTS "mreact_select"     ON message_reactions;
DROP POLICY IF EXISTS "mreact_insert"     ON message_reactions;
DROP POLICY IF EXISTS "mreact_delete"     ON message_reactions;
DROP POLICY IF EXISTS "saved_jobs_select" ON saved_jobs;
DROP POLICY IF EXISTS "saved_jobs_insert" ON saved_jobs;
DROP POLICY IF EXISTS "saved_jobs_delete" ON saved_jobs;
DROP POLICY IF EXISTS "pcafe_select"      ON pending_cafes;
DROP POLICY IF EXISTS "pcafe_insert"      ON pending_cafes;

-- user_education: owner can do everything, others can read
CREATE POLICY "education_select" ON user_education FOR SELECT USING (true);
CREATE POLICY "education_insert" ON user_education FOR INSERT WITH CHECK (auth.uid() = (SELECT auth_id FROM users WHERE id = user_id));
CREATE POLICY "education_update" ON user_education FOR UPDATE USING       (auth.uid() = (SELECT auth_id FROM users WHERE id = user_id));
CREATE POLICY "education_delete" ON user_education FOR DELETE USING       (auth.uid() = (SELECT auth_id FROM users WHERE id = user_id));

-- user_experience: same
CREATE POLICY "experience_select" ON user_experience FOR SELECT USING (true);
CREATE POLICY "experience_insert" ON user_experience FOR INSERT WITH CHECK (auth.uid() = (SELECT auth_id FROM users WHERE id = user_id));
CREATE POLICY "experience_update" ON user_experience FOR UPDATE USING       (auth.uid() = (SELECT auth_id FROM users WHERE id = user_id));
CREATE POLICY "experience_delete" ON user_experience FOR DELETE USING       (auth.uid() = (SELECT auth_id FROM users WHERE id = user_id));

-- user_skills: owner can manage, public read
CREATE POLICY "uskills_select" ON user_skills FOR SELECT USING (true);
CREATE POLICY "uskills_insert" ON user_skills FOR INSERT WITH CHECK (auth.uid() = (SELECT auth_id FROM users WHERE id = user_id));
CREATE POLICY "uskills_delete" ON user_skills FOR DELETE USING       (auth.uid() = (SELECT auth_id FROM users WHERE id = user_id));

-- message_reactions: participants can react
CREATE POLICY "mreact_select" ON message_reactions FOR SELECT USING (true);
CREATE POLICY "mreact_insert" ON message_reactions FOR INSERT WITH CHECK (auth.uid() = (SELECT auth_id FROM users WHERE id = user_id));
CREATE POLICY "mreact_delete" ON message_reactions FOR DELETE USING       (auth.uid() = (SELECT auth_id FROM users WHERE id = user_id));

-- saved_jobs
CREATE POLICY "saved_jobs_select" ON saved_jobs FOR SELECT USING       (auth.uid() = (SELECT auth_id FROM users WHERE id = user_id));
CREATE POLICY "saved_jobs_insert" ON saved_jobs FOR INSERT WITH CHECK (auth.uid() = (SELECT auth_id FROM users WHERE id = user_id));
CREATE POLICY "saved_jobs_delete" ON saved_jobs FOR DELETE USING       (auth.uid() = (SELECT auth_id FROM users WHERE id = user_id));

-- pending_cafes: anyone can suggest
CREATE POLICY "pcafe_select" ON pending_cafes FOR SELECT USING (true);
CREATE POLICY "pcafe_insert" ON pending_cafes FOR INSERT WITH CHECK (true);

-- ── 11. Enable Realtime on messages ──────────────────────────────────────────
-- Run in Supabase dashboard: ALTER PUBLICATION supabase_realtime ADD TABLE messages;
-- (Cannot be run in a migration file — must be done via the Supabase dashboard or CLI)
