-- Update matches table status check constraint to support ready, scheduled, and cancelled states
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_status_check;

ALTER TABLE public.matches 
ADD CONSTRAINT matches_status_check 
CHECK (status IN ('pending', 'ready', 'scheduled', 'live', 'completed', 'walkover', 'cancelled'));
