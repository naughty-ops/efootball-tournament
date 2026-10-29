-- ============================================================================
-- Migration: 20261022010000_strictly_harden_admin_security.sql
-- Description:
-- 1. Purge all unauthorized users from public.admin_users (allowlist only ye.agrajj@gmail.com)
-- 2. Provision only ye.agrajj@gmail.com from auth.users if account exists
-- 3. Strictly redefine public.is_admin() with dual JWT email and DB verification
-- 4. Harden RLS policies on public.admin_users to prevent privilege escalation
-- ============================================================================

-- 1. Purge any unauthorized or rogue accounts from public.admin_users
DELETE FROM public.admin_users
WHERE LOWER(TRIM(email)) != 'ye.agrajj@gmail.com';

-- 2. Safely provision the designated administrator if the auth.users account exists
INSERT INTO public.admin_users (id, email)
SELECT id, email FROM auth.users
WHERE LOWER(TRIM(email)) = 'ye.agrajj@gmail.com'
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

-- 3. Strictly redefine public.is_admin() function
-- Requirements:
-- - Reject unauthenticated callers (auth.uid() IS NULL)
-- - Reject any user whose verified JWT email is not ye.agrajj@gmail.com
-- - Require valid matching record in public.admin_users
-- - Fixed search_path (public, auth) with SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
DECLARE
    jwt_email TEXT;
BEGIN
    -- Step A: Verify caller is authenticated
    IF auth.uid() IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Step B: Extract verified email claim directly from Supabase Auth JWT
    jwt_email := LOWER(TRIM(COALESCE(auth.jwt() ->> 'email', '')));
    IF jwt_email != 'ye.agrajj@gmail.com' THEN
        RETURN FALSE;
    END IF;

    -- Step C: Confirm corresponding provisioned record in public.admin_users
    RETURN EXISTS (
        SELECT 1 FROM public.admin_users
        WHERE id = auth.uid()
        AND LOWER(TRIM(email)) = 'ye.agrajj@gmail.com'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

-- Revoke default public execution privileges and grant only to authenticated and service_role
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;

-- 4. Harden Row Level Security on public.admin_users
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to view admin list" ON public.admin_users;
DROP POLICY IF EXISTS "Allow admins to select admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "Allow admins to manage admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "Allow only designated admin to select admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "Allow only designated admin to manage admin_users" ON public.admin_users;

-- Policy: Only verified designated admin can SELECT from admin_users
CREATE POLICY "Allow only designated admin to select admin_users"
    ON public.admin_users FOR SELECT TO authenticated
    USING (public.is_admin());

-- Policy: Only verified designated admin can manage admin_users
CREATE POLICY "Allow only designated admin to manage admin_users"
    ON public.admin_users FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());
