-- ============================================================================
-- Migration: 20261022020000_protect_participant_privacy.sql
-- Description:
-- 1. Remove broad public read policy on public.participants that exposed contact_info and real_name
-- 2. Restrict public.participants SELECT to record owner (auth.uid() = user_id) and verified admin (public.is_admin())
-- 3. Create a purpose-built public view public.tournament_participants_public exposing only safe competition fields
-- 4. Grant SELECT on public.tournament_participants_public to anon and authenticated
-- 5. Harden INSERT, UPDATE, and DELETE policies on public.participants
-- ============================================================================

-- 1. Drop unsafe legacy policies on public.participants
DROP POLICY IF EXISTS "Allow public read access on participants" ON public.participants;
DROP POLICY IF EXISTS "Allow write access on participants" ON public.participants;
DROP POLICY IF EXISTS "Allow authenticated insert on participants" ON public.participants;
DROP POLICY IF EXISTS "Allow authenticated update on participants" ON public.participants;
DROP POLICY IF EXISTS "Allow authenticated delete on participants" ON public.participants;
DROP POLICY IF EXISTS "Allow users to read own participant record" ON public.participants;
DROP POLICY IF EXISTS "Allow admin to read all participants" ON public.participants;
DROP POLICY IF EXISTS "Allow admin to manage all participants" ON public.participants;

-- Ensure RLS is active on public.participants
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;

-- 2. Restrict SELECT on public.participants to owner and admin
-- Policy A: Players can read their own participant record (including their own contact_info and real_name)
CREATE POLICY "Allow users to read own participant record"
    ON public.participants FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

-- Policy B: Verified platform administrator can read all participant records
CREATE POLICY "Allow admin to read all participants"
    ON public.participants FOR SELECT TO authenticated
    USING (public.is_admin());

-- 3. Restrict mutations on public.participants
-- Admin can perform all operations (INSERT, UPDATE, DELETE) on participants
CREATE POLICY "Allow admin to manage all participants"
    ON public.participants FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Self-registration policy: Authenticated users can register themselves for open tournaments
-- (Preserves policy from 20261022000000_add_user_id_to_participants.sql)
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

-- Self-cancellation policy: Users can delete their own registration while tournament is in registration phase
-- (Preserves policy from 20261022000000_add_user_id_to_participants.sql)
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

-- 4. Create purpose-built public participant view
-- Explicitly omits contact_info, real_name, and user_id to prevent any privacy leaks
-- Uses SECURITY DEFINER semantics (security_invoker = false) so view owner queries public fields safely
CREATE OR REPLACE VIEW public.tournament_participants_public
WITH (security_invoker = false)
AS
SELECT
    id,
    tournament_id,
    username,
    seed_number,
    status,
    created_at,
    updated_at
FROM public.participants;

-- 5. Grant explicit SELECT access on the public view to anon and authenticated roles
GRANT SELECT ON public.tournament_participants_public TO anon, authenticated;

-- 6. Revoke direct anon access on public.participants table
REVOKE ALL ON public.participants FROM anon;
