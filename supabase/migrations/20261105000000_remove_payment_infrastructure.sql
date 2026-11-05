-- ============================================================================
-- Migration: 20261105000000_remove_payment_infrastructure.sql
-- Description:
-- Permanent Removal of All Payment Gateways, Payment Processing Infrastructure,
-- and Associated Tables, Views, Triggers, and Stored Procedures.
--
-- Transition to Free Tournament Registration Platform:
-- 1. Decouples tournament_registrations from payment_transactions.
-- 2. Safely removes payment tables in correct dependency order (CASCADE).
-- 3. Safely drops all payment and webhook stored procedures.
-- 4. Updates lock_tournament_financial_terms() trigger function to remove
--    dependencies on payment_transactions.
-- 5. Hardens public.admin_audit_logs with Row Level Security.
-- 6. Preserves:
--    - tournaments & tournament rules
--    - tournament_registrations & participants
--    - profiles & WhatsApp verification
--    - matches, brackets, groups, standings & results
--    - admin permissions & security definer functions
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Decouple tournament_registrations from payment infrastructure
-- ----------------------------------------------------------------------------
ALTER TABLE public.tournament_registrations 
  DROP CONSTRAINT IF EXISTS tournament_registrations_payment_transaction_id_fkey;

ALTER TABLE public.tournament_registrations 
  DROP COLUMN IF EXISTS payment_transaction_id;

-- ----------------------------------------------------------------------------
-- 2. Update trigger function on tournaments (remove payment_transactions ref)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lock_tournament_financial_terms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF (NEW.is_paid IS DISTINCT FROM OLD.is_paid) OR 
     (NEW.entry_fee_paise IS DISTINCT FROM OLD.entry_fee_paise) OR 
     (NEW.currency IS DISTINCT FROM OLD.currency) THEN
     
     IF EXISTS (
       SELECT 1 FROM public.tournament_registrations
       WHERE tournament_id = OLD.id
         AND status = 'confirmed'
     ) OR EXISTS (
       SELECT 1 FROM public.participants
       WHERE tournament_id = OLD.id
     ) OR (OLD.confirmed_slots_count > 0) THEN
       RAISE EXCEPTION 'Cannot modify tournament terms when registered participants exist for tournament %', OLD.id;
     END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 3. Drop payment-specific tables in dependency order
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.payment_refund_requests CASCADE;
DROP TABLE IF EXISTS public.payment_utr_claims CASCADE;
DROP TABLE IF EXISTS public.payment_exception_events CASCADE;
DROP TABLE IF EXISTS public.payment_exceptions CASCADE;
DROP TABLE IF EXISTS public.payment_webhook_events CASCADE;
DROP TABLE IF EXISTS public.payment_transactions CASCADE;
DROP TABLE IF EXISTS public.payment_orders CASCADE;

-- ----------------------------------------------------------------------------
-- 4. Drop obsolete payment and webhook stored procedures
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.reconcile_and_confirm_payment CASCADE;
DROP FUNCTION IF EXISTS public.acquire_webhook_processing_lease CASCADE;
DROP FUNCTION IF EXISTS public.complete_webhook_processing_lease CASCADE;
DROP FUNCTION IF EXISTS public.claim_webhook_worker_lease CASCADE;
DROP FUNCTION IF EXISTS public.complete_webhook_worker_lease CASCADE;
DROP FUNCTION IF EXISTS public.release_webhook_worker_lease CASCADE;
DROP FUNCTION IF EXISTS public.apply_webhook_order_transition_and_complete CASCADE;
DROP FUNCTION IF EXISTS public.confirm_tournament_reservation(uuid, uuid, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.confirm_tournament_reservation(uuid, uuid, uuid, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.confirm_tournament_reservation CASCADE;
DROP FUNCTION IF EXISTS public.release_expired_reservations CASCADE;
DROP FUNCTION IF EXISTS public.reconcile_tournament_slots CASCADE;
DROP FUNCTION IF EXISTS public.create_or_get_payment_exception CASCADE;
DROP FUNCTION IF EXISTS public.transition_payment_exception CASCADE;

-- ----------------------------------------------------------------------------
-- 5. Unschedule pg_cron jobs if present
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) 
    FROM cron.job 
    WHERE jobname IN ('cleanup-expired-reservations-every-minute', 'payment-cleanup', 'release-expired-reservations-every-5-minutes')
       OR command ILIKE '%release_expired_reservations%'
       OR command ILIKE '%payment%';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- Silently continue if cron schema or permissions are restricted
    NULL;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Harden admin_audit_logs with Row Level Security
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'admin_audit_logs') THEN
    ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
    
    REVOKE ALL ON public.admin_audit_logs FROM PUBLIC;
    REVOKE ALL ON public.admin_audit_logs FROM anon;
    REVOKE UPDATE, DELETE, TRUNCATE ON public.admin_audit_logs FROM authenticated;
    
    GRANT SELECT, INSERT ON public.admin_audit_logs TO authenticated;
    GRANT ALL ON public.admin_audit_logs TO service_role;
    
    DROP POLICY IF EXISTS "Admins can view audit logs" ON public.admin_audit_logs;
    CREATE POLICY "Admins can view audit logs"
      ON public.admin_audit_logs FOR SELECT TO authenticated
      USING (public.is_admin());

    DROP POLICY IF EXISTS "Admins and service_role can insert audit logs" ON public.admin_audit_logs;
    CREATE POLICY "Admins and service_role can insert audit logs"
      ON public.admin_audit_logs FOR INSERT TO authenticated
      WITH CHECK (public.is_admin() OR auth.role() = 'service_role');
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. Drop obsolete YouPI PG schema if present
-- ----------------------------------------------------------------------------
DROP SCHEMA IF EXISTS youpi CASCADE;
