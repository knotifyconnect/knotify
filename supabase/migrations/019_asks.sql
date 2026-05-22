-- ═══════════════════════════════════════════════════════════════════════════
-- 019  Professional Asks — posts on the network graph (open/resolved)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Asks table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_asks (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content     TEXT NOT NULL CHECK (char_length(content) <= 280),
  status      TEXT CHECK (status IN ('open','resolved')) DEFAULT 'open',
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_asks_user_idx ON user_asks (user_id);
CREATE INDEX IF NOT EXISTS user_asks_status_idx ON user_asks (status, created_at DESC);

-- ── 2. Replies to asks ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ask_replies (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ask_id     UUID NOT NULL REFERENCES user_asks(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL CHECK (char_length(body) <= 800),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ask_replies_ask_idx ON ask_replies (ask_id, created_at);

-- ── 3. Reactions on asks ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ask_reactions (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ask_id     UUID NOT NULL REFERENCES user_asks(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL CHECK (emoji IN ('❤️','👍','🙌','💡','🔥','🤝')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (ask_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS ask_reactions_ask_idx ON ask_reactions (ask_id);

-- ── 4. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE user_asks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ask_replies    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ask_reactions  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "asks_select"  ON user_asks;
DROP POLICY IF EXISTS "asks_insert"  ON user_asks;
DROP POLICY IF EXISTS "asks_update"  ON user_asks;
DROP POLICY IF EXISTS "asks_delete"  ON user_asks;
DROP POLICY IF EXISTS "areply_select" ON ask_replies;
DROP POLICY IF EXISTS "areply_insert" ON ask_replies;
DROP POLICY IF EXISTS "areply_delete" ON ask_replies;
DROP POLICY IF EXISTS "areact_select" ON ask_reactions;
DROP POLICY IF EXISTS "areact_insert" ON ask_reactions;
DROP POLICY IF EXISTS "areact_delete" ON ask_reactions;

-- Asks: public read, owner write/delete
CREATE POLICY "asks_select" ON user_asks FOR SELECT USING (true);
CREATE POLICY "asks_insert" ON user_asks FOR INSERT WITH CHECK (auth.uid() = (SELECT auth_id FROM users WHERE id = user_id));
CREATE POLICY "asks_update" ON user_asks FOR UPDATE USING       (auth.uid() = (SELECT auth_id FROM users WHERE id = user_id));
CREATE POLICY "asks_delete" ON user_asks FOR DELETE USING       (auth.uid() = (SELECT auth_id FROM users WHERE id = user_id));

-- Replies: public read, author can write/delete their own
CREATE POLICY "areply_select" ON ask_replies FOR SELECT USING (true);
CREATE POLICY "areply_insert" ON ask_replies FOR INSERT WITH CHECK (auth.uid() = (SELECT auth_id FROM users WHERE id = user_id));
CREATE POLICY "areply_delete" ON ask_replies FOR DELETE USING       (auth.uid() = (SELECT auth_id FROM users WHERE id = user_id));

-- Reactions: public read, owner write/delete
CREATE POLICY "areact_select" ON ask_reactions FOR SELECT USING (true);
CREATE POLICY "areact_insert" ON ask_reactions FOR INSERT WITH CHECK (auth.uid() = (SELECT auth_id FROM users WHERE id = user_id));
CREATE POLICY "areact_delete" ON ask_reactions FOR DELETE USING       (auth.uid() = (SELECT auth_id FROM users WHERE id = user_id));
