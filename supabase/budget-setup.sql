-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  BUDGET TRACKER — Database Setup                                         ║
-- ║  Run in Supabase SQL Editor (in order)                                   ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

-- ─── 1. Tables ────────────────────────────────────────────────────────────────

-- Budget settings (single-row config table)
CREATE TABLE IF NOT EXISTS budget_settings (
  id                     INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  fiscal_year_start_month INT NOT NULL DEFAULT 1 CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  updated_by             BIGINT REFERENCES profiles(resident_id),
  updated_at             TIMESTAMPTZ DEFAULT now()
);

-- Seed the single settings row
INSERT INTO budget_settings (id, fiscal_year_start_month) VALUES (1, 1)
ON CONFLICT (id) DO NOTHING;

-- Budget categories
CREATE TABLE IF NOT EXISTS budget_categories (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  type        TEXT NOT NULL CHECK (type IN ('income', 'expense', 'both')),
  sort_order  INT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Budget targets (per category per fiscal year)
CREATE TABLE IF NOT EXISTS budget_targets (
  id            SERIAL PRIMARY KEY,
  category_id   INT NOT NULL REFERENCES budget_categories(id),
  fiscal_year   INT NOT NULL,
  target_amount NUMERIC(10,2) NOT NULL,
  notes         TEXT,
  created_by    BIGINT REFERENCES profiles(resident_id),
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (category_id, fiscal_year)
);

-- Budget entries (individual transactions)
CREATE TABLE IF NOT EXISTS budget_entries (
  id               SERIAL PRIMARY KEY,
  entry_date       DATE NOT NULL,
  category_id      INT NOT NULL REFERENCES budget_categories(id),
  description      TEXT NOT NULL,
  amount           NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  entry_type       TEXT NOT NULL CHECK (entry_type IN ('income', 'expense')),
  receipt_url      TEXT,
  receipt_filename TEXT,
  created_by       BIGINT NOT NULL REFERENCES profiles(resident_id),
  updated_by       BIGINT REFERENCES profiles(resident_id),
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_budget_entries_date ON budget_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_budget_entries_category ON budget_entries(category_id);
CREATE INDEX IF NOT EXISTS idx_budget_entries_type ON budget_entries(entry_type);


-- ─── 2. RLS Helper Functions ──────────────────────────────────────────────────

-- Check if current user has any budget access
CREATE OR REPLACE FUNCTION has_budget_access()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true
  ) OR EXISTS (
    SELECT 1 FROM app_access
    WHERE user_id = auth.uid() AND app_id = 'budget'
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- Check if current user is a budget admin
CREATE OR REPLACE FUNCTION is_budget_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true
  ) OR EXISTS (
    SELECT 1 FROM app_access
    WHERE user_id = auth.uid() AND app_id = 'budget' AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;


-- ─── 3. Enable RLS ───────────────────────────────────────────────────────────

ALTER TABLE budget_settings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_targets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_entries    ENABLE ROW LEVEL SECURITY;


-- ─── 4. RLS Policies ─────────────────────────────────────────────────────────

-- budget_settings
CREATE POLICY "budget_settings_select" ON budget_settings
  FOR SELECT USING (has_budget_access());
CREATE POLICY "budget_settings_update" ON budget_settings
  FOR UPDATE USING (is_budget_admin());

-- budget_categories
CREATE POLICY "budget_categories_select" ON budget_categories
  FOR SELECT USING (has_budget_access());
CREATE POLICY "budget_categories_insert" ON budget_categories
  FOR INSERT WITH CHECK (is_budget_admin());
CREATE POLICY "budget_categories_update" ON budget_categories
  FOR UPDATE USING (is_budget_admin());
CREATE POLICY "budget_categories_delete" ON budget_categories
  FOR DELETE USING (is_budget_admin());

-- budget_targets
CREATE POLICY "budget_targets_select" ON budget_targets
  FOR SELECT USING (has_budget_access());
CREATE POLICY "budget_targets_insert" ON budget_targets
  FOR INSERT WITH CHECK (is_budget_admin());
CREATE POLICY "budget_targets_update" ON budget_targets
  FOR UPDATE USING (is_budget_admin());
CREATE POLICY "budget_targets_delete" ON budget_targets
  FOR DELETE USING (is_budget_admin());

-- budget_entries
CREATE POLICY "budget_entries_select" ON budget_entries
  FOR SELECT USING (has_budget_access());
CREATE POLICY "budget_entries_insert" ON budget_entries
  FOR INSERT WITH CHECK (is_budget_admin());
CREATE POLICY "budget_entries_update" ON budget_entries
  FOR UPDATE USING (is_budget_admin());
CREATE POLICY "budget_entries_delete" ON budget_entries
  FOR DELETE USING (is_budget_admin());


-- ─── 5. Seed Starter Categories ──────────────────────────────────────────────

INSERT INTO budget_categories (name, type, sort_order) VALUES
  ('Seed Funding',    'income',  1),
  ('Social Events',   'expense', 2),
  ('Supplies',        'expense', 3),
  ('Decorations',     'expense', 4),
  ('Food & Beverage', 'expense', 5),
  ('Venue',           'expense', 6),
  ('Entertainment',   'expense', 7),
  ('Admin/Printing',  'expense', 8),
  ('Other Expense',   'expense', 9)
ON CONFLICT (name) DO NOTHING;
