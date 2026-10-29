-- ============================================================================
-- Migration: 20261021000000_create_profiles_and_harden_auth.sql
-- Description:
-- 1. Create minimal public.profiles table with RLS & updated_at trigger
-- 2. Backfill existing auth.users into profiles
-- 3. Create handle_new_user() trigger for automatic profile creation on auth.users insert
-- 4. Replace vulnerable match_predictions admin SELECT policy with public.is_admin()
-- ============================================================================

-- 1. Minimal public.profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  efootball_id TEXT NOT NULL DEFAULT '',
  efootball_id_verified BOOLEAN NOT NULL DEFAULT FALSE,
  whatsapp_number TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes on profiles
CREATE INDEX IF NOT EXISTS idx_profiles_efootball_id ON public.profiles(efootball_id);
CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON public.profiles(created_at);

-- 2. Trigger function for updated_at
CREATE OR REPLACE FUNCTION public.handle_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_profiles_updated ON public.profiles;
CREATE TRIGGER on_profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_profiles_updated_at();

-- 3. Enable Row Level Security (RLS) on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies to ensure idempotency
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile fields" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;

-- Policy: Users can read their own profile
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- Policy: Users can update their own permitted profile fields (display_name, whatsapp_number, efootball_id)
-- Note: efootball_id_verified cannot be set to true by non-admin users via WITH CHECK guard
CREATE POLICY "Users can update own profile fields"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND (
      -- If user is NOT an admin, efootball_id_verified cannot be altered from false to true
      public.is_admin()
      OR efootball_id_verified = (SELECT p.efootball_id_verified FROM public.profiles p WHERE p.id = auth.uid())
    )
  );

-- Policy: Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_admin());

-- Policy: Admins can update/manage profiles
CREATE POLICY "Admins can manage all profiles"
  ON public.profiles FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 4. Auth User Signup Trigger (safe, non-elevated profile creation)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    display_name,
    efootball_id,
    efootball_id_verified,
    whatsapp_number,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'efootball_id', ''),
    FALSE,
    COALESCE(NEW.raw_user_meta_data->>'whatsapp_number', ''),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    efootball_id = CASE WHEN public.profiles.efootball_id = '' THEN EXCLUDED.efootball_id ELSE public.profiles.efootball_id END,
    whatsapp_number = CASE WHEN public.profiles.whatsapp_number = '' THEN EXCLUDED.whatsapp_number ELSE public.profiles.whatsapp_number END,
    updated_at = NOW();

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Never block auth user creation if profile sync encounters an edge case
    RAISE WARNING 'Profile creation trigger failed for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 5. Safe backfill for existing auth users
INSERT INTO public.profiles (id, display_name, efootball_id, efootball_id_verified, whatsapp_number)
SELECT
  id,
  COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(email, '@', 1)),
  COALESCE(raw_user_meta_data->>'efootball_id', ''),
  FALSE,
  COALESCE(raw_user_meta_data->>'whatsapp_number', '')
FROM auth.users
WHERE id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- 6. Hardening: Replace vulnerable match_predictions policy with public.is_admin()
DROP POLICY IF EXISTS "Admins can view all predictions" ON public.match_predictions;

CREATE POLICY "Admins can view all predictions" ON public.match_predictions
  FOR SELECT TO authenticated
  USING (public.is_admin());
