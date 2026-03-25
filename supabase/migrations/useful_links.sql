-- ============================================================================
-- Useful Links — admin-managed link list displayed on the homepage
-- Run this in the Supabase SQL Editor
-- ============================================================================

-- 1. Create the table
CREATE TABLE IF NOT EXISTS useful_links (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  url         TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES auth.users(id)
);

-- 2. Enable RLS
ALTER TABLE useful_links ENABLE ROW LEVEL SECURITY;

-- 3. RLS policies
--    Any authenticated user can read (no app_access needed)
CREATE POLICY "Authenticated users can read useful links"
  ON useful_links FOR SELECT
  TO authenticated
  USING (true);

--    Only super admins can insert/update/delete
CREATE POLICY "Super admins can insert useful links"
  ON useful_links FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Super admins can update useful links"
  ON useful_links FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Super admins can delete useful links"
  ON useful_links FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- 4. Index for alphabetical display
CREATE INDEX idx_useful_links_name ON useful_links (name);
