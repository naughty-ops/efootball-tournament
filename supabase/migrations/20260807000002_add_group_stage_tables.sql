-- ============================================================================
-- ADD GROUP STAGE TABLES & COLUMNS
-- Supports Group Stage management, group_participants, and group match linkage
-- ============================================================================

-- Create public.group_participants table
CREATE TABLE IF NOT EXISTS public.group_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE NOT NULL,
    participant_id UUID REFERENCES public.participants(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_group_participant UNIQUE (group_id, participant_id)
);

-- Add group_id to public.matches
ALTER TABLE public.matches
    ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_matches_group_id ON public.matches(group_id);
CREATE INDEX IF NOT EXISTS idx_group_participants_group_id ON public.group_participants(group_id);
CREATE INDEX IF NOT EXISTS idx_group_participants_participant_id ON public.group_participants(participant_id);

-- Add qualifiers_per_group and is_group_stage_finalized to public.tournaments
ALTER TABLE public.tournaments
    ADD COLUMN IF NOT EXISTS qualifiers_per_group INTEGER NOT NULL DEFAULT 2,
    ADD COLUMN IF NOT EXISTS is_group_stage_finalized BOOLEAN NOT NULL DEFAULT FALSE;
