-- ─── Calendar event photo ────────────────────────────────────────────────────
-- 2026-09-23 (Keith): lets an event carry an optional photo/flyer, same
-- upload + compression flow as a Community Blog post photo (useImageUpload).
-- Shown in the event detail view, as a thumbnail in List view and the Home
-- page's Upcoming Events, and in the daily-digest email. Masked private /
-- not-sure clubhouse bookings never store one (enforced client-side, same
-- as their description).
--
-- Run once in the Supabase SQL Editor.

ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS photo_url text;

-- Public bucket — the digest email and <img> tags need a public URL.
-- (See BRAIN "Private bucket + getPublicUrl = 404".)
INSERT INTO storage.buckets (id, name, public)
VALUES ('calendar-events', 'calendar-events', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public read calendar event photos" ON storage.objects;
CREATE POLICY "Public read calendar event photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'calendar-events');

DROP POLICY IF EXISTS "Residents can upload calendar event photos" ON storage.objects;
CREATE POLICY "Residents can upload calendar event photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'calendar-events' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Residents can delete calendar event photos" ON storage.objects;
CREATE POLICY "Residents can delete calendar event photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'calendar-events' AND auth.uid() IS NOT NULL);
