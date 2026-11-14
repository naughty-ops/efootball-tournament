-- ==============================================================================
-- Migration: 20261111000004_security_invoker_view.sql
-- Description: Phase P1 - Hardens tournament_participants_public view
-- Hardening: Sets security_invoker = true so the view queries the underlying
--            participants and tournaments tables under the caller's RLS context
--            rather than executing as the view owner (SECURITY DEFINER behavior).
-- Resolves: Supabase Security Advisor warning 'security_definer_view'.
-- ==============================================================================

ALTER VIEW public.tournament_participants_public SET (security_invoker = true);

-- Ensure explicit permissions on the view
REVOKE ALL ON public.tournament_participants_public FROM PUBLIC;
GRANT SELECT ON public.tournament_participants_public TO anon, authenticated, service_role;
