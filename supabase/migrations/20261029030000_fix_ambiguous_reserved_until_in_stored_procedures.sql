-- ============================================================================
-- Migration: 20261029030000_fix_ambiguous_reserved_until_in_stored_procedures.sql
-- Description:
-- Resolves "column reference 'reserved_until' is ambiguous" (and related output parameter
-- collisions like 'participant_id' and 'tournament_id') in PL/pgSQL stored procedures.
--
-- Adds `#variable_conflict use_column` and explicit table qualifications in:
-- 1. public.reserve_tournament_slot
-- 2. public.confirm_tournament_reservation
-- 3. public.reconcile_tournament_slots
-- ============================================================================

-- 1. Reserve tournament slot
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
#variable_conflict use_column
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
  SELECT t.id, t.name, t.status, t.max_participants, t.confirmed_slots_count, t.reserved_slots_count, 
         t.entry_fee_paise, t.currency, t.is_paid, t.registration_deadline
  INTO v_tourn
  FROM public.tournaments t
  WHERE t.id = p_tournament_id
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
    UPDATE public.tournament_registrations target
    SET status = 'expired',
        updated_at = timezone('utc', now())
    WHERE target.tournament_id = p_tournament_id
      AND target.status = 'pending_payment'
      AND target.reserved_until < timezone('utc', now())
    RETURNING target.id
  )
  SELECT count(*) INTO v_expired_count FROM expired_rows;

  IF v_expired_count > 0 THEN
    UPDATE public.tournaments t
    SET reserved_slots_count = GREATEST(0, t.reserved_slots_count - v_expired_count),
        updated_at = timezone('utc', now())
    WHERE t.id = p_tournament_id;
    
    v_tourn.reserved_slots_count := GREATEST(0, v_tourn.reserved_slots_count - v_expired_count);
  END IF;

  -- 5. Check if user already has an active registration
  SELECT tr.id, tr.status, tr.reserved_until INTO v_existing_active
  FROM public.tournament_registrations tr
  WHERE tr.tournament_id = p_tournament_id
    AND tr.user_id = p_user_id
    AND tr.status IN ('pending_payment', 'confirmed');

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
  ) RETURNING public.tournament_registrations.id INTO v_new_reg_id;

  -- Increment reserved slots counter
  UPDATE public.tournaments t
  SET reserved_slots_count = t.reserved_slots_count + 1,
      updated_at = timezone('utc', now())
  WHERE t.id = p_tournament_id;

  RETURN QUERY SELECT v_new_reg_id, true, 'Slot successfully reserved'::TEXT, v_res_until;
END;
$$;

-- 2. Confirm tournament reservation
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
#variable_conflict use_column
DECLARE
  v_reg RECORD;
  v_tourn RECORD;
  v_part_id UUID := p_participant_id;
BEGIN
  -- Strict Authorization Guard: Only service_role, postgres, or verified platform administrator can invoke confirmation
  IF current_user NOT IN ('postgres', 'service_role') 
     AND COALESCE(auth.jwt() ->> 'role', '') != 'service_role' 
     AND NOT public.is_admin() THEN
    RETURN QUERY SELECT false, 'Unauthorized: Privileged confirmation requires service_role or administrator privilege'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- 1. Lock the registration row
  SELECT tr.id, tr.tournament_id, tr.user_id, tr.status, tr.participant_id, tr.reserved_until
  INTO v_reg
  FROM public.tournament_registrations tr
  WHERE tr.id = p_registration_id
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
  SELECT t.id, t.status, t.max_participants, t.confirmed_slots_count, t.reserved_slots_count
  INTO v_tourn
  FROM public.tournaments t
  WHERE t.id = v_reg.tournament_id
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
    UPDATE public.tournaments t
    SET confirmed_slots_count = t.confirmed_slots_count + 1,
        updated_at = timezone('utc', now())
    WHERE t.id = v_reg.tournament_id;
  ELSIF v_reg.status = 'pending_payment' THEN
    -- Normal hold conversion: decrement reserved, increment confirmed
    UPDATE public.tournaments t
    SET reserved_slots_count = GREATEST(0, t.reserved_slots_count - 1),
        confirmed_slots_count = t.confirmed_slots_count + 1,
        updated_at = timezone('utc', now())
    WHERE t.id = v_reg.tournament_id;
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
    ) RETURNING public.participants.id INTO v_part_id;
  END IF;

  -- 6. Update registration record to confirmed
  UPDATE public.tournament_registrations tr
  SET status = 'confirmed',
      confirmed_at = timezone('utc', now()),
      participant_id = COALESCE(v_part_id, v_reg.participant_id),
      updated_at = timezone('utc', now())
  WHERE tr.id = p_registration_id;

  RETURN QUERY SELECT true, 'Registration successfully confirmed'::TEXT, v_part_id;
END;
$$;

-- 3. Reconcile tournament slots
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
#variable_conflict use_column
DECLARE
  v_confirmed INT;
  v_reserved INT;
  v_max INT;
BEGIN
  -- First release any expired holds
  PERFORM public.release_expired_reservations(p_tournament_id);

  -- Count actual active/confirmed participants
  SELECT count(*) INTO v_confirmed
  FROM public.participants p
  WHERE p.tournament_id = p_tournament_id
    AND p.status IN ('active', 'registered', 'checked_in', 'eliminated');

  -- Count active unexpired reservations
  SELECT count(*) INTO v_reserved
  FROM public.tournament_registrations tr
  WHERE tr.tournament_id = p_tournament_id
    AND tr.status = 'pending_payment'
    AND tr.reserved_until >= timezone('utc', now());

  SELECT t.max_participants INTO v_max
  FROM public.tournaments t
  WHERE t.id = p_tournament_id;

  -- Update the tournament row atomically
  UPDATE public.tournaments t
  SET confirmed_slots_count = v_confirmed,
      reserved_slots_count = v_reserved,
      updated_at = timezone('utc', now())
  WHERE t.id = p_tournament_id;

  RETURN QUERY SELECT p_tournament_id, v_confirmed, v_reserved, v_max;
END;
$$;

-- Explicitly re-affirm permissions
REVOKE ALL ON FUNCTION public.reserve_tournament_slot(UUID, UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_tournament_slot(UUID, UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_tournament_slot(UUID, UUID, INT) TO service_role;

REVOKE ALL ON FUNCTION public.confirm_tournament_reservation(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_tournament_reservation(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.reconcile_tournament_slots(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_tournament_slots(UUID) TO service_role;
