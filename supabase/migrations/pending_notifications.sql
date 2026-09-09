-- ============================================================
-- Personal notification queue
-- Replaces instant per-event transactional emails (comments,
-- clubhouse booking status, access requests, etc.) with a queue
-- that gets flushed ONCE PER DAY into a single combined email
-- per recipient, by the new `send-daily-notifications` function.
--
-- Why: each event used to fire its own /emails call. With comments
-- + the clubhouse booking workflow both growing, that was on track
-- to blow through Resend's 100/day free-plan transactional quota.
-- Folding everything into one email per person per day keeps
-- volume bounded by "residents with activity today", not "events
-- today".
-- ============================================================

CREATE TABLE IF NOT EXISTS pending_notifications (
  id              BIGSERIAL PRIMARY KEY,
  recipient_email TEXT NOT NULL,
  category        TEXT NOT NULL,   -- 'comment' | 'access_request' | 'clubhouse_rcp' |
                                    -- 'clubhouse_cancellation' | 'clubhouse_escalation' |
                                    -- 'clubhouse_resident_status' | 'clubhouse_payment_overdue'
  subject_line    TEXT NOT NULL,   -- short one-line summary, used as the item heading
  body_html       TEXT NOT NULL,   -- small HTML fragment (not a full page) for this one item
  link_url        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at         TIMESTAMPTZ       -- NULL = still pending
);

CREATE INDEX IF NOT EXISTS pending_notifications_unsent_idx
  ON pending_notifications (recipient_email, created_at)
  WHERE sent_at IS NULL;

-- RLS: only the service role (edge functions) touches this table.
ALTER TABLE pending_notifications ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- Log of each daily-notification flush run (parallels digest_log)
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_send_log (
  id               SERIAL PRIMARY KEY,
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  recipient_count  INT NOT NULL DEFAULT 0,
  item_count       INT NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'success'  -- 'success' | 'partial' | 'error'
);

ALTER TABLE notification_send_log ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- Daily transactional send-volume counter (safety net)
-- Every function that actually calls Resend's /emails endpoint
-- increments this so we get a log warning as we approach the
-- free-plan's 100/day cap, instead of finding out via a 429 or
-- a missed notification.
-- ============================================================
CREATE TABLE IF NOT EXISTS email_volume_log (
  day         DATE PRIMARY KEY,
  sent_count  INT NOT NULL DEFAULT 0
);

ALTER TABLE email_volume_log ENABLE ROW LEVEL SECURITY;

-- Upsert helper: bump today's (UTC) counter by `n` and return the new total.
CREATE OR REPLACE FUNCTION bump_email_volume(n INT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_total INT;
BEGIN
  INSERT INTO email_volume_log (day, sent_count)
  VALUES (CURRENT_DATE, n)
  ON CONFLICT (day) DO UPDATE
    SET sent_count = email_volume_log.sent_count + EXCLUDED.sent_count
  RETURNING sent_count INTO new_total;
  RETURN new_total;
END;
$$;
