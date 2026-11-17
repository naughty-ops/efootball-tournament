-- ============================================================================
-- Migration: 20261118040000_restore_rls_helper_permissions_for_anon.sql
-- Description: Restore EXECUTE privileges on RLS evaluator functions to anon
-- 
-- In PostgreSQL, when an RLS policy references a helper function (such as
-- is_tournament_admin(), is_support_admin(), is_financial_admin(), is_admin()),
-- any database role that performs a SELECT on the table must possess EXECUTE
-- privileges on the referenced functions. Otherwise, PostgreSQL fails at query
-- plan time with:
--   "ERROR 42501: permission denied for function <function_name>"
--
-- These helper functions are SECURITY DEFINER with fixed search_paths and simply
-- verify whether auth.uid() is an active administrator. For unauthenticated
-- visitors (role anon), auth.uid() is always NULL, safely returning FALSE in
-- sub-millisecond execution without exposing any administrative data.
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.is_tournament_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_support_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_financial_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;
