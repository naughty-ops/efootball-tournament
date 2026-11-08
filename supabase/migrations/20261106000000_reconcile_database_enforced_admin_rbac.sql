-- ============================================================================
-- Migration: 20261106000000_reconcile_database_enforced_admin_rbac.sql
-- Description: Official migration reconciliation for Database-Enforced Admin RBAC
-- Incorporates schema additions from 20261105010000_database_enforced_admin_rbac_REVISED.sql
-- into the official supabase/migrations history.
-- ============================================================================

-- 0. Extensions Verification
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1. Create admin_role ENUM and update public.admin_users
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'admin_role') THEN
        CREATE TYPE public.admin_role AS ENUM (
            'super_admin',
            'admin',
            'moderator',
            'streamer'
        );
    END IF;
END $$;

-- Add RBAC metadata columns to admin_users table
ALTER TABLE public.admin_users 
    ADD COLUMN IF NOT EXISTS role public.admin_role NOT NULL DEFAULT 'moderator',
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_admin_users_role ON public.admin_users(role);

-- Seed Designated Super Administrator (ye.agrajj@gmail.com) if present
INSERT INTO public.admin_users (id, email, role, created_at, updated_at)
VALUES (
    '30080df7-5188-4630-b597-b8493ebe045d',
    'ye.agrajj@gmail.com',
    'super_admin'::public.admin_role,
    now(),
    now()
)
ON CONFLICT (id) DO UPDATE 
SET role = 'super_admin'::public.admin_role,
    updated_at = now();

-- Ensure private tournament columns exist on public.tournaments
ALTER TABLE public.tournaments
    ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS access_code_hash text;

CREATE INDEX IF NOT EXISTS idx_tournaments_is_private ON public.tournaments(is_private);

-- Ensure unguessable secret column exists on public.live_viewer_sessions for secure heartbeats
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'live_viewer_sessions') THEN
        ALTER TABLE public.live_viewer_sessions
            ADD COLUMN IF NOT EXISTS client_secret uuid NOT NULL DEFAULT gen_random_uuid();
    END IF;
END $$;

-- 2. Define Helper Functions with Strict SECURITY DEFINER & Hardened search_path

-- Internal role rank evaluator (Immutable, private)
CREATE OR REPLACE FUNCTION public._admin_role_rank(r public.admin_role)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT CASE r
        WHEN 'super_admin' THEN 40
        WHEN 'admin'       THEN 30
        WHEN 'moderator'   THEN 20
        WHEN 'streamer'    THEN 10
        ELSE 0
    END;
$$;
REVOKE ALL ON FUNCTION public._admin_role_rank(public.admin_role) FROM PUBLIC;

-- Helper to fetch caller's role
CREATE OR REPLACE FUNCTION public.get_admin_role()
RETURNS public.admin_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_role public.admin_role;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT role INTO v_role
    FROM public.admin_users
    WHERE id = auth.uid();

    RETURN v_role;
END;
$$;
REVOKE ALL ON FUNCTION public.get_admin_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_role() TO authenticated;

-- Verify caller satisfies minimum role rank
CREATE OR REPLACE FUNCTION public.has_admin_role(required_role public.admin_role)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_caller_role public.admin_role;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT role INTO v_caller_role
    FROM public.admin_users
    WHERE id = auth.uid();

    IF v_caller_role IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN public._admin_role_rank(v_caller_role) >= public._admin_role_rank(required_role);
END;
$$;
REVOKE ALL ON FUNCTION public.has_admin_role(public.admin_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_admin_role(public.admin_role) TO authenticated;

-- Standard boolean check: true if caller has ANY valid admin/staff role
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM public.admin_users
        WHERE id = auth.uid()
    );
END;
$$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
