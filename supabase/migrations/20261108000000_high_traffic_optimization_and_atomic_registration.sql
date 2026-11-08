-- ============================================================================
-- Migration: 20261108000000_high_traffic_optimization_and_atomic_registration.sql
-- Description: Production High-Traffic & Scalability Optimization
-- 1. Unindexed Foreign Keys -> B-Tree Indexes
-- 2. Auth RLS InitPlan Optimization -> (SELECT auth.uid()) Subquery Execution
-- 3. Atomic High-Concurrency Registration RPC -> register_player_for_tournament()
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Unindexed Foreign Key Performance Indexes (All 11 Reconciled)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_tournaments_champion_id 
    ON public.tournaments(champion_id);

CREATE INDEX IF NOT EXISTS idx_tournaments_runner_up_id 
    ON public.tournaments(runner_up_id);

CREATE INDEX IF NOT EXISTS idx_tournament_registrations_participant_id 
    ON public.tournament_registrations(participant_id);

CREATE INDEX IF NOT EXISTS idx_tournament_registrations_verified_by 
    ON public.tournament_registrations(verified_by);

CREATE INDEX IF NOT EXISTS idx_tournament_registrations_user_tourney 
    ON public.tournament_registrations(user_id, tournament_id);

CREATE INDEX IF NOT EXISTS idx_profiles_suspended_by 
    ON public.profiles(suspended_by);

CREATE INDEX IF NOT EXISTS idx_homepage_sections_published_by 
    ON public.homepage_sections(published_by);

CREATE INDEX IF NOT EXISTS idx_homepage_sections_updated_by 
    ON public.homepage_sections(updated_by);

CREATE INDEX IF NOT EXISTS idx_homepage_audit_history_performed_by 
    ON public.homepage_audit_history(performed_by);

-- Conditional reconciliation for remote restream tables
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'restream_jobs') THEN
        CREATE INDEX IF NOT EXISTS idx_restream_jobs_source_id ON public.restream_jobs(source_id);
        CREATE INDEX IF NOT EXISTS idx_restream_jobs_youtube_account_id ON public.restream_jobs(youtube_account_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'restream_logs') THEN
        CREATE INDEX IF NOT EXISTS idx_restream_logs_user_id ON public.restream_logs(user_id);
    END IF;
END $$;


-- ----------------------------------------------------------------------------
-- 2. Auth RLS InitPlan Optimizations
-- Wraps auth.uid() in (SELECT auth.uid()) scalar subqueries so PostgreSQL 
-- evaluates it once per query instead of per row examined.
-- ----------------------------------------------------------------------------

-- match_predictions
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'match_predictions' AND policyname = 'Users can view own prediction'
    ) THEN
        DROP POLICY "Users can view own prediction" ON public.match_predictions;
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'match_predictions' AND policyname = 'Users can insert own predictions'
    ) THEN
        DROP POLICY "Users can insert own predictions" ON public.match_predictions;
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'match_predictions' AND policyname = 'Users can update own predictions before lock'
    ) THEN
        DROP POLICY "Users can update own predictions before lock" ON public.match_predictions;
    END IF;
END $$;

CREATE POLICY "Users can view own prediction" ON public.match_predictions
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own predictions" ON public.match_predictions
    FOR INSERT TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own predictions before lock" ON public.match_predictions
    FOR UPDATE TO authenticated
    USING (user_id = (SELECT auth.uid()));

-- tournament_registrations
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'tournament_registrations' AND policyname = 'Users can read own registrations'
    ) THEN
        DROP POLICY "Users can read own registrations" ON public.tournament_registrations;
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'tournament_registrations' AND policyname = 'Users can insert own registrations'
    ) THEN
        DROP POLICY "Users can insert own registrations" ON public.tournament_registrations;
    END IF;
END $$;

CREATE POLICY "Users can read own registrations" ON public.tournament_registrations
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()) OR public.is_admin());

CREATE POLICY "Users can insert own registrations" ON public.tournament_registrations
    FOR INSERT TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));

-- profiles
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'profiles' AND policyname = 'profiles_select_own'
    ) THEN
        DROP POLICY "profiles_select_own" ON public.profiles;
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'profiles' AND policyname = 'profiles_update_own'
    ) THEN
        DROP POLICY "profiles_update_own" ON public.profiles;
    END IF;
END $$;

CREATE POLICY "profiles_select_own" ON public.profiles
    FOR SELECT TO authenticated
    USING (id = (SELECT auth.uid()) OR public.is_admin());

CREATE POLICY "profiles_update_own" ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = (SELECT auth.uid()))
    WITH CHECK (id = (SELECT auth.uid()));


-- ----------------------------------------------------------------------------
-- 3. Atomic High-Concurrency Registration Stored Procedure
-- Replaces 6 sequential HTTP round-trips with 1 atomic database transaction.
-- Locks tournament capacity with SELECT ... FOR UPDATE to eliminate TOCTOU race conditions.
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

    -- 4. Validate eFootball ID
    v_normalized_efootball_id := TRIM(COALESCE(v_profile.efootball_id, v_profile.display_name, ''));
    IF v_normalized_efootball_id = '' THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code', 'EFOOTBALL_ID_MISSING',
            'message', 'Please update your profile with a valid eFootball ID before registering.'
        );
    END IF;

    IF v_normalized_efootball_id !~ '^[a-zA-Z0-9_\-\.]{3,30}$' THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code', 'INVALID_EFOOTBALL_ID_FORMAT',
            'message', 'eFootball ID format is invalid. It must contain only 3-30 letters, numbers, dashes, underscores, or dots.'
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
                    v_tourney.access_code_hash LIKE '$2%'
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
    -- A: Check if already an active participant
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

    -- B: Check eFootball ID username collision in this tournament
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

    v_is_paid := COALESCE(v_tourney.is_paid, FALSE) AND (COALESCE(v_tourney.entry_fee_paise, 0) > 0);

    -- 9. Insertion Logic
    IF v_is_paid THEN
        -- Check existing registration request
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
