-- Migration: 20261116030000_create_admin_alive_members_system.sql
-- Description: Stored procedure for Admin Dashboard to view all alive members with full administrative details.

CREATE OR REPLACE FUNCTION public.get_admin_alive_members_directory()
RETURNS TABLE (
    user_id UUID,
    display_name TEXT,
    email TEXT,
    avatar_url TEXT,
    efootball_id TEXT,
    efootball_id_verified BOOLEAN,
    whatsapp_number TEXT,
    status TEXT,
    current_activity TEXT,
    tab_count INTEGER,
    last_seen_at TIMESTAMPTZ,
    last_heartbeat_at TIMESTAMPTZ,
    last_active_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
    SELECT
        p.id AS user_id,
        COALESCE(NULLIF(p.display_name, ''), 'Athlete ' || SUBSTRING(p.id::text, 1, 5)) AS display_name,
        p.email,
        p.avatar_url,
        COALESCE(NULLIF(p.efootball_id, ''), 'Not Provided') AS efootball_id,
        COALESCE(p.efootball_id_verified, false) AS efootball_id_verified,
        p.whatsapp_number,
        CASE
            WHEN mp.status IS NOT NULL AND mp.expires_at > now() THEN mp.status
            ELSE 'offline'
        END AS status,
        COALESCE(mp.current_activity, 'In Arena Lobby') AS current_activity,
        COALESCE(mp.tab_count, 0) AS tab_count,
        COALESCE(mp.last_seen_at, p.created_at) AS last_seen_at,
        COALESCE(mp.last_heartbeat_at, p.created_at) AS last_heartbeat_at,
        COALESCE(mp.last_active_at, p.created_at) AS last_active_at,
        p.created_at
    FROM public.profiles p
    LEFT JOIN public.member_presence mp ON mp.user_id = p.id
    ORDER BY
        CASE
            WHEN mp.status = 'alive' AND mp.expires_at > now() THEN 1
            WHEN mp.status = 'idle' AND mp.expires_at > now() THEN 2
            ELSE 3
        END ASC,
        COALESCE(mp.last_seen_at, p.created_at) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_alive_members_directory() TO authenticated;
