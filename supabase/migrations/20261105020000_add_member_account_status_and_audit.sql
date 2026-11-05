-- ============================================================================
-- Migration: 20261105020000_add_member_account_status_and_audit.sql
-- Description:
-- 1. Add account_status, suspension, and admin notes columns to public.profiles
-- 2. Add verification revocation tracking columns
-- 3. Add performance indexes for Member Verification Desk filters and stats
-- 4. Harden RLS policies on profiles to prevent unauthorized self-modification of status
-- ============================================================================

BEGIN;

-- 1. Add member account status & administrative audit columns to public.profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('active', 'suspended', 'disabled')),
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admin_notes TEXT,
  ADD COLUMN IF NOT EXISTS verification_revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_revoked_by TEXT,
  ADD COLUMN IF NOT EXISTS verification_revocation_reason TEXT;

-- 2. Performance indexes for member verification queue and dashboard stats
CREATE INDEX IF NOT EXISTS idx_profiles_account_status 
  ON public.profiles(account_status);

CREATE INDEX IF NOT EXISTS idx_profiles_wa_verification_status 
  ON public.profiles(whatsapp_verification_status);

CREATE INDEX IF NOT EXISTS idx_profiles_ef_verification_status 
  ON public.profiles(efootball_verification_status);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target_user 
  ON public.admin_audit_logs(target_user_id);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at 
  ON public.admin_audit_logs(created_at DESC);

-- 3. Ensure profiles RLS is enabled and policies protect account_status
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Admins retain full access to manage all profile and verification fields
DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
CREATE POLICY "profiles_admin_all"
  ON public.profiles FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Users can read their own profile
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- Users can insert their own initial profile during signup
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- Users can update permitted fields, but CANNOT self-verify or change account_status
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND (
      public.is_admin()
      OR (
        -- User cannot change account_status
        account_status = (SELECT p.account_status FROM public.profiles p WHERE p.id = auth.uid())
        -- User cannot self-verify eFootball ID
        AND efootball_id_verified = (SELECT p.efootball_id_verified FROM public.profiles p WHERE p.id = auth.uid())
        -- User cannot self-verify WhatsApp
        AND whatsapp_verified = (SELECT p.whatsapp_verified FROM public.profiles p WHERE p.id = auth.uid())
        -- User cannot set whatsapp_verification_status to verified
        AND whatsapp_verification_status != 'verified'
        -- User cannot change suspension fields
        AND suspended_at IS NOT DISTINCT FROM (SELECT p.suspended_at FROM public.profiles p WHERE p.id = auth.uid())
        AND suspended_by IS NOT DISTINCT FROM (SELECT p.suspended_by FROM public.profiles p WHERE p.id = auth.uid())
      )
    )
  );

COMMIT;
