-- ─── Clubhouse Reservations ─────────────────────────────────────────────────
-- Built into the existing Social Calendar "Add Event" flow (see SocialCalendar.jsx
-- changes) rather than a separate app — see Reservations/REQUIREMENTS.md §2.1.
-- Picking "Main Clubhouse" / "Side Room" as the event location reveals the
-- reservation questions inline; submitting creates a normal calendar_events row
-- (so it shows on the shared calendar like any other event) PLUS a linked row
-- here holding everything reservation-specific (private flag, fee, payment,
-- RCP/committee workflow). Keeping this out of calendar_events itself avoids
-- adding a dozen reservation-only columns to a table every community event uses.
--
-- Rules encoded here, confirmed with Keith across the 2026-09-02 design thread:
--   - Main Clubhouse, Small Side Room (not yet available), and Extra Tables &
--     Chairs are independently selectable, any combination, on one request.
--   - Main Clubhouse and the Small Side Room can go to two different residents
--     at the same time as long as neither is already booked — no shared
--     exclusivity between them. Enforced below with per-resource exclusion
--     constraints on the actual time range (not just a fixed grid), since
--     clubhouse bookings run arbitrary hours, unlike pickleball's fixed slots.
--   - Each resource attracts its own fee, set independently (community_settings
--     additions below) — NOT one flat clubhouse fee. Fees/deposit are
--     board-editable and snapshotted onto the reservation at booking time so a
--     later change doesn't retroactively affect an existing booking.
--   - A booking is not confirmed until payment (a check) is received — tracked
--     as a status, not just a note. RCP staff and social-committee members act
--     through a shared 'clubhouse' app_access role (role='admin'): acknowledge,
--     escalate, mark payment received, mark refund issued, cancel. The
--     RCP-vs-committee distinction (committee only handles escalations) is
--     enforced by which filtered view each uses in the admin UI, not by a
--     second app_id — see Reservations/REQUIREMENTS.md if a harder boundary
--     is wanted later.
--   - RCP can escalate a "not private" booking it believes is actually private
--     to the social committee, who confirm (moves to the fee/payment workflow)
--     or dismiss (booking stands as submitted).
--   - Payment deadline (days before the event) is a board-editable setting,
--     not hardcoded — Keith's 30 vs. RCP's 60 is still being reconciled.
--     Crossing the deadline unpaid does NOT auto-cancel; it fires an automated
--     "late, subject to cancellation" email to the resident and RCP (see the
--     clubhouse-payment-check Edge Function), and a human decides whether to
--     actually cancel.
--   - Cancellation isn't complete until any money already collected is marked
--     refunded.

-- ─── Settings additions (extends the existing single-row community_settings) ──
ALTER TABLE community_settings
  ADD COLUMN IF NOT EXISTS clubhouse_main_fee              numeric(10,2) NOT NULL DEFAULT 150.00,
  ADD COLUMN IF NOT EXISTS clubhouse_side_room_fee         numeric(10,2), -- NULL = not yet priced by the board
  ADD COLUMN IF NOT EXISTS clubhouse_tables_chairs_fee     numeric(10,2), -- NULL = not yet priced by the board
  ADD COLUMN IF NOT EXISTS clubhouse_security_deposit      numeric(10,2) NOT NULL DEFAULT 250.00,
  ADD COLUMN IF NOT EXISTS clubhouse_payment_deadline_days integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS clubhouse_side_room_available   boolean NOT NULL DEFAULT false;

-- A resource can only be requested once the board has actually priced it (the
-- Main Clubhouse always is, at the default above; Side Room and Tables & Chairs
-- start unpriced on purpose so nothing can be booked at an unset $0 fee).

-- ─── clubhouse_reservations ──────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS clubhouse_reservations (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  calendar_event_id   integer NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
                       -- integer to match calendar_events.id (see calendar_comments.sql)

  reserved_by         uuid NOT NULL, -- auth.uid() / profiles.id; no FK — profiles.id has
                                      -- no unique constraint in this schema

  wants_main_clubhouse boolean NOT NULL DEFAULT false,
  wants_side_room       boolean NOT NULL DEFAULT false,
  wants_tables_chairs    boolean NOT NULL DEFAULT false,
  CONSTRAINT clubhouse_reservations_needs_a_resource
    CHECK (wants_main_clubhouse OR wants_side_room OR wants_tables_chairs),

  starts_at           timestamp NOT NULL,
  ends_at             timestamp NOT NULL,
  CONSTRAINT clubhouse_reservations_time_order CHECK (ends_at > starts_at),

  private_event_answer text NOT NULL CHECK (private_event_answer IN ('yes', 'no', 'not_sure')),

  -- Fee/deposit snapshots — populated at submission for yes/not_sure answers;
  -- populated at escalation-resolution time (escalation_outcome =
  -- 'confirmed_private') for a 'no' answer RCP successfully escalated. NULL
  -- for whichever resources weren't requested, or while a 'no' answer stands
  -- unescalated (no fee owed).
  fee_main            numeric(10,2),
  fee_side_room       numeric(10,2),
  fee_tables_chairs   numeric(10,2),
  deposit_amount      numeric(10,2),
  total_due           numeric(10,2) GENERATED ALWAYS AS (
                        COALESCE(fee_main, 0) + COALESCE(fee_side_room, 0) +
                        COALESCE(fee_tables_chairs, 0) + COALESCE(deposit_amount, 0)
                      ) STORED,

  -- Payment deadline — snapshotted from community_settings at the point a fee
  -- becomes owed (submission, or escalation resolution), not read live.
  payment_deadline_days_snapshot integer,
  payment_deadline_date          date GENERATED ALWAYS AS (
                                    CASE WHEN payment_deadline_days_snapshot IS NOT NULL
                                      THEN (starts_at::date - payment_deadline_days_snapshot)
                                      ELSE NULL END
                                  ) STORED,

  status              text NOT NULL DEFAULT 'confirmed'
                        CHECK (status IN ('confirmed', 'pending_rcp', 'pending_payment', 'escalated', 'cancelled')),
                        -- confirmed: not private (or fee already paid / not owed)
                        -- pending_rcp: private/not_sure, awaiting RCP acknowledgment
                        -- pending_payment: RCP acknowledged, fee owed, check not yet received
                        -- escalated: RCP flagged a 'no' answer, awaiting the social committee
                        -- cancelled: terminal

  acknowledged_at     timestamptz,
  acknowledged_by     uuid,

  check_received_at   timestamptz,
  check_received_by   uuid,

  escalated_at        timestamptz,
  escalated_by        uuid,
  escalation_resolved_at timestamptz,
  escalation_resolved_by uuid,
  escalation_outcome  text CHECK (escalation_outcome IN ('confirmed_private', 'dismissed')),

  late_notice_sent_at timestamptz, -- dedupes the automated overdue email (fires once)

  cancelled_at        timestamptz,
  cancelled_by         uuid,
  cancellation_reason  text,

  refund_issued_at    timestamptz,
  refund_issued_by    uuid,

  is_test             boolean NOT NULL DEFAULT false, -- flags bookings created for RCP/committee
                                                        -- testing, so they're easy to exclude later

  created_at          timestamptz NOT NULL DEFAULT now()
);

-- No two active bookings of the Main Clubhouse with overlapping times.
ALTER TABLE clubhouse_reservations ADD CONSTRAINT no_double_book_main_clubhouse
  EXCLUDE USING gist (tsrange(starts_at, ends_at, '[)') WITH &&)
  WHERE (wants_main_clubhouse AND status <> 'cancelled');

-- Same for the Side Room — independent of the Main Clubhouse (2.2/2.4).
ALTER TABLE clubhouse_reservations ADD CONSTRAINT no_double_book_side_room
  EXCLUDE USING gist (tsrange(starts_at, ends_at, '[)') WITH &&)
  WHERE (wants_side_room AND status <> 'cancelled');

-- Extra Tables & Chairs is treated as a service add-on (someone gets paid to
-- set up/take down), not a scarce bookable resource, so no exclusion
-- constraint here — flag to Keith if there's actually a fixed quantity that
-- could conflict across two simultaneous room bookings.

CREATE INDEX IF NOT EXISTS idx_clubhouse_reservations_reserved_by
  ON clubhouse_reservations (reserved_by) WHERE status <> 'cancelled';
CREATE INDEX IF NOT EXISTS idx_clubhouse_reservations_status
  ON clubhouse_reservations (status) WHERE status <> 'cancelled';
CREATE INDEX IF NOT EXISTS idx_clubhouse_reservations_calendar_event
  ON clubhouse_reservations (calendar_event_id);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE clubhouse_reservations ENABLE ROW LEVEL SECURITY;

-- Resident sees their own; RCP/committee (shared 'clubhouse' admin role) and
-- super admins see everything — narrower "committee sees only escalated"
-- filtering happens in the admin UI, not here (see header note).
CREATE POLICY "View own or clubhouse-admin reservations"
  ON clubhouse_reservations FOR SELECT
  USING (
    auth.uid() = reserved_by
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
    OR EXISTS (
      SELECT 1 FROM app_access
      WHERE app_access.user_id = auth.uid() AND app_access.app_id = 'clubhouse' AND app_access.role = 'admin'
    )
  );

-- A resident books for themselves only.
CREATE POLICY "Residents can create their own clubhouse reservation"
  ON clubhouse_reservations FOR INSERT
  WITH CHECK (auth.uid() = reserved_by);

-- Owner (cancel only, enforced client-side same as elsewhere in this schema)
-- or a clubhouse admin / super admin (full workflow actions).
CREATE POLICY "Owner or clubhouse-admin can update a reservation"
  ON clubhouse_reservations FOR UPDATE
  USING (
    auth.uid() = reserved_by
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
    OR EXISTS (
      SELECT 1 FROM app_access
      WHERE app_access.user_id = auth.uid() AND app_access.app_id = 'clubhouse' AND app_access.role = 'admin'
    )
  );

-- ─── Default app access ─────────────────────────────────────────────────────
-- Deliberately NOT granting 'clubhouse' app_access to residents generally —
-- unlike pickleball, this doesn't gate a separate page: every resident already
-- has 'calendar' access, and that's what lets them use Add Event (and therefore
-- request a clubhouse reservation) once the SocialCalendar UI changes ship.
-- 'clubhouse' role='admin' is the RCP/committee reviewer capability only — grant
-- it by hand via the Admin Panel (Access tab, now lists a Clubhouse app) to
-- Keith/testers now, then Mariesol/Al and committee members once ready. See
-- Reservations/REQUIREMENTS.md §2.13 on the deliberately-gated rollout.
