-- Migration: 20261110000002_harden_matches_participants_rls_and_rbac.sql
-- Description: Drop permissive legacy RLS policies on matches and participants, enforce strict least-privilege policies, and ensure RBAC helper functions exist.

-- 1. Drop permissive policies on public.matches
DROP POLICY IF EXISTS "Allow write access on matches" ON public.matches;
DROP POLICY IF EXISTS "Allow authenticated insert on matches" ON public.matches;
DROP POLICY IF EXISTS "Allow authenticated update on matches" ON public.matches;
DROP POLICY IF EXISTS "Allow authenticated delete on matches" ON public.matches;
DROP POLICY IF EXISTS "Allow public read access on matches" ON public.matches;
DROP POLICY IF EXISTS "matches_public_read_policy" ON public.matches;
DROP POLICY IF EXISTS "matches_admin_insert_policy" ON public.matches;
DROP POLICY IF EXISTS "matches_admin_update_policy" ON public.matches;
DROP POLICY IF EXISTS "matches_admin_delete_policy" ON public.matches;

CREATE POLICY "matches_public_read_policy"
  ON public.matches FOR SELECT
  TO public
  USING (true);

CREATE POLICY "matches_admin_insert_policy"
  ON public.matches FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "matches_admin_update_policy"
  ON public.matches FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "matches_admin_delete_policy"
  ON public.matches FOR DELETE
  TO authenticated
  USING (is_admin());

-- 2. Drop permissive policies on public.participants
DROP POLICY IF EXISTS "Allow write access on participants" ON public.participants;
DROP POLICY IF EXISTS "Allow authenticated insert on participants" ON public.participants;
DROP POLICY IF EXISTS "Allow authenticated update on participants" ON public.participants;
DROP POLICY IF EXISTS "Allow authenticated delete on participants" ON public.participants;
DROP POLICY IF EXISTS "participants_select_owner_or_admin" ON public.participants;
DROP POLICY IF EXISTS "participants_select_policy" ON public.participants;
DROP POLICY IF EXISTS "participants_insert_policy" ON public.participants;
DROP POLICY IF EXISTS "participants_update_policy" ON public.participants;
DROP POLICY IF EXISTS "participants_delete_policy" ON public.participants;

CREATE POLICY "participants_select_policy"
  ON public.participants FOR SELECT
  TO authenticated, anon
  USING (
    is_admin() OR
    (auth.uid() IS NOT NULL AND user_id = auth.uid()) OR
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = participants.tournament_id
        AND (t.is_private = false OR t.status IN ('registration', 'ongoing', 'completed'))
    )
  );

CREATE POLICY "participants_insert_policy"
  ON public.participants FOR INSERT
  TO authenticated
  WITH CHECK (
    is_admin() OR
    (auth.uid() = user_id AND EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = participants.tournament_id
        AND t.status = 'registration'
    ))
  );

CREATE POLICY "participants_update_policy"
  ON public.participants FOR UPDATE
  TO authenticated
  USING (
    is_admin() OR
    (auth.uid() = user_id AND EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = participants.tournament_id
        AND t.status = 'registration'
    ))
  )
  WITH CHECK (
    is_admin() OR
    (auth.uid() = user_id AND EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = participants.tournament_id
        AND t.status = 'registration'
    ))
  );

CREATE POLICY "participants_delete_policy"
  ON public.participants FOR DELETE
  TO authenticated
  USING (
    is_admin() OR
    (auth.uid() = user_id AND EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = participants.tournament_id
        AND t.status = 'registration'
    ))
  );
