-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. TOURNAMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tournaments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    format TEXT NOT NULL CHECK (format IN ('knockout', 'league', 'group_knockout')),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'registration', 'ongoing', 'completed')),
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    rules_text TEXT,
    banner_image TEXT,
    max_participants INTEGER NOT NULL DEFAULT 32,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. PARTICIPANTS TABLE (No club/team field as per spec)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    real_name TEXT,
    contact_info TEXT,
    seed_number INTEGER,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'eliminated', 'disqualified')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 3. ROUNDS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.rounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 4. MATCHES TABLE (participant_a/b allow NULL for empty bracket slots/byes)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
    participant_a UUID REFERENCES public.participants(id) ON DELETE SET NULL,
    participant_b UUID REFERENCES public.participants(id) ON DELETE SET NULL,
    scheduled_time TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'live', 'completed', 'walkover')),
    score_a INTEGER NOT NULL DEFAULT 0,
    score_b INTEGER NOT NULL DEFAULT 0,
    winner_id UUID REFERENCES public.participants(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 5. GROUPS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES & PERFORMANCE OPTIMIZATIONS
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_participants_tournament_id ON public.participants(tournament_id);
CREATE INDEX IF NOT EXISTS idx_rounds_tournament_id ON public.rounds(tournament_id);
CREATE INDEX IF NOT EXISTS idx_matches_round_id ON public.matches(round_id);
CREATE INDEX IF NOT EXISTS idx_matches_participant_a ON public.matches(participant_a);
CREATE INDEX IF NOT EXISTS idx_matches_participant_b ON public.matches(participant_b);
CREATE INDEX IF NOT EXISTS idx_matches_winner_id ON public.matches(winner_id);
CREATE INDEX IF NOT EXISTS idx_groups_tournament_id ON public.groups(tournament_id);

-- ============================================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_tournaments_updated_at
    BEFORE UPDATE ON public.tournaments
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_participants_updated_at
    BEFORE UPDATE ON public.participants
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_matches_updated_at
    BEFORE UPDATE ON public.matches
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) PREPARATION
-- ============================================================================
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- Allow public read access to all public portal tables
CREATE POLICY "Allow public read access on tournaments" 
    ON public.tournaments FOR SELECT USING (true);

CREATE POLICY "Allow public read access on participants" 
    ON public.participants FOR SELECT USING (true);

CREATE POLICY "Allow public read access on rounds" 
    ON public.rounds FOR SELECT USING (true);

CREATE POLICY "Allow public read access on matches" 
    ON public.matches FOR SELECT USING (true);

CREATE POLICY "Allow public read access on groups" 
    ON public.groups FOR SELECT USING (true);
