-- ============================================================================
-- Migration: 20261107000000_manual_whatsapp_payment_system.sql
-- Description:
-- Production-Ready Manual WhatsApp Payment & Admin Approval System
-- for Paid Tournaments.
--
-- Features:
-- 1. Updates tournament_registrations check constraint for all 6 active statuses:
--    - pending_payment
--    - payment_submitted
--    - under_verification
--    - approved
--    - rejected
--    - cancelled (plus legacy confirmed, expired, refunded)
-- 2. Adds columns to tournament_registrations:
--    - payment_method, payment_reference, payment_proof_url, verified_amount_paise,
--      verified_by, verified_at, rejection_reason, submitted_at, approved_at, notes
-- 3. Updates active registration index to guard against duplicate pending/approved registrations.
-- 4. Seeds default manual payment settings in site_settings.
-- 5. Hardens RLS on tournament_registrations for users and admins.
-- 6. Provides atomic, secure RPCs:
--    - admin_approve_manual_registration
--    - admin_reject_manual_registration
--    - admin_set_under_verification
--    - submit_manual_payment
--    - cancel_manual_registration
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Update tournament_registrations columns & status constraint
-- ----------------------------------------------------------------------------
ALTER TABLE public.tournament_registrations 
  DROP CONSTRAINT IF EXISTS chk_registration_status;

ALTER TABLE public.tournament_registrations 
  ADD CONSTRAINT chk_registration_status CHECK (
    (status)::text = ANY (ARRAY[
      'pending_payment'::character varying,
      'payment_submitted'::character varying,
      'under_verification'::character varying,
      'approved'::character varying,
      'rejected'::character varying,
      'confirmed'::character varying,
      'expired'::character varying,
      'cancelled'::character varying,
      'refunded'::character varying
    ]::text[])
  );

ALTER TABLE public.tournament_registrations
  ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'whatsapp_manual',
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS payment_proof_url text,
  ADD COLUMN IF NOT EXISTS verified_amount_paise bigint,
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS notes text;

-- ----------------------------------------------------------------------------
-- 2. Update active registration partial index
-- ----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_active_tournament_registration;

CREATE UNIQUE INDEX idx_active_tournament_registration
  ON public.tournament_registrations (tournament_id, user_id)
  WHERE ((status)::text = ANY (ARRAY[
    'pending_payment'::character varying,
    'payment_submitted'::character varying,
    'under_verification'::character varying,
    'approved'::character varying,
    'confirmed'::character varying
  ]::text[]));

-- ----------------------------------------------------------------------------
-- 3. Seed site_settings with default payment configuration
-- ----------------------------------------------------------------------------
INSERT INTO public.site_settings (key, value, updated_at)
VALUES (
  'payment_settings',
  jsonb_build_object(
    'admin_whatsapp_number', '+919207516227',
    'upi_id', 'efootball@upi',
    'account_holder_name', 'eFootball Tournament Admin',
    'bank_name', 'State Bank of India',
    'account_number', '',
    'ifsc_code', '',
    'instructions', 'Send payment via UPI or Bank Transfer. Then click "Pay via WhatsApp" to share the payment screenshot and your Registration ID with the admin.',
    'verification_notice', 'Manual payment verification takes between 10 to 30 minutes during active hours. Once verified, your slot will be confirmed automatically.'
  ),
  now()
)
ON CONFLICT (key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. Hardened RLS policies for tournament_registrations
-- ----------------------------------------------------------------------------
ALTER TABLE public.tournament_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read all registrations" ON public.tournament_registrations;
DROP POLICY IF EXISTS "Admins can update registrations" ON public.tournament_registrations;
DROP POLICY IF EXISTS "Admins have full access to registrations" ON public.tournament_registrations;
DROP POLICY IF EXISTS "Users can read own registrations" ON public.tournament_registrations;
DROP POLICY IF EXISTS "Users can insert own registrations" ON public.tournament_registrations;
DROP POLICY IF EXISTS "Users can update own unconfirmed registrations" ON public.tournament_registrations;

-- Admin policies
CREATE POLICY "Admins have full access to registrations"
  ON public.tournament_registrations
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- User policies
CREATE POLICY "Users can read own registrations"
  ON public.tournament_registrations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own registrations"
  ON public.tournament_registrations
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own unconfirmed registrations"
  ON public.tournament_registrations
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id AND 
    (status)::text = ANY (ARRAY[
      'pending_payment'::character varying,
      'payment_submitted'::character varying,
      'cancelled'::character varying
    ]::text[])
  );

-- ----------------------------------------------------------------------------
-- 5. Stored Procedures: Manual Payment Lifecycle & Admin Verification
-- ----------------------------------------------------------------------------

-- RPC: Admin approves manual registration & confirms participant atomically
CREATE OR REPLACE FUNCTION public.admin_approve_manual_registration(
  p_registration_id uuid,
  p_verified_amount_paise bigint DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_reg RECORD;
  v_tournament RECORD;
  v_profile RECORD;
  v_current_participants integer;
  v_existing_part_id uuid;
  v_new_part_id uuid;
  v_username text;
  v_real_name text;
  v_contact text;
  v_verified_amount bigint;
BEGIN
  -- RBAC check
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Administrator privileges required';
  END IF;

  -- Lock registration row
  SELECT * INTO v_reg 
  FROM public.tournament_registrations 
  WHERE id = p_registration_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration request % not found', p_registration_id;
  END IF;

  -- Guard against approving already confirmed / cancelled
  IF v_reg.status IN ('approved', 'confirmed') THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Registration is already approved.'
    );
  END IF;

  IF v_reg.status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Cannot approve a cancelled registration.'
    );
  END IF;

  -- Lock tournament row & verify capacity
  SELECT * INTO v_tournament 
  FROM public.tournaments 
  WHERE id = v_reg.tournament_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament % not found', v_reg.tournament_id;
  END IF;

  SELECT count(*) INTO v_current_participants 
  FROM public.participants 
  WHERE tournament_id = v_reg.tournament_id;

  IF v_current_participants >= v_tournament.max_participants THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Tournament is full (' || v_tournament.max_participants || ' slots). Cannot approve registration.'
    );
  END IF;

  v_verified_amount := COALESCE(p_verified_amount_paise, v_reg.amount_paise);

  -- Check if participant row already exists for this user
  SELECT id INTO v_existing_part_id 
  FROM public.participants 
  WHERE tournament_id = v_reg.tournament_id 
    AND user_id = v_reg.user_id;

  IF v_existing_part_id IS NOT NULL THEN
    UPDATE public.tournament_registrations
    SET status = 'approved',
        participant_id = v_existing_part_id,
        verified_by = auth.uid(),
        verified_at = now(),
        approved_at = now(),
        confirmed_at = now(),
        verified_amount_paise = v_verified_amount,
        notes = COALESCE(p_note, notes),
        updated_at = now()
    WHERE id = p_registration_id;

    RETURN jsonb_build_object(
      'success', true, 
      'participant_id', v_existing_part_id, 
      'message', 'User was already registered; registration marked approved.'
    );
  END IF;

  -- Fetch player profile
  SELECT * INTO v_profile 
  FROM public.profiles 
  WHERE id = v_reg.user_id;

  v_username := COALESCE(
    NULLIF(TRIM(v_profile.efootball_id), ''),
    NULLIF(TRIM(v_profile.display_name), ''),
    'Player'
  );
  v_real_name := COALESCE(NULLIF(TRIM(v_profile.display_name), ''), v_username);
  v_contact := COALESCE(NULLIF(TRIM(v_profile.whatsapp_number), ''), NULL);

  -- Insert confirmed participant
  INSERT INTO public.participants (
    tournament_id,
    user_id,
    username,
    real_name,
    contact_info,
    status,
    terms_accepted,
    terms_accepted_at,
    rules_version,
    created_at,
    updated_at
  ) VALUES (
    v_reg.tournament_id,
    v_reg.user_id,
    v_username,
    v_real_name,
    v_contact,
    'active',
    true,
    now(),
    COALESCE(v_reg.rules_version, '1.0'),
    now(),
    now()
  ) RETURNING id INTO v_new_part_id;

  -- Update registration record
  UPDATE public.tournament_registrations
  SET status = 'approved',
      participant_id = v_new_part_id,
      verified_by = auth.uid(),
      verified_at = now(),
      approved_at = now(),
      confirmed_at = now(),
      verified_amount_paise = v_verified_amount,
      notes = COALESCE(p_note, notes),
      updated_at = now()
  WHERE id = p_registration_id;

  -- Update tournament confirmed slot count
  UPDATE public.tournaments
  SET confirmed_slots_count = v_current_participants + 1,
      updated_at = now()
  WHERE id = v_reg.tournament_id;

  -- Record audit log
  INSERT INTO public.admin_audit_logs (
    admin_id,
    target_user_id,
    action,
    entity_type,
    details,
    previous_values,
    new_values,
    reason,
    status,
    created_at
  ) VALUES (
    auth.uid(),
    v_reg.user_id,
    'APPROVE_PAYMENT_REGISTRATION',
    'tournament_registration',
    jsonb_build_object(
      'registration_id', p_registration_id,
      'tournament_id', v_reg.tournament_id,
      'participant_id', v_new_part_id,
      'verified_amount_paise', v_verified_amount,
      'note', p_note
    ),
    jsonb_build_object('status', v_reg.status),
    jsonb_build_object('status', 'approved', 'participant_id', v_new_part_id),
    COALESCE(p_note, 'Manual payment verified and registration approved by admin'),
    'success',
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'participant_id', v_new_part_id,
    'message', 'Registration approved and participant confirmed successfully.'
  );
END;
$function$;

-- RPC: Admin rejects manual registration
CREATE OR REPLACE FUNCTION public.admin_reject_manual_registration(
  p_registration_id uuid,
  p_rejection_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_reg RECORD;
  v_reason text;
BEGIN
  -- RBAC check
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Administrator privileges required';
  END IF;

  v_reason := TRIM(COALESCE(p_rejection_reason, ''));
  IF v_reason = '' THEN
    RAISE EXCEPTION 'A rejection reason is required';
  END IF;

  -- Lock registration row
  SELECT * INTO v_reg 
  FROM public.tournament_registrations 
  WHERE id = p_registration_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration request % not found', p_registration_id;
  END IF;

  IF v_reg.status IN ('approved', 'confirmed') THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Cannot reject an already approved registration.'
    );
  END IF;

  UPDATE public.tournament_registrations
  SET status = 'rejected',
      rejection_reason = v_reason,
      verified_by = auth.uid(),
      verified_at = now(),
      updated_at = now()
  WHERE id = p_registration_id;

  -- Record audit log
  INSERT INTO public.admin_audit_logs (
    admin_id,
    target_user_id,
    action,
    entity_type,
    details,
    previous_values,
    new_values,
    reason,
    status,
    created_at
  ) VALUES (
    auth.uid(),
    v_reg.user_id,
    'REJECT_PAYMENT_REGISTRATION',
    'tournament_registration',
    jsonb_build_object(
      'registration_id', p_registration_id,
      'tournament_id', v_reg.tournament_id,
      'rejection_reason', v_reason
    ),
    jsonb_build_object('status', v_reg.status),
    jsonb_build_object('status', 'rejected', 'rejection_reason', v_reason),
    v_reason,
    'success',
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Registration request rejected.'
  );
END;
$function$;

-- RPC: Admin marks registration under verification
CREATE OR REPLACE FUNCTION public.admin_set_under_verification(
  p_registration_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_reg RECORD;
BEGIN
  -- RBAC check
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Administrator privileges required';
  END IF;

  SELECT * INTO v_reg 
  FROM public.tournament_registrations 
  WHERE id = p_registration_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration request % not found', p_registration_id;
  END IF;

  IF v_reg.status IN ('approved', 'confirmed', 'rejected', 'cancelled') THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Cannot change status to under_verification for ' || v_reg.status || ' registration.'
    );
  END IF;

  UPDATE public.tournament_registrations
  SET status = 'under_verification',
      updated_at = now()
  WHERE id = p_registration_id;

  INSERT INTO public.admin_audit_logs (
    admin_id,
    target_user_id,
    action,
    entity_type,
    details,
    previous_values,
    new_values,
    reason,
    status,
    created_at
  ) VALUES (
    auth.uid(),
    v_reg.user_id,
    'UNDER_VERIFICATION_PAYMENT_REGISTRATION',
    'tournament_registration',
    jsonb_build_object(
      'registration_id', p_registration_id,
      'tournament_id', v_reg.tournament_id
    ),
    jsonb_build_object('status', v_reg.status),
    jsonb_build_object('status', 'under_verification'),
    'Admin started verification review',
    'success',
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Registration marked under verification.'
  );
END;
$function$;

-- RPC: User submits payment proof/reference
CREATE OR REPLACE FUNCTION public.submit_manual_payment(
  p_registration_id uuid,
  p_payment_reference text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_reg RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Sign in required';
  END IF;

  SELECT * INTO v_reg 
  FROM public.tournament_registrations 
  WHERE id = p_registration_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration request % not found', p_registration_id;
  END IF;

  IF v_reg.user_id != auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Cannot modify registration of another player';
  END IF;

  IF v_reg.status IN ('approved', 'confirmed') THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Registration is already approved.'
    );
  END IF;

  IF v_reg.status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Cannot submit payment for a cancelled registration.'
    );
  END IF;

  UPDATE public.tournament_registrations
  SET status = 'payment_submitted',
      payment_reference = COALESCE(NULLIF(TRIM(p_payment_reference), ''), payment_reference),
      notes = COALESCE(NULLIF(TRIM(p_notes), ''), notes),
      submitted_at = COALESCE(submitted_at, now()),
      updated_at = now()
  WHERE id = p_registration_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Payment proof submitted. Admin will verify shortly.'
  );
END;
$function$;

-- RPC: User or Admin cancels registration request
CREATE OR REPLACE FUNCTION public.cancel_manual_registration(
  p_registration_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_reg RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Sign in required';
  END IF;

  SELECT * INTO v_reg 
  FROM public.tournament_registrations 
  WHERE id = p_registration_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration request % not found', p_registration_id;
  END IF;

  IF v_reg.user_id != auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Cannot cancel registration of another player';
  END IF;

  IF v_reg.status IN ('approved', 'confirmed') THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Cannot cancel an approved registration directly. Contact admin.'
    );
  END IF;

  UPDATE public.tournament_registrations
  SET status = 'cancelled',
      updated_at = now()
  WHERE id = p_registration_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Registration request cancelled.'
  );
END;
$function$;

-- Grant execute permissions to authenticated
GRANT EXECUTE ON FUNCTION public.admin_approve_manual_registration(uuid, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_manual_registration(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_under_verification(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_manual_payment(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_manual_registration(uuid) TO authenticated;
