-- Performance optimization B-Tree indexes for eFootball Tournament Platform
-- Eliminates full table scans on frequently filtered and sorted columns.

-- 1. Index for Live Matches query: WHERE status = 'live' ORDER BY updated_at DESC
CREATE INDEX IF NOT EXISTS idx_matches_status_updated_at 
ON public.matches (status, updated_at DESC);

-- 2. Index for Round Matches lookup: WHERE round_id = ?
CREATE INDEX IF NOT EXISTS idx_matches_round_id 
ON public.matches (round_id);

-- 3. Index for Group Matches lookup: WHERE group_id = ?
CREATE INDEX IF NOT EXISTS idx_matches_group_id 
ON public.matches (group_id);

-- 4. Index for Participants lookup: WHERE tournament_id = ? ORDER BY seed_number ASC
CREATE INDEX IF NOT EXISTS idx_participants_tournament_seed 
ON public.participants (tournament_id, seed_number ASC);

-- 5. Index for Rounds lookup: WHERE tournament_id = ? ORDER BY round_number ASC
CREATE INDEX IF NOT EXISTS idx_rounds_tournament_round_number 
ON public.rounds (tournament_id, round_number ASC);

-- 6. Index for Groups lookup: WHERE tournament_id = ?
CREATE INDEX IF NOT EXISTS idx_groups_tournament_id 
ON public.groups (tournament_id);

-- 7. Index for Site Settings lookup: WHERE key = ?
CREATE INDEX IF NOT EXISTS idx_site_settings_key 
ON public.site_settings (key);
