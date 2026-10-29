-- ============================================================================
-- Migration: 20261030000000_add_cashfree_gateway_support.sql
-- Description:
-- Extends payment ledger schema to support Cashfree Payments while keeping
-- all historical Razorpay orders and transactions 100% intact.
--
-- 1. Adds gateway, gateway_order_id, cf_order_id, payment_session_id to payment_orders.
-- 2. Makes razorpay_order_id nullable for non-Razorpay orders.
-- 3. Adds gateway, gateway_payment_id, gateway_signature to payment_transactions.
-- 4. Makes razorpay_payment_id and razorpay_signature nullable for non-Razorpay transactions.
-- 5. Backfills existing rows with gateway = 'razorpay'.
-- 6. Adds indexes for fast gateway-order and gateway-payment lookups.
-- ============================================================================

-- 1. Extend payment_orders
ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS gateway VARCHAR(30) NOT NULL DEFAULT 'razorpay',
  ADD COLUMN IF NOT EXISTS gateway_order_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS cf_order_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS payment_session_id TEXT;

-- Drop NOT NULL from razorpay_order_id to allow gateway-agnostic orders
ALTER TABLE public.payment_orders
  ALTER COLUMN razorpay_order_id DROP NOT NULL;

-- Backfill existing payment_orders
UPDATE public.payment_orders
SET gateway_order_id = razorpay_order_id
WHERE gateway_order_id IS NULL AND razorpay_order_id IS NOT NULL;

-- Partial unique index for gateway_order_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_orders_gateway_order
  ON public.payment_orders (gateway, gateway_order_id)
  WHERE gateway_order_id IS NOT NULL;

-- 2. Extend payment_transactions
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS gateway VARCHAR(30) NOT NULL DEFAULT 'razorpay',
  ADD COLUMN IF NOT EXISTS gateway_payment_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS gateway_signature TEXT;

-- Drop NOT NULL from razorpay_payment_id and razorpay_signature to allow gateway-agnostic transactions
ALTER TABLE public.payment_transactions
  ALTER COLUMN razorpay_payment_id DROP NOT NULL,
  ALTER COLUMN razorpay_signature DROP NOT NULL;

-- Backfill existing payment_transactions
UPDATE public.payment_transactions
SET gateway_payment_id = razorpay_payment_id,
    gateway_signature = razorpay_signature
WHERE gateway_payment_id IS NULL AND razorpay_payment_id IS NOT NULL;

-- Partial unique index for gateway_payment_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_transactions_gateway_payment
  ON public.payment_transactions (gateway, gateway_payment_id)
  WHERE gateway_payment_id IS NOT NULL;

-- 3. Extend payment_refund_requests
ALTER TABLE public.payment_refund_requests
  ADD COLUMN IF NOT EXISTS gateway VARCHAR(30) NOT NULL DEFAULT 'razorpay',
  ADD COLUMN IF NOT EXISTS gateway_refund_id VARCHAR(100);

UPDATE public.payment_refund_requests
SET gateway_refund_id = razorpay_refund_id
WHERE gateway_refund_id IS NULL AND razorpay_refund_id IS NOT NULL;
