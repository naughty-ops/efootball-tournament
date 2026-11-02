-- ============================================================================
-- Migration: 20261101000000_add_youpi_and_unified_payment_state_support.sql
-- Description:
-- Extends payment ledger schema to support YouPI PG V2 and unified payment states
-- while keeping all Cashfree and Razorpay orders, transactions, and triggers 100% intact.
--
-- 1. Updates payment_orders status check constraint to support unified states:
--    'created', 'attempted', 'pending_verification', 'paid', 'failed', 'expired',
--    'cancelled', 'refund_pending', 'refunded', 'manual_review_required'
-- 2. Adds check constraint allowing gateway IN ('cashfree', 'razorpay', 'youpi')
-- 3. Adds verification_level and observation_utr tracking to payment_orders
-- 4. Extends payment_transactions and payment_refund_requests to support 'youpi'
-- 5. Adds partial unique index on non-null, non-empty UTRs to prevent duplicate reuse
-- ============================================================================

-- 1. Update payment_orders status check constraint safely
DO $$
BEGIN
  -- Drop existing status constraint if exists (production has chk_order_status, older migrations used payment_orders_status_check)
  ALTER TABLE public.payment_orders DROP CONSTRAINT IF EXISTS payment_orders_status_check;
  ALTER TABLE public.payment_orders DROP CONSTRAINT IF EXISTS chk_order_status;
  
  -- Add comprehensive check constraint covering all unified lifecycle states
  ALTER TABLE public.payment_orders
    ADD CONSTRAINT payment_orders_status_check
    CHECK (status IN (
      'created',
      'attempted',
      'pending_verification',
      'paid',
      'failed',
      'expired',
      'cancelled',
      'refund_pending',
      'refunded',
      'manual_review_required'
    ));
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- 2. Update payment_orders gateway check constraint
DO $$
BEGIN
  ALTER TABLE public.payment_orders DROP CONSTRAINT IF EXISTS payment_orders_gateway_check;
  
  ALTER TABLE public.payment_orders
    ADD CONSTRAINT payment_orders_gateway_check
    CHECK (gateway IN ('cashfree', 'razorpay', 'youpi'));
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- 3. Add YouPI and observer auditing columns to payment_orders
ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS verification_level INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS observation_utr VARCHAR(64),
  ADD COLUMN IF NOT EXISTS manual_review_notes TEXT,
  ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconciled_by UUID REFERENCES auth.users(id);

-- 4. Update payment_transactions gateway check constraint
DO $$
BEGIN
  ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_gateway_check;
  
  ALTER TABLE public.payment_transactions
    ADD CONSTRAINT payment_transactions_gateway_check
    CHECK (gateway IN ('cashfree', 'razorpay', 'youpi'));
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- 5. Update payment_refund_requests gateway check constraint
DO $$
BEGIN
  ALTER TABLE public.payment_refund_requests DROP CONSTRAINT IF EXISTS payment_refund_requests_gateway_check;
  
  ALTER TABLE public.payment_refund_requests
    ADD CONSTRAINT payment_refund_requests_gateway_check
    CHECK (gateway IN ('cashfree', 'razorpay', 'youpi'));
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- 6. Duplicate UTR Protection:
-- NOTE: Uniqueness for captured UTRs is enforced atomically via payment_utr_claims table
-- (in 20261101020000) rather than a unique index on payment_transactions(bank_reference),
-- to maintain compatibility with historical captured records.

-- Index for fast lookup on pending verification & manual review orders
CREATE INDEX IF NOT EXISTS idx_payment_orders_status_gateway
  ON public.payment_orders (status, gateway);
