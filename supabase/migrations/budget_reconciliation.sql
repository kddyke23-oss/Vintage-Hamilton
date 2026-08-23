-- ─── Budget Tracker: year-end reconcile + sweep to HOA reserve ─────────────
-- 2026-08-23, per Keith: "add an option to reconcile at year end and also
-- sweep excess funds to the HOA reserve account (not maintained by us)."

-- Lets an admin nudge an entry into a different fiscal year than its date
-- alone would imply — for entries logged just after year-end that actually
-- belong to the prior year's budget. NULL = use the date-derived fiscal year
-- (the existing/default behavior, unchanged for every entry until someone
-- explicitly sets this).
ALTER TABLE budget_entries ADD COLUMN IF NOT EXISTS fiscal_year_override integer;

-- One row per fiscal year that has been reconciled/locked. Its presence is
-- what the app treats as "this fiscal year's entries are locked" — deleting
-- the row (via "Reopen Year" in the Summary tab) unlocks it again. The swept
-- amount itself is a normal budget_entries row (category "Transfer to HOA
-- Reserve", dated the last day of the fiscal year) so it flows through the
-- existing opening/closing-balance carry-forward math with no other changes
-- — reconciling does NOT delete or move that entry if you later reopen the
-- year, so an admin who reopens and wants to undo the sweep should remove
-- that ledger entry separately.
CREATE TABLE IF NOT EXISTS budget_reconciliations (
  fiscal_year    integer PRIMARY KEY,
  swept_amount   numeric NOT NULL DEFAULT 0,
  notes          text,
  reconciled_by  bigint, -- profiles.resident_id of whoever reconciled (no FK: resident_id
                         -- has no unique constraint in this schema — same convention as
                         -- budget_entries.created_by, which stores resident_id the same way)
  reconciled_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE budget_reconciliations ENABLE ROW LEVEL SECURITY;

-- Anyone with budget app access can see which years are locked (the app
-- already gates the ledger/summary tabs behind app_access; this mirrors that
-- rather than re-deriving admin status here).
CREATE POLICY "Budget app users can view reconciliations"
  ON budget_reconciliations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM app_access
      WHERE app_access.user_id = auth.uid() AND app_access.app_id = 'budget'
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

-- Only Budget app-admins (or super admins) can reconcile / reopen a year.
CREATE POLICY "Budget admins can manage reconciliations"
  ON budget_reconciliations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM app_access
      WHERE app_access.user_id = auth.uid() AND app_access.app_id = 'budget' AND app_access.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_access
      WHERE app_access.user_id = auth.uid() AND app_access.app_id = 'budget' AND app_access.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

-- Note: this migration does not touch existing budget_entries RLS policies.
-- The reconcile/lock behavior (blocking edits to a reconciled year's entries)
-- is enforced in the app (BudgetTracker.jsx), not at the database level —
-- if you want it enforced even against direct SQL Editor edits, a trigger on
-- budget_entries checking budget_reconciliations would be the next step.
