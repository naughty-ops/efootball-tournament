-- ============================================================================
-- Migration: 20261116040000_atomic_join_waiting_match_by_code.sql
-- Description:
-- Creates atomic stored procedure `public.join_waiting_match_by_code`.
-- Strictly checks wallet balance, row-locks player wallet, deducts card entry fee,
-- inserts ledger transaction, and pairs Player 2 into the waiting match.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.join_waiting_match_by_code(
  p_match_code TEXT,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_clean_code TEXT;
  v_match RECORD;
  v_card RECORD;
  v_wallet RECORD;
  v_active_match_id UUID;
  v_entry_amount NUMERIC(10, 2);
  v_entry_amount_paise BIGINT;
  v_balance_before BIGINT;
  v_balance_after BIGINT;
  v_entry_tx_ref TEXT;
  v_entry_idempotency_key TEXT;
BEGIN
  IF p_match_code IS NULL OR trim(p_match_code) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid match code.');
  END IF;

  v_clean_code := upper(trim(p_match_code));

  -- 1. Check if user already has an active match in progress or waiting
  SELECT match_id INTO v_active_match_id
  FROM public.one_vs_one_match_players
  WHERE user_id = p_user_id AND is_active = true
  LIMIT 1;

  IF v_active_match_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You already have an active 1v1 match in progress or waiting in queue.');
  END IF;

  -- 2. Lock target waiting match FOR UPDATE to eliminate pairing race conditions
  SELECT m.*, c.entry_amount, c.name as card_name
  INTO v_match
  FROM public.one_vs_one_matches m
  JOIN public.one_vs_one_cards c ON c.id = m.card_id
  WHERE upper(m.match_code) = v_clean_code
    AND m.status = 'waiting'
    AND m.expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found, expired, or already matched with another opponent.');
  END IF;

  -- 3. Prevent creator from joining their own match as Player 2
  IF v_match.created_by = p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are the creator of this match. Waiting for an opponent to join.');
  END IF;

  v_entry_amount := COALESCE(v_match.entry_amount, 0);
  v_entry_amount_paise := (v_entry_amount * 100)::bigint;

  -- 4. If paid entry, verify and row-lock Player 2's wallet
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
      RETURN jsonb_build_object('success', false, 'error', 'Your wallet is currently ' || v_wallet.status || '. Please contact support.');
    END IF;

    IF v_wallet.available_balance_paise < v_entry_amount_paise THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Insufficient wallet balance (₹' || to_char(v_entry_amount, 'FM999990.00') || ') to join this match. Your balance: ₹' || to_char((v_wallet.available_balance_paise::numeric / 100.0), 'FM999990.00') || '. Please add money to your wallet.'
      );
    END IF;

    -- Deduct entry fee atomically from Player 2
    v_balance_before := v_wallet.available_balance_paise;
    v_balance_after := v_balance_before - v_entry_amount_paise;
    v_entry_idempotency_key := '1v1-entry-' || v_match.id::text || '-' || p_user_id::text;
    v_entry_tx_ref := 'TXN-1V1-ENTRY-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 8));

    UPDATE public.player_wallets
    SET available_balance_paise = v_balance_after,
        total_spent_paise = total_spent_paise + v_entry_amount_paise,
        version = version + 1,
        updated_at = now()
    WHERE id = v_wallet.id;

    -- Record immutable wallet ledger transaction
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
      v_match.id::text,
      '1 VS 1 Match Entry (' || v_match.card_name || ')',
      v_entry_idempotency_key,
      v_balance_after
    );
  END IF;

  -- 5. Atomically transition match status to 'matched'
  UPDATE public.one_vs_one_matches
  SET status = 'matched',
      matched_at = now(),
      updated_at = now()
  WHERE id = v_match.id;

  -- 6. Insert Player 2 record
  INSERT INTO public.one_vs_one_match_players (
    match_id,
    user_id,
    player_position,
    ready_status,
    is_active
  ) VALUES (
    v_match.id,
    p_user_id,
    2,
    'pending',
    true
  );

  -- 7. Log event in match events ledger
  INSERT INTO public.one_vs_one_events (
    match_id,
    actor_id,
    event_type,
    event_payload
  ) VALUES (
    v_match.id,
    p_user_id,
    'opponent_matched',
    jsonb_build_object(
      'player2_id', p_user_id,
      'matched_at', now(),
      'joined_via_code', v_clean_code,
      'entry_amount', v_entry_amount
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'match_id', v_match.id,
    'match_code', v_match.match_code,
    'player_position', 2,
    'status', 'matched',
    'available_balance_inr', (COALESCE(v_balance_after, COALESCE(v_wallet.available_balance_paise, 0))::numeric / 100.0)
  );
END;
$$;

-- Grant execution to authenticated users and service_role
REVOKE ALL ON FUNCTION public.join_waiting_match_by_code(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_waiting_match_by_code(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_waiting_match_by_code(TEXT, UUID) TO service_role;
