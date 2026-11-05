# Admin RBAC Safe Rollback & Contingency Plan (Final Hardened)

**Project:** eFootball Tournament Platform  
**Target Schema:** Supabase PostgreSQL 17.6.1 (`cqgbeafenavkeirwsxbg`)  
**Designated Super Administrator:** `ye.agrajj@gmail.com` (`30080df7-5188-4630-b597-b8493ebe045d`)  
**Version:** 3.0 (Post-Third-Pass Review)  

---

## 1. Core Rollback Mandate: Zero Vulnerability Re-Introduction

> [!CAUTION]
> **MANDATORY SECURITY DIRECTIVE:**  
> Under NO circumstances should any rollback restore broad `ALL` table grants to `anon` or `{public}`, nor should any rollback re-create permissive policies (`"Allow write access on matches"`, `"Allow write access on groups"`, etc.) with `qual: true`.  
> Reverting to the previous broken state would immediately expose the live database to unauthenticated data manipulation and deletion attacks.

The Safe Rollback procedure guarantees that:
1. **Existing tournament, participant, profile, match, and auth data is 100% preserved.**
2. **Write access remains strictly guarded by authentication and administrator checks.**
3. **If RBAC features need to be backed out, the system safely falls back to single-admin validation without reopening public loopholes.**

---

## 2. Rollback Triggers & Thresholds

A rollback must be initiated if any of the following conditions occur during deployment verification:
1. **Primary Admin Lockout:** The designated administrator (`ye.agrajj@gmail.com` / `30080df7-5188-4630-b597-b8493ebe045d`) is unable to access `/admin/dashboard` or execute administrative mutations after migration.
2. **Database Deadlock / Lock Timeout:** Migration fails to acquire exclusive table locks within the 5-second `lock_timeout`.
3. **Registration Workflow Disruption:** Authenticated players with verified profiles encounter 500-level errors or unhandled exceptions when calling `register_tournament_participant`.
4. **Post-Deployment Error Spikes:** Unhandled 500 errors on tournament or match routes exceed 2% over a 15-minute observation window.

---

## 3. Safe Rollback SQL Specification

The following SQL script cleanly rolls back the granular RBAC roles (`admin_role`, `has_admin_role`, etc.) while **retaining strict RLS protections** against anonymous and unprivileged writes:

```sql
-- ============================================================================
-- SAFE ROLLBACK SCRIPT: Database-Enforced Admin RBAC
-- Target: Supabase PostgreSQL 17.6.1 (cqgbeafenavkeirwsxbg)
-- NOTE: Never restores public write access or permissive qual: true policies.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- 1. Remove trigger and newly introduced functions
DROP TRIGGER IF EXISTS trg_enforce_participant_capacity ON public.participants;
DROP FUNCTION IF EXISTS public.enforce_participant_capacity_trigger();
DROP FUNCTION IF EXISTS public.record_viewer_pulse(uuid, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.update_match_live_room(uuid, text);
DROP FUNCTION IF EXISTS public.register_tournament_participant(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.has_admin_role(public.admin_role);
DROP FUNCTION IF EXISTS public.get_admin_role();
DROP FUNCTION IF EXISTS public._admin_role_rank(public.admin_role);

-- 2. Restore hardened, single-admin is_admin() function
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM public.admin_users
        WHERE id = auth.uid()
          AND LOWER(TRIM(email)) = 'ye.agrajj@gmail.com'
    );
END;
$$;
ALTER FUNCTION public.is_admin() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- 3. Maintain strict single-admin RLS policies (DO NOT RESTORE PUBLIC WRITES)
-- Matches: Public can view, only verified admin can mutate
DROP POLICY IF EXISTS "matches_insert_moderator" ON public.matches;
DROP POLICY IF EXISTS "matches_update_moderator" ON public.matches;
DROP POLICY IF EXISTS "matches_delete_admin" ON public.matches;

CREATE POLICY "matches_admin_write_rollback"
    ON public.matches FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Groups & Rounds: Only verified admin can mutate
DROP POLICY IF EXISTS "groups_manage_moderator" ON public.groups;
CREATE POLICY "groups_admin_write_rollback"
    ON public.groups FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "rounds_manage_moderator" ON public.rounds;
CREATE POLICY "rounds_admin_write_rollback"
    ON public.rounds FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Participants: Preserve privacy; only admin can mutate
DROP POLICY IF EXISTS "participants_insert_staff" ON public.participants;
DROP POLICY IF EXISTS "participants_update_staff" ON public.participants;
DROP POLICY IF EXISTS "participants_delete_admin" ON public.participants;

CREATE POLICY "participants_admin_write_rollback"
    ON public.participants FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Tournaments: Only verified admin can mutate
DROP POLICY IF EXISTS "tournaments_insert_admin" ON public.tournaments;
DROP POLICY IF EXISTS "tournaments_update_admin" ON public.tournaments;
DROP POLICY IF EXISTS "tournaments_delete_super_admin" ON public.tournaments;

CREATE POLICY "tournaments_admin_write_rollback"
    ON public.tournaments FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 4. Clean up RBAC columns and type
ALTER TABLE public.admin_users DROP COLUMN IF EXISTS role;
ALTER TABLE public.admin_users DROP COLUMN IF EXISTS updated_at;
ALTER TABLE public.admin_users DROP COLUMN IF EXISTS created_by;
ALTER TABLE public.tournaments DROP COLUMN IF EXISTS is_private;
ALTER TABLE public.tournaments DROP COLUMN IF EXISTS access_code_hash;
ALTER TABLE public.live_viewer_sessions DROP COLUMN IF EXISTS client_secret;

DROP TYPE IF EXISTS public.admin_role CASCADE;

COMMIT;
```

---

## 4. Post-Rollback Security Verification Checklist

- [ ] Anonymous requests to `PATCH /rest/v1/matches` return HTTP 401 / 403.
- [ ] Anonymous requests to `DELETE /rest/v1/tournaments` return HTTP 401 / 403.
- [ ] `public.participants` direct SELECT by anonymous visitors returns `[]` (empty) or 401.
- [ ] Super Administrator `ye.agrajj@gmail.com` can access admin pages and perform tournament operations.
- [ ] Regular player accounts are redirected away from `/admin/*`.
- [ ] Table grants for `anon` remain limited strictly to safe public `SELECT`.
