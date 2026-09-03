-- ─── Pickleball: any start time, not just the original fixed grid ──────────
-- Keith's decision, 2026-09-03: a resident should be able to book e.g.
-- 9:00–10:30, even though that falls between the original fixed slots
-- (8:00–9:30, 9:30–11:00, …). Reservation length stays fixed at 1.5 hours —
-- only the choice of start time becomes flexible (30-minute increments in
-- the UI). This is an incremental migration on top of the already-applied
-- pickleball_reservations.sql — do not re-run that file, run this one.
--
-- Replaces the old exact-slot UNIQUE index with a real overlap check, same
-- EXCLUDE-constraint pattern already used for the clubhouse
-- (clubhouse_reservations.sql) rather than inventing a second approach.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Enforce the fixed 1.5-hour length at the database level too, not just in
-- the booking UI.
ALTER TABLE pickleball_reservations
  ADD CONSTRAINT pickleball_fixed_length
  CHECK (end_time = start_time + INTERVAL '90 minutes');

-- The old rule only blocked an EXACT (play_date, start_time) match, which is
-- all that was needed on a fixed grid but isn't enough once any start time
-- is allowed — two reservations could otherwise overlap without ever
-- sharing an exact start time (e.g. 8:00–9:30 and 9:00–10:30).
DROP INDEX IF EXISTS idx_pickleball_slot_unique;

ALTER TABLE pickleball_reservations ADD CONSTRAINT no_double_book_pickleball_court
  EXCLUDE USING gist (
    tsrange((play_date + start_time)::timestamp, (play_date + end_time)::timestamp, '[)')
    WITH &&
  )
  WHERE (cancelled_at IS NULL);

-- idx_pickleball_household_per_day (one advance reservation per household
-- per play-day) is unaffected by this change and stays exactly as-is.
