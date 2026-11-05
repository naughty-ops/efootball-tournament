-- Migration: 20261105010000_performance_optimization_indexes.sql
-- Description: Justified B-tree performance indexes for high-frequency tournament, match, participant, and profile queries.
-- Technology: PostgreSQL 17 / Supabase SSR

-- 1. Tournaments
-- Powers public listing (WHERE status != 'draft' ORDER BY created_at DESC / start_date ASC)
CREATE INDEX IF NOT EXISTS idx_tournaments_status_created 
  ON public.tournaments (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tournaments_created_at_desc 
  ON public.tournaments (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tournaments_status_start_date 
  ON public.tournaments (status, start_date ASC);

-- 2. Matches
-- Powers live matches, upcoming matches ticker, and match queries
CREATE INDEX IF NOT EXISTS idx_matches_status_scheduled 
  ON public.matches (status, scheduled_time ASC);

CREATE INDEX IF NOT EXISTS idx_matches_round_position 
  ON public.matches (round_id, match_position ASC);

CREATE INDEX IF NOT EXISTS idx_matches_created_at_desc 
  ON public.matches (created_at DESC);

-- 3. Participants
-- Powers participant counting, status filtering, and seeding
CREATE INDEX IF NOT EXISTS idx_participants_tourn_status 
  ON public.participants (tournament_id, status);

CREATE INDEX IF NOT EXISTS idx_participants_tourn_seed 
  ON public.participants (tournament_id, seed_number ASC);

CREATE INDEX IF NOT EXISTS idx_participants_user_created 
  ON public.participants (user_id, created_at DESC);

-- 4. Profiles
-- Powers admin verification queue and player profile ordering
CREATE INDEX IF NOT EXISTS idx_profiles_created_at_desc 
  ON public.profiles (created_at DESC);

-- 5. Rounds
-- Powers round ordering for tournament details
CREATE INDEX IF NOT EXISTS idx_rounds_tourn_number 
  ON public.rounds (tournament_id, round_number ASC);
