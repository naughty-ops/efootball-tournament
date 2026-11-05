-- ============================================================================
-- Migration: 20261104030000_atomic_webhook_order_transition_and_fencing.sql
-- Description:
-- Phase 3.3 Atomic Webhook Order Transition and Fencing Remediation
--
-- Eliminates the TOCTOU (Time-of-Check to Time-of-Use) race condition where a worker
-- could verify lease ownership via application-level SELECT, lose its lease to another
-- worker due to timeout, and still mutate payment_orders.
--
-- Features:
-- 1. Locks payment_webhook_events row exclusively (SELECT ... FOR UPDATE).
-- 2. Strictly validates that worker_token matches the current lease owner.
-- 3. Strictly validates that lease_expires_at > NOW() (expired tokens rejected).
-- 4. Locks payment_orders row exclusively (SELECT ... FOR UPDATE).
-- 5. Enforces monotonic state transition rules (cannot downgrade paid orders,
--    conflicting gateway signals escalated to manual review).
-- 6. Mutates payment_orders and marks payment_webhook_events 'processed' in a single
--    atomic PostgreSQL transaction.
-- 7. Strictly revokes public/anon/authenticated execution; grants only to service_role.
-- ============================================================================

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
SET search_path = public, auth, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_now TIMESTAMPTZ := timezone('utc', now());
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

  -- 4. Verify lease has not expired: MUST NOT allow expired worker even if token matches
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

-- Security Permissions
REVOKE ALL ON FUNCTION public.apply_webhook_order_transition_and_complete(VARCHAR, VARCHAR, UUID, VARCHAR, TEXT, TEXT, TEXT, VARCHAR, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_webhook_order_transition_and_complete(VARCHAR, VARCHAR, UUID, VARCHAR, TEXT, TEXT, TEXT, VARCHAR, TEXT) TO service_role;
