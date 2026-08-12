-- Migration: Add runner_up_id and completed_at to tournaments table
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS runner_up_id UUID REFERENCES public.participants(id) ON DELETE SET NULL;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
