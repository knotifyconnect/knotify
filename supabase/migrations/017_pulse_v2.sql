-- ==========================================================================
-- Phase 3: Pulse v2 — channels, posts, votes, reactions, comments
-- ==========================================================================
-- Posts can be public-global (channel_id IS NULL) or scoped to a channel.
-- Each post has both upvotes (reddit-style integer) and emoji reactions
-- (instagram-style multi-emoji aggregate). Comments are flat with one reply
-- level (parent_id can reference another comment, but UI flattens beyond 1).

-- ── Channels (communities/groups) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  cover_url TEXT,
  is_public BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  member_count INT DEFAULT 0,
  post_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS channels_public_idx ON channels (is_public, created_at DESC);

-- ── Channel members ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS channel_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('member', 'moderator', 'owner')) DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS channel_members_user_idx ON channel_members (user_id);

-- ── Posts ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES channels(id) ON DELETE SET NULL,
  title TEXT,
  body TEXT NOT NULL CHECK (char_length(body) <= 4000),
  image_url TEXT,
  link_url TEXT,
  upvote_count INT DEFAULT 0,
  comment_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS posts_channel_idx ON posts (channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS posts_author_idx ON posts (author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS posts_global_idx ON posts (created_at DESC) WHERE channel_id IS NULL;
CREATE INDEX IF NOT EXISTS posts_hot_idx ON posts (upvote_count DESC, created_at DESC);

-- ── Upvotes (1 row per user per post) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_votes (
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value SMALLINT NOT NULL CHECK (value IN (-1, 1)) DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

-- ── Emoji reactions (multi-emoji per user) ────────────────────────────────
CREATE TABLE IF NOT EXISTS post_reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (char_length(emoji) <= 16),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (post_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS post_reactions_post_idx ON post_reactions (post_id);

-- ── Comments (flat with reply level) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES post_comments(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1500),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS post_comments_post_idx ON post_comments (post_id, created_at);
CREATE INDEX IF NOT EXISTS post_comments_parent_idx ON post_comments (parent_id);

-- ── Triggers to keep denormalized counts in sync ──────────────────────────

-- vote count
CREATE OR REPLACE FUNCTION post_votes_update_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET upvote_count = upvote_count + NEW.value WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET upvote_count = upvote_count - OLD.value WHERE id = OLD.post_id;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE posts SET upvote_count = upvote_count + NEW.value - OLD.value WHERE id = NEW.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS post_votes_count_trg ON post_votes;
CREATE TRIGGER post_votes_count_trg
AFTER INSERT OR UPDATE OR DELETE ON post_votes
FOR EACH ROW EXECUTE FUNCTION post_votes_update_count();

-- comment count
CREATE OR REPLACE FUNCTION post_comments_update_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET comment_count = comment_count - 1 WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS post_comments_count_trg ON post_comments;
CREATE TRIGGER post_comments_count_trg
AFTER INSERT OR DELETE ON post_comments
FOR EACH ROW EXECUTE FUNCTION post_comments_update_count();

-- channel member/post counts
CREATE OR REPLACE FUNCTION channel_members_update_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE channels SET member_count = member_count + 1 WHERE id = NEW.channel_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE channels SET member_count = member_count - 1 WHERE id = OLD.channel_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS channel_members_count_trg ON channel_members;
CREATE TRIGGER channel_members_count_trg
AFTER INSERT OR DELETE ON channel_members
FOR EACH ROW EXECUTE FUNCTION channel_members_update_count();

CREATE OR REPLACE FUNCTION posts_update_channel_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.channel_id IS NOT NULL THEN
    UPDATE channels SET post_count = post_count + 1 WHERE id = NEW.channel_id;
  ELSIF TG_OP = 'DELETE' AND OLD.channel_id IS NOT NULL THEN
    UPDATE channels SET post_count = post_count - 1 WHERE id = OLD.channel_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS posts_channel_count_trg ON posts;
CREATE TRIGGER posts_channel_count_trg
AFTER INSERT OR DELETE ON posts
FOR EACH ROW EXECUTE FUNCTION posts_update_channel_count();

-- ── Storage bucket for post images ────────────────────────────────────────
-- The API auto-creates this on first upload, but you can also create it now:
INSERT INTO storage.buckets (id, name, public)
VALUES ('post-images', 'post-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read of post-images, authed insert (the API uses service role anyway)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'post_images_public_read'
  ) THEN
    CREATE POLICY post_images_public_read ON storage.objects
      FOR SELECT TO public USING (bucket_id = 'post-images');
  END IF;
END $$;

-- ── Seed a few starter public channels ────────────────────────────────────
INSERT INTO channels (slug, name, description, is_public)
VALUES
  ('munich', 'Munich', 'Local meetups, coffee, and city life.', true),
  ('careers', 'Careers', 'Job hunting, interviews, and growth tips.', true),
  ('builders', 'Builders', 'What you''re shipping, side-projects, demos.', true),
  ('students', 'Students', 'TUM, LMU and around — study tips, exam crunch.', true)
ON CONFLICT (slug) DO NOTHING;
