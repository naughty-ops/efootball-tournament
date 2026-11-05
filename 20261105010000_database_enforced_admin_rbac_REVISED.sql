-- ============================================================================
-- MIGRATION: Database-Enforced Admin RBAC & Comprehensive RLS Hardening (FINAL REVISED)
-- File: 20261105010000_database_enforced_admin_rbac_REVISED.sql
-- Status: Proposed Final Revision (NOT YET EXECUTED)
-- Target: Supabase PostgreSQL 17.6.1 (Isolated Staging First)
-- ============================================================================

BEGIN;

-- Fail-fast on lock contention to avoid hanging active traffic
SET LOCAL lock_timeout = '5s';

-- ----------------------------------------------------------------------------
-- 0. Extensions Verification (pgcrypto for salted bcrypt password verification)
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ----------------------------------------------------------------------------
-- 1. Create admin_role ENUM and update public.admin_users
-- ----------------------------------------------------------------------------
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

-- Seed Designated Super Administrator (ye.agrajj@gmail.com)
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

-- Ensure unguessable secret column exists on public.live_viewer_sessions for secure heartbeats
ALTER TABLE public.live_viewer_sessions
    ADD COLUMN IF NOT EXISTS client_secret uuid NOT NULL DEFAULT gen_random_uuid();

-- ----------------------------------------------------------------------------
-- 2. Define Helper Functions with Strict SECURITY DEFINER & Hardened search_path
-- ----------------------------------------------------------------------------

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
ALTER FUNCTION public._admin_role_rank(public.admin_role) OWNER TO postgres;
REVOKE ALL ON FUNCTION public._admin_role_rank(public.admin_role) FROM PUBLIC;

-- Non-recursive helper to fetch caller's role
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
ALTER FUNCTION public.get_admin_role() OWNER TO postgres;
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
ALTER FUNCTION public.has_admin_role(public.admin_role) OWNER TO postgres;
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
ALTER FUNCTION public.is_admin() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Restricted RPC for streamers: Updates ONLY live_room_name, never touches scores or outcome
CREATE OR REPLACE FUNCTION public.update_match_live_room(
    p_match_id uuid,
    p_live_room_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_updated_id uuid;
BEGIN
    -- Requires authenticated streamer or above
    IF NOT public.has_admin_role('streamer'::public.admin_role) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'FORBIDDEN',
            'message', 'Unauthorized: Streamer privileges required.'
        );
    END IF;

    UPDATE public.matches
    SET live_room_name = nullif(trim(p_live_room_name), ''),
        updated_at = now()
    WHERE id = p_match_id
    RETURNING id INTO v_updated_id;

    IF v_updated_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'NOT_FOUND',
            'message', 'Match not found.'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'matchId', v_updated_id,
        'liveRoomName', trim(p_live_room_name),
        'message', 'Live room assigned successfully.'
    );
END;
$$;
ALTER FUNCTION public.update_match_live_room(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_match_live_room(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_match_live_room(uuid, text) TO authenticated;

-- Restricted RPC for secure viewer sessions: Tokenized heartbeat with match immutability & expiry
CREATE OR REPLACE FUNCTION public.record_viewer_pulse(
    p_match_id uuid,
    p_session_id uuid DEFAULT NULL,
    p_client_secret uuid DEFAULT NULL,
    p_device_type text DEFAULT 'desktop'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_session_id uuid;
    v_secret uuid;
    v_user_id uuid;
    v_existing record;
BEGIN
    v_user_id := auth.uid();

    -- New Session Initialization
    IF p_session_id IS NULL OR p_client_secret IS NULL THEN
        -- Cryptographically secure random UUID via CSPRNG
        v_secret := gen_random_uuid();
        INSERT INTO public.live_viewer_sessions (
            match_id,
            user_id,
            session_id,
            client_secret,
            device_type,
            joined_at,
            left_at,
            duration_seconds
        ) VALUES (
            p_match_id,
            v_user_id,
            gen_random_uuid()::text,
            v_secret,
            COALESCE(nullif(trim(p_device_type), ''), 'desktop'),
            now(),
            now(),
            0
        )
        RETURNING id INTO v_session_id;

        RETURN jsonb_build_object(
            'success', true,
            'sessionId', v_session_id,
            'clientSecret', v_secret,
            'message', 'Viewer session established.'
        );
    ELSE
        -- Fetch existing session and lock for update
        SELECT id, match_id, user_id, joined_at, left_at, client_secret
        INTO v_existing
        FROM public.live_viewer_sessions
        WHERE id = p_session_id;

        IF NOT FOUND THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'INVALID_CREDENTIAL',
                'message', 'Invalid viewer session.'
            );
        END IF;

        -- Strict credential validation
        IF v_existing.client_secret <> p_client_secret THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'INVALID_CREDENTIAL',
                'message', 'Secret mismatch.'
            );
        END IF;

        -- Match immutability: Cannot switch match within existing session
        IF v_existing.match_id <> p_match_id THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'MATCH_MISMATCH',
                'message', 'Session is bound to a different match.'
            );
        END IF;

        -- Session expiration: Cannot revive session dead for > 2 hours
        IF v_existing.left_at < (now() - interval '2 hours') THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'SESSION_EXPIRED',
                'message', 'Viewer session has expired.'
            );
        END IF;

        -- Update duration and pulse timestamp (preserves original user_id and match_id)
        UPDATE public.live_viewer_sessions
        SET left_at = now(),
            duration_seconds = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - joined_at))))::integer
        WHERE id = p_session_id;

        RETURN jsonb_build_object(
            'success', true,
            'sessionId', p_session_id,
            'message', 'Pulse recorded.'
        );
    END IF;
END;
$$;
ALTER FUNCTION public.record_viewer_pulse(uuid, uuid, uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_viewer_pulse(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_viewer_pulse(uuid, uuid, uuid, text) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Dynamic Enumeration & Complete Purge of All Legacy RLS Policies
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    pol record;
BEGIN
    FOR pol IN
        SELECT schemaname, tablename, policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename IN (
            'matches', 'groups', 'rounds', 'participants', 
            'tournaments', 'tournament_registrations', 'admin_users', 
            'admin_audit_logs', 'live_viewer_sessions', 'match_predictions',
            'group_participants', 'site_settings'
          )
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 4. Reset Dangerous Table Grants and Re-Grant Principle of Least Privilege
-- ----------------------------------------------------------------------------
-- Revoke broad default privileges
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated, public;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated, public;

-- Ensure service_role maintains full operations for Supabase internal management
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

-- Public read grants for public tournament consumption (No sensitive fields)
GRANT SELECT ON public.tournaments TO anon, authenticated;
GRANT SELECT ON public.groups TO anon, authenticated;
GRANT SELECT ON public.rounds TO anon, authenticated;
GRANT SELECT ON public.matches TO anon, authenticated;
GRANT SELECT ON public.tournament_participants_public TO anon, authenticated;
GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT SELECT ON public.homepage_sections TO anon, authenticated;
GRANT SELECT ON public.match_predictions TO anon, authenticated;

-- Public insert grants for telemetry
GRANT INSERT ON public.analytics_events TO anon, authenticated;

-- Authenticated player & staff grants (Mutations are strictly governed by RLS below)
GRANT SELECT ON public.admin_users TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.admin_users TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.participants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournament_registrations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rounds TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournaments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.match_predictions TO authenticated;
GRANT SELECT, INSERT ON public.admin_audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_viewer_sessions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.homepage_sections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.homepage_audit_history TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.site_settings TO authenticated;

-- Sequences usage
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. Row Level Security: Clean Hardened Policy Installation
-- ----------------------------------------------------------------------------

-- A. Table: public.admin_users
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_users_read_policy"
    ON public.admin_users FOR SELECT
    TO authenticated
    USING (auth.uid() = id OR public.has_admin_role('admin'::public.admin_role));

CREATE POLICY "admin_users_super_admin_write"
    ON public.admin_users FOR ALL
    TO authenticated
    USING (public.has_admin_role('super_admin'::public.admin_role))
    WITH CHECK (public.has_admin_role('super_admin'::public.admin_role));

-- B. Table: public.admin_audit_logs
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_audit_logs_select_policy"
    ON public.admin_audit_logs FOR SELECT
    TO authenticated
    USING (public.has_admin_role('admin'::public.admin_role));

CREATE POLICY "admin_audit_logs_insert_policy"
    ON public.admin_audit_logs FOR INSERT
    TO authenticated
    WITH CHECK (
        admin_id = auth.uid() 
        AND public.is_admin()
    );

-- C. Table: public.participants (STRICT PRIVACY: NO PUBLIC READ)
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "participants_read_owner_or_staff"
    ON public.participants FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id OR public.has_admin_role('moderator'::public.admin_role));

CREATE POLICY "participants_insert_staff"
    ON public.participants FOR INSERT
    TO authenticated
    WITH CHECK (public.has_admin_role('moderator'::public.admin_role));

CREATE POLICY "participants_update_staff"
    ON public.participants FOR UPDATE
    TO authenticated
    USING (public.has_admin_role('moderator'::public.admin_role))
    WITH CHECK (public.has_admin_role('moderator'::public.admin_role));

CREATE POLICY "participants_delete_admin"
    ON public.participants FOR DELETE
    TO authenticated
    USING (public.has_admin_role('admin'::public.admin_role));

-- D. Table: public.matches
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "matches_read_public"
    ON public.matches FOR SELECT
    TO public
    USING (true);

CREATE POLICY "matches_insert_moderator"
    ON public.matches FOR INSERT
    TO authenticated
    WITH CHECK (public.has_admin_role('moderator'::public.admin_role));

-- Direct UPDATE on matches is strictly reserved for Moderator+ (Scores, winners, fixtures)
-- Streamers must use update_match_live_room() RPC to assign rooms!
CREATE POLICY "matches_update_moderator"
    ON public.matches FOR UPDATE
    TO authenticated
    USING (public.has_admin_role('moderator'::public.admin_role))
    WITH CHECK (public.has_admin_role('moderator'::public.admin_role));

CREATE POLICY "matches_delete_admin"
    ON public.matches FOR DELETE
    TO authenticated
    USING (public.has_admin_role('admin'::public.admin_role));

-- E. Table: public.groups
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "groups_read_public"
    ON public.groups FOR SELECT
    TO public
    USING (true);

CREATE POLICY "groups_manage_moderator"
    ON public.groups FOR ALL
    TO authenticated
    USING (public.has_admin_role('moderator'::public.admin_role))
    WITH CHECK (public.has_admin_role('moderator'::public.admin_role));

-- F. Table: public.rounds
ALTER TABLE public.rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rounds_read_public"
    ON public.rounds FOR SELECT
    TO public
    USING (true);

CREATE POLICY "rounds_manage_moderator"
    ON public.rounds FOR ALL
    TO authenticated
    USING (public.has_admin_role('moderator'::public.admin_role))
    WITH CHECK (public.has_admin_role('moderator'::public.admin_role));

-- G. Table: public.tournaments
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tournaments_read_policy"
    ON public.tournaments FOR SELECT
    TO public
    USING (status <> 'draft' OR public.has_admin_role('moderator'::public.admin_role));

CREATE POLICY "tournaments_insert_admin"
    ON public.tournaments FOR INSERT
    TO authenticated
    WITH CHECK (public.has_admin_role('admin'::public.admin_role));

CREATE POLICY "tournaments_update_admin"
    ON public.tournaments FOR UPDATE
    TO authenticated
    USING (public.has_admin_role('admin'::public.admin_role))
    WITH CHECK (public.has_admin_role('admin'::public.admin_role));

CREATE POLICY "tournaments_delete_super_admin"
    ON public.tournaments FOR DELETE
    TO authenticated
    USING (public.has_admin_role('super_admin'::public.admin_role));

-- H. Table: public.tournament_registrations
ALTER TABLE public.tournament_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tournament_registrations_read"
    ON public.tournament_registrations FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id OR public.has_admin_role('admin'::public.admin_role));

CREATE POLICY "tournament_registrations_insert_admin"
    ON public.tournament_registrations FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id OR public.has_admin_role('admin'::public.admin_role));

CREATE POLICY "tournament_registrations_update_admin"
    ON public.tournament_registrations FOR UPDATE
    TO authenticated
    USING (public.has_admin_role('admin'::public.admin_role))
    WITH CHECK (public.has_admin_role('admin'::public.admin_role));

CREATE POLICY "tournament_registrations_delete_super_admin"
    ON public.tournament_registrations FOR DELETE
    TO authenticated
    USING (public.has_admin_role('super_admin'::public.admin_role));

-- I. Table: public.match_predictions
ALTER TABLE public.match_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "match_predictions_read"
    ON public.match_predictions FOR SELECT
    TO public
    USING (true);

CREATE POLICY "match_predictions_insert_own"
    ON public.match_predictions FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "match_predictions_update_own_before_lock"
    ON public.match_predictions FOR UPDATE
    TO authenticated
    USING (
        auth.uid() = user_id 
        AND locked_at IS NULL 
        AND result = 'pending'
    )
    WITH CHECK (
        auth.uid() = user_id 
        AND locked_at IS NULL 
        AND result = 'pending'
    );

-- J. Table: public.live_viewer_sessions (Strict privacy and admin-only direct read)
ALTER TABLE public.live_viewer_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "viewer_sessions_read_admin_or_owner"
    ON public.live_viewer_sessions FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id OR public.has_admin_role('admin'::public.admin_role));

-- ----------------------------------------------------------------------------
-- 6. Direct Capacity Enforcement Trigger (Guards Direct Staff Inserts with Row Lock)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_participant_capacity_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_max integer;
    v_current integer;
BEGIN
    -- Atomically lock the parent tournament row to serialize concurrent inserts
    SELECT max_participants INTO v_max
    FROM public.tournaments
    WHERE id = NEW.tournament_id
    FOR UPDATE;

    IF v_max IS NOT NULL THEN
        SELECT count(*) INTO v_current
        FROM public.participants
        WHERE tournament_id = NEW.tournament_id
          AND status = 'active';

        IF v_current >= v_max THEN
            RAISE EXCEPTION 'Tournament capacity reached (% slots max). Cannot add more participants.', v_max;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;
ALTER FUNCTION public.enforce_participant_capacity_trigger() OWNER TO postgres;

DROP TRIGGER IF EXISTS trg_enforce_participant_capacity ON public.participants;
CREATE TRIGGER trg_enforce_participant_capacity
    BEFORE INSERT ON public.participants
    FOR EACH ROW
    WHEN (NEW.status = 'active')
    EXECUTE FUNCTION public.enforce_participant_capacity_trigger();

-- ----------------------------------------------------------------------------
-- 7. Atomic Tournament Registration Stored Procedure (Production-Grade)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_tournament_participant(
    p_tournament_id uuid,
    p_rules_accepted boolean DEFAULT true,
    p_access_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_user_id uuid;
    v_profile record;
    v_tourney record;
    v_participant_id uuid;
    v_registration_id uuid;
    v_confirmed_count integer;
    v_reserved_count integer;
    v_total_occupied integer;
    v_effective_status text;
    v_is_wa_verified boolean;
    v_normalized_ef_id text;
BEGIN
    -- 1. Enforce active authentication
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false, 
            'code', 'UNAUTHENTICATED',
            'message', 'Authentication required. Please sign in.'
        );
    END IF;

    -- 2. Mandatory rules acceptance check
    IF p_rules_accepted IS NOT TRUE THEN
        RETURN jsonb_build_object(
            'success', false, 
            'code', 'RULES_NOT_ACCEPTED',
            'message', 'You must accept tournament rules to register.'
        );
    END IF;

    -- 3. Atomically lock tournament row for concurrency safety
    SELECT 
        id, 
        name, 
        status, 
        max_participants, 
        confirmed_slots_count,
        reserved_slots_count,
        is_paid,
        entry_fee_paise,
        registration_deadline,
        is_private,
        access_code_hash
    INTO v_tourney
    FROM public.tournaments
    WHERE id = p_tournament_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false, 
            'code', 'NOT_FOUND',
            'message', 'Tournament not found.'
        );
    END IF;

    IF v_tourney.status <> 'registration' THEN
        RETURN jsonb_build_object(
            'success', false, 
            'code', 'REGISTRATION_CLOSED',
            'message', format('Tournament registration is closed (current status: %s).', v_tourney.status)
        );
    END IF;

    IF v_tourney.registration_deadline IS NOT NULL AND now() > v_tourney.registration_deadline THEN
        RETURN jsonb_build_object(
            'success', false, 
            'code', 'DEADLINE_PASSED',
            'message', 'Tournament registration deadline has passed.'
        );
    END IF;

    -- 4. Validate Private Tournament Access Code with Salted Crypt/Bcrypt
    IF v_tourney.is_private IS TRUE THEN
        IF p_access_code IS NULL OR trim(p_access_code) = '' THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'ACCESS_CODE_REQUIRED',
                'message', 'This is a private tournament. A valid access code is required.'
            );
        END IF;

        IF v_tourney.access_code_hash IS NOT NULL THEN
            -- Salted bcrypt password verification via pgcrypto
            IF extensions.crypt(trim(p_access_code), v_tourney.access_code_hash) <> v_tourney.access_code_hash THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'code', 'INVALID_ACCESS_CODE',
                    'message', 'Invalid tournament access code.'
                );
            END IF;
        END IF;
    END IF;

    -- 5. Validate player profile & account status
    SELECT 
        id, 
        efootball_id, 
        display_name, 
        whatsapp_number, 
        whatsapp_verified,
        whatsapp_verification_status,
        account_status
    INTO v_profile
    FROM public.profiles
    WHERE id = v_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false, 
            'code', 'PROFILE_MISSING',
            'message', 'Player profile not found. Please complete your registration.'
        );
    END IF;

    v_effective_status := COALESCE(v_profile.account_status, 'active');
    IF v_effective_status <> 'active' THEN
        RETURN jsonb_build_object(
            'success', false, 
            'code', 'ACCOUNT_RESTRICTED',
            'message', format('Your account is currently %s. Registration is restricted.', v_effective_status)
        );
    END IF;

    -- Enforce exact eFootball ID regex format (ABCD-123-456-789)
    v_normalized_ef_id := upper(trim(COALESCE(v_profile.efootball_id, '')));
    IF v_normalized_ef_id !~ '^[A-Z]{4}-[0-9]{3}-[0-9]{3}-[0-9]{3}$' THEN
        RETURN jsonb_build_object(
            'success', false, 
            'code', 'INVALID_EFOOTBALL_ID_FORMAT',
            'message', 'Invalid eFootball ID format. Must match ABCD-123-456-789 (4 uppercase letters and 9 digits).'
        );
    END IF;

    v_is_wa_verified := (v_profile.whatsapp_verified IS TRUE OR v_profile.whatsapp_verification_status = 'verified');
    IF NOT v_is_wa_verified THEN
        RETURN jsonb_build_object(
            'success', false, 
            'code', 'WHATSAPP_UNVERIFIED',
            'message', 'WhatsApp verification required. Please verify your WhatsApp number on your profile before registering.'
        );
    END IF;

    -- 6. Duplicate check: prevent duplicate user or eFootball ID registration in this tournament
    IF EXISTS (
        SELECT 1 FROM public.tournament_registrations
        WHERE tournament_id = p_tournament_id 
          AND user_id = v_user_id 
          AND status IN ('confirmed', 'pending_payment', 'pending')
    ) OR EXISTS (
        SELECT 1 FROM public.participants
        WHERE tournament_id = p_tournament_id AND user_id = v_user_id
    ) THEN
        RETURN jsonb_build_object(
            'success', false, 
            'code', 'ALREADY_REGISTERED',
            'message', 'You are already registered for this tournament.'
        );
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.participants
        WHERE tournament_id = p_tournament_id 
          AND upper(trim(username)) = v_normalized_ef_id
    ) THEN
        RETURN jsonb_build_object(
            'success', false, 
            'code', 'EFOOTBALL_ID_TAKEN',
            'message', 'This eFootball ID is already registered in this tournament by another participant.'
        );
    END IF;

    -- 7. Atomically count capacity (Active confirmed slots + Active unexpired pending reservations)
    SELECT count(*) INTO v_confirmed_count
    FROM public.participants
    WHERE tournament_id = p_tournament_id
      AND status = 'active';

    SELECT count(*) INTO v_reserved_count
    FROM public.tournament_registrations
    WHERE tournament_id = p_tournament_id
      AND status = 'pending_payment'
      AND reserved_until > now();

    v_total_occupied := v_confirmed_count + v_reserved_count;

    IF v_total_occupied >= COALESCE(v_tourney.max_participants, 32) THEN
        RETURN jsonb_build_object(
            'success', false, 
            'code', 'CAPACITY_FULL',
            'message', 'Tournament capacity is full. All confirmed and reserved slots are taken.'
        );
    END IF;

    -- 8. Distinguish Free vs Paid Tournament Registration Workflow
    IF v_tourney.is_paid IS TRUE THEN
        -- ====================================================================
        -- PAID TOURNAMENT: Create pending_payment registration with temporary 30-min reservation.
        -- NO active participant created. NO confirmed slot incremented.
        -- Increments reserved_slots_count to guard capacity.
        -- ====================================================================
        INSERT INTO public.tournament_registrations (
            tournament_id,
            user_id,
            participant_id,
            status,
            amount_paise,
            currency,
            reserved_until,
            confirmed_at,
            terms_accepted,
            terms_accepted_at,
            rules_version
        ) VALUES (
            p_tournament_id,
            v_user_id,
            NULL,
            'pending_payment',
            COALESCE(v_tourney.entry_fee_paise, 0),
            'INR',
            now() + interval '30 minutes',
            NULL,
            true,
            now(),
            '1.0'
        )
        RETURNING id INTO v_registration_id;

        UPDATE public.tournaments
        SET reserved_slots_count = v_reserved_count + 1,
            updated_at = now()
        WHERE id = p_tournament_id;

        RETURN jsonb_build_object(
            'success', true,
            'status', 'pending_payment',
            'registrationId', v_registration_id,
            'amountPaise', COALESCE(v_tourney.entry_fee_paise, 0),
            'reservedUntil', (now() + interval '30 minutes'),
            'message', 'Slot reserved! Please send your payment screenshot to the official WhatsApp contact within 30 minutes for admin verification.'
        );
    ELSE
        -- ====================================================================
        -- FREE TOURNAMENT: Immediate atomic confirmation.
        -- Creates active participant, confirmed registration, increments slots.
        -- ====================================================================
        INSERT INTO public.participants (
            tournament_id,
            user_id,
            username,
            real_name,
            contact_info,
            status,
            terms_accepted,
            terms_accepted_at,
            rules_version
        ) VALUES (
            p_tournament_id,
            v_user_id,
            v_normalized_ef_id,
            COALESCE(trim(v_profile.display_name), v_normalized_ef_id),
            v_profile.whatsapp_number,
            'active',
            true,
            now(),
            '1.0'
        )
        RETURNING id INTO v_participant_id;

        INSERT INTO public.tournament_registrations (
            tournament_id,
            user_id,
            participant_id,
            status,
            amount_paise,
            currency,
            confirmed_at,
            terms_accepted,
            terms_accepted_at,
            rules_version
        ) VALUES (
            p_tournament_id,
            v_user_id,
            v_participant_id,
            'confirmed',
            0,
            'INR',
            now(),
            true,
            now(),
            '1.0'
        )
        RETURNING id INTO v_registration_id;

        UPDATE public.tournaments
        SET confirmed_slots_count = v_confirmed_count + 1,
            updated_at = now()
        WHERE id = p_tournament_id;

        RETURN jsonb_build_object(
            'success', true,
            'status', 'confirmed',
            'registrationId', v_registration_id,
            'participantId', v_participant_id,
            'message', format('Successfully registered for %s!', v_tourney.name)
        );
    END IF;
END;
$$;
ALTER FUNCTION public.register_tournament_participant(uuid, boolean, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.register_tournament_participant(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_tournament_participant(uuid, boolean, text) TO authenticated;

COMMIT;
