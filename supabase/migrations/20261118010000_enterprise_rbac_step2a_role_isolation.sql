-- ============================================================================
-- Migration: 20261118010000_enterprise_rbac_step2a_role_isolation.sql
-- Description: Enterprise RBAC Step 2A - Domain Role Isolation & Invariant Hardening
-- Security Invariants Enforced:
--   1. Role Isolation:
--      - super_admin has universal administrative access.
--      - admin is strictly isolated to tournament/operational duties (no financial/support admin inheritance).
--      - finance_admin is strictly isolated to financial duties (no tournament/operational inheritance).
--      - support_admin is strictly isolated to support tickets and disputes.
--   2. Database RLS Policies:
--      - Tournament resources: restricted to super_admin and admin.
--      - Financial resources: restricted to super_admin and finance_admin.
--      - Support resources: accessible to super_admin, admin, support_admin, moderator.
--   3. Support Admin Auto-Provisioning:
--      - Verifies auth.users identity (NEW.id), email, and email confirmation.
--      - Never trusts public.profiles payload alone.
--   4. Audit Log Immutability:
--      - Strictly prevents actor forging (enforces admin_id = auth.uid()).
--      - Disallows manual UPDATE/DELETE.
--   5. Super Admin Concurrency Protection:
--      - Explicit row-level lock (FOR UPDATE) prevents race conditions during demotions.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Correct has_admin_role() & Introduce Domain-Specific Evaluators
-- ----------------------------------------------------------------------------

-- Core Role Hierarchy Evaluator
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

    -- 1. super_admin possesses universal authority across all domains
    IF v_caller_role = 'super_admin' THEN
        RETURN TRUE;
    END IF;

    -- 2. Exact role match
    IF v_caller_role = required_role THEN
        RETURN TRUE;
    END IF;

    -- 3. Operations admin (admin): satisfies operational/tournament hierarchy
    -- NOTE: admin DOES NOT satisfy finance_admin or support_admin
    IF v_caller_role = 'admin' AND required_role IN ('moderator', 'streamer') THEN
        RETURN TRUE;
    END IF;

    -- 4. Support admin (support_admin): satisfies support tickets & dispute duties
    -- NOTE: support_admin DOES NOT satisfy admin, streamer, or finance_admin
    IF v_caller_role = 'support_admin' AND required_role = 'moderator' THEN
        RETURN TRUE;
    END IF;

    -- 5. Moderator (moderator): satisfies streamer broadcasting duties
    IF v_caller_role = 'moderator' AND required_role = 'streamer' THEN
        RETURN TRUE;
    END IF;

    -- 6. Finance admin (finance_admin): strictly domain isolated (matched by exact role above)

    RETURN FALSE;
END;
$$;
REVOKE ALL ON FUNCTION public.has_admin_role(public.admin_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_admin_role(public.admin_role) TO authenticated, service_role;

-- Fast Domain Evaluator: Super Admin (super_admin only)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.admin_users
        WHERE id = auth.uid()
          AND is_active = true
          AND role = 'super_admin'
    );
$$;
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;

-- Fast Domain Evaluator: Tournament Management (super_admin, admin)
CREATE OR REPLACE FUNCTION public.is_tournament_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.admin_users
        WHERE id = auth.uid()
          AND is_active = true
          AND role IN ('super_admin', 'admin')
    );
$$;
REVOKE ALL ON FUNCTION public.is_tournament_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_tournament_admin() TO authenticated, service_role;

-- Fast Domain Evaluator: Financial Management (super_admin, finance_admin)
CREATE OR REPLACE FUNCTION public.is_financial_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.admin_users
        WHERE id = auth.uid()
          AND is_active = true
          AND role IN ('super_admin', 'finance_admin')
    );
$$;
REVOKE ALL ON FUNCTION public.is_financial_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_financial_admin() TO authenticated, service_role;

-- Fast Domain Evaluator: Support & Dispute Management (super_admin, admin, support_admin, moderator)
CREATE OR REPLACE FUNCTION public.is_support_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.admin_users
        WHERE id = auth.uid()
          AND is_active = true
          AND role IN ('super_admin', 'admin', 'support_admin', 'moderator')
    );
$$;
REVOKE ALL ON FUNCTION public.is_support_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_support_admin() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Concurrency-Safe Last Active Super Admin Protection Trigger
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
    -- Authenticated user validation
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

    -- Concurrency Protection: Acquire row-level lock on super_admin records to serialize checks
    IF ((TG_OP = 'UPDATE') AND (OLD.role = 'super_admin') AND (OLD.is_active = true))
       OR ((TG_OP = 'DELETE') AND (OLD.role = 'super_admin') AND (OLD.is_active = true)) THEN

        -- Lock all super_admin rows for update to prevent race conditions during concurrent mutations
        PERFORM 1 FROM public.admin_users WHERE role = 'super_admin' FOR UPDATE;

        IF (TG_OP = 'UPDATE') AND ((NEW.role IS DISTINCT FROM 'super_admin') OR (NEW.is_active = false)) THEN
            SELECT count(*) INTO v_active_super_admins
            FROM public.admin_users
            WHERE role = 'super_admin' AND is_active = true AND id != OLD.id;

            IF v_active_super_admins = 0 THEN
                RAISE EXCEPTION 'Security Violation: Cannot demote or deactivate the sole remaining active super_admin.';
            END IF;
        END IF;

        IF (TG_OP = 'DELETE') THEN
            SELECT count(*) INTO v_active_super_admins
            FROM public.admin_users
            WHERE role = 'super_admin' AND is_active = true AND id != OLD.id;

            IF v_active_super_admins = 0 THEN
                RAISE EXCEPTION 'Security Violation: Cannot delete the sole remaining active super_admin.';
            END IF;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

CREATE OR REPLACE TRIGGER enforce_admin_users_invariants
    BEFORE INSERT OR UPDATE OR DELETE ON public.admin_users
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_enforce_admin_users_invariants();

-- ----------------------------------------------------------------------------
-- 3. Secure Support Admin Auto-Provisioning Trigger
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_auto_provision_designated_admins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
DECLARE
    v_verified_email text;
    v_email_confirmed_at timestamptz;
BEGIN
    -- Query auth.users directly by NEW.id to verify authentic account ownership
    -- NEVER trust NEW.email from public.profiles
    SELECT email, email_confirmed_at
    INTO v_verified_email, v_email_confirmed_at
    FROM auth.users
    WHERE id = NEW.id;

    -- Only proceed if the auth account exists, email matches designated address, and is confirmed
    IF lower(trim(COALESCE(v_verified_email, ''))) = 'supportefootballin@gmail.com'
       AND v_email_confirmed_at IS NOT NULL THEN

        INSERT INTO public.admin_users (
            id,
            email,
            role,
            is_active,
            created_by,
            updated_at
        ) VALUES (
            NEW.id,
            'supportefootballin@gmail.com',
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

CREATE OR REPLACE TRIGGER auto_provision_designated_admins
    AFTER INSERT OR UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_auto_provision_designated_admins();

-- ----------------------------------------------------------------------------
-- 4. Row Level Security Hardening: Tournament Resources
-- ----------------------------------------------------------------------------

-- A. Table: tournaments
ALTER POLICY "Allow authenticated insert on tournaments"
    ON public.tournaments
    WITH CHECK (public.is_tournament_admin());

ALTER POLICY "Allow authenticated update on tournaments"
    ON public.tournaments
    USING (public.is_tournament_admin())
    WITH CHECK (public.is_tournament_admin());

ALTER POLICY "Allow authenticated delete on tournaments"
    ON public.tournaments
    USING (public.is_tournament_admin());

ALTER POLICY "Allow write access on tournaments"
    ON public.tournaments
    USING (public.is_tournament_admin())
    WITH CHECK (public.is_tournament_admin());

-- B. Table: matches
ALTER POLICY "matches_admin_insert_policy"
    ON public.matches
    WITH CHECK (public.is_tournament_admin());

ALTER POLICY "matches_admin_update_policy"
    ON public.matches
    USING (public.is_tournament_admin())
    WITH CHECK (public.is_tournament_admin());

ALTER POLICY "matches_admin_delete_policy"
    ON public.matches
    USING (public.is_tournament_admin());

-- C. Table: group_participants
ALTER POLICY "group_participants_admin_write"
    ON public.group_participants
    USING (public.is_tournament_admin())
    WITH CHECK (public.is_tournament_admin());

-- D. Table: tournament_registrations
ALTER POLICY "Admins can update registrations"
    ON public.tournament_registrations
    USING (public.is_tournament_admin())
    WITH CHECK (public.is_tournament_admin());

ALTER POLICY "Admins have full access to registrations"
    ON public.tournament_registrations
    USING (public.is_tournament_admin())
    WITH CHECK (public.is_tournament_admin());

-- ----------------------------------------------------------------------------
-- 5. Row Level Security Hardening: Financial Resources
-- ----------------------------------------------------------------------------

-- A. Table: wallet_deposits
ALTER POLICY "Only financial admins can update deposits"
    ON public.wallet_deposits
    USING (public.is_financial_admin())
    WITH CHECK (public.is_financial_admin());

ALTER POLICY "Users can view own deposits"
    ON public.wallet_deposits
    USING ((auth.uid() = user_id) OR public.is_financial_admin());

-- B. Table: payout_transactions
ALTER POLICY "Only admins can update payout transactions"
    ON public.payout_transactions
    USING (public.is_financial_admin())
    WITH CHECK (public.is_financial_admin());

ALTER POLICY "Users and admins can insert payout transactions"
    ON public.payout_transactions
    WITH CHECK (((auth.uid() = player_id) AND (payout_status = 'PENDING'::text)) OR public.is_financial_admin());

ALTER POLICY "Users and admins can view payout transactions"
    ON public.payout_transactions
    USING ((auth.uid() = player_id) OR public.is_financial_admin());

-- C. Table: financial_audit_logs
ALTER POLICY "Only financial admins can view audit logs"
    ON public.financial_audit_logs
    USING (public.is_financial_admin());

-- D. Table: player_wallets
ALTER POLICY "Only admins can update wallets"
    ON public.player_wallets
    USING (public.is_financial_admin())
    WITH CHECK (public.is_financial_admin());

ALTER POLICY "Users and admins can insert wallets"
    ON public.player_wallets
    WITH CHECK ((auth.uid() = user_id) OR public.is_financial_admin());

ALTER POLICY "Users and admins can view wallets"
    ON public.player_wallets
    USING ((auth.uid() = user_id) OR public.is_financial_admin() OR public.is_support_admin());

-- E. Table: wallet_transactions
ALTER POLICY "Only admins can insert wallet transactions"
    ON public.wallet_transactions
    WITH CHECK (public.is_financial_admin());

ALTER POLICY "Users and admins can view wallet transactions"
    ON public.wallet_transactions
    USING ((auth.uid() = user_id) OR public.is_financial_admin() OR public.is_support_admin());

-- F. Table: prize_distributions
ALTER POLICY "Admins can manage prize distributions"
    ON public.prize_distributions
    USING (public.is_financial_admin())
    WITH CHECK (public.is_financial_admin());

-- ----------------------------------------------------------------------------
-- 6. Row Level Security Hardening: Support Resources
-- ----------------------------------------------------------------------------

-- A. Table: support_tickets
ALTER POLICY "Support tickets select policy"
    ON public.support_tickets
    USING (public.is_support_admin() OR ((auth.uid() IS NOT NULL) AND (user_id = auth.uid())));

ALTER POLICY "Support tickets update policy"
    ON public.support_tickets
    USING (public.is_support_admin() OR ((user_id = auth.uid()) AND (status = ANY (ARRAY['open'::text, 'waiting_for_player'::text]))))
    WITH CHECK (public.is_support_admin() OR ((user_id = auth.uid()) AND (status = ANY (ARRAY['open'::text, 'waiting_for_player'::text]))));

ALTER POLICY "Support tickets delete policy"
    ON public.support_tickets
    USING (public.is_tournament_admin());

-- B. Table: ticket_messages
ALTER POLICY "Ticket messages select policy"
    ON public.ticket_messages
    USING (
        public.is_support_admin()
        OR (
            (is_internal = false)
            AND (
                ((ticket_id IS NOT NULL) AND (EXISTS (SELECT 1 FROM public.support_tickets st WHERE st.id = ticket_messages.ticket_id AND st.user_id = auth.uid())))
                OR ((dispute_id IS NOT NULL) AND (EXISTS (SELECT 1 FROM public.match_disputes md JOIN public.participants p ON (p.id = md.reporter_participant_id OR p.id = md.opponent_participant_id) WHERE md.id = ticket_messages.dispute_id AND p.user_id = auth.uid())))
            )
        )
    );

ALTER POLICY "Ticket messages insert policy"
    ON public.ticket_messages
    WITH CHECK (
        public.is_support_admin()
        OR (
            (is_internal = false)
            AND (sender_role = 'player'::text)
            AND (
                ((ticket_id IS NOT NULL) AND (EXISTS (SELECT 1 FROM public.support_tickets st WHERE st.id = ticket_messages.ticket_id AND st.user_id = auth.uid())))
                OR ((dispute_id IS NOT NULL) AND (EXISTS (SELECT 1 FROM public.match_disputes md JOIN public.participants p ON (p.id = md.reporter_participant_id OR p.id = md.opponent_participant_id) WHERE md.id = ticket_messages.dispute_id AND p.user_id = auth.uid())))
            )
        )
    );

ALTER POLICY "Ticket messages update delete policy"
    ON public.ticket_messages
    USING (public.is_support_admin())
    WITH CHECK (public.is_support_admin());

-- C. Table: ticket_audit_logs
ALTER POLICY "Ticket audit logs select policy"
    ON public.ticket_audit_logs
    USING (public.is_support_admin());

ALTER POLICY "Ticket audit logs insert policy"
    ON public.ticket_audit_logs
    WITH CHECK (public.is_support_admin());

-- D. Table: match_disputes
ALTER POLICY "Disputes admin update policy"
    ON public.match_disputes
    USING (public.is_support_admin())
    WITH CHECK (public.is_support_admin());

ALTER POLICY "Disputes admin delete policy"
    ON public.match_disputes
    USING (public.is_tournament_admin());

-- ----------------------------------------------------------------------------
-- 7. Hardened Audit Log Security: admin_audit_logs
-- ----------------------------------------------------------------------------

-- Prevent authenticated forging: allow service_role OR active admin inserting only for themselves
ALTER POLICY "Admins and service_role can insert audit logs"
    ON public.admin_audit_logs
    WITH CHECK (
        (auth.role() = 'service_role')
        OR (
            public.is_admin()
            AND admin_id = auth.uid()
            AND (created_at IS NULL OR created_at <= now())
        )
    );

-- Read policy: super_admin and admin only
ALTER POLICY "Admins can view audit logs"
    ON public.admin_audit_logs
    USING (public.is_tournament_admin());

-- Strictly enforce immutability: no UPDATE, DELETE, or TRUNCATE permitted
REVOKE UPDATE, DELETE, TRUNCATE ON public.admin_audit_logs FROM authenticated, anon, public;

-- ----------------------------------------------------------------------------
-- 8. admin_users Policy: Eliminate Infinite Recursion
-- ----------------------------------------------------------------------------
ALTER POLICY "admin_users_admin_access"
    ON public.admin_users
    USING ((auth.uid() = id) OR public.is_super_admin())
    WITH CHECK (public.is_super_admin());

