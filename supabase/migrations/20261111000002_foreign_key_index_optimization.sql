-- ==============================================================================
-- Migration: 20261111000002_foreign_key_index_optimization.sql
-- Description: Adds covering indexes on 32 foreign keys identified by the 
--              Supabase Performance Advisor, plus financial uniqueness index.
-- Phase: P1 - Performance & Data Integrity Hardening
-- ==============================================================================

-- 1. Matches & Disputes Indexes
CREATE INDEX IF NOT EXISTS idx_matches_walkover_requested_by 
  ON public.matches (walkover_requested_by) 
  WHERE walkover_requested_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_match_disputes_reporter_participant_id 
  ON public.match_disputes (reporter_participant_id);

CREATE INDEX IF NOT EXISTS idx_match_disputes_opponent_participant_id 
  ON public.match_disputes (opponent_participant_id) 
  WHERE opponent_participant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_match_disputes_resolved_by 
  ON public.match_disputes (resolved_by) 
  WHERE resolved_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_match_activity_logs_tournament_id 
  ON public.match_activity_logs (tournament_id);

CREATE INDEX IF NOT EXISTS idx_match_submissions_tournament_id 
  ON public.match_submissions (tournament_id);

CREATE INDEX IF NOT EXISTS idx_match_submissions_user_id 
  ON public.match_submissions (user_id);

CREATE INDEX IF NOT EXISTS idx_match_streamer_assignments_assigned_by 
  ON public.match_streamer_assignments (assigned_by) 
  WHERE assigned_by IS NOT NULL;

-- 2. Support Tickets & Messaging Indexes
CREATE INDEX IF NOT EXISTS idx_support_tickets_tournament_id 
  ON public.support_tickets (tournament_id) 
  WHERE tournament_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_support_tickets_match_id 
  ON public.support_tickets (match_id) 
  WHERE match_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_support_tickets_resolved_by 
  ON public.support_tickets (resolved_by) 
  WHERE resolved_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ticket_messages_sender_id 
  ON public.ticket_messages (sender_id) 
  WHERE sender_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ticket_audit_logs_admin_id 
  ON public.ticket_audit_logs (admin_id) 
  WHERE admin_id IS NOT NULL;

-- 3. Tournaments & Registrations Indexes
CREATE INDEX IF NOT EXISTS idx_tournaments_champion_id 
  ON public.tournaments (champion_id) 
  WHERE champion_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tournaments_runner_up_id 
  ON public.tournaments (runner_up_id) 
  WHERE runner_up_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tournaments_third_place_id 
  ON public.tournaments (third_place_id) 
  WHERE third_place_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tournament_registrations_participant_id 
  ON public.tournament_registrations (participant_id) 
  WHERE participant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tournament_registrations_verified_by 
  ON public.tournament_registrations (verified_by) 
  WHERE verified_by IS NOT NULL;

-- 4. Financial & Payout Ledger Indexes
CREATE INDEX IF NOT EXISTS idx_prize_distributions_participant_id 
  ON public.prize_distributions (participant_id) 
  WHERE participant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prize_distributions_approved_by 
  ON public.prize_distributions (approved_by) 
  WHERE approved_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payout_transactions_payment_method_id 
  ON public.payout_transactions (payment_method_id) 
  WHERE payment_method_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payout_transactions_processed_by 
  ON public.payout_transactions (processed_by) 
  WHERE processed_by IS NOT NULL;

-- TASK 7: Enforce strictly unique payout transactions per prize distribution.
-- Note: A legacy non-unique btree index (idx_payout_tx_prize_dist) already exists in production.
-- This partial unique index enforces financial uniqueness (eliminating duplicate prize disbursements)
-- while simultaneously providing covering index support for foreign-key lookups.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payout_transactions_prize_distribution_id 
  ON public.payout_transactions (prize_distribution_id) 
  WHERE prize_distribution_id IS NOT NULL;

-- 5. Profiles & Administrative Audit Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_suspended_by 
  ON public.profiles (suspended_by) 
  WHERE suspended_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_users_created_by 
  ON public.admin_users (created_by) 
  WHERE created_by IS NOT NULL;

-- 6. CMS & Audit History Indexes
CREATE INDEX IF NOT EXISTS idx_homepage_sections_published_by 
  ON public.homepage_sections (published_by) 
  WHERE published_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_homepage_sections_updated_by 
  ON public.homepage_sections (updated_by) 
  WHERE updated_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_homepage_audit_history_performed_by 
  ON public.homepage_audit_history (performed_by) 
  WHERE performed_by IS NOT NULL;

-- 7. Restreaming & Logging Indexes
CREATE INDEX IF NOT EXISTS idx_restream_jobs_source_id 
  ON public.restream_jobs (source_id) 
  WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_restream_jobs_youtube_account_id 
  ON public.restream_jobs (youtube_account_id) 
  WHERE youtube_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_restream_logs_user_id 
  ON public.restream_logs (user_id);

-- 8. Achievements & Legal Acceptances Indexes
CREATE INDEX IF NOT EXISTS idx_player_achievements_achievement_id 
  ON public.player_achievements (achievement_id);

CREATE INDEX IF NOT EXISTS idx_terms_acceptances_terms_version 
  ON public.terms_acceptances (terms_version);
