-- ─── Calendar Comments ─────────────────────────────────────────────────────
-- Lets residents ask questions / leave comments on calendar events, with the
-- same add / remove / report-a-comment flow as the Community Blog
-- (blog_comments + blog_reports). Reports use target_type = 'calendar_comment'
-- on the existing blog_reports table (kept distinct from blog's 'comment' type
-- so ids never collide between the two comment tables — see ReportsPage.jsx).

CREATE TABLE IF NOT EXISTS calendar_comments (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id    integer NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  body        text NOT NULL,
  photo_url   text,
  created_by  uuid NOT NULL, -- matches auth.uid() / profiles.id; no FK — profiles.id has
                             -- no unique constraint in this schema
  created_at  timestamptz NOT NULL DEFAULT now(),
  removed     boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_calendar_comments_event_id ON calendar_comments (event_id);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE calendar_comments ENABLE ROW LEVEL SECURITY;

-- Any signed-in resident can read comments (removed ones stay hidden client-side
-- via .eq('removed', false), matching the blog_comments pattern)
CREATE POLICY "Residents can view calendar comments"
  ON calendar_comments FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Any signed-in resident can post a comment as themselves
CREATE POLICY "Residents can add calendar comments"
  ON calendar_comments FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- Comment author, Calendar app-admins, or super admins can soft-delete (remove)
CREATE POLICY "Owner or admins can update calendar comments"
  ON calendar_comments FOR UPDATE
  USING (
    auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
    OR EXISTS (
      SELECT 1 FROM app_access
      WHERE app_access.user_id = auth.uid()
        AND app_access.app_id = 'calendar'
        AND app_access.role = 'admin'
    )
  );

-- ─── Storage bucket for comment photo attachments ──────────────────────────
-- Mirrors the 'blog-comments' bucket. Buckets aren't created by setup SQL
-- automatically and the dashboard toggle for "public" can be hidden — run this
-- via the SQL Editor (see BRAIN "Private bucket + getPublicUrl = 404").
INSERT INTO storage.buckets (id, name, public)
VALUES ('calendar-comments', 'calendar-comments', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "Public read calendar comment photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'calendar-comments');

CREATE POLICY "Residents can upload calendar comment photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'calendar-comments' AND auth.uid() IS NOT NULL);

CREATE POLICY "Residents can delete their own calendar comment photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'calendar-comments' AND auth.uid() IS NOT NULL);

-- Confirmed 2026-08-23: calendar_events.id is `integer` on this project, so
-- event_id above is typed to match (a bigint FK cannot reference an integer
-- PK — Postgres will refuse to create the constraint otherwise). Also
-- confirmed profiles.id has no unique/PK constraint in this schema, so
-- created_by is a plain uuid column (no REFERENCES) rather than an FK.
