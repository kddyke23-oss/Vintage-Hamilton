-- ============================================================
-- Daily Digest Cron Job Setup
-- Runs the daily-digest Edge Function at 6 PM ET every day
-- Run in Supabase SQL Editor AFTER deploying the Edge Function
-- ============================================================

-- 1. Enable required extensions (may already be enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Schedule the cron job
--    Supabase pg_cron runs in UTC. 6 PM ET = 10 PM UTC (EDT) or 11 PM UTC (EST)
--    Using 10 PM UTC (22:00) for EDT (summer). Adjust to 23:00 for EST (winter).
--    NOTE: Supabase free tier does NOT include pg_cron. If unavailable,
--    use an external cron service (see deployment guide).
SELECT cron.schedule(
  'daily-digest',                    -- job name
  '0 22 * * *',                      -- 10 PM UTC = 6 PM EDT
  $$
  SELECT net.http_post(
    url    := current_setting('app.settings.supabase_url') || '/functions/v1/daily-digest',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body   := '{}'::jsonb
  );
  $$
);

-- ============================================================
-- ALTERNATIVE: If pg_cron/pg_net aren't available on your plan,
-- you can use any external cron service to POST to:
--
--   POST https://<project-ref>.supabase.co/functions/v1/daily-digest
--   Headers:
--     Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
--     Content-Type: application/json
--   Body: {}
--
-- Free options:
--   - cron-job.org (free, reliable)
--   - GitHub Actions scheduled workflow
--   - Vercel Cron Jobs (vercel.json config)
-- ============================================================

-- To check the job:
-- SELECT * FROM cron.job WHERE jobname = 'daily-digest';

-- To remove the job:
-- SELECT cron.unschedule('daily-digest');

-- To view recent runs:
-- SELECT * FROM cron.job_run_details WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'daily-digest') ORDER BY start_time DESC LIMIT 10;
