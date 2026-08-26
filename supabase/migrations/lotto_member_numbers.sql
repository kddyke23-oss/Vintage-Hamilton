-- ─── Lotto: number-change history ──────────────────────────────────────────
-- lotto_members.nums/pb only ever held a single "current" set of numbers, so
-- editing a member's numbers in place would retroactively change what every
-- past draw shows as "matched" (draws only store the numbers Powerball drew,
-- not which numbers a member held on that date). This table tracks each
-- number set a member has played with an effective date range, so past draws
-- keep being checked against the numbers actually in play at the time, while
-- lotto_members.nums/pb continues to hold a "current numbers" cache used for
-- quick display and for checking brand-new draws.
--
-- Keith confirmed (Aug 2026): a member wants to change numbers, and payments/
-- winnings must keep accumulating on the same member row rather than closing
-- it out and opening a new one. Per-member winnings already come only from
-- (period prize ÷ active members) — never from number matching — so this
-- table only affects the match/"who won" DISPLAY, not any dollar figure.

CREATE TABLE IF NOT EXISTS lotto_member_numbers (
  id             serial PRIMARY KEY,
  member_id      text NOT NULL REFERENCES lotto_members(id) ON DELETE CASCADE,
  nums           int[] NOT NULL,
  pb             int NOT NULL,
  effective_from date NOT NULL,
  effective_to   date,                 -- null = still current
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lotto_member_numbers_member
  ON lotto_member_numbers(member_id, effective_from);

ALTER TABLE lotto_member_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lotto users can view number history"
  ON lotto_member_numbers FOR SELECT
  TO authenticated
  USING (has_lotto_access());

CREATE POLICY "Lotto admins can insert number history"
  ON lotto_member_numbers FOR INSERT
  TO authenticated
  WITH CHECK (is_lotto_admin());

CREATE POLICY "Lotto admins can update number history"
  ON lotto_member_numbers FOR UPDATE
  TO authenticated
  USING (is_lotto_admin())
  WITH CHECK (is_lotto_admin());

-- Backfill: every existing member's current numbers become their one history
-- row, effective from their join date (the only assumption possible, since
-- nothing before this migration ever tracked more than one set per member —
-- this is exact for every member except the one about to change numbers).
INSERT INTO lotto_member_numbers (member_id, nums, pb, effective_from, effective_to)
SELECT id, nums, pb, join_date, NULL
FROM lotto_members
WHERE nums IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM lotto_member_numbers existing WHERE existing.member_id = lotto_members.id
  );
