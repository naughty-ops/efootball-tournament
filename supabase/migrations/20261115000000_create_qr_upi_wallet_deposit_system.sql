-- ============================================================================
-- Migration: 20261115000000_create_qr_upi_wallet_deposit_system.sql
-- Description:
-- Complete QR Code + UPI Manual Payment Verification System and Ledger Architecture.
--
-- Features:
-- 1. Upgrades public.player_wallets with balance columns, status, and non-negative constraints.
-- 2. Creates public.wallet_deposits for web-native UPI proof submissions.
-- 3. Expands public.wallet_transactions with balance_after_paise and DEPOSIT_APPROVED type.
-- 4. Creates Supabase Storage buckets: payment-proofs (private) and payment-assets (public).
-- 5. Configures strict Row Level Security (RLS) on tables and storage objects.
-- 6. Provides atomic, row-locking stored procedures:
--    - admin_approve_wallet_deposit
--    - admin_reject_wallet_deposit
-- 7. Seeds wallet_payment_settings into public.site_settings.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Upgrade public.player_wallets with Balance & State Columns
-- ----------------------------------------------------------------------------
ALTER TABLE public.player_wallets
  ADD COLUMN IF NOT EXISTS available_balance_paise BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_balance_paise BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_deposited_paise BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_spent_paise BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Enforce non-negative invariants at the database level
ALTER TABLE public.player_wallets 
  DROP CONSTRAINT IF EXISTS chk_player_wallets_available_positive,
  ADD CONSTRAINT chk_player_wallets_available_positive CHECK (available_balance_paise >= 0);

ALTER TABLE public.player_wallets 
  DROP CONSTRAINT IF EXISTS chk_player_wallets_locked_positive,
  ADD CONSTRAINT chk_player_wallets_locked_positive CHECK (locked_balance_paise >= 0);

ALTER TABLE public.player_wallets 
  DROP CONSTRAINT IF EXISTS chk_player_wallets_status_valid,
  ADD CONSTRAINT chk_player_wallets_status_valid CHECK (status IN ('active', 'frozen', 'suspended'));

-- ----------------------------------------------------------------------------
-- 2. Create public.wallet_deposits Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wallet_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_reference TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  wallet_id UUID NOT NULL REFERENCES public.player_wallets(id) ON DELETE RESTRICT,
  amount_paise BIGINT NOT NULL CHECK (amount_paise >= 1000 AND amount_paise <= 200000), -- ₹10 min, ₹2,000 max
  amount_inr NUMERIC(12, 2) NOT NULL CHECK (amount_inr >= 10.00 AND amount_inr <= 2000.00),
  status TEXT NOT NULL DEFAULT 'under_review' CHECK (status IN ('pending', 'under_review', 'approved', 'rejected', 'cancelled')),
  payment_method TEXT NOT NULL DEFAULT 'upi_qr',
  utr_reference TEXT NOT NULL,
  proof_image_path TEXT NOT NULL,
  admin_notes TEXT,
  rejection_reason TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial unique index to strictly prevent duplicate UTR usage across active or approved deposits
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_deposit_utr 
  ON public.wallet_deposits (utr_reference) 
  WHERE status IN ('under_review', 'approved');

CREATE INDEX IF NOT EXISTS idx_wallet_deposits_user_created 
  ON public.wallet_deposits (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_deposits_status_created 
  ON public.wallet_deposits (status, created_at DESC);

-- ----------------------------------------------------------------------------
-- 3. Upgrade public.wallet_transactions Table
-- ----------------------------------------------------------------------------
ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS balance_after_paise BIGINT;

ALTER TABLE public.wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_transactions_transaction_type_check;

ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_transaction_type_check CHECK (
    transaction_type IN (
      'TOURNAMENT_PRIZE',
      'BONUS_REWARD',
      'ADMIN_ADJUSTMENT',
      'PAYOUT_COMPLETED',
      'PAYOUT_REVERSAL',
      'DEPOSIT_APPROVED',
      'TOURNAMENT_ENTRY_FEE',
      'MATCH_ESCROW_LOCK',
      'MATCH_WIN_PRIZE'
    )
  );

ALTER TABLE public.wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_transactions_reference_type_check;

ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_reference_type_check CHECK (
    reference_type IN (
      'prize_distribution',
      'payout',
      'admin_adjustment',
      'deposit',
      'tournament_entry',
      'match',
      'other'
    )
  );

-- ----------------------------------------------------------------------------
-- 4. Enable Row Level Security (RLS) on wallet_deposits
-- ----------------------------------------------------------------------------
ALTER TABLE public.wallet_deposits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own deposits" ON public.wallet_deposits;
CREATE POLICY "Users can view own deposits"
  ON public.wallet_deposits FOR SELECT
  USING (
    auth.uid() = user_id OR 
    EXISTS (
      SELECT 1 FROM public.admin_users 
      WHERE admin_users.id = auth.uid() AND role IN ('super_admin', 'admin')
    )
  );

DROP POLICY IF EXISTS "Users can create own deposits under review" ON public.wallet_deposits;
CREATE POLICY "Users can create own deposits under review"
  ON public.wallet_deposits FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND 
    status IN ('pending', 'under_review')
  );

DROP POLICY IF EXISTS "Only financial admins can update deposits" ON public.wallet_deposits;
CREATE POLICY "Only financial admins can update deposits"
  ON public.wallet_deposits FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users 
      WHERE admin_users.id = auth.uid() AND role IN ('super_admin', 'admin')
    )
  );

-- ----------------------------------------------------------------------------
-- 5. Harden payout_transactions and financial_audit_logs RLS Policies
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users and admins can insert payout transactions" ON public.payout_transactions;
CREATE POLICY "Only admins and authorized RPC can insert payout transactions"
  ON public.payout_transactions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users 
      WHERE admin_users.id = auth.uid() AND role IN ('super_admin', 'admin')
    )
  );

DROP POLICY IF EXISTS "Authenticated users and admins can insert audit logs" ON public.financial_audit_logs;
CREATE POLICY "Only admins and service role can insert financial audit logs"
  ON public.financial_audit_logs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users 
      WHERE admin_users.id = auth.uid() AND role IN ('super_admin', 'admin')
    )
  );

-- ----------------------------------------------------------------------------
-- 6. Provision Supabase Storage Buckets for Payment Proofs & Assets
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('payment-proofs', 'payment-proofs', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('payment-assets', 'payment-assets', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'])
ON CONFLICT (id) DO UPDATE SET 
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage RLS Policies
DROP POLICY IF EXISTS "Users can upload own payment proofs" ON storage.objects;
CREATE POLICY "Users can upload own payment proofs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'payment-proofs' AND 
    (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users and financial admins view payment proofs" ON storage.objects;
CREATE POLICY "Users and financial admins view payment proofs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'payment-proofs' AND (
      (storage.foldername(name))[1] = auth.uid()::text OR
      EXISTS (
        SELECT 1 FROM public.admin_users 
        WHERE admin_users.id = auth.uid() AND role IN ('super_admin', 'admin')
      )
    )
  );

DROP POLICY IF EXISTS "Admins manage payment assets" ON storage.objects;
CREATE POLICY "Admins manage payment assets"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'payment-assets' AND
    EXISTS (
      SELECT 1 FROM public.admin_users 
      WHERE admin_users.id = auth.uid() AND role IN ('super_admin', 'admin')
    )
  );

DROP POLICY IF EXISTS "Public view payment assets" ON storage.objects;
CREATE POLICY "Public view payment assets"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'payment-assets');

-- ----------------------------------------------------------------------------
-- 7. Atomic Stored Procedure: admin_approve_wallet_deposit
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_approve_wallet_deposit(
  p_deposit_id UUID,
  p_admin_id UUID,
  p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deposit RECORD;
  v_wallet RECORD;
  v_balance_before BIGINT;
  v_balance_after BIGINT;
  v_tx_ref TEXT;
  v_date_str TEXT;
BEGIN
  -- 1. Verify caller has financial admin privilege
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE id = p_admin_id AND role IN ('super_admin', 'admin')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Requires financial administrator privileges.');
  END IF;

  -- 2. Lock deposit record with FOR UPDATE
  SELECT * INTO v_deposit
  FROM public.wallet_deposits
  WHERE id = p_deposit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Deposit request not found.');
  END IF;

  IF v_deposit.status NOT IN ('pending', 'under_review') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Deposit request is already processed. Current status: ' || v_deposit.status);
  END IF;

  -- 3. Lock player wallet record with FOR UPDATE
  SELECT * INTO v_wallet
  FROM public.player_wallets
  WHERE id = v_deposit.wallet_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target player wallet not found.');
  END IF;

  IF v_wallet.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Player wallet is not active (current status: ' || v_wallet.status || ').');
  END IF;

  -- 4. Calculate atomic balances
  v_balance_before := v_wallet.available_balance_paise;
  v_balance_after := v_balance_before + v_deposit.amount_paise;

  -- 5. Update wallet balance
  UPDATE public.player_wallets
  SET 
    available_balance_paise = v_balance_after,
    total_deposited_paise = total_deposited_paise + v_deposit.amount_paise,
    version = version + 1,
    updated_at = now()
  WHERE id = v_wallet.id;

  -- 6. Insert into immutable wallet_transactions
  v_date_str := to_char(now(), 'YYYYMMDD');
  v_tx_ref := 'TX-DEP-' || v_date_str || '-' || upper(substr(p_deposit_id::text, 1, 8));

  INSERT INTO public.wallet_transactions (
    transaction_ref,
    wallet_id,
    user_id,
    transaction_type,
    amount_paise,
    amount_inr,
    balance_after_paise,
    status,
    reference_type,
    reference_id,
    description,
    idempotency_key,
    created_at
  ) VALUES (
    v_tx_ref,
    v_wallet.id,
    v_deposit.user_id,
    'DEPOSIT_APPROVED',
    v_deposit.amount_paise,
    v_deposit.amount_inr,
    v_balance_after,
    'completed',
    'deposit',
    p_deposit_id::text,
    'UPI Deposit Approved (UTR: ' || v_deposit.utr_reference || ')',
    'dep-apprv-' || p_deposit_id::text,
    now()
  );

  -- 7. Update deposit status
  UPDATE public.wallet_deposits
  SET 
    status = 'approved',
    reviewed_by = p_admin_id,
    reviewed_at = now(),
    approved_at = now(),
    admin_notes = p_admin_notes,
    updated_at = now()
  WHERE id = p_deposit_id;

  -- 8. Dispatch in-app notification to player
  INSERT INTO public.player_notifications (
    user_id,
    title,
    message,
    type,
    action_url,
    created_at
  ) VALUES (
    v_deposit.user_id,
    'Wallet Credited Successfully',
    '₹' || v_deposit.amount_inr::text || ' has been successfully credited to your wallet.',
    'financial',
    '/dashboard/wallet?tab=deposits',
    now()
  );

  -- 9. Record financial audit log
  INSERT INTO public.financial_audit_logs (
    actor_id,
    action,
    target_type,
    target_id,
    previous_state,
    new_state,
    metadata,
    created_at
  ) VALUES (
    p_admin_id,
    'APPROVE_WALLET_DEPOSIT',
    'wallet_deposits',
    p_deposit_id::text,
    jsonb_build_object('status', v_deposit.status, 'available_balance_paise', v_balance_before),
    jsonb_build_object('status', 'approved', 'available_balance_paise', v_balance_after),
    jsonb_build_object('utr', v_deposit.utr_reference, 'amount_inr', v_deposit.amount_inr),
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'deposit_id', p_deposit_id,
    'amount_inr', v_deposit.amount_inr,
    'new_balance_paise', v_balance_after,
    'transaction_ref', v_tx_ref
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. Atomic Stored Procedure: admin_reject_wallet_deposit
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_reject_wallet_deposit(
  p_deposit_id UUID,
  p_admin_id UUID,
  p_rejection_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deposit RECORD;
  v_reason TEXT;
BEGIN
  -- 1. Verify caller has financial admin privilege
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE id = p_admin_id AND role IN ('super_admin', 'admin')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Requires financial administrator privileges.');
  END IF;

  v_reason := trim(COALESCE(p_rejection_reason, ''));
  IF length(v_reason) < 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'A valid rejection explanation reason is required (minimum 3 characters).');
  END IF;

  -- 2. Lock deposit record with FOR UPDATE
  SELECT * INTO v_deposit
  FROM public.wallet_deposits
  WHERE id = p_deposit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Deposit request not found.');
  END IF;

  IF v_deposit.status NOT IN ('pending', 'under_review') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Deposit request is already processed. Current status: ' || v_deposit.status);
  END IF;

  -- 3. Update deposit status to rejected
  UPDATE public.wallet_deposits
  SET 
    status = 'rejected',
    rejection_reason = v_reason,
    reviewed_by = p_admin_id,
    reviewed_at = now(),
    updated_at = now()
  WHERE id = p_deposit_id;

  -- 4. Dispatch notification to player
  INSERT INTO public.player_notifications (
    user_id,
    title,
    message,
    type,
    action_url,
    created_at
  ) VALUES (
    v_deposit.user_id,
    'Deposit Request Rejected',
    'Your deposit request for ₹' || v_deposit.amount_inr::text || ' was rejected. Reason: ' || v_reason,
    'financial',
    '/dashboard/wallet?tab=deposits',
    now()
  );

  -- 5. Record financial audit log
  INSERT INTO public.financial_audit_logs (
    actor_id,
    action,
    target_type,
    target_id,
    previous_state,
    new_state,
    metadata,
    created_at
  ) VALUES (
    p_admin_id,
    'REJECT_WALLET_DEPOSIT',
    'wallet_deposits',
    p_deposit_id::text,
    jsonb_build_object('status', v_deposit.status),
    jsonb_build_object('status', 'rejected', 'rejection_reason', v_reason),
    jsonb_build_object('utr', v_deposit.utr_reference, 'amount_inr', v_deposit.amount_inr),
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'deposit_id', p_deposit_id,
    'rejection_reason', v_reason
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. Seed Default wallet_payment_settings into public.site_settings
-- ----------------------------------------------------------------------------
INSERT INTO public.site_settings (key, value, updated_at)
VALUES (
  'wallet_payment_settings',
  jsonb_build_object(
    'upi_qr_image_url', '/images/default_upi_qr.png',
    'upi_id', 'efootball@upi',
    'upi_phone_number', '9207516227',
    'account_holder_name', 'eFootball Tournament Admin',
    'instructions', '1. Scan the QR code or copy the UPI ID or Phone number.\n2. Pay the exact deposit amount using any UPI app (GPay, PhonePe, Paytm).\n3. Copy the 12-digit UTR / UPI Transaction Reference ID.\n4. Take a screenshot of the payment confirmation.\n5. Upload the screenshot and enter the UTR below, then submit.\nYour wallet will be credited after admin verification (10-30 mins).',
    'min_deposit_inr', 10,
    'max_deposit_inr', 2000
  ),
  now()
)
ON CONFLICT (key) DO NOTHING;
