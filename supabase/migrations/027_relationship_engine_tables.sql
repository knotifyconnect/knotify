-- 027_relationship_engine_tables.sql
-- Relationship Priority Engine: Layer 2 insight cache + feedback logging table.
-- The feedback table is write-only in v1; v2 will read it to tune per-user weights.

-- ── Layer 2 insight cache ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS relationship_insights (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id     UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL,
  relationship_type TEXT,          -- 'mentor' | 'peer' | 'collaborator' | etc.
  why_now           TEXT,          -- specific whyNow from Claude
  suggested_action  TEXT,          -- 'reconnect' | 'message' | 'congratulate' | 'welcome' | 'ask' | 'meet'
  tone_guidance     TEXT,
  draft_opener      TEXT,          -- optional first-message draft
  signals_hash      TEXT,          -- hash of Layer 1 signals used; recompute when changed
  computed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (connection_id, user_id)
);

CREATE INDEX IF NOT EXISTS relationship_insights_user_id_idx ON relationship_insights(user_id);
CREATE INDEX IF NOT EXISTS relationship_insights_computed_at_idx ON relationship_insights(computed_at);

-- ── Feedback logging (write-only v1, tuning data for v2) ─────────────────────
CREATE TABLE IF NOT EXISTS relationship_feedback (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL,
  connection_id    UUID NOT NULL,
  priority_score   NUMERIC(5,2),
  dominant_factor  TEXT,          -- 'maintenance' | 'opportunity' | 'milestone' | 'new'
  suggested_action TEXT,
  signals          JSONB,         -- full Layer 1 signals snapshot
  outcome          TEXT,          -- 'acted' | 'dismissed' | 'ignored'
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS relationship_feedback_user_id_idx ON relationship_feedback(user_id);
CREATE INDEX IF NOT EXISTS relationship_feedback_connection_id_idx ON relationship_feedback(connection_id);
