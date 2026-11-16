-- ============================================================================
-- Migration: 20261115030000_enable_one_vs_one_real_wallet_transactions.sql
-- Description: Enables atomic wallet deductions for 1v1 match entry, automatic
--              winner payouts, and atomic cancellation/expiry refunds.
-- ============================================================================

-- 1. Update one_vs_one_matches match_mode Check Constraint
-- ----------------------------------------------------------------------------
ALTER TABLE public.one_vs_one_matches 
  DROP CONSTRAINT IF EXISTS one_vs_one_matches_match_mode_check;

ALTER TABLE public.one_vs_one_matches 
  ADD CONSTRAINT one_vs_one_matches_match_mode_check 
  CHECK (match_mode IN ('free', 'dry_run', 'real'));

-- 2. Update wallet_transactions Check Constraints
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 3. Atomic Stored Procedure: public.refund_one_vs_one_entry
-- Idempotently refunds entry fee to a player for cancelled/expired matches
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refund_one_vs_one_entry(
  p_match_id UUID,
  p_user_id UUID,
  p_reason TEXT DEFAULT 'Match cancelled'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_match RECORD;
  v_entry_tx RECORD;
  v_existing_refund RECORD;
  v_wallet RECORD;
  v_refund_ref TEXT;
  v_idempotency_key TEXT;
  v_balance_before BIGINT;
  v_balance_after BIGINT;
  v_tx_id UUID;
BEGIN
  -- 1. Check match exists
  SELECT * INTO v_match
  FROM public.one_vs_one_matches
  WHERE id = p_match_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found.');
  END IF;

  -- 2. Check if player paid an entry fee for this match
  SELECT * INTO v_entry_tx
  FROM public.wallet_transactions
  WHERE user_id = p_user_id
    AND reference_type = 'one_vs_one_match'
    AND reference_id = p_match_id::text
    AND transaction_type = 'ONE_VS_ONE_ENTRY_FEE'
    AND status = 'completed'
  LIMIT 1;

  -- If no entry fee was deducted (e.g. FREE mode or dry-run), nothing to refund
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'refunded', false, 'reason', 'No paid entry fee found.');
  END IF;

  -- 3. Enforce idempotency: check if refund already exists
  v_idempotency_key := '1v1-refund-' || p_match_id::text || '-' || p_user_id::text;

  SELECT * INTO v_existing_refund
  FROM public.wallet_transactions
  WHERE idempotency_key = v_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'already_refunded', true, 'transaction_id', v_existing_refund.id);
  END IF;

  -- 4. Lock player wallet
  SELECT * INTO v_wallet
  FROM public.player_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Player wallet not found.');
  END IF;

  v_balance_before := v_wallet.available_balance_paise;
  v_balance_after := v_balance_before + v_entry_tx.amount_paise;
  v_refund_ref := 'TXN-1V1-REFUND-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 8));

  -- 5. Update wallet balance
  UPDATE public.player_wallets
  SET available_balance_paise = v_balance_after,
      total_spent_paise = GREATEST(0, total_spent_paise - v_entry_tx.amount_paise),
      version = version + 1,
      updated_at = now()
  WHERE id = v_wallet.id;

  -- 6. Insert immutable refund transaction
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
    description,
    idempotency_key,
    balance_after_paise
  ) VALUES (
    v_refund_ref,
    v_wallet.id,
    p_user_id,
    'ONE_VS_ONE_ENTRY_REFUND',
    v_entry_tx.amount_paise,
    v_entry_tx.amount_inr,
    'completed',
    'one_vs_one_match',
    p_match_id::text,
    '1 VS 1 Match Entry Refund (' || p_reason || ')',
    v_idempotency_key,
    v_balance_after
  ) RETURNING id INTO v_tx_id;

  -- 7. Log financial audit entry
  INSERT INTO public.financial_audit_logs (
    target_type,
    target_id,
    actor_id,
    action,
    previous_state,
    new_state,
    metadata
  ) VALUES (
    'wallet_transaction',
    v_tx_id::text,
    p_user_id,
    'ONE_VS_ONE_ENTRY_REFUND',
    jsonb_build_object('balance_before', v_balance_before),
    jsonb_build_object('balance_after', v_balance_after, 'amount_refunded', v_entry_tx.amount_inr),
    jsonb_build_object('reason', p_reason)
  );

  -- 8. Send player notification
  INSERT INTO public.player_notifications (
    user_id,
    title,
    message,
    type,
    action_url
  ) VALUES (
    p_user_id,
    '1 VS 1 Entry Refunded ↩️',
    '₹' || v_entry_tx.amount_inr || ' has been refunded to your wallet for match ' || v_match.match_code || ' (' || p_reason || ').',
    'financial',
    '/dashboard/wallet'
  );

  RETURN jsonb_build_object(
    'success', true,
    'refunded', true,
    'transaction_id', v_tx_id,
    'amount_inr', v_entry_tx.amount_inr,
    'balance_after_paise', v_balance_after
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refund_one_vs_one_entry(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refund_one_vs_one_entry(UUID, UUID, TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. Atomic Stored Procedure: public.cancel_waiting_one_vs_one_match (with refund)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_waiting_one_vs_one_match(
  p_match_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_match RECORD;
  v_refund_res JSONB;
BEGIN
  SELECT * INTO v_match
  FROM public.one_vs_one_matches
  WHERE id = p_match_id AND created_by = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found or you are not authorized to cancel it.';
  END IF;

  IF v_match.status != 'waiting' THEN
    RAISE EXCEPTION 'Cannot cancel match because it is no longer waiting for players (Current status: %)', v_match.status;
  END IF;

  UPDATE public.one_vs_one_matches
  SET status = 'cancelled',
      cancelled_at = now(),
      updated_at = now()
  WHERE id = p_match_id;

  UPDATE public.one_vs_one_match_players
  SET is_active = false
  WHERE match_id = p_match_id;

  -- Automatically refund host entry fee if paid
  SELECT public.refund_one_vs_one_entry(p_match_id, p_user_id, 'Host Cancelled Queue') INTO v_refund_res;

  INSERT INTO public.one_vs_one_events (
    match_id,
    actor_id,
    event_type,
    event_payload
  ) VALUES (
    p_match_id,
    p_user_id,
    'match_cancelled_by_creator',
    jsonb_build_object('cancelled_at', now(), 'refund', v_refund_res)
  );

  RETURN jsonb_build_object('success', true, 'refund', v_refund_res);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_waiting_one_vs_one_match(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_waiting_one_vs_one_match(UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. Atomic Matchmaker & Wallet Entry Deduction: public.join_or_create_one_vs_one_match
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_or_create_one_vs_one_match(
  p_card_id UUID,
  p_user_id UUID,
  p_jurisdiction TEXT DEFAULT 'IN'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_card RECORD;
  v_active_match_id UUID;
  v_candidate_match RECORD;
  v_match_id UUID;
  v_match_code TEXT;
  v_result JSONB;
  v_expired_rec RECORD;
  v_refund_res JSONB;
  
  -- Financial variables
  v_entry_amount NUMERIC(10, 2);
  v_entry_amount_paise BIGINT;
  v_match_mode TEXT;
  v_wallet RECORD;
  v_balance_before BIGINT;
  v_balance_after BIGINT;
  v_entry_idempotency_key TEXT;
  v_entry_tx_ref TEXT;
BEGIN
  -- 1. Validate Card exists and is active
  SELECT * INTO v_card
  FROM public.one_vs_one_cards
  WHERE id = p_card_id AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Selected challenge card is not currently active or does not exist.';
  END IF;

  v_entry_amount := COALESCE(v_card.entry_amount, 0.00);
  v_entry_amount_paise := (v_entry_amount * 100)::bigint;

  -- Determine mode: paid matches run in 'real' mode; 0 entry run in 'free' mode
  IF v_entry_amount_paise > 0 THEN
    v_match_mode := 'real';
  ELSE
    v_match_mode := 'free';
  END IF;

  -- 2. Verify User does NOT already have an active match
  SELECT match_id INTO v_active_match_id
  FROM public.one_vs_one_match_players
  WHERE user_id = p_user_id AND is_active = true
  LIMIT 1;

  IF v_active_match_id IS NOT NULL THEN
    RAISE EXCEPTION 'You already have an active 1v1 match in progress or waiting in queue.';
  END IF;

  -- Clean up expired waiting matches for this card first & automatically refund hosts
  FOR v_expired_rec IN (
    SELECT id, created_by 
    FROM public.one_vs_one_matches
    WHERE card_id = p_card_id
      AND status = 'waiting'
      AND expires_at <= now()
  ) LOOP
    UPDATE public.one_vs_one_matches
    SET status = 'expired', updated_at = now()
    WHERE id = v_expired_rec.id;

    UPDATE public.one_vs_one_match_players
    SET is_active = false
    WHERE match_id = v_expired_rec.id;

    -- Issue automatic refund to the host of expired match
    PERFORM public.refund_one_vs_one_entry(v_expired_rec.id, v_expired_rec.created_by, 'Matchmaking Expired');
  END LOOP;

  -- 3. If paid entry, verify and lock wallet
  IF v_entry_amount_paise > 0 THEN
    SELECT * INTO v_wallet
    FROM public.player_wallets
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.player_wallets (user_id, available_balance_paise)
      VALUES (p_user_id, 0)
      RETURNING * INTO v_wallet;
    END IF;

    IF v_wallet.status != 'active' THEN
      RAISE EXCEPTION 'Your wallet is currently %. Please contact support to activate it.', v_wallet.status;
    END IF;

    IF v_wallet.available_balance_paise < v_entry_amount_paise THEN
      RAISE EXCEPTION 'Insufficient wallet balance (₹%) to join this 1v1 challenge. Current balance: ₹%. Please add money to your wallet.',
        v_entry_amount, (v_wallet.available_balance_paise::numeric / 100.0);
    END IF;
  END IF;

  -- 4. Attempt to lock an open waiting match for this card (created by another player)
  SELECT * INTO v_candidate_match
  FROM public.one_vs_one_matches
  WHERE card_id = p_card_id
    AND status = 'waiting'
    AND created_by != p_user_id
    AND expires_at > now()
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  -- 5A. If candidate found: Pair automatically (Player 2 Joins)
  IF v_candidate_match.id IS NOT NULL THEN
    v_match_id := v_candidate_match.id;

    -- Deduct entry fee from Player 2 if paid
    IF v_entry_amount_paise > 0 THEN
      v_balance_before := v_wallet.available_balance_paise;
      v_balance_after := v_balance_before - v_entry_amount_paise;
      v_entry_idempotency_key := '1v1-entry-' || v_match_id::text || '-' || p_user_id::text;
      v_entry_tx_ref := 'TXN-1V1-ENTRY-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 8));

      UPDATE public.player_wallets
      SET available_balance_paise = v_balance_after,
          total_spent_paise = total_spent_paise + v_entry_amount_paise,
          version = version + 1,
          updated_at = now()
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
        description,
        idempotency_key,
        balance_after_paise
      ) VALUES (
        v_entry_tx_ref,
        v_wallet.id,
        p_user_id,
        'ONE_VS_ONE_ENTRY_FEE',
        v_entry_amount_paise,
        v_entry_amount,
        'completed',
        'one_vs_one_match',
        v_match_id::text,
        '1 VS 1 Match Entry (' || v_card.name || ')',
        v_entry_idempotency_key,
        v_balance_after
      );
    END IF;

    -- Update match status to 'matched'
    UPDATE public.one_vs_one_matches
    SET status = 'matched',
        matched_at = now(),
        updated_at = now()
    WHERE id = v_match_id;

    -- Insert Player 2
    INSERT INTO public.one_vs_one_match_players (
      match_id,
      user_id,
      player_position,
      ready_status,
      is_active
    ) VALUES (
      v_match_id,
      p_user_id,
      2,
      'pending',
      true
    );

    -- Log Event
    INSERT INTO public.one_vs_one_events (
      match_id,
      actor_id,
      event_type,
      event_payload
    ) VALUES (
      v_match_id,
      p_user_id,
      'opponent_matched',
      jsonb_build_object(
        'player2_id', p_user_id,
        'matched_at', now(),
        'card_id', p_card_id,
        'entry_amount', v_entry_amount
      )
    );

    v_result := jsonb_build_object(
      'success', true,
      'is_matched', true,
      'match_id', v_match_id,
      'match_code', v_candidate_match.match_code,
      'player_position', 2,
      'status', 'matched',
      'available_balance_inr', (COALESCE(v_balance_after, v_wallet.available_balance_paise)::numeric / 100.0)
    );
    RETURN v_result;

  -- 5B. If no candidate found: Create new waiting room (Player 1 Enters Queue)
  ELSE
    -- Generate unique human-readable match code
    v_match_code := '1V1-' || upper(substr(md5(random()::text), 1, 4)) || '-' || upper(substr(md5(random()::text), 5, 4));

    INSERT INTO public.one_vs_one_matches (
      match_code,
      card_id,
      status,
      match_mode,
      created_by,
      expires_at
    ) VALUES (
      v_match_code,
      p_card_id,
      'waiting',
      v_match_mode,
      p_user_id,
      now() + interval '10 minutes'
    )
    RETURNING id INTO v_match_id;

    -- Deduct entry fee from Player 1 if paid
    IF v_entry_amount_paise > 0 THEN
      v_balance_before := v_wallet.available_balance_paise;
      v_balance_after := v_balance_before - v_entry_amount_paise;
      v_entry_idempotency_key := '1v1-entry-' || v_match_id::text || '-' || p_user_id::text;
      v_entry_tx_ref := 'TXN-1V1-ENTRY-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 8));

      UPDATE public.player_wallets
      SET available_balance_paise = v_balance_after,
          total_spent_paise = total_spent_paise + v_entry_amount_paise,
          version = version + 1,
          updated_at = now()
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
        description,
        idempotency_key,
        balance_after_paise
      ) VALUES (
        v_entry_tx_ref,
        v_wallet.id,
        p_user_id,
        'ONE_VS_ONE_ENTRY_FEE',
        v_entry_amount_paise,
        v_entry_amount,
        'completed',
        'one_vs_one_match',
        v_match_id::text,
        '1 VS 1 Match Entry (' || v_card.name || ')',
        v_entry_idempotency_key,
        v_balance_after
      );
    END IF;

    -- Insert Player 1 as participant
    INSERT INTO public.one_vs_one_match_players (
      match_id,
      user_id,
      player_position,
      ready_status,
      is_active
    ) VALUES (
      v_match_id,
      p_user_id,
      1,
      'pending',
      true
    );

    -- Log Event
    INSERT INTO public.one_vs_one_events (
      match_id,
      actor_id,
      event_type,
      event_payload
    ) VALUES (
      v_match_id,
      p_user_id,
      'match_created',
      jsonb_build_object(
        'match_code', v_match_code,
        'card_id', p_card_id,
        'created_at', now(),
        'entry_amount', v_entry_amount
      )
    );

    v_result := jsonb_build_object(
      'success', true,
      'is_matched', false,
      'match_id', v_match_id,
      'match_code', v_match_code,
      'player_position', 1,
      'status', 'waiting',
      'available_balance_inr', (COALESCE(v_balance_after, v_wallet.available_balance_paise)::numeric / 100.0)
    );
    RETURN v_result;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.join_or_create_one_vs_one_match(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_or_create_one_vs_one_match(UUID, UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. Update Winner Settlement: public.settle_one_vs_one_match
-- Automatically issues real wallet payout for 'real' matches (or allow_real_credit)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_one_vs_one_match(
  p_match_id UUID,
  p_admin_id UUID DEFAULT NULL,
  p_allow_real_credit BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_match RECORD;
  v_result RECORD;
  v_card RECORD;
  v_winner_id UUID;
  v_amount_inr NUMERIC(10, 2);
  v_amount_paise BIGINT;
  v_existing_settlement RECORD;
  v_settlement_id UUID;
  v_settlement_ref TEXT;
  v_idempotency_key TEXT;
  v_is_dry_run BOOLEAN := FALSE;
  v_wallet RECORD;
  v_balance_before BIGINT := 0;
  v_balance_after BIGINT := 0;
  v_tx_id UUID := NULL;
  v_tx_ref TEXT := NULL;
BEGIN
  -- 1. Lock match for settlement
  SELECT * INTO v_match
  FROM public.one_vs_one_matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found.');
  END IF;

  -- 2. Verify match is completed
  IF v_match.status != 'completed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match is not in completed state (Current: ' || v_match.status || ').');
  END IF;

  -- 3. Check for open disputes
  IF EXISTS (
    SELECT 1 FROM public.one_vs_one_disputes
    WHERE match_id = p_match_id AND status = 'open'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot settle match with an unresolved open dispute.');
  END IF;

  -- 4. Verify match result exists and is finalized
  SELECT * INTO v_result
  FROM public.one_vs_one_results
  WHERE match_id = p_match_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No result record found for match.');
  END IF;

  IF v_result.status NOT IN ('confirmed', 'verified') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match result has not been confirmed or verified.');
  END IF;

  -- 5. Fetch authoritative Card configuration
  SELECT * INTO v_card
  FROM public.one_vs_one_cards
  WHERE id = v_match.card_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Challenge card configuration not found.');
  END IF;

  -- 6. Enforce Idempotency: Check existing settlement
  SELECT * INTO v_existing_settlement
  FROM public.one_vs_one_settlements
  WHERE match_id = p_match_id;

  IF FOUND AND v_existing_settlement.status = 'completed' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_settled', true,
      'settlement_id', v_existing_settlement.id,
      'settlement_ref', v_existing_settlement.settlement_ref,
      'status', 'completed',
      'amount_inr', v_existing_settlement.amount_inr
    );
  END IF;

  -- 7. Identify winner & authoritative payout amount
  v_winner_id := v_result.claimed_winner_id;

  -- If score is draw and no winner claimed
  IF v_result.player_one_score = v_result.player_two_score AND v_winner_id IS NULL THEN
    v_amount_inr := 0.00;
    v_amount_paise := 0;
  ELSE
    -- Authoritative server-side payout
    v_amount_inr := COALESCE(v_card.advertised_payout, 0.00);
    v_amount_paise := (v_amount_inr * 100)::bigint;
  END IF;

  -- 8. Execution Mode:
  -- If match_mode is 'real' OR p_allow_real_credit = true, execute LIVE REAL WALLET CREDIT
  IF v_match.match_mode = 'real' OR p_allow_real_credit = TRUE THEN
    v_is_dry_run := FALSE;
  ELSE
    v_is_dry_run := TRUE;
  END IF;

  v_settlement_ref := 'SETTLE-1V1-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 8));
  v_idempotency_key := 'settle-1v1-' || p_match_id::text;

  -- 9A. DRY-RUN / FREE MODE SETTLEMENT
  IF v_is_dry_run THEN
    INSERT INTO public.one_vs_one_settlements (
      settlement_ref,
      match_id,
      winner_id,
      card_id,
      amount_paise,
      amount_inr,
      mode,
      status,
      idempotency_key,
      settled_at,
      metadata
    ) VALUES (
      v_settlement_ref,
      p_match_id,
      v_winner_id,
      v_match.card_id,
      v_amount_paise,
      v_amount_inr,
      'dry_run',
      'completed',
      v_idempotency_key,
      now(),
      jsonb_build_object(
        'simulated', true,
        'card_name', v_card.name,
        'note', 'Simulated dry-run settlement.'
      )
    )
    ON CONFLICT (match_id) DO UPDATE SET
      settlement_ref = EXCLUDED.settlement_ref,
      winner_id = EXCLUDED.winner_id,
      amount_paise = EXCLUDED.amount_paise,
      amount_inr = EXCLUDED.amount_inr,
      mode = 'dry_run',
      status = 'completed',
      settled_at = now(),
      metadata = EXCLUDED.metadata,
      updated_at = now()
    RETURNING id INTO v_settlement_id;

    -- Send notification to winner if applicable
    IF v_winner_id IS NOT NULL AND v_amount_inr > 0 THEN
      INSERT INTO public.player_notifications (
        user_id,
        title,
        message,
        type,
        action_url
      ) VALUES (
        v_winner_id,
        '1 VS 1 Arena Match Settled! 🏆',
        'Congratulations! Your 1v1 match (' || v_match.match_code || ') has been settled with a simulated payout of ₹' || v_amount_inr || '.',
        'financial',
        '/dashboard/matches'
      );
    END IF;

  -- 9B. LIVE REAL WALLET CREDIT EXECUTION
  ELSE
    IF v_winner_id IS NOT NULL AND v_amount_paise > 0 THEN
      -- Lock player wallet
      SELECT * INTO v_wallet
      FROM public.player_wallets
      WHERE user_id = v_winner_id
      FOR UPDATE;

      IF NOT FOUND THEN
        INSERT INTO public.player_wallets (user_id, available_balance_paise)
        VALUES (v_winner_id, 0)
        RETURNING * INTO v_wallet;
      END IF;

      v_balance_before := v_wallet.available_balance_paise;
      v_balance_after := v_balance_before + v_amount_paise;
      v_tx_ref := 'TXN-1V1-WIN-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 8));

      -- Atomically credit player wallet
      UPDATE public.player_wallets
      SET available_balance_paise = v_balance_after,
          version = version + 1,
          updated_at = now()
      WHERE id = v_wallet.id;

      -- Insert immutable wallet transaction
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
        description,
        idempotency_key,
        balance_after_paise
      ) VALUES (
        v_tx_ref,
        v_wallet.id,
        v_winner_id,
        'ONE_VS_ONE_PRIZE',
        v_amount_paise,
        v_amount_inr,
        'completed',
        'one_vs_one_match',
        p_match_id::text,
        '1 VS 1 Match Victory (' || v_card.name || ')',
        '1v1-win-' || p_match_id::text || '-' || v_winner_id::text,
        v_balance_after
      ) RETURNING id INTO v_tx_id;

      -- Insert or update settlement record
      INSERT INTO public.one_vs_one_settlements (
        settlement_ref,
        match_id,
        winner_id,
        card_id,
        amount_paise,
        amount_inr,
        mode,
        status,
        wallet_transaction_id,
        idempotency_key,
        settled_at,
        metadata
      ) VALUES (
        v_settlement_ref,
        p_match_id,
        v_winner_id,
        v_match.card_id,
        v_amount_paise,
        v_amount_inr,
        'real',
        'completed',
        v_tx_id,
        v_idempotency_key,
        now(),
        jsonb_build_object(
          'card_name', v_card.name,
          'wallet_id', v_wallet.id,
          'transaction_ref', v_tx_ref,
          'balance_before', v_balance_before,
          'balance_after', v_balance_after
        )
      )
      ON CONFLICT (match_id) DO UPDATE SET
        settlement_ref = EXCLUDED.settlement_ref,
        winner_id = EXCLUDED.winner_id,
        amount_paise = EXCLUDED.amount_paise,
        amount_inr = EXCLUDED.amount_inr,
        mode = 'real',
        status = 'completed',
        wallet_transaction_id = EXCLUDED.wallet_transaction_id,
        settled_at = now(),
        metadata = EXCLUDED.metadata,
        updated_at = now()
      RETURNING id INTO v_settlement_id;

      -- Send wallet credit notification
      INSERT INTO public.player_notifications (
        user_id,
        title,
        message,
        type,
        action_url
      ) VALUES (
        v_winner_id,
        '1 VS 1 Prize Credited! 🏆',
        '₹' || v_amount_inr || ' has been credited to your wallet for winning 1 VS 1 match ' || v_match.match_code || '.',
        'financial',
        '/dashboard/wallet'
      );
    END IF;
  END IF;

  -- 10. Record match event
  INSERT INTO public.one_vs_one_events (
    match_id,
    actor_id,
    event_type,
    event_payload
  ) VALUES (
    p_match_id,
    COALESCE(p_admin_id, v_winner_id),
    'settlement_completed',
    jsonb_build_object(
      'settlement_id', v_settlement_id,
      'settlement_ref', v_settlement_ref,
      'winner_id', v_winner_id,
      'amount_inr', v_amount_inr,
      'is_dry_run', v_is_dry_run,
      'wallet_transaction_id', v_tx_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'status', 'completed',
    'settlement_id', v_settlement_id,
    'settlement_ref', v_settlement_ref,
    'winner_id', v_winner_id,
    'amount_inr', v_amount_inr,
    'is_dry_run', v_is_dry_run,
    'wallet_transaction_id', v_tx_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.settle_one_vs_one_match(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_one_vs_one_match(UUID, UUID, BOOLEAN) TO authenticated, service_role;
