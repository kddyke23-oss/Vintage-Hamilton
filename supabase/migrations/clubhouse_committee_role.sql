-- ─── Social Committee gets a genuinely narrower role than RCP ──────────────
-- Previously RCP and the committee shared the same 'clubhouse' admin role,
-- with "committee only touches escalations" as an unenforced convention —
-- see the header comment this replaces in clubhouse_reservations.sql.
-- Keith's decision, 2026-09-03: for an over-55 volunteer community, relying
-- on people to remember not to touch things isn't good enough — enforce it.
--
-- New meaning for the existing 'clubhouse' app_access role column (no schema
-- change, just different RLS behavior per role):
--   role = 'admin' → RCP. Unchanged: full queue, every action.
--   role = 'user'  → Social Committee. Can see and act on ONLY reservations
--                     with status = 'escalated' — nothing else in the queue.
--   no row at all  → ordinary resident. No admin visibility of any kind.
--                     (Booking access itself is separately gated — see
--                     SocialCalendar.jsx's canRequestClubhouse — and lifts
--                     for everyone at the Oct 1 cutover regardless of any
--                     'clubhouse' row, so there's no collision between "no
--                     row" residents and 'user'-role committee members.)

DROP POLICY IF EXISTS "View own or clubhouse-admin reservations" ON clubhouse_reservations;
CREATE POLICY "View own, RCP, or committee-escalated reservations"
  ON clubhouse_reservations FOR SELECT
  USING (
    auth.uid() = reserved_by
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
    OR EXISTS (
      SELECT 1 FROM app_access
      WHERE app_access.user_id = auth.uid() AND app_access.app_id = 'clubhouse' AND app_access.role = 'admin'
    )
    OR (
      status = 'escalated'
      AND EXISTS (
        SELECT 1 FROM app_access
        WHERE app_access.user_id = auth.uid() AND app_access.app_id = 'clubhouse' AND app_access.role = 'user'
      )
    )
  );

DROP POLICY IF EXISTS "Owner or clubhouse-admin can update a reservation" ON clubhouse_reservations;
CREATE POLICY "Owner, RCP, or committee (escalated only) can update"
  ON clubhouse_reservations FOR UPDATE
  USING (
    auth.uid() = reserved_by
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
    OR EXISTS (
      SELECT 1 FROM app_access
      WHERE app_access.user_id = auth.uid() AND app_access.app_id = 'clubhouse' AND app_access.role = 'admin'
    )
    OR (
      status = 'escalated'
      AND EXISTS (
        SELECT 1 FROM app_access
        WHERE app_access.user_id = auth.uid() AND app_access.app_id = 'clubhouse' AND app_access.role = 'user'
      )
    )
  );

-- Note: this is row-level (which RESERVATIONS a committee member can touch),
-- not column-level (which FIELDS they can change on one they can touch). The
-- app's UI only ever offers Confirm/Dismiss to a 'user'-role committee
-- member on an escalated booking — nothing exposes Cancel, Acknowledge, or
-- Mark Refund Issued to them. A technically sophisticated committee member
-- could in theory call the update API directly to do more than that on an
-- escalated row; flag if that risk needs closing off harder (e.g. a
-- trigger enforcing which columns 'user'-role updates may touch).
