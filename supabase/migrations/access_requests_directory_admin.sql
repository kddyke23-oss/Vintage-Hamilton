-- ─── Access Requests: allow Directory app-admins to review, not just super admins ──
-- Companion to the "App Admin Panel" access-requests panel added to ResidentDirectory.
-- Run this in the Supabase SQL Editor after the app-side changes are deployed.

-- Drop and recreate the SELECT / UPDATE policies so anyone who is either a
-- super admin (profiles.is_admin) OR a Directory app-admin (app_access role='admin'
-- for app_id='directory') can see and act on requests.

DROP POLICY IF EXISTS "Admins can view access requests" ON access_requests;
CREATE POLICY "Admins can view access requests"
  ON access_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
    OR EXISTS (
      SELECT 1 FROM app_access
      WHERE app_access.user_id = auth.uid()
        AND app_access.app_id = 'directory'
        AND app_access.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can update access requests" ON access_requests;
CREATE POLICY "Admins can update access requests"
  ON access_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
    OR EXISTS (
      SELECT 1 FROM app_access
      WHERE app_access.user_id = auth.uid()
        AND app_access.app_id = 'directory'
        AND app_access.role = 'admin'
    )
  );

-- Note: the approve-request edge function uses the SERVICE ROLE key, so the
-- actual profile/auth-user creation it performs already bypasses RLS — this
-- migration only affects who can SEE and manually approve/reject rows from
-- the client (the new in-Directory panel, and the legacy /admin/requests page).
