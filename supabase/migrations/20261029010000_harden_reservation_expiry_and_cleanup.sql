-- ============================================================================
-- Migration: 20261029010000_harden_reservation_expiry_and_cleanup.sql
-- Description:
-- Step 6: Hardened Automatic Cleanup of Expired Tournament Reservations
--
-- 1. Updates public.release_expired_reservations(p_tournament_id UUID DEFAULT NULL)
--    to ensure:
--    a. Uses database authoritative clock (timezone('utc', now())).
--    b. Only releases registrations with status = 'pending_payment' AND reserved_until < now().
--    c. Never releases reservations that already have a captured payment transaction
--       or whose registration status is 'confirmed'.
--    d. Uses row-level locks (FOR UPDATE SKIP LOCKED) on expired rows to prevent
--       concurrent workers from interfering with each other.
--    e. Updates associated payment_orders with status = 'created' to 'expired' consistently.
--    f. Recalculates and updates reserved_slots_count atomically, ensuring it cannot go negative (GREATEST(0, ...)).
--    g. Returns total released count safely.
-- 2. Maintains authorization restrictions: strictly restricted to service_role, postgres, and is_admin().
-- ============================================================================

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

  -- 1. Mark eligible expired pending registrations as 'expired'
  -- Invariant: Must NOT have a payment transaction (which indicates captured payment awaiting reconciliation)
  -- Invariant: Must NOT be confirmed
  -- Invariant: Must be strictly past authoritative database time
  WITH candidate_rows AS (
    SELECT tr.id, tr.tournament_id
    FROM public.tournament_registrations tr
    WHERE (p_tournament_id IS NULL OR tr.tournament_id = p_tournament_id)
      AND tr.status = 'pending_payment'
      AND tr.reserved_until < timezone('utc', now())
      AND tr.payment_transaction_id IS NULL
    FOR UPDATE SKIP LOCKED
  ),
  expired_rows AS (
    UPDATE public.tournament_registrations target
    SET status = 'expired',
        updated_at = timezone('utc', now())
    FROM candidate_rows c
    WHERE target.id = c.id
    RETURNING target.id, target.tournament_id
  )
  SELECT count(*) INTO v_released_count FROM expired_rows;

  -- 2. Update associated payment_orders status from 'created' to 'expired'
  UPDATE public.payment_orders po
  SET status = 'expired',
      updated_at = timezone('utc', now())
  FROM public.tournament_registrations tr
  WHERE po.registration_id = tr.id
    AND tr.status = 'expired'
    AND po.status = 'created'
    AND (p_tournament_id IS NULL OR po.tournament_id = p_tournament_id);

  -- 3. Atomically reconcile reserved_slots_count for all affected tournaments
  -- Acquires an exclusive row lock on public.tournaments (FOR UPDATE) to guarantee that
  -- concurrent reserve_tournament_slot transactions cannot be interleaved or overwritten.
  FOR v_tourn IN 
    SELECT t.id
    FROM public.tournaments t
    WHERE (p_tournament_id IS NULL OR t.id = p_tournament_id)
    ORDER BY t.id
    FOR UPDATE
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

-- Ensure execution privileges remain locked down
REVOKE ALL ON FUNCTION public.release_expired_reservations(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_reservations(UUID) TO service_role;
