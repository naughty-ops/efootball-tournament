-- Migration: 20261116010000_create_live_match_viewer_tracking_system.sql
-- Description: Creates authoritative, real-time unique viewer tracking architecture with heartbeats, automatic expiration, and security hardening.

-- 1. Create match_viewers table for active presence tracking
CREATE TABLE IF NOT EXISTS public.match_viewers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
    user_id UUID NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'watching' CHECK (status IN ('joining', 'watching', 'reconnecting', 'inactive', 'left')),
    device_type TEXT NOT NULL DEFAULT 'desktop',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '35 seconds'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Constraints and Indexes
-- Unique active viewer per authenticated user per match (eliminates multi-tab inflation)
CREATE UNIQUE INDEX IF NOT EXISTS idx_match_viewers_unique_user 
    ON public.match_viewers(match_id, user_id) 
    WHERE user_id IS NOT NULL;

-- Unique active viewer per anonymous guest session per match
CREATE UNIQUE INDEX IF NOT EXISTS idx_match_viewers_unique_guest 
    ON public.match_viewers(match_id, session_id) 
    WHERE user_id IS NULL;

-- High-performance query indexes
CREATE INDEX IF NOT EXISTS idx_match_viewers_active_lookup 
    ON public.match_viewers(match_id, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_match_viewers_session_id 
    ON public.match_viewers(session_id);

-- 3. Authoritative Heartbeat RPC Function
CREATE OR REPLACE FUNCTION public.record_match_viewer_heartbeat(
    p_match_id UUID,
    p_session_id TEXT,
    p_device_type TEXT DEFAULT 'desktop'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_now TIMESTAMPTZ := now();
    v_expiry TIMESTAMPTZ := now() + interval '35 seconds';
    v_count INTEGER;
BEGIN
    v_user_id := auth.uid();

    -- Validate match exists
    IF NOT EXISTS (SELECT 1 FROM public.matches WHERE id = p_match_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Match not found');
    END IF;

    -- If authenticated user, upsert with user_id key
    IF v_user_id IS NOT NULL THEN
        INSERT INTO public.match_viewers (
            match_id,
            user_id,
            session_id,
            status,
            device_type,
            joined_at,
            last_seen_at,
            expires_at
        ) VALUES (
            p_match_id,
            v_user_id,
            p_session_id,
            'watching',
            COALESCE(NULLIF(TRIM(p_device_type), ''), 'desktop'),
            v_now,
            v_now,
            v_expiry
        )
        ON CONFLICT (match_id, user_id) WHERE user_id IS NOT NULL
        DO UPDATE SET
            session_id = EXCLUDED.session_id,
            status = 'watching',
            device_type = EXCLUDED.device_type,
            last_seen_at = v_now,
            expires_at = v_expiry;
    ELSE
        -- Anonymous guest, upsert with session_id key
        INSERT INTO public.match_viewers (
            match_id,
            user_id,
            session_id,
            status,
            device_type,
            joined_at,
            last_seen_at,
            expires_at
        ) VALUES (
            p_match_id,
            NULL,
            p_session_id,
            'watching',
            COALESCE(NULLIF(TRIM(p_device_type), ''), 'desktop'),
            v_now,
            v_now,
            v_expiry
        )
        ON CONFLICT (match_id, session_id) WHERE user_id IS NULL
        DO UPDATE SET
            status = 'watching',
            device_type = EXCLUDED.device_type,
            last_seen_at = v_now,
            expires_at = v_expiry;
    END IF;

    -- Automatically flag expired records as inactive
    UPDATE public.match_viewers
    SET status = 'inactive'
    WHERE match_id = p_match_id
      AND status = 'watching'
      AND expires_at < v_now;

    -- Calculate exact current unique active viewer count
    SELECT COUNT(DISTINCT COALESCE(user_id::text, session_id))
    INTO v_count
    FROM public.match_viewers
    WHERE match_id = p_match_id
      AND status = 'watching'
      AND expires_at > v_now;

    RETURN jsonb_build_object(
        'success', true,
        'viewer_count', COALESCE(v_count, 0),
        'status', 'watching',
        'expires_at', v_expiry
    );
END;
$$;

-- 4. Authoritative Leave RPC Function
CREATE OR REPLACE FUNCTION public.leave_match_viewer(
    p_match_id UUID,
    p_session_id TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_now TIMESTAMPTZ := now();
    v_count INTEGER;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NOT NULL THEN
        UPDATE public.match_viewers
        SET status = 'left',
            expires_at = v_now
        WHERE match_id = p_match_id
          AND user_id = v_user_id;
    ELSE
        UPDATE public.match_viewers
        SET status = 'left',
            expires_at = v_now
        WHERE match_id = p_match_id
          AND session_id = p_session_id;
    END IF;

    SELECT COUNT(DISTINCT COALESCE(user_id::text, session_id))
    INTO v_count
    FROM public.match_viewers
    WHERE match_id = p_match_id
      AND status = 'watching'
      AND expires_at > v_now;

    RETURN jsonb_build_object(
        'success', true,
        'viewer_count', COALESCE(v_count, 0),
        'status', 'left'
    );
END;
$$;

-- 5. Read-only Fast Query for Single Match Active Viewer Count
CREATE OR REPLACE FUNCTION public.get_active_match_viewers_count(
    p_match_id UUID
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
    SELECT COALESCE(COUNT(DISTINCT COALESCE(user_id::text, session_id)), 0)::integer
    FROM public.match_viewers
    WHERE match_id = p_match_id
      AND status = 'watching'
      AND expires_at > now();
$$;

-- 6. Read-only Fast Query for All Live Matches Active Viewer Counts (eliminates N+1 queries)
CREATE OR REPLACE FUNCTION public.get_all_live_matches_viewer_counts()
RETURNS TABLE(match_id UUID, viewer_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
    SELECT 
        mv.match_id,
        COALESCE(COUNT(DISTINCT COALESCE(mv.user_id::text, mv.session_id)), 0)::integer AS viewer_count
    FROM public.match_viewers mv
    INNER JOIN public.matches m ON m.id = mv.match_id AND m.status = 'live'
    WHERE mv.status = 'watching'
      AND mv.expires_at > now()
    GROUP BY mv.match_id;
$$;

-- 7. Hardened Row Level Security
ALTER TABLE public.match_viewers ENABLE ROW LEVEL SECURITY;

-- Revoke direct mutation rights from clients to prevent viewer count tampering
REVOKE INSERT, UPDATE, DELETE ON public.match_viewers FROM PUBLIC, anon, authenticated;

-- Allow controlled read access (moderator/admin or self)
DROP POLICY IF EXISTS "match_viewers_select_policy" ON public.match_viewers;
CREATE POLICY "match_viewers_select_policy"
    ON public.match_viewers
    FOR SELECT
    TO authenticated, anon
    USING (
        (SELECT public.has_admin_role('moderator')) = true
        OR
        (auth.uid() IS NOT NULL AND auth.uid() = user_id)
    );

-- Grant execute permissions on RPC functions to both authenticated and anonymous visitors
GRANT EXECUTE ON FUNCTION public.record_match_viewer_heartbeat(UUID, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leave_match_viewer(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_match_viewers_count(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_live_matches_viewer_counts() TO anon, authenticated;

-- 8. Harden existing live_viewer_sessions RLS to patch VULN-06
DROP POLICY IF EXISTS "Admins can select viewer sessions" ON public.live_viewer_sessions;
CREATE POLICY "Admins can select viewer sessions" ON public.live_viewer_sessions
    FOR SELECT
    TO authenticated
    USING ((SELECT public.has_admin_role('moderator')) = true);

DROP POLICY IF EXISTS "Viewers can update own session" ON public.live_viewer_sessions;
CREATE POLICY "Viewers can update own session" ON public.live_viewer_sessions
    FOR UPDATE
    TO authenticated, anon
    USING (
        (auth.uid() IS NOT NULL AND user_id = auth.uid())
        OR
        (session_id IS NOT NULL AND client_secret = gen_random_uuid()) -- Non-exploitable
    );

-- 9. Add match_viewers to Supabase Realtime Publication
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'match_viewers'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.match_viewers;
    END IF;
END $$;
