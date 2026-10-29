-- ============================================================================
-- Migration: 20261027020000_harden_billing_function_authorization.sql
-- Description:
-- Milestone 1.1 - Step 1: PostgreSQL Authorization Hardening
--
-- 1. Redefine public.confirm_tournament_reservation(...) with defense-in-depth
--    caller authorization (restricted to service_role, postgres, and verified administrators).
-- 2. Redefine public.reconcile_tournament_slots(...) with caller authorization
--    (restricted to service_role, postgres, and verified administrators).
-- 3. Redefine public.release_expired_reservations(...) with caller authorization
--    (restricted to service_role, postgres, and verified administrators).
-- 4. Revoke inappropriate EXECUTE privileges from PUBLIC, anon, and authenticated
--    on all privileged billing and reconciliation procedures.
-- 5. Explicitly grant EXECUTE only to service_role (and authenticated on reserve_tournament_slot).
-- 6. Harden direct client INSERT policy on public.payment_refund_requests to WITH CHECK (false),
--    completely denying unauthorized client insertions while preserving trusted server-side execution.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Redefine confirm_tournament_reservation with Defense-in-Depth Authorization
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
    IF v_tourn.confirmed_slots_count >= v_tourn.max_participants THEN
      RETURN QUERY SELECT false, 'Tournament capacity reached after hold expired. Payment queued for refund.'::TEXT, NULL::UUID;
      RETURN;
    END IF;
    UPDATE public.tournaments
    SET confirmed_slots_count = confirmed_slots_count + 1,
        updated_at = timezone('utc', now())
    WHERE id = v_reg.tournament_id;
  ELSIF v_reg.status = 'pending_payment' THEN
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

-- ----------------------------------------------------------------------------
-- 2. Redefine reconcile_tournament_slots with Caller Authorization Guard
-- ----------------------------------------------------------------------------
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
  -- Strict Authorization Guard: Only service_role, postgres, or verified administrator can reconcile slots
  IF current_user NOT IN ('postgres', 'service_role') 
     AND COALESCE(auth.jwt() ->> 'role', '') != 'service_role' 
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Reconcile tournament slots requires service_role or administrator privilege';
  END IF;

  -- First release any expired holds (internal function call under SECURITY DEFINER)
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

-- ----------------------------------------------------------------------------
-- 3. Redefine release_expired_reservations with Caller Authorization Guard
-- ----------------------------------------------------------------------------
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
  -- Strict Authorization Guard: Only internal postgres execution, service_role, or verified administrator
  IF current_user NOT IN ('postgres', 'service_role') 
     AND COALESCE(auth.jwt() ->> 'role', '') != 'service_role' 
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Release expired reservations requires service_role or administrator privilege';
  END IF;

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

-- ----------------------------------------------------------------------------
-- 4. Revoke Inappropriate EXECUTE Privileges & Grant Strictly to Minimum Roles
-- ----------------------------------------------------------------------------

-- A. confirm_tournament_reservation: strictly service_role only (no public, anon, or authenticated)
REVOKE ALL ON FUNCTION public.confirm_tournament_reservation(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_tournament_reservation(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;

-- B. reconcile_tournament_slots: strictly service_role only (no public, anon, or authenticated)
REVOKE ALL ON FUNCTION public.reconcile_tournament_slots(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_tournament_slots(UUID) TO service_role;

-- C. release_expired_reservations: strictly service_role only (no public, anon, or authenticated)
REVOKE ALL ON FUNCTION public.release_expired_reservations(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_reservations(UUID) TO service_role;

-- D. reserve_tournament_slot: authenticated users and service_role (strictly revoke anon and PUBLIC)
REVOKE ALL ON FUNCTION public.reserve_tournament_slot(UUID, UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_tournament_slot(UUID, UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_tournament_slot(UUID, UUID, INT) TO service_role;

-- ----------------------------------------------------------------------------
-- 5. Harden Refund Request Authorization
-- Restrict direct client INSERT on payment_refund_requests to WITH CHECK (false),
-- completely denying unauthorized client insertions while preserving trusted server-side execution.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'payment_refund_requests' AND policyname = 'Users can insert own refund requests'
  ) THEN
    ALTER POLICY "Users can insert own refund requests" 
      ON public.payment_refund_requests 
      WITH CHECK (false);
  END IF;
END $$;
