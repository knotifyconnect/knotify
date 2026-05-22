-- ==========================================================================
-- Phase 1: Admin/roles + Cafés + Meetings
-- ==========================================================================

-- ── Admin flag on users ────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- ── Role requests (HR / company_owner — needs admin approval) ──────────────
CREATE TABLE IF NOT EXISTS role_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_role TEXT NOT NULL CHECK (requested_role IN ('hr', 'company_owner')),
  company_name TEXT,
  email_domain TEXT,
  email_verified BOOLEAN DEFAULT false,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  reviewer_id UUID REFERENCES users(id),
  review_note TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS role_requests_user_idx ON role_requests (user_id);
CREATE INDEX IF NOT EXISTS role_requests_status_idx ON role_requests (status);

-- ── Cafés (admin-managed) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cafes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT DEFAULT 'Munich',
  perk_text TEXT,
  photo_url TEXT,
  hours_text TEXT,
  lat DECIMAL(9, 6),
  lng DECIMAL(9, 6),
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cafes_active_idx ON cafes (is_active);

-- ── Café check-ins (discount-code redemption tracking) ─────────────────────
CREATE TABLE IF NOT EXISTS cafe_checkins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cafe_id UUID NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  discount_code TEXT NOT NULL,
  redeemed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (discount_code)
);

CREATE INDEX IF NOT EXISTS cafe_checkins_user_idx ON cafe_checkins (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cafe_checkins_cafe_idx ON cafe_checkins (cafe_id, created_at DESC);

-- ── Meetings (real "Coffee with X" data) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  initiator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cafe_id UUID REFERENCES cafes(id) ON DELETE SET NULL,
  location_text TEXT, -- fallback if no cafe selected
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('proposed', 'confirmed', 'declined', 'cancelled', 'completed')) DEFAULT 'proposed',
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (initiator_id <> invitee_id)
);

CREATE INDEX IF NOT EXISTS meetings_initiator_idx ON meetings (initiator_id, scheduled_at);
CREATE INDEX IF NOT EXISTS meetings_invitee_idx ON meetings (invitee_id, scheduled_at);
CREATE INDEX IF NOT EXISTS meetings_status_idx ON meetings (status);

-- ── Seed knotify team admins ───────────────────────────────────────────────
UPDATE users SET is_admin = true
 WHERE email IN ('armen.ter-minasyan@tum.de', 'jaydip.gohil@tum.de');

-- Note: if the admin emails haven't signed up yet, run this manually
-- after they do, or create signup hook. For now, seeding handles existing rows.
