-- ============================================================================
-- Migration: 20261104050000_reconcile_legacy_webhook_and_trigger_search_paths.sql
-- Description:
-- Forward-Only Reconciliation Migration
-- 
-- Objectives:
-- 1. Remediates legacy webhook lease functions (acquire_webhook_processing_lease,
--    complete_webhook_processing_lease) by strictly locking search_path to public, pg_temp.
-- 2. Hardens trigger function lock_tournament_financial_terms() by explicitly adding
--    pg_temp last in its search_path (public, pg_temp) to prevent temporary table
--    search-path preemption.
-- 3. Idempotently creates the missing 'Service role full access on payment_webhook_events'
--    RLS policy on payment_webhook_events, ensuring 100% schema alignment with
--    historical migration declarations while preserving existing policies.
-- 
-- Invariants:
-- - Preserves SECURITY DEFINER status on all functions.
-- - Preserves trigger return types and operational semantics.
-- - Preserves execution privileges (service_role-only for webhook functions;
--   authenticated/admin execution for tournament update triggers).
-- - Fully idempotent DDL safe for any environment state.
-- ============================================================================

-- 1. Legacy Webhook Lease Functions (Service Role Only)
ALTER FUNCTION public.acquire_webhook_processing_lease(
  character varying, character varying, jsonb, character varying, integer
) SET search_path = public, pg_temp;

ALTER FUNCTION public.complete_webhook_processing_lease(
  character varying, character varying, character varying, jsonb
) SET search_path = public, pg_temp;

-- 2. Tournament Financial Terms Trigger Function
ALTER FUNCTION public.lock_tournament_financial_terms()
  SET search_path = public, pg_temp;

-- 3. Idempotent Policy Alignment for payment_webhook_events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payment_webhook_events'
      AND policyname = 'Service role full access on payment_webhook_events'
  ) THEN
    CREATE POLICY "Service role full access on payment_webhook_events"
      ON public.payment_webhook_events
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
