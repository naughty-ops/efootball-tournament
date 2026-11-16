-- Migration: 20261115050000_add_redemption_request_ticket_category.sql
-- Description: Allow 'redemption_request' and 'wallet_redeem' in support_tickets category check,
-- link support_tickets <-> payout_transactions for wallet redemption requests,
-- and provide request_wallet_redemption stored procedure for atomic lock and ticket creation.

ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_category_check;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_category_check
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
  'redemption_request',
  'wallet_redeem',
  'other'
]));

ALTER TABLE public.payout_transactions
  ADD COLUMN IF NOT EXISTS ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS user_notes TEXT;

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS payout_transaction_id UUID REFERENCES public.payout_transactions(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.request_wallet_redemption(
  p_user_id UUID,
  p_amount_inr NUMERIC,
  p_payment_method_id UUID DEFAULT NULL,
  p_upi_id TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet RECORD;
  v_amount_paise BIGINT;
  v_pm_id UUID := p_payment_method_id;
  v_pm_type TEXT := 'upi';
  v_destination_details TEXT := '';
  v_payout_ref TEXT;
  v_ticket_num TEXT;
  v_payout_id UUID;
  v_ticket_id UUID;
  v_player_name TEXT := 'Player';
  v_player_email TEXT := '';
  v_new_available NUMERIC;
BEGIN
  -- 1. Validate Amount
  IF p_amount_inr IS NULL OR p_amount_inr < 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Minimum redemption amount is ₹10.');
  END IF;

  v_amount_paise := ROUND(p_amount_inr * 100)::BIGINT;

  -- 2. Fetch User Profile
  SELECT coalesce(display_name, 'Player')
  INTO v_player_name
  FROM public.profiles
  WHERE id = p_user_id;

  SELECT email
  INTO v_player_email
  FROM auth.users
  WHERE id = p_user_id;

  IF v_player_email IS NULL THEN
    v_player_email := 'player@arena.internal';
  END IF;

  -- 3. Fetch Wallet
  SELECT *
  INTO v_wallet
  FROM public.player_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wallet not found.');
  END IF;

  IF v_wallet.available_balance_paise < v_amount_paise THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient available balance. You have ₹' || (v_wallet.available_balance_paise / 100.0)::text || ' available.'
    );
  END IF;

  -- 4. Resolve Payment Method
  IF v_pm_id IS NOT NULL THEN
    SELECT payment_method_type, coalesce(upi_id, masked_account_number, 'Configured Account')
    INTO v_pm_type, v_destination_details
    FROM public.player_payment_methods
    WHERE id = v_pm_id AND user_id = p_user_id;
  END IF;

  IF (v_destination_details IS NULL OR v_destination_details = '') AND p_upi_id IS NOT NULL AND trim(p_upi_id) <> '' THEN
    v_pm_type := 'upi';
    v_destination_details := trim(p_upi_id);

    -- Auto-save as payment method if user has none
    INSERT INTO public.player_payment_methods (
      user_id,
      payment_method_type,
      upi_id,
      is_preferred
    ) VALUES (
      p_user_id,
      'upi',
      trim(p_upi_id),
      true
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_pm_id;
  END IF;

  IF v_destination_details IS NULL OR v_destination_details = '' THEN
    -- Fall back to preferred payment method
    SELECT id, payment_method_type, coalesce(upi_id, masked_account_number, 'Configured Account')
    INTO v_pm_id, v_pm_type, v_destination_details
    FROM public.player_payment_methods
    WHERE user_id = p_user_id AND is_preferred = true
    LIMIT 1;

    IF NOT FOUND THEN
      SELECT id, payment_method_type, coalesce(upi_id, masked_account_number, 'Configured Account')
      INTO v_pm_id, v_pm_type, v_destination_details
      FROM public.player_payment_methods
      WHERE user_id = p_user_id
      LIMIT 1;
    END IF;
  END IF;

  IF v_destination_details IS NULL OR v_destination_details = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Please provide a valid UPI ID or add a payout payment method.'
    );
  END IF;

  -- 5. Generate References
  v_payout_ref := 'PO-RDM-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substring(md5(random()::text) from 1 for 5));
  v_ticket_num := 'TKT-RDM-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substring(md5(random()::text) from 1 for 4));

  -- 6. Lock Balance in Wallet
  UPDATE public.player_wallets
  SET
    available_balance_paise = available_balance_paise - v_amount_paise,
    locked_balance_paise = locked_balance_paise + v_amount_paise,
    updated_at = now()
  WHERE user_id = p_user_id AND available_balance_paise >= v_amount_paise
  RETURNING (available_balance_paise / 100.0) INTO v_new_available;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Balance update failed. Please retry.');
  END IF;

  -- 7. Insert Payout Transaction
  INSERT INTO public.payout_transactions (
    payout_reference,
    player_id,
    amount_paise,
    amount_inr,
    payment_method_id,
    payment_method_type,
    payout_status,
    eligible_at,
    deadline_at,
    user_notes
  ) VALUES (
    v_payout_ref,
    p_user_id,
    v_amount_paise,
    p_amount_inr,
    v_pm_id,
    v_pm_type,
    'PENDING',
    now(),
    now() + interval '24 hours',
    p_notes
  ) RETURNING id INTO v_payout_id;

  -- 8. Insert Support Ticket
  INSERT INTO public.support_tickets (
    ticket_number,
    user_id,
    player_name,
    player_email,
    category,
    subject,
    description,
    priority,
    status,
    expected_payout,
    settlement_reference,
    payout_transaction_id
  ) VALUES (
    v_ticket_num,
    p_user_id,
    v_player_name,
    v_player_email,
    'redemption_request',
    'Redeem Request: ₹' || p_amount_inr::text || ' via ' || upper(v_pm_type),
    'Player requested wallet redemption of ₹' || p_amount_inr::text || E'\n' ||
    'Payout Reference: ' || v_payout_ref || E'\n' ||
    'Destination: ' || v_destination_details || E'\n' ||
    'Status: Awaiting administrator payout disbursement (24h SLA).' ||
    CASE WHEN p_notes IS NOT NULL AND p_notes <> '' THEN E'\nPlayer Note: ' || p_notes ELSE '' END,
    'high',
    'pending_review',
    p_amount_inr,
    v_payout_ref,
    v_payout_id
  ) RETURNING id INTO v_ticket_id;

  -- 9. Link Ticket to Payout Transaction
  UPDATE public.payout_transactions
  SET ticket_id = v_ticket_id
  WHERE id = v_payout_id;

  -- 10. Insert Initial Ticket Message
  INSERT INTO public.ticket_messages (
    ticket_id,
    sender_id,
    sender_role,
    sender_name,
    message
  ) VALUES (
    v_ticket_id,
    p_user_id,
    'player',
    v_player_name,
    'Redemption request of ₹' || p_amount_inr::text || ' submitted.' || E'\n' ||
    'Destination: ' || v_destination_details || ' (' || upper(v_pm_type) || ')' || E'\n' ||
    'Payout Reference: ' || v_payout_ref || E'\n' ||
    'Your payout will be processed to this destination by our finance desk within 24 hours.'
  );

  -- 11. Insert Audit Log
  INSERT INTO public.ticket_audit_logs (
    ticket_id,
    action,
    explanation,
    admin_name
  ) VALUES (
    v_ticket_id,
    'ticket_created',
    'Wallet balance redemption request ticket created for ₹' || p_amount_inr::text || ' (Payout Ref: ' || v_payout_ref || ')',
    v_player_name
  );

  RETURN jsonb_build_object(
    'success', true,
    'ticketId', v_ticket_id,
    'ticketNumber', v_ticket_num,
    'payoutReference', v_payout_ref,
    'amountInr', p_amount_inr,
    'destination', v_destination_details,
    'newAvailableBalanceInr', v_new_available
  );
END;
$$;
