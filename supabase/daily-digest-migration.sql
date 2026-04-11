-- ============================================================
-- Daily Digest Migration
-- Replaces notify_blog + notify_calendar with single notify_digest
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Add new column (default TRUE per Spring Fling feedback)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notify_digest BOOLEAN NOT NULL DEFAULT true;

-- 2. Migrate: anyone who had EITHER old pref ON keeps digest ON
--    Anyone who had BOTH off gets digest OFF
UPDATE profiles
SET notify_digest = (COALESCE(notify_blog, false) OR COALESCE(notify_calendar, false));

-- 3. Also add to access_requests table (replace the 4 old columns with 2)
ALTER TABLE access_requests
  ADD COLUMN IF NOT EXISTS primary_notify_digest BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE access_requests
  ADD COLUMN IF NOT EXISTS secondary_notify_digest BOOLEAN DEFAULT true;

-- Migrate access_requests too
UPDATE access_requests
SET primary_notify_digest = (COALESCE(primary_notify_blog, false) OR COALESCE(primary_notify_calendar, false)),
    secondary_notify_digest = (COALESCE(secondary_notify_blog, false) OR COALESCE(secondary_notify_calendar, false));

-- 4. Create digest log table to track last successful send
CREATE TABLE IF NOT EXISTS digest_log (
  id          SERIAL PRIMARY KEY,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  blog_count  INT NOT NULL DEFAULT 0,
  event_count INT NOT NULL DEFAULT 0,
  recipient_count INT NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'success'  -- 'success' | 'error'
);

-- RLS: only service role writes to this
ALTER TABLE digest_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- NOTE: Do NOT drop the old columns yet. Once you've confirmed
-- everything works, run this cleanup:
--
--   ALTER TABLE profiles DROP COLUMN notify_blog;
--   ALTER TABLE profiles DROP COLUMN notify_calendar;
--   ALTER TABLE access_requests DROP COLUMN primary_notify_blog;
--   ALTER TABLE access_requests DROP COLUMN primary_notify_calendar;
--   ALTER TABLE access_requests DROP COLUMN secondary_notify_blog;
--   ALTER TABLE access_requests DROP COLUMN secondary_notify_calendar;
-- ============================================================
