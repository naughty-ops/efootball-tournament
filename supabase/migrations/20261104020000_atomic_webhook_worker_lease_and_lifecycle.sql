-- ============================================================================
-- Migration: 20261104020000_atomic_webhook_worker_lease_and_lifecycle.sql
-- Description:
-- Phase 3.2 Atomic Webhook Worker Lease Remediation
--
-- 1. Lifecycle timestamp correctness:
--    - Alters processed_at to be NULLABLE (set strictly upon completion, never during processing).
--    - Adds processing_started_at TIMESTAMPTZ to track active worker lease start.
--    - Adds performance indexes on worker_token, lease_expires_at, and status.
--
-- 2. Atomic worker lease acquisition RPC:
--    - public.claim_webhook_worker_lease:
--      * Uses SELECT ... FOR UPDATE to lock row exclusively.
--      * Checks eligibility, payload tampering conflicts, and active leases.
--      * Rejects acquisition if active unexpired lease exists.
--      * Reclaims expired leases atomically.
--      * Assigns new worker_token, lease_expires_at, and increments retry_count exactly once.
--
-- 3. Protected completion & release RPCs:
--    - public.complete_webhook_worker_lease:
--      * Strictly enforces worker_token ownership: old workers cannot overwrite results.
--      * Sets processed_at only upon successful completion.
--    - public.release_webhook_worker_lease:
--      * Releases lease and expires it immediately on processing failure for fast retries.
-- ============================================================================

-- 1. Schema & Timestamp Adjustments
ALTER TABLE public.payment_webhook_events 
  ALTER COLUMN processed_at DROP NOT NULL;

ALTER TABLE public.payment_webhook_events 
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_worker_lease 
  ON public.payment_webhook_events(event_id, worker_token);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_lease_status 
  ON public.payment_webhook_events(status, lease_expires_at);

-- 2. Atomic Lease Acquisition Function
CREATE OR REPLACE FUNCTION public.claim_webhook_worker_lease(
  p_event_id VARCHAR(100),
  p_event_type VARCHAR(100),
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
SET search_path = public, auth, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_now TIMESTAMPTZ := timezone('utc', now());
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
    NULL, -- processed_at remains NULL until successful completion!
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
  -- If status is 'processing' AND lease_expires_at > NOW(), another worker owns a valid active lease
  IF v_row.status = 'processing' AND v_row.lease_expires_at IS NOT NULL AND v_row.lease_expires_at > v_now THEN
    RETURN QUERY SELECT
      false, true, false,
      v_row.worker_token, v_row.lease_expires_at, COALESCE(v_row.retry_count, 0),
      'processing'::VARCHAR(50),
      'Active unexpired worker lease exists. Concurrent acquisition rejected.'::TEXT;
    RETURN;
  END IF;

  -- 7. Previous lease expired or worker crashed:
  -- Atomically reclaim lease, assign new worker token, increment retry count exactly once
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

-- 3. Protected Completion RPC
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
SET search_path = public, auth, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_row RECORD;
  v_now TIMESTAMPTZ := timezone('utc', now());
BEGIN
  SELECT id, status, worker_token, lease_expires_at
  INTO v_row
  FROM public.payment_webhook_events
  WHERE event_id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Event not found'::TEXT;
    RETURN;
  END IF;

  -- Worker token ownership verification
  IF v_row.worker_token IS DISTINCT FROM p_worker_token THEN
    RETURN QUERY SELECT false, 'Worker token mismatch: lease has been transferred or reclaimed by another worker.'::TEXT;
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

-- 4. Release/Expire RPC for Failures
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
SET search_path = public, auth, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_row RECORD;
  v_now TIMESTAMPTZ := timezone('utc', now());
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

  UPDATE public.payment_webhook_events
  SET lease_expires_at = v_now - INTERVAL '1 second',
      failure_reason = p_failure_reason
  WHERE id = v_row.id;

  RETURN QUERY SELECT true, 'Worker lease released and expired for retry.'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_webhook_worker_lease(VARCHAR, VARCHAR, JSONB, VARCHAR, VARCHAR, VARCHAR, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_webhook_worker_lease(VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_webhook_worker_lease(VARCHAR, VARCHAR, TEXT) TO service_role;
