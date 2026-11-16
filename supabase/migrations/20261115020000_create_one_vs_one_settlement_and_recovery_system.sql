-- ============================================================================
-- Migration: 20261115020000_create_one_vs_one_settlement_and_recovery_system.sql
-- Description: Automatic Winner Settlement, Financial Recovery, & Ticket System
--              for the 1 VS 1 Challenge Arena.
--
-- Security & Financial Guarantees:
-- 1. Strictly maintains existing FREE / DRY-RUN mode (zero fake ledger writes).
-- 2. Fully supports atomic real-wallet credit when real mode or authorization is flagged.
-- 3. Idempotent settlements enforced via unique constraints on match_id and idempotency_key.
-- 4. Authoritative server-side card advertised payout used exclusively.
-- 5. Safe recovery & retry mechanisms with immutable financial audit logs.
-- 6. Integrates support tickets for missing wallet credit inquiries.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Upgrade public.support_tickets Table
-- ----------------------------------------------------------------------------
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS one_vs_one_match_id UUID REFERENCES public.one_vs_one_matches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expected_payout NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS settlement_reference TEXT;

-- Expand Category Check
ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_category_check;

ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_category_check
  CHECK (category = ANY (ARRAY[
    'match_dispute',
    'match_not_started',
    'score_disagreement',
    'screenshot_evidence',
    'player_complaint',
    'tournament_issue',
    'technical_support',
    'wallet_credit',
    'settlement_issue',
    'prize_payout',
    'other'
  ]));

-- Expand Status Check
ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_status_check;

ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_status_check
  CHECK (status = ANY (ARRAY[
    'open',
    'pending_review',
    'under_investigation',
    'investigating',
    'waiting_for_player',
    'awaiting_player',
    'resolved',
    'rejected',
    'closed'
  ]));

CREATE INDEX IF NOT EXISTS idx_support_tickets_1v1_match ON public.support_tickets(one_vs_one_match_id);

-- ----------------------------------------------------------------------------
-- 2. Table: public.one_vs_one_settlements
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.one_vs_one_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_ref TEXT NOT NULL UNIQUE,
  match_id UUID NOT NULL REFERENCES public.one_vs_one_matches(id) ON DELETE RESTRICT,
  winner_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  card_id UUID NOT NULL REFERENCES public.one_vs_one_cards(id) ON DELETE RESTRICT,
  amount_paise BIGINT NOT NULL DEFAULT 0 CHECK (amount_paise >= 0),
  amount_inr NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (amount_inr >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  mode TEXT NOT NULL DEFAULT 'dry_run' CHECK (mode IN ('free', 'dry_run', 'real')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'under_review', 'cancelled')),
  wallet_transaction_id UUID REFERENCES public.wallet_transactions(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  failure_reason TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  settled_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_one_vs_one_settlement_match UNIQUE (match_id)
);

-- Link support_tickets to settlement if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'support_tickets' AND column_name = 'settlement_id'
  ) THEN
    ALTER TABLE public.support_tickets
      ADD COLUMN settlement_id UUID REFERENCES public.one_vs_one_settlements(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Indexes
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_one_vs_one_settlements_match ON public.one_vs_one_settlements(match_id);
CREATE INDEX IF NOT EXISTS idx_one_vs_one_settlements_winner ON public.one_vs_one_settlements(winner_id);
CREATE INDEX IF NOT EXISTS idx_one_vs_one_settlements_status ON public.one_vs_one_settlements(status);
CREATE INDEX IF NOT EXISTS idx_one_vs_one_settlements_created ON public.one_vs_one_settlements(created_at DESC);

-- ----------------------------------------------------------------------------
-- 4. Row Level Security on public.one_vs_one_settlements
-- ----------------------------------------------------------------------------
ALTER TABLE public.one_vs_one_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants and admins can view settlements" ON public.one_vs_one_settlements;
CREATE POLICY "Participants and admins can view settlements"
  ON public.one_vs_one_settlements
  FOR SELECT
  TO authenticated
  USING (
    winner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.one_vs_one_match_players p
      WHERE p.match_id = one_vs_one_settlements.match_id AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE admin_users.id = auth.uid()
        AND admin_users.role = ANY (ARRAY['super_admin'::admin_role, 'admin'::admin_role, 'moderator'::admin_role])
    )
  );

DROP POLICY IF EXISTS "Only admin or system can insert/update settlements" ON public.one_vs_one_settlements;
CREATE POLICY "Only admin or system can insert/update settlements"
  ON public.one_vs_one_settlements
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE admin_users.id = auth.uid()
        AND admin_users.role = ANY (ARRAY['super_admin'::admin_role, 'admin'::admin_role])
    )
  );

-- ----------------------------------------------------------------------------
-- 5. Atomic Stored Procedure: public.settle_one_vs_one_match
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
  v_card RECORD;
  v_result RECORD;
  v_dispute RECORD;
  v_existing_settlement RECORD;
  v_winner_id UUID := NULL;
  v_amount_inr NUMERIC(10, 2) := 0.00;
  v_amount_paise BIGINT := 0;
  v_settlement_ref TEXT;
  v_idempotency_key TEXT;
  v_settlement_id UUID;
  v_is_dry_run BOOLEAN := TRUE;
  v_wallet RECORD;
  v_balance_before BIGINT := 0;
  v_balance_after BIGINT := 0;
  v_tx_id UUID := NULL;
  v_tx_ref TEXT := NULL;
BEGIN
  -- 1. Lock match record
  SELECT * INTO v_match
  FROM public.one_vs_one_matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found.');
  END IF;

  -- 2. Verify match is completed
  IF v_match.status != 'completed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match is not completed. Current status: ' || v_match.status);
  END IF;

  -- 3. Fetch authoritative card payout
  SELECT * INTO v_card
  FROM public.one_vs_one_cards
  WHERE id = v_match.card_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Card configuration not found.');
  END IF;

  -- 4. Check for active/unresolved dispute
  SELECT * INTO v_dispute
  FROM public.one_vs_one_disputes
  WHERE match_id = p_match_id;

  IF FOUND AND v_dispute.status IN ('open', 'under_review') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot settle: match has an open unresolved dispute.');
  END IF;

  -- 5. Fetch confirmed or verified result
  SELECT * INTO v_result
  FROM public.one_vs_one_results
  WHERE match_id = p_match_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match result not found.');
  END IF;

  IF v_result.status NOT IN ('confirmed', 'verified') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Result must be confirmed by opponent or verified by admin before settlement.');
  END IF;

  -- 6. Check existing settlement (Strict Idempotency)
  SELECT * INTO v_existing_settlement
  FROM public.one_vs_one_settlements
  WHERE match_id = p_match_id
  FOR UPDATE;

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

  -- 8. Enforce FREE / DRY-RUN mode or Live execution
  IF v_match.match_mode IN ('free', 'dry_run') AND NOT p_allow_real_credit THEN
    v_is_dry_run := TRUE;
  ELSE
    v_is_dry_run := FALSE;
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
        'note', 'Simulated dry-run settlement. Zero real balance mutated in financial ledger.'
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
        -- Insert failed settlement record for recovery
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
          failure_reason,
          metadata
        ) VALUES (
          v_settlement_ref,
          p_match_id,
          v_winner_id,
          v_match.card_id,
          v_amount_paise,
          v_amount_inr,
          'real',
          'failed',
          v_idempotency_key,
          'Player wallet not found for winner: ' || v_winner_id,
          jsonb_build_object('error_code', 'WALLET_NOT_FOUND')
        )
        ON CONFLICT (match_id) DO UPDATE SET
          status = 'failed',
          failure_reason = EXCLUDED.failure_reason,
          updated_at = now()
        RETURNING id INTO v_settlement_id;

        RETURN jsonb_build_object('success', false, 'error', 'Player wallet not found for winner.', 'settlement_id', v_settlement_id);
      END IF;

      IF v_wallet.status != 'active' THEN
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
          failure_reason
        ) VALUES (
          v_settlement_ref,
          p_match_id,
          v_winner_id,
          v_match.card_id,
          v_amount_paise,
          v_amount_inr,
          'real',
          'under_review',
          v_idempotency_key,
          'Player wallet is suspended/frozen (status: ' || v_wallet.status || ')'
        )
        ON CONFLICT (match_id) DO UPDATE SET
          status = 'under_review',
          failure_reason = EXCLUDED.failure_reason,
          updated_at = now()
        RETURNING id INTO v_settlement_id;

        RETURN jsonb_build_object('success', false, 'error', 'Player wallet is not active.', 'settlement_id', v_settlement_id);
      END IF;

      -- Atomic balance update
      v_balance_before := v_wallet.available_balance_paise;
      v_balance_after := v_balance_before + v_amount_paise;

      UPDATE public.player_wallets
      SET available_balance_paise = v_balance_after,
          total_earnings_paise = total_earnings_paise + v_amount_paise,
          version = version + 1,
          updated_at = now()
      WHERE id = v_wallet.id;

      -- Atomic wallet transaction
      v_tx_ref := 'TX-1V1-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 8));

      INSERT INTO public.wallet_transactions (
        transaction_ref,
        wallet_id,
        user_id,
        transaction_type,
        amount_paise,
        amount_inr,
        balance_after_paise,
        status,
        reference_type,
        reference_id,
        description,
        idempotency_key,
        created_at
      ) VALUES (
        v_tx_ref,
        v_wallet.id,
        v_winner_id,
        'MATCH_WIN_PRIZE',
        v_amount_paise,
        v_amount_inr,
        v_balance_after,
        'completed',
        'match',
        p_match_id::text,
        '1 VS 1 Arena Match Victory: ' || v_match.match_code,
        v_idempotency_key,
        now()
      )
      RETURNING id INTO v_tx_id;

      -- Create completed settlement record linked to transaction
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
        'Wallet Credited! 💳',
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
    'match_settled',
    jsonb_build_object(
      'settlement_id', v_settlement_id,
      'settlement_ref', v_settlement_ref,
      'winner_id', v_winner_id,
      'amount_inr', v_amount_inr,
      'mode', CASE WHEN v_is_dry_run THEN 'dry_run' ELSE 'real' END,
      'status', 'completed'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'settlement_id', v_settlement_id,
    'settlement_ref', v_settlement_ref,
    'status', 'completed',
    'winner_id', v_winner_id,
    'amount_inr', v_amount_inr,
    'is_dry_run', v_is_dry_run
  );
END;
$$;

REVOKE ALL ON FUNCTION public.settle_one_vs_one_match(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_one_vs_one_match(UUID, UUID, BOOLEAN) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. Atomic Stored Procedure: public.admin_retry_one_vs_one_settlement
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_retry_one_vs_one_settlement(
  p_settlement_id UUID,
  p_admin_id UUID,
  p_reason TEXT,
  p_allow_real_credit BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_settlement RECORD;
  v_res JSONB;
BEGIN
  -- 1. Verify admin privilege
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE id = p_admin_id AND is_active = true AND role IN ('super_admin', 'admin')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Requires administrator privileges.');
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reason is required for retrying settlement.');
  END IF;

  -- 2. Lock settlement record
  SELECT * INTO v_settlement
  FROM public.one_vs_one_settlements
  WHERE id = p_settlement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Settlement record not found.');
  END IF;

  IF v_settlement.status = 'completed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot retry: settlement is already completed.');
  END IF;

  -- 3. Update retry count
  UPDATE public.one_vs_one_settlements
  SET retry_count = retry_count + 1,
      status = 'processing',
      updated_at = now()
  WHERE id = p_settlement_id;

  -- 4. Re-run settlement
  v_res := public.settle_one_vs_one_match(v_settlement.match_id, p_admin_id, p_allow_real_credit);

  -- 5. Insert immutable audit log
  INSERT INTO public.financial_audit_logs (
    actor_id,
    action,
    target_type,
    target_id,
    previous_state,
    new_state,
    metadata
  ) VALUES (
    p_admin_id,
    'ONE_VS_ONE_SETTLEMENT_RETRY',
    'one_vs_one_settlement',
    p_settlement_id::text,
    jsonb_build_object('status', v_settlement.status, 'failure_reason', v_settlement.failure_reason, 'retry_count', v_settlement.retry_count),
    v_res,
    jsonb_build_object('reason', p_reason, 'retried_by', p_admin_id)
  );

  RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_retry_one_vs_one_settlement(UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_retry_one_vs_one_settlement(UUID, UUID, TEXT, BOOLEAN) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. Atomic Stored Procedure: public.admin_manual_settlement_correction
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_manual_settlement_correction(
  p_settlement_id UUID,
  p_admin_id UUID,
  p_action TEXT,
  p_new_winner_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_settlement RECORD;
  v_old_state JSONB;
  v_new_state JSONB;
BEGIN
  -- Verify admin privilege
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE id = p_admin_id AND is_active = true AND role IN ('super_admin', 'admin')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Requires administrator privileges.');
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'A clear reason (at least 5 characters) is required for financial correction.');
  END IF;

  SELECT * INTO v_settlement
  FROM public.one_vs_one_settlements
  WHERE id = p_settlement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Settlement record not found.');
  END IF;

  v_old_state := jsonb_build_object(
    'status', v_settlement.status,
    'winner_id', v_settlement.winner_id,
    'amount_inr', v_settlement.amount_inr
  );

  IF p_action = 'cancel' THEN
    UPDATE public.one_vs_one_settlements
    SET status = 'cancelled',
        failure_reason = 'Cancelled by administrator: ' || p_reason,
        updated_at = now()
    WHERE id = p_settlement_id;
  ELSIF p_action = 'mark_completed' THEN
    UPDATE public.one_vs_one_settlements
    SET status = 'completed',
        settled_at = now(),
        failure_reason = NULL,
        updated_at = now()
    WHERE id = p_settlement_id;
  ELSIF p_action = 'reassign_winner' THEN
    IF p_new_winner_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'New winner ID required.');
    END IF;

    UPDATE public.one_vs_one_settlements
    SET winner_id = p_new_winner_id,
        status = 'under_review',
        failure_reason = 'Winner reassigned by administrator: ' || p_reason,
        updated_at = now()
    WHERE id = p_settlement_id;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action. Supported: cancel, mark_completed, reassign_winner.');
  END IF;

  v_new_state := jsonb_build_object(
    'action', p_action,
    'reason', p_reason,
    'corrected_by', p_admin_id,
    'timestamp', now()
  );

  -- Immutable financial audit log
  INSERT INTO public.financial_audit_logs (
    actor_id,
    action,
    target_type,
    target_id,
    previous_state,
    new_state,
    metadata
  ) VALUES (
    p_admin_id,
    'ONE_VS_ONE_MANUAL_SETTLEMENT_CORRECTION',
    'one_vs_one_settlement',
    p_settlement_id::text,
    v_old_state,
    v_new_state,
    jsonb_build_object('reason', p_reason, 'admin_id', p_admin_id)
  );

  RETURN jsonb_build_object('success', true, 'action', p_action);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_manual_settlement_correction(UUID, UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_manual_settlement_correction(UUID, UUID, TEXT, UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. Hook Automatic Settlement into confirm_one_vs_one_result
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_one_vs_one_result(
  p_match_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_player RECORD;
  v_result RECORD;
  v_settle_res JSONB;
BEGIN
  -- Verify caller is participant
  SELECT * INTO v_player
  FROM public.one_vs_one_match_players
  WHERE match_id = p_match_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized: You are not a registered participant in this match.';
  END IF;

  SELECT * INTO v_result
  FROM public.one_vs_one_results
  WHERE match_id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No result has been submitted yet to confirm.';
  END IF;

  IF v_result.submitted_by = p_user_id THEN
    RAISE EXCEPTION 'You cannot confirm your own score submission; the opponent must confirm.';
  END IF;

  UPDATE public.one_vs_one_results
  SET status = 'confirmed',
      opponent_confirmed_at = now(),
      updated_at = now()
  WHERE match_id = p_match_id;

  UPDATE public.one_vs_one_matches
  SET status = 'completed',
      completed_at = now(),
      updated_at = now()
  WHERE id = p_match_id;

  -- Deactivate players from active queue
  UPDATE public.one_vs_one_match_players
  SET is_active = false
  WHERE match_id = p_match_id;

  INSERT INTO public.one_vs_one_events (
    match_id,
    actor_id,
    event_type,
    event_payload
  ) VALUES (
    p_match_id,
    p_user_id,
    'result_confirmed',
    jsonb_build_object('confirmed_by', p_user_id, 'confirmed_at', now())
  );

  -- Automatic Winner Settlement Trigger
  v_settle_res := public.settle_one_vs_one_match(p_match_id, NULL, FALSE);

  RETURN jsonb_build_object('success', true, 'settlement', v_settle_res);
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. Hook Automatic Settlement into admin_resolve_one_vs_one_dispute
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_resolve_one_vs_one_dispute(
  p_dispute_id UUID,
  p_admin_id UUID,
  p_winner_id UUID,
  p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_dispute RECORD;
  v_match RECORD;
  v_settle_res JSONB;
BEGIN
  -- Verify caller is administrator
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE id = p_admin_id AND is_active = true AND role IN ('super_admin', 'admin', 'moderator')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Administrator privileges required to resolve disputes.';
  END IF;

  SELECT * INTO v_dispute
  FROM public.one_vs_one_disputes
  WHERE id = p_dispute_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dispute not found.';
  END IF;

  SELECT * INTO v_match
  FROM public.one_vs_one_matches
  WHERE id = v_dispute.match_id;

  -- 1. Update dispute status
  UPDATE public.one_vs_one_disputes
  SET status = 'resolved',
      admin_notes = p_admin_notes,
      resolved_by = p_admin_id,
      resolved_at = now()
  WHERE id = p_dispute_id;

  -- 2. Update result to verified with admin-awarded winner
  UPDATE public.one_vs_one_results
  SET status = 'verified',
      claimed_winner_id = p_winner_id,
      verified_by = p_admin_id,
      verified_at = now(),
      updated_at = now()
  WHERE match_id = v_dispute.match_id;

  -- 3. Update match status to completed
  UPDATE public.one_vs_one_matches
  SET status = 'completed',
      completed_at = now(),
      updated_at = now()
  WHERE id = v_dispute.match_id;

  -- 4. Release player active queue locks
  UPDATE public.one_vs_one_match_players
  SET is_active = false
  WHERE match_id = v_dispute.match_id;

  -- 5. Record Event
  INSERT INTO public.one_vs_one_events (
    match_id,
    actor_id,
    event_type,
    event_payload
  ) VALUES (
    v_dispute.match_id,
    p_admin_id,
    'dispute_resolved',
    jsonb_build_object(
      'resolved_by', p_admin_id,
      'winner_id', p_winner_id,
      'notes', p_admin_notes
    )
  );

  -- 6. Trigger automatic settlement for the verified winner
  v_settle_res := public.settle_one_vs_one_match(v_dispute.match_id, p_admin_id, FALSE);

  RETURN jsonb_build_object('success', true, 'settlement', v_settle_res);
END;
$$;

-- ----------------------------------------------------------------------------
-- 10. Publication for Realtime Updates
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.one_vs_one_settlements;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
