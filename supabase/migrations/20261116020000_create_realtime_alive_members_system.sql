-- Migration: 20261116020000_create_realtime_alive_members_system.sql
-- Description: Server-authoritative Real-Time Alive Members System with heartbeat, automatic offline detection, and multi-tab awareness.

-- 1. Create member_presence table
CREATE TABLE IF NOT EXISTS public.member_presence (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('alive', 'idle', 'offline')),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    current_activity TEXT NOT NULL DEFAULT 'In Arena Lobby',
    current_session_id TEXT NOT NULL DEFAULT '',
    tab_count INTEGER NOT NULL DEFAULT 1 CHECK (tab_count >= 0),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '45 seconds'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Indexes for fast presence and expiration queries
CREATE INDEX IF NOT EXISTS idx_member_presence_status_expires 
    ON public.member_presence(status, expires_at);

CREATE INDEX IF NOT EXISTS idx_member_presence_last_seen 
    ON public.member_presence(last_seen_at DESC);

-- 3. Stored Procedure: record_member_heartbeat
CREATE OR REPLACE FUNCTION public.record_member_heartbeat(
    p_session_id TEXT,
    p_status TEXT DEFAULT 'alive',
    p_activity TEXT DEFAULT 'In Arena Lobby'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_now TIMESTAMPTZ := now();
    v_expires TIMESTAMPTZ := now() + interval '45 seconds';
    v_sanitized_status TEXT;
    v_activity TEXT;
    v_match_code TEXT;
    v_match_status TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    -- Sanitize status
    v_sanitized_status := LOWER(TRIM(COALESCE(p_status, 'alive')));
    IF v_sanitized_status NOT IN ('alive', 'idle') THEN
        v_sanitized_status := 'alive';
    END IF;

    -- Automatically detect real-time competition activity
    SELECT m.match_code, m.status
    INTO v_match_code, v_match_status
    FROM public.one_vs_one_match_players p
    INNER JOIN public.one_vs_one_matches m ON m.id = p.match_id
    WHERE p.user_id = v_user_id
      AND p.is_active = true
      AND m.status IN ('waiting', 'matched', 'room_submitted', 'ready', 'in_progress')
    LIMIT 1;

    IF v_match_code IS NOT NULL THEN
        IF v_match_status = 'waiting' THEN
            v_activity := '1v1 Matchmaking (' || v_match_code || ')';
        ELSIF v_match_status = 'in_progress' THEN
            v_activity := 'Playing 1v1 Duel (' || v_match_code || ')';
        ELSE
            v_activity := 'In 1v1 Match Room (' || v_match_code || ')';
        END IF;
    ELSE
        v_activity := COALESCE(NULLIF(TRIM(p_activity), ''), 'In Arena Lobby');
    END IF;

    -- Upsert presence record
    INSERT INTO public.member_presence (
        user_id,
        status,
        last_seen_at,
        last_heartbeat_at,
        last_active_at,
        current_activity,
        current_session_id,
        tab_count,
        expires_at,
        updated_at
    ) VALUES (
        v_user_id,
        v_sanitized_status,
        v_now,
        v_now,
        CASE WHEN v_sanitized_status = 'alive' THEN v_now ELSE v_now END,
        v_activity,
        COALESCE(p_session_id, ''),
        1,
        v_expires,
        v_now
    )
    ON CONFLICT (user_id) DO UPDATE SET
        status = EXCLUDED.status,
        last_seen_at = v_now,
        last_heartbeat_at = v_now,
        last_active_at = CASE 
            WHEN EXCLUDED.status = 'alive' THEN v_now 
            ELSE public.member_presence.last_active_at 
        END,
        current_activity = EXCLUDED.current_activity,
        current_session_id = EXCLUDED.current_session_id,
        expires_at = v_expires,
        updated_at = v_now;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_user_id,
        'status', v_sanitized_status,
        'activity', v_activity,
        'expires_at', v_expires
    );
END;
$$;

-- 4. Stored Procedure: leave_member_presence
CREATE OR REPLACE FUNCTION public.leave_member_presence(
    p_session_id TEXT DEFAULT NULL,
    p_force_offline BOOLEAN DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_now TIMESTAMPTZ := now();
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    UPDATE public.member_presence
    SET status = 'offline',
        expires_at = v_now,
        updated_at = v_now
    WHERE user_id = v_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_user_id,
        'status', 'offline'
    );
END;
$$;

-- 5. Stored Procedure: get_alive_members_directory
CREATE OR REPLACE FUNCTION public.get_alive_members_directory()
RETURNS TABLE (
    user_id UUID,
    display_name TEXT,
    avatar_url TEXT,
    efootball_id TEXT,
    status TEXT,
    current_activity TEXT,
    last_seen_at TIMESTAMPTZ,
    last_active_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
    SELECT
        p.id AS user_id,
        COALESCE(NULLIF(p.display_name, ''), 'Athlete ' || SUBSTRING(p.id::text, 1, 5)) AS display_name,
        p.avatar_url,
        COALESCE(NULLIF(p.efootball_id, ''), 'eFootball Ready') AS efootball_id,
        CASE
            WHEN mp.status IS NOT NULL AND mp.expires_at > now() THEN mp.status
            ELSE 'offline'
        END AS status,
        COALESCE(mp.current_activity, 'In Arena Lobby') AS current_activity,
        COALESCE(mp.last_seen_at, p.created_at) AS last_seen_at,
        COALESCE(mp.last_active_at, p.created_at) AS last_active_at
    FROM public.profiles p
    LEFT JOIN public.member_presence mp ON mp.user_id = p.id
    ORDER BY
        -- 1: ALIVE first, 2: IDLE second, 3: OFFLINE last
        CASE
            WHEN mp.status = 'alive' AND mp.expires_at > now() THEN 1
            WHEN mp.status = 'idle' AND mp.expires_at > now() THEN 2
            ELSE 3
        END ASC,
        COALESCE(mp.last_seen_at, p.created_at) DESC
    LIMIT 100;
$$;

-- 6. Stored Procedure: get_alive_members_counts
CREATE OR REPLACE FUNCTION public.get_alive_members_counts()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
    SELECT jsonb_build_object(
        'total_alive', COALESCE(COUNT(*) FILTER (WHERE mp.status = 'alive' AND mp.expires_at > now()), 0),
        'total_idle', COALESCE(COUNT(*) FILTER (WHERE mp.status = 'idle' AND mp.expires_at > now()), 0),
        'total_offline', COALESCE(COUNT(*) FILTER (WHERE mp.status IS NULL OR mp.status = 'offline' OR mp.expires_at <= now()), 0),
        'total_members', (SELECT COUNT(*) FROM public.profiles)
    )
    FROM public.member_presence mp;
$$;

-- 7. Hardened Row Level Security on member_presence
ALTER TABLE public.member_presence ENABLE ROW LEVEL SECURITY;

-- Revoke direct mutation rights from clients (all updates flow through SECURITY DEFINER RPCs)
REVOKE INSERT, UPDATE, DELETE ON public.member_presence FROM PUBLIC, anon, authenticated;

-- Allow reading presence records
DROP POLICY IF EXISTS "member_presence_read_policy" ON public.member_presence;
CREATE POLICY "member_presence_read_policy"
    ON public.member_presence
    FOR SELECT
    TO authenticated, anon
    USING (true);

-- Grant execute permissions on functions to authenticated and anon
GRANT EXECUTE ON FUNCTION public.record_member_heartbeat(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_member_presence(TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_alive_members_directory() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_alive_members_counts() TO authenticated, anon;

-- 8. Add member_presence to Supabase Realtime Publication
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'member_presence'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.member_presence;
    END IF;
END $$;
