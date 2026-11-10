-- Migration: Drop redundant duplicate indexes to optimize write throughput and disk footprint
-- Description: Removed exact-duplicate btree indexes on player_payment_methods, payout_transactions, and player_notifications

DROP INDEX IF EXISTS public.idx_player_payment_methods_user;
DROP INDEX IF EXISTS public.idx_payout_tx_status;
DROP INDEX IF EXISTS public.idx_player_notifications_user_read;
