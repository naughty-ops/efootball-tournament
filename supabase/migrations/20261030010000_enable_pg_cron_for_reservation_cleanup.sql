-- ============================================================================
-- Migration: 20261030010000_enable_pg_cron_for_reservation_cleanup.sql
-- Description:
-- Native Database Scheduling for Automatic Reservation Expiry & Slot Recovery
-- Replaces external Vercel Hobby cron with Supabase's native pg_cron engine.
--
-- Features:
-- 1. Enables pg_cron extension (creates the dedicated 'cron' schema).
-- 2. Safely checks for and unschedules any prior registration of this job.
-- 3. Registers public.release_expired_reservations() to run every 5 minutes (*/5 * * * *).
-- ============================================================================

-- 1. Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Safely unschedule any existing job with the same name without swallowing unexpected errors
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.tables 
    WHERE table_schema = 'cron' AND table_name = 'job'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'release-expired-reservations-every-5-minutes'
    ) THEN
      PERFORM cron.unschedule('release-expired-reservations-every-5-minutes');
      RAISE NOTICE 'Previous reservation cleanup cron job successfully unscheduled.';
    END IF;
  END IF;
END $$;

-- 3. Register the 5-minute recurring cleanup job in PostgreSQL
SELECT cron.schedule(
  'release-expired-reservations-every-5-minutes',
  '*/5 * * * *',
  $$ SELECT public.release_expired_reservations(); $$
);
