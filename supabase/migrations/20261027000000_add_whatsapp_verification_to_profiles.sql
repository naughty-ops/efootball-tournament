-- ============================================================================
-- Migration: 20261027000000_add_whatsapp_verification_to_profiles.sql
-- Description:
-- 1. Add WhatsApp verification status, timestamp, admin notes, and verified flag to public.profiles
-- 2. Add unique index for efootball_id to prevent duplicate registrations
-- 3. Hardened RLS policies:
--    - Profile is strictly read-only for basic details (display_name, efootball_id, whatsapp_number cannot be modified by user after creation)
--    - Users can only request WhatsApp verification (setting status to 'pending')
--    - Users cannot mark themselves as verified
--    - Only authorized administrators (public.is_admin()) can approve/reject verifications
-- 4. Update handle_new_user() trigger for default verification states
-- ============================================================================

-- 1. Add WhatsApp verification columns and email to public.profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_verification_status TEXT NOT NULL DEFAULT 'not_submitted'
    CHECK (whatsapp_verification_status IN ('not_submitted', 'pending', 'verified', 'rejected')),
  ADD COLUMN IF NOT EXISTS whatsapp_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS whatsapp_verification_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whatsapp_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whatsapp_verified_by TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_rejection_reason TEXT;

-- Indexes for verification queue performance
CREATE INDEX IF NOT EXISTS idx_profiles_whatsapp_status ON public.profiles(whatsapp_verification_status);
CREATE INDEX IF NOT EXISTS idx_profiles_efootball_status ON public.profiles(efootball_verification_status);

-- 2. Unique index for efootball_id (prevent duplicate accounts using same eFootball ID)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_unique_efootball_id
  ON public.profiles(efootball_id)
  WHERE efootball_id != '';

-- 3. Update RLS policies on public.profiles
DROP POLICY IF EXISTS "Users can update own profile fields" ON public.profiles;
DROP POLICY IF EXISTS "Users can request whatsapp verification" ON public.profiles;

-- Policy: Users can only submit a verification request for their WhatsApp number
-- Users cannot modify display_name, efootball_id, or whatsapp_number directly.
-- Users cannot set verification flags to true or status to 'verified'.
CREATE POLICY "Users can request whatsapp verification"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND (
      public.is_admin()
      OR (
        -- User cannot edit efootball_id
        efootball_id = (SELECT p.efootball_id FROM public.profiles p WHERE p.id = auth.uid())
        -- User cannot self-verify efootball_id
        AND efootball_id_verified = (SELECT p.efootball_id_verified FROM public.profiles p WHERE p.id = auth.uid())
        -- User cannot self-verify whatsapp_number
        AND whatsapp_verified = (SELECT p.whatsapp_verified FROM public.profiles p WHERE p.id = auth.uid())
        -- User cannot set whatsapp_verification_status to verified
        AND whatsapp_verification_status != 'verified'
        -- User cannot edit whatsapp_number
        AND whatsapp_number = (SELECT p.whatsapp_number FROM public.profiles p WHERE p.id = auth.uid())
      )
    )
  );

-- 4. Update trigger for new user signup initialization
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    display_name,
    efootball_id,
    efootball_id_verified,
    efootball_verification_status,
    whatsapp_number,
    whatsapp_verified,
    whatsapp_verification_status,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'efootball_id', ''),
    FALSE,
    'pending',
    COALESCE(NEW.raw_user_meta_data->>'whatsapp_number', ''),
    FALSE,
    'not_submitted',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = CASE WHEN public.profiles.display_name = '' THEN EXCLUDED.display_name ELSE public.profiles.display_name END,
    efootball_id = CASE WHEN public.profiles.efootball_id = '' THEN EXCLUDED.efootball_id ELSE public.profiles.efootball_id END,
    whatsapp_number = CASE WHEN public.profiles.whatsapp_number = '' THEN EXCLUDED.whatsapp_number ELSE public.profiles.whatsapp_number END,
    updated_at = NOW();

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Profile creation trigger failed for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. Backfill email from auth.users if available
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    UPDATE public.profiles p
    SET email = u.email
    FROM auth.users u
    WHERE p.id = u.id AND (p.email IS NULL OR p.email = '');
  END IF;
END $$;
