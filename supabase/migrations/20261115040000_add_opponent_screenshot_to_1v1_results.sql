-- Migration: Add opponent_screenshot_url to one_vs_one_results and update confirm_one_vs_one_result RPC
-- Timestamp: 2026-11-15T19:11:00Z

-- 1. Add opponent_screenshot_url to one_vs_one_results
ALTER TABLE public.one_vs_one_results 
ADD COLUMN IF NOT EXISTS opponent_screenshot_url TEXT;

-- 2. Update confirm_one_vs_one_result to accept p_opponent_screenshot_url
CREATE OR REPLACE FUNCTION public.confirm_one_vs_one_result(
  p_match_id UUID,
  p_user_id UUID,
  p_opponent_screenshot_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_player RECORD;
  v_result RECORD;
  v_settle_res JSONB;
BEGIN
  -- Verify caller is participant
  SELECT * INTO v_player
  FROM public.one_vs_one_match_players
  WHERE match_id = p_match_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized: You are not a registered participant in this match.';
  END IF;

  SELECT * INTO v_result
  FROM public.one_vs_one_results
  WHERE match_id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No result has been submitted yet to confirm.';
  END IF;

  IF v_result.submitted_by = p_user_id THEN
    RAISE EXCEPTION 'You cannot confirm your own score submission; the opponent must confirm.';
  END IF;

  UPDATE public.one_vs_one_results
  SET status = 'confirmed',
      opponent_confirmed_at = now(),
      opponent_screenshot_url = COALESCE(p_opponent_screenshot_url, opponent_screenshot_url),
      updated_at = now()
  WHERE match_id = p_match_id;

  UPDATE public.one_vs_one_matches
  SET status = 'completed',
      completed_at = now(),
      updated_at = now()
  WHERE id = p_match_id;

  -- Deactivate players from active queue
  UPDATE public.one_vs_one_match_players
  SET is_active = false
  WHERE match_id = p_match_id;

  INSERT INTO public.one_vs_one_events (
    match_id,
    actor_id,
    event_type,
    event_payload
  ) VALUES (
    p_match_id,
    p_user_id,
    'result_confirmed',
    jsonb_build_object(
      'confirmed_by', p_user_id,
      'opponent_screenshot_url', p_opponent_screenshot_url,
      'confirmed_at', now()
    )
  );

  -- Perform automatic wallet prize credit settlement
  BEGIN
    v_settle_res := public.settle_one_vs_one_match(p_match_id, p_user_id);
  EXCEPTION WHEN OTHERS THEN
    v_settle_res := jsonb_build_object(
      'settled', false,
      'error', SQLERRM
    );
  END;

  RETURN jsonb_build_object(
    'status', 'completed',
    'settlement', v_settle_res
  );
END;
$$;

-- Ensure grants for authenticated users
REVOKE ALL ON FUNCTION public.confirm_one_vs_one_result(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_one_vs_one_result(UUID, UUID, TEXT) TO authenticated;
