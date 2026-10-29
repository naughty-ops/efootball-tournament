-- ============================================================================
-- Migration: 20261027030000_bind_payment_verification_to_reservation.sql
-- Description:
-- Database-Enforced Payment-Verification Binding for Tournament Reservations
--
-- 1. Add payment_transaction_id to public.tournament_registrations with foreign key.
-- 2. Add partial unique index to guarantee no payment transaction can ever be
--    consumed by more than one tournament registration.
-- 3. Add partial unique index on public.payment_transactions ensuring only one
--    captured transaction per payment order.
-- 4. Define authoritative 6-argument public.confirm_tournament_reservation(...) to strictly enforce:
--    - Caller must be service_role, internal postgres, or platform administrator.
--    - For paid tournaments: requires valid captured payment transaction.
--    - Transaction user_id must match registration user_id.
--    - Transaction tournament_id must match registration tournament_id.
--    - Transaction order_id must link to this exact registration_id.
--    - Amount in integer paise and currency must match expected values.
--    - Cannot reuse previously consumed payment transactions.
--    - Free tournaments do not require transactions and cannot be spoofed.
--    - Late payments arriving when tournament is full automatically queue a refund request.
--    - Idempotent repeated confirmations preserve existing invariants.
-- 5. Define 5-argument backwards-compatibility wrapper delegating to the 6-argument function.
-- 6. Revoke inappropriate privileges from PUBLIC, anon, authenticated; grant strictly to service_role.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Schema Extensions for Payment Binding
-- ----------------------------------------------------------------------------

-- Add payment_transaction_id column to tournament_registrations
ALTER TABLE public.tournament_registrations
  ADD COLUMN IF NOT EXISTS payment_transaction_id UUID REFERENCES public.payment_transactions(id) ON DELETE RESTRICT;

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_registrations_payment_tx_id 
  ON public.tournament_registrations(payment_transaction_id);

-- Invariant: A payment transaction cannot be consumed by more than one registration
CREATE UNIQUE INDEX IF NOT EXISTS idx_registrations_payment_tx_unique
  ON public.tournament_registrations (payment_transaction_id)
  WHERE payment_transaction_id IS NOT NULL;

-- Invariant: An order cannot have more than one captured transaction
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_tx_order_captured
  ON public.payment_transactions (order_id)
  WHERE status = 'captured';

-- ----------------------------------------------------------------------------
-- 2. Authoritative 6-Argument confirm_tournament_reservation
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_tournament_reservation(
  p_registration_id UUID,
  p_payment_transaction_id UUID,
  p_participant_id UUID,
  p_username TEXT,
  p_real_name TEXT,
  p_contact_info TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  participant_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_reg RECORD;
  v_tourn RECORD;
  v_tx RECORD;
  v_order RECORD;
  v_other_reg RECORD;
  v_part_id UUID := p_participant_id;
BEGIN
  -- Strict Authorization Guard: Only service_role, postgres, or verified platform administrator
  IF current_user NOT IN ('postgres', 'service_role') 
     AND COALESCE(auth.jwt() ->> 'role', '') != 'service_role' 
     AND NOT public.is_admin() THEN
    RETURN QUERY SELECT false, 'Unauthorized: Privileged confirmation requires service_role or administrator privilege'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- 1. Lock the registration row (table-qualified to prevent RETURNS TABLE column collision)
  SELECT tr.id, tr.tournament_id, tr.user_id, tr.status, tr.participant_id, tr.payment_transaction_id, 
         tr.amount_paise, tr.currency, tr.reserved_until
  INTO v_reg
  FROM public.tournament_registrations tr
  WHERE tr.id = p_registration_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Registration record not found'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- 2. Lock the tournament row
  SELECT t.id, t.name, t.status, t.max_participants, t.confirmed_slots_count, t.reserved_slots_count,
         t.is_paid, t.entry_fee_paise, t.currency
  INTO v_tourn
  FROM public.tournaments t
  WHERE t.id = v_reg.tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Associated tournament record not found'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- 3. Idempotency Check: if already confirmed
  IF v_reg.status = 'confirmed' THEN
    IF (v_tourn.is_paid OR v_reg.amount_paise > 0) THEN
      IF p_payment_transaction_id IS NOT NULL AND v_reg.payment_transaction_id IS NOT NULL 
         AND v_reg.payment_transaction_id != p_payment_transaction_id THEN
        RETURN QUERY SELECT false, 'Registration is already confirmed with a different payment transaction'::TEXT, v_reg.participant_id;
        RETURN;
      END IF;
    END IF;
    RETURN QUERY SELECT true, 'Registration is already confirmed'::TEXT, v_reg.participant_id;
    RETURN;
  END IF;

  -- 4. Payment Verification Binding for Paid Tournaments
  IF (v_tourn.is_paid OR v_reg.amount_paise > 0) THEN
    -- Invariant: Must provide a payment transaction ID
    IF p_payment_transaction_id IS NULL THEN
      RETURN QUERY SELECT false, 'Payment transaction ID is required to confirm a paid tournament reservation'::TEXT, NULL::UUID;
      RETURN;
    END IF;

    -- Invariant: Transaction must exist and be locked
    SELECT pt.id, pt.order_id, pt.tournament_id, pt.user_id, pt.amount_paise, pt.currency, pt.status, pt.razorpay_payment_id
    INTO v_tx
    FROM public.payment_transactions pt
    WHERE pt.id = p_payment_transaction_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN QUERY SELECT false, 'Payment transaction record not found'::TEXT, NULL::UUID;
      RETURN;
    END IF;

    -- Invariant: Transaction status must be 'captured'
    IF v_tx.status != 'captured' THEN
      RETURN QUERY SELECT false, ('Payment transaction is not captured (status: ' || v_tx.status || ')')::TEXT, NULL::UUID;
      RETURN;
    END IF;

    -- Invariant: Transaction user_id must match registration user_id
    IF v_tx.user_id != v_reg.user_id THEN
      RETURN QUERY SELECT false, 'Payment transaction does not belong to the registering player'::TEXT, NULL::UUID;
      RETURN;
    END IF;

    -- Invariant: Transaction tournament_id must match registration tournament_id
    IF v_tx.tournament_id != v_reg.tournament_id THEN
      RETURN QUERY SELECT false, 'Payment transaction is for a different tournament'::TEXT, NULL::UUID;
      RETURN;
    END IF;

    -- Invariant: Order relationship validation
    SELECT po.id, po.registration_id, po.tournament_id, po.user_id, po.amount_paise, po.currency, po.status
    INTO v_order
    FROM public.payment_orders po
    WHERE po.id = v_tx.order_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN QUERY SELECT false, 'Payment order associated with transaction not found'::TEXT, NULL::UUID;
      RETURN;
    END IF;

    -- Invariant: Order must be bound to this exact registration
    IF v_order.registration_id != p_registration_id THEN
      RETURN QUERY SELECT false, 'Payment order is linked to a different registration'::TEXT, NULL::UUID;
      RETURN;
    END IF;

    -- Invariant: Amount in paise must match expected fee
    IF v_tx.amount_paise != v_reg.amount_paise OR v_tx.amount_paise < v_tourn.entry_fee_paise THEN
      RETURN QUERY SELECT false, ('Payment amount mismatch: expected ' || v_reg.amount_paise || ' paise, got ' || v_tx.amount_paise || ' paise')::TEXT, NULL::UUID;
      RETURN;
    END IF;

    -- Invariant: Currency must match
    IF v_tx.currency != v_reg.currency OR v_tx.currency != v_tourn.currency THEN
      RETURN QUERY SELECT false, ('Payment currency mismatch: expected ' || v_reg.currency || ', got ' || v_tx.currency)::TEXT, NULL::UUID;
      RETURN;
    END IF;

    -- Invariant: Payment must not be consumed by another confirmed reservation
    SELECT tr2.id INTO v_other_reg
    FROM public.tournament_registrations tr2
    WHERE tr2.payment_transaction_id = p_payment_transaction_id
      AND tr2.id != p_registration_id
      AND tr2.status = 'confirmed';

    IF v_other_reg.id IS NOT NULL THEN
      RETURN QUERY SELECT false, 'Payment transaction has already been consumed by another confirmed reservation'::TEXT, NULL::UUID;
      RETURN;
    END IF;
  ELSE
    -- Free tournament check: Ensure a paid tournament cannot be confirmed via free path
    IF v_tourn.is_paid OR v_tourn.entry_fee_paise > 0 THEN
      RETURN QUERY SELECT false, 'Cannot confirm paid tournament through free registration pathway'::TEXT, NULL::UUID;
      RETURN;
    END IF;
  END IF;

  -- 5. Handle Status Transitions & Slot Counters
  IF v_reg.status = 'expired' THEN
    -- Check if tournament has capacity for late payment confirmation
    IF v_tourn.confirmed_slots_count >= v_tourn.max_participants THEN
      -- Tournament filled up while payment was in transit -> automatically queue refund request!
      IF p_payment_transaction_id IS NOT NULL THEN
        INSERT INTO public.payment_refund_requests (
          transaction_id,
          order_id,
          tournament_id,
          user_id,
          amount_paise,
          currency,
          reason,
          status,
          admin_notes
        ) VALUES (
          v_tx.id,
          v_tx.order_id,
          v_tx.tournament_id,
          v_tx.user_id,
          v_tx.amount_paise,
          v_tx.currency,
          'Late payment received after 12-minute reservation hold expired and tournament capacity reached.',
          'pending_review',
          'Automated queue from confirm_tournament_reservation: tournament full.'
        );
      END IF;

      RETURN QUERY SELECT false, 'Tournament capacity reached after hold expired. Payment queued for refund.'::TEXT, NULL::UUID;
      RETURN;
    END IF;

    -- Late payment but tournament has open slot: confirm!
    UPDATE public.tournaments
    SET confirmed_slots_count = confirmed_slots_count + 1,
        updated_at = timezone('utc', now())
    WHERE id = v_reg.tournament_id;

  ELSIF v_reg.status = 'pending_payment' THEN
    -- Normal hold conversion: decrement reserved, increment confirmed
    UPDATE public.tournaments
    SET reserved_slots_count = GREATEST(0, reserved_slots_count - 1),
        confirmed_slots_count = confirmed_slots_count + 1,
        updated_at = timezone('utc', now())
    WHERE id = v_reg.tournament_id;
  ELSE
    RETURN QUERY SELECT false, ('Cannot confirm registration with status: ' || v_reg.status)::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- 6. Create or link participant record
  IF v_part_id IS NULL AND p_username IS NOT NULL THEN
    -- Check if participant username is already in tournament to avoid duplicates
    SELECT p.id INTO v_part_id
    FROM public.participants p
    WHERE p.tournament_id = v_reg.tournament_id
      AND (
        (p.user_id IS NOT NULL AND p.user_id = v_reg.user_id)
        OR LOWER(p.username) = LOWER(p_username)
      )
    LIMIT 1;

    IF v_part_id IS NULL THEN
      INSERT INTO public.participants (
        tournament_id,
        user_id,
        username,
        real_name,
        contact_info,
        status
      ) VALUES (
        v_reg.tournament_id,
        v_reg.user_id,
        p_username,
        p_real_name,
        p_contact_info,
        'active'
      ) RETURNING id INTO v_part_id;
    END IF;
  END IF;

  -- 7. Update registration record with confirmed status and bound payment transaction
  UPDATE public.tournament_registrations
  SET status = 'confirmed',
      confirmed_at = timezone('utc', now()),
      participant_id = COALESCE(v_part_id, v_reg.participant_id),
      payment_transaction_id = p_payment_transaction_id,
      updated_at = timezone('utc', now())
  WHERE id = p_registration_id;

  -- 8. If order exists, mark order as paid
  IF v_order.id IS NOT NULL AND v_order.status != 'paid' THEN
    UPDATE public.payment_orders
    SET status = 'paid',
        updated_at = timezone('utc', now())
    WHERE id = v_order.id;
  END IF;

  RETURN QUERY SELECT true, 'Registration successfully confirmed'::TEXT, v_part_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. 5-Argument Backwards-Compatibility Wrapper
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_tournament_reservation(
  p_registration_id UUID,
  p_participant_id UUID DEFAULT NULL,
  p_username TEXT DEFAULT NULL,
  p_real_name TEXT DEFAULT NULL,
  p_contact_info TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  participant_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  -- Delegate to the authoritative 6-argument payment-bound confirmation function
  RETURN QUERY SELECT * FROM public.confirm_tournament_reservation(
    p_registration_id,
    NULL::UUID, -- p_payment_transaction_id is NULL (will be rejected if tournament is paid)
    p_participant_id,
    p_username,
    p_real_name,
    p_contact_info
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Privileges & Role Lockdown
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.confirm_tournament_reservation(UUID, UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_tournament_reservation(UUID, UUID, UUID, TEXT, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.confirm_tournament_reservation(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_tournament_reservation(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;
