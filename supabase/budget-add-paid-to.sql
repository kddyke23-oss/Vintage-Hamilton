-- Budget Tracker: Add "paid_to" column to budget_entries
-- Run this in the Supabase SQL Editor

ALTER TABLE budget_entries
  ADD COLUMN paid_to text;

COMMENT ON COLUMN budget_entries.paid_to IS 'Optional vendor/payee name for expense entries';
