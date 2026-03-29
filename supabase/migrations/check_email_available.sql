-- ─── RPC: check_email_available ──────────────────────────────────────────────
-- Called by the public Request Access form (no auth required).
-- Returns a JSON object: { available: bool, reason: text }
-- Checks both profiles.emails array AND pending access_requests.

CREATE OR REPLACE FUNCTION check_email_available(lookup_email text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clean_email text := lower(trim(lookup_email));
  result json;
BEGIN
  -- Check if email exists in profiles
  IF EXISTS (
    SELECT 1 FROM profiles
    WHERE clean_email = ANY (
      SELECT lower(unnest(emails)) FROM profiles
    )
  ) THEN
    RETURN json_build_object('available', false, 'reason', 'already_registered');
  END IF;

  -- Check if email is in a pending access request (primary or secondary)
  IF EXISTS (
    SELECT 1 FROM access_requests
    WHERE status = 'pending'
      AND (lower(primary_email) = clean_email OR lower(secondary_email) = clean_email)
  ) THEN
    RETURN json_build_object('available', false, 'reason', 'pending_request');
  END IF;

  RETURN json_build_object('available', true, 'reason', null);
END;
$$;

-- Allow anonymous (unauthenticated) users to call this function
GRANT EXECUTE ON FUNCTION check_email_available(text) TO anon;
GRANT EXECUTE ON FUNCTION check_email_available(text) TO authenticated;
