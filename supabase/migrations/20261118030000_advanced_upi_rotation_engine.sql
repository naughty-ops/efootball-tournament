-- ==============================================================================
-- Migration: 20261118030000_advanced_upi_rotation_engine.sql
-- Module: Advanced UPI QR Rotation & Transaction Queue System (Phase 1)
-- Scope: Database tables, indexes, constraints, immutability triggers, RLS, 
--        and transactional SECURITY DEFINER RPC functions.
-- ==============================================================================

-- 1. Table: public.upi_accounts
CREATE TABLE IF NOT EXISTS public.upi_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upi_id text NOT NULL,
  account_holder_name text NOT NULL,
  phone_number text,
  qr_code_url text,
  max_successful_transactions integer NOT NULL DEFAULT 18 CHECK (max_successful_transactions > 0),
  verified_transactions_count integer NOT NULL DEFAULT 0 CHECK (verified_transactions_count >= 0),
  total_verified_count integer NOT NULL DEFAULT 0 CHECK (total_verified_count >= 0),
  is_active boolean NOT NULL DEFAULT false,
  is_enabled boolean NOT NULL DEFAULT true,
  queue_order integer NOT NULL DEFAULT 0,
  notes text,
  last_activated_at timestamptz,
  last_rotated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Partial unique index: Guarantee that at most ONE upi_account is active at any time
CREATE UNIQUE INDEX IF NOT EXISTS uidx_upi_accounts_single_active 
ON public.upi_accounts (is_active) 
WHERE is_active = true;

-- Performance indexes for queue traversal and management
CREATE INDEX IF NOT EXISTS idx_upi_accounts_queue_order 
ON public.upi_accounts (queue_order ASC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_upi_accounts_active_enabled 
ON public.upi_accounts (is_active, is_enabled);

-- 2. Table: public.upi_rotation_events (Immutable Rotation History)
CREATE TABLE IF NOT EXISTS public.upi_rotation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_upi_account_id uuid REFERENCES public.upi_accounts(id) ON DELETE SET NULL,
  to_upi_account_id uuid REFERENCES public.upi_accounts(id) ON DELETE SET NULL,
  trigger_type text NOT NULL CHECK (trigger_type IN (
    'automatic_limit_reached',
    'manual_admin_switch',
    'account_disabled',
    'initial_activation',
    'queue_exhausted_paused'
  )),
  verified_payments_at_rotation integer NOT NULL DEFAULT 0,
  configured_limit integer NOT NULL DEFAULT 18,
  triggered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deposit_id_trigger uuid REFERENCES public.wallet_deposits(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_upi_rotation_events_created 
ON public.upi_rotation_events (created_at DESC);

-- 3. Table: public.upi_payment_audit_logs (Immutable Payment Verification History)
CREATE TABLE IF NOT EXISTS public.upi_payment_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_id uuid NOT NULL REFERENCES public.wallet_deposits(id) ON DELETE RESTRICT,
  upi_account_id uuid NOT NULL REFERENCES public.upi_accounts(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  utr_reference text NOT NULL,
  amount_inr numeric(12,2) NOT NULL,
  verification_status text NOT NULL CHECK (verification_status IN ('approved', 'rejected')),
  verified_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  verified_at timestamptz NOT NULL DEFAULT now(),
  rotation_triggered boolean NOT NULL DEFAULT false,
  rotation_event_id uuid REFERENCES public.upi_rotation_events(id) ON DELETE SET NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_upi_payment_audit_logs_deposit 
ON public.upi_payment_audit_logs (deposit_id);

CREATE INDEX IF NOT EXISTS idx_upi_payment_audit_logs_account 
ON public.upi_payment_audit_logs (upi_account_id, verified_at DESC);

CREATE INDEX IF NOT EXISTS idx_upi_payment_audit_logs_utr 
ON public.upi_payment_audit_logs (utr_reference);

-- 4. Audit Log Immutability Enforcement Triggers & Table Privileges
REVOKE TRUNCATE, UPDATE, DELETE ON TABLE public.upi_rotation_events FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, UPDATE, DELETE ON TABLE public.upi_payment_audit_logs FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_enforce_audit_log_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'pg_temp'
AS $$
BEGIN
  RAISE EXCEPTION 'Security Violation: Audit log entries are strictly append-only and immutable. UPDATE, DELETE, and TRUNCATE operations are prohibited.';
END;
$$;

DO $$
BEGIN
  -- Row-level UPDATE or DELETE triggers
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_upi_rotation_events_immutable'
  ) THEN
    CREATE TRIGGER trg_upi_rotation_events_immutable
    BEFORE UPDATE OR DELETE ON public.upi_rotation_events
    FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_audit_log_immutability();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_upi_payment_audit_logs_immutable'
  ) THEN
    CREATE TRIGGER trg_upi_payment_audit_logs_immutable
    BEFORE UPDATE OR DELETE ON public.upi_payment_audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_audit_log_immutability();
  END IF;

  -- Statement-level TRUNCATE triggers
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_upi_rotation_events_truncate'
  ) THEN
    CREATE TRIGGER trg_upi_rotation_events_truncate
    BEFORE TRUNCATE ON public.upi_rotation_events
    FOR EACH STATEMENT EXECUTE FUNCTION public.trg_enforce_audit_log_immutability();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_upi_payment_audit_logs_truncate'
  ) THEN
    CREATE TRIGGER trg_upi_payment_audit_logs_truncate
    BEFORE TRUNCATE ON public.upi_payment_audit_logs
    FOR EACH STATEMENT EXECUTE FUNCTION public.trg_enforce_audit_log_immutability();
  END IF;
END $$;

-- 5. Extend public.wallet_deposits with Assignment Snapshot Columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'wallet_deposits' AND column_name = 'upi_account_id'
  ) THEN
    ALTER TABLE public.wallet_deposits ADD COLUMN upi_account_id uuid REFERENCES public.upi_accounts(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'wallet_deposits' AND column_name = 'assigned_upi_id'
  ) THEN
    ALTER TABLE public.wallet_deposits ADD COLUMN assigned_upi_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'wallet_deposits' AND column_name = 'assigned_account_name'
  ) THEN
    ALTER TABLE public.wallet_deposits ADD COLUMN assigned_account_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'wallet_deposits' AND column_name = 'assigned_qr_url'
  ) THEN
    ALTER TABLE public.wallet_deposits ADD COLUMN assigned_qr_url text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_wallet_deposits_upi_account_id 
ON public.wallet_deposits (upi_account_id);

-- Enforce global uniqueness across all submitted payment references (including rejected)
CREATE UNIQUE INDEX IF NOT EXISTS uidx_wallet_deposits_all_utr 
ON public.wallet_deposits (utr_reference) 
WHERE utr_reference IS NOT NULL;

-- 6. RLS Policies
ALTER TABLE public.upi_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upi_rotation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upi_payment_audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- upi_accounts RLS
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'upi_accounts' AND policyname = 'Financial admins can view upi accounts') THEN
    CREATE POLICY "Financial admins can view upi accounts" ON public.upi_accounts FOR SELECT USING (is_financial_admin());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'upi_accounts' AND policyname = 'Financial admins can insert upi accounts') THEN
    CREATE POLICY "Financial admins can insert upi accounts" ON public.upi_accounts FOR INSERT WITH CHECK (is_financial_admin());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'upi_accounts' AND policyname = 'Financial admins can update upi accounts') THEN
    CREATE POLICY "Financial admins can update upi accounts" ON public.upi_accounts FOR UPDATE USING (is_financial_admin()) WITH CHECK (is_financial_admin());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'upi_accounts' AND policyname = 'Financial admins can delete upi accounts') THEN
    CREATE POLICY "Financial admins can delete upi accounts" ON public.upi_accounts FOR DELETE USING (is_financial_admin());
  END IF;

  -- upi_rotation_events RLS
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'upi_rotation_events' AND policyname = 'Financial admins can view upi rotation events') THEN
    CREATE POLICY "Financial admins can view upi rotation events" ON public.upi_rotation_events FOR SELECT USING (is_financial_admin());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'upi_rotation_events' AND policyname = 'Admins or service can insert rotation events') THEN
    CREATE POLICY "Admins or service can insert rotation events" ON public.upi_rotation_events FOR INSERT WITH CHECK (is_financial_admin() OR auth.role() = 'service_role');
  END IF;

  -- upi_payment_audit_logs RLS
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'upi_payment_audit_logs' AND policyname = 'Financial admins can view upi payment audit logs') THEN
    CREATE POLICY "Financial admins can view upi payment audit logs" ON public.upi_payment_audit_logs FOR SELECT USING (is_financial_admin());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'upi_payment_audit_logs' AND policyname = 'Admins or service can insert upi payment audit logs') THEN
    CREATE POLICY "Admins or service can insert upi payment audit logs" ON public.upi_payment_audit_logs FOR INSERT WITH CHECK (is_financial_admin() OR auth.role() = 'service_role');
  END IF;
END $$;

-- 7. Seed Initial UPI Account (ONLY if valid source configuration exists in site_settings)
DO $$
DECLARE
  v_settings jsonb;
  v_upi_id text;
  v_name text;
  v_phone text;
  v_qr_url text;
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.upi_accounts;
  IF v_count = 0 THEN
    SELECT value INTO v_settings 
    FROM public.site_settings 
    WHERE key = 'wallet_payment_settings';

    IF v_settings IS NOT NULL THEN
      v_upi_id := trim(COALESCE(v_settings->>'upi_id', ''));
      v_name := trim(COALESCE(v_settings->>'account_holder_name', 'eFootball Financial Desk'));
      v_phone := trim(COALESCE(v_settings->>'upi_phone_number', ''));
      v_qr_url := trim(COALESCE(v_settings->>'upi_qr_image_url', ''));

      IF length(v_upi_id) > 3 AND v_upi_id LIKE '%@%' THEN
        INSERT INTO public.upi_accounts (
          upi_id,
          account_holder_name,
          phone_number,
          qr_code_url,
          max_successful_transactions,
          verified_transactions_count,
          total_verified_count,
          is_active,
          is_enabled,
          queue_order,
          notes,
          last_activated_at
        ) VALUES (
          v_upi_id,
          v_name,
          NULLIF(v_phone, ''),
          NULLIF(v_qr_url, ''),
          18,
          0,
          0,
          true,
          true,
          1,
          'Initial active account seeded from verified site_settings',
          now()
        );
      END IF;
    END IF;
  END IF;
END $$;

-- 8. SECURE RPC FUNCTIONS

-- A. get_active_upi_account(): Sanitized public payment endpoint for players
CREATE OR REPLACE FUNCTION public.get_active_upi_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_account RECORD;
BEGIN
  SELECT 
    id,
    upi_id,
    account_holder_name,
    phone_number,
    qr_code_url
  INTO v_account
  FROM public.upi_accounts
  WHERE is_active = true 
    AND is_enabled = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'has_active_account', false,
      'account', null,
      'message', 'Payment processing is temporarily paused for queue maintenance. Please try again shortly.'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'has_active_account', true,
    'account', jsonb_build_object(
      'id', v_account.id,
      'upi_id', v_account.upi_id,
      'account_holder_name', v_account.account_holder_name,
      'phone_number', v_account.phone_number,
      'qr_code_url', v_account.qr_code_url
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_active_upi_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_upi_account() TO anon, authenticated, service_role;

-- B. assign_upi_to_wallet_deposit(): Atomically assigns active UPI and registers deposit
CREATE OR REPLACE FUNCTION public.assign_upi_to_wallet_deposit(
  p_user_id uuid,
  p_wallet_id uuid,
  p_amount_inr numeric,
  p_utr_reference text,
  p_proof_image_path text,
  p_player_notes text DEFAULT NULL::text,
  p_requested_upi_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_clean_utr text;
  v_upi public.upi_accounts%ROWTYPE;
  v_wallet public.player_wallets%ROWTYPE;
  v_deposit_id uuid;
  v_deposit_ref text;
  v_date_str text;
  v_rand text;
BEGIN
  -- 1. Authorization: caller must be target user or service_role
  IF auth.role() != 'service_role' AND auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: You can only create deposits for your own account.');
  END IF;

  -- 2. Validate amount
  IF p_amount_inr IS NULL OR p_amount_inr <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Deposit amount must be greater than zero.');
  END IF;

  -- 3. Validate and normalize UTR
  v_clean_utr := upper(trim(COALESCE(p_utr_reference, '')));
  IF length(v_clean_utr) < 6 OR length(v_clean_utr) > 30 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Please enter a valid 6 to 30 character UTR / Transaction Reference ID.');
  END IF;

  -- Check global UTR uniqueness (including rejected submissions)
  IF EXISTS (SELECT 1 FROM public.wallet_deposits WHERE utr_reference = v_clean_utr) THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'This UTR / Transaction Reference ID has already been registered in the system. Duplicate submissions are strictly prohibited.'
    );
  END IF;

  -- 4. Validate screenshot proof path
  IF p_proof_image_path IS NULL OR trim(p_proof_image_path) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment screenshot proof is mandatory.');
  END IF;

  -- 5. Lock and verify player wallet
  SELECT * INTO v_wallet 
  FROM public.player_wallets 
  WHERE id = p_wallet_id AND user_id = p_user_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target player wallet not found.');
  END IF;

  IF v_wallet.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Player wallet is not active.');
  END IF;

  -- 6. Atomically lock and assign UPI account
  IF p_requested_upi_id IS NOT NULL THEN
    SELECT * INTO v_upi 
    FROM public.upi_accounts 
    WHERE id = p_requested_upi_id AND is_enabled = true 
    FOR UPDATE;
  END IF;

  IF v_upi.id IS NULL THEN
    SELECT * INTO v_upi 
    FROM public.upi_accounts 
    WHERE is_active = true AND is_enabled = true 
    FOR UPDATE;
  END IF;

  IF v_upi.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Deposit processing is temporarily unavailable. No active payment account is currently open in the rotation queue.'
    );
  END IF;

  -- 7. Generate deposit reference
  v_date_str := to_char(now(), 'YYYYMMDD');
  v_rand := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));
  v_deposit_ref := 'DEP-' || v_date_str || '-' || v_rand;

  -- 8. Insert deposit with snapshot details
  INSERT INTO public.wallet_deposits (
    deposit_reference,
    user_id,
    wallet_id,
    amount_paise,
    amount_inr,
    status,
    payment_method,
    utr_reference,
    proof_image_path,
    admin_notes,
    upi_account_id,
    assigned_upi_id,
    assigned_account_name,
    assigned_qr_url,
    created_at,
    updated_at
  ) VALUES (
    v_deposit_ref,
    p_user_id,
    v_wallet.id,
    (p_amount_inr * 100)::bigint,
    p_amount_inr,
    'under_review',
    'upi_qr',
    v_clean_utr,
    trim(p_proof_image_path),
    NULLIF(trim(p_player_notes), ''),
    v_upi.id,
    v_upi.upi_id,
    v_upi.account_holder_name,
    v_upi.qr_code_url,
    now(),
    now()
  ) RETURNING id INTO v_deposit_id;

  -- 9. Notify player
  INSERT INTO public.player_notifications (
    user_id,
    title,
    message,
    type,
    action_url,
    created_at
  ) VALUES (
    p_user_id,
    'Deposit Under Review',
    'Your deposit request for ₹' || p_amount_inr::text || ' has been registered and is awaiting admin verification.',
    'financial',
    '/dashboard/wallet?tab=deposits',
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'deposit_id', v_deposit_id,
    'deposit_reference', v_deposit_ref,
    'assigned_upi_id', v_upi.upi_id,
    'assigned_account_name', v_upi.account_holder_name
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.assign_upi_to_wallet_deposit(uuid, uuid, numeric, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_upi_to_wallet_deposit TO authenticated, service_role;

-- C. admin_approve_wallet_deposit(): Atomically approves deposit, credits wallet, and executes rotation
CREATE OR REPLACE FUNCTION public.admin_approve_wallet_deposit(
  p_deposit_id uuid,
  p_admin_id uuid DEFAULT NULL::uuid,
  p_admin_notes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_effective_admin uuid;
  v_deposit public.wallet_deposits%ROWTYPE;
  v_wallet public.player_wallets%ROWTYPE;
  v_upi_account public.upi_accounts%ROWTYPE;
  v_next_account public.upi_accounts%ROWTYPE;
  v_balance_before bigint;
  v_balance_after bigint;
  v_tx_ref text;
  v_date_str text;
  v_new_cycle_count integer := 0;
  v_new_total_count integer := 0;
  v_rotation_triggered boolean := false;
  v_rotation_event_id uuid := NULL;
BEGIN
  -- 1. Determine effective admin actor:
  -- service_role: accepts p_admin_id (validated against active financial admins)
  -- authenticated: strictly derived from auth.uid() (ignores client-supplied p_admin_id)
  -- anon / others: strictly rejected
  IF auth.role() = 'service_role' THEN
    v_effective_admin := p_admin_id;
  ELSIF auth.role() = 'authenticated' THEN
    v_effective_admin := auth.uid();
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required.');
  END IF;

  IF v_effective_admin IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Administrator identity required.');
  END IF;

  -- Verify actor has active financial admin privileges (super_admin or finance_admin)
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE id = v_effective_admin 
      AND is_active = true 
      AND role IN ('super_admin', 'finance_admin')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Requires active financial administrator privileges.');
  END IF;

  -- 2. Lock deposit record (Row-level lock prevents race conditions)
  SELECT * INTO v_deposit 
  FROM public.wallet_deposits 
  WHERE id = p_deposit_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Deposit request not found.');
  END IF;

  IF v_deposit.status != 'under_review' AND v_deposit.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Deposit request is already processed. Current status: ' || v_deposit.status
    );
  END IF;

  -- 3. Lock target player wallet
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

  -- 4. Credit wallet balance
  v_balance_before := v_wallet.available_balance_paise;
  v_balance_after := v_balance_before + v_deposit.amount_paise;

  UPDATE public.player_wallets
  SET available_balance_paise = v_balance_after,
      total_deposited_paise = total_deposited_paise + v_deposit.amount_paise,
      version = version + 1,
      updated_at = now()
  WHERE id = v_wallet.id;

  -- 5. Insert transaction ledger entry
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

  -- 6. Rotation Engine Counter & Limit Evaluation
  IF v_deposit.upi_account_id IS NOT NULL THEN
    -- Lock assigned account row
    SELECT * INTO v_upi_account 
    FROM public.upi_accounts 
    WHERE id = v_deposit.upi_account_id 
    FOR UPDATE;

    IF FOUND THEN
      v_new_cycle_count := v_upi_account.verified_transactions_count + 1;
      v_new_total_count := v_upi_account.total_verified_count + 1;

      -- Check if limit reached
      IF v_new_cycle_count >= v_upi_account.max_successful_transactions THEN
        -- Acquire queue rotation advisory lock to eliminate deadlock with concurrent manual rotation
        PERFORM pg_advisory_xact_lock(hashtext('upi_queue_rotation'));

        -- Find next enabled account in queue (forward in queue_order, skipping disabled)
        SELECT * INTO v_next_account 
        FROM public.upi_accounts 
        WHERE is_enabled = true 
          AND queue_order > v_upi_account.queue_order
        ORDER BY queue_order ASC, created_at ASC 
        LIMIT 1 
        FOR UPDATE;

        -- If none found ahead in the queue, wrap around to the start of the queue
        IF v_next_account.id IS NULL THEN
          SELECT * INTO v_next_account 
          FROM public.upi_accounts 
          WHERE is_enabled = true 
            AND id != v_upi_account.id
          ORDER BY queue_order ASC, created_at ASC 
          LIMIT 1 
          FOR UPDATE;
        END IF;

        IF v_next_account.id IS NOT NULL THEN
          -- Deactivate exhausted account; preserve cycle count as final count
          UPDATE public.upi_accounts 
          SET is_active = false,
              verified_transactions_count = v_new_cycle_count,
              total_verified_count = v_new_total_count,
              last_rotated_at = now(),
              updated_at = now()
          WHERE id = v_upi_account.id;

          -- Activate next account; reset its cycle count to 0
          UPDATE public.upi_accounts 
          SET is_active = true,
              verified_transactions_count = 0,
              last_activated_at = now(),
              updated_at = now()
          WHERE id = v_next_account.id;

          v_rotation_triggered := true;

          -- Log rotation event
          INSERT INTO public.upi_rotation_events (
            from_upi_account_id,
            to_upi_account_id,
            trigger_type,
            verified_payments_at_rotation,
            configured_limit,
            triggered_by,
            deposit_id_trigger,
            notes,
            created_at
          ) VALUES (
            v_upi_account.id,
            v_next_account.id,
            'automatic_limit_reached',
            v_new_cycle_count,
            v_upi_account.max_successful_transactions,
            v_effective_admin,
            p_deposit_id,
            'Limit of ' || v_upi_account.max_successful_transactions || ' reached. Rotated to ' || v_next_account.account_holder_name,
            now()
          ) RETURNING id INTO v_rotation_event_id;
        ELSE
          -- No eligible next account: Deactivate and pause queue (Never automatically reset current account)
          UPDATE public.upi_accounts 
          SET is_active = false,
              verified_transactions_count = v_new_cycle_count,
              total_verified_count = v_new_total_count,
              last_rotated_at = now(),
              updated_at = now()
          WHERE id = v_upi_account.id;

          v_rotation_triggered := true;

          INSERT INTO public.upi_rotation_events (
            from_upi_account_id,
            to_upi_account_id,
            trigger_type,
            verified_payments_at_rotation,
            configured_limit,
            triggered_by,
            deposit_id_trigger,
            notes,
            created_at
          ) VALUES (
            v_upi_account.id,
            NULL,
            'queue_exhausted_paused',
            v_new_cycle_count,
            v_upi_account.max_successful_transactions,
            v_effective_admin,
            p_deposit_id,
            'Queue exhausted: No eligible next account found. Payment assignment paused.',
            now()
          ) RETURNING id INTO v_rotation_event_id;
        END IF;
      ELSE
        -- Increment counters on assigned account
        UPDATE public.upi_accounts 
        SET verified_transactions_count = v_new_cycle_count,
            total_verified_count = v_new_total_count,
            updated_at = now()
        WHERE id = v_upi_account.id;
      END IF;

      -- Insert immutable payment audit log
      INSERT INTO public.upi_payment_audit_logs (
        deposit_id,
        upi_account_id,
        user_id,
        utr_reference,
        amount_inr,
        verification_status,
        verified_by,
        verified_at,
        rotation_triggered,
        rotation_event_id,
        details,
        created_at
      ) VALUES (
        p_deposit_id,
        v_upi_account.id,
        v_deposit.user_id,
        v_deposit.utr_reference,
        v_deposit.amount_inr,
        'approved',
        v_effective_admin,
        now(),
        v_rotation_triggered,
        v_rotation_event_id,
        jsonb_build_object(
          'cycle_count_before', v_upi_account.verified_transactions_count,
          'cycle_count_after', v_new_cycle_count,
          'max_limit', v_upi_account.max_successful_transactions,
          'assigned_account_name', v_upi_account.account_holder_name
        ),
        now()
      );
    END IF;
  END IF;

  -- 7. Update deposit status
  UPDATE public.wallet_deposits
  SET status = 'approved',
      reviewed_by = v_effective_admin,
      reviewed_at = now(),
      approved_at = now(),
      admin_notes = NULLIF(trim(p_admin_notes), ''),
      updated_at = now()
  WHERE id = p_deposit_id;

  -- 8. Player notification
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

  -- 9. Financial Audit Log
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
    v_effective_admin,
    'APPROVE_WALLET_DEPOSIT',
    'wallet_deposits',
    p_deposit_id::text,
    jsonb_build_object('status', v_deposit.status, 'available_balance_paise', v_balance_before),
    jsonb_build_object('status', 'approved', 'available_balance_paise', v_balance_after),
    jsonb_build_object(
      'utr', v_deposit.utr_reference,
      'amount_inr', v_deposit.amount_inr,
      'rotation_triggered', v_rotation_triggered,
      'rotation_event_id', v_rotation_event_id
    ),
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'deposit_id', p_deposit_id,
    'amount_inr', v_deposit.amount_inr,
    'new_balance_paise', v_balance_after,
    'transaction_ref', v_tx_ref,
    'rotation_triggered', v_rotation_triggered,
    'rotation_event_id', v_rotation_event_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_approve_wallet_deposit(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_wallet_deposit TO authenticated, service_role;

-- D. admin_rotate_upi_account(): Manual admin account activation
CREATE OR REPLACE FUNCTION public.admin_rotate_upi_account(
  p_target_account_id uuid,
  p_admin_id uuid DEFAULT NULL::uuid,
  p_reason text DEFAULT 'Manual administrative rotation'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_effective_admin uuid;
  v_current public.upi_accounts%ROWTYPE;
  v_target public.upi_accounts%ROWTYPE;
  v_event_id uuid;
BEGIN
  -- 1. Determine effective admin actor:
  -- service_role: accepts p_admin_id (validated against active financial admins)
  -- authenticated: strictly derived from auth.uid() (ignores client-supplied p_admin_id)
  -- anon / others: strictly rejected
  IF auth.role() = 'service_role' THEN
    v_effective_admin := p_admin_id;
  ELSIF auth.role() = 'authenticated' THEN
    v_effective_admin := auth.uid();
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required.');
  END IF;

  IF v_effective_admin IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Administrator identity required.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE id = v_effective_admin 
      AND is_active = true 
      AND role IN ('super_admin', 'finance_admin')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Requires active financial administrator privileges.');
  END IF;

  -- 2. Validate target account exists and is enabled
  SELECT * INTO v_target 
  FROM public.upi_accounts 
  WHERE id = p_target_account_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target UPI account not found.');
  END IF;

  IF v_target.is_enabled = false THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot activate a disabled UPI account. Please enable it first.');
  END IF;

  IF v_target.is_active = true THEN
    RETURN jsonb_build_object('success', false, 'error', 'This account is already the active UPI account.');
  END IF;

  -- 3. Acquire queue rotation advisory lock to eliminate deadlock with concurrent approvals
  PERFORM pg_advisory_xact_lock(hashtext('upi_queue_rotation'));

  -- 4. Consistent row locking: Lock current active account first, then target account
  SELECT * INTO v_current 
  FROM public.upi_accounts 
  WHERE is_active = true 
  FOR UPDATE;

  SELECT * INTO v_target 
  FROM public.upi_accounts 
  WHERE id = p_target_account_id 
  FOR UPDATE;

  IF v_target.is_enabled = false THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot activate a disabled UPI account. Please enable it first.');
  END IF;

  IF v_target.is_active = true THEN
    RETURN jsonb_build_object('success', false, 'error', 'This account is already the active UPI account.');
  END IF;

  IF v_current.id IS NOT NULL THEN
    UPDATE public.upi_accounts 
    SET is_active = false,
        last_rotated_at = now(),
        updated_at = now()
    WHERE id = v_current.id;
  END IF;

  -- Activate target account
  UPDATE public.upi_accounts 
  SET is_active = true,
      last_activated_at = now(),
      updated_at = now()
  WHERE id = v_target.id;

  -- Record manual rotation event
  INSERT INTO public.upi_rotation_events (
    from_upi_account_id,
    to_upi_account_id,
    trigger_type,
    verified_payments_at_rotation,
    configured_limit,
    triggered_by,
    notes,
    created_at
  ) VALUES (
    v_current.id,
    v_target.id,
    'manual_admin_switch',
    COALESCE(v_current.verified_transactions_count, 0),
    COALESCE(v_current.max_successful_transactions, 18),
    v_effective_admin,
    trim(p_reason),
    now()
  ) RETURNING id INTO v_event_id;

  RETURN jsonb_build_object(
    'success', true,
    'activated_account_id', v_target.id,
    'activated_account_name', v_target.account_holder_name,
    'rotation_event_id', v_event_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_rotate_upi_account(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_rotate_upi_account TO authenticated, service_role;

-- E. admin_release_rejected_deposit_utr(): Controlled Administrative Correction
CREATE OR REPLACE FUNCTION public.admin_release_rejected_deposit_utr(
  p_deposit_id uuid,
  p_admin_id uuid DEFAULT NULL::uuid,
  p_reason text DEFAULT 'Administrative UTR correction'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_effective_admin uuid;
  v_deposit public.wallet_deposits%ROWTYPE;
  v_old_utr text;
  v_voided_utr text;
BEGIN
  -- 1. Determine effective admin actor:
  -- service_role: accepts p_admin_id (validated against active financial admins)
  -- authenticated: strictly derived from auth.uid() (ignores client-supplied p_admin_id)
  -- anon / others: strictly rejected
  IF auth.role() = 'service_role' THEN
    v_effective_admin := p_admin_id;
  ELSIF auth.role() = 'authenticated' THEN
    v_effective_admin := auth.uid();
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required.');
  END IF;

  IF v_effective_admin IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Administrator identity required.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE id = v_effective_admin 
      AND is_active = true 
      AND role IN ('super_admin', 'finance_admin')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Requires active financial administrator privileges.');
  END IF;

  SELECT * INTO v_deposit 
  FROM public.wallet_deposits 
  WHERE id = p_deposit_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Deposit not found.');
  END IF;

  IF v_deposit.status != 'rejected' THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Only rejected deposit UTR references can be administratively released. Current status: ' || v_deposit.status
    );
  END IF;

  v_old_utr := v_deposit.utr_reference;
  v_voided_utr := v_old_utr || '-RELEASED-' || to_char(now(), 'YYYYMMDDHH24MISS');

  UPDATE public.wallet_deposits
  SET utr_reference = v_voided_utr,
      admin_notes = COALESCE(admin_notes || ' | ', '') || 'UTR ' || v_old_utr || ' released by admin: ' || trim(p_reason),
      updated_at = now()
  WHERE id = p_deposit_id;

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
    v_effective_admin,
    'RELEASE_REJECTED_DEPOSIT_UTR',
    'wallet_deposits',
    p_deposit_id::text,
    jsonb_build_object('utr_reference', v_old_utr),
    jsonb_build_object('utr_reference', v_voided_utr),
    jsonb_build_object('reason', trim(p_reason)),
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'deposit_id', p_deposit_id,
    'released_utr', v_old_utr,
    'voided_utr', v_voided_utr
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_release_rejected_deposit_utr(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_release_rejected_deposit_utr TO authenticated, service_role;
