-- ============================================================
-- Daily Digest — Legacy Column Cleanup
-- Run in Supabase SQL Editor AFTER confirming:
--   1. Daily digest has been sending successfully for several days
--   2. create-user edge function is redeployed with notify_digest
--      (no longer writes notify_blog / notify_calendar)
--   3. notify-residents edge function has been deleted
--
-- Idempotent (uses IF EXISTS) — safe to re-run.
-- ============================================================

-- profiles table: drop the two old preference columns
ALTER TABLE profiles DROP COLUMN IF EXISTS notify_blog;
ALTER TABLE profiles DROP COLUMN IF EXISTS notify_calendar;

-- access_requests table: drop the four old preference columns
ALTER TABLE access_requests DROP COLUMN IF EXISTS primary_notify_blog;
ALTER TABLE access_requests DROP COLUMN IF EXISTS primary_notify_calendar;
ALTER TABLE access_requests DROP COLUMN IF EXISTS secondary_notify_blog;
ALTER TABLE access_requests DROP COLUMN IF EXISTS secondary_notify_calendar;

-- Reload PostgREST schema cache so newly-dropped columns don't hang around
NOTIFY pgrst, 'reload schema';

-- Sanity check — should return 0 rows if cleanup succeeded
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'profiles'         AND column_name IN ('notify_blog', 'notify_calendar')) OR
    (table_name = 'access_requests'  AND column_name IN ('primary_notify_blog', 'primary_notify_calendar', 'secondary_notify_blog', 'secondary_notify_calendar'))
  );
