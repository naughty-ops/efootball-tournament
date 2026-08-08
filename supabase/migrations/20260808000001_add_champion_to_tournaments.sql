-- Add champion_id column to tournaments table
ALTER TABLE public.tournaments
ADD COLUMN IF NOT EXISTS champion_id UUID REFERENCES public.participants(id) ON DELETE SET NULL;
