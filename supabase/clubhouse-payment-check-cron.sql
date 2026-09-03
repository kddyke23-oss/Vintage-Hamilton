-- ============================================================
-- Clubhouse Payment Check — Cron Job Setup
-- Runs the clubhouse-payment-check Edge Function once a day.
-- Run in Supabase SQL Editor AFTER deploying the Edge Function.
-- Mirrors daily-digest-cron.sql.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Runs at 9 AM ET (13:00 UTC for EDT / 14:00 UTC for EST — using 13:00,
-- adjust to 14:00 once clocks fall back in November).
SELECT cron.schedule(
  'clubhouse-payment-check',
  '0 13 * * *',
  $$
  SELECT net.http_post(
    url    := current_setting('app.settings.supabase_url') || '/functions/v1/clubhouse-payment-check',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body   := '{}'::jsonb
  );
  $$
);

-- To check the job:
-- SELECT * FROM cron.job WHERE jobname = 'clubhouse-payment-check';

-- To remove the job:
-- SELECT cron.unschedule('clubhouse-payment-check');

-- To view recent runs:
-- SELECT * FROM cron.job_run_details WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'clubhouse-payment-check') ORDER BY start_time DESC LIMIT 10;
