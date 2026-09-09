-- ============================================================
-- Read-only admin access to email_volume_log
-- The table was created RLS-enabled with NO policies (service-role
-- only) in pending_notifications.sql. This adds a SELECT policy so
-- global admins can read it from the frontend, for the "Email Volume"
-- widget on the /admin Access page. Writes stay service-role-only
-- (still only bump_email_volume(), called from send-daily-notifications).
-- ============================================================

DROP POLICY IF EXISTS "Admins can view email volume log" ON email_volume_log;
CREATE POLICY "Admins can view email volume log"
  ON email_volume_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );
