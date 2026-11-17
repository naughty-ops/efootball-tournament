-- ============================================================================
-- Migration: 20261118000000_enterprise_admin_rbac_hardening.sql
-- Description: Enterprise Admin RBAC Hardening & Multi-Account Provisioning
-- Security Invariants:
--   1. Database is the sole source of truth for administrative authorization.
--   2. Strict enforcement of is_active = true across all admin security functions.
--   3. Super Admin exclusive authority over public.admin_users mutations.
--   4. Immutable protection against self-promotion and unauthorized role alteration.
--   5. Guaranteed protection against deletion or deactivation of the last active Super Admin.
--   6. Automatic audit trail logging for all administrative account changes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extend admin_role ENUM with finance_admin and support_admin
-- ----------------------------------------------------------------------------
ALTER TYPE public.admin_role ADD VALUE IF NOT EXISTS 'finance_admin';
ALTER TYPE public.admin_role ADD VALUE IF NOT EXISTS 'support_admin';

-- ----------------------------------------------------------------------------
-- 2. Enhance public.admin_users Schema
-- ----------------------------------------------------------------------------
ALTER TABLE public.admin_users
    ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS revoked_at timestamptz DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS notes text DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_users_role_active ON public.admin_users(role, is_active);

-- ----------------------------------------------------------------------------
-- 3. Hardened Administrative Rank & Verification Functions
-- ----------------------------------------------------------------------------

-- A. Role Integer Rank (for hierarchy evaluation)
CREATE OR REPLACE FUNCTION public._admin_role_rank(r public.admin_role)
RETURNS integer
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $$
    SELECT CASE r
        WHEN 'super_admin'   THEN 50
        WHEN 'admin'         THEN 40
        WHEN 'finance_admin' THEN 30
        WHEN 'support_admin' THEN 20
        WHEN 'moderator'     THEN 15
        WHEN 'streamer'      THEN 10
        ELSE 0
    END;
$$;

-- B. Boolean Check for Active Administrator
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
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
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

-- C. Retrieve Current Admin Role (Strictly requiring is_active = true)
CREATE OR REPLACE FUNCTION public.get_admin_role()
RETURNS public.admin_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
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
GRANT EXECUTE ON FUNCTION public.get_admin_role() TO authenticated, service_role;

-- D. Domain & Hierarchy Role Verification (Strictly requiring is_active = true)
CREATE OR REPLACE FUNCTION public.has_admin_role(required_role public.admin_role)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
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

    -- super_admin always satisfies any administrative requirement
    IF v_caller_role = 'super_admin' THEN
        RETURN TRUE;
    END IF;

    -- Exact role match
    IF v_caller_role = required_role THEN
        RETURN TRUE;
    END IF;

    -- General admin satisfies operational and staff roles
    IF v_caller_role = 'admin' AND required_role IN ('finance_admin', 'support_admin', 'moderator', 'streamer') THEN
        RETURN TRUE;
    END IF;

    -- support_admin satisfies moderator duties (tickets, disputes, member verifications)
    IF v_caller_role = 'support_admin' AND required_role = 'moderator' THEN
        RETURN TRUE;
    END IF;

    -- moderator satisfies streamer duties
    IF v_caller_role = 'moderator' AND required_role = 'streamer' THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$;
REVOKE ALL ON FUNCTION public.has_admin_role(public.admin_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_admin_role(public.admin_role) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. Database Trigger: Invariant Enforcement on public.admin_users
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_enforce_admin_users_invariants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
DECLARE
    v_caller_role public.admin_role;
    v_active_super_admins integer;
BEGIN
    -- Only enforce interactive checks when invoked by an authenticated user session
    IF auth.uid() IS NOT NULL THEN
        SELECT role INTO v_caller_role
        FROM public.admin_users
        WHERE id = auth.uid()
          AND is_active = true;

        -- 1. Restrict all administrative changes to active Super Admins
        IF v_caller_role IS DISTINCT FROM 'super_admin' THEN
            RAISE EXCEPTION 'Access Denied: Only an active super_admin can create, modify, or delete administrator accounts.';
        END IF;

        -- 2. Prevent self-promotion or self-modification of roles
        IF (TG_OP = 'UPDATE') AND (auth.uid() = OLD.id) AND (NEW.role IS DISTINCT FROM OLD.role) THEN
            RAISE EXCEPTION 'Security Violation: Administrators cannot modify their own administrative role.';
        END IF;

        -- 3. Prevent self-deletion
        IF (TG_OP = 'DELETE') AND (auth.uid() = OLD.id) THEN
            RAISE EXCEPTION 'Security Violation: Administrators cannot delete their own account.';
        END IF;
    END IF;

    -- 4. Protect the final active super_admin from demotion or deactivation
    IF (TG_OP = 'UPDATE') AND (OLD.role = 'super_admin') AND (OLD.is_active = true) THEN
        IF (NEW.role IS DISTINCT FROM 'super_admin') OR (NEW.is_active = false) THEN
            SELECT count(*) INTO v_active_super_admins
            FROM public.admin_users
            WHERE role = 'super_admin' AND is_active = true AND id != OLD.id;

            IF v_active_super_admins = 0 THEN
                RAISE EXCEPTION 'Security Violation: Cannot demote or deactivate the sole remaining active super_admin.';
            END IF;
        END IF;
    END IF;

    -- 5. Protect the final active super_admin from deletion
    IF (TG_OP = 'DELETE') AND (OLD.role = 'super_admin') AND (OLD.is_active = true) THEN
        SELECT count(*) INTO v_active_super_admins
        FROM public.admin_users
        WHERE role = 'super_admin' AND is_active = true AND id != OLD.id;

        IF v_active_super_admins = 0 THEN
            RAISE EXCEPTION 'Security Violation: Cannot delete the sole remaining active super_admin.';
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

DROP TRIGGER IF EXISTS enforce_admin_users_invariants ON public.admin_users;
CREATE TRIGGER enforce_admin_users_invariants
    BEFORE INSERT OR UPDATE OR DELETE ON public.admin_users
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_enforce_admin_users_invariants();

-- ----------------------------------------------------------------------------
-- 5. Database Trigger: Audit Trail on public.admin_users Mutations
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_audit_admin_users_mutations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
DECLARE
    v_actor_id uuid;
BEGIN
    v_actor_id := COALESCE(auth.uid(), '30080df7-5188-4630-b597-b8493ebe045d'::uuid);

    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.admin_audit_logs (
            admin_id,
            target_user_id,
            action,
            entity_type,
            details,
            new_values,
            status,
            created_at
        ) VALUES (
            v_actor_id,
            NEW.id,
            'create_admin_account',
            'admin_user',
            jsonb_build_object('email', NEW.email, 'role', NEW.role, 'is_active', NEW.is_active),
            jsonb_build_object('role', NEW.role, 'is_active', NEW.is_active, 'notes', NEW.notes),
            'success',
            now()
        );
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO public.admin_audit_logs (
            admin_id,
            target_user_id,
            action,
            entity_type,
            details,
            previous_values,
            new_values,
            status,
            created_at
        ) VALUES (
            v_actor_id,
            NEW.id,
            'update_admin_account',
            'admin_user',
            jsonb_build_object('email', NEW.email, 'role_changed', (NEW.role IS DISTINCT FROM OLD.role), 'status_changed', (NEW.is_active IS DISTINCT FROM OLD.is_active)),
            jsonb_build_object('role', OLD.role, 'is_active', OLD.is_active, 'notes', OLD.notes),
            jsonb_build_object('role', NEW.role, 'is_active', NEW.is_active, 'notes', NEW.notes),
            'success',
            now()
        );
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO public.admin_audit_logs (
            admin_id,
            target_user_id,
            action,
            entity_type,
            details,
            previous_values,
            status,
            created_at
        ) VALUES (
            v_actor_id,
            OLD.id,
            'delete_admin_account',
            'admin_user',
            jsonb_build_object('email', OLD.email, 'role', OLD.role),
            jsonb_build_object('role', OLD.role, 'is_active', OLD.is_active),
            'success',
            now()
        );
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS audit_admin_users_mutations ON public.admin_users;
CREATE TRIGGER audit_admin_users_mutations
    AFTER INSERT OR UPDATE OR DELETE ON public.admin_users
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_audit_admin_users_mutations();

-- ----------------------------------------------------------------------------
-- 6. Hardened Row Level Security on public.admin_users
-- ----------------------------------------------------------------------------
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_users_admin_access" ON public.admin_users;
DROP POLICY IF EXISTS "admin_users_read_policy" ON public.admin_users;
DROP POLICY IF EXISTS "admin_users_super_admin_write" ON public.admin_users;
DROP POLICY IF EXISTS "admin_users_super_admin_insert" ON public.admin_users;
DROP POLICY IF EXISTS "admin_users_super_admin_update" ON public.admin_users;
DROP POLICY IF EXISTS "admin_users_super_admin_delete" ON public.admin_users;

-- Read Policy: An administrator can read their own row, or active super_admin/admin can read all rows
CREATE POLICY "admin_users_read_policy"
    ON public.admin_users FOR SELECT
    TO authenticated
    USING (
        auth.uid() = id
        OR (EXISTS (
            SELECT 1 FROM public.admin_users
            WHERE id = auth.uid()
              AND is_active = true
              AND role IN ('super_admin', 'admin')
        ))
    );

-- Mutation Policy: Strictly super_admin can write to admin_users
CREATE POLICY "admin_users_super_admin_write"
    ON public.admin_users FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.admin_users
            WHERE id = auth.uid()
              AND is_active = true
              AND role = 'super_admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.admin_users
            WHERE id = auth.uid()
              AND is_active = true
              AND role = 'super_admin'
        )
    );

-- ----------------------------------------------------------------------------
-- 7. Provision Official Administrator Accounts
-- ----------------------------------------------------------------------------

-- Account 1: Super Admin (ye.agrajj@gmail.com)
INSERT INTO public.admin_users (id, email, role, is_active, created_by, updated_at)
SELECT u.id, u.email, 'super_admin'::public.admin_role, true, u.id, now()
FROM auth.users u
WHERE u.email = 'ye.agrajj@gmail.com'
ON CONFLICT (id) DO UPDATE
SET role = 'super_admin'::public.admin_role,
    is_active = true,
    revoked_at = NULL,
    revoked_by = NULL,
    updated_at = now();

-- Account 2: Operations Admin (agrajn6227@gmail.com)
INSERT INTO public.admin_users (id, email, role, is_active, created_by, updated_at)
SELECT u.id, u.email, 'admin'::public.admin_role, true, '30080df7-5188-4630-b597-b8493ebe045d'::uuid, now()
FROM auth.users u
WHERE u.email = 'agrajn6227@gmail.com'
ON CONFLICT (id) DO UPDATE
SET role = 'admin'::public.admin_role,
    is_active = true,
    revoked_at = NULL,
    revoked_by = NULL,
    updated_at = now();

-- Account 3: Finance Admin (agraj4242@gmail.com)
INSERT INTO public.admin_users (id, email, role, is_active, created_by, updated_at)
SELECT u.id, u.email, 'finance_admin'::public.admin_role, true, '30080df7-5188-4630-b597-b8493ebe045d'::uuid, now()
FROM auth.users u
WHERE u.email = 'agraj4242@gmail.com'
ON CONFLICT (id) DO UPDATE
SET role = 'finance_admin'::public.admin_role,
    is_active = true,
    revoked_at = NULL,
    revoked_by = NULL,
    updated_at = now();

-- Account 4: Support Admin (supportefootballin@gmail.com) - Provisioned dynamically once registered in auth.users
INSERT INTO public.admin_users (id, email, role, is_active, created_by, updated_at)
SELECT u.id, u.email, 'support_admin'::public.admin_role, true, '30080df7-5188-4630-b597-b8493ebe045d'::uuid, now()
FROM auth.users u
WHERE u.email = 'supportefootballin@gmail.com'
ON CONFLICT (id) DO UPDATE
SET role = 'support_admin'::public.admin_role,
    is_active = true,
    revoked_at = NULL,
    revoked_by = NULL,
    updated_at = now();

-- ----------------------------------------------------------------------------
-- 8. Automated Onboarding Hook for supportefootballin@gmail.com
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_auto_provision_designated_admins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
BEGIN
    IF lower(trim(NEW.email)) = 'supportefootballin@gmail.com' THEN
        INSERT INTO public.admin_users (id, email, role, is_active, created_by, updated_at)
        VALUES (
            NEW.id,
            lower(trim(NEW.email)),
            'support_admin'::public.admin_role,
            true,
            '30080df7-5188-4630-b597-b8493ebe045d'::uuid,
            now()
        )
        ON CONFLICT (id) DO UPDATE
        SET role = 'support_admin'::public.admin_role,
            is_active = true,
            revoked_at = NULL,
            revoked_by = NULL,
            updated_at = now();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_provision_designated_admins ON public.profiles;
CREATE TRIGGER auto_provision_designated_admins
    AFTER INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_auto_provision_designated_admins();
