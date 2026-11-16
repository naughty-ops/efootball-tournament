-- ============================================================================
-- Migration: 20261115010000_create_one_vs_one_arena_system.sql
-- Description:
-- Production Schema, Hardened RLS, Atomic Concurrency Stored Procedures,
-- and Seed Data for the Admin-Managed 1 VS 1 Challenge Arena.
--
-- Features:
-- 1. Isolated tables: one_vs_one_cards, one_vs_one_matches, one_vs_one_match_players,
--    one_vs_one_results, one_vs_one_disputes, one_vs_one_events, one_vs_one_eligibility_records.
-- 2. Concurrency-safe atomic matchmaking using FOR UPDATE SKIP LOCKED.
-- 3. Invariant: One active match per player enforced via partial unique index.
-- 4. Complete player workflow support:
--    Select Card -> Waiting Queue -> Match Opponent -> Room Submission ->
--    Ready Confirmation -> In-Progress Match -> Result Submission -> Opponent Confirm -> Admin Verification.
-- 5. Strict FREE/DRY-RUN mode enforcement (zero balance mutations or financial ledger writes).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table: public.one_vs_one_cards
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.one_vs_one_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  entry_amount NUMERIC(10, 2) NOT NULL CHECK (entry_amount >= 0),
  advertised_payout NUMERIC(10, 2) NOT NULL CHECK (advertised_payout >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
  display_order INTEGER NOT NULL DEFAULT 0,
  max_concurrent_matches INTEGER NOT NULL DEFAULT 50,
  max_daily_matches INTEGER NOT NULL DEFAULT 200,
  availability_start TIMESTAMPTZ,
  availability_end TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_one_vs_one_cards_status_order
  ON public.one_vs_one_cards (status, display_order ASC);

-- ----------------------------------------------------------------------------
-- 2. Table: public.one_vs_one_matches
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.one_vs_one_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_code TEXT NOT NULL UNIQUE,
  card_id UUID NOT NULL REFERENCES public.one_vs_one_cards(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (
    status IN (
      'waiting',
      'matched',
      'room_submitted',
      'ready',
      'in_progress',
      'result_submitted',
      'completed',
      'disputed',
      'cancelled',
      'expired'
    )
  ),
  match_mode TEXT NOT NULL DEFAULT 'free' CHECK (match_mode IN ('free', 'dry_run')),
  room_id TEXT,
  room_password TEXT,
  room_submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  room_submitted_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  matched_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '10 minutes'),
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_one_vs_one_matches_card_status
  ON public.one_vs_one_matches (card_id, status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_one_vs_one_matches_created_by
  ON public.one_vs_one_matches (created_by, status);

CREATE INDEX IF NOT EXISTS idx_one_vs_one_matches_expires
  ON public.one_vs_one_matches (status, expires_at);

-- ----------------------------------------------------------------------------
-- 3. Table: public.one_vs_one_match_players
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.one_vs_one_match_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.one_vs_one_matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_position INTEGER NOT NULL CHECK (player_position IN (1, 2)),
  ready_status TEXT NOT NULL DEFAULT 'pending' CHECK (ready_status IN ('pending', 'ready')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ready_at TIMESTAMPTZ,
  room_viewed_at TIMESTAMPTZ,
  CONSTRAINT uq_one_vs_one_match_position UNIQUE (match_id, player_position),
  CONSTRAINT uq_one_vs_one_match_user UNIQUE (match_id, user_id)
);

-- Partial unique index strictly guaranteeing that a player cannot be active in multiple matches
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_vs_one_active_player_unique
  ON public.one_vs_one_match_players (user_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_one_vs_one_players_match_id
  ON public.one_vs_one_match_players (match_id);

-- ----------------------------------------------------------------------------
-- 4. Table: public.one_vs_one_results
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.one_vs_one_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.one_vs_one_matches(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claimed_winner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_one_score INTEGER NOT NULL CHECK (player_one_score >= 0),
  player_two_score INTEGER NOT NULL CHECK (player_two_score >= 0),
  screenshot_url TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'confirmed', 'disputed', 'verified')),
  opponent_confirmed_at TIMESTAMPTZ,
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_one_vs_one_result_match UNIQUE (match_id)
);

-- ----------------------------------------------------------------------------
-- 5. Table: public.one_vs_one_disputes
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.one_vs_one_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.one_vs_one_matches(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  description TEXT NOT NULL,
  evidence_url TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved', 'dismissed')),
  admin_notes TEXT,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_one_vs_one_disputes_match_status
  ON public.one_vs_one_disputes (match_id, status);

-- ----------------------------------------------------------------------------
-- 6. Table: public.one_vs_one_events
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.one_vs_one_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID REFERENCES public.one_vs_one_matches(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_one_vs_one_events_match
  ON public.one_vs_one_events (match_id, created_at ASC);

-- ----------------------------------------------------------------------------
-- 7. Table: public.one_vs_one_eligibility_records
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.one_vs_one_eligibility_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  acknowledgement_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  policy_version TEXT NOT NULL,
  jurisdiction TEXT NOT NULL DEFAULT 'IN',
  eligibility_status TEXT NOT NULL DEFAULT 'acknowledged',
  CONSTRAINT uq_one_vs_one_user_policy_version UNIQUE (user_id, policy_version)
);

-- ============================================================================
-- 8. Row Level Security (RLS) Configuration
-- ============================================================================
ALTER TABLE public.one_vs_one_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.one_vs_one_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.one_vs_one_match_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.one_vs_one_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.one_vs_one_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.one_vs_one_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.one_vs_one_eligibility_records ENABLE ROW LEVEL SECURITY;

-- 8.1 one_vs_one_cards RLS
DROP POLICY IF EXISTS "Public can view active cards" ON public.one_vs_one_cards;
CREATE POLICY "Public can view active cards"
  ON public.one_vs_one_cards FOR SELECT
  USING (
    status = 'active' OR
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE admin_users.id = auth.uid() AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Admins can manage cards" ON public.one_vs_one_cards;
CREATE POLICY "Admins can manage cards"
  ON public.one_vs_one_cards FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE admin_users.id = auth.uid() AND is_active = true AND role IN ('super_admin', 'admin')
    )
  );

-- 8.2 one_vs_one_matches RLS
DROP POLICY IF EXISTS "Participants and admins can view matches" ON public.one_vs_one_matches;
CREATE POLICY "Participants and admins can view matches"
  ON public.one_vs_one_matches FOR SELECT
  USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.one_vs_one_match_players
      WHERE one_vs_one_match_players.match_id = one_vs_one_matches.id
        AND one_vs_one_match_players.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE admin_users.id = auth.uid() AND is_active = true
    )
  );

-- 8.3 one_vs_one_match_players RLS
DROP POLICY IF EXISTS "Participants and admins can view match players" ON public.one_vs_one_match_players;
CREATE POLICY "Participants and admins can view match players"
  ON public.one_vs_one_match_players FOR SELECT
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.one_vs_one_match_players p2
      WHERE p2.match_id = one_vs_one_match_players.match_id
        AND p2.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE admin_users.id = auth.uid() AND is_active = true
    )
  );

-- 8.4 one_vs_one_results RLS
DROP POLICY IF EXISTS "Participants and admins view results" ON public.one_vs_one_results;
CREATE POLICY "Participants and admins view results"
  ON public.one_vs_one_results FOR SELECT
  USING (
    submitted_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.one_vs_one_match_players
      WHERE one_vs_one_match_players.match_id = one_vs_one_results.match_id
        AND one_vs_one_match_players.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE admin_users.id = auth.uid() AND is_active = true
    )
  );

-- 8.5 one_vs_one_disputes RLS
DROP POLICY IF EXISTS "Participants and admins view disputes" ON public.one_vs_one_disputes;
CREATE POLICY "Participants and admins view disputes"
  ON public.one_vs_one_disputes FOR SELECT
  USING (
    submitted_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.one_vs_one_match_players
      WHERE one_vs_one_match_players.match_id = one_vs_one_disputes.match_id
        AND one_vs_one_match_players.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE admin_users.id = auth.uid() AND is_active = true
    )
  );

-- 8.6 one_vs_one_events RLS
DROP POLICY IF EXISTS "Participants and admins view events" ON public.one_vs_one_events;
CREATE POLICY "Participants and admins view events"
  ON public.one_vs_one_events FOR SELECT
  USING (
    actor_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.one_vs_one_match_players
      WHERE one_vs_one_match_players.match_id = one_vs_one_events.match_id
        AND one_vs_one_match_players.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE admin_users.id = auth.uid() AND is_active = true
    )
  );

-- 8.7 one_vs_one_eligibility_records RLS
DROP POLICY IF EXISTS "Users view own eligibility" ON public.one_vs_one_eligibility_records;
CREATE POLICY "Users view own eligibility"
  ON public.one_vs_one_eligibility_records FOR SELECT
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE admin_users.id = auth.uid() AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Users insert own eligibility" ON public.one_vs_one_eligibility_records;
CREATE POLICY "Users insert own eligibility"
  ON public.one_vs_one_eligibility_records FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- 9. Hardened Atomic Stored Procedures (Concurrency & Workflows)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 9.1 Atomic Matchmaker: join_or_create_one_vs_one_match
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_or_create_one_vs_one_match(
  p_card_id UUID,
  p_user_id UUID,
  p_jurisdiction TEXT DEFAULT 'IN'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_card RECORD;
  v_active_match_id UUID;
  v_candidate_match RECORD;
  v_match_id UUID;
  v_match_code TEXT;
  v_result JSONB;
BEGIN
  -- 1. Validate Card exists and is active
  SELECT * INTO v_card
  FROM public.one_vs_one_cards
  WHERE id = p_card_id AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Selected challenge card is not currently active or does not exist.';
  END IF;

  -- 2. Verify User does NOT already have an active match
  SELECT match_id INTO v_active_match_id
  FROM public.one_vs_one_match_players
  WHERE user_id = p_user_id AND is_active = true
  LIMIT 1;

  IF v_active_match_id IS NOT NULL THEN
    RAISE EXCEPTION 'You already have an active 1v1 match in progress or waiting in queue.';
  END IF;

  -- Clean up expired waiting matches for this card first
  UPDATE public.one_vs_one_matches
  SET status = 'expired', updated_at = now()
  WHERE card_id = p_card_id
    AND status = 'waiting'
    AND expires_at <= now();

  UPDATE public.one_vs_one_match_players
  SET is_active = false
  WHERE match_id IN (
    SELECT id FROM public.one_vs_one_matches
    WHERE status = 'expired'
  ) AND is_active = true;

  -- 3. Attempt to lock an open waiting match for this card (created by another player)
  SELECT * INTO v_candidate_match
  FROM public.one_vs_one_matches
  WHERE card_id = p_card_id
    AND status = 'waiting'
    AND created_by != p_user_id
    AND expires_at > now()
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  -- 4A. If candidate found: Pair automatically (Player 2 Joins)
  IF v_candidate_match.id IS NOT NULL THEN
    v_match_id := v_candidate_match.id;

    -- Update match status to 'matched'
    UPDATE public.one_vs_one_matches
    SET status = 'matched',
        matched_at = now(),
        updated_at = now()
    WHERE id = v_match_id;

    -- Insert Player 2
    INSERT INTO public.one_vs_one_match_players (
      match_id,
      user_id,
      player_position,
      ready_status,
      is_active
    ) VALUES (
      v_match_id,
      p_user_id,
      2,
      'pending',
      true
    );

    -- Log Event
    INSERT INTO public.one_vs_one_events (
      match_id,
      actor_id,
      event_type,
      event_payload
    ) VALUES (
      v_match_id,
      p_user_id,
      'opponent_matched',
      jsonb_build_object(
        'player2_id', p_user_id,
        'matched_at', now(),
        'card_id', p_card_id
      )
    );

    v_result := jsonb_build_object(
      'success', true,
      'is_matched', true,
      'match_id', v_match_id,
      'match_code', v_candidate_match.match_code,
      'player_position', 2,
      'status', 'matched'
    );
    RETURN v_result;

  -- 4B. If no candidate found: Create new waiting room (Player 1 Enters Queue)
  ELSE
    -- Generate unique human-readable match code
    v_match_code := '1V1-' || upper(substr(md5(random()::text), 1, 4)) || '-' || upper(substr(md5(random()::text), 5, 4));

    INSERT INTO public.one_vs_one_matches (
      match_code,
      card_id,
      status,
      match_mode,
      created_by,
      expires_at
    ) VALUES (
      v_match_code,
      p_card_id,
      'waiting',
      'free',
      p_user_id,
      now() + INTERVAL '10 minutes'
    )
    RETURNING id INTO v_match_id;

    -- Insert Player 1
    INSERT INTO public.one_vs_one_match_players (
      match_id,
      user_id,
      player_position,
      ready_status,
      is_active
    ) VALUES (
      v_match_id,
      p_user_id,
      1,
      'pending',
      true
    );

    -- Log Event
    INSERT INTO public.one_vs_one_events (
      match_id,
      actor_id,
      event_type,
      event_payload
    ) VALUES (
      v_match_id,
      p_user_id,
      'match_created_waiting',
      jsonb_build_object(
        'player1_id', p_user_id,
        'created_at', now(),
        'card_id', p_card_id,
        'match_code', v_match_code
      )
    );

    v_result := jsonb_build_object(
      'success', true,
      'is_matched', false,
      'match_id', v_match_id,
      'match_code', v_match_code,
      'player_position', 1,
      'status', 'waiting'
    );
    RETURN v_result;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.join_or_create_one_vs_one_match(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_or_create_one_vs_one_match(UUID, UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 9.2 Cancel Waiting Match: cancel_waiting_one_vs_one_match
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_waiting_one_vs_one_match(
  p_match_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_match RECORD;
BEGIN
  SELECT * INTO v_match
  FROM public.one_vs_one_matches
  WHERE id = p_match_id AND created_by = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found or you are not authorized to cancel it.';
  END IF;

  IF v_match.status != 'waiting' THEN
    RAISE EXCEPTION 'Cannot cancel match because it is no longer waiting for players (Current status: %)', v_match.status;
  END IF;

  UPDATE public.one_vs_one_matches
  SET status = 'cancelled',
      cancelled_at = now(),
      updated_at = now()
  WHERE id = p_match_id;

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
    'match_cancelled_by_creator',
    jsonb_build_object('cancelled_at', now())
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_waiting_one_vs_one_match(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_waiting_one_vs_one_match(UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 9.3 Submit Room Credentials: submit_one_vs_one_room
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_one_vs_one_room(
  p_match_id UUID,
  p_user_id UUID,
  p_room_id TEXT,
  p_room_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_player RECORD;
  v_match RECORD;
BEGIN
  -- Verify caller is Player 1 in this match
  SELECT * INTO v_player
  FROM public.one_vs_one_match_players
  WHERE match_id = p_match_id AND user_id = p_user_id AND player_position = 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only Player 1 is authorized to create and submit room credentials.';
  END IF;

  SELECT * INTO v_match
  FROM public.one_vs_one_matches
  WHERE id = p_match_id;

  IF v_match.status NOT IN ('matched', 'room_submitted') THEN
    RAISE EXCEPTION 'Cannot submit room credentials for a match with status: %', v_match.status;
  END IF;

  IF p_room_id IS NULL OR trim(p_room_id) = '' THEN
    RAISE EXCEPTION 'eFootball Room ID cannot be empty.';
  END IF;

  UPDATE public.one_vs_one_matches
  SET room_id = trim(p_room_id),
      room_password = trim(p_room_password),
      room_submitted_by = p_user_id,
      room_submitted_at = now(),
      status = 'room_submitted',
      updated_at = now()
  WHERE id = p_match_id;

  INSERT INTO public.one_vs_one_events (
    match_id,
    actor_id,
    event_type,
    event_payload
  ) VALUES (
    p_match_id,
    p_user_id,
    'room_submitted',
    jsonb_build_object('room_id', trim(p_room_id), 'submitted_at', now())
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_one_vs_one_room(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_one_vs_one_room(UUID, UUID, TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 9.4 Confirm Player Readiness: confirm_one_vs_one_ready
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_one_vs_one_ready(
  p_match_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_player RECORD;
  v_match RECORD;
  v_all_ready BOOLEAN;
BEGIN
  -- Verify caller is participant
  SELECT * INTO v_player
  FROM public.one_vs_one_match_players
  WHERE match_id = p_match_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized: You are not a registered participant in this match.';
  END IF;

  SELECT * INTO v_match
  FROM public.one_vs_one_matches
  WHERE id = p_match_id;

  IF v_match.status NOT IN ('room_submitted', 'ready') THEN
    RAISE EXCEPTION 'Cannot confirm readiness: Room details have not been submitted or match already started.';
  END IF;

  -- Mark player as ready
  UPDATE public.one_vs_one_match_players
  SET ready_status = 'ready',
      ready_at = now()
  WHERE match_id = p_match_id AND user_id = p_user_id;

  -- Check if both players are now ready
  SELECT (count(*) = 2) INTO v_all_ready
  FROM public.one_vs_one_match_players
  WHERE match_id = p_match_id AND ready_status = 'ready';

  IF v_all_ready THEN
    UPDATE public.one_vs_one_matches
    SET status = 'in_progress',
        started_at = now(),
        updated_at = now()
    WHERE id = p_match_id;

    INSERT INTO public.one_vs_one_events (
      match_id,
      actor_id,
      event_type,
      event_payload
    ) VALUES (
      p_match_id,
      p_user_id,
      'match_started',
      jsonb_build_object('started_at', now())
    );

    RETURN jsonb_build_object('success', true, 'status', 'in_progress', 'both_ready', true);
  ELSE
    UPDATE public.one_vs_one_matches
    SET status = 'ready',
        updated_at = now()
    WHERE id = p_match_id;

    INSERT INTO public.one_vs_one_events (
      match_id,
      actor_id,
      event_type,
      event_payload
    ) VALUES (
      p_match_id,
      p_user_id,
      'player_ready',
      jsonb_build_object('player_id', p_user_id, 'ready_at', now())
    );

    RETURN jsonb_build_object('success', true, 'status', 'ready', 'both_ready', false);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_one_vs_one_ready(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_one_vs_one_ready(UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 9.5 Submit Match Result: submit_one_vs_one_result
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_one_vs_one_result(
  p_match_id UUID,
  p_user_id UUID,
  p_claimed_winner_id UUID,
  p_p1_score INTEGER,
  p_p2_score INTEGER,
  p_screenshot_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_player RECORD;
  v_match RECORD;
BEGIN
  -- Verify caller is participant
  SELECT * INTO v_player
  FROM public.one_vs_one_match_players
  WHERE match_id = p_match_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized: You are not a registered participant in this match.';
  END IF;

  SELECT * INTO v_match
  FROM public.one_vs_one_matches
  WHERE id = p_match_id;

  IF v_match.status NOT IN ('in_progress', 'ready', 'room_submitted') THEN
    RAISE EXCEPTION 'Cannot submit score for match in current status: %', v_match.status;
  END IF;

  -- Upsert Result
  INSERT INTO public.one_vs_one_results (
    match_id,
    submitted_by,
    claimed_winner_id,
    player_one_score,
    player_two_score,
    screenshot_url,
    status
  ) VALUES (
    p_match_id,
    p_user_id,
    p_claimed_winner_id,
    p_p1_score,
    p_p2_score,
    p_screenshot_url,
    'submitted'
  )
  ON CONFLICT (match_id) DO UPDATE SET
    submitted_by = EXCLUDED.submitted_by,
    claimed_winner_id = EXCLUDED.claimed_winner_id,
    player_one_score = EXCLUDED.player_one_score,
    player_two_score = EXCLUDED.player_two_score,
    screenshot_url = COALESCE(EXCLUDED.screenshot_url, one_vs_one_results.screenshot_url),
    status = 'submitted',
    updated_at = now();

  -- Update Match Status
  UPDATE public.one_vs_one_matches
  SET status = 'result_submitted',
      updated_at = now()
  WHERE id = p_match_id;

  INSERT INTO public.one_vs_one_events (
    match_id,
    actor_id,
    event_type,
    event_payload
  ) VALUES (
    p_match_id,
    p_user_id,
    'result_submitted',
    jsonb_build_object(
      'submitted_by', p_user_id,
      'claimed_winner_id', p_claimed_winner_id,
      'score', p_p1_score || '-' || p_p2_score
    )
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_one_vs_one_result(UUID, UUID, UUID, INTEGER, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_one_vs_one_result(UUID, UUID, UUID, INTEGER, INTEGER, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 9.6 Confirm Opponent Result: confirm_one_vs_one_result
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_one_vs_one_result(
  p_match_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_player RECORD;
  v_result RECORD;
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
    jsonb_build_object('confirmed_by', p_user_id, 'confirmed_at', now())
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_one_vs_one_result(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_one_vs_one_result(UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 9.7 Dispute Match Result: dispute_one_vs_one_match
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dispute_one_vs_one_match(
  p_match_id UUID,
  p_user_id UUID,
  p_reason TEXT,
  p_description TEXT,
  p_evidence_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_player RECORD;
BEGIN
  -- Verify caller is participant
  SELECT * INTO v_player
  FROM public.one_vs_one_match_players
  WHERE match_id = p_match_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized: You are not a registered participant in this match.';
  END IF;

  INSERT INTO public.one_vs_one_disputes (
    match_id,
    submitted_by,
    reason,
    description,
    evidence_url,
    status
  ) VALUES (
    p_match_id,
    p_user_id,
    trim(p_reason),
    trim(p_description),
    p_evidence_url,
    'open'
  );

  UPDATE public.one_vs_one_matches
  SET status = 'disputed',
      updated_at = now()
  WHERE id = p_match_id;

  INSERT INTO public.one_vs_one_events (
    match_id,
    actor_id,
    event_type,
    event_payload
  ) VALUES (
    p_match_id,
    p_user_id,
    'dispute_filed',
    jsonb_build_object('disputed_by', p_user_id, 'reason', trim(p_reason))
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.dispute_one_vs_one_match(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dispute_one_vs_one_match(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 9.8 Admin Resolve Dispute: admin_resolve_one_vs_one_dispute
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_resolve_one_vs_one_dispute(
  p_dispute_id UUID,
  p_admin_id UUID,
  p_winner_id UUID,
  p_admin_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_dispute RECORD;
BEGIN
  -- Strict Admin Verification
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE id = p_admin_id AND is_active = true AND role IN ('super_admin', 'admin', 'moderator')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Administrator privileges required to resolve disputes.';
  END IF;

  SELECT * INTO v_dispute
  FROM public.one_vs_one_disputes
  WHERE id = p_dispute_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dispute not found.';
  END IF;

  UPDATE public.one_vs_one_disputes
  SET status = 'resolved',
      admin_notes = p_admin_notes,
      resolved_by = p_admin_id,
      resolved_at = now(),
      updated_at = now()
  WHERE id = p_dispute_id;

  UPDATE public.one_vs_one_results
  SET status = 'verified',
      claimed_winner_id = p_winner_id,
      verified_by = p_admin_id,
      verified_at = now(),
      updated_at = now()
  WHERE match_id = v_dispute.match_id;

  UPDATE public.one_vs_one_matches
  SET status = 'completed',
      completed_at = now(),
      updated_at = now()
  WHERE id = v_dispute.match_id;

  UPDATE public.one_vs_one_match_players
  SET is_active = false
  WHERE match_id = v_dispute.match_id;

  INSERT INTO public.one_vs_one_events (
    match_id,
    actor_id,
    event_type,
    event_payload
  ) VALUES (
    v_dispute.match_id,
    p_admin_id,
    'dispute_resolved_by_admin',
    jsonb_build_object('winner_id', p_winner_id, 'notes', p_admin_notes)
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_resolve_one_vs_one_dispute(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_one_vs_one_dispute(UUID, UUID, UUID, TEXT) TO authenticated;

-- ============================================================================
-- 10. Seed Initial Standard Entry Cards
-- ============================================================================
INSERT INTO public.one_vs_one_cards (
  name,
  entry_amount,
  advertised_payout,
  status,
  display_order,
  max_concurrent_matches,
  max_daily_matches
) VALUES
  ('Rookie Challenge', 10.00, 15.00, 'active', 1, 100, 500),
  ('Pro Contender', 15.00, 25.00, 'active', 2, 100, 500),
  ('Champions Arena', 25.00, 40.00, 'active', 3, 100, 500)
ON CONFLICT DO NOTHING;
