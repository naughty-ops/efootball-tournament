-- ============================================================================
-- Migration: 20261108010000_match_streamer_assignments_and_private_data_protection.sql
-- Description:
-- 1. Explicit Match-Level Streamer Assignment Architecture (public.match_streamer_assignments)
-- 2. Database-Level Private Tournament Data Protection (Views & RLS on matches, rounds, groups)
-- 3. Exact eFootball ID Validation & Pending Reservation Uniqueness in register_player_for_tournament()
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Match Streamer Assignments Architecture
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.match_streamer_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
    streamer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_match_streamer_assignment UNIQUE (match_id, streamer_id)
);

CREATE INDEX IF NOT EXISTS idx_match_streamer_assignments_match_id 
    ON public.match_streamer_assignments(match_id);

CREATE INDEX IF NOT EXISTS idx_match_streamer_assignments_streamer_id 
    ON public.match_streamer_assignments(streamer_id);

ALTER TABLE public.match_streamer_assignments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'match_streamer_assignments' AND policyname = 'match_streamer_assignments_admin_all') THEN
        DROP POLICY "match_streamer_assignments_admin_all" ON public.match_streamer_assignments;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'match_streamer_assignments' AND policyname = 'match_streamer_assignments_streamer_select') THEN
        DROP POLICY "match_streamer_assignments_streamer_select" ON public.match_streamer_assignments;
    END IF;
END $$;

CREATE POLICY "match_streamer_assignments_admin_all" ON public.match_streamer_assignments
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "match_streamer_assignments_streamer_select" ON public.match_streamer_assignments
    FOR SELECT TO authenticated
    USING (streamer_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.match_streamer_assignments TO authenticated;
GRANT ALL ON public.match_streamer_assignments TO service_role;


-- ----------------------------------------------------------------------------
-- 2. Protect Private Tournament Data at View & RLS Level
-- ----------------------------------------------------------------------------

-- A. Tournament Participants Public View: Exclude private tournaments
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
  AND p.status IN ('active', 'eliminated')
  AND COALESCE(t.is_private, FALSE) = FALSE;

GRANT SELECT ON public.tournament_participants_public TO anon, authenticated;

-- B. Matches Table: Restrict public SELECT on private tournaments
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'matches' AND policyname = 'Allow public read access on matches') THEN
        DROP POLICY "Allow public read access on matches" ON public.matches;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'matches' AND policyname = 'matches_public_read') THEN
        DROP POLICY "matches_public_read" ON public.matches;
    END IF;
END $$;

CREATE POLICY "matches_public_read" ON public.matches
    FOR SELECT TO anon, authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.tournaments t
            WHERE t.id = matches.tournament_id
              AND COALESCE(t.is_private, FALSE) = FALSE
        )
        OR public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.participants p
            WHERE p.user_id = (SELECT auth.uid())
              AND (p.id = matches.participant_a OR p.id = matches.participant_b)
        )
    );

-- C. Rounds Table: Restrict public SELECT on private tournaments
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rounds' AND policyname = 'Allow public read access on rounds') THEN
        DROP POLICY "Allow public read access on rounds" ON public.rounds;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rounds' AND policyname = 'rounds_public_read') THEN
        DROP POLICY "rounds_public_read" ON public.rounds;
    END IF;
END $$;

CREATE POLICY "rounds_public_read" ON public.rounds
    FOR SELECT TO anon, authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.tournaments t
            WHERE t.id = rounds.tournament_id
              AND COALESCE(t.is_private, FALSE) = FALSE
        )
        OR public.is_admin()
    );

-- D. Groups Table: Restrict public SELECT on private tournaments
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'groups' AND policyname = 'Allow public read access on groups') THEN
        DROP POLICY "Allow public read access on groups" ON public.groups;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'groups' AND policyname = 'groups_public_read') THEN
        DROP POLICY "groups_public_read" ON public.groups;
    END IF;
END $$;

CREATE POLICY "groups_public_read" ON public.groups
    FOR SELECT TO anon, authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.tournaments t
            WHERE t.id = groups.tournament_id
              AND COALESCE(t.is_private, FALSE) = FALSE
        )
        OR public.is_admin()
    );


-- ----------------------------------------------------------------------------
-- 3. Atomic Registration RPC Hardening (register_player_for_tournament)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_player_for_tournament(
    p_tournament_id UUID,
    p_user_id UUID,
    p_rules_accepted BOOLEAN DEFAULT TRUE,
    p_access_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_is_admin BOOLEAN := FALSE;
    v_profile RECORD;
    v_tourney RECORD;
    v_participant_count INTEGER := 0;
    v_pending_reservation_count INTEGER := 0;
    v_total_occupied INTEGER := 0;
    v_participant_id UUID;
    v_registration_id UUID;
    v_raw_efootball_id TEXT;
    v_normalized_efootball_id TEXT;
    v_is_paid BOOLEAN;
    v_existing_reg RECORD;
BEGIN
    v_caller_id := auth.uid();

    -- 1. Validate Authentication
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code', 'UNAUTHENTICATED',
            'message', 'Authentication required. Please sign in to register.'
        );
    END IF;

    -- Caller can only register themselves unless admin
    v_is_admin := public.is_admin();
    IF v_caller_id != p_user_id AND NOT v_is_admin THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code', 'FORBIDDEN',
            'message', 'Cannot register on behalf of another player.'
        );
    END IF;

    -- Rules acceptance check
    IF NOT p_rules_accepted THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code', 'RULES_NOT_ACCEPTED',
            'message', 'You must accept the tournament rules to register.'
        );
    END IF;

    -- 2. Validate Profile and Account Status
    SELECT * INTO v_profile
    FROM public.profiles
    WHERE id = p_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code', 'PROFILE_NOT_FOUND',
            'message', 'Player profile not found. Please complete profile registration.'
        );
    END IF;

    IF COALESCE(v_profile.account_status, 'active') != 'active' THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code', 'ACCOUNT_RESTRICTED',
            'message', format('Your account is currently %s. Registration is restricted.', v_profile.account_status)
        );
    END IF;

    -- 3. Validate WhatsApp Verification
    IF NOT (COALESCE(v_profile.whatsapp_verified, FALSE) = TRUE OR v_profile.whatsapp_verification_status = 'verified') THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code', 'WHATSAPP_NOT_VERIFIED',
            'message', 'WhatsApp verification required. Please verify your WhatsApp number before registering.'
        );
    END IF;

    -- 4. Validate eFootball ID (Strict Canonical Format: ^[A-Z]{4}-[0-9]{3}-[0-9]{3}-[0-9]{3}$)
    -- Note: NO fallback to display_name. eFootball ID must be explicitly configured and validated.
    v_raw_efootball_id := UPPER(TRIM(COALESCE(v_profile.efootball_id, '')));
    IF v_raw_efootball_id = '' THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code', 'EFOOTBALL_ID_MISSING',
            'message', 'Please update your profile with a valid eFootball ID before registering.'
        );
    END IF;

    -- Auto-format 13 continuous chars if user saved ABCD123456789
    IF v_raw_efootball_id ~ '^[A-Z]{4}[0-9]{9}$' THEN
        v_normalized_efootball_id := 
            SUBSTRING(v_raw_efootball_id FROM 1 FOR 4) || '-' ||
            SUBSTRING(v_raw_efootball_id FROM 5 FOR 3) || '-' ||
            SUBSTRING(v_raw_efootball_id FROM 8 FOR 3) || '-' ||
            SUBSTRING(v_raw_efootball_id FROM 11 FOR 3);
    ELSE
        v_normalized_efootball_id := v_raw_efootball_id;
    END IF;

    IF v_normalized_efootball_id !~ '^[A-Z]{4}-[0-9]{3}-[0-9]{3}-[0-9]{3}$' THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code', 'INVALID_EFOOTBALL_ID_FORMAT',
            'message', 'Invalid eFootball ID format. Expected format: ABCD-123-456-789 (4 letters followed by 9 digits).'
        );
    END IF;

    -- 5 & 7. Lock Tournament Row and Verify Status + Capacity atomically
    SELECT id, name, status, max_participants, is_paid, entry_fee_paise, currency, is_private, access_code_hash
    INTO v_tourney
    FROM public.tournaments
    WHERE id = p_tournament_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code', 'TOURNAMENT_NOT_FOUND',
            'message', 'Tournament not found.'
        );
    END IF;

    IF v_tourney.status != 'registration' THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code', 'REGISTRATION_CLOSED',
            'message', format('Tournament registration is closed (current status: %s).', v_tourney.status)
        );
    END IF;

    -- Validate Private Tournament Access Code
    IF COALESCE(v_tourney.is_private, FALSE) IS TRUE THEN
        IF p_access_code IS NULL OR TRIM(p_access_code) = '' THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'code', 'ACCESS_CODE_REQUIRED',
                'message', 'This is a private tournament. A valid access code is required to register.'
            );
        END IF;

        IF v_tourney.access_code_hash IS NOT NULL AND TRIM(v_tourney.access_code_hash) != '' THEN
            IF NOT (
                v_tourney.access_code_hash = TRIM(p_access_code)
                OR (
                    (v_tourney.access_code_hash LIKE '$2a$%' OR v_tourney.access_code_hash LIKE '$2b$%' OR v_tourney.access_code_hash LIKE '$2%')
                    AND extensions.crypt(TRIM(p_access_code), v_tourney.access_code_hash) = v_tourney.access_code_hash
                )
            ) THEN
                RETURN jsonb_build_object(
                    'success', FALSE,
                    'code', 'INVALID_ACCESS_CODE',
                    'message', 'Invalid tournament access code.'
                );
            END IF;
        END IF;
    END IF;

    -- Accurately check total occupied capacity:
    -- 1. All confirmed rows in public.participants
    SELECT COUNT(*) INTO v_participant_count
    FROM public.participants
    WHERE tournament_id = p_tournament_id;

    -- 2. All active unconfirmed reservations in tournament_registrations (where participant_id is NULL to avoid double-counting)
    SELECT COUNT(*) INTO v_pending_reservation_count
    FROM public.tournament_registrations
    WHERE tournament_id = p_tournament_id
    AND status IN ('pending_payment', 'payment_submitted', 'under_verification')
    AND participant_id IS NULL;

    v_total_occupied := v_participant_count + v_pending_reservation_count;

    IF v_total_occupied >= COALESCE(v_tourney.max_participants, 32) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code', 'CAPACITY_FULL',
            'message', 'Tournament capacity is full. No more slots available.'
        );
    END IF;

    -- 6 & 8. Prevent Duplicate Registration
    -- A: Check if caller is already an active participant in this tournament
    IF EXISTS (
        SELECT 1 FROM public.participants
        WHERE tournament_id = p_tournament_id
        AND user_id = p_user_id
    ) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code', 'ALREADY_REGISTERED',
            'message', 'You are already registered for this tournament.'
        );
    END IF;

    -- B: Check eFootball ID username collision in confirmed participants
    IF EXISTS (
        SELECT 1 FROM public.participants
        WHERE tournament_id = p_tournament_id
        AND LOWER(TRIM(username)) = LOWER(v_normalized_efootball_id)
    ) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code', 'USERNAME_COLLISION',
            'message', 'This eFootball ID is already registered in this tournament.'
        );
    END IF;

    -- C: Check eFootball ID collision against other users' active pending registrations
    IF EXISTS (
        SELECT 1 FROM public.tournament_registrations
        WHERE tournament_id = p_tournament_id
        AND status IN ('pending_payment', 'payment_submitted', 'under_verification')
        AND LOWER(TRIM(efootball_id)) = LOWER(v_normalized_efootball_id)
        AND user_id != p_user_id
    ) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code', 'EFOOTBALL_ID_RESERVED',
            'message', 'This eFootball ID is currently held by another pending registration.'
        );
    END IF;

    v_is_paid := COALESCE(v_tourney.is_paid, FALSE) AND (COALESCE(v_tourney.entry_fee_paise, 0) > 0);

    -- 9. Insertion Logic
    IF v_is_paid THEN
        -- Check existing registration request for this user
        SELECT * INTO v_existing_reg
        FROM public.tournament_registrations
        WHERE tournament_id = p_tournament_id
        AND user_id = p_user_id
        AND status IN ('pending_payment', 'payment_submitted', 'under_verification', 'approved', 'confirmed');

        IF FOUND THEN
            IF v_existing_reg.status IN ('approved', 'confirmed') THEN
                RETURN jsonb_build_object(
                    'success', TRUE,
                    'is_paid', TRUE,
                    'status', v_existing_reg.status,
                    'participant_id', v_existing_reg.participant_id,
                    'registration_id', v_existing_reg.id,
                    'amount_paise', v_existing_reg.amount_paise,
                    'entry_fee_inr', (v_existing_reg.amount_paise / 100.0),
                    'currency', v_existing_reg.currency,
                    'message', 'You are already registered and confirmed for this tournament.'
                );
            ELSE
                RETURN jsonb_build_object(
                    'success', TRUE,
                    'is_paid', TRUE,
                    'status', v_existing_reg.status,
                    'participant_id', NULL,
                    'registration_id', v_existing_reg.id,
                    'amount_paise', v_existing_reg.amount_paise,
                    'entry_fee_inr', (v_existing_reg.amount_paise / 100.0),
                    'currency', v_existing_reg.currency,
                    'message', 'Payment verification is pending for this tournament.'
                );
            END IF;
        END IF;

        -- Create pending payment registration request
        INSERT INTO public.tournament_registrations (
            tournament_id,
            user_id,
            status,
            amount_paise,
            currency,
            whatsapp_number,
            efootball_id,
            player_name,
            created_at,
            updated_at
        ) VALUES (
            p_tournament_id,
            p_user_id,
            'pending_payment',
            v_tourney.entry_fee_paise,
            COALESCE(v_tourney.currency, 'INR'),
            v_profile.whatsapp_number,
            v_normalized_efootball_id,
            COALESCE(v_profile.display_name, v_normalized_efootball_id),
            NOW(),
            NOW()
        )
        RETURNING id INTO v_registration_id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'is_paid', TRUE,
            'status', 'pending_payment',
            'participant_id', NULL,
            'registration_id', v_registration_id,
            'amount_paise', v_tourney.entry_fee_paise,
            'entry_fee_inr', (v_tourney.entry_fee_paise / 100.0),
            'currency', COALESCE(v_tourney.currency, 'INR'),
            'message', 'Registration request created. Please complete payment via WhatsApp.'
        );

    ELSE
        -- Free Tournament: Atomically register participant and record confirmed registration
        INSERT INTO public.participants (
            tournament_id,
            user_id,
            username,
            status,
            created_at
        ) VALUES (
            p_tournament_id,
            p_user_id,
            v_normalized_efootball_id,
            'active',
            NOW()
        )
        RETURNING id INTO v_participant_id;

        INSERT INTO public.tournament_registrations (
            tournament_id,
            user_id,
            participant_id,
            status,
            amount_paise,
            currency,
            whatsapp_number,
            efootball_id,
            player_name,
            created_at,
            updated_at
        ) VALUES (
            p_tournament_id,
            p_user_id,
            v_participant_id,
            'confirmed',
            0,
            COALESCE(v_tourney.currency, 'INR'),
            v_profile.whatsapp_number,
            v_normalized_efootball_id,
            COALESCE(v_profile.display_name, v_normalized_efootball_id),
            NOW(),
            NOW()
        )
        RETURNING id INTO v_registration_id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'is_paid', FALSE,
            'status', 'confirmed',
            'participant_id', v_participant_id,
            'registration_id', v_registration_id,
            'amount_paise', 0,
            'entry_fee_inr', 0,
            'currency', COALESCE(v_tourney.currency, 'INR'),
            'message', 'Successfully registered for the tournament!'
        );
    END IF;
END;
$$;

-- Revoke default public execution privileges and grant strictly to authenticated and service_role
REVOKE ALL ON FUNCTION public.register_player_for_tournament(UUID, UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_player_for_tournament(UUID, UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_player_for_tournament(UUID, UUID, BOOLEAN, TEXT) TO service_role;
