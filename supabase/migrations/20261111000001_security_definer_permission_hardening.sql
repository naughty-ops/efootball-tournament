-- ==============================================================================
-- Migration: 20261111000001_security_definer_permission_hardening.sql
-- Description: Hardens execution permissions and internal authorization guards
--              on all SECURITY DEFINER routines in the public schema.
-- Phase: P1 - Production Security Hardening (Revised & Corrected)
-- ==============================================================================

-- 1. Revoke default PUBLIC and anon execution grants on sensitive administrative functions
REVOKE EXECUTE ON FUNCTION public.admin_approve_manual_registration(uuid, bigint, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_reject_manual_registration(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_under_verification(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_manual_registration(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.evaluate_overdue_matches(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sync_missing_profiles() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.lock_tournament_financial_terms() FROM PUBLIC, anon;

-- Grant EXECUTE exclusively to authenticated users and service_role
GRANT EXECUTE ON FUNCTION public.admin_approve_manual_registration(uuid, bigint, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_reject_manual_registration(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_under_verification(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_manual_registration(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.evaluate_overdue_matches(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_missing_profiles() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lock_tournament_financial_terms() TO service_role;

-- 2. Revoke default PUBLIC and anon execution grants on player match routines
REVOKE EXECUTE ON FUNCTION public.record_player_checkin(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.start_player_match(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.request_match_walkover(uuid, uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.submit_match_screenshot_proof(uuid, uuid, uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.submit_player_score(uuid, uuid, uuid, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.submit_manual_payment(uuid, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.record_player_checkin(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_player_match(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_match_walkover(uuid, uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_match_screenshot_proof(uuid, uuid, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_player_score(uuid, uuid, uuid, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_manual_payment(uuid, text, text) TO authenticated, service_role;

-- 3. Harden internal authorization in evaluate_overdue_matches
CREATE OR REPLACE FUNCTION public.evaluate_overdue_matches(p_tournament_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_r RECORD;
  v_now TIMESTAMPTZ := now();
  v_both_noshow_count INT := 0;
  v_overdue_live_count INT := 0;
  v_is_service_role BOOLEAN;
  v_is_admin BOOLEAN;
BEGIN
  -- Strict internal authorization guard: Administrator or trusted service-role caller
  v_is_service_role := (COALESCE(auth.role(), '') = 'service_role' OR COALESCE(auth.jwt() ->> 'role', '') = 'service_role');
  v_is_admin := public.is_admin();

  IF NOT (v_is_admin OR v_is_service_role) THEN
    RAISE EXCEPTION 'Unauthorized: Administrator privileges required to evaluate overdue matches';
  END IF;

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

-- 4. Harden internal authorization in sync_missing_profiles
CREATE OR REPLACE FUNCTION public.sync_missing_profiles()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
  v_is_service_role BOOLEAN;
  v_is_admin BOOLEAN;
BEGIN
  -- Strict internal authorization guard: Administrator or trusted service-role caller
  v_is_service_role := (COALESCE(auth.role(), '') = 'service_role' OR COALESCE(auth.jwt() ->> 'role', '') = 'service_role');
  v_is_admin := public.is_admin();

  IF NOT (v_is_admin OR v_is_service_role) THEN
    RAISE EXCEPTION 'Unauthorized: Administrator privileges required to synchronize missing profiles';
  END IF;

  WITH inserted AS (
    INSERT INTO public.profiles (
      id,
      email,
      display_name,
      efootball_id,
      efootball_id_verified,
      efootball_verification_status,
      efootball_rejection_reason,
      whatsapp_number,
      whatsapp_verified,
      whatsapp_verification_status,
      account_status,
      created_at,
      updated_at
    )
    SELECT
      u.id,
      u.email,
      COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1), 'Player'),
      CASE 
        WHEN u.raw_user_meta_data->>'efootball_id' IS NOT NULL 
             AND u.raw_user_meta_data->>'efootball_id' != '' 
             AND EXISTS (SELECT 1 FROM public.profiles ep WHERE ep.efootball_id = (u.raw_user_meta_data->>'efootball_id') AND ep.id != u.id)
        THEN ''
        ELSE COALESCE(u.raw_user_meta_data->>'efootball_id', '')
      END,
      CASE
        WHEN u.raw_user_meta_data->>'efootball_id' IS NOT NULL 
             AND u.raw_user_meta_data->>'efootball_id' != '' 
             AND EXISTS (SELECT 1 FROM public.profiles ep WHERE ep.efootball_id = (u.raw_user_meta_data->>'efootball_id') AND ep.id != u.id)
        THEN FALSE
        ELSE COALESCE((u.raw_user_meta_data->>'efootball_id_verified')::boolean, false)
      END,
      CASE
        WHEN u.raw_user_meta_data->>'efootball_id' IS NOT NULL 
             AND u.raw_user_meta_data->>'efootball_id' != '' 
             AND EXISTS (SELECT 1 FROM public.profiles ep WHERE ep.efootball_id = (u.raw_user_meta_data->>'efootball_id') AND ep.id != u.id)
        THEN 'rejected'
        ELSE COALESCE(u.raw_user_meta_data->>'efootball_verification_status', 'pending')
      END,
      CASE
        WHEN u.raw_user_meta_data->>'efootball_id' IS NOT NULL 
             AND u.raw_user_meta_data->>'efootball_id' != '' 
             AND EXISTS (SELECT 1 FROM public.profiles ep WHERE ep.efootball_id = (u.raw_user_meta_data->>'efootball_id') AND ep.id != u.id)
        THEN 'Duplicate eFootball ID already registered: ' || (u.raw_user_meta_data->>'efootball_id')
        ELSE NULL
      END,
      COALESCE(u.raw_user_meta_data->>'whatsapp_number', ''),
      COALESCE((u.raw_user_meta_data->>'whatsapp_verified')::boolean, false),
      COALESCE(u.raw_user_meta_data->>'whatsapp_verification_status', 'pending'),
      'active',
      u.created_at,
      NOW()
    FROM auth.users u
    WHERE NOT EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = u.id
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM inserted;

  RETURN v_count;
END;
$$;

-- 5. Harden player identity spoofing prevention in record_player_checkin
CREATE OR REPLACE FUNCTION public.record_player_checkin(p_match_id uuid, p_participant_id uuid, p_user_id uuid)
RETURNS jsonb
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
  v_is_service_role BOOLEAN;
  v_is_admin BOOLEAN;
BEGIN
  v_is_service_role := (COALESCE(auth.role(), '') = 'service_role' OR COALESCE(auth.jwt() ->> 'role', '') = 'service_role');
  v_is_admin := public.is_admin();

  -- Identity check: Non-admin, non-service_role callers must be authenticated as p_user_id
  IF NOT (v_is_admin OR v_is_service_role) THEN
    IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Session identity does not match requested user');
    END IF;
  END IF;

  -- Participant verification: Verify that participant belongs to p_user_id (applies to players and service_role)
  IF NOT v_is_admin THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.participants
      WHERE id = p_participant_id AND user_id = p_user_id
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unauthorized participant: participant does not belong to specified user');
    END IF;
  END IF;

  SELECT * INTO v_match
  FROM public.matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;

  v_is_participant_a := (v_match.participant_a = p_participant_id);
  v_is_participant_b := (v_match.participant_b = p_participant_id);

  IF NOT v_is_participant_a AND NOT v_is_participant_b THEN
    RETURN jsonb_build_object('success', false, 'error', 'Participant is not assigned to this match');
  END IF;

  IF v_match.status IN ('completed', 'walkover', 'cancelled', 'forfeited') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match has already concluded (' || v_match.status || ')');
  END IF;

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

  IF v_opponent_started AND v_match.status IN ('scheduled', 'ready', 'pending') THEN
    UPDATE public.matches
    SET status = 'live',
        updated_at = v_now
    WHERE id = p_match_id;
    v_new_status := 'live';
  ELSE
    v_new_status := v_match.status;
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

-- 6. Harden player identity spoofing prevention in start_player_match
CREATE OR REPLACE FUNCTION public.start_player_match(p_match_id uuid, p_participant_id uuid, p_user_id uuid)
RETURNS jsonb
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
  v_is_service_role BOOLEAN;
  v_is_admin BOOLEAN;
BEGIN
  v_is_service_role := (COALESCE(auth.role(), '') = 'service_role' OR COALESCE(auth.jwt() ->> 'role', '') = 'service_role');
  v_is_admin := public.is_admin();

  -- Identity check: Non-admin, non-service_role callers must be authenticated as p_user_id
  IF NOT (v_is_admin OR v_is_service_role) THEN
    IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Session identity does not match requested user');
    END IF;
  END IF;

  -- Participant verification: Verify that participant belongs to p_user_id (applies to players and service_role)
  IF NOT v_is_admin THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.participants
      WHERE id = p_participant_id AND user_id = p_user_id
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Participant is not associated with the specified player');
    END IF;
  END IF;

  -- Lock match row for update
  SELECT * INTO v_match
  FROM public.matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;

  v_is_participant_a := (v_match.participant_a = p_participant_id);
  v_is_participant_b := (v_match.participant_b = p_participant_id);

  IF NOT v_is_participant_a AND NOT v_is_participant_b THEN
    RETURN jsonb_build_object('success', false, 'error', 'Participant is not assigned to this match');
  END IF;

  -- Prevent restart if match is already in terminal state
  IF v_match.status IN ('completed', 'walkover', 'cancelled', 'forfeited', 'COMPLETED') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match has already concluded (' || v_match.status || ')');
  END IF;

  -- Update individual checkin timestamp
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

  -- If BOTH players have started:
  -- Transition to in_progress, record actual_start_time, activate 30-minute completion countdown
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
    -- Waiting for opponent to confirm
    v_new_status := 'waiting_for_players';
    UPDATE public.matches
    SET status = 'waiting_for_players',
        updated_at = v_now
    WHERE id = p_match_id
      AND status NOT IN ('in_progress', 'awaiting_result', 'result_verification', 'disputed', 'result_pending_admin');
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

-- 7. Harden player identity spoofing prevention in request_match_walkover
CREATE OR REPLACE FUNCTION public.request_match_walkover(p_match_id uuid, p_participant_id uuid, p_user_id uuid, p_reason text DEFAULT 'Opponent no-show after grace period'::text)
RETURNS jsonb
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
  v_is_service_role BOOLEAN;
  v_is_admin BOOLEAN;
BEGIN
  v_is_service_role := (COALESCE(auth.role(), '') = 'service_role' OR COALESCE(auth.jwt() ->> 'role', '') = 'service_role');
  v_is_admin := public.is_admin();

  -- Identity check: Non-admin, non-service_role callers must be authenticated as p_user_id
  IF NOT (v_is_admin OR v_is_service_role) THEN
    IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Session identity does not match requested user');
    END IF;
  END IF;

  -- Participant verification: Verify that participant belongs to p_user_id (applies to players and service_role)
  IF NOT v_is_admin THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.participants
      WHERE id = p_participant_id AND user_id = p_user_id
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Participant is not associated with the specified player');
    END IF;
  END IF;

  SELECT * INTO v_match
  FROM public.matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
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

  IF v_my_started_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You must check in / start the match yourself before requesting a walkover');
  END IF;

  IF v_opponent_started_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Opponent has already checked in. Cannot request no-show walkover.');
  END IF;

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

  IF v_match.walkover_requested_by IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'A walkover request is already pending review for this match');
  END IF;

  UPDATE public.matches
  SET walkover_requested_by = p_participant_id,
      walkover_requested_at = v_now,
      forfeit_reason = p_reason,
      status = 'under_review',
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
    v_opponent_id,
    'opponent_no_show',
    p_reason,
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

-- 8. Harden player identity spoofing prevention in submit_match_screenshot_proof
CREATE OR REPLACE FUNCTION public.submit_match_screenshot_proof(p_match_id uuid, p_participant_id uuid, p_user_id uuid, p_screenshot_url text, p_screenshot_public_id text)
RETURNS jsonb
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
  v_is_service_role BOOLEAN;
  v_is_admin BOOLEAN;
BEGIN
  IF p_screenshot_url IS NULL OR trim(p_screenshot_url) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Screenshot URL cannot be empty');
  END IF;

  v_is_service_role := (COALESCE(auth.role(), '') = 'service_role' OR COALESCE(auth.jwt() ->> 'role', '') = 'service_role');
  v_is_admin := public.is_admin();

  -- Identity check: Non-admin, non-service_role callers must be authenticated as p_user_id
  IF NOT (v_is_admin OR v_is_service_role) THEN
    IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Session identity does not match requested user');
    END IF;
  END IF;

  -- Participant verification: Verify that participant belongs to p_user_id (applies to players and service_role)
  IF NOT v_is_admin THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.participants
      WHERE id = p_participant_id AND user_id = p_user_id
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Participant is not associated with the specified player');
    END IF;
  END IF;

  SELECT * INTO v_match
  FROM public.matches
  WHERE id = p_match_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;

  -- Update player submission record with screenshot proof
  UPDATE public.match_submissions
  SET screenshot_url = p_screenshot_url,
      screenshot_public_id = p_screenshot_public_id,
      updated_at = v_now
  WHERE match_id = p_match_id AND participant_id = p_participant_id;

  -- Find active dispute for this match
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

    -- If both players have submitted evidence, transition dispute to under_review
    IF v_both_evidence THEN
      UPDATE public.match_disputes
      SET status = 'under_review',
          updated_at = v_now
      WHERE id = v_dispute.id;
    END IF;
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

-- 9. Harden player identity spoofing prevention in submit_player_score
CREATE OR REPLACE FUNCTION public.submit_player_score(
  p_match_id uuid,
  p_participant_id uuid,
  p_user_id uuid,
  p_my_score integer,
  p_opponent_score integer
)
RETURNS jsonb
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
  v_winner_id UUID := NULL;
  v_dispute_id UUID;
  v_is_service_role BOOLEAN;
  v_is_admin BOOLEAN;
BEGIN
  IF p_my_score < 0 OR p_opponent_score < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Scores cannot be negative');
  END IF;

  v_is_service_role := (COALESCE(auth.role(), '') = 'service_role' OR COALESCE(auth.jwt() ->> 'role', '') = 'service_role');
  v_is_admin := public.is_admin();

  -- Identity check: Non-admin, non-service_role callers must be authenticated as p_user_id
  IF NOT (v_is_admin OR v_is_service_role) THEN
    IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Session identity does not match requested user');
    END IF;
  END IF;

  -- Participant verification: Verify that participant belongs to p_user_id (applies to players and service_role)
  IF NOT v_is_admin THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.participants
      WHERE id = p_participant_id AND user_id = p_user_id
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unauthorized participant: participant does not belong to specified user');
    END IF;
  END IF;

  SELECT * INTO v_match
  FROM public.matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
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

  IF v_match.submission_deadline IS NOT NULL AND v_now > v_match.submission_deadline THEN
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
      'scores_conflict_disputed',
      jsonb_build_object(
        'dispute_id', v_dispute_id,
        'my_score_a', v_claimed_a,
        'my_score_b', v_claimed_b,
        'opp_score_a', v_opp_claimed_a,
        'opp_score_b', v_opp_claimed_b
      )
    );

    RETURN jsonb_build_object(
      'success', true,
      'status', 'disputed',
      'both_submitted', true,
      'conflict', true,
      'dispute_id', v_dispute_id,
      'message', 'Conflicting scores reported. Match has been flagged as DISPUTED. Please upload screenshot proof.'
    );
  END IF;
END;
$$;

-- 10. Pin search_path on trigger functions to eliminate mutable search_path warnings
ALTER FUNCTION public.set_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public._admin_role_rank(public.admin_role) SET search_path = public, pg_temp;
ALTER FUNCTION public.set_support_ticket_number() SET search_path = public, pg_temp;
ALTER FUNCTION public.set_match_dispute_ticket_number() SET search_path = public, pg_temp;
