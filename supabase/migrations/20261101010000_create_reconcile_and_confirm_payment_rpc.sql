-- ============================================================================
-- Migration: 20261101010000_create_reconcile_and_confirm_payment_rpc.sql
-- Description:
-- Production-Safe Atomic Payment Reconciliation Procedure
--
-- Replaces multi-step check-then-act API workflows with a single PostgreSQL
-- stored procedure that coordinates:
-- 1. Strict Owner Authorization (public.is_admin() validation)
-- 2. Concurrency-safe row locking (FOR UPDATE on order, registration, tournament)
-- 3. Exact financial matching (order.amount_paise == tournament.entry_fee_paise, currency == 'INR')
-- 4. Safe UTR uniqueness validation & normalization (alphanumeric uppercase)
-- 5. Atomic insertion of captured payment_transactions
-- 6. Atomic tournament reservation confirmation (slot increment, participant creation)
-- 7. Atomic update of payment_orders to 'paid'
-- 8. Immutable audit recording in public.admin_audit_logs
--
-- Completely atomic: Any failure automatically rolls back the entire transaction.
-- ============================================================================

-- Ensure admin_audit_logs table exists if not yet provisioned
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL,
  target_user_id UUID,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  details JSONB,
  previous_values JSONB,
  new_values JSONB,
  reason TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'success',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE OR REPLACE FUNCTION public.reconcile_and_confirm_payment(
  p_order_id UUID,
  p_decision TEXT, -- 'approve' | 'reject'
  p_bank_reference TEXT,
  p_admin_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  participant_id UUID,
  order_id UUID,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_admin_id UUID;
  v_admin_email TEXT;
  v_order RECORD;
  v_reg RECORD;
  v_tourn RECORD;
  v_clean_utr TEXT;
  v_existing_tx RECORD;
  v_new_tx_id UUID;
  v_part_id UUID := NULL;
  v_username TEXT;
  v_real_name TEXT;
  v_contact_info TEXT;
BEGIN
  -- 1. Strict Authorization Verification
  -- Must be authenticated and pass public.is_admin() (verified ye.agrajj@gmail.com)
  IF NOT public.is_admin() THEN
    RETURN QUERY SELECT false, 'Unauthorized: Privileged reconciliation requires owner administrator privilege'::TEXT, NULL::UUID, p_order_id, 'unauthorized'::TEXT;
    RETURN;
  END IF;

  v_admin_id := auth.uid();
  v_admin_email := LOWER(TRIM(COALESCE(auth.jwt() ->> 'email', '')));

  -- 2. Lock and Validate Payment Order
  SELECT po.id, po.registration_id, po.tournament_id, po.user_id, po.amount_paise, 
         po.currency, po.status, po.gateway, po.receipt
  INTO v_order
  FROM public.payment_orders po
  WHERE po.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Payment order not found in platform ledger'::TEXT, NULL::UUID, p_order_id, 'not_found'::TEXT;
    RETURN;
  END IF;

  IF v_order.status NOT IN ('manual_review_required', 'pending_verification') THEN
    RETURN QUERY SELECT false, ('Cannot reconcile order with status: ' || v_order.status || '. Only pending or review orders are eligible.')::TEXT, NULL::UUID, p_order_id, v_order.status::TEXT;
    RETURN;
  END IF;

  -- 3. Lock and Validate Registration
  SELECT tr.id, tr.tournament_id, tr.user_id, tr.status, tr.amount_paise, tr.currency, 
         tr.participant_id, tr.reserved_until, tr.payment_transaction_id
  INTO v_reg
  FROM public.tournament_registrations tr
  WHERE tr.id = v_order.registration_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Associated tournament registration not found'::TEXT, NULL::UUID, p_order_id, 'not_found'::TEXT;
    RETURN;
  END IF;

  IF v_reg.user_id != v_order.user_id OR v_reg.tournament_id != v_order.tournament_id THEN
    RETURN QUERY SELECT false, 'Integrity error: Payment order and registration user/tournament mismatch'::TEXT, NULL::UUID, p_order_id, 'mismatch'::TEXT;
    RETURN;
  END IF;

  -- 4. Lock and Validate Tournament
  SELECT t.id, t.name, t.status, t.is_paid, t.entry_fee_paise, t.currency, 
         t.max_participants, t.confirmed_slots_count, t.reserved_slots_count
  INTO v_tourn
  FROM public.tournaments t
  WHERE t.id = v_order.tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Associated tournament record not found'::TEXT, NULL::UUID, p_order_id, 'not_found'::TEXT;
    RETURN;
  END IF;

  -- 5. Handle Rejection Decision
  IF p_decision = 'reject' THEN
    UPDATE public.payment_orders
    SET status = 'failed',
        manual_review_notes = 'Rejected by owner (' || v_admin_email || '): ' || COALESCE(p_admin_notes, 'No valid bank credit found.'),
        reconciled_at = timezone('utc', now()),
        reconciled_by = v_admin_id,
        updated_at = timezone('utc', now())
    WHERE id = v_order.id;

    -- Record Audit Log
    INSERT INTO public.admin_audit_logs (
      admin_id, target_user_id, action, entity_type, details, reason, status
    ) VALUES (
      v_admin_id, v_order.user_id, 'payment_reconciliation_rejected', 'payment_order',
      jsonb_build_object('order_id', v_order.id, 'tournament_id', v_tourn.id, 'notes', p_admin_notes),
      COALESCE(p_admin_notes, 'Payment rejected during manual bank review'),
      'success'
    );

    RETURN QUERY SELECT true, 'Payment order successfully rejected and marked failed'::TEXT, NULL::UUID, p_order_id, 'failed'::TEXT;
    RETURN;
  END IF;

  -- 6. Approval Validations: Financial Integrity
  IF v_order.amount_paise != v_tourn.entry_fee_paise THEN
    RETURN QUERY SELECT false, ('Financial mismatch: Order amount (' || v_order.amount_paise || ' paise) does not match tournament entry fee (' || v_tourn.entry_fee_paise || ' paise)')::TEXT, NULL::UUID, p_order_id, 'amount_mismatch'::TEXT;
    RETURN;
  END IF;

  IF UPPER(v_order.currency) != 'INR' OR UPPER(v_tourn.currency) != 'INR' THEN
    RETURN QUERY SELECT false, 'Currency mismatch: Only INR is supported for manual reconciliation'::TEXT, NULL::UUID, p_order_id, 'currency_mismatch'::TEXT;
    RETURN;
  END IF;

  -- 7. Normalize & Validate UTR Reference
  -- Strips all non-alphanumeric characters, converts to uppercase
  v_clean_utr := UPPER(REGEXP_REPLACE(COALESCE(p_bank_reference, ''), '[^a-zA-Z0-9]', '', 'g'));

  IF LENGTH(v_clean_utr) < 8 THEN
    RETURN QUERY SELECT false, 'Invalid bank reference: Evidence reference must be at least 8 alphanumeric characters'::TEXT, NULL::UUID, p_order_id, 'invalid_utr'::TEXT;
    RETURN;
  END IF;

  -- Enforce Duplicate UTR Protection
  SELECT pt.id, pt.order_id, pt.user_id
  INTO v_existing_tx
  FROM public.payment_transactions pt
  WHERE UPPER(REGEXP_REPLACE(pt.bank_reference, '[^a-zA-Z0-9]', '', 'g')) = v_clean_utr
    AND pt.status = 'captured'
    AND pt.order_id != v_order.id
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT false, ('Banking reference ' || v_clean_utr || ' has already been captured under order ' || v_existing_tx.order_id)::TEXT, NULL::UUID, p_order_id, 'duplicate_utr'::TEXT;
    RETURN;
  END IF;

  -- 8. Fetch Player Profile Data for Participant Record
  SELECT pr.efootball_id, pr.display_name, pr.whatsapp_number
  INTO v_username, v_real_name, v_contact_info
  FROM public.profiles pr
  WHERE pr.id = v_order.user_id;

  v_username := COALESCE(NULLIF(TRIM(v_username), ''), 'player_' || SUBSTRING(v_order.user_id::TEXT, 1, 8));
  v_real_name := COALESCE(NULLIF(TRIM(v_real_name), ''), v_username);
  v_contact_info := NULLIF(TRIM(v_contact_info), '');

  -- 9. Insert Captured Payment Transaction
  INSERT INTO public.payment_transactions (
    order_id,
    tournament_id,
    user_id,
    gateway,
    gateway_payment_id,
    gateway_signature,
    amount_paise,
    currency,
    status,
    payment_method,
    bank_reference,
    verified_at,
    created_at
  ) VALUES (
    v_order.id,
    v_tourn.id,
    v_order.user_id,
    COALESCE(v_order.gateway, 'youpi'),
    'rec_' || SUBSTRING(v_clean_utr, 1, 20),
    'manual_reconciled_by_' || v_admin_id::TEXT,
    v_order.amount_paise,
    'INR',
    'captured',
    'UPI',
    v_clean_utr,
    timezone('utc', now()),
    timezone('utc', now())
  ) RETURNING id INTO v_new_tx_id;

  -- 10. Handle Reservation & Capacity Confirmation
  IF v_reg.status = 'expired' THEN
    IF v_tourn.confirmed_slots_count >= v_tourn.max_participants THEN
      -- Tournament filled up while hold was expired: queue refund request
      INSERT INTO public.payment_refund_requests (
        transaction_id, order_id, tournament_id, user_id, amount_paise, currency, reason, status, admin_notes
      ) VALUES (
        v_new_tx_id, v_order.id, v_tourn.id, v_order.user_id, v_order.amount_paise, 'INR',
        'Tournament capacity reached after reservation expired.', 'pending_review',
        'Queued automatically during reconciliation: tournament full.'
      );
      RETURN QUERY SELECT false, 'Tournament capacity reached after hold expired. Payment recorded and queued for refund.'::TEXT, NULL::UUID, p_order_id, 'capacity_reached'::TEXT;
      RETURN;
    END IF;

    -- Late payment with available capacity: confirm
    UPDATE public.tournaments
    SET confirmed_slots_count = confirmed_slots_count + 1,
        updated_at = timezone('utc', now())
    WHERE id = v_tourn.id;

  ELSIF v_reg.status = 'pending_payment' THEN
    UPDATE public.tournaments
    SET reserved_slots_count = GREATEST(0, reserved_slots_count - 1),
        confirmed_slots_count = confirmed_slots_count + 1,
        updated_at = timezone('utc', now())
    WHERE id = v_tourn.id;
  END IF;

  -- 11. Create or Link Participant
  SELECT p.id INTO v_part_id
  FROM public.participants p
  WHERE p.tournament_id = v_tourn.id
    AND ((p.user_id IS NOT NULL AND p.user_id = v_order.user_id) OR LOWER(p.username) = LOWER(v_username))
  LIMIT 1;

  IF v_part_id IS NULL THEN
    INSERT INTO public.participants (
      tournament_id, user_id, username, real_name, contact_info, status
    ) VALUES (
      v_tourn.id, v_order.user_id, v_username, v_real_name, v_contact_info, 'active'
    ) RETURNING id INTO v_part_id;
  END IF;

  -- 12. Update Registration to Confirmed
  UPDATE public.tournament_registrations
  SET status = 'confirmed',
      confirmed_at = timezone('utc', now()),
      participant_id = v_part_id,
      payment_transaction_id = v_new_tx_id,
      updated_at = timezone('utc', now())
  WHERE id = v_reg.id;

  -- 13. Update Payment Order to Paid
  UPDATE public.payment_orders
  SET status = 'paid',
      observation_utr = v_clean_utr,
      manual_review_notes = 'Approved by owner (' || v_admin_email || '). Notes: ' || COALESCE(p_admin_notes, 'Confirmed on bank statement.'),
      reconciled_at = timezone('utc', now()),
      reconciled_by = v_admin_id,
      updated_at = timezone('utc', now())
  WHERE id = v_order.id;

  -- 14. Record Audit Log
  INSERT INTO public.admin_audit_logs (
    admin_id, target_user_id, action, entity_type, details, reason, status
  ) VALUES (
    v_admin_id, v_order.user_id, 'payment_reconciliation_approved', 'payment_order',
    jsonb_build_object(
      'order_id', v_order.id,
      'registration_id', v_reg.id,
      'tournament_id', v_tourn.id,
      'transaction_id', v_new_tx_id,
      'participant_id', v_part_id,
      'utr', v_clean_utr,
      'notes', p_admin_notes
    ),
    COALESCE(p_admin_notes, 'Confirmed on bank statement'),
    'success'
  );

  RETURN QUERY SELECT true, 'Payment successfully reconciled and tournament reservation confirmed'::TEXT, v_part_id, p_order_id, 'paid'::TEXT;
END;
$$;

-- Secure Permissions
REVOKE ALL ON FUNCTION public.reconcile_and_confirm_payment(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_and_confirm_payment(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_and_confirm_payment(UUID, TEXT, TEXT, TEXT) TO service_role;
