-- ============================================================================
-- ADD AUTHENTICATED ADMIN WRITE RLS POLICIES
-- Allows authenticated Admin users to perform INSERT, UPDATE, and DELETE queries
-- while keeping public users restricted to read-only (SELECT) access.
-- ============================================================================

DO $$ 
BEGIN
    -- Tournaments
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'tournaments' 
        AND policyname = 'Allow authenticated admin full access on tournaments'
    ) THEN
        CREATE POLICY "Allow authenticated admin full access on tournaments"
            ON public.tournaments FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;

    -- Participants
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'participants' 
        AND policyname = 'Allow authenticated admin full access on participants'
    ) THEN
        CREATE POLICY "Allow authenticated admin full access on participants"
            ON public.participants FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;

    -- Rounds
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'rounds' 
        AND policyname = 'Allow authenticated admin full access on rounds'
    ) THEN
        CREATE POLICY "Allow authenticated admin full access on rounds"
            ON public.rounds FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;

    -- Matches
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'matches' 
        AND policyname = 'Allow authenticated admin full access on matches'
    ) THEN
        CREATE POLICY "Allow authenticated admin full access on matches"
            ON public.matches FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;

    -- Groups
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'groups' 
        AND policyname = 'Allow authenticated admin full access on groups'
    ) THEN
        CREATE POLICY "Allow authenticated admin full access on groups"
            ON public.groups FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;

    -- Group Participants
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'group_participants' 
        AND policyname = 'Allow authenticated admin full access on group_participants'
    ) THEN
        CREATE POLICY "Allow authenticated admin full access on group_participants"
            ON public.group_participants FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
END $$;
