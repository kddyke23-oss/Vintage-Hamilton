-- ─── Post-event deposit check-in ────────────────────────────────────────────
-- Asked by Keith, 2026-09-18: the security deposit is collected up front,
-- bundled into total_due/deposit_amount and paid by check same as the other
-- fees, but nothing ever closed the loop after the event actually happened —
-- RCP needs to inspect the room(s) afterward and decide how much (if any) of
-- the deposit to keep for cleaning/corrective work, then refund the rest by
-- check.
--
-- Two steps, matching the check-received / refund-issued pattern already
-- used everywhere else in this table (Keith confirmed this shape over the
-- simpler one-step alternative):
--   1. Record the inspection — post_event_fee_amount (X, can be $0),
--      post_event_fee_reason (Y — required text when X > 0, 'n/a' when X is
--      0), post_event_reviewed_at/by. deposit_refund_amount (Z) is derived,
--      not entered — deposit_amount minus X, floored at $0. If X ever
--      exceeds the deposit, Z is $0 and anything further is a manual
--      follow-up outside this workflow, not an auto-generated "resident owes
--      more" flow.
--   2. Mark the refund actually sent — deposit_refund_issued_at/by, once RCP
--      has written and mailed the check. Kept separate from step 1 so the
--      record doesn't say "refunded" before it actually is, same reasoning
--      as the existing refund_issued_at/by pair for a cancellation refund.
--
-- Only ever relevant to a booking that actually collected a deposit
-- (deposit_amount is NULL for a 'no'-answer booking that was never
-- escalated — no fee, no deposit, nothing to check) and that was actually
-- paid (check_received_at set). See ClubhouseReservationsPage.jsx's
-- needsPostEventReview() for the exact "show this in the queue" condition
-- (status='confirmed', deposit_amount > 0, check_received_at set, the event
-- has ended, not yet reviewed).

ALTER TABLE clubhouse_reservations
  ADD COLUMN IF NOT EXISTS post_event_reviewed_at   timestamptz,
  ADD COLUMN IF NOT EXISTS post_event_reviewed_by   uuid,
  ADD COLUMN IF NOT EXISTS post_event_fee_amount    numeric(10,2)
                             CHECK (post_event_fee_amount IS NULL OR post_event_fee_amount >= 0),
  ADD COLUMN IF NOT EXISTS post_event_fee_reason    text,
  ADD COLUMN IF NOT EXISTS deposit_refund_amount    numeric(10,2) GENERATED ALWAYS AS (
                             GREATEST(COALESCE(deposit_amount, 0) - COALESCE(post_event_fee_amount, 0), 0)
                           ) STORED,
  ADD COLUMN IF NOT EXISTS deposit_refund_issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS deposit_refund_issued_by uuid;

-- No RLS changes needed — the existing "Owner or clubhouse-admin can update
-- a reservation" policy already covers writes to these new columns; a
-- resident can technically UPDATE their own row per that policy, but the
-- portal UI never gives them a path to touch these fields (same trust model
-- already relied on for every other RCP-only field on this table).
