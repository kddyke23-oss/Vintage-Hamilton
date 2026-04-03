-- ─── Access Requests table ────────────────────────────────────────────────────
-- Public form submissions from residents requesting portal access.
-- Supports 1 or 2 people per household sharing the same address.

CREATE TABLE IF NOT EXISTS access_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Shared address
  address         text NOT NULL,

  -- Primary person (required)
  primary_surname           text NOT NULL,
  primary_names             text NOT NULL,
  primary_email             text NOT NULL,
  primary_phone             text,
  primary_directory_visible boolean NOT NULL DEFAULT true,
  primary_notify_calendar   boolean NOT NULL DEFAULT true,
  primary_notify_blog       boolean NOT NULL DEFAULT true,

  -- Secondary person (optional — all nullable)
  secondary_surname           text,
  secondary_names             text,
  secondary_email             text,
  secondary_phone             text,
  secondary_directory_visible boolean DEFAULT true,
  secondary_notify_calendar   boolean DEFAULT true,
  secondary_notify_blog       boolean DEFAULT true,

  -- Consent & status
  consent_given   boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  reviewed_by     bigint REFERENCES profiles(resident_id),
  reviewed_at     timestamptz,
  rejection_reason text
);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;

-- Anyone (including anonymous / unauthenticated) can submit a request
CREATE POLICY "Anyone can submit access requests"
  ON access_requests FOR INSERT
  WITH CHECK (true);

-- Only super admins can view requests
CREATE POLICY "Admins can view access requests"
  ON access_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

-- Only super admins can update requests (approve / reject)
CREATE POLICY "Admins can update access requests"
  ON access_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

-- Index for quick pending-request lookups
CREATE INDEX idx_access_requests_status ON access_requests (status);
