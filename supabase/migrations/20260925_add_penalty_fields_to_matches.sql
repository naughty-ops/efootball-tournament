-- Migration: 20260925_add_penalty_fields_to_matches.sql
-- Description: Add decided_by, penalty_score_a, and penalty_score_b to public.matches

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS decided_by TEXT DEFAULT 'normal' CHECK (decided_by IN ('normal', 'penalties', 'extra_time')),
  ADD COLUMN IF NOT EXISTS penalty_score_a INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS penalty_score_b INTEGER DEFAULT NULL;

-- Index for searching matches by decided_by method
CREATE INDEX IF NOT EXISTS idx_matches_decided_by ON public.matches (decided_by);
