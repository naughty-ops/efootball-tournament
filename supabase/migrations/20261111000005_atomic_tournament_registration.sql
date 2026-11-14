-- ==============================================================================
-- Migration: 20261111000005_atomic_tournament_registration.sql
-- Description: Phase P1 - High-Concurrency Atomic Tournament Registration Stored Procedure
-- Hardening:
-- 1. Eliminates TOCTOU capacity race conditions by executing atomic registration with
--    row-level lock (SELECT ... FOR UPDATE) on public.tournaments.
-- 2. Enforces unique constraints on participants(tournament_id, user_id) and
--    active tournament_registrations(tournament_id, user_id).
-- 3. Verifies user authentication, profile active status, WhatsApp verification,
--    eFootball ID, private tournament access code, and registration deadline.
-- 4. Atomically synchronizes confirmed_slots_count and reserved_slots_count counters.
-- 5. Strict least-privilege grants: REVOKE from PUBLIC/anon; GRANT to authenticated/service_role.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Unique Integrity Constraints
-- ------------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_participants_tournament_user
    ON public.participants(tournament_id, user_id)
    WHERE user_id IS NOT NULL;

-- Architectural Note: Production currently maintains two disjoint partial indexes:
-- 1) idx_active_tournament_registration (covering 'pending_payment', 'confirmed')
-- 2) idx_active_whatsapp_registration (covering 'payment_submitted', 'under_verification', 'approved')
-- uq_tournament_registrations_active_user unifies all 5 active states into a single comprehensive
-- constraint, eliminating cross-status race conditions while safely permitting re-registration after
-- rejection, cancellation, expiration, or refund.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tournament_registrations_active_user
    ON public.tournament_registrations(tournament_id, user_id)
    WHERE status IN ('pending_payment', 'payment_submitted', 'under_verification', 'approved', 'confirmed');

-- ------------------------------------------------------------------------------
-- 2. Atomic Tournament Registration Stored Procedure
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_player_for_tournament(
    p_tournament_id UUID,
    p_user_id UUID,
    p_rules_accepted BOOLEAN DEFAULT TRUE,
    p_access_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_is_service_role BOOLEAN := FALSE;
    v_is_admin BOOLEAN := FALSE;
    v_profile RECORD;
    v_tourney RECORD;
    v_player_name TEXT;
    v_participant_count INTEGER := 0;
    v_pending_reservation_count INTEGER := 0;
    v_total_occupied INTEGER := 0;
    v_participant_id UUID;
    v_registration_id UUID;
    v_existing_reg RECORD;
    v_is_paid BOOLEAN := FALSE;
BEGIN
    v_caller_id := auth.uid();
    v_is_service_role := (COALESCE(auth.role(), '') = 'service_role' OR COALESCE(auth.jwt() ->> 'role', '') = 'service_role');
    v_is_admin := public.is_admin();

    -- Step 1: Validate Authentication & Session Identity
    IF NOT v_is_service_role THEN
        IF v_caller_id IS NULL THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'code', 'UNAUTHENTICATED',
                'message', 'Authentication required. Please sign in to register.'
            );
        END IF;

        IF v_caller_id != p_user_id AND NOT v_is_admin THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'code', 'FORBIDDEN',
                'message', 'Unauthorized: Cannot register on behalf of another player.'
            );
        END IF;
    END IF;

    -- Step 2: Validate Tournament Rules Acceptance
    IF NOT COALESCE(p_rules_accepted, FALSE) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code', 'RULES_NOT_ACCEPTED',
            'message', 'You must accept the tournament rules to register.'
        );
    END IF;

    -- Step 3: Validate Profile and Account Eligibility
    SELECT * INTO v_profile
    FROM public.profiles
    WHERE id = p_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code', 'PROFILE_NOT_FOUND',
            'message', 'Player profile not found. Please complete your registration details.'
        );
    END IF;

    IF COALESCE(v_profile.account_status, 'active') != 'active' THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code', 'ACCOUNT_RESTRICTED',
            'message', format('Your account is currently %s. Registration is restricted.', v_profile.account_status)
        );
    END IF;

    -- Step 4: Validate WhatsApp Verification
    IF NOT (COALESCE(v_profile.whatsapp_verified, FALSE) = TRUE OR v_profile.whatsapp_verification_status = 'verified') THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code', 'WHATSAPP_NOT_VERIFIED',
            'message', 'WhatsApp verification required. Please verify your WhatsApp number on your profile before registering.'
        );
    END IF;

    -- Step 5: Validate eFootball ID & Player Name
    v_player_name := TRIM(COALESCE(v_profile.efootball_id, v_profile.display_name, ''));
    IF v_player_name = '' THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code', 'EFOOTBALL_ID_MISSING',
            'message', 'Please update your profile with a valid eFootball ID before registering.'
        );
    END IF;

    -- Prefer display_name if available, otherwise eFootball ID
    IF TRIM(COALESCE(v_profile.display_name, '')) != '' THEN
        v_player_name := TRIM(v_profile.display_name);
    END IF;

    -- Step 6: Acquire Row-Level Lock on Target Tournament
    SELECT
        id,
        name,
        status,
        max_participants,
        is_paid,
        entry_fee_paise,
        currency,
        is_private,
        access_code_hash,
        registration_deadline,
        confirmed_slots_count,
        reserved_slots_count
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

    -- Step 7: Validate Tournament Registration Lifecycle State
    IF v_tourney.status != 'registration' THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code', 'REGISTRATION_CLOSED',
            'message', format('Tournament registration is closed (current status: %s).', v_tourney.status)
        );
    END IF;

    IF v_tourney.registration_deadline IS NOT NULL AND NOW() > v_tourney.registration_deadline THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code', 'REGISTRATION_DEADLINE_PASSED',
            'message', 'Tournament registration deadline has passed.'
        );
    END IF;

    -- Step 8: Validate Private Tournament Access Code
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
                    (v_tourney.access_code_hash LIKE '$2%' OR v_tourney.access_code_hash LIKE '$2a$%' OR v_tourney.access_code_hash LIKE '$2b$%')
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

    -- Step 9: Verify Capacity Under Row Lock
    SELECT COUNT(*) INTO v_participant_count
    FROM public.participants
    WHERE tournament_id = p_tournament_id;

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

    -- Step 10: Check Existing Registration & Username Collisions
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

    IF EXISTS (
        SELECT 1 FROM public.participants
        WHERE tournament_id = p_tournament_id
          AND LOWER(TRIM(username)) = LOWER(TRIM(v_player_name))
    ) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code', 'USERNAME_COLLISION',
            'message', 'This eFootball ID is already registered in this tournament.'
        );
    END IF;

    v_is_paid := COALESCE(v_tourney.is_paid, FALSE) AND (COALESCE(v_tourney.entry_fee_paise, 0) > 0);

    -- Step 11: Execute Registration by Tournament Type
    IF v_is_paid THEN
        -- Check existing registration in progress
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
                    'entry_fee_inr', ROUND(COALESCE(v_existing_reg.amount_paise, 0)::numeric / 100),
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
                    'entry_fee_inr', ROUND(COALESCE(v_existing_reg.amount_paise, 0)::numeric / 100),
                    'currency', v_existing_reg.currency,
                    'message', 'You have an active registration request for this tournament.'
                );
            END IF;
        END IF;

        -- Create pending registration request
        INSERT INTO public.tournament_registrations (
            tournament_id,
            user_id,
            status,
            amount_paise,
            currency,
            payment_method,
            terms_accepted,
            terms_accepted_at,
            rules_version,
            created_at,
            updated_at
        ) VALUES (
            p_tournament_id,
            p_user_id,
            'pending_payment',
            v_tourney.entry_fee_paise,
            COALESCE(v_tourney.currency, 'INR'),
            'whatsapp_manual',
            TRUE,
            NOW(),
            '1.0',
            NOW(),
            NOW()
        )
        RETURNING id INTO v_registration_id;

        -- Update reserved slots counter
        UPDATE public.tournaments
        SET reserved_slots_count = v_pending_reservation_count + 1,
            updated_at = NOW()
        WHERE id = p_tournament_id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'is_paid', TRUE,
            'status', 'pending_payment',
            'participant_id', NULL,
            'registration_id', v_registration_id,
            'amount_paise', v_tourney.entry_fee_paise,
            'entry_fee_inr', ROUND(COALESCE(v_tourney.entry_fee_paise, 0)::numeric / 100),
            'currency', COALESCE(v_tourney.currency, 'INR'),
            'message', 'Registration request created. Please complete payment via WhatsApp to confirm your slot.'
        );

    ELSE
        -- Free Tournament: Instant atomic participant enrollment
        INSERT INTO public.participants (
            tournament_id,
            user_id,
            username,
            real_name,
            contact_info,
            status,
            terms_accepted,
            terms_accepted_at,
            rules_version,
            created_at,
            updated_at
        ) VALUES (
            p_tournament_id,
            p_user_id,
            v_player_name,
            v_player_name,
            NULLIF(TRIM(v_profile.whatsapp_number), ''),
            'active',
            TRUE,
            NOW(),
            '1.0',
            NOW(),
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
            payment_method,
            confirmed_at,
            terms_accepted,
            terms_accepted_at,
            rules_version,
            created_at,
            updated_at
        ) VALUES (
            p_tournament_id,
            p_user_id,
            v_participant_id,
            'confirmed',
            0,
            COALESCE(v_tourney.currency, 'INR'),
            'free_registration',
            NOW(),
            TRUE,
            NOW(),
            '1.0',
            NOW(),
            NOW()
        )
        RETURNING id INTO v_registration_id;

        -- Update confirmed slots counter
        UPDATE public.tournaments
        SET confirmed_slots_count = v_participant_count + 1,
            updated_at = NOW()
        WHERE id = p_tournament_id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'is_paid', FALSE,
            'status', 'confirmed',
            'participant_id', v_participant_id,
            'registration_id', v_registration_id,
            'amount_paise', 0,
            'entry_fee_inr', 0,
            'currency', COALESCE(v_tourney.currency, 'INR'),
            'message', format('Successfully registered for %s!', v_tourney.name)
        );
    END IF;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. Least-Privilege Security Grants
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.register_player_for_tournament(UUID, UUID, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_player_for_tournament(UUID, UUID, BOOLEAN, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.register_player_for_tournament(UUID, UUID, BOOLEAN, TEXT) TO authenticated, service_role;
