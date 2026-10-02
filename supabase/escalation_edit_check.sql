-- escalation_edit_check.sql — READ-ONLY. Run in the Supabase SQL editor.
-- Reservations/REQUIREMENTS.md §2.30, 2026-10-02.
--
-- Before the 2.30 fix, editing an escalated booking wiped its escalation
-- fields, so a reset booking can't be found from clubhouse_reservations alone.
-- The escalation email queue still has a record of every escalation, so:
--   Query 1 = every escalation email queued since go-live (one row per
--             recipient, so the same booking may appear more than once).
--   Query 2 = every booking that still carries an escalation record.
-- Expected today: both empty. If Query 1 has a booking title that does not
-- appear in Query 2, that booking was escalated and then reset by an edit.

-- Query 1
SELECT created_at, recipient_email, subject_line
  FROM pending_notifications
 WHERE category = 'clubhouse_escalation'
   AND created_at >= '2026-10-01'
 ORDER BY created_at;

-- Query 2
SELECT r.id, ce.title, r.actual_title, r.status, r.private_event_answer,
       r.escalated_at, r.escalation_resolved_at, r.escalation_outcome, r.created_at
  FROM clubhouse_reservations r
  LEFT JOIN calendar_events ce ON ce.id = r.calendar_event_id
 WHERE r.created_at >= '2026-10-01'
   AND (r.escalated_at IS NOT NULL OR r.status = 'escalated' OR r.escalation_outcome IS NOT NULL)
 ORDER BY r.created_at;
