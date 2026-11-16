-- Migration: 20261114000002_fix_match_disputes_rls.sql
-- Description: Fix RLS policies on public.match_disputes and provide atomic SECURITY DEFINER procedure

-- ------------------------------------------------------------------------------
-- 1. Table: public.match_disputes RLS hardening
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Disputes insert policy" ON public.match_disputes;
CREATE POLICY "Disputes insert policy"
    ON public.match_disputes
    FOR INSERT
    TO authenticated, service_role
    WITH CHECK (
        public.is_admin()
        OR (COALESCE(auth.role(), '') = 'service_role' OR COALESCE(auth.jwt() ->> 'role', '') = 'service_role')
        OR EXISTS (
            SELECT 1 FROM public.participants p
            WHERE (p.id = match_disputes.reporter_participant_id OR p.id = match_disputes.opponent_participant_id)
              AND p.user_id = (SELECT auth.uid())
        )
        OR EXISTS (
            SELECT 1 FROM public.matches m
            JOIN public.participants p ON (p.id = m.participant_a OR p.id = m.participant_b)
            WHERE m.id = match_disputes.match_id
              AND p.user_id = (SELECT auth.uid())
        )
    );

DROP POLICY IF EXISTS "Disputes select policy" ON public.match_disputes;
CREATE POLICY "Disputes select policy"
    ON public.match_disputes
    FOR SELECT
    TO authenticated, service_role
    USING (
        public.is_admin()
        OR (COALESCE(auth.role(), '') = 'service_role' OR COALESCE(auth.jwt() ->> 'role', '') = 'service_role')
        OR EXISTS (
            SELECT 1 FROM public.participants p
            WHERE (p.id = match_disputes.reporter_participant_id OR p.id = match_disputes.opponent_participant_id)
              AND p.user_id = (SELECT auth.uid())
        )
        OR EXISTS (
            SELECT 1 FROM public.matches m
            JOIN public.participants p ON (p.id = m.participant_a OR p.id = m.participant_b)
            WHERE m.id = match_disputes.match_id
              AND p.user_id = (SELECT auth.uid())
        )
    );

-- ------------------------------------------------------------------------------
-- 2. Stored Procedure: submit_match_dispute (SECURITY DEFINER)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_match_dispute(
  p_match_id uuid,
  p_tournament_id uuid,
  p_reporter_participant_id uuid,
  p_opponent_participant_id uuid DEFAULT NULL,
  p_reason text DEFAULT 'other',
  p_details text DEFAULT NULL,
  p_evidence_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_match RECORD;
  v_dispute_id UUID;
  v_now TIMESTAMPTZ := now();
  v_is_admin BOOLEAN;
  v_is_service_role BOOLEAN;
  v_caller_id UUID;
  v_actual_opponent_id UUID;
BEGIN
  v_caller_id := auth.uid();
  v_is_service_role := (COALESCE(auth.role(), '') = 'service_role' OR COALESCE(auth.jwt() ->> 'role', '') = 'service_role');
  v_is_admin := public.is_admin();

  -- Identity check: authenticated session required unless service role
  IF NOT (v_is_admin OR v_is_service_role) THEN
    IF v_caller_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Authentication required to report match issues');
    END IF;

    -- Verify that reporter participant belongs to caller
    IF NOT EXISTS (
      SELECT 1 FROM public.participants
      WHERE id = p_reporter_participant_id AND user_id = v_caller_id
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unauthorized to report on behalf of this participant');
    END IF;
  END IF;

  -- Verify match exists
  SELECT * INTO v_match
  FROM public.matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;

  -- Ensure match belongs to tournament
  IF v_match.tournament_id != p_tournament_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match tournament mismatch');
  END IF;

  -- Verify participant is assigned to the match (unless admin/service_role)
  IF NOT (v_is_admin OR v_is_service_role) THEN
    IF v_match.participant_a != p_reporter_participant_id AND v_match.participant_b != p_reporter_participant_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Participant is not assigned to this match');
    END IF;
  END IF;

  -- Determine opponent participant ID if not provided
  v_actual_opponent_id := p_opponent_participant_id;
  IF v_actual_opponent_id IS NULL THEN
    IF v_match.participant_a = p_reporter_participant_id THEN
      v_actual_opponent_id := v_match.participant_b;
    ELSE
      v_actual_opponent_id := v_match.participant_a;
    END IF;
  END IF;

  -- Insert dispute ticket
  INSERT INTO public.match_disputes (
    match_id,
    tournament_id,
    reporter_participant_id,
    opponent_participant_id,
    reason,
    details,
    evidence_url,
    status
  ) VALUES (
    p_match_id,
    p_tournament_id,
    p_reporter_participant_id,
    v_actual_opponent_id,
    p_reason,
    p_details,
    p_evidence_url,
    'open'
  ) RETURNING id INTO v_dispute_id;

  -- Update match status to disputed
  UPDATE public.matches
  SET status = 'disputed',
      updated_at = v_now
  WHERE id = p_match_id;

  -- Audit log
  INSERT INTO public.match_activity_logs (
    match_id,
    tournament_id,
    actor_id,
    actor_role,
    action,
    details
  ) VALUES (
    p_match_id,
    p_tournament_id,
    COALESCE(v_caller_id, (SELECT user_id FROM public.participants WHERE id = p_reporter_participant_id)),
    CASE WHEN v_is_admin THEN 'admin' ELSE 'player' END,
    'dispute_submitted',
    jsonb_build_object(
      'dispute_id', v_dispute_id,
      'reason', p_reason,
      'details', p_details
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'dispute_id', v_dispute_id,
    'message', 'Match issue reported successfully. Our admin team will review it shortly.'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_match_dispute(uuid, uuid, uuid, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_match_dispute(uuid, uuid, uuid, uuid, text, text, text) TO authenticated, service_role;
