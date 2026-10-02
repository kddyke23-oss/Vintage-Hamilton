-- clubhouse-setup-check-cron.sql — schedule AFTER deploying the function
-- (supabase functions deploy clubhouse-setup-check --no-verify-jwt).
-- 21:45 UTC = 5:45 PM EDT / 4:45 PM EST — always ~30 min before
-- send-daily-notifications (22:15 UTC), so setup notices go out the same evening.
-- See Reservations/REQUIREMENTS.md §2.29.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'clubhouse-setup-check',
  '45 21 * * *',
  $$
  SELECT net.http_post(
    url    := current_setting('app.settings.supabase_url') || '/functions/v1/clubhouse-setup-check',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body   := '{}'::jsonb
  );
  $$
);
