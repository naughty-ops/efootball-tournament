-- ============================================================================
-- ADD BRACKET RELATIONSHIPS TO MATCHES TABLE
-- Enables deterministic winner advancement into future round slots
-- ============================================================================

ALTER TABLE public.matches
    ADD COLUMN IF NOT EXISTS match_position INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS next_match_id UUID REFERENCES public.matches(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS winner_slot TEXT CHECK (winner_slot IN ('participant_a', 'participant_b'));

CREATE INDEX IF NOT EXISTS idx_matches_next_match_id ON public.matches(next_match_id);
