-- ============================================================================
-- Migration: 20261104010000_harden_webhook_lifecycle_and_audit.sql
-- Description: Extends public.payment_webhook_events with durable lifecycle columns,
--              correlation identifiers, and performance indexes for robust
--              YOUPI PG webhook ingestion and replay protection.
-- ============================================================================

-- 1. Add missing lifecycle and correlation columns to payment_webhook_events
ALTER TABLE public.payment_webhook_events
  ADD COLUMN IF NOT EXISTS payment_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS order_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS payment_order_id UUID REFERENCES public.payment_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS signature_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processing_result VARCHAR(50),
  ADD COLUMN IF NOT EXISTS failure_reason TEXT;

-- 2. Indexes for efficient lookup, correlation, and deduplication
CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_payment_id
  ON public.payment_webhook_events(payment_id);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_order_id
  ON public.payment_webhook_events(order_id);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_payment_order_id
  ON public.payment_webhook_events(payment_order_id);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_status
  ON public.payment_webhook_events(status);

-- 3. RLS: Affirm admin and service_role permissions
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on payment_webhook_events" ON public.payment_webhook_events;
CREATE POLICY "Service role full access on payment_webhook_events"
  ON public.payment_webhook_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
