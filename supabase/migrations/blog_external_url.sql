-- ─── Blog posts: external URL field ────────────────────────────────────────
-- Mirrors calendar_events.external_url (see supabase-phase2.sql / calendar setup)
-- so blog posts can optionally link out to a website, ticketing page, etc.

ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS external_url text;
