-- ============================================================================
-- Migration: 20261101020000_create_payment_utr_claims_and_atomic_lease.sql
-- Description:
-- Phase 1 & Phase 3 Database Infrastructure:
--
-- 1. Creates public.payment_utr_claims ledger table:
--    - normalized_utr (PRIMARY KEY): Guarantees absolute B-Tree physical serialization.
--    - order_id: Foreign key to public.payment_orders(id).
--    - transaction_id: UUID of captured payment transaction.
--    - claimed_by: UUID of administrator who authorized the claim.
--    - claimed_at: Audit timestamp.
--    - Zero disruption to historical duplicate test references.
--
-- 2. Creates atomic webhook lease functions:
--    - public.acquire_webhook_processing_lease(p_event_id, p_event_type, p_payload, p_worker_token, p_lease_duration_seconds)
--    - public.complete_webhook_processing_lease(p_event_id, p_worker_token, p_final_status, p_error_payload)
--    - Guarantees single-query atomic lease takeover and prevents old workers from overwriting newer leases.
--
-- 3. Updates public.reconcile_and_confirm_payment RPC:
--    - Uses public.payment_utr_claims via INSERT ... ON CONFLICT DO NOTHING.
--    - Atomically updates order to 'refund_pending' and queues refund if capacity is full.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. UTR Claims Ledger Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_utr_claims (
  normalized_utr VARCHAR(64) PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.payment_orders(id) ON DELETE RESTRICT,
  transaction_id UUID NOT NULL,
  claimed_by UUID NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_utr_claims_order_id 
  ON public.payment_utr_claims(order_id);

ALTER TABLE public.payment_utr_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view UTR claims" ON public.payment_utr_claims;
CREATE POLICY "Admins can view UTR claims"
  ON public.payment_utr_claims FOR SELECT TO authenticated
  USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- 2. Extend payment_webhook_events with worker lease tracking
-- ----------------------------------------------------------------------------
ALTER TABLE public.payment_webhook_events
  ADD COLUMN IF NOT EXISTS worker_token VARCHAR(64),
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_webhook_events_worker_lease
  ON public.payment_webhook_events(event_id, worker_token);

-- ----------------------------------------------------------------------------
-- 3. Atomic Webhook Lease Acquisition Function
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.acquire_webhook_processing_lease(
  p_event_id VARCHAR(100),
  p_event_type VARCHAR(100),
  p_payload JSONB,
  p_worker_token VARCHAR(64),
  p_lease_duration_seconds INT DEFAULT 60
)
RETURNS TABLE (
  acquired BOOLEAN,
  is_duplicate BOOLEAN,
  current_status VARCHAR(20),
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_now TIMESTAMPTZ := timezone('utc', now());
  v_lease_expiry TIMESTAMPTZ := v_now + (p_lease_duration_seconds || ' seconds')::INTERVAL;
  v_row RECORD;
BEGIN
  -- 1. Attempt to insert new processing event atomically
  INSERT INTO public.payment_webhook_events (
    event_id,
    event_type,
    payload,
    status,
    worker_token,
    lease_expires_at,
    processed_at
  ) VALUES (
    p_event_id,
    p_event_type,
    p_payload,
    'processing',
    p_worker_token,
    v_lease_expiry,
    v_now
  )
  ON CONFLICT (event_id) DO NOTHING
  RETURNING id INTO v_row;

  IF FOUND THEN
    RETURN QUERY SELECT true, false, 'processing'::VARCHAR(20), 'Lease successfully acquired as new event'::TEXT;
    RETURN;
  END IF;

  -- 2. Event already exists: lock row to check status and claim lease if eligible
  SELECT pwe.id, pwe.status, pwe.worker_token, pwe.lease_expires_at
  INTO v_row
  FROM public.payment_webhook_events pwe
  WHERE pwe.event_id = p_event_id
  FOR UPDATE;

  -- If already processed: return duplicate confirmation immediately
  IF v_row.status = 'processed' THEN
    RETURN QUERY SELECT false, true, 'processed'::VARCHAR(20), 'Event already successfully processed'::TEXT;
    RETURN;
  END IF;

  -- If active lease held by another worker: reject concurrent execution
  IF v_row.status = 'processing' AND v_row.lease_expires_at > v_now THEN
    RETURN QUERY SELECT false, false, 'processing'::VARCHAR(20), 'Active lease currently held by another worker'::TEXT;
    RETURN;
  END IF;

  -- If lease expired or previously failed: atomically take over lease
  UPDATE public.payment_webhook_events
  SET status = 'processing',
      worker_token = p_worker_token,
      lease_expires_at = v_lease_expiry,
      processed_at = v_now,
      payload = p_payload
  WHERE id = v_row.id;

  RETURN QUERY SELECT true, false, 'processing'::VARCHAR(20), 'Stale or failed lease successfully reclaimed'::TEXT;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Atomic Webhook Lease Completion Function
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_webhook_processing_lease(
  p_event_id VARCHAR(100),
  p_worker_token VARCHAR(64),
  p_final_status VARCHAR(20), -- 'processed' | 'failed'
  p_error_payload JSONB DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_updated INT;
BEGIN
  -- Only update if worker_token matches current active lease owner
  UPDATE public.payment_webhook_events
  SET status = p_final_status,
      lease_expires_at = NULL,
      payload = CASE 
                  WHEN p_error_payload IS NOT NULL THEN payload || p_error_payload
                  ELSE payload 
                END,
      processed_at = timezone('utc', now())
  WHERE event_id = p_event_id
    AND worker_token = p_worker_token;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN (v_updated > 0);
END;
$$;

-- Permissions
REVOKE ALL ON FUNCTION public.acquire_webhook_processing_lease(VARCHAR, VARCHAR, JSONB, VARCHAR, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acquire_webhook_processing_lease(VARCHAR, VARCHAR, JSONB, VARCHAR, INT) TO service_role;

REVOKE ALL ON FUNCTION public.complete_webhook_processing_lease(VARCHAR, VARCHAR, VARCHAR, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_webhook_processing_lease(VARCHAR, VARCHAR, VARCHAR, JSONB) TO service_role;

-- ----------------------------------------------------------------------------
-- 5. Authoritative Atomic Reconciliation Stored Procedure
-- ----------------------------------------------------------------------------
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
  v_new_tx_id UUID := gen_random_uuid();
  v_part_id UUID := NULL;
  v_username TEXT;
  v_real_name TEXT;
  v_contact_info TEXT;
  v_claim_inserted RECORD;
BEGIN
  -- 1. Strict Owner Authorization Check
  IF NOT public.is_admin() THEN
    RETURN QUERY SELECT false, 'Unauthorized: Privileged reconciliation requires owner administrator privilege'::TEXT, NULL::UUID, p_order_id, 'unauthorized'::TEXT;
    RETURN;
  END IF;

  v_admin_id := auth.uid();
  v_admin_email := LOWER(TRIM(COALESCE(auth.jwt() ->> 'email', '')));

  -- 2. Lock & Validate Payment Order (SELECT FOR UPDATE)
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

  -- 3. Lock & Validate Registration (SELECT FOR UPDATE)
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

  -- 4. Lock & Validate Tournament (SELECT FOR UPDATE)
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

  -- 5. Handle Rejection Path
  IF p_decision = 'reject' THEN
    UPDATE public.payment_orders
    SET status = 'failed',
        manual_review_notes = 'Rejected by owner (' || v_admin_email || '): ' || COALESCE(p_admin_notes, 'No valid bank credit found.'),
        reconciled_at = timezone('utc', now()),
        reconciled_by = v_admin_id,
        updated_at = timezone('utc', now())
    WHERE id = v_order.id;

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

  -- 6. Financial Integrity Validations
  IF v_order.amount_paise != v_tourn.entry_fee_paise THEN
    RETURN QUERY SELECT false, ('Financial mismatch: Order amount (' || v_order.amount_paise || ' paise) does not match tournament entry fee (' || v_tourn.entry_fee_paise || ' paise)')::TEXT, NULL::UUID, p_order_id, 'amount_mismatch'::TEXT;
    RETURN;
  END IF;

  IF UPPER(v_order.currency) != 'INR' OR UPPER(v_tourn.currency) != 'INR' THEN
    RETURN QUERY SELECT false, 'Currency mismatch: Only INR is supported for manual reconciliation'::TEXT, NULL::UUID, p_order_id, 'currency_mismatch'::TEXT;
    RETURN;
  END IF;

  -- 7. Normalize Bank Reference (UTR)
  -- Strips all non-alphanumeric characters, converts to uppercase
  v_clean_utr := UPPER(REGEXP_REPLACE(COALESCE(p_bank_reference, ''), '[^a-zA-Z0-9]', '', 'g'));

  IF LENGTH(v_clean_utr) < 8 THEN
    RETURN QUERY SELECT false, 'Invalid bank reference: Evidence reference must be at least 8 alphanumeric characters'::TEXT, NULL::UUID, p_order_id, 'invalid_utr'::TEXT;
    RETURN;
  END IF;

  -- 8. Atomic UTR Claim (Enforces Strict Physical B-Tree Concurrency Serialization)
  INSERT INTO public.payment_utr_claims (
    normalized_utr,
    order_id,
    transaction_id,
    claimed_by,
    claimed_at
  ) VALUES (
    v_clean_utr,
    v_order.id,
    v_new_tx_id,
    v_admin_id,
    timezone('utc', now())
  )
  ON CONFLICT (normalized_utr) DO NOTHING
  RETURNING normalized_utr INTO v_claim_inserted;

  IF v_claim_inserted IS NULL THEN
    RETURN QUERY SELECT false, ('Banking reference ' || v_clean_utr || ' has already been claimed by another payment order')::TEXT, NULL::UUID, p_order_id, 'duplicate_utr'::TEXT;
    RETURN;
  END IF;

  -- 9. Insert Captured Payment Transaction
  INSERT INTO public.payment_transactions (
    id,
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
    v_new_tx_id,
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
  );

  -- 10. Check Capacity & Execute Safe Transition
  IF v_reg.status = 'expired' AND v_tourn.confirmed_slots_count >= v_tourn.max_participants THEN
    -- Capacity is full! Set order to refund_pending, queue refund request, and commit atomically
    UPDATE public.payment_orders
    SET status = 'refund_pending',
        observation_utr = v_clean_utr,
        manual_review_notes = 'Late payment verified by owner, but tournament capacity was full. Queued for refund.',
        reconciled_at = timezone('utc', now()),
        reconciled_by = v_admin_id,
        updated_at = timezone('utc', now())
    WHERE id = v_order.id;

    INSERT INTO public.payment_refund_requests (
      transaction_id, order_id, tournament_id, user_id, amount_paise, currency, reason, status, admin_notes
    ) VALUES (
      v_new_tx_id, v_order.id, v_tourn.id, v_order.user_id, v_order.amount_paise, 'INR',
      'Tournament capacity reached after reservation hold expired.', 'pending_review',
      'Captured and queued automatically during reconciliation: tournament full.'
    );

    INSERT INTO public.admin_audit_logs (
      admin_id, target_user_id, action, entity_type, details, reason, status
    ) VALUES (
      v_admin_id, v_order.user_id, 'payment_reconciliation_refund_queued', 'payment_order',
      jsonb_build_object('order_id', v_order.id, 'tournament_id', v_tourn.id, 'transaction_id', v_new_tx_id, 'utr', v_clean_utr),
      'Tournament full; payment captured and queued for refund',
      'success'
    );

    RETURN QUERY SELECT true, 'Tournament capacity reached after hold expired. Payment captured and queued for refund.'::TEXT, NULL::UUID, p_order_id, 'refund_pending'::TEXT;
    RETURN;
  END IF;

  -- Capacity Available: Update Tournament Counter
  IF v_reg.status = 'expired' THEN
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
  SELECT pr.efootball_id, pr.display_name, pr.whatsapp_number
  INTO v_username, v_real_name, v_contact_info
  FROM public.profiles pr
  WHERE pr.id = v_order.user_id;

  v_username := COALESCE(NULLIF(TRIM(v_username), ''), 'player_' || SUBSTRING(v_order.user_id::TEXT, 1, 8));
  v_real_name := COALESCE(NULLIF(TRIM(v_real_name), ''), v_username);
  v_contact_info := NULLIF(TRIM(v_contact_info), '');

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

REVOKE ALL ON FUNCTION public.reconcile_and_confirm_payment(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_and_confirm_payment(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_and_confirm_payment(UUID, TEXT, TEXT, TEXT) TO service_role;
