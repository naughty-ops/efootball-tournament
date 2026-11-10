-- ============================================================================
-- Migration: 20261110000001_upgrade_player_wallet_and_payout_sla.sql
-- Description: Adds 24-hour SLA columns (eligible_at, deadline_at), receipts,
-- and strict payout statuses (PENDING_APPROVAL, APPROVED, PROCESSING, PAID, FAILED, PENDING, REJECTED).
-- ============================================================================

ALTER TABLE public.payout_transactions 
  ADD COLUMN IF NOT EXISTS eligible_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deadline_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '24 hours'),
  ADD COLUMN IF NOT EXISTS receipt_url TEXT,
  ADD COLUMN IF NOT EXISTS receipt_reference TEXT;

UPDATE public.payout_transactions 
  SET eligible_at = created_at, 
      deadline_at = created_at + INTERVAL '24 hours' 
  WHERE eligible_at IS NULL;

ALTER TABLE public.payout_transactions DROP CONSTRAINT IF EXISTS payout_transactions_payout_status_check;
ALTER TABLE public.payout_transactions ADD CONSTRAINT payout_transactions_payout_status_check 
  CHECK (payout_status IN ('PENDING_APPROVAL', 'APPROVED', 'PROCESSING', 'PAID', 'FAILED', 'PENDING', 'REJECTED'));

-- Performance index for 24-hour SLA deadline tracking and priority queries
CREATE INDEX IF NOT EXISTS idx_payout_transactions_sla 
  ON public.payout_transactions (payout_status, deadline_at);
