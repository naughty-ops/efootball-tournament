-- ============================================================================
-- Migration: 20261110000000_create_advanced_player_wallet_system.sql
-- Description: Complete schema, RLS policies, and performance indexes for the
-- Advanced Player Wallet System (Wallets, Ledger, Payment Methods, Prize
-- Distributions, Payout Transactions, Financial Audit Logs, and Notifications).
-- ============================================================================

-- 1. Ensure Extension for UUID Generation
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 2. Create Tables if they don't already exist
CREATE TABLE IF NOT EXISTS public.player_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT player_wallets_user_id_key UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_ref TEXT NOT NULL UNIQUE,
    wallet_id UUID NOT NULL REFERENCES public.player_wallets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('TOURNAMENT_PRIZE', 'BONUS_REWARD', 'ADMIN_ADJUSTMENT', 'PAYOUT_COMPLETED', 'PAYOUT_REVERSAL')),
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    amount_inr NUMERIC(12, 2) NOT NULL CHECK (amount_inr > 0),
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'cancelled', 'failed', 'reversed')),
    reference_type TEXT NOT NULL CHECK (reference_type IN ('prize_distribution', 'payout', 'admin_adjustment', 'other')),
    reference_id TEXT,
    tournament_id UUID REFERENCES public.tournaments(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    idempotency_key TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.player_payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    payment_method_type TEXT NOT NULL CHECK (payment_method_type IN ('bank_account', 'upi')),
    account_holder_name TEXT,
    bank_name TEXT,
    encrypted_account_number TEXT,
    masked_account_number TEXT,
    ifsc_code TEXT,
    upi_id TEXT,
    is_preferred BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_payment_method_type UNIQUE (user_id, payment_method_type)
);

CREATE TABLE IF NOT EXISTS public.prize_distributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    distribution_reference TEXT NOT NULL UNIQUE,
    tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    participant_id UUID REFERENCES public.participants(id) ON DELETE SET NULL,
    position INTEGER NOT NULL CHECK (position >= 1 AND position <= 32),
    position_title TEXT NOT NULL,
    prize_amount_paise BIGINT NOT NULL CHECK (prize_amount_paise > 0),
    prize_amount_inr NUMERIC(12, 2) NOT NULL CHECK (prize_amount_inr > 0),
    status TEXT NOT NULL DEFAULT 'awarded' CHECK (status IN ('pending_approval', 'awarded', 'cancelled')),
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_tournament_position_prize UNIQUE (tournament_id, position)
);

CREATE TABLE IF NOT EXISTS public.payout_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payout_reference TEXT NOT NULL UNIQUE,
    player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    prize_distribution_id UUID REFERENCES public.prize_distributions(id) ON DELETE SET NULL,
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    amount_inr NUMERIC(12, 2) NOT NULL CHECK (amount_inr > 0),
    payment_method_id UUID REFERENCES public.player_payment_methods(id) ON DELETE SET NULL,
    payment_method_type TEXT CHECK (payment_method_type IN ('bank_account', 'upi')),
    payout_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (payout_status IN ('PENDING', 'PROCESSING', 'PAID', 'REJECTED', 'FAILED')),
    utr_reference TEXT,
    processed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    paid_at TIMESTAMPTZ,
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.financial_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    previous_state JSONB,
    new_state JSONB,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.player_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'financial' CHECK (type IN ('financial', 'tournament', 'system')),
    action_url TEXT,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_player_wallets_user ON public.player_wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_created ON public.wallet_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet ON public.wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_tournament ON public.wallet_transactions(tournament_id);
CREATE INDEX IF NOT EXISTS idx_player_payment_methods_user ON public.player_payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_prize_distributions_tournament ON public.prize_distributions(tournament_id);
CREATE INDEX IF NOT EXISTS idx_prize_distributions_player ON public.prize_distributions(player_id);
CREATE INDEX IF NOT EXISTS idx_payout_transactions_player_created ON public.payout_transactions(player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payout_transactions_status ON public.payout_transactions(payout_status);
CREATE INDEX IF NOT EXISTS idx_financial_audit_logs_target ON public.financial_audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_player_notifications_user_read ON public.player_notifications(user_id, is_read, created_at DESC);

-- 4. Enable Row Level Security
ALTER TABLE public.player_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prize_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_notifications ENABLE ROW LEVEL SECURITY;

-- 5. Drop any existing conflicting policies to allow clean recreation
DROP POLICY IF EXISTS "Users and admins can view wallets" ON public.player_wallets;
DROP POLICY IF EXISTS "Users and admins can insert wallets" ON public.player_wallets;
DROP POLICY IF EXISTS "Only admins can update wallets" ON public.player_wallets;

DROP POLICY IF EXISTS "Users and admins can view wallet transactions" ON public.wallet_transactions;
DROP POLICY IF EXISTS "Only admins can insert wallet transactions" ON public.wallet_transactions;

DROP POLICY IF EXISTS "Users and financial admins can view payment methods" ON public.player_payment_methods;
DROP POLICY IF EXISTS "Users can insert own payment methods" ON public.player_payment_methods;
DROP POLICY IF EXISTS "Users can update own payment methods" ON public.player_payment_methods;
DROP POLICY IF EXISTS "Users can delete own payment methods" ON public.player_payment_methods;

DROP POLICY IF EXISTS "Users and admins can view prize distributions" ON public.prize_distributions;
DROP POLICY IF EXISTS "Admins can manage prize distributions" ON public.prize_distributions;

DROP POLICY IF EXISTS "Users and admins can view payout transactions" ON public.payout_transactions;
DROP POLICY IF EXISTS "Users and admins can insert payout transactions" ON public.payout_transactions;
DROP POLICY IF EXISTS "Only admins can update payout transactions" ON public.payout_transactions;

DROP POLICY IF EXISTS "Only financial admins can view audit logs" ON public.financial_audit_logs;
DROP POLICY IF EXISTS "Authenticated users and admins can insert audit logs" ON public.financial_audit_logs;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.player_notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.player_notifications;
DROP POLICY IF EXISTS "Admins and service role can insert notifications" ON public.player_notifications;

-- 6. Define Strict RLS Policies

-- A. player_wallets
CREATE POLICY "Users and admins can view wallets"
    ON public.player_wallets FOR SELECT
    USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid()));

CREATE POLICY "Users and admins can insert wallets"
    ON public.player_wallets FOR INSERT
    WITH CHECK (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid()));

CREATE POLICY "Only admins can update wallets"
    ON public.player_wallets FOR UPDATE
    USING (EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid()));

-- B. wallet_transactions
CREATE POLICY "Users and admins can view wallet transactions"
    ON public.wallet_transactions FOR SELECT
    USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid()));

CREATE POLICY "Only admins can insert wallet transactions"
    ON public.wallet_transactions FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid()));

-- C. player_payment_methods
CREATE POLICY "Users and financial admins can view payment methods"
    ON public.player_payment_methods FOR SELECT
    USING (
        auth.uid() = user_id OR 
        EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid() AND role IN ('super_admin', 'admin'))
    );

CREATE POLICY "Users can insert own payment methods"
    ON public.player_payment_methods FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own payment methods"
    ON public.player_payment_methods FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own payment methods"
    ON public.player_payment_methods FOR DELETE
    USING (auth.uid() = user_id);

-- D. prize_distributions
CREATE POLICY "Users and admins can view prize distributions"
    ON public.prize_distributions FOR SELECT
    USING (auth.uid() = player_id OR EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid()));

CREATE POLICY "Admins can manage prize distributions"
    ON public.prize_distributions FOR ALL
    USING (EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));

-- E. payout_transactions
CREATE POLICY "Users and admins can view payout transactions"
    ON public.payout_transactions FOR SELECT
    USING (auth.uid() = player_id OR EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid()));

CREATE POLICY "Users and admins can insert payout transactions"
    ON public.payout_transactions FOR INSERT
    WITH CHECK (
        (auth.uid() = player_id AND payout_status = 'PENDING') OR 
        EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid() AND role IN ('super_admin', 'admin'))
    );

CREATE POLICY "Only admins can update payout transactions"
    ON public.payout_transactions FOR UPDATE
    USING (EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));

-- F. financial_audit_logs
CREATE POLICY "Only financial admins can view audit logs"
    ON public.financial_audit_logs FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));

CREATE POLICY "Authenticated users and admins can insert audit logs"
    ON public.financial_audit_logs FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- G. player_notifications
CREATE POLICY "Users can view own notifications"
    ON public.player_notifications FOR SELECT
    USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid()));

CREATE POLICY "Users can update own notifications"
    ON public.player_notifications FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins and service role can insert notifications"
    ON public.player_notifications FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);
