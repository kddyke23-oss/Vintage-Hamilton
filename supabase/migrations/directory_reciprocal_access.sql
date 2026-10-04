-- ─── Directory reciprocity: hide yourself -> no directory access ──────────
-- Social Committee request (2026-10-04): a resident who chooses NOT to appear
-- in the directory (profiles.directory_visible = false) should not be able to
-- browse everyone else's details. Opting back in restores access.
--
-- Enforced in the database (not just the UI) so it holds for every path that
-- touches either value: resident self-edit, Admin > Access edits, invites,
-- access-request approvals and the App Access grant toggle.
--
--   1. AFTER UPDATE OF directory_visible on profiles
--        hidden  -> delete the person's 'directory' app_access row
--        visible -> grant 'directory' (role 'user') if they have an account
--                   and the profile is active
--   2. BEFORE INSERT/UPDATE on app_access
--        refuses (silently skips) a 'directory' grant for a hidden resident,
--        so invites / approvals / the Access grid can't re-grant it
--   3. One-time backfill: revoke directory access from residents who are
--        already hidden. It does NOT mass-grant anything to visible residents.
--
-- Directory ADMINS (app_access role = 'admin') are never touched by any of
-- this, so hiding yourself can't strip an admin of their admin role.
--
-- PREVIEW (run first, read-only) -- who the backfill in step 3 will revoke:
--   SELECT p.resident_id, p.surname, p.names, a.role
--   FROM profiles p JOIN app_access a ON a.user_id = p.id AND a.app_id = 'directory'
--   WHERE p.directory_visible IS NOT TRUE AND a.role IS DISTINCT FROM 'admin';

-- 1. Keep access in step with the visibility flag --------------------------
CREATE OR REPLACE FUNCTION public.directory_access_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS NULL THEN
    RETURN NEW;  -- no login yet; nothing to grant or revoke
  END IF;

  IF NEW.directory_visible IS NOT TRUE THEN
    DELETE FROM public.app_access
    WHERE user_id = NEW.id
      AND app_id = 'directory'
      AND role IS DISTINCT FROM 'admin';
  ELSIF COALESCE(NEW.is_active, true) THEN
    INSERT INTO public.app_access (user_id, app_id, role, granted_at)
    VALUES (NEW.id, 'directory', 'user', now())
    ON CONFLICT (user_id, app_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_directory_access_sync ON public.profiles;
CREATE TRIGGER profiles_directory_access_sync
  AFTER UPDATE OF directory_visible ON public.profiles
  FOR EACH ROW
  WHEN (OLD.directory_visible IS DISTINCT FROM NEW.directory_visible)
  EXECUTE FUNCTION public.directory_access_sync();

-- 2. Don't let anything grant directory access to a hidden resident --------
CREATE OR REPLACE FUNCTION public.directory_access_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = NEW.user_id AND directory_visible IS NOT TRUE
  ) THEN
    RAISE NOTICE 'Directory access skipped for user %: resident is hidden from the directory', NEW.user_id;
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS app_access_directory_guard ON public.app_access;
CREATE TRIGGER app_access_directory_guard
  BEFORE INSERT OR UPDATE ON public.app_access
  FOR EACH ROW
  WHEN (NEW.app_id = 'directory' AND NEW.role IS DISTINCT FROM 'admin')
  EXECUTE FUNCTION public.directory_access_guard();

-- 3. Backfill: revoke from residents who are already hidden -----------------
DELETE FROM public.app_access a
USING public.profiles p
WHERE a.user_id = p.id
  AND a.app_id = 'directory'
  AND a.role IS DISTINCT FROM 'admin'
  AND p.directory_visible IS NOT TRUE;
