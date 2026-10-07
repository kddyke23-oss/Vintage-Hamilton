-- ─── Blog polls + per-post comment on/off switch ───────────────────────────
-- Keith, 2026-10-07:
--   1. A Blog post can carry a poll. Only the ORIGINAL POSTER can create it or
--      add more options later (e.g. after reading the comments) -- not even
--      an admin. Any signed-in resident can vote.
--   2. The original poster OR an admin can turn comments off on any Blog post
--      or Calendar event (and back on). The switch is enforced here in the
--      database too (trigger below), not just hidden in the UI.
--
-- Safe to re-run. Run in the Supabase SQL Editor BEFORE deploying the matching
-- front-end build (the Blog now selects blog_posts.comments_enabled).

-- ─── 1. Comments on/off ─────────────────────────────────────────────────────
ALTER TABLE blog_posts      ADD COLUMN IF NOT EXISTS comments_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS comments_enabled boolean NOT NULL DEFAULT true;

-- Reject new comments on a post/event that has comments turned off.
-- SECURITY DEFINER so the lookup isn't affected by the commenter's RLS.
CREATE OR REPLACE FUNCTION enforce_blog_comments_enabled() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM blog_posts WHERE id = NEW.post_id AND comments_enabled = false) THEN
    RAISE EXCEPTION 'Comments are turned off for this post';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION enforce_calendar_comments_enabled() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM calendar_events WHERE id = NEW.event_id AND comments_enabled = false) THEN
    RAISE EXCEPTION 'Comments are turned off for this event';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS blog_comments_enabled_check ON blog_comments;
CREATE TRIGGER blog_comments_enabled_check
  BEFORE INSERT ON blog_comments
  FOR EACH ROW EXECUTE FUNCTION enforce_blog_comments_enabled();

DROP TRIGGER IF EXISTS calendar_comments_enabled_check ON calendar_comments;
CREATE TRIGGER calendar_comments_enabled_check
  BEFORE INSERT ON calendar_comments
  FOR EACH ROW EXECUTE FUNCTION enforce_calendar_comments_enabled();

-- ─── 2. Polls ───────────────────────────────────────────────────────────────
-- blog_posts.id's type isn't recorded in the repo's SQL, so read it from the
-- catalog rather than guess (same int-vs-bigint FK trap as calendar_comments).
-- One poll per post (post_id UNIQUE).
DO $$
DECLARE post_id_type text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod) INTO post_id_type
  FROM pg_attribute a
  WHERE a.attrelid = 'public.blog_posts'::regclass AND a.attname = 'id' AND NOT a.attisdropped;

  EXECUTE format($f$
    CREATE TABLE IF NOT EXISTS blog_polls (
      id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      post_id        %s NOT NULL UNIQUE REFERENCES blog_posts(id) ON DELETE CASCADE,
      question       text NOT NULL,
      allow_multiple boolean NOT NULL DEFAULT false,
      created_by     uuid NOT NULL,   -- the original poster (auth.uid()); no FK, see calendar_comments.sql
      created_at     timestamptz NOT NULL DEFAULT now()
    )$f$, post_id_type);
END $$;

CREATE TABLE IF NOT EXISTS blog_poll_options (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  poll_id    bigint NOT NULL REFERENCES blog_polls(id) ON DELETE CASCADE,
  label      text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, poll_id)
);
CREATE INDEX IF NOT EXISTS idx_blog_poll_options_poll_id ON blog_poll_options (poll_id);

CREATE TABLE IF NOT EXISTS blog_poll_votes (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  poll_id    bigint NOT NULL,
  option_id  bigint NOT NULL,
  voter_id   uuid   NOT NULL,         -- auth.uid()
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (option_id, voter_id),
  -- the option must belong to the poll being voted in
  FOREIGN KEY (option_id, poll_id) REFERENCES blog_poll_options (id, poll_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_blog_poll_votes_poll_id ON blog_poll_votes (poll_id);

-- Single-choice polls: one vote per resident per poll.
CREATE OR REPLACE FUNCTION enforce_single_poll_vote() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM blog_polls WHERE id = NEW.poll_id AND allow_multiple = false)
     AND EXISTS (SELECT 1 FROM blog_poll_votes WHERE poll_id = NEW.poll_id AND voter_id = NEW.voter_id) THEN
    RAISE EXCEPTION 'This poll allows one choice only';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS blog_poll_single_vote_check ON blog_poll_votes;
CREATE TRIGGER blog_poll_single_vote_check
  BEFORE INSERT ON blog_poll_votes
  FOR EACH ROW EXECUTE FUNCTION enforce_single_poll_vote();

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE blog_polls        ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_poll_votes   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Residents can view polls" ON blog_polls;
CREATE POLICY "Residents can view polls" ON blog_polls
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Only the post's own author can attach a poll to it
DROP POLICY IF EXISTS "Post author can create poll" ON blog_polls;
CREATE POLICY "Post author can create poll" ON blog_polls
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM blog_posts bp WHERE bp.id = post_id AND bp.created_by = auth.uid())
  );

DROP POLICY IF EXISTS "Residents can view poll options" ON blog_poll_options;
CREATE POLICY "Residents can view poll options" ON blog_poll_options
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Only the poll's original poster can add options (admins deliberately excluded)
DROP POLICY IF EXISTS "Poll owner can add options" ON blog_poll_options;
CREATE POLICY "Poll owner can add options" ON blog_poll_options
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM blog_polls p WHERE p.id = poll_id AND p.created_by = auth.uid())
  );

DROP POLICY IF EXISTS "Residents can view votes" ON blog_poll_votes;
CREATE POLICY "Residents can view votes" ON blog_poll_votes
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Residents can vote as themselves" ON blog_poll_votes;
CREATE POLICY "Residents can vote as themselves" ON blog_poll_votes
  FOR INSERT WITH CHECK (voter_id = auth.uid());

DROP POLICY IF EXISTS "Residents can change their own vote" ON blog_poll_votes;
CREATE POLICY "Residents can change their own vote" ON blog_poll_votes
  FOR DELETE USING (voter_id = auth.uid());
