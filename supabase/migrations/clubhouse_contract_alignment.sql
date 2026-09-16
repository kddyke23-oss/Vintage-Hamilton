-- ─── Clubhouse contract alignment ───────────────────────────────────────────
-- Keith had RCP send over the actual, currently-signed "Clubhouse Lease
-- Agreement" (VI Clubhouse Rental Agreement 2025.pdf) for the first time,
-- 2026-09-16. Comparing it against what was built turned up real gaps and
-- one real conflict (see Reservations/REQUIREMENTS.md for the full review
-- and Keith's decisions). This migration builds the data model for that:
--
--   - Vacate time and the extra-hour fee become board-editable settings,
--     like the existing per-resource fees — replacing the old hardcoded
--     10:00 PM / hard-blocked-past-6-hours rule (which didn't match the
--     signed contract's 11:00 PM / pay-for-extra-hours model). The
--     contract's absolute "never past midnight" ceiling is NOT a setting —
--     it's enforced in application code as a hard constant, since the
--     Board can't approve past it either.
--   - Main Clubhouse occupancy cap (65) and a Side Room cap (still TBD by
--     Keith — starts NULL/unenforced, same "can't book until it's set"
--     posture used elsewhere in this table for an unpriced resource).
--   - Guest count, and quantities (not just a yes/no) for extra tables and
--     chairs, with the caps Keith set (5 tables, 50 chairs).
--   - A resident-side "signature" — terms_acknowledged_at — since Keith
--     wants the portal's own acknowledgment steps (resident submission +
--     RCP's existing "Acknowledge — fee required" action) to stand in for
--     the paper agreement's two signature lines, rather than a physical
--     signature. liability_insurance_confirmed is the same idea for the
--     contract's insurance-proof requirement — a checkbox confirmation at
--     booking time, with RCP still separately chasing actual proof.
--   - wants_late_end: the checkbox for "I need to go past the vacate time"
--     — Keith's call (2026-09-16) is that this stays a visible flag for
--     RCP to take to the Board offline, not a new blocking status. It
--     doesn't change the normal pending_rcp → pending_payment/confirmed
--     flow at all.
--   - fee_additional_hours: snapshot of what's owed for hours beyond the
--     included 6, same snapshot-at-booking-time pattern as the other fees
--     — folded into the existing generated total_due column below.

-- ─── Settings additions ──────────────────────────────────────────────────────
ALTER TABLE community_settings
  ADD COLUMN IF NOT EXISTS clubhouse_latest_vacate_time     time NOT NULL DEFAULT '23:00:00',
  ADD COLUMN IF NOT EXISTS clubhouse_additional_hour_fee    numeric(10,2), -- NULL = not yet priced by the board;
                                                                            -- a booking can't run past 6 hours until it is
  ADD COLUMN IF NOT EXISTS clubhouse_main_max_occupancy     integer NOT NULL DEFAULT 65,
  ADD COLUMN IF NOT EXISTS clubhouse_side_room_max_occupancy integer; -- NULL = not yet ascertained (Keith, 2026-09-16) —
                                                                       -- no occupancy cap enforced for the Side Room until set

-- ─── clubhouse_reservations additions ────────────────────────────────────────
ALTER TABLE clubhouse_reservations
  ADD COLUMN IF NOT EXISTS guest_count                  integer CHECK (guest_count IS NULL OR guest_count > 0),
  ADD COLUMN IF NOT EXISTS extra_tables_requested        integer NOT NULL DEFAULT 0 CHECK (extra_tables_requested BETWEEN 0 AND 5),
  ADD COLUMN IF NOT EXISTS extra_chairs_requested         integer NOT NULL DEFAULT 0 CHECK (extra_chairs_requested BETWEEN 0 AND 50),
  ADD COLUMN IF NOT EXISTS wants_late_end                boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS liability_insurance_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS terms_acknowledged_at         timestamptz,
  ADD COLUMN IF NOT EXISTS fee_additional_hours          numeric(10,2);

COMMENT ON COLUMN clubhouse_reservations.guest_count IS
  'Expected attendee count, captured at booking. Nullable only because existing rows predate this column — the booking form requires it for any Main Clubhouse / Side Room request going forward.';
COMMENT ON COLUMN clubhouse_reservations.wants_late_end IS
  'Resident is requesting an end time past community_settings.clubhouse_latest_vacate_time. Per the signed Clubhouse Lease Agreement this needs advance written Board approval - RCP sees this flagged on the reservation and follows up with the Board directly; it does not change the reservation''s status/workflow on its own.';
COMMENT ON COLUMN clubhouse_reservations.terms_acknowledged_at IS
  'When the resident accepted the Clubhouse Lease Agreement / Rules & Regulations terms at submission - stands in for their signature on the paper agreement. RCP''s existing acknowledged_at/acknowledged_by (see clubhouse_reservations.sql) stands in for the Property Manager''s signature.';
COMMENT ON COLUMN clubhouse_reservations.liability_insurance_confirmed IS
  'Resident''s checkbox confirmation at booking that they have or will obtain liability insurance, per the signed agreement. RCP still separately collects actual proof - this is not a document upload.';

-- total_due is a generated/stored column, so it has to be dropped and
-- recreated to fold fee_additional_hours into the sum (Postgres doesn't
-- support altering a generated expression in place).
ALTER TABLE clubhouse_reservations DROP COLUMN total_due;
ALTER TABLE clubhouse_reservations ADD COLUMN total_due numeric(10,2) GENERATED ALWAYS AS (
  COALESCE(fee_main, 0) + COALESCE(fee_side_room, 0) + COALESCE(fee_tables_chairs, 0) +
  COALESCE(fee_additional_hours, 0) + COALESCE(deposit_amount, 0)
) STORED;
