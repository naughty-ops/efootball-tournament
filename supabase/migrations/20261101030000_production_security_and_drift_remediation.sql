-- ============================================================================
-- Migration: 20261101030000_production_security_and_drift_remediation.sql
-- Description:
-- Consolidated Production Security & Drift Remediation Migration
--
-- Incorporates all verified DDL from unapplied historical migrations:
-- 1. 20260706000000_create_site_settings.sql
-- 2. 20260819000000_create_analytics_events_table.sql
-- 3. 20260906000000_create_public_participants_view.sql
-- 4. 20261019000000_reconcile_terms_and_registration_flow.sql
-- 5. 20261030010000_enable_pg_cron_for_reservation_cleanup.sql
--
-- Plus Security & Integrity Drift Fixes:
-- 6. Add missing profile verification columns and status indexes
-- 7. Hardened Row Level Security (RLS) on profiles, admin_users, group_participants
-- 8. Restrict tournament write policies and participant direct exposure
-- 9. Drop orphaned test/diagnostic functions
-- ============================================================================

-- ============================================================================
-- PART 1: MISSING PROFILE VERIFICATION COLUMNS & INDEXES
-- ============================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS efootball_rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS efootball_verification_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS efootball_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS efootball_verified_by TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_efootball_status
  ON public.profiles (efootball_verification_status);

CREATE INDEX IF NOT EXISTS idx_profiles_whatsapp_status
  ON public.profiles (whatsapp_verification_status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_unique_efootball_id
  ON public.profiles (efootball_id)
  WHERE efootball_id IS NOT NULL
    AND efootball_id <> '';

-- ============================================================================
-- PART 2: TERMS TRIGGERS RECONCILIATION
-- Drop blocking legacy triggers and functions; set default true on terms columns
-- ============================================================================
DROP TRIGGER IF EXISTS trg_enforce_participant_terms_acceptance ON public.participants CASCADE;
DROP TRIGGER IF EXISTS trg_enforce_registration_terms_accepted ON public.tournament_registrations CASCADE;
DROP FUNCTION IF EXISTS public.check_participant_terms_accepted() CASCADE;
DROP FUNCTION IF EXISTS public.check_registration_terms_accepted() CASCADE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'participants' AND column_name = 'terms_accepted'
  ) THEN
    ALTER TABLE public.participants ALTER COLUMN terms_accepted DROP NOT NULL;
    ALTER TABLE public.participants ALTER COLUMN terms_accepted SET DEFAULT true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tournament_registrations' AND column_name = 'terms_accepted'
  ) THEN
    ALTER TABLE public.tournament_registrations ALTER COLUMN terms_accepted DROP NOT NULL;
    ALTER TABLE public.tournament_registrations ALTER COLUMN terms_accepted SET DEFAULT true;
  END IF;
END $$;

-- ============================================================================
-- PART 3: ROW LEVEL SECURITY HARDENING
-- ============================================================================

-- 3A. Enable RLS on core tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_participants ENABLE ROW LEVEL SECURITY;

-- 3B. Revoke broad/default permissions
REVOKE ALL ON public.profiles FROM anon, authenticated;
REVOKE ALL ON public.admin_users FROM anon, authenticated;
REVOKE ALL ON public.group_participants FROM anon, authenticated;

-- 3C. admin_users policies
DROP POLICY IF EXISTS "admin_users_admin_access" ON public.admin_users;
DROP POLICY IF EXISTS "admin_users_service_role" ON public.admin_users;
DROP POLICY IF EXISTS "Allow authenticated full access to admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "Allow anon full access to admin_users" ON public.admin_users;

CREATE POLICY "admin_users_admin_access" ON public.admin_users
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_users TO authenticated;

-- 3D. profiles policies
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
DROP POLICY IF EXISTS "Allow public read on profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow authenticated users to read all profiles" ON public.profiles;

-- Self view
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- Self registration / insert
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- Self update (prevent self-verification tampering)
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND (
      efootball_verification_status IS NOT DISTINCT FROM 'not_submitted'
      OR efootball_verification_status IS NOT DISTINCT FROM 'pending'
      OR efootball_verification_status = (SELECT p.efootball_verification_status FROM public.profiles p WHERE p.id = auth.uid())
    )
    AND (
      whatsapp_verification_status IS NOT DISTINCT FROM 'not_submitted'
      OR whatsapp_verification_status IS NOT DISTINCT FROM 'pending'
      OR whatsapp_verification_status = (SELECT p.whatsapp_verification_status FROM public.profiles p WHERE p.id = auth.uid())
    )
    AND efootball_verified_at IS NOT DISTINCT FROM (SELECT p.efootball_verified_at FROM public.profiles p WHERE p.id = auth.uid())
    AND efootball_verified_by IS NOT DISTINCT FROM (SELECT p.efootball_verified_by FROM public.profiles p WHERE p.id = auth.uid())
    AND whatsapp_verified_at IS NOT DISTINCT FROM (SELECT p.whatsapp_verified_at FROM public.profiles p WHERE p.id = auth.uid())
  );

-- Admin manage all profiles
CREATE POLICY "profiles_admin_all" ON public.profiles
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;

-- 3E. group_participants policies
DROP POLICY IF EXISTS "group_participants_public_read" ON public.group_participants;
DROP POLICY IF EXISTS "group_participants_admin_write" ON public.group_participants;

CREATE POLICY "group_participants_public_read" ON public.group_participants
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "group_participants_admin_write" ON public.group_participants
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT ON public.group_participants TO anon, authenticated;
GRANT ALL ON public.group_participants TO authenticated;

-- 3F. Tournament write hardening: drop overly permissive legacy policies
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.groups;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.groups;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON public.groups;

DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.matches;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.matches;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON public.matches;

DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.rounds;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.rounds;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON public.rounds;

DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.participants;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.participants;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON public.participants;

-- Restrict direct SELECT on participants to owner or admin
DROP POLICY IF EXISTS "participants_read_all" ON public.participants;
DROP POLICY IF EXISTS "Allow public read access on participants" ON public.participants;
DROP POLICY IF EXISTS "participants_select_owner_or_admin" ON public.participants;

CREATE POLICY "participants_select_owner_or_admin" ON public.participants
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- ============================================================================
-- PART 4: PUBLIC PARTICIPANTS VIEW (Reconciled from 20260906000000)
-- ============================================================================
CREATE OR REPLACE VIEW public.tournament_participants_public WITH (security_invoker = false) AS
SELECT
  p.id,
  p.tournament_id,
  p.username,
  p.seed_number,
  p.status,
  p.created_at,
  p.updated_at
FROM public.participants p
JOIN public.tournaments t ON t.id = p.tournament_id
WHERE t.status IN ('registration', 'ongoing', 'completed')
  AND p.status IN ('active', 'eliminated');

GRANT SELECT ON public.tournament_participants_public TO anon, authenticated;

-- ============================================================================
-- PART 5: SITE SETTINGS TABLE (Reconciled from 20260706000000)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.site_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.site_settings FROM anon, authenticated;

DROP POLICY IF EXISTS "site_settings_public_read" ON public.site_settings;
CREATE POLICY "site_settings_public_read" ON public.site_settings
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "site_settings_admin_write" ON public.site_settings;
CREATE POLICY "site_settings_admin_write" ON public.site_settings
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT ALL ON public.site_settings TO authenticated;

-- ============================================================================
-- PART 6: ANALYTICS EVENTS TABLE (Reconciled from 20260819000000)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL,
  page_path TEXT NOT NULL,
  tournament_id UUID REFERENCES public.tournaments(id) ON DELETE SET NULL,
  session_id TEXT NOT NULL,
  anonymous_visitor_id TEXT NOT NULL,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  device_type TEXT,
  browser TEXT,
  os TEXT,
  country TEXT DEFAULT 'India',
  region TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON public.analytics_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_name ON public.analytics_events (event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_events_tournament_id ON public.analytics_events (tournament_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_page_path ON public.analytics_events (page_path);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session_id ON public.analytics_events (session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_anonymous_visitor_id ON public.analytics_events (anonymous_visitor_id);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.analytics_events FROM anon, authenticated;

DROP POLICY IF EXISTS "Allow public insert for analytics events" ON public.analytics_events;
DROP POLICY IF EXISTS "analytics_events_public_insert" ON public.analytics_events;
CREATE POLICY "analytics_events_public_insert" ON public.analytics_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(event_name) <= 100
    AND length(page_path) <= 500
  );

DROP POLICY IF EXISTS "Allow authenticated admin full access on analytics_events" ON public.analytics_events;
DROP POLICY IF EXISTS "analytics_events_admin_all" ON public.analytics_events;
CREATE POLICY "analytics_events_admin_all" ON public.analytics_events
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT INSERT ON public.analytics_events TO anon, authenticated;
GRANT SELECT, DELETE ON public.analytics_events TO authenticated;

-- ============================================================================
-- PART 7: DEFENSIVE PG_CRON SCHEDULING (Reconciled from 20261030010000)
-- ============================================================================
DO $$
BEGIN
  -- Attempt to enable pg_cron if supported in this environment
  CREATE EXTENSION IF NOT EXISTS pg_cron;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'cron' AND table_name = 'job'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'release-expired-reservations-every-5-minutes'
    ) THEN
      PERFORM cron.unschedule('release-expired-reservations-every-5-minutes');
    END IF;

    PERFORM cron.schedule(
      'release-expired-reservations-every-5-minutes',
      '*/5 * * * *',
      'SELECT public.release_expired_reservations();'
    );
    RAISE NOTICE 'pg_cron reservation cleanup job scheduled successfully.';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron could not be configured in this environment (%). Continuing.', SQLERRM;
END $$;

-- ============================================================================
-- PART 8: DROP ORPHANED TEST / DIAGNOSTIC FUNCTIONS
-- ============================================================================
DROP FUNCTION IF EXISTS public._test_ping();
DROP FUNCTION IF EXISTS public.test_ping_mig();
DROP FUNCTION IF EXISTS public.test_payment_scenario(integer);
DROP FUNCTION IF EXISTS public.test_payment_binding_suite();
