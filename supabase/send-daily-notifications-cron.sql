-- ============================================================
-- Daily Notifications Cron Job Setup
-- Runs the send-daily-notifications Edge Function at 6:15 PM ET every day
-- (15 min after daily-digest, so the two don't race) — Run in Supabase
-- SQL Editor AFTER deploying the Edge Function.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'send-daily-notifications',        -- job name
  '15 22 * * *',                     -- 10:15 PM UTC = 6:15 PM EDT
  $$
  SELECT net.http_post(
    url    := current_setting('app.settings.supabase_url') || '/functions/v1/send-daily-notifications',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body   := '{}'::jsonb
  );
  $$
);

-- Adjust '15 22 * * *' to '15 23 * * *' for EST (winter) — same DST caveat
-- as daily-digest-cron.sql.

-- To check the job:
-- SELECT * FROM cron.job WHERE jobname = 'send-daily-notifications';

-- To remove the job:
-- SELECT cron.unschedule('send-daily-notifications');

-- To view recent runs:
-- SELECT * FROM cron.job_run_details WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'send-daily-notifications') ORDER BY start_time DESC LIMIT 10;
