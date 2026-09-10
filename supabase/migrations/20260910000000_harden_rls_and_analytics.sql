-- ============================================================================
-- HARDEN SUPABASE RLS POLICIES & ANALYTICS PAYLOAD PROTECTION
-- Restricted Admin Write Access + Database Spam Throttling
-- ============================================================================

-- 1. Create admin_users table for database-level RBAC verification
CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on admin_users
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Allow public read access to verify admin presence, but restrict writes to existing admins
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'admin_users' 
        AND policyname = 'Allow authenticated users to view admin list'
    ) THEN
        CREATE POLICY "Allow authenticated users to view admin list"
            ON public.admin_users FOR SELECT TO authenticated USING (true);
    END IF;
END $$;

-- 2. Helper function to check if current execution context belongs to an admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    -- If no admin_users are seeded yet, allow bootstrap for initial authenticated users
    IF NOT (SELECT EXISTS (SELECT 1 FROM public.admin_users)) THEN
        RETURN (auth.uid() IS NOT NULL);
    END IF;

    -- Verify that the authenticated user's ID exists in public.admin_users
    RETURN EXISTS (
        SELECT 1 FROM public.admin_users
        WHERE id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Replace permissive "FOR ALL TO authenticated USING (true)" policies with public.is_admin()
DO $$ 
BEGIN
    -- Tournaments
    DROP POLICY IF EXISTS "Allow authenticated admin full access on tournaments" ON public.tournaments;
    CREATE POLICY "Allow authenticated admin full access on tournaments"
        ON public.tournaments FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

    -- Participants
    DROP POLICY IF EXISTS "Allow authenticated admin full access on participants" ON public.participants;
    CREATE POLICY "Allow authenticated admin full access on participants"
        ON public.participants FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

    -- Rounds
    DROP POLICY IF EXISTS "Allow authenticated admin full access on rounds" ON public.rounds;
    CREATE POLICY "Allow authenticated admin full access on rounds"
        ON public.rounds FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

    -- Matches
    DROP POLICY IF EXISTS "Allow authenticated admin full access on matches" ON public.matches;
    CREATE POLICY "Allow authenticated admin full access on matches"
        ON public.matches FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

    -- Groups
    DROP POLICY IF EXISTS "Allow authenticated admin full access on groups" ON public.groups;
    CREATE POLICY "Allow authenticated admin full access on groups"
        ON public.groups FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

    -- Group Participants
    DROP POLICY IF EXISTS "Allow authenticated admin full access on group_participants" ON public.group_participants;
    CREATE POLICY "Allow authenticated admin full access on group_participants"
        ON public.group_participants FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

    -- Site Settings
    DROP POLICY IF EXISTS "Allow authenticated admin full access on site_settings" ON public.site_settings;
    CREATE POLICY "Allow authenticated admin full access on site_settings"
        ON public.site_settings FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
END $$;

-- 4. Harden analytics_events INSERT policy against database spam
DO $$
BEGIN
    DROP POLICY IF EXISTS "Allow public insert to analytics_events" ON public.analytics_events;
    CREATE POLICY "Allow public insert to analytics_events"
        ON public.analytics_events FOR INSERT TO anon, authenticated
        WITH CHECK (
            length(event_name) <= 100 
            AND octet_length(metadata::text) <= 5000
        );
END $$;
