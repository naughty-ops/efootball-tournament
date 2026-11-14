-- ============================================================================
-- Migration: 20261114000001_harden_admin_authoritative_rbac.sql
-- Description: Database-Authoritative Admin RBAC & Explicit Bootstrap Hardening
-- Status: Authored locally for Phase 2A; UNAPPLIED to production
-- Security Invariant: Database is the sole authority for administrative roles.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Precondition Checks
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_users') THEN
        RAISE EXCEPTION 'Precondition Failed: Table public.admin_users does not exist.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'admin_role') THEN
        RAISE EXCEPTION 'Precondition Failed: Enum public.admin_role does not exist.';
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Schema Enhancements: Active Status & Revocation Metadata
-- ----------------------------------------------------------------------------
ALTER TABLE public.admin_users
    ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS revoked_at timestamptz DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS notes text DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_users_active_role ON public.admin_users(role, is_active);

-- ----------------------------------------------------------------------------
-- 3. Hardened Security Functions with search_path and is_active validation
-- ----------------------------------------------------------------------------

-- Helper: Get Admin Role (Requires is_active = true)
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
    WHERE id = auth.uid()
      AND is_active = true;

    RETURN v_role;
END;
$$;
REVOKE ALL ON FUNCTION public.get_admin_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_role() TO authenticated;

-- Helper: Verify Caller Satisfies Minimum Role Rank (Requires is_active = true)
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
    WHERE id = auth.uid()
      AND is_active = true;

    IF v_caller_role IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN public._admin_role_rank(v_caller_role) >= public._admin_role_rank(required_role);
END;
$$;
REVOKE ALL ON FUNCTION public.has_admin_role(public.admin_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_admin_role(public.admin_role) TO authenticated;

-- Helper: Boolean Check for Active Administrator
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
          AND is_active = true
    );
END;
$$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. Hardened Row Level Security Policies on public.admin_users
-- ----------------------------------------------------------------------------
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_users_admin_access" ON public.admin_users;
DROP POLICY IF EXISTS "admin_users_read_policy" ON public.admin_users;
DROP POLICY IF EXISTS "admin_users_super_admin_write" ON public.admin_users;
DROP POLICY IF EXISTS "Allow admins to select admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "Allow admins to manage admin_users" ON public.admin_users;

-- Read policy: Any user can read their own admin record, or admins can read all records
CREATE POLICY "admin_users_read_policy"
    ON public.admin_users FOR SELECT
    TO authenticated
    USING (
        auth.uid() = id
        OR public.has_admin_role('admin'::public.admin_role)
    );

-- Write policy: Only active super_admins can insert, update, or delete administrator records
CREATE POLICY "admin_users_super_admin_write"
    ON public.admin_users FOR ALL
    TO authenticated
    USING (public.has_admin_role('super_admin'::public.admin_role))
    WITH CHECK (public.has_admin_role('super_admin'::public.admin_role));

-- ----------------------------------------------------------------------------
-- 5. Explicit One-Time Initial Owner Bootstrap Function
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bootstrap_initial_super_admin(
    p_user_id uuid,
    p_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_active_super_admins integer;
    v_caller_role public.admin_role;
BEGIN
    -- Check how many active super_admins currently exist
    SELECT count(*) INTO v_active_super_admins
    FROM public.admin_users
    WHERE role = 'super_admin' AND is_active = true;

    -- Precondition 1: If active super_admins exist, only an existing active super_admin can invoke this
    IF v_active_super_admins > 0 THEN
        IF auth.uid() IS NULL THEN
            RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: Authentication required.');
        END IF;

        SELECT role INTO v_caller_role
        FROM public.admin_users
        WHERE id = auth.uid() AND is_active = true;

        IF v_caller_role IS DISTINCT FROM 'super_admin' THEN
            RETURN jsonb_build_object('success', false, 'message', 'Forbidden: System already has active super_administrators.');
        END IF;
    END IF;

    -- Provision or update initial super_admin
    INSERT INTO public.admin_users (id, email, role, is_active, created_at, updated_at, created_by)
    VALUES (
        p_user_id,
        trim(lower(p_email)),
        'super_admin'::public.admin_role,
        true,
        now(),
        now(),
        auth.uid()
    )
    ON CONFLICT (id) DO UPDATE
    SET role = 'super_admin'::public.admin_role,
        is_active = true,
        revoked_at = NULL,
        revoked_by = NULL,
        updated_at = now();

    -- Audit log if admin_audit_logs table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_audit_logs') THEN
        INSERT INTO public.admin_audit_logs (admin_id, action, target_id, details, created_at)
        VALUES (
            COALESCE(auth.uid(), p_user_id),
            'bootstrap_initial_super_admin',
            p_user_id,
            jsonb_build_object('email', p_email, 'role', 'super_admin'),
            now()
        );
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Super administrator provisioned successfully.');
END;
$$;
REVOKE ALL ON FUNCTION public.bootstrap_initial_super_admin(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_initial_super_admin(uuid, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. Verification SQL (Run after applying migration to verify)
-- ----------------------------------------------------------------------------
-- SELECT id, email, role, is_active FROM public.admin_users;
-- SELECT proname, prosecdef FROM pg_proc WHERE proname IN ('get_admin_role', 'has_admin_role', 'is_admin');
-- SELECT policyname, tablename, cmd, qual FROM pg_policies WHERE tablename = 'admin_users';

-- ----------------------------------------------------------------------------
-- 7. Rollback SQL (Recovery guidance)
-- ----------------------------------------------------------------------------
-- DROP POLICY IF EXISTS "admin_users_super_admin_write" ON public.admin_users;
-- DROP POLICY IF EXISTS "admin_users_read_policy" ON public.admin_users;
-- DROP FUNCTION IF EXISTS public.bootstrap_initial_super_admin(uuid, text);
-- ALTER TABLE public.admin_users DROP COLUMN IF EXISTS is_active;
-- ALTER TABLE public.admin_users DROP COLUMN IF EXISTS revoked_at;
-- ALTER TABLE public.admin_users DROP COLUMN IF EXISTS revoked_by;
-- ALTER TABLE public.admin_users DROP COLUMN IF EXISTS notes;
