-- ─── General Functions grouping ────────────────────────────────────────────
-- Lets admins fold a set of apps into one "General Functions" toggle in
-- Admin -> Access, instead of granting/reviewing them one column at a time.
-- Keith's decision, 2026-09-04: build Pickleball (and any future app) as its
-- own individually-toggled column first so it can be tested with a handful
-- of residents, then flip it into General Functions once it's ready -- at
-- which point everyone who already has General Functions access picks up
-- the new app automatically (see backfill_general_app() below), with no
-- separate re-invite step. This lets both Pickleball and Clubhouse still
-- go live 10/1 without giving either out before it's ready.
--
-- Directory, Clubhouse, Budget and Lotto are permanently excluded from this
-- grouping -- enforced both in the UI (AccessPage.jsx
-- GENERAL_INELIGIBLE_APP_IDS) and here at the database level (the CHECK
-- constraint below, plus a guard in backfill_general_app), so this can't be
-- bypassed by a raw SQL update or a direct RPC call either:
--   - Directory: kept separate per Keith's original request -- there's a
--     related idea (not yet built) that hiding yourself from the directory
--     should also stop you browsing everyone else's, which only makes sense
--     if Directory access is tracked on its own.
--   - Clubhouse: the 'clubhouse' app_access role does NOT mean "can book
--     the clubhouse" -- booking itself is ungated (see
--     clubhouse_reservations RLS / SocialCalendar.jsx's canRequestClubhouse).
--     'admin' means RCP (full reservation queue) and 'user' means Social
--     Committee (escalated-only queue) -- see clubhouse_committee_role.sql.
--     Folding it into General Functions would silently make every general
--     resident a Social Committee member.
--   - Budget, Lotto: 2026-09-04, per Keith -- both have functionality that
--     shouldn't be handed to everybody by default; access to either should
--     stay an explicit, individual grant/revoke.

CREATE TABLE IF NOT EXISTS app_group_config (
  app_id     text PRIMARY KEY,
  is_general boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_group_config_ineligible_check CHECK (
    NOT (is_general = true AND app_id IN ('directory', 'clubhouse', 'budget', 'lotto'))
  )
);

-- Seed every known app. Calendar/Blog/Recommendations already behave as a
-- bundle today (DEFAULT_APPROVED_APPS in create-user/index.ts), so they
-- start General. Everything else starts individual -- including Pickleball,
-- so its existing testers keep exactly the access they have today and
-- nobody else picks it up until the checkbox is flipped.
INSERT INTO app_group_config (app_id, is_general) VALUES
  ('directory',       false),
  ('calendar',        true),
  ('lotto',           false),
  ('blog',            true),
  ('recommendations', true),
  ('budget',          false),
  ('pickleball',      false),
  ('clubhouse',       false)
ON CONFLICT (app_id) DO NOTHING;

ALTER TABLE app_group_config ENABLE ROW LEVEL SECURITY;

-- Read: any global admin. (AccessPage.jsx is already is_admin-gated, and
-- create-user's approve-request path uses the service-role key, which
-- bypasses RLS entirely.)
CREATE POLICY "Global admins can view app group config"
  ON app_group_config FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- Write: same -- global admins only. This controls default provisioning for
-- every resident, so it's intentionally narrower than per-app admin rights.
CREATE POLICY "Global admins can update app group config"
  ON app_group_config FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Global admins can insert app group config"
  ON app_group_config FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- ─── Backfill: run once, right when an app joins General Functions ────────
-- For every resident who currently holds General Functions access (derived
-- from the OTHER apps already in the group, passed in as
-- p_existing_general_ids -- i.e. the group as it stood *before* this app
-- joined), grant the same role (admin carries over as admin, anything else
-- as user) on the newly-added app. Residents with no current General
-- Functions access are untouched -- this never widens who has *general*
-- access, only what the people who already have it can now reach.
CREATE OR REPLACE FUNCTION backfill_general_app(p_new_app_id text, p_existing_general_ids text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Only a global admin can run this.';
  END IF;

  IF p_new_app_id IN ('directory', 'clubhouse', 'budget', 'lotto') THEN
    RAISE EXCEPTION '% can never join General Functions.', p_new_app_id;
  END IF;

  WITH current_general AS (
    SELECT user_id, bool_or(role = 'admin') AS is_admin_role
    FROM app_access
    WHERE app_id = ANY(p_existing_general_ids)
    GROUP BY user_id
  ),
  upserted AS (
    INSERT INTO app_access (user_id, app_id, role, granted_at)
    SELECT user_id, p_new_app_id, CASE WHEN is_admin_role THEN 'admin' ELSE 'user' END, now()
    FROM current_general
    ON CONFLICT (user_id, app_id) DO UPDATE
      SET role = EXCLUDED.role, granted_at = EXCLUDED.granted_at
    RETURNING 1
  )
  SELECT count(*) INTO affected FROM upserted;

  RETURN affected;
END;
$$;

GRANT EXECUTE ON FUNCTION backfill_general_app(text, text[]) TO authenticated;
