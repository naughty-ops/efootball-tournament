-- Migration: 20261022000000_add_user_id_to_participants.sql
-- Enables self-registration by associating tournament participants with Supabase auth users

-- 1. Add user_id column to public.participants
ALTER TABLE public.participants 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Index user_id for fast queries in player dashboard
CREATE INDEX IF NOT EXISTS idx_participants_user_id 
ON public.participants(user_id);

-- 3. Unique constraint to prevent duplicate registrations for the same user in a tournament
CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_tournament_user 
ON public.participants(tournament_id, user_id) 
WHERE user_id IS NOT NULL;

-- 4. RLS Policy for player self-registration
-- Allows authenticated users to register themselves for open tournaments
DO $$
BEGIN
    DROP POLICY IF EXISTS "Allow authenticated users to register self" ON public.participants;
    CREATE POLICY "Allow authenticated users to register self"
        ON public.participants FOR INSERT TO authenticated
        WITH CHECK (
            auth.uid() = user_id
            AND EXISTS (
                SELECT 1 FROM public.tournaments t
                WHERE t.id = tournament_id
                AND t.status = 'registration'
            )
        );

    DROP POLICY IF EXISTS "Allow users to delete own registration during registration" ON public.participants;
    CREATE POLICY "Allow users to delete own registration during registration"
        ON public.participants FOR DELETE TO authenticated
        USING (
            auth.uid() = user_id
            AND EXISTS (
                SELECT 1 FROM public.tournaments t
                WHERE t.id = tournament_id
                AND t.status = 'registration'
            )
        );
END $$;
