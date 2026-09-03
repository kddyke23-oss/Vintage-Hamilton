-- ─── Check payee / mailing address as board-editable settings ──────────────
-- Keith, 2026-09-03: don't hardcode who the check is made out to or where it
-- gets mailed anywhere — RCP hasn't confirmed the answer yet, and if the
-- clubhouse booking contact ever changes from RCP to someone else, this
-- should be a settings update, not a code change. Both nullable/blank until
-- someone fills them in via Admin -> Reports -> Clubhouse Reservation
-- Settings; nothing currently displays these values yet (no resident-facing
-- payment-instructions copy has been written), so leaving them blank is
-- safe -- this just lays the groundwork for that copy once RCP answers.

ALTER TABLE community_settings
  ADD COLUMN IF NOT EXISTS clubhouse_check_payable_to      text,
  ADD COLUMN IF NOT EXISTS clubhouse_check_mailing_address text;
