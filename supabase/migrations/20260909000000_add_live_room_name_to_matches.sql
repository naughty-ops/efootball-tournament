-- ============================================================================
-- ADD LIVE_ROOM_NAME COLUMN TO MATCHES TABLE
-- Stores unique streaming room ID for each match (e.g. efootball-match-[id])
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'matches' 
          AND column_name = 'live_room_name'
    ) THEN
        ALTER TABLE public.matches ADD COLUMN live_room_name TEXT DEFAULT NULL;
    END IF;
END $$;
