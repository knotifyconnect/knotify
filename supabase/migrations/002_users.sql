CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id UUID UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  bio TEXT CHECK (char_length(bio) <= 160),
  location_city TEXT DEFAULT 'Munich',
  location_lat DECIMAL(9, 6),
  location_lng DECIMAL(9, 6),
  location_point GEOGRAPHY(POINT, 4326),
  status TEXT CHECK (status IN ('studying', 'open_to_work', 'employed')) DEFAULT 'open_to_work',
  university TEXT,
  current_company TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  linkedin_url TEXT,
  is_hr BOOLEAN DEFAULT false,
  referral_score INTEGER DEFAULT 0,
  is_online BOOLEAN DEFAULT false,
  is_premium BOOLEAN DEFAULT false,
  meetup_opt_in BOOLEAN DEFAULT false,
  meetup_location_sharing BOOLEAN DEFAULT false,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX users_location_idx ON users USING GIST (location_point);
CREATE INDEX users_company_idx ON users (current_company);
