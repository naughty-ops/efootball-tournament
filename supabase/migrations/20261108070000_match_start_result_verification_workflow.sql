-- Migration: 20261108070000_match_start_result_verification_workflow.sql
-- Description: Implement complete Match Start, 30-Minute Result Submission, Automatic Verification,
-- Conflicting Score Dispute with Cloudinary Screenshot Evidence, and 30-Minute Timeout Enforcement.

-- 1. Extend matches status check constraint
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_status_check;
ALTER TABLE public.matches ADD CONSTRAINT matches_status_check 
  CHECK (status = ANY (ARRAY[
    'scheduled'::text,
    'waiting_for_players'::text,
    'in_progress'::text,
    'awaiting_result'::text,
    'result_verification'::text,
    'disputed'::text,
    'result_pending_admin'::text,
    'completed'::text,
    'admin_review'::text,
    -- uppercase aliases
    'SCHEDULED'::text,
    'WAITING_FOR_PLAYERS'::text,
    'IN_PROGRESS'::text,
    'AWAITING_RESULT'::text,
    'RESULT_VERIFICATION'::text,
    'DISPUTED'::text,
    'RESULT_PENDING_ADMIN'::text,
    'COMPLETED'::text,
    'ADMIN_REVIEW'::text,
    -- legacy aliases
    'pending'::text,
    'ready'::text,
    'live'::text,
    'walkover'::text,
    'cancelled'::text,
    'under_review'::text,
    'forfeited'::text
  ]));

-- 2. Add columns to matches
ALTER TABLE public.matches 
  ADD COLUMN IF NOT EXISTS actual_start_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submission_deadline TIMESTAMPTZ;

-- 3. Create match_submissions table
CREATE TABLE IF NOT EXISTS public.match_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  my_score INTEGER NOT NULL CHECK (my_score >= 0),
  opponent_score INTEGER NOT NULL CHECK (opponent_score >= 0),
  screenshot_url TEXT,
  screenshot_public_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_match_participant_submission UNIQUE (match_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_match_submissions_match_id ON public.match_submissions(match_id);
CREATE INDEX IF NOT EXISTS idx_match_submissions_participant_id ON public.match_submissions(participant_id);

ALTER TABLE public.match_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Match submissions select policy" ON public.match_submissions;
CREATE POLICY "Match submissions select policy" ON public.match_submissions
  FOR SELECT TO authenticated
  USING (
    is_admin() OR
    EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_submissions.match_id
        AND (
          m.participant_a IN (SELECT id FROM public.participants WHERE user_id = auth.uid()) OR
          m.participant_b IN (SELECT id FROM public.participants WHERE user_id = auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "Match submissions insert policy" ON public.match_submissions;
CREATE POLICY "Match submissions insert policy" ON public.match_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    is_admin() OR
    (
      user_id = auth.uid() AND
      EXISTS (
        SELECT 1 FROM public.participants p
        WHERE p.id = match_submissions.participant_id AND p.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Match submissions update policy" ON public.match_submissions;
CREATE POLICY "Match submissions update policy" ON public.match_submissions
  FOR UPDATE TO authenticated
  USING (
    is_admin() OR
    (
      user_id = auth.uid() AND
      EXISTS (
        SELECT 1 FROM public.participants p
        WHERE p.id = match_submissions.participant_id AND p.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    is_admin() OR
    (
      user_id = auth.uid() AND
      EXISTS (
        SELECT 1 FROM public.participants p
        WHERE p.id = match_submissions.participant_id AND p.user_id = auth.uid()
      )
    )
  );

-- 4. Extend match_disputes table
ALTER TABLE public.match_disputes DROP CONSTRAINT IF EXISTS match_disputes_reason_check;
ALTER TABLE public.match_disputes ADD CONSTRAINT match_disputes_reason_check CHECK (
  reason IN (
    'conflicting_scores',
    'timeout_no_result',
    'result_dispute',
    'opponent_no_show', 
    'connection_failure', 
    'refusing_to_play', 
    'match_not_completed', 
    'incorrect_walkover', 
    'other'
  )
);

ALTER TABLE public.match_disputes
  ADD COLUMN IF NOT EXISTS reporter_screenshot_url TEXT,
  ADD COLUMN IF NOT EXISTS opponent_screenshot_url TEXT,
  ADD COLUMN IF NOT EXISTS reporter_score_a INTEGER,
  ADD COLUMN IF NOT EXISTS reporter_score_b INTEGER,
  ADD COLUMN IF NOT EXISTS opponent_score_a INTEGER,
  ADD COLUMN IF NOT EXISTS opponent_score_b INTEGER;

-- 5. Stored Procedures
-- Procedure A: Atomic Player Start Match
CREATE OR REPLACE FUNCTION public.start_player_match(
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
  v_both_started BOOLEAN;
  v_actual_start TIMESTAMPTZ;
  v_deadline TIMESTAMPTZ;
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
      RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: You are not assigned to this participant');
    END IF;
  END IF;

  v_is_participant_a := (v_match.participant_a = p_participant_id);
  v_is_participant_b := (v_match.participant_b = p_participant_id);

  IF NOT v_is_participant_a AND NOT v_is_participant_b THEN
    RETURN jsonb_build_object('success', false, 'error', 'Participant is not assigned to this match');
  END IF;

  IF v_match.status IN ('completed', 'walkover', 'cancelled', 'forfeited', 'COMPLETED') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match has already concluded (' || v_match.status || ')');
  END IF;

  IF v_is_participant_a THEN
    IF v_match.player_a_started_at IS NULL THEN
      UPDATE public.matches
      SET player_a_started_at = v_now,
          updated_at = v_now
      WHERE id = p_match_id;
    END IF;
    v_both_started := (v_match.player_b_started_at IS NOT NULL);
  ELSE
    IF v_match.player_b_started_at IS NULL THEN
      UPDATE public.matches
      SET player_b_started_at = v_now,
          updated_at = v_now
      WHERE id = p_match_id;
    END IF;
    v_both_started := (v_match.player_a_started_at IS NOT NULL);
  END IF;

  IF v_both_started THEN
    v_actual_start := COALESCE(v_match.actual_start_time, v_now);
    v_deadline := v_actual_start + interval '30 minutes';
    v_new_status := 'in_progress';

    UPDATE public.matches
    SET status = 'in_progress',
        actual_start_time = v_actual_start,
        completion_deadline = v_deadline,
        submission_deadline = v_deadline,
        updated_at = v_now
    WHERE id = p_match_id;
  ELSE
    v_new_status := 'waiting_for_players';
    UPDATE public.matches
    SET status = 'waiting_for_players',
        updated_at = v_now
    WHERE id = p_match_id
      AND status NOT IN ('in_progress', 'awaiting_result', 'result_verification', 'disputed', 'result_pending_admin');
  END IF;

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
    'player_start_match',
    jsonb_build_object(
      'participant_id', p_participant_id,
      'is_participant_a', v_is_participant_a,
      'status', v_new_status,
      'both_started', v_both_started,
      'actual_start_time', v_actual_start,
      'completion_deadline', v_deadline
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'match_id', p_match_id,
    'status', v_new_status,
    'both_started', v_both_started,
    'actual_start_time', v_actual_start,
    'completion_deadline', v_deadline
  );
END;
$$;

-- Procedure B: Submit Player Score & Detect Conflicts
CREATE OR REPLACE FUNCTION public.submit_player_score(
  p_match_id UUID,
  p_participant_id UUID,
  p_user_id UUID,
  p_my_score INTEGER,
  p_opponent_score INTEGER
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
  v_opp_part_id UUID;
  v_opp_sub RECORD;
  v_now TIMESTAMPTZ := now();
  v_claimed_a INTEGER;
  v_claimed_b INTEGER;
  v_opp_claimed_a INTEGER;
  v_opp_claimed_b INTEGER;
  v_matching BOOLEAN;
  v_dispute_id UUID;
BEGIN
  IF p_my_score < 0 OR p_opponent_score < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Scores cannot be negative');
  END IF;

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

  IF v_is_participant_a THEN
    v_opp_part_id := v_match.participant_b;
    v_claimed_a := p_my_score;
    v_claimed_b := p_opponent_score;
  ELSE
    v_opp_part_id := v_match.participant_a;
    v_claimed_a := p_opponent_score;
    v_claimed_b := p_my_score;
  END IF;

  IF v_match.actual_start_time IS NULL AND (v_match.player_a_started_at IS NULL OR v_match.player_b_started_at IS NULL) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot submit score: Match has not been started by both players yet');
  END IF;

  IF v_match.status IN ('completed', 'walkover', 'cancelled', 'COMPLETED') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match is already completed and finalized. Results cannot be modified.');
  END IF;

  IF v_match.completion_deadline IS NOT NULL AND v_now > v_match.completion_deadline THEN
    UPDATE public.matches
    SET status = 'result_pending_admin',
        forfeit_reason = '30-minute result submission window expired',
        updated_at = v_now
    WHERE id = p_match_id;

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
      v_opp_part_id,
      'timeout_no_result',
      'Result submission attempted after 30-minute match deadline elapsed',
      'open'
    );

    RETURN jsonb_build_object(
      'success', false,
      'expired', true,
      'status', 'result_pending_admin',
      'error', 'The 30-minute match completion window has expired. Match is marked for Admin Review.'
    );
  END IF;

  INSERT INTO public.match_submissions (
    match_id,
    tournament_id,
    participant_id,
    user_id,
    my_score,
    opponent_score,
    updated_at
  ) VALUES (
    p_match_id,
    v_match.tournament_id,
    p_participant_id,
    p_user_id,
    p_my_score,
    p_opponent_score,
    v_now
  )
  ON CONFLICT (match_id, participant_id) DO UPDATE SET
    my_score = EXCLUDED.my_score,
    opponent_score = EXCLUDED.opponent_score,
    updated_at = v_now;

  SELECT * INTO v_opp_sub
  FROM public.match_submissions
  WHERE match_id = p_match_id AND participant_id = v_opp_part_id;

  IF NOT FOUND THEN
    UPDATE public.matches
    SET status = 'awaiting_result',
        updated_at = v_now
    WHERE id = p_match_id;

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
      'score_submitted_single',
      jsonb_build_object(
        'participant_id', p_participant_id,
        'my_score', p_my_score,
        'opponent_score', p_opponent_score
      )
    );

    RETURN jsonb_build_object(
      'success', true,
      'status', 'awaiting_result',
      'both_submitted', false,
      'message', 'Your score was submitted successfully. Waiting for your opponent to submit their score.'
    );
  END IF;

  IF v_is_participant_a THEN
    v_opp_claimed_a := v_opp_sub.opponent_score;
    v_opp_claimed_b := v_opp_sub.my_score;
  ELSE
    v_opp_claimed_a := v_opp_sub.my_score;
    v_opp_claimed_b := v_opp_sub.opponent_score;
  END IF;

  v_matching := (v_claimed_a = v_opp_claimed_a AND v_claimed_b = v_opp_claimed_b);

  IF v_matching THEN
    IF v_claimed_a > v_claimed_b THEN
      v_winner_id := v_match.participant_a;
    ELSIF v_claimed_b > v_claimed_a THEN
      v_winner_id := v_match.participant_b;
    ELSE
      v_winner_id := NULL;
    END IF;

    UPDATE public.matches
    SET status = 'completed',
        score_a = v_claimed_a,
        score_b = v_claimed_b,
        winner_id = v_winner_id,
        completed_at = v_now,
        updated_at = v_now
    WHERE id = p_match_id;

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
      'system',
      'scores_matched_auto_verify',
      jsonb_build_object(
        'score_a', v_claimed_a,
        'score_b', v_claimed_b,
        'winner_id', v_winner_id
      )
    );

    RETURN jsonb_build_object(
      'success', true,
      'status', 'completed',
      'both_submitted', true,
      'matching', true,
      'score_a', v_claimed_a,
      'score_b', v_claimed_b,
      'winner_id', v_winner_id,
      'message', 'Scores match! Result verified automatically and marked as completed.'
    );
  ELSE
    UPDATE public.matches
    SET status = 'disputed',
        forfeit_reason = 'Conflicting scores reported: P1 reported ' || v_claimed_a || '-' || v_claimed_b || ', P2 reported ' || v_opp_claimed_a || '-' || v_opp_claimed_b,
        updated_at = v_now
    WHERE id = p_match_id;

    INSERT INTO public.match_disputes (
      match_id,
      tournament_id,
      reporter_participant_id,
      opponent_participant_id,
      reason,
      details,
      reporter_score_a,
      reporter_score_b,
      opponent_score_a,
      opponent_score_b,
      status
    ) VALUES (
      p_match_id,
      v_match.tournament_id,
      p_participant_id,
      v_opp_part_id,
      'conflicting_scores',
      'Conflicting scores reported: ' || v_claimed_a || '-' || v_claimed_b || ' vs ' || v_opp_claimed_a || '-' || v_opp_claimed_b,
      v_claimed_a,
      v_claimed_b,
      v_opp_claimed_a,
      v_opp_claimed_b,
      'open'
    ) RETURNING id INTO v_dispute_id;

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
      'system',
      'conflicting_scores_dispute',
      jsonb_build_object(
        'dispute_id', v_dispute_id,
        'p1_claimed', jsonb_build_object('a', v_claimed_a, 'b', v_claimed_b),
        'p2_claimed', jsonb_build_object('a', v_opp_claimed_a, 'b', v_opp_claimed_b)
      )
    );

    RETURN jsonb_build_object(
      'success', true,
      'status', 'disputed',
      'both_submitted', true,
      'matching', false,
      'conflict', true,
      'dispute_id', v_dispute_id,
      'message', 'Scores do not match. The match is marked DISPUTED. Please upload screenshot proof.'
    );
  END IF;
END;
$$;

-- Procedure C: Submit Screenshot Proof for Disputed Match
CREATE OR REPLACE FUNCTION public.submit_match_screenshot_proof(
  p_match_id UUID,
  p_participant_id UUID,
  p_user_id UUID,
  p_screenshot_url TEXT,
  p_screenshot_public_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_match RECORD;
  v_dispute RECORD;
  v_is_reporter BOOLEAN;
  v_now TIMESTAMPTZ := now();
  v_both_evidence BOOLEAN := false;
BEGIN
  IF p_screenshot_url IS NULL OR trim(p_screenshot_url) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Screenshot URL cannot be empty');
  END IF;

  SELECT * INTO v_match
  FROM public.matches
  WHERE id = p_match_id;

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

  UPDATE public.match_submissions
  SET screenshot_url = p_screenshot_url,
      screenshot_public_id = p_screenshot_public_id,
      updated_at = v_now
  WHERE match_id = p_match_id AND participant_id = p_participant_id;

  SELECT * INTO v_dispute
  FROM public.match_disputes
  WHERE match_id = p_match_id AND status IN ('open', 'under_review')
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    v_is_reporter := (v_dispute.reporter_participant_id = p_participant_id);

    IF v_is_reporter THEN
      UPDATE public.match_disputes
      SET reporter_screenshot_url = p_screenshot_url,
          evidence_url = COALESCE(evidence_url, p_screenshot_url),
          updated_at = v_now
      WHERE id = v_dispute.id;
      v_both_evidence := (v_dispute.opponent_screenshot_url IS NOT NULL);
    ELSE
      UPDATE public.match_disputes
      SET opponent_screenshot_url = p_screenshot_url,
          updated_at = v_now
      WHERE id = v_dispute.id;
      v_both_evidence := (v_dispute.reporter_screenshot_url IS NOT NULL);
    END IF;

    IF v_both_evidence THEN
      UPDATE public.match_disputes
      SET status = 'under_review',
          updated_at = v_now
      WHERE id = v_dispute.id;
    END IF;
  END IF;

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
    'screenshot_proof_submitted',
    jsonb_build_object(
      'participant_id', p_participant_id,
      'screenshot_url', p_screenshot_url,
      'both_evidence_submitted', v_both_evidence
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'match_id', p_match_id,
    'both_evidence_submitted', v_both_evidence,
    'message', 'Screenshot evidence submitted successfully.'
  );
END;
$$;
