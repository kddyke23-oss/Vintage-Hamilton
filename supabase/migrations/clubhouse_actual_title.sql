-- Lets a resident (and RCP/committee) see and edit the real title of a
-- masked (private/not-sure) clubhouse reservation, without exposing it on
-- the shared calendar. Keith, 2026-09-05: "the original event title can be
-- displayed/edited [by the owner] — masking should only be for events that
-- are not yours." Previously there was nowhere to put this: a masked
-- booking's real title was never stored at all — calendar_events.title was
-- overwritten with "Private Event — Name" at submission time, and the
-- title input wasn't even shown to the resident for a masked booking.
--
-- Null for a non-masked booking, whose real title already lives in
-- calendar_events.title as normal. Populated only for 'yes'/'not_sure'
-- bookings, from a title input the resident now sees (labelled as their
-- own reference, e.g. "Test scenario 1" — directly useful for RCP/board
-- testing, per Reservations/REQUIREMENTS.md's testing plan). No RLS change
-- needed — this is a plain column on a row already covered by the existing
-- owner/RCP/committee-escalated SELECT policy.
ALTER TABLE clubhouse_reservations ADD COLUMN actual_title text;

COMMENT ON COLUMN clubhouse_reservations.actual_title IS
  'Resident''s own reference title for a masked (private/not-sure) booking — never shown on the shared calendar, only to the owner and RCP/committee. Null for a non-masked booking (its real title already lives in calendar_events.title).';
