CREATE OR REPLACE FUNCTION public.test_ping_mig() RETURNS text LANGUAGE sql AS $$ SELECT 'ok'::text $$;
