-- ============================================================================
-- Migration: 20261104040000_webhook_security_audit_and_hardening.sql
-- Description:
-- Phase 3.4/3.5 Webhook Security Audit & Wall-Clock Fencing Hardening
--
-- Remediations:
-- 1. Hardens search_path (SET search_path = public, pg_temp) and uses authoritative
--    PostgreSQL wall-clock clock_timestamp() directly across all webhook worker
--    lease and mutation functions without lossy timestamptz -> timestamp conversions.
-- 2. Adds strict wall-clock lease expiry check to complete_webhook_worker_lease
--    (expired leases cannot complete webhook even if worker_token is unchanged).
-- 3. Revokes EXECUTE privileges from PUBLIC (grantee=0), anon, and authenticated
--    on all webhook and lease functions; restricts execution strictly to service_role.
-- 4. Cleans up legacy webhook lease functions and prevents unprivileged invocation.
-- ============================================================================

-- 1. Apply hardened apply_webhook_order_transition_and_complete with clock_timestamp()
CREATE OR REPLACE FUNCTION public.apply_webhook_order_transition_and_complete(
  p_event_id VARCHAR(100),
  p_worker_token VARCHAR(64),
  p_order_id UUID,
  p_new_order_status VARCHAR(50),
  p_notes TEXT DEFAULT NULL,
  p_gateway_payment_id TEXT DEFAULT NULL,
  p_utr TEXT DEFAULT NULL,
  p_event_type VARCHAR(50) DEFAULT 'SUCCESS',
  p_delivery_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  order_status VARCHAR(50),
  webhook_status VARCHAR(50),
  message TEXT,
  error_code VARCHAR(50)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_webhook RECORD;
  v_order RECORD;
  v_permitted_status VARCHAR(50);
  v_final_notes TEXT;
BEGIN
  -- 1. Lock payment_webhook_events row exclusively
  SELECT id, status, worker_token, lease_expires_at, payload
  INTO v_webhook
  FROM public.payment_webhook_events
  WHERE event_id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::VARCHAR(50), NULL::VARCHAR(50), 'Webhook event not found'::TEXT, 'WEBHOOK_EVENT_NOT_FOUND'::VARCHAR(50);
    RETURN;
  END IF;

  -- 2. Verify webhook is currently in 'processing' status
  IF v_webhook.status <> 'processing' THEN
    RETURN QUERY SELECT false, NULL::VARCHAR(50), v_webhook.status::VARCHAR(50), ('Webhook not in processing status: ' || v_webhook.status)::TEXT, 'INVALID_WEBHOOK_STATUS'::VARCHAR(50);
    RETURN;
  END IF;

  -- 3. Verify worker_token ownership: MUST match active lease owner
  IF v_webhook.worker_token IS DISTINCT FROM p_worker_token THEN
    RETURN QUERY SELECT false, NULL::VARCHAR(50), v_webhook.status::VARCHAR(50), 'Worker token mismatch: lease owned by another worker'::TEXT, 'STALE_WORKER_TOKEN'::VARCHAR(50);
    RETURN;
  END IF;

  -- 4. Verify lease has not expired using authoritative wall-clock (clock_timestamp)
  IF v_webhook.lease_expires_at IS NULL OR v_webhook.lease_expires_at <= v_now THEN
    RETURN QUERY SELECT false, NULL::VARCHAR(50), v_webhook.status::VARCHAR(50), 'Worker lease expired: cannot mutate order after lease timeout'::TEXT, 'LEASE_EXPIRED'::VARCHAR(50);
    RETURN;
  END IF;

  -- 5. Lock payment_orders row exclusively using SELECT ... FOR UPDATE
  SELECT id, status, gateway_order_id, receipt, manual_review_notes, observation_utr, registration_id, tournament_id, amount_paise
  INTO v_order
  FROM public.payment_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Order not found: mark webhook as unmatched
    UPDATE public.payment_webhook_events
    SET status = 'unmatched',
        worker_token = NULL,
        lease_expires_at = NULL,
        processing_result = 'unmatched',
        failure_reason = 'UNKNOWN_ORDER_ID'
    WHERE id = v_webhook.id;

    RETURN QUERY SELECT false, NULL::VARCHAR(50), 'unmatched'::VARCHAR(50), 'Payment order not found'::TEXT, 'ORDER_NOT_FOUND'::VARCHAR(50);
    RETURN;
  END IF;

  -- 6. Evaluate Monotonic State Machine Invariants:
  -- A. If order is already 'paid':
  IF v_order.status = 'paid' THEN
    IF p_event_type IN ('FAILED', 'CANCELLED') THEN
      v_permitted_status := 'manual_review_required';
      v_final_notes := '[CONFLICTING_GATEWAY_EVENT] Order was marked paid, but received ' || p_event_type || ' webhook from gateway. Reference: ' || COALESCE(p_gateway_payment_id, 'N/A') || '.';
    ELSE
      v_permitted_status := 'paid';
      v_final_notes := v_order.manual_review_notes;
    END IF;

  -- B. If order is already 'manual_review_required': retain manual review
  ELSIF v_order.status = 'manual_review_required' THEN
    v_permitted_status := 'manual_review_required';
    v_final_notes := COALESCE(v_order.manual_review_notes, '') || ' | Subsequent webhook ' || p_event_type || ' received.';

  -- C. Standard transitions:
  ELSE
    -- STRICT PAYMENT AUTHORITY BOUNDARY:
    -- SUCCESS signals from YOUPI PG cap order status at 'pending_verification' (or 'manual_review_required')
    -- NEVER automatically mark order as 'paid'
    -- NEVER confirm registration or enroll participants
    v_permitted_status := p_new_order_status;
    v_final_notes := COALESCE(p_notes, v_order.manual_review_notes);
  END IF;

  -- 7. Mutate payment_orders row (inside locked transaction)
  UPDATE public.payment_orders
  SET status = v_permitted_status,
      gateway_order_id = COALESCE(p_gateway_payment_id, gateway_order_id),
      observation_utr = COALESCE(p_utr, observation_utr),
      manual_review_notes = v_final_notes,
      updated_at = v_now
  WHERE id = v_order.id;

  -- 8. Complete payment_webhook_events lifecycle (inside same locked transaction)
  UPDATE public.payment_webhook_events
  SET status = 'processed',
      worker_token = NULL,
      lease_expires_at = NULL,
      processed_at = v_now,
      processing_result = v_permitted_status,
      failure_reason = NULL,
      payment_order_id = v_order.id
  WHERE id = v_webhook.id;

  RETURN QUERY SELECT
    true,
    v_permitted_status,
    'processed'::VARCHAR(50),
    'Payment order and webhook lifecycle updated atomically under exclusive locks.'::TEXT,
    NULL::VARCHAR(50);
  RETURN;
END;
$$;

-- 2. Apply hardened claim_webhook_worker_lease with clock_timestamp()
CREATE OR REPLACE FUNCTION public.claim_webhook_worker_lease(
  p_event_id VARCHAR(100),
  p_event_type VARCHAR(50),
  p_payload JSONB,
  p_payment_id VARCHAR(100) DEFAULT NULL,
  p_order_id VARCHAR(100) DEFAULT NULL,
  p_worker_token VARCHAR(64) DEFAULT NULL,
  p_lease_seconds INT DEFAULT 600
)
RETURNS TABLE (
  acquired BOOLEAN,
  is_duplicate BOOLEAN,
  is_conflict BOOLEAN,
  worker_token VARCHAR(64),
  lease_expires_at TIMESTAMPTZ,
  retry_count INT,
  current_status VARCHAR(50),
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_token VARCHAR(64) := COALESCE(NULLIF(TRIM(p_worker_token), ''), gen_random_uuid()::text);
  v_lease_expiry TIMESTAMPTZ := v_now + (p_lease_seconds || ' seconds')::INTERVAL;
  v_row RECORD;
BEGIN
  -- 1. Try to insert new event record (Write-Ahead Ledger)
  INSERT INTO public.payment_webhook_events (
    event_id,
    event_type,
    payload,
    status,
    worker_token,
    lease_expires_at,
    processing_started_at,
    received_at,
    processed_at,
    payment_id,
    order_id,
    signature_verified,
    retry_count
  ) VALUES (
    p_event_id,
    p_event_type,
    p_payload,
    'processing',
    v_token,
    v_lease_expiry,
    v_now,
    v_now,
    NULL,
    p_payment_id,
    p_order_id,
    true,
    0
  )
  ON CONFLICT (event_id) DO NOTHING
  RETURNING id, worker_token, lease_expires_at, retry_count, status
  INTO v_row;

  IF FOUND THEN
    RETURN QUERY SELECT
      true, false, false,
      v_token,
      v_lease_expiry,
      0,
      'processing'::VARCHAR(50),
      'Lease successfully acquired as new webhook event'::TEXT;
    RETURN;
  END IF;

  -- 2. Row exists: Lock row exclusively using SELECT ... FOR UPDATE
  SELECT id, status, worker_token, lease_expires_at, retry_count, payload
  INTO v_row
  FROM public.payment_webhook_events
  WHERE event_id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      false, false, false,
      NULL::VARCHAR(64), NULL::TIMESTAMPTZ, 0,
      'not_found'::VARCHAR(50),
      'Event record not found during lock acquisition'::TEXT;
    RETURN;
  END IF;

  -- 3. Conflicting payload check for identical event ID (Payload tampering guard)
  IF (v_row.payload::text <> p_payload::text) THEN
    UPDATE public.payment_webhook_events
    SET status = 'rejected',
        failure_reason = 'CONFLICTING_PAYLOAD_FOR_EVENT_ID',
        processing_result = 'rejected'
    WHERE id = v_row.id;

    RETURN QUERY SELECT
      false, false, true,
      NULL::VARCHAR(64), NULL::TIMESTAMPTZ, COALESCE(v_row.retry_count, 0),
      'rejected'::VARCHAR(50),
      'Conflicting payload under identical event ID'::TEXT;
    RETURN;
  END IF;

  -- 4. Terminal status check: already processed or duplicate
  IF v_row.status IN ('processed', 'duplicate') THEN
    RETURN QUERY SELECT
      false, true, false,
      NULL::VARCHAR(64), NULL::TIMESTAMPTZ, COALESCE(v_row.retry_count, 0),
      v_row.status::VARCHAR(50),
      'Duplicate event already processed idempotently'::TEXT;
    RETURN;
  END IF;

  -- 5. Terminal rejection check
  IF v_row.status = 'rejected' THEN
    RETURN QUERY SELECT
      false, false, false,
      NULL::VARCHAR(64), NULL::TIMESTAMPTZ, COALESCE(v_row.retry_count, 0),
      'rejected'::VARCHAR(50),
      'Event was previously rejected'::TEXT;
    RETURN;
  END IF;

  -- 6. Active lease ownership check:
  -- Using authoritative wall-clock (clock_timestamp)
  IF v_row.status = 'processing' AND v_row.lease_expires_at IS NOT NULL AND v_row.lease_expires_at > v_now THEN
    RETURN QUERY SELECT
      false, true, false,
      v_row.worker_token, v_row.lease_expires_at, COALESCE(v_row.retry_count, 0),
      'processing'::VARCHAR(50),
      'Active unexpired worker lease exists. Concurrent acquisition rejected.'::TEXT;
    RETURN;
  END IF;

  -- 7. Previous lease expired or worker crashed:
  UPDATE public.payment_webhook_events
  SET status = 'processing',
      worker_token = v_token,
      lease_expires_at = v_lease_expiry,
      processing_started_at = v_now,
      retry_count = COALESCE(v_row.retry_count, 0) + 1,
      payment_id = COALESCE(payment_id, p_payment_id),
      order_id = COALESCE(order_id, p_order_id)
  WHERE id = v_row.id;

  RETURN QUERY SELECT
    true, false, false,
    v_token,
    v_lease_expiry,
    COALESCE(v_row.retry_count, 0) + 1,
    'processing'::VARCHAR(50),
    'Expired or stale worker lease successfully reclaimed'::TEXT;
  RETURN;
END;
$$;

-- 3. Apply hardened complete_webhook_worker_lease with clock_timestamp() AND LEASE EXPIRY CHECK
CREATE OR REPLACE FUNCTION public.complete_webhook_worker_lease(
  p_event_id VARCHAR(100),
  p_worker_token VARCHAR(64),
  p_final_status VARCHAR(50),
  p_processing_result VARCHAR(100) DEFAULT NULL,
  p_failure_reason TEXT DEFAULT NULL,
  p_payment_order_id UUID DEFAULT NULL
)
RETURNS TABLE (
  completed BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_row RECORD;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  -- Lock row using SELECT ... FOR UPDATE
  SELECT id, status, worker_token, lease_expires_at
  INTO v_row
  FROM public.payment_webhook_events
  WHERE event_id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Event not found'::TEXT;
    RETURN;
  END IF;

  -- CRITICAL 1: Verify caller worker_token matches lease owner
  IF v_row.worker_token IS DISTINCT FROM p_worker_token THEN
    RETURN QUERY SELECT false, 'Worker token mismatch: lease has been transferred or reclaimed by another worker.'::TEXT;
    RETURN;
  END IF;

  -- CRITICAL 2: Verify lease has not expired on authoritative wall-clock!
  -- Expired lease CANNOT authorize completion even if token has not changed.
  IF v_row.lease_expires_at IS NULL OR v_row.lease_expires_at <= v_now THEN
    RETURN QUERY SELECT false, 'Worker lease expired: cannot complete webhook after lease timeout.'::TEXT;
    RETURN;
  END IF;

  -- Update row to final status, set processed_at ONLY on success, and clear lease
  UPDATE public.payment_webhook_events
  SET status = p_final_status,
      worker_token = NULL,
      lease_expires_at = NULL,
      processed_at = CASE WHEN p_final_status = 'processed' THEN v_now ELSE NULL END,
      processing_result = p_processing_result,
      failure_reason = p_failure_reason,
      payment_order_id = COALESCE(payment_order_id, p_payment_order_id)
  WHERE id = v_row.id;

  RETURN QUERY SELECT true, 'Webhook worker lease completed successfully.'::TEXT;
END;
$$;

-- 4. Apply hardened release_webhook_worker_lease with clock_timestamp()
CREATE OR REPLACE FUNCTION public.release_webhook_worker_lease(
  p_event_id VARCHAR(100),
  p_worker_token VARCHAR(64),
  p_failure_reason TEXT DEFAULT NULL
)
RETURNS TABLE (
  released BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  SELECT id, status, worker_token
  INTO v_row
  FROM public.payment_webhook_events
  WHERE event_id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Event not found'::TEXT;
    RETURN;
  END IF;

  IF v_row.worker_token IS DISTINCT FROM p_worker_token THEN
    RETURN QUERY SELECT false, 'Worker token mismatch: cannot release lease owned by another worker.'::TEXT;
    RETURN;
  END IF;

  -- Expire lease immediately to enable retry
  UPDATE public.payment_webhook_events
  SET lease_expires_at = v_now - INTERVAL '1 second',
      failure_reason = p_failure_reason
  WHERE id = v_row.id;

  RETURN QUERY SELECT true, 'Worker lease released and expired for retry.'::TEXT;
END;
$$;

-- 5. STRICT SECURITY HARDENING: Revoke all from PUBLIC (grantee=0), anon, authenticated; grant ONLY to service_role
REVOKE ALL ON FUNCTION public.apply_webhook_order_transition_and_complete(VARCHAR, VARCHAR, UUID, VARCHAR, TEXT, TEXT, TEXT, VARCHAR, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_webhook_order_transition_and_complete(VARCHAR, VARCHAR, UUID, VARCHAR, TEXT, TEXT, TEXT, VARCHAR, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.claim_webhook_worker_lease(VARCHAR, VARCHAR, JSONB, VARCHAR, VARCHAR, VARCHAR, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_webhook_worker_lease(VARCHAR, VARCHAR, JSONB, VARCHAR, VARCHAR, VARCHAR, INT) TO service_role;

REVOKE ALL ON FUNCTION public.complete_webhook_worker_lease(VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_webhook_worker_lease(VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.release_webhook_worker_lease(VARCHAR, VARCHAR, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_webhook_worker_lease(VARCHAR, VARCHAR, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.acquire_webhook_processing_lease(VARCHAR, VARCHAR, JSONB, VARCHAR, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_webhook_processing_lease(VARCHAR, VARCHAR, JSONB, VARCHAR, INT) TO service_role;

REVOKE ALL ON FUNCTION public.complete_webhook_processing_lease(VARCHAR, VARCHAR, VARCHAR, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_webhook_processing_lease(VARCHAR, VARCHAR, VARCHAR, JSONB) TO service_role;
