-- clubhouse_setup_tracking.sql — 2026-10-02
-- Tables & chairs setup planning (Reservations/REQUIREMENTS.md §2.29).
--
-- Who physically sets up extra tables/chairs is a board/RCP staffing question,
-- not software. The portal's job is to make sure the people who arrange it
-- (RCP + the Social Committee) see every request early enough to plan, and get
-- reminded the day before. Public (not-private) bookings auto-confirm and never
-- reach RCP's queue, so before this nothing told anyone about their setup needs.
--
-- Adds:
--   * setup_arranged_at / _by / _note — someone with clubhouse access records
--     that setup has been arranged (and optionally who's doing it).
--   * setup_request_notice_sent_at / setup_7d_notice_sent_at /
--     setup_1d_notice_sent_at / setup_cancel_notice_sent_at — dedupe stamps for
--     the daily clubhouse-setup-check Edge Function.
--   * A trigger that resets the reminder stamps and the "arranged" record if
--     the booking's date/time or table/chair quantities change, so an edited
--     booking gets re-reminded against its new details.
--   * clubhouse_upcoming_setups() — SECURITY DEFINER read for the setup list.
--     Needed because the Social Committee's RLS only returns escalated rows;
--     this exposes just the setup-relevant columns, to clubhouse admins/users
--     and global admins only.
--   * set_clubhouse_setup_arranged() — SECURITY DEFINER write, same audience,
--     touching only the three setup_arranged_* columns.

ALTER TABLE clubhouse_reservations
  ADD COLUMN IF NOT EXISTS setup_arranged_at            timestamptz,
  ADD COLUMN IF NOT EXISTS setup_arranged_by            uuid,
  ADD COLUMN IF NOT EXISTS setup_arranged_note          text,
  ADD COLUMN IF NOT EXISTS setup_request_notice_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS setup_7d_notice_sent_at      timestamptz,
  ADD COLUMN IF NOT EXISTS setup_1d_notice_sent_at      timestamptz,
  ADD COLUMN IF NOT EXISTS setup_cancel_notice_sent_at  timestamptz;

-- Existing future bookings: treat as "not yet announced" so the first run of
-- clubhouse-setup-check surfaces anything already on the books. Past bookings
-- are stamped so they're never announced.
UPDATE clubhouse_reservations
   SET setup_request_notice_sent_at = now(),
       setup_7d_notice_sent_at      = now(),
       setup_1d_notice_sent_at      = now(),
       setup_cancel_notice_sent_at  = now()
 WHERE starts_at < now()
   AND setup_request_notice_sent_at IS NULL;

CREATE OR REPLACE FUNCTION clubhouse_reset_setup_reminders()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.starts_at IS DISTINCT FROM OLD.starts_at
     OR COALESCE(NEW.extra_tables_requested, 0) IS DISTINCT FROM COALESCE(OLD.extra_tables_requested, 0)
     OR COALESCE(NEW.extra_chairs_requested, 0) IS DISTINCT FROM COALESCE(OLD.extra_chairs_requested, 0) THEN
    NEW.setup_7d_notice_sent_at := NULL;
    NEW.setup_1d_notice_sent_at := NULL;
    NEW.setup_arranged_at       := NULL;
    NEW.setup_arranged_by       := NULL;
    NEW.setup_arranged_note     := NULL;
    -- A booking that newly gains tables/chairs gets a fresh "new request" notice.
    IF COALESCE(OLD.extra_tables_requested, 0) + COALESCE(OLD.extra_chairs_requested, 0) = 0 THEN
      NEW.setup_request_notice_sent_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clubhouse_reset_setup_reminders_trg ON clubhouse_reservations;
CREATE TRIGGER clubhouse_reset_setup_reminders_trg
  BEFORE UPDATE ON clubhouse_reservations
  FOR EACH ROW EXECUTE FUNCTION clubhouse_reset_setup_reminders();

CREATE OR REPLACE FUNCTION clubhouse_has_setup_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
      OR EXISTS (SELECT 1 FROM app_access WHERE user_id = auth.uid() AND app_id = 'clubhouse');
$$;

CREATE OR REPLACE FUNCTION clubhouse_upcoming_setups()
RETURNS TABLE (
  id                  bigint,
  starts_at           timestamptz,
  ends_at             timestamptz,
  event_title         text,
  wants_main_clubhouse boolean,
  wants_side_room     boolean,
  extra_tables        integer,
  extra_chairs        integer,
  guest_count         integer,
  status              text,
  booked_by_name      text,
  setup_arranged_at   timestamptz,
  setup_arranged_by_name text,
  setup_arranged_note text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id::bigint, r.starts_at, r.ends_at,
         ce.title,
         r.wants_main_clubhouse, r.wants_side_room,
         COALESCE(r.extra_tables_requested, 0), COALESCE(r.extra_chairs_requested, 0),
         r.guest_count, r.status,
         NULLIF(trim(concat(pb.names, ' ', pb.surname)), ''),
         r.setup_arranged_at,
         NULLIF(trim(concat(pa.names, ' ', pa.surname)), ''),
         r.setup_arranged_note
    FROM clubhouse_reservations r
    LEFT JOIN calendar_events ce ON ce.id = r.calendar_event_id
    LEFT JOIN profiles pb ON pb.id = r.reserved_by
    LEFT JOIN profiles pa ON pa.id = r.setup_arranged_by
   WHERE clubhouse_has_setup_access()
     AND r.status <> 'cancelled'
     AND r.ends_at >= now()
     AND COALESCE(r.extra_tables_requested, 0) + COALESCE(r.extra_chairs_requested, 0) > 0
   ORDER BY r.starts_at;
$$;

CREATE OR REPLACE FUNCTION set_clubhouse_setup_arranged(p_id bigint, p_arranged boolean, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT clubhouse_has_setup_access() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  UPDATE clubhouse_reservations
     SET setup_arranged_at   = CASE WHEN p_arranged THEN now() ELSE NULL END,
         setup_arranged_by   = CASE WHEN p_arranged THEN auth.uid() ELSE NULL END,
         setup_arranged_note = CASE WHEN p_arranged THEN NULLIF(trim(p_note), '') ELSE NULL END
   WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION clubhouse_upcoming_setups() FROM PUBLIC;
REVOKE ALL ON FUNCTION set_clubhouse_setup_arranged(bigint, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION clubhouse_upcoming_setups() TO authenticated;
GRANT EXECUTE ON FUNCTION set_clubhouse_setup_arranged(bigint, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION clubhouse_has_setup_access() TO authenticated;
