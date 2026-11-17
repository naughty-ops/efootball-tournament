-- ==============================================================================
-- Migration: 20261118060000_tournament_registration_using_wallet.sql
-- Description: Advanced Tournament Registration Using In-App Wallet
-- Features:
--   1. Expands wallet_transactions constraints to support TOURNAMENT_ENTRY_REFUND.
--   2. Atomic RPC public.register_tournament_with_wallet() with optimistic locking,
--      balance validation, ledger tracking, and instant participant enrollment.
--   3. Atomic RPC public.cancel_tournament_registration_with_wallet_refund() with
--      automatic entry fee refund to player wallet upon withdrawal prior to kickoff.
--   4. Strict RLS and privilege revocation for anon/public.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Update wallet_transactions Check Constraints
-- ------------------------------------------------------------------------------
ALTER TABLE public.wallet_transactions 
  DROP CONSTRAINT IF EXISTS wallet_transactions_transaction_type_check;

ALTER TABLE public.wallet_transactions 
  ADD CONSTRAINT wallet_transactions_transaction_type_check 
  CHECK (transaction_type IN (
    'TOURNAMENT_PRIZE', 
    'BONUS_REWARD', 
    'ADMIN_ADJUSTMENT', 
    'PAYOUT_COMPLETED', 
    'PAYOUT_REVERSAL', 
    'DEPOSIT_APPROVED', 
    'TOURNAMENT_ENTRY_FEE', 
    'TOURNAMENT_ENTRY_REFUND',
    'MATCH_ESCROW_LOCK', 
    'MATCH_WIN_PRIZE',
    'ONE_VS_ONE_ENTRY_FEE', 
    'ONE_VS_ONE_PRIZE', 
    'ONE_VS_ONE_ENTRY_REFUND'
  ));

ALTER TABLE public.wallet_transactions 
  DROP CONSTRAINT IF EXISTS wallet_transactions_reference_type_check;

ALTER TABLE public.wallet_transactions 
  ADD CONSTRAINT wallet_transactions_reference_type_check 
  CHECK (reference_type IN (
    'prize_distribution', 
    'payout', 
    'admin_adjustment', 
    'deposit', 
    'tournament_entry', 
    'match', 
    'one_vs_one_match', 
    'other'
  ));

-- ------------------------------------------------------------------------------
-- 2. Stored Procedure: public.register_tournament_with_wallet
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_tournament_with_wallet(
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
    v_wallet RECORD;
    v_balance_before BIGINT := 0;
    v_balance_after BIGINT := 0;
    v_entry_tx_ref TEXT;
    v_idempotency_key TEXT;
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

    IF v_participant_count >= COALESCE(v_tourney.max_participants, 32) THEN
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

    -- Step 11: Deduct Wallet Balance if Paid Tournament
    IF v_is_paid THEN
        -- Get or create player wallet with row lock
        SELECT * INTO v_wallet
        FROM public.player_wallets
        WHERE user_id = p_user_id
        FOR UPDATE;

        IF NOT FOUND THEN
            INSERT INTO public.player_wallets (user_id, available_balance_paise, locked_balance_paise, total_deposited_paise, total_spent_paise, status)
            VALUES (p_user_id, 0, 0, 0, 0, 'active')
            RETURNING * INTO v_wallet;
        END IF;

        IF v_wallet.status != 'active' THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'code', 'WALLET_RESTRICTED',
                'message', format('Your wallet is %s. Please contact support.', v_wallet.status)
            );
        END IF;

        IF v_wallet.available_balance_paise < v_tourney.entry_fee_paise THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'code', 'INSUFFICIENT_WALLET_BALANCE',
                'available_balance_paise', v_wallet.available_balance_paise,
                'available_balance_inr', ROUND(v_wallet.available_balance_paise::numeric / 100, 2),
                'entry_fee_paise', v_tourney.entry_fee_paise,
                'entry_fee_inr', ROUND(v_tourney.entry_fee_paise::numeric / 100, 2),
                'shortfall_paise', v_tourney.entry_fee_paise - v_wallet.available_balance_paise,
                'shortfall_inr', ROUND((v_tourney.entry_fee_paise - v_wallet.available_balance_paise)::numeric / 100, 2),
                'message', format('Insufficient wallet balance. You have ₹%s but the tournament entry fee is ₹%s.', 
                    ROUND(v_wallet.available_balance_paise::numeric / 100, 2)::text,
                    ROUND(v_tourney.entry_fee_paise::numeric / 100, 2)::text
                )
            );
        END IF;

        v_balance_before := v_wallet.available_balance_paise;
        v_balance_after := v_balance_before - v_tourney.entry_fee_paise;
        v_idempotency_key := 'tourney-wallet-entry-' || p_tournament_id::text || '-' || p_user_id::text;
        v_entry_tx_ref := 'TXN-TRN-ENTRY-' || to_char(NOW(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 8));

        -- Deduct from wallet atomically
        UPDATE public.player_wallets
        SET available_balance_paise = v_balance_after,
            total_spent_paise = total_spent_paise + v_tourney.entry_fee_paise,
            version = version + 1,
            updated_at = NOW()
        WHERE id = v_wallet.id;

        -- Record in immutable financial ledger
        INSERT INTO public.wallet_transactions (
            transaction_ref,
            wallet_id,
            user_id,
            transaction_type,
            amount_paise,
            amount_inr,
            status,
            reference_type,
            reference_id,
            tournament_id,
            description,
            idempotency_key,
            balance_after_paise,
            created_at
        ) VALUES (
            v_entry_tx_ref,
            v_wallet.id,
            p_user_id,
            'TOURNAMENT_ENTRY_FEE',
            v_tourney.entry_fee_paise,
            ROUND(v_tourney.entry_fee_paise::numeric / 100, 2),
            'completed',
            'tournament_entry',
            p_tournament_id::text,
            p_tournament_id,
            'Tournament Entry Fee: ' || v_tourney.name,
            v_idempotency_key,
            v_balance_after,
            NOW()
        );
    END IF;

    -- Step 12: Enroll into public.participants
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

    -- Step 13: Upsert into public.tournament_registrations
    SELECT id INTO v_registration_id
    FROM public.tournament_registrations
    WHERE tournament_id = p_tournament_id
      AND user_id = p_user_id
    LIMIT 1;

    IF v_registration_id IS NOT NULL THEN
        UPDATE public.tournament_registrations
        SET participant_id = v_participant_id,
            status = 'confirmed',
            amount_paise = COALESCE(v_tourney.entry_fee_paise, 0),
            currency = COALESCE(v_tourney.currency, 'INR'),
            payment_method = CASE WHEN v_is_paid THEN 'wallet' ELSE 'free' END,
            terms_accepted = TRUE,
            terms_accepted_at = NOW(),
            confirmed_at = NOW(),
            updated_at = NOW()
        WHERE id = v_registration_id;
    ELSE
        INSERT INTO public.tournament_registrations (
            tournament_id,
            user_id,
            participant_id,
            status,
            amount_paise,
            currency,
            payment_method,
            terms_accepted,
            terms_accepted_at,
            confirmed_at,
            rules_version,
            created_at,
            updated_at
        ) VALUES (
            p_tournament_id,
            p_user_id,
            v_participant_id,
            'confirmed',
            COALESCE(v_tourney.entry_fee_paise, 0),
            COALESCE(v_tourney.currency, 'INR'),
            CASE WHEN v_is_paid THEN 'wallet' ELSE 'free' END,
            TRUE,
            NOW(),
            NOW(),
            '1.0',
            NOW(),
            NOW()
        )
        RETURNING id INTO v_registration_id;
    END IF;

    -- Step 14: Update tournament confirmed slots counter
    UPDATE public.tournaments
    SET confirmed_slots_count = v_participant_count + 1,
        updated_at = NOW()
    WHERE id = p_tournament_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'is_paid', v_is_paid,
        'payment_method', CASE WHEN v_is_paid THEN 'wallet' ELSE 'free' END,
        'participant_id', v_participant_id,
        'registration_id', v_registration_id,
        'amount_paise', COALESCE(v_tourney.entry_fee_paise, 0),
        'entry_fee_inr', ROUND(COALESCE(v_tourney.entry_fee_paise, 0)::numeric / 100, 2),
        'balance_after_paise', CASE WHEN v_is_paid THEN v_balance_after ELSE NULL END,
        'balance_after_inr', CASE WHEN v_is_paid THEN ROUND(v_balance_after::numeric / 100, 2) ELSE NULL END,
        'message', CASE 
            WHEN v_is_paid THEN format('Registration confirmed! ₹%s was deducted from your wallet.', ROUND(v_tourney.entry_fee_paise::numeric / 100, 2)::text)
            ELSE 'Registration confirmed! Welcome to the tournament.'
        END
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. Stored Procedure: public.cancel_tournament_registration_with_wallet_refund
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_tournament_registration_with_wallet_refund(
    p_tournament_id UUID,
    p_user_id UUID
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
    v_tourney RECORD;
    v_participant RECORD;
    v_entry_tx RECORD;
    v_wallet RECORD;
    v_refund_amount_paise BIGINT := 0;
    v_refund_tx_ref TEXT;
    v_refund_idempotency_key TEXT;
    v_balance_after BIGINT := 0;
    v_was_refunded BOOLEAN := FALSE;
BEGIN
    v_caller_id := auth.uid();
    v_is_service_role := (COALESCE(auth.role(), '') = 'service_role' OR COALESCE(auth.jwt() ->> 'role', '') = 'service_role');
    v_is_admin := public.is_admin();

    -- Step 1: Validate Authorization
    IF NOT v_is_service_role THEN
        IF v_caller_id IS NULL THEN
            RETURN jsonb_build_object('success', FALSE, 'message', 'Authentication required.');
        END IF;

        IF v_caller_id != p_user_id AND NOT v_is_admin THEN
            RETURN jsonb_build_object('success', FALSE, 'message', 'Unauthorized to cancel this registration.');
        END IF;
    END IF;

    -- Step 2: Acquire Row-Level Lock on Tournament
    SELECT id, name, status, confirmed_slots_count
    INTO v_tourney
    FROM public.tournaments
    WHERE id = p_tournament_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Tournament not found.');
    END IF;

    IF v_tourney.status != 'registration' THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Registration cannot be cancelled once the tournament has begun or closed.'
        );
    END IF;

    -- Step 3: Check Participant Existence
    SELECT id INTO v_participant
    FROM public.participants
    WHERE tournament_id = p_tournament_id
      AND user_id = p_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'No active participant record found.');
    END IF;

    -- Step 4: Check if Entry Fee was Deducted via Wallet
    SELECT * INTO v_entry_tx
    FROM public.wallet_transactions
    WHERE user_id = p_user_id
      AND tournament_id = p_tournament_id
      AND transaction_type = 'TOURNAMENT_ENTRY_FEE'
      AND status = 'completed'
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND AND v_entry_tx.amount_paise > 0 THEN
        v_refund_amount_paise := v_entry_tx.amount_paise;
        v_refund_idempotency_key := 'tourney-wallet-refund-' || p_tournament_id::text || '-' || p_user_id::text;

        -- Prevent duplicate refunds
        IF NOT EXISTS (
            SELECT 1 FROM public.wallet_transactions
            WHERE idempotency_key = v_refund_idempotency_key
        ) THEN
            -- Lock player wallet
            SELECT * INTO v_wallet
            FROM public.player_wallets
            WHERE user_id = p_user_id
            FOR UPDATE;

            IF FOUND THEN
                v_balance_after := v_wallet.available_balance_paise + v_refund_amount_paise;
                v_refund_tx_ref := 'TXN-TRN-REF-' || to_char(NOW(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 8));

                UPDATE public.player_wallets
                SET available_balance_paise = v_balance_after,
                    total_spent_paise = GREATEST(0, total_spent_paise - v_refund_amount_paise),
                    version = version + 1,
                    updated_at = NOW()
                WHERE id = v_wallet.id;

                INSERT INTO public.wallet_transactions (
                    transaction_ref,
                    wallet_id,
                    user_id,
                    transaction_type,
                    amount_paise,
                    amount_inr,
                    status,
                    reference_type,
                    reference_id,
                    tournament_id,
                    description,
                    idempotency_key,
                    balance_after_paise,
                    created_at
                ) VALUES (
                    v_refund_tx_ref,
                    v_wallet.id,
                    p_user_id,
                    'TOURNAMENT_ENTRY_REFUND',
                    v_refund_amount_paise,
                    ROUND(v_refund_amount_paise::numeric / 100, 2),
                    'completed',
                    'tournament_entry',
                    p_tournament_id::text,
                    p_tournament_id,
                    'Refund for Tournament Entry: ' || v_tourney.name,
                    v_refund_idempotency_key,
                    v_balance_after,
                    NOW()
                );

                v_was_refunded := TRUE;
            END IF;
        END IF;
    END IF;

    -- Step 5: Remove Participant & Update Registration
    DELETE FROM public.participants
    WHERE tournament_id = p_tournament_id
      AND user_id = p_user_id;

    UPDATE public.tournament_registrations
    SET status = 'cancelled',
        updated_at = NOW()
    WHERE tournament_id = p_tournament_id
      AND user_id = p_user_id;

    -- Step 6: Decrement Confirmed Slots
    UPDATE public.tournaments
    SET confirmed_slots_count = GREATEST(0, COALESCE(confirmed_slots_count, 1) - 1),
        updated_at = NOW()
    WHERE id = p_tournament_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'refunded', v_was_refunded,
        'refund_amount_paise', v_refund_amount_paise,
        'refund_amount_inr', ROUND(v_refund_amount_paise::numeric / 100, 2),
        'balance_after_paise', CASE WHEN v_was_refunded THEN v_balance_after ELSE NULL END,
        'balance_after_inr', CASE WHEN v_was_refunded THEN ROUND(v_balance_after::numeric / 100, 2) ELSE NULL END,
        'message', CASE 
            WHEN v_was_refunded THEN format('Registration cancelled. ₹%s has been refunded to your wallet.', ROUND(v_refund_amount_paise::numeric / 100, 2)::text)
            ELSE 'Registration successfully withdrawn.'
        END
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. Permissions & ACL Hardening
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.register_tournament_with_wallet(UUID, UUID, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_tournament_with_wallet(UUID, UUID, BOOLEAN, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.register_tournament_with_wallet(UUID, UUID, BOOLEAN, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.cancel_tournament_registration_with_wallet_refund(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_tournament_registration_with_wallet_refund(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_tournament_registration_with_wallet_refund(UUID, UUID) TO authenticated, service_role;
