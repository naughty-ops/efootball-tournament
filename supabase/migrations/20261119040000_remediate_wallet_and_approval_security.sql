-- =============================================================================
-- Migration: Remediate Wallet Deposit, Ledger & Approval Security (SEC-01 to SEC-05)
-- Author:    Principal PostgreSQL Security Engineer & Supabase Architect
-- Date:      2026-11-19
-- Project:   e-football.in (cqgbeafenavkeirwsxbg)
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. SEC-03: ENFORCE INR AND PAISE PARITY AT TABLE LEVEL
--    Ensures amount_paise is ALWAYS exactly round(amount_inr * 100)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wallet_deposits_paise_inr_parity_check'
  ) THEN
    ALTER TABLE public.wallet_deposits
      ADD CONSTRAINT wallet_deposits_paise_inr_parity_check
      CHECK (amount_paise = round(amount_inr * 100));
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. SEC-05: REMOVE DIRECT CUSTOMER INSERTION ON wallet_deposits
--    The ONLY permitted customer creation path is submit_wallet_deposit_request().
--    Revoking INSERT on the table prevents direct PostgREST REST inserts.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE INSERT ON public.wallet_deposits FROM public, anon, authenticated;
GRANT SELECT ON public.wallet_deposits TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.wallet_deposits TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. SEC-04: UPDATE submit_wallet_deposit_request WITH PROOF OWNERSHIP CHECK
--    Validates that p_proof_cloudinary_public_id belongs strictly to the caller:
--    efootball/payment-proofs/<v_caller_id>/...
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_wallet_deposit_request(
  p_user_id                  uuid,
  p_wallet_id                uuid,
  p_amount_inr               numeric,
  p_amount_paise             bigint,
  p_deposit_reference        text,
  p_utr_reference            text,
  p_proof_image_path         text,
  p_proof_cloudinary_public_id text DEFAULT NULL,
  p_player_notes             text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id    uuid := auth.uid();
  v_deposit_id   uuid;
  v_clean_utr    text := upper(trim(p_utr_reference));
  v_clean_proof  text := trim(COALESCE(p_proof_image_path, ''));
  v_clean_cld_id text := trim(COALESCE(p_proof_cloudinary_public_id, ''));
  v_safe_uid_hyphen text;
  v_safe_uid_no_hyphen text;
BEGIN
  -- ── 1. Authentication guard ────────────────────────────────────────────────
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'AUTH_REQUIRED',
      'error', 'Authentication required. Please sign in and try again.'
    );
  END IF;

  IF v_caller_id != p_user_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'FORBIDDEN',
      'error', 'You can only submit deposits for your own account.'
    );
  END IF;

  -- ── 2. Validate wallet ownership ──────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM public.player_wallets
    WHERE id = p_wallet_id AND user_id = v_caller_id
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_WALLET',
      'error', 'Wallet not found or does not belong to your account.'
    );
  END IF;

  -- ── 3. Amount range & parity validation (SEC-03) ──────────────────────────
  IF p_amount_inr < 10 OR p_amount_inr > 2000 THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'AMOUNT_OUT_OF_RANGE',
      'error', 'Deposit amount must be between ₹10 and ₹2000.'
    );
  END IF;

  IF p_amount_paise != round(p_amount_inr * 100) THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'AMOUNT_MISMATCH',
      'error', 'Amount values in paise and INR are inconsistent.'
    );
  END IF;

  -- ── 4. UTR validation ─────────────────────────────────────────────────────
  IF v_clean_utr IS NULL OR length(v_clean_utr) < 6 OR length(v_clean_utr) > 30 THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_UTR',
      'error', 'Please enter a valid 6 to 30 character UTR / Transaction Reference ID.'
    );
  END IF;

  -- ── 5. Proof image validation & Cloudinary ownership (SEC-04) ─────────────
  IF v_clean_proof = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'PROOF_REQUIRED',
      'error', 'Payment screenshot proof is required.'
    );
  END IF;

  IF v_clean_cld_id != '' THEN
    v_safe_uid_hyphen := v_caller_id::text;
    v_safe_uid_no_hyphen := replace(v_caller_id::text, '-', '');

    IF NOT (
      v_clean_cld_id LIKE 'efootball/payment-proofs/' || v_safe_uid_hyphen || '/%'
      OR v_clean_cld_id LIKE 'efootball/payment-proofs/' || v_safe_uid_no_hyphen || '/%'
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'INVALID_PROOF_OWNERSHIP',
        'error', 'Payment proof screenshot reference does not belong to your account.'
      );
    END IF;
  END IF;

  -- ── 6. Duplicate UTR check ────────────────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM public.wallet_deposits
    WHERE utr_reference = v_clean_utr
      AND status IN ('under_review', 'approved')
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'DUPLICATE_UTR',
      'error', 'This UTR / Transaction Reference ID has already been submitted. Duplicate submissions are not allowed.'
    );
  END IF;

  -- ── 7. Insert deposit (status always forced to under_review) ──────────────
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
    proof_cloudinary_public_id,
    proof_asset_type,
    admin_notes,
    created_at,
    updated_at
  ) VALUES (
    p_deposit_reference,
    v_caller_id,
    p_wallet_id,
    p_amount_paise,
    p_amount_inr,
    'under_review',
    'upi_qr',
    v_clean_utr,
    v_clean_proof,
    NULLIF(v_clean_cld_id, ''),
    CASE
      WHEN v_clean_cld_id != '' THEN 'cloudinary'
      ELSE 'supabase'
    END,
    NULLIF(trim(COALESCE(p_player_notes, '')), ''),
    now(),
    now()
  )
  RETURNING id INTO v_deposit_id;

  RETURN jsonb_build_object(
    'success', true,
    'deposit_id', v_deposit_id,
    'deposit_reference', p_deposit_reference
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'DUPLICATE_UTR',
      'error', 'This UTR / Transaction Reference ID has already been submitted.'
    );
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'DB_ERROR',
      'error', 'Deposit submission failed due to a server error. Please try again.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_wallet_deposit_request(
  uuid, uuid, numeric, bigint, text, text, text, text, text
) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.submit_wallet_deposit_request(
  uuid, uuid, numeric, bigint, text, text, text, text, text
) TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. SEC-01 & SEC-02: SECURE admin_approve_wallet_deposit
--    - Derives identity from auth.uid()
--    - Rejects unauthenticated callers
--    - Checks is_active = true AND role IN ('super_admin', 'finance_admin')
--    - For service_role context, validates explicit p_admin_id against admin_users
--    - Removes execution permissions from public & anon
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_approve_wallet_deposit(
  p_deposit_id   uuid,
  p_admin_id     uuid DEFAULT NULL,
  p_admin_notes  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id       uuid := auth.uid();
  v_caller_role     text := coalesce(auth.role(), current_user);
  v_acting_admin_id uuid;
  v_deposit         RECORD;
  v_wallet          RECORD;
  v_balance_before  BIGINT;
  v_balance_after   BIGINT;
  v_tx_ref          TEXT;
  v_date_str        TEXT;
BEGIN
  -- ── 1. Authorization guard ────────────────────────────────────────────────
  IF v_caller_role = 'service_role' THEN
    -- Server-side service_role execution: require explicit p_admin_id
    IF p_admin_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Administrator ID is required.');
    END IF;
    v_acting_admin_id := p_admin_id;
  ELSE
    -- Authenticated user execution: MUST derive from auth.uid()
    IF v_caller_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'AUTH_REQUIRED',
        'error', 'Authentication required. Please sign in as an administrator.'
      );
    END IF;
    v_acting_admin_id := v_caller_id;
  END IF;

  -- ── 2. Verify active financial administrator role (SEC-02) ─────────────────
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE id = v_acting_admin_id
      AND is_active = true
      AND role IN ('super_admin', 'finance_admin')
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'FORBIDDEN',
      'error', 'Unauthorized: Requires financial administrator privileges (super_admin or finance_admin).'
    );
  END IF;

  -- ── 3. Lock and retrieve deposit ───────────────────────────────────────────
  SELECT * INTO v_deposit
  FROM public.wallet_deposits
  WHERE id = p_deposit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Deposit request not found.');
  END IF;

  IF v_deposit.status NOT IN ('pending', 'under_review') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Deposit request is already processed. Current status: ' || v_deposit.status
    );
  END IF;

  -- ── 4. Verify deposit amount parity before crediting (SEC-03) ──────────────
  IF v_deposit.amount_paise != round(v_deposit.amount_inr * 100) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Financial anomaly detected: deposit amount paise/INR mismatch. Re-verification required.'
    );
  END IF;

  -- ── 5. Lock and retrieve player wallet ─────────────────────────────────────
  SELECT * INTO v_wallet
  FROM public.player_wallets
  WHERE id = v_deposit.wallet_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target player wallet not found.');
  END IF;

  IF v_wallet.status != 'active' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Player wallet is not active (current status: ' || v_wallet.status || ').'
    );
  END IF;

  -- ── 6. Atomic balance update ──────────────────────────────────────────────
  v_balance_before := v_wallet.available_balance_paise;
  v_balance_after  := v_balance_before + v_deposit.amount_paise;

  UPDATE public.player_wallets
  SET 
    available_balance_paise = v_balance_after,
    total_deposited_paise   = total_deposited_paise + v_deposit.amount_paise,
    version                 = version + 1,
    updated_at              = now()
  WHERE id = v_wallet.id;

  -- ── 7. Insert completed ledger transaction (idempotent) ───────────────────
  v_date_str := to_char(now(), 'YYYYMMDD');
  v_tx_ref   := 'TX-DEP-' || v_date_str || '-' || upper(substr(p_deposit_id::text, 1, 8));

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

  -- ── 8. Update deposit record ──────────────────────────────────────────────
  UPDATE public.wallet_deposits
  SET 
    status       = 'approved',
    reviewed_by  = v_acting_admin_id,
    reviewed_at  = now(),
    approved_at  = now(),
    admin_notes  = p_admin_notes,
    updated_at   = now()
  WHERE id = p_deposit_id;

  -- ── 9. Player notification ────────────────────────────────────────────────
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

  -- ── 10. Financial audit log ───────────────────────────────────────────────
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
    v_acting_admin_id,
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

-- Revoke dangerous permissions on approval function
REVOKE ALL ON FUNCTION public.admin_approve_wallet_deposit(uuid, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_wallet_deposit(uuid, uuid, text) TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. SEC-01 & SEC-02: SECURE admin_reject_wallet_deposit
--    - Derives identity from auth.uid()
--    - Rejects unauthenticated callers
--    - Checks is_active = true AND role IN ('super_admin', 'finance_admin')
--    - Removes execution permissions from public & anon
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_reject_wallet_deposit(
  p_deposit_id        uuid,
  p_admin_id          uuid DEFAULT NULL,
  p_rejection_reason  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id       uuid := auth.uid();
  v_caller_role     text := coalesce(auth.role(), current_user);
  v_acting_admin_id uuid;
  v_deposit         RECORD;
  v_reason          TEXT;
BEGIN
  -- ── 1. Authorization guard ────────────────────────────────────────────────
  IF v_caller_role = 'service_role' THEN
    IF p_admin_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Administrator ID is required.');
    END IF;
    v_acting_admin_id := p_admin_id;
  ELSE
    IF v_caller_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'AUTH_REQUIRED',
        'error', 'Authentication required. Please sign in as an administrator.'
      );
    END IF;
    v_acting_admin_id := v_caller_id;
  END IF;

  -- ── 2. Verify active financial administrator role ──────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE id = v_acting_admin_id
      AND is_active = true
      AND role IN ('super_admin', 'finance_admin')
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'FORBIDDEN',
      'error', 'Unauthorized: Requires financial administrator privileges (super_admin or finance_admin).'
    );
  END IF;

  -- ── 3. Rejection reason validation ────────────────────────────────────────
  v_reason := trim(COALESCE(p_rejection_reason, ''));
  IF length(v_reason) < 3 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'A valid rejection explanation reason is required (minimum 3 characters).'
    );
  END IF;

  -- ── 4. Lock and retrieve deposit ───────────────────────────────────────────
  SELECT * INTO v_deposit
  FROM public.wallet_deposits
  WHERE id = p_deposit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Deposit request not found.');
  END IF;

  IF v_deposit.status NOT IN ('pending', 'under_review') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Deposit request is already processed. Current status: ' || v_deposit.status
    );
  END IF;

  -- ── 5. Update deposit status to rejected ───────────────────────────────────
  UPDATE public.wallet_deposits
  SET 
    status           = 'rejected',
    rejection_reason = v_reason,
    reviewed_by      = v_acting_admin_id,
    reviewed_at      = now(),
    updated_at       = now()
  WHERE id = p_deposit_id;

  -- ── 6. Player notification ────────────────────────────────────────────────
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

  -- ── 7. Financial audit log ────────────────────────────────────────────────
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
    v_acting_admin_id,
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

-- Revoke dangerous permissions on rejection function
REVOKE ALL ON FUNCTION public.admin_reject_wallet_deposit(uuid, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_wallet_deposit(uuid, uuid, text) TO authenticated, service_role;
