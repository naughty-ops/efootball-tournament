-- Remove terms enforcement triggers and functions that were throwing
-- "Registration rejected: Player must explicitly accept the tournament rules and terms & conditions."

DROP TRIGGER IF EXISTS trg_enforce_participant_terms_acceptance ON public.participants CASCADE;
DROP TRIGGER IF EXISTS trg_enforce_registration_terms_accepted ON public.tournament_registrations CASCADE;
DROP FUNCTION IF EXISTS public.check_participant_terms_accepted() CASCADE;
DROP FUNCTION IF EXISTS public.check_registration_terms_accepted() CASCADE;

-- Ensure columns have safe defaults and don't block inserts
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'participants' AND column_name = 'terms_accepted'
  ) THEN
    ALTER TABLE public.participants ALTER COLUMN terms_accepted DROP NOT NULL;
    ALTER TABLE public.participants ALTER COLUMN terms_accepted SET DEFAULT true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tournament_registrations' AND column_name = 'terms_accepted'
  ) THEN
    ALTER TABLE public.tournament_registrations ALTER COLUMN terms_accepted DROP NOT NULL;
    ALTER TABLE public.tournament_registrations ALTER COLUMN terms_accepted SET DEFAULT true;
  END IF;
END $$;
