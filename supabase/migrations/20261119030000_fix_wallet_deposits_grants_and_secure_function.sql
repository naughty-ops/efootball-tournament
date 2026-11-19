-- =============================================================================
-- Migration: Fix wallet_deposits table grants + secure deposit submission
-- Author:    Security audit fix
-- Date:      2026-11-19
-- Reversible: See rollback section at bottom
-- =============================================================================
-- ROOT CAUSE: authenticated and service_role roles had NO table-level GRANT
-- privileges on wallet_deposits. PostgreSQL checks object privileges BEFORE
-- evaluating RLS policies. Without GRANT, Postgres denies access and reports
-- the misleading "new row violates row-level security policy" message.
--
-- FIX:
--   A. Grant minimal necessary table privileges to authenticated and service_role.
--   B. Create a SECURITY DEFINER function that handles deposit submission with
--      full server-side security enforcement, independent of key-type issues.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- A. GRANT table-level privileges
-- ─────────────────────────────────────────────────────────────────────────────

-- authenticated: SELECT own rows (RLS enforces ownership), INSERT via RLS policy
GRANT SELECT, INSERT ON public.wallet_deposits TO authenticated;

-- service_role: full DML needed for admin operations (admin client bypasses RLS)
GRANT SELECT, INSERT, UPDATE ON public.wallet_deposits TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- B. SECURITY DEFINER function: submit_wallet_deposit_request
--
-- This function:
--   1. Validates auth.uid() matches the submitted user_id.
--   2. Validates amount within allowed range.
--   3. Prevents duplicate UTR submissions.
--   4. Inserts the deposit with status forced to 'under_review'.
--   5. Runs as postgres owner (SECURITY DEFINER) so it is immune to
--      table-level grant gaps and key-type ambiguity (sb_secret_ vs eyJ... JWT).
--   6. Never trusts client-submitted status or approval fields.
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

  -- ── 3. Amount range validation ────────────────────────────────────────────
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
      'error', 'Amount values are inconsistent.'
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

  -- ── 5. Proof image required ───────────────────────────────────────────────
  IF p_proof_image_path IS NULL OR trim(p_proof_image_path) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'PROOF_REQUIRED',
      'error', 'Payment screenshot proof is required.'
    );
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
    v_caller_id,                       -- always use verified auth.uid()
    p_wallet_id,
    p_amount_paise,
    p_amount_inr,
    'under_review',                    -- status never client-settable
    'upi_qr',
    v_clean_utr,
    trim(p_proof_image_path),
    p_proof_cloudinary_public_id,
    CASE
      WHEN p_proof_cloudinary_public_id IS NOT NULL THEN 'cloudinary'
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

-- Grant: only authenticated users can call this function
REVOKE ALL ON FUNCTION public.submit_wallet_deposit_request(
  uuid, uuid, numeric, bigint, text, text, text, text, text
) FROM public;

GRANT EXECUTE ON FUNCTION public.submit_wallet_deposit_request(
  uuid, uuid, numeric, bigint, text, text, text, text, text
) TO authenticated;

-- Add explanatory comment
COMMENT ON FUNCTION public.submit_wallet_deposit_request IS
  'SECURITY DEFINER function: validates auth.uid(), enforces business rules, '
  'and inserts a wallet deposit with status forced to under_review. '
  'Immune to table-level grant gaps and Supabase key-type ambiguity.';

-- =============================================================================
-- ROLLBACK (run manually if needed):
-- =============================================================================
-- REVOKE SELECT, INSERT ON public.wallet_deposits FROM authenticated;
-- REVOKE SELECT, INSERT, UPDATE ON public.wallet_deposits FROM service_role;
-- DROP FUNCTION IF EXISTS public.submit_wallet_deposit_request(uuid, uuid, numeric, bigint, text, text, text, text, text);
-- =============================================================================
