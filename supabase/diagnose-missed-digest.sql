-- ============================================================================
-- Diagnose missed digest content
-- Run in Supabase SQL Editor; safe (read-only)
-- Investigates the Blog/Calendar post created ~Sat Apr 25 22:58 ET
-- that was missing from the daily digest.
-- ============================================================================

-- 1) When did the daily-digest function actually run, and what did it send?
--    Look for the Apr 25, 26, 27 sends. Pay attention to:
--      - Is there a row for Apr 26?
--      - What is sent_at (in UTC)? Convert mentally: Apr 26 22:00 UTC = Apr 26 6:00 PM ET (during EDT).
--      - Was status 'success' or 'partial' / 'error'?
--      - Did blog_count / event_count include the missing items (>0)?
SELECT id,
       sent_at,
       sent_at AT TIME ZONE 'America/New_York' AS sent_at_et,
       blog_count,
       event_count,
       recipient_count,
       status
FROM digest_log
WHERE sent_at >= '2026-04-24'
  AND sent_at <  '2026-04-29'
ORDER BY sent_at;

-- 2) The blog post(s) created late on Apr 25 ET.
--    22:58 ET on Apr 25 = 02:58 UTC on Apr 26 (EDT = UTC-4).
SELECT id,
       title,
       created_by,
       created_at,
       created_at AT TIME ZONE 'America/New_York' AS created_at_et,
       removed
FROM blog_posts
WHERE created_at >= '2026-04-25 20:00:00+00'  -- ~4 PM ET Apr 25
  AND created_at <  '2026-04-26 12:00:00+00'  -- ~8 AM ET Apr 26
ORDER BY created_at;

-- 3) Calendar events created in the same window.
SELECT id,
       title,
       event_date,
       location,
       created_at,
       created_at AT TIME ZONE 'America/New_York' AS created_at_et,
       removed
FROM calendar_events
WHERE created_at >= '2026-04-25 20:00:00+00'
  AND created_at <  '2026-04-26 12:00:00+00'
ORDER BY created_at;

-- 4) Sanity: how many residents are opted in to the digest right now?
SELECT COUNT(*) AS opted_in_residents,
       SUM(COALESCE(array_length(emails, 1), 0)) AS total_email_addresses
FROM profiles
WHERE notify_digest = true
  AND is_active = true
  AND emails IS NOT NULL;

-- ============================================================================
-- 5) Inspect digest_log table definition — looking for a CHECK constraint on
--    `status` that rejects 'partial'. If one exists and only allows
--    ('success','error'), every digest run after the first one with any
--    bounced/failed batch silently fails to insert (function ignores the error).
-- ============================================================================
SELECT con.conname  AS constraint_name,
       con.contype  AS type,        -- 'c' = check
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class      cls ON cls.oid = con.conrelid
WHERE cls.relname = 'digest_log';

-- 6) Try a probe insert with status='partial'. If a CHECK constraint blocks
--    it, this will error with "violates check constraint". If it succeeds,
--    a row is inserted (then deleted) and the constraint is NOT the cause.
DO $$
BEGIN
  INSERT INTO digest_log (blog_count, event_count, recipient_count, status)
  VALUES (-1, -1, -1, 'partial');
  DELETE FROM digest_log WHERE blog_count = -1 AND event_count = -1;
  RAISE NOTICE 'PROBE: status=partial INSERT succeeded — check constraint is NOT the cause.';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'PROBE FAILED: %', SQLERRM;
END $$;

-- ============================================================================
-- 7) Are there any TRIGGERS on digest_log that might silently roll back
--    inserts? (e.g., a trigger that errors when something is missing.)
-- ============================================================================
SELECT t.tgname AS trigger_name,
       pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t
JOIN pg_class   c ON c.oid = t.tgrelid
WHERE c.relname = 'digest_log'
  AND NOT t.tgisinternal;

-- ============================================================================
-- 8) Check the highest id in digest_log AND the next sequence value.
--    If the sequence has advanced way past id=7, that means INSERTs ARE
--    happening (the sequence increments before the row commits) but rows
--    are being rolled back. If the sequence is also at 7, then no INSERTs
--    have even been attempted since Apr 24.
-- ============================================================================
SELECT (SELECT MAX(id) FROM digest_log)            AS max_existing_id,
       (SELECT last_value FROM digest_log_id_seq)  AS sequence_last_value,
       (SELECT is_called  FROM digest_log_id_seq)  AS sequence_called;

-- ============================================================================
-- 9) Show the most recent digest_log rows including any older ones, to see
--    whether IDs 1-6 actually exist or were deleted.
-- ============================================================================
SELECT id, sent_at AT TIME ZONE 'America/New_York' AS sent_at_et, status,
       blog_count, event_count, recipient_count
FROM digest_log
ORDER BY id;

-- ============================================================================
-- 10) Check RLS policies on digest_log. Migration enables RLS but adds no
--     policies. If service_role is NOT bypassing RLS for some reason, inserts
--     from the edge function will silently fail (the function ignores the
--     returned error).
-- ============================================================================
SELECT schemaname, tablename, rowsecurity AS rls_enabled
FROM pg_tables
WHERE tablename = 'digest_log';

SELECT polname, polcmd, polroles::regrole[], pg_get_expr(polqual, polrelid) AS using_clause,
       pg_get_expr(polwithcheck, polrelid) AS with_check_clause
FROM pg_policy
WHERE polrelid = 'public.digest_log'::regclass;

-- ============================================================================
-- 11) Confirm service_role has BYPASSRLS. If 'rolbypassrls' is false, that
--     is the bug — INSERT to an RLS-enabled, policy-less table will fail
--     for service_role.
-- ============================================================================
SELECT rolname, rolbypassrls, rolsuper
FROM pg_roles
WHERE rolname IN ('service_role', 'authenticated', 'anon', 'postgres');

-- ============================================================================
-- 12) Direct test: attempt the insert AS service_role. If this errors with
--     'new row violates row-level security policy', we have proof of cause.
-- ============================================================================
DO $$
BEGIN
  SET LOCAL ROLE service_role;
  INSERT INTO digest_log (blog_count, event_count, recipient_count, status)
  VALUES (-2, -2, -2, 'success');
  DELETE FROM digest_log WHERE blog_count = -2;
  RESET ROLE;
  RAISE NOTICE 'PROBE: service_role INSERT succeeded — RLS is NOT the cause.';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RAISE NOTICE 'PROBE FAILED as service_role: %', SQLERRM;
END $$;
