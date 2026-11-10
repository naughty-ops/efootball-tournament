-- Migration: 20261108040000_match_scheduling_deadlines_and_disputes.sql
-- Description: Implement match scheduling, deadlines, check-in tracking, automatic forfeiture evaluation, and dispute ticketing.

-- 1. Extend matches table with scheduling, deadline, and check-in tracking columns
ALTER TABLE public.matches 
  ADD COLUMN IF NOT EXISTS tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS completion_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checkin_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS grace_period_minutes INTEGER DEFAULT 15,
  ADD COLUMN IF NOT EXISTS player_a_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS player_b_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS forfeit_reason TEXT,
  ADD COLUMN IF NOT EXISTS walkover_requested_by UUID REFERENCES public.participants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS walkover_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS matchday INTEGER;

-- 2. Backfill tournament_id from rounds
UPDATE public.matches m
SET tournament_id = r.tournament_id
FROM public.rounds r
WHERE m.round_id = r.id
  AND m.tournament_id IS NULL;

-- 3. Update matches_status_check constraint to include disputed, under_review, forfeited
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_status_check;
ALTER TABLE public.matches ADD CONSTRAINT matches_status_check 
  CHECK (status = ANY (ARRAY[
    'pending'::text, 
    'ready'::text, 
    'scheduled'::text, 
    'live'::text, 
    'completed'::text, 
    'walkover'::text, 
    'cancelled'::text,
    'disputed'::text,
    'under_review'::text,
    'forfeited'::text
  ]));

-- 4. Create match_disputes table
CREATE TABLE IF NOT EXISTS public.match_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  reporter_participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  opponent_participant_id UUID REFERENCES public.participants(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (reason IN (
    'opponent_no_show', 
    'connection_failure', 
    'refusing_to_play', 
    'match_not_completed', 
    'incorrect_walkover', 
    'other'
  )),
  details TEXT,
  evidence_url TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved', 'rejected')),
  admin_notes TEXT,
  resolution_action TEXT,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Create match_activity_logs table
CREATE TABLE IF NOT EXISTS public.match_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE,
  actor_id UUID,
  actor_role TEXT NOT NULL DEFAULT 'system' CHECK (actor_role IN ('player', 'admin', 'system')),
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Indexes for optimal query performance
CREATE INDEX IF NOT EXISTS idx_matches_tournament_id ON public.matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_matches_scheduled_time ON public.matches(scheduled_time);
CREATE INDEX IF NOT EXISTS idx_matches_completion_deadline ON public.matches(completion_deadline);
CREATE INDEX IF NOT EXISTS idx_matches_checkin_deadline ON public.matches(checkin_deadline);
CREATE INDEX IF NOT EXISTS idx_matches_status ON public.matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_matchday ON public.matches(matchday);

CREATE INDEX IF NOT EXISTS idx_match_disputes_tournament_id ON public.match_disputes(tournament_id);
CREATE INDEX IF NOT EXISTS idx_match_disputes_match_id ON public.match_disputes(match_id);
CREATE INDEX IF NOT EXISTS idx_match_disputes_status ON public.match_disputes(status);

CREATE INDEX IF NOT EXISTS idx_match_activity_logs_match_id ON public.match_activity_logs(match_id, created_at DESC);

-- 7. RLS Configuration
ALTER TABLE public.match_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Disputes select policy" ON public.match_disputes;
CREATE POLICY "Disputes select policy" ON public.match_disputes
  FOR SELECT TO authenticated
  USING (
    is_admin() OR
    EXISTS (
      SELECT 1 FROM public.participants p 
      WHERE (p.id = match_disputes.reporter_participant_id OR p.id = match_disputes.opponent_participant_id)
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Disputes insert policy" ON public.match_disputes;
CREATE POLICY "Disputes insert policy" ON public.match_disputes
  FOR INSERT TO authenticated
  WITH CHECK (
    is_admin() OR
    EXISTS (
      SELECT 1 FROM public.participants p 
      WHERE p.id = match_disputes.reporter_participant_id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Disputes admin update policy" ON public.match_disputes;
CREATE POLICY "Disputes admin update policy" ON public.match_disputes
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Disputes admin delete policy" ON public.match_disputes;
CREATE POLICY "Disputes admin delete policy" ON public.match_disputes
  FOR DELETE TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "Activity logs select policy" ON public.match_activity_logs;
CREATE POLICY "Activity logs select policy" ON public.match_activity_logs
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Activity logs insert policy" ON public.match_activity_logs;
CREATE POLICY "Activity logs insert policy" ON public.match_activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- 8. Stored Procedures for atomic operations

-- Procedure A: Atomic Player Check-in / Start Match
CREATE OR REPLACE FUNCTION public.record_player_checkin(
  p_match_id UUID,
  p_participant_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_match RECORD;
  v_is_participant_a BOOLEAN;
  v_is_participant_b BOOLEAN;
  v_now TIMESTAMPTZ := now();
  v_new_status TEXT;
  v_opponent_started BOOLEAN;
BEGIN
  -- Lock match row for update
  SELECT * INTO v_match
  FROM public.matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;

  -- Validate participant ownership unless admin
  IF NOT is_admin() THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.participants
      WHERE id = p_participant_id AND user_id = p_user_id
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unauthorized participant');
    END IF;
  END IF;

  v_is_participant_a := (v_match.participant_a = p_participant_id);
  v_is_participant_b := (v_match.participant_b = p_participant_id);

  IF NOT v_is_participant_a AND NOT v_is_participant_b THEN
    RETURN jsonb_build_object('success', false, 'error', 'Participant is not assigned to this match');
  END IF;

  -- Check if already completed/walkover/cancelled
  IF v_match.status IN ('completed', 'walkover', 'cancelled', 'forfeited') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match has already concluded (' || v_match.status || ')');
  END IF;

  -- Record check-in timestamp
  IF v_is_participant_a THEN
    IF v_match.player_a_started_at IS NULL THEN
      UPDATE public.matches
      SET player_a_started_at = v_now,
          updated_at = v_now
      WHERE id = p_match_id;
    END IF;
    v_opponent_started := (v_match.player_b_started_at IS NOT NULL);
  ELSE
    IF v_match.player_b_started_at IS NULL THEN
      UPDATE public.matches
      SET player_b_started_at = v_now,
          updated_at = v_now
      WHERE id = p_match_id;
    END IF;
    v_opponent_started := (v_match.player_a_started_at IS NOT NULL);
  END IF;

  -- If opponent has also checked in, promote status to live
  IF v_opponent_started AND v_match.status IN ('scheduled', 'ready', 'pending') THEN
    UPDATE public.matches
    SET status = 'live',
        updated_at = v_now
    WHERE id = p_match_id;
    v_new_status := 'live';
  ELSE
    v_new_status := v_match.status;
  END IF;

  -- Log activity
  INSERT INTO public.match_activity_logs (
    match_id,
    tournament_id,
    actor_id,
    actor_role,
    action,
    details
  ) VALUES (
    p_match_id,
    v_match.tournament_id,
    p_user_id,
    'player',
    'player_checkin',
    jsonb_build_object(
      'participant_id', p_participant_id,
      'is_participant_a', v_is_participant_a,
      'match_status', v_new_status
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'match_id', p_match_id,
    'status', v_new_status,
    'checked_in_at', v_now,
    'both_players_present', v_opponent_started
  );
END;
$$;

-- Procedure B: Request Walkover / Report Opponent No-Show
CREATE OR REPLACE FUNCTION public.request_match_walkover(
  p_match_id UUID,
  p_participant_id UUID,
  p_user_id UUID,
  p_reason TEXT DEFAULT 'Opponent no-show after grace period'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_match RECORD;
  v_is_participant_a BOOLEAN;
  v_is_participant_b BOOLEAN;
  v_my_started_at TIMESTAMPTZ;
  v_opponent_started_at TIMESTAMPTZ;
  v_opponent_id UUID;
  v_deadline TIMESTAMPTZ;
  v_now TIMESTAMPTZ := now();
  v_dispute_id UUID;
BEGIN
  SELECT * INTO v_match
  FROM public.matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;

  IF NOT is_admin() THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.participants
      WHERE id = p_participant_id AND user_id = p_user_id
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unauthorized participant');
    END IF;
  END IF;

  v_is_participant_a := (v_match.participant_a = p_participant_id);
  v_is_participant_b := (v_match.participant_b = p_participant_id);

  IF NOT v_is_participant_a AND NOT v_is_participant_b THEN
    RETURN jsonb_build_object('success', false, 'error', 'Participant is not assigned to this match');
  END IF;

  IF v_match.status IN ('completed', 'walkover', 'cancelled', 'forfeited') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match already finalized (' || v_match.status || ')');
  END IF;

  IF v_is_participant_a THEN
    v_my_started_at := v_match.player_a_started_at;
    v_opponent_started_at := v_match.player_b_started_at;
    v_opponent_id := v_match.participant_b;
  ELSE
    v_my_started_at := v_match.player_b_started_at;
    v_opponent_started_at := v_match.player_a_started_at;
    v_opponent_id := v_match.participant_a;
  END IF;

  -- Verify requesting player checked in
  IF v_my_started_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You must check in / start the match yourself before requesting a walkover');
  END IF;

  -- Verify opponent did not check in
  IF v_opponent_started_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Opponent has already checked in. Cannot request no-show walkover.');
  END IF;

  -- Check if grace period / checkin deadline has expired
  v_deadline := COALESCE(
    v_match.checkin_deadline,
    v_match.scheduled_time + (COALESCE(v_match.grace_period_minutes, 15) || ' minutes')::interval
  );

  IF v_deadline IS NOT NULL AND v_now < v_deadline THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Grace period has not expired yet. Deadline: ' || to_char(v_deadline, 'YYYY-MM-DD HH24:MI:SS OF')
    );
  END IF;

  -- Prevent duplicate request
  IF v_match.walkover_requested_by IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'A walkover request is already pending review for this match');
  END IF;

  -- Update match to under_review
  UPDATE public.matches
  SET walkover_requested_by = p_participant_id,
      walkover_requested_at = v_now,
      forfeit_reason = p_reason,
      status = 'under_review',
      updated_at = v_now
  WHERE id = p_match_id;

  -- File dispute ticket for admin desk
  INSERT INTO public.match_disputes (
    match_id,
    tournament_id,
    reporter_participant_id,
    opponent_participant_id,
    reason,
    details,
    status
  ) VALUES (
    p_match_id,
    v_match.tournament_id,
    p_participant_id,
    v_opponent_id,
    'opponent_no_show',
    p_reason,
    'open'
  ) RETURNING id INTO v_dispute_id;

  -- Log activity
  INSERT INTO public.match_activity_logs (
    match_id,
    tournament_id,
    actor_id,
    actor_role,
    action,
    details
  ) VALUES (
    p_match_id,
    v_match.tournament_id,
    p_user_id,
    'player',
    'walkover_requested',
    jsonb_build_object(
      'requested_by', p_participant_id,
      'opponent_id', v_opponent_id,
      'dispute_id', v_dispute_id,
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'dispute_id', v_dispute_id,
    'status', 'under_review',
    'message', 'Walkover request filed and submitted to Admin Match Desk for review'
  );
END;
$$;

-- Procedure C: Evaluate Overdue Matches (Server-Side Deadline Enforcement)
CREATE OR REPLACE FUNCTION public.evaluate_overdue_matches(
  p_tournament_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_r RECORD;
  v_now TIMESTAMPTZ := now();
  v_both_noshow_count INT := 0;
  v_overdue_live_count INT := 0;
  v_deadline TIMESTAMPTZ;
BEGIN
  -- 1. Check matches whose check-in deadline has expired where neither player checked in
  FOR v_r IN
    SELECT m.id, m.tournament_id, m.scheduled_time, m.checkin_deadline, m.grace_period_minutes
    FROM public.matches m
    WHERE (p_tournament_id IS NULL OR m.tournament_id = p_tournament_id)
      AND m.status IN ('scheduled', 'ready')
      AND m.player_a_started_at IS NULL
      AND m.player_b_started_at IS NULL
      AND (
        (m.checkin_deadline IS NOT NULL AND v_now > m.checkin_deadline)
        OR (m.scheduled_time IS NOT NULL AND v_now > (m.scheduled_time + (COALESCE(m.grace_period_minutes, 15) || ' minutes')::interval))
      )
  LOOP
    UPDATE public.matches
    SET status = 'under_review',
        forfeit_reason = 'Both players failed to check in within the grace period',
        updated_at = v_now
    WHERE id = v_r.id;

    INSERT INTO public.match_activity_logs (
      match_id,
      tournament_id,
      actor_role,
      action,
      details
    ) VALUES (
      v_r.id,
      v_r.tournament_id,
      'system',
      'deadline_expired_both_noshow',
      jsonb_build_object('evaluated_at', v_now)
    );

    v_both_noshow_count := v_both_noshow_count + 1;
  END LOOP;

  -- 2. Check live matches that passed their completion deadline without score reported
  FOR v_r IN
    SELECT m.id, m.tournament_id, m.completion_deadline
    FROM public.matches m
    WHERE (p_tournament_id IS NULL OR m.tournament_id = p_tournament_id)
      AND m.status = 'live'
      AND m.completion_deadline IS NOT NULL
      AND v_now > m.completion_deadline
  LOOP
    UPDATE public.matches
    SET status = 'under_review',
        forfeit_reason = 'Match exceeded completion deadline without reported score',
        updated_at = v_now
    WHERE id = v_r.id;

    INSERT INTO public.match_activity_logs (
      match_id,
      tournament_id,
      actor_role,
      action,
      details
    ) VALUES (
      v_r.id,
      v_r.tournament_id,
      'system',
      'completion_deadline_exceeded',
      jsonb_build_object('completion_deadline', v_r.completion_deadline, 'evaluated_at', v_now)
    );

    v_overdue_live_count := v_overdue_live_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'both_noshow_flagged', v_both_noshow_count,
    'overdue_live_flagged', v_overdue_live_count,
    'evaluated_at', v_now
  );
END;
$$;
