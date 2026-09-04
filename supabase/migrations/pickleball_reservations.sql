-- ─── Pickleball Court Reservations ─────────────────────────────────────────
-- Single-court advance-booking system. No fee, no RCP involvement — entirely
-- self-contained in the portal (see Reservations/REQUIREMENTS.md §3).
--
-- Rules encoded here (confirmed with Keith 2026-09-02):
--   - Advance reservations are a fixed 1.5-hour block.
--   - Bookable up to 8 days ahead.
--   - A household may hold only ONE advance reservation per play-day, but may
--     hold reservations on multiple different days at once.
--   - "Household" = profiles.address (shared text field; access_requests
--     already groups 1-2 residents per household by this same shared address
--     at signup, so this reuses an existing convention rather than inventing
--     a new one). Denormalized onto each row as household_address so the
--     uniqueness constraint below doesn't need a join.
--   - Walk-up-time-limit and guest-chaperone rules are NOT enforceable in
--     software (the portal can't verify who's physically at the court) — they
--     are surfaced as posted policy text that the resident must actively
--     acknowledge (rules_acknowledged_at) before a reservation is confirmed,
--     so there's a timestamped record for any later enforcement conversation.
--
-- NOT yet confirmed with Keith: court operating hours / the exact slot grid
-- (start times used to offer 1.5h blocks). The app defines this as a single
-- constant (COURT_SLOTS in PickleballCourt.jsx) using a placeholder 8am-8pm
-- window — this table doesn't care what the slot times actually are, it only
-- prevents two rows from claiming the same (play_date, start_time), so the
-- grid can be changed later without a migration.

CREATE TABLE IF NOT EXISTS pickleball_reservations (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  reserved_by            uuid NOT NULL, -- matches auth.uid() / profiles.id; no FK —
                                         -- profiles.id has no unique constraint in
                                         -- this schema (see calendar_comments.sql)
  household_address      text NOT NULL CHECK (household_address <> ''),

  play_date              date NOT NULL,
  start_time             time NOT NULL,
  end_time               time NOT NULL,

  rules_acknowledged_at  timestamptz NOT NULL, -- resident actively agreed to the
                                                -- posted court rules at booking time

  cancelled_at           timestamptz,
  cancelled_by           uuid,

  created_at             timestamptz NOT NULL DEFAULT now()
);

-- No two active reservations for the same slot.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pickleball_slot_unique
  ON pickleball_reservations (play_date, start_time)
  WHERE cancelled_at IS NULL;

-- No household holds two active reservations on the same play-day.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pickleball_household_per_day
  ON pickleball_reservations (household_address, play_date)
  WHERE cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pickleball_reservations_reserved_by
  ON pickleball_reservations (reserved_by)
  WHERE cancelled_at IS NULL;

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE pickleball_reservations ENABLE ROW LEVEL SECURITY;

-- Any signed-in resident can see the full schedule (needed to show
-- availability — not just their own bookings).
CREATE POLICY "Residents can view pickleball reservations"
  ON pickleball_reservations FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- A resident can book for themselves, only within the 8-day advance window.
-- The household-per-day and slot-uniqueness rules are enforced by the unique
-- indexes above (not here), so they hold even under concurrent requests.
CREATE POLICY "Residents can book a pickleball slot"
  ON pickleball_reservations FOR INSERT
  WITH CHECK (
    auth.uid() = reserved_by
    AND play_date >= CURRENT_DATE
    AND play_date <= CURRENT_DATE + INTERVAL '8 days'
  );

-- Cancel (soft-delete via cancelled_at): the reservation's owner, a pickleball
-- app-admin, or a super admin. Mirrors the owner-or-admins UPDATE pattern used
-- for calendar_comments.
CREATE POLICY "Owner or admins can cancel pickleball reservations"
  ON pickleball_reservations FOR UPDATE
  USING (
    auth.uid() = reserved_by
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
    OR EXISTS (
      SELECT 1 FROM app_access
      WHERE app_access.user_id = auth.uid()
        AND app_access.app_id = 'pickleball'
        AND app_access.role = 'admin'
    )
  );

-- ─── Default app access ─────────────────────────────────────────────────────
-- No blanket grant here on purpose (2026-09-04, per Keith): Pickleball is
-- staying an individually-toggled app -- admins grant testers one at a time
-- from Admin -> Access -- until it's added to General Functions, at which
-- point general_functions_grouping.sql's backfill_general_app() grants it
-- to everyone who already has General Functions access, in one step. See
-- that migration for the mechanics and why this is safer than a blanket
-- INSERT here.
