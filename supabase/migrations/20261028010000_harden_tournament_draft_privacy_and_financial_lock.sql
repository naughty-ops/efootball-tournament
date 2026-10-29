-- ============================================================================
-- MIGRATION: 20261028010000_harden_tournament_draft_privacy_and_financial_lock.sql
-- PURPOSE:
-- 1. Restrict public tournament SELECT access so draft tournaments are invisible
--    to anonymous and authenticated non-admin callers (status <> 'draft').
-- 2. Restrict all tournament write operations (INSERT, UPDATE, DELETE) strictly
--    to verified administrators via public.is_admin().
-- 3. Enforce database-level lock on tournament financial terms (is_paid,
--    entry_fee_paise, currency) once registrations or payments exist.
-- ============================================================================

-- 1. Harden read access: Public can only SELECT non-draft tournaments
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tournaments' AND policyname = 'Allow public read access on tournaments'
  ) THEN
    ALTER POLICY "Allow public read access on tournaments"
      ON public.tournaments
      USING (status != 'draft');
  ELSE
    CREATE POLICY "Allow public read access on tournaments"
      ON public.tournaments FOR SELECT
      TO public
      USING (status != 'draft');
  END IF;
END $$;

-- 2. Harden write operations: Only verified admin (public.is_admin()) can perform modifications
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tournaments' AND policyname = 'Allow authenticated insert on tournaments'
  ) THEN
    ALTER POLICY "Allow authenticated insert on tournaments"
      ON public.tournaments
      WITH CHECK (public.is_admin());
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tournaments' AND policyname = 'Allow authenticated update on tournaments'
  ) THEN
    ALTER POLICY "Allow authenticated update on tournaments"
      ON public.tournaments
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tournaments' AND policyname = 'Allow authenticated delete on tournaments'
  ) THEN
    ALTER POLICY "Allow authenticated delete on tournaments"
      ON public.tournaments
      USING (public.is_admin());
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tournaments' AND policyname = 'Allow write access on tournaments'
  ) THEN
    ALTER POLICY "Allow write access on tournaments"
      ON public.tournaments
      TO authenticated
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END $$;

-- 3. Create trigger to enforce database-level lock on tournament financial terms
CREATE OR REPLACE FUNCTION public.lock_tournament_financial_terms()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if financial terms (is_paid, entry_fee_paise, currency) are being changed
  IF (NEW.is_paid IS DISTINCT FROM OLD.is_paid) OR 
     (NEW.entry_fee_paise IS DISTINCT FROM OLD.entry_fee_paise) OR 
     (NEW.currency IS DISTINCT FROM OLD.currency) THEN
     
     -- Abort if active registrations, slot counts, or payment records exist
     IF EXISTS (
       SELECT 1 FROM public.tournament_registrations
       WHERE tournament_id = OLD.id
         AND status IN ('confirmed', 'pending_payment')
     ) OR EXISTS (
       SELECT 1 FROM public.payment_transactions
       WHERE tournament_id = OLD.id
         AND status != 'failed'
     ) OR (OLD.confirmed_slots_count > 0) OR (OLD.reserved_slots_count > 0) THEN
       RAISE EXCEPTION 'Cannot modify financial terms (is_paid, entry_fee_paise, currency) when active registrations or payment records exist for tournament %', OLD.id;
     END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_lock_tournament_financial_terms'
  ) THEN
    CREATE TRIGGER trg_lock_tournament_financial_terms
      BEFORE UPDATE OF is_paid, entry_fee_paise, currency ON public.tournaments
      FOR EACH ROW
      EXECUTE FUNCTION public.lock_tournament_financial_terms();
  END IF;
END $$;
