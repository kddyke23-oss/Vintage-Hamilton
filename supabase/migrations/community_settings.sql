-- ─── Community Settings: Clubhouse WiFi password ───────────────────────────
-- Single-row settings table (mirrors budget_settings' id=1 pattern) so the
-- WiFi password can be updated from the Admin Panel without a code change.
-- The clubhouse address itself is fixed and hardcoded in HomePage.jsx —
-- Keith confirmed it doesn't change, so it's not stored here.

CREATE TABLE IF NOT EXISTS community_settings (
  id            integer PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- enforces a single row
  wifi_password text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

INSERT INTO community_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE community_settings ENABLE ROW LEVEL SECURITY;

-- Any signed-in resident can read it (shown on the home screen).
CREATE POLICY "Residents can view community settings"
  ON community_settings FOR SELECT
  TO authenticated
  USING (true);

-- Same eligibility as the Admin Panel (/admin/reports) — global admins, or
-- Calendar/Blog/Recommendations app-admins — can update it from the Useful
-- Links tab, per Keith's request to manage it there.
CREATE POLICY "Admin panel eligible users can update community settings"
  ON community_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
    OR EXISTS (
      SELECT 1 FROM app_access
      WHERE user_id = auth.uid() AND role = 'admin'
        AND app_id IN ('calendar', 'blog', 'recommendations')
    )
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
    OR EXISTS (
      SELECT 1 FROM app_access
      WHERE user_id = auth.uid() AND role = 'admin'
        AND app_id IN ('calendar', 'blog', 'recommendations')
    )
  );
