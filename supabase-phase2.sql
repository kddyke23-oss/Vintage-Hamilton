-- ============================================================
-- Vintage @ Hamilton — Phase 2 Database Setup
-- Run this in Supabase: SQL Editor → New Query → Paste → Run
-- ============================================================

-- 1. PROFILES TABLE
-- Extends Supabase auth.users with community-specific info
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT,
  unit_number TEXT,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Residents can read their own profile
CREATE POLICY "Residents can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Admins can insert profiles
CREATE POLICY "Admins can insert profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_roles
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Admins can update profiles
CREATE POLICY "Admins can update profiles"
  ON public.profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- 2. ADMIN ROLES TABLE
CREATE TABLE public.admin_roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active  BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;

-- Anyone logged in can check if they are an admin (needed for routing)
CREATE POLICY "Users can check own admin role"
  ON public.admin_roles FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all admin roles
CREATE POLICY "Admins can view all admin roles"
  ON public.admin_roles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.is_active = true
    )
  );

-- Admins can manage admin roles
CREATE POLICY "Admins can insert admin roles"
  ON public.admin_roles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_roles
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- 3. APP ACCESS TABLE
CREATE TABLE public.app_access (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  app_id     TEXT NOT NULL, -- 'directory' | 'calendar' | 'lotto' | 'blog'
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  granted_by UUID REFERENCES auth.users(id),
  UNIQUE(user_id, app_id)
);

ALTER TABLE public.app_access ENABLE ROW LEVEL SECURITY;

-- Residents can see their own access
CREATE POLICY "Residents can view own access"
  ON public.app_access FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all access
CREATE POLICY "Admins can view all access"
  ON public.app_access FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Admins can grant access
CREATE POLICY "Admins can grant access"
  ON public.app_access FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_roles
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Admins can revoke access
CREATE POLICY "Admins can revoke access"
  ON public.app_access FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- 4. AUTO-CREATE PROFILE ON SIGNUP
-- This trigger fires whenever a new user is created in Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- AFTER RUNNING THIS SQL:
-- Go to Supabase → Authentication → Users → Add your first
-- admin user manually, then run this to grant them admin role:
--
-- INSERT INTO public.admin_roles (user_id)
-- VALUES ('paste-the-user-uuid-here');
-- ============================================================
