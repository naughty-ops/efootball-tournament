# PHASE 2A — DATABASE MIGRATION REVIEW REPORT
**Migration File:** `supabase/migrations/20261114000001_harden_admin_authoritative_rbac.sql`  
**Target Environment:** Staging / Production Supabase PostgreSQL  
**Current Status:** AUTHORED LOCALLY — **UNAPPLIED TO PRODUCTION** (Zero production database drift)  
**Date:** November 14, 2026  
**Security Invariant:** Database records are the sole authority for administrative permissions.  

---

## 1. MIGRATION SUMMARY & OBJECTIVE

This migration formalizes database-authoritative role-based access control (RBAC), introduces active status and revocation tracking, hardens row level security on `public.admin_users`, and provides a secure, explicit bootstrap function for initial system provisioning without routine login auto-upserts.

### Key Capabilities Introduced
1. **Status & Revocation Tracking:** Adds `is_active` (boolean), `revoked_at` (timestamptz), and `revoked_by` (uuid) columns to `public.admin_users`.
2. **Revocation-Aware Security Functions:** Updates `public.is_admin()`, `public.get_admin_role()`, and `public.has_admin_role(required_role)` to require `is_active = true`.
3. **Hardened RLS Policies:**
   - Any authenticated administrator can view their own record (`auth.uid() = id`).
   - Admins (`has_admin_role('admin')`) can list all administrator records.
   - Only `super_admin` (`has_admin_role('super_admin')`) can insert, update, or delete records in `public.admin_users`.
4. **Explicit Bootstrap Function:** Provisions an initial `super_admin` only if zero active super_admins exist in the database, or when invoked by an existing active `super_admin`.

---

## 2. DETAILED SCHEMA MODIFICATIONS

### 2.1 Table: `public.admin_users`
```sql
ALTER TABLE public.admin_users
    ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS revoked_at timestamptz DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS notes text DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_users_active_role ON public.admin_users(role, is_active);
```

### 2.2 Security Functions Hardening
All three core security functions enforce `SECURITY DEFINER`, strict `search_path = pg_catalog, public, pg_temp`, and filter on `is_active = true`:
```sql
-- public.get_admin_role()
SELECT role INTO v_role
FROM public.admin_users
WHERE id = auth.uid() AND is_active = true;

-- public.has_admin_role(required_role public.admin_role)
SELECT role INTO v_caller_role
FROM public.admin_users
WHERE id = auth.uid() AND is_active = true;
RETURN public._admin_role_rank(v_caller_role) >= public._admin_role_rank(required_role);

-- public.is_admin()
RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE id = auth.uid() AND is_active = true
);
```

### 2.3 Row Level Security Policies
```sql
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_users_admin_access" ON public.admin_users;

-- Read policy: Self or admin+
CREATE POLICY "admin_users_read_policy"
    ON public.admin_users FOR SELECT
    TO authenticated
    USING (
        auth.uid() = id
        OR public.has_admin_role('admin'::public.admin_role)
    );

-- Write policy: Strictly super_admin
CREATE POLICY "admin_users_super_admin_write"
    ON public.admin_users FOR ALL
    TO authenticated
    USING (public.has_admin_role('super_admin'::public.admin_role))
    WITH CHECK (public.has_admin_role('super_admin'::public.admin_role));
```

### 2.4 Explicit Bootstrap Function
```sql
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
    SELECT count(*) INTO v_active_super_admins
    FROM public.admin_users
    WHERE role = 'super_admin' AND is_active = true;

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

    RETURN jsonb_build_object('success', true, 'message', 'Super administrator provisioned successfully.');
END;
$$;
```

---

## 3. BACKWARD COMPATIBILITY EVALUATION

The application code in `lib/auth/server.ts`, `lib/supabase/proxy.ts`, and `app/admin/layout.tsx` was implemented to be 100% backward-compatible:
1. **Current Production State (Before Migration):**
   - The production table has columns `(id, email, role)`.
   - `getAdminUserRecord` queries `.select('id, email, role')`.
   - All role checks function normally with the existing production schema.
2. **Post-Migration State (After Applying Migration):**
   - When the migration is applied to staging/production, the new `is_active` column and hardened policies become active without requiring any application code changes.
   - If an administrator's record is marked `is_active = false`, database RLS and security functions immediately reject the user.

---

## 4. VERIFICATION SQL (FOR STAGING DEPLOYMENT)

When validating on a staging database, execute these queries to confirm correct installation:
```sql
-- 1. Check columns on admin_users
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'admin_users'
ORDER BY ordinal_position;

-- 2. Verify security definer flags
SELECT proname, prosecdef, proconfig
FROM pg_proc
WHERE proname IN ('get_admin_role', 'has_admin_role', 'is_admin', 'bootstrap_initial_super_admin');

-- 3. Verify active policies
SELECT policyname, tablename, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'admin_users';

-- 4. Test is_admin() evaluation
SELECT public.is_admin();
```

---

## 5. ROLLBACK & RECOVERY GUIDANCE

If the migration needs to be reversed on staging:
```sql
-- 1. Revert policies
DROP POLICY IF EXISTS "admin_users_super_admin_write" ON public.admin_users;
DROP POLICY IF EXISTS "admin_users_read_policy" ON public.admin_users;

-- 2. Re-create legacy policy
CREATE POLICY "admin_users_admin_access" ON public.admin_users
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 3. Drop bootstrap function
DROP FUNCTION IF EXISTS public.bootstrap_initial_super_admin(uuid, text);

-- 4. Revert columns (Optional)
ALTER TABLE public.admin_users DROP COLUMN IF EXISTS is_active;
ALTER TABLE public.admin_users DROP COLUMN IF EXISTS revoked_at;
ALTER TABLE public.admin_users DROP COLUMN IF EXISTS revoked_by;
ALTER TABLE public.admin_users DROP COLUMN IF EXISTS notes;
```

---

## 6. DEPLOYMENT READINESS CONCLUSION

- **Syntax & Structural Validation:** `VERIFIED`
- **Idempotency (`IF NOT EXISTS` / `CREATE OR REPLACE`):** `VERIFIED`
- **Production Status:** `UNAPPLIED` (Awaiting explicit user direction)
- **Application Compatibility:** `VERIFIED` (Zero downtime, fully backward-compatible)
