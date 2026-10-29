-- ============================================================================
-- Migration: 20261027010000_tournament_billing_and_razorpay_ledger.sql
-- Description:
-- 1. Add tournament billing & slot reservation columns to public.tournaments
-- 2. Ensure user_id column and foreign key on public.participants
-- 3. Create tournament_registrations table with 12-minute reservation hold
-- 4. Create payment_orders table for Razorpay order lifecycle tracking
-- 5. Create payment_transactions table for captured & verified payments
-- 6. Create payment_refund_requests table for admin-reviewed refunds
-- 7. Create payment_webhook_events table for webhook idempotency & replay protection
-- 8. Create atomic concurrency-safe stored procedures:
--    - reserve_tournament_slot
--    - confirm_tournament_reservation
--    - release_expired_reservations
--    - reconcile_tournament_slots
-- 9. Configure strict Row Level Security (RLS) on all billing and payment tables
-- ============================================================================

-- 1. Ensure user_id exists on public.participants for user dashboard association
ALTER TABLE public.participants 
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_participants_user_id 
  ON public.participants(user_id);

-- 2. Add billing, pricing, and reservation counters to public.tournaments
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS is_paid BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS entry_fee_paise BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS prize_pool_paise BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reserved_slots_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confirmed_slots_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS registration_deadline TIMESTAMPTZ;

-- Reconcile confirmed_slots_count for existing tournaments before adding checks
UPDATE public.tournaments t
SET confirmed_slots_count = (
  SELECT count(*) 
  FROM public.participants p 
  WHERE p.tournament_id = t.id 
    AND p.status IN ('active', 'registered', 'checked_in', 'eliminated')
)
WHERE confirmed_slots_count = 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_tournaments_entry_fee'
  ) THEN
    ALTER TABLE public.tournaments
      ADD CONSTRAINT chk_tournaments_entry_fee CHECK (entry_fee_paise >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_tournaments_prize_pool'
  ) THEN
    ALTER TABLE public.tournaments
      ADD CONSTRAINT chk_tournaments_prize_pool CHECK (prize_pool_paise >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_tournaments_slots'
  ) THEN
    ALTER TABLE public.tournaments
      ADD CONSTRAINT chk_tournaments_slots 
      CHECK (confirmed_slots_count >= 0 AND reserved_slots_count >= 0 AND (confirmed_slots_count + reserved_slots_count) <= max_participants);
  END IF;
END $$;

-- 3. Tournament Registrations Table (Lifecycle: pending_payment -> confirmed / expired / cancelled / refunded)
CREATE TABLE IF NOT EXISTS public.tournament_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  participant_id UUID REFERENCES public.participants(id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending_payment',
  amount_paise BIGINT NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  reserved_until TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT chk_registration_status CHECK (status IN ('pending_payment', 'confirmed', 'expired', 'cancelled', 'refunded')),
  CONSTRAINT chk_registration_amount CHECK (amount_paise >= 0)
);

CREATE INDEX IF NOT EXISTS idx_registrations_user_tourn 
  ON public.tournament_registrations(user_id, tournament_id);

CREATE INDEX IF NOT EXISTS idx_registrations_pending 
  ON public.tournament_registrations(status, reserved_until) 
  WHERE status = 'pending_payment';

-- Crucial: Unique partial index to prevent more than one active (pending or confirmed) registration per user per tournament
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_tournament_registration
  ON public.tournament_registrations (tournament_id, user_id)
  WHERE status IN ('pending_payment', 'confirmed');

-- 4. Payment Orders Table (Razorpay Order Mapping)
CREATE TABLE IF NOT EXISTS public.payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL REFERENCES public.tournament_registrations(id) ON DELETE RESTRICT,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  razorpay_order_id VARCHAR(100) NOT NULL UNIQUE,
  amount_paise BIGINT NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  status VARCHAR(30) NOT NULL DEFAULT 'created',
  receipt VARCHAR(100) NOT NULL UNIQUE,
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT chk_order_amount CHECK (amount_paise > 0),
  CONSTRAINT chk_order_status CHECK (status IN ('created', 'attempted', 'paid', 'failed', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_rzp_id 
  ON public.payment_orders(razorpay_order_id);

CREATE INDEX IF NOT EXISTS idx_payment_orders_registration_id 
  ON public.payment_orders(registration_id);

-- 5. Payment Transactions Table (Captured & Verified Payments)
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.payment_orders(id) ON DELETE RESTRICT,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  razorpay_payment_id VARCHAR(100) NOT NULL UNIQUE,
  razorpay_signature VARCHAR(255) NOT NULL,
  amount_paise BIGINT NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  status VARCHAR(30) NOT NULL DEFAULT 'captured',
  payment_method VARCHAR(50),
  bank_reference VARCHAR(100),
  error_code VARCHAR(100),
  error_description TEXT,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT chk_tx_amount CHECK (amount_paise > 0),
  CONSTRAINT chk_tx_status CHECK (status IN ('captured', 'failed', 'refunded', 'partially_refunded'))
);

CREATE INDEX IF NOT EXISTS idx_payment_tx_payment_id 
  ON public.payment_transactions(razorpay_payment_id);

CREATE INDEX IF NOT EXISTS idx_payment_tx_order_id 
  ON public.payment_transactions(order_id);

-- 6. Payment Refund Requests Table (Admin Review & Tracking)
CREATE TABLE IF NOT EXISTS public.payment_refund_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES public.payment_transactions(id) ON DELETE RESTRICT,
  order_id UUID NOT NULL REFERENCES public.payment_orders(id) ON DELETE RESTRICT,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  amount_paise BIGINT NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  reason TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending_review',
  admin_notes TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  razorpay_refund_id VARCHAR(100) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT chk_refund_amount CHECK (amount_paise > 0),
  CONSTRAINT chk_refund_status CHECK (status IN ('pending_review', 'approved', 'rejected', 'processed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_refund_req_tx_id 
  ON public.payment_refund_requests(transaction_id);

CREATE INDEX IF NOT EXISTS idx_refund_req_status 
  ON public.payment_refund_requests(status);

-- 7. Payment Webhook Events Table (Idempotency & Replay Protection)
CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id VARCHAR(100) NOT NULL UNIQUE,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'processed',
  processed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id 
  ON public.payment_webhook_events(event_id);

-- 8. Stored Procedures for Concurrency-Safe Reservations

-- Procedure A: Reserve a tournament slot (12 minutes hold)
CREATE OR REPLACE FUNCTION public.reserve_tournament_slot(
  p_tournament_id UUID,
  p_user_id UUID,
  p_hold_duration_minutes INT DEFAULT 12
)
RETURNS TABLE (
  registration_id UUID,
  success BOOLEAN,
  message TEXT,
  reserved_until TIMESTAMPTZ
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_is_admin BOOLEAN;
  v_tourn RECORD;
  v_expired_count INT;
  v_existing_active RECORD;
  v_new_reg_id UUID;
  v_res_until TIMESTAMPTZ;
BEGIN
  v_caller_id := auth.uid();
  v_is_admin := public.is_admin();

  -- Security check: Caller must be authenticated and cannot act on behalf of another user unless admin
  IF v_caller_id IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, false, 'Authentication required to reserve a slot'::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  IF v_caller_id != p_user_id AND NOT v_is_admin THEN
    RETURN QUERY SELECT NULL::UUID, false, 'Unauthorized: Cannot reserve slot for another user'::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- 1. Lock tournament row for concurrency control
  SELECT id, name, status, max_participants, confirmed_slots_count, reserved_slots_count, 
         entry_fee_paise, currency, is_paid, registration_deadline
  INTO v_tourn
  FROM public.tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::UUID, false, 'Tournament not found'::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- 2. Validate tournament status
  IF v_tourn.status != 'registration' THEN
    RETURN QUERY SELECT NULL::UUID, false, ('Tournament registration is not open (status: ' || v_tourn.status || ')')::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- 3. Validate registration deadline if set
  IF v_tourn.registration_deadline IS NOT NULL AND timezone('utc', now()) > v_tourn.registration_deadline THEN
    RETURN QUERY SELECT NULL::UUID, false, 'Tournament registration deadline has passed'::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- 4. Clean up any expired reservations for this tournament to free up slots
  WITH expired_rows AS (
    UPDATE public.tournament_registrations
    SET status = 'expired',
        updated_at = timezone('utc', now())
    WHERE tournament_id = p_tournament_id
      AND status = 'pending_payment'
      AND reserved_until < timezone('utc', now())
    RETURNING id
  )
  SELECT count(*) INTO v_expired_count FROM expired_rows;

  IF v_expired_count > 0 THEN
    UPDATE public.tournaments
    SET reserved_slots_count = GREATEST(0, reserved_slots_count - v_expired_count),
        updated_at = timezone('utc', now())
    WHERE id = p_tournament_id;
    
    v_tourn.reserved_slots_count := GREATEST(0, v_tourn.reserved_slots_count - v_expired_count);
  END IF;

  -- 5. Check if user already has an active registration
  SELECT id, status, reserved_until INTO v_existing_active
  FROM public.tournament_registrations
  WHERE tournament_id = p_tournament_id
    AND user_id = p_user_id
    AND status IN ('pending_payment', 'confirmed');

  IF v_existing_active.id IS NOT NULL THEN
    IF v_existing_active.status = 'confirmed' THEN
      RETURN QUERY SELECT v_existing_active.id, false, 'User is already registered for this tournament'::TEXT, NULL::TIMESTAMPTZ;
      RETURN;
    ELSE
      -- User already has an active pending reservation that has not expired
      RETURN QUERY SELECT v_existing_active.id, true, 'Active reservation found'::TEXT, v_existing_active.reserved_until;
      RETURN;
    END IF;
  END IF;

  -- 6. Check capacity
  IF (v_tourn.confirmed_slots_count + v_tourn.reserved_slots_count) >= v_tourn.max_participants THEN
    RETURN QUERY SELECT NULL::UUID, false, 'Tournament is full. No slots available.'::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- 7. Create 12-minute reservation hold
  v_res_until := timezone('utc', now()) + (p_hold_duration_minutes || ' minutes')::INTERVAL;

  INSERT INTO public.tournament_registrations (
    tournament_id,
    user_id,
    status,
    amount_paise,
    currency,
    reserved_until
  ) VALUES (
    p_tournament_id,
    p_user_id,
    'pending_payment',
    v_tourn.entry_fee_paise,
    v_tourn.currency,
    v_res_until
  ) RETURNING id INTO v_new_reg_id;

  -- Increment reserved slots counter
  UPDATE public.tournaments
  SET reserved_slots_count = reserved_slots_count + 1,
      updated_at = timezone('utc', now())
  WHERE id = p_tournament_id;

  RETURN QUERY SELECT v_new_reg_id, true, 'Slot successfully reserved'::TEXT, v_res_until;
END;
$$;

-- Procedure B: Confirm tournament reservation (converts pending hold to confirmed participant)
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
DECLARE
  v_reg RECORD;
  v_tourn RECORD;
  v_part_id UUID := p_participant_id;
BEGIN
  -- 1. Lock the registration row
  SELECT id, tournament_id, user_id, status, participant_id, reserved_until
  INTO v_reg
  FROM public.tournament_registrations
  WHERE id = p_registration_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Registration record not found'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- 2. Idempotency check: if already confirmed, return success immediately
  IF v_reg.status = 'confirmed' THEN
    RETURN QUERY SELECT true, 'Registration is already confirmed'::TEXT, v_reg.participant_id;
    RETURN;
  END IF;

  -- 3. Lock the tournament row
  SELECT id, status, max_participants, confirmed_slots_count, reserved_slots_count
  INTO v_tourn
  FROM public.tournaments
  WHERE id = v_reg.tournament_id
  FOR UPDATE;

  -- 4. Check status and handle late payment arriving after hold expiration
  IF v_reg.status = 'expired' THEN
    -- Check if tournament still has capacity for late payment confirmation
    IF v_tourn.confirmed_slots_count >= v_tourn.max_participants THEN
      -- Tournament filled up while payment was in transit!
      RETURN QUERY SELECT false, 'Tournament capacity reached after hold expired. Payment queued for refund.'::TEXT, NULL::UUID;
      RETURN;
    END IF;
    -- Capacity is available: proceed to confirm late payment!
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

  -- 5. Create or link participant record if needed
  IF v_part_id IS NULL AND p_username IS NOT NULL THEN
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

  -- 6. Update registration record to confirmed
  UPDATE public.tournament_registrations
  SET status = 'confirmed',
      confirmed_at = timezone('utc', now()),
      participant_id = COALESCE(v_part_id, v_reg.participant_id),
      updated_at = timezone('utc', now())
  WHERE id = p_registration_id;

  RETURN QUERY SELECT true, 'Registration successfully confirmed'::TEXT, v_part_id;
END;
$$;

-- Procedure C: Release expired reservations across all tournaments or a specific tournament
CREATE OR REPLACE FUNCTION public.release_expired_reservations(
  p_tournament_id UUID DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_released_count INT := 0;
  v_tourn RECORD;
BEGIN
  -- Mark all expired pending registrations as 'expired'
  WITH expired_rows AS (
    UPDATE public.tournament_registrations
    SET status = 'expired',
        updated_at = timezone('utc', now())
    WHERE (p_tournament_id IS NULL OR tournament_id = p_tournament_id)
      AND status = 'pending_payment'
      AND reserved_until < timezone('utc', now())
    RETURNING tournament_id
  )
  SELECT count(*) INTO v_released_count FROM expired_rows;

  -- Re-sync reserved_slots_count for affected tournaments
  FOR v_tourn IN 
    SELECT DISTINCT t.id
    FROM public.tournaments t
    WHERE (p_tournament_id IS NULL OR t.id = p_tournament_id)
  LOOP
    UPDATE public.tournaments
    SET reserved_slots_count = (
      SELECT count(*)
      FROM public.tournament_registrations
      WHERE tournament_id = v_tourn.id
        AND status = 'pending_payment'
        AND reserved_until >= timezone('utc', now())
    ),
    updated_at = timezone('utc', now())
    WHERE id = v_tourn.id;
  END LOOP;

  RETURN v_released_count;
END;
$$;

-- Procedure D: Reconcile tournament slots (audit & verify slot counters against actual participants & holds)
CREATE OR REPLACE FUNCTION public.reconcile_tournament_slots(
  p_tournament_id UUID
)
RETURNS TABLE (
  tournament_id UUID,
  confirmed_count INT,
  reserved_count INT,
  max_participants INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_confirmed INT;
  v_reserved INT;
  v_max INT;
BEGIN
  -- First release any expired holds
  PERFORM public.release_expired_reservations(p_tournament_id);

  -- Count actual active/confirmed participants
  SELECT count(*) INTO v_confirmed
  FROM public.participants
  WHERE tournament_id = p_tournament_id
    AND status IN ('active', 'registered', 'checked_in', 'eliminated');

  -- Count active unexpired reservations
  SELECT count(*) INTO v_reserved
  FROM public.tournament_registrations
  WHERE tournament_id = p_tournament_id
    AND status = 'pending_payment'
    AND reserved_until >= timezone('utc', now());

  SELECT tournaments.max_participants INTO v_max
  FROM public.tournaments
  WHERE id = p_tournament_id;

  -- Update the tournament row atomically
  UPDATE public.tournaments
  SET confirmed_slots_count = v_confirmed,
      reserved_slots_count = v_reserved,
      updated_at = timezone('utc', now())
  WHERE id = p_tournament_id;

  RETURN QUERY SELECT p_tournament_id, v_confirmed, v_reserved, v_max;
END;
$$;

-- Revoke default public execution privileges and grant strictly
REVOKE ALL ON FUNCTION public.reserve_tournament_slot(UUID, UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_tournament_slot(UUID, UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_tournament_slot(UUID, UUID, INT) TO service_role;

REVOKE ALL ON FUNCTION public.confirm_tournament_reservation(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_tournament_reservation(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_tournament_reservation(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.release_expired_reservations(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_expired_reservations(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_reservations(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.reconcile_tournament_slots(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_tournament_slots(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_tournament_slots(UUID) TO service_role;

-- 9. Row Level Security Policies

-- Table: public.tournament_registrations
ALTER TABLE public.tournament_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own registrations" ON public.tournament_registrations;
CREATE POLICY "Users can read own registrations"
  ON public.tournament_registrations FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can read all registrations" ON public.tournament_registrations;
CREATE POLICY "Admins can read all registrations"
  ON public.tournament_registrations FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can update registrations" ON public.tournament_registrations;
CREATE POLICY "Admins can update registrations"
  ON public.tournament_registrations FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Table: public.payment_orders
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own payment orders" ON public.payment_orders;
CREATE POLICY "Users can read own payment orders"
  ON public.payment_orders FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can read all payment orders" ON public.payment_orders;
CREATE POLICY "Admins can read all payment orders"
  ON public.payment_orders FOR SELECT TO authenticated
  USING (public.is_admin());

-- Table: public.payment_transactions
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own payment transactions" ON public.payment_transactions;
CREATE POLICY "Users can read own payment transactions"
  ON public.payment_transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can read all payment transactions" ON public.payment_transactions;
CREATE POLICY "Admins can read all payment transactions"
  ON public.payment_transactions FOR SELECT TO authenticated
  USING (public.is_admin());

-- Table: public.payment_refund_requests
ALTER TABLE public.payment_refund_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own refund requests" ON public.payment_refund_requests;
CREATE POLICY "Users can read own refund requests"
  ON public.payment_refund_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own refund requests" ON public.payment_refund_requests;
CREATE POLICY "Users can insert own refund requests"
  ON public.payment_refund_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage refund requests" ON public.payment_refund_requests;
CREATE POLICY "Admins can manage refund requests"
  ON public.payment_refund_requests FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Table: public.payment_webhook_events
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read webhook events" ON public.payment_webhook_events;
CREATE POLICY "Admins can read webhook events"
  ON public.payment_webhook_events FOR SELECT TO authenticated
  USING (public.is_admin());
