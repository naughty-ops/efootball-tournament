-- Add rounds_per_pair to public.tournaments
ALTER TABLE public.tournaments
    ADD COLUMN IF NOT EXISTS rounds_per_pair INTEGER NOT NULL DEFAULT 1;
