-- ============================================================================
-- Migration: 20261119050000_platform_synchronization_and_security.sql
-- Description: Comprehensive Platform Synchronization and Security Remediations:
--   1. SEC: Secure public.admin_resolve_one_vs_one_dispute with auth.uid() & RBAC.
--   2. FIN: Atomic Payout Settlement Procedure public.admin_finalize_payout_status
--           (Handles PAID, REJECTED, FAILED with proper locked/available balance sync,
--           idempotent ledgering, support ticket sync, and notifications).
--   3. TOURNAMENT: Restore confirmed_slots_count synchronization in
--                  public.admin_approve_manual_registration.
--   4. DATA REPAIR: Idempotent balance adjustment for historical payout PO-RDM-20261116-1CBC6.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Secure admin_resolve_one_vs_one_dispute
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_resolve_one_vs_one_dispute(
  p_dispute_id UUID,
  p_admin_id UUID DEFAULT NULL,
  p_winner_id UUID DEFAULT NULL,
  p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_admin_id UUID;
  v_dispute RECORD;
  v_match RECORD;
  v_settle_res JSONB;
BEGIN
  -- 1. Strictly derive admin identity via auth.uid()
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    IF p_admin_id IS NOT NULL AND (auth.role() = 'service_role' OR current_user = 'postgres') THEN
      v_admin_id := p_admin_id;
    ELSE
      RAISE EXCEPTION 'Unauthorized: Sign in required';
    END IF;
  END IF;

  -- 2. Verify admin identity in admin_users or via is_admin()
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE id = v_admin_id AND is_active = true AND role IN ('super_admin', 'admin', 'moderator')
  ) AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Administrator privileges required to resolve disputes.';
  END IF;

  -- 3. Lock dispute row
  SELECT * INTO v_dispute
  FROM public.one_vs_one_disputes
  WHERE id = p_dispute_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dispute not found.';
  END IF;

  IF v_dispute.status = 'resolved' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Dispute has already been resolved.');
  END IF;

  SELECT * INTO v_match
  FROM public.one_vs_one_matches
  WHERE id = v_dispute.match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Associated match not found.';
  END IF;

  -- 4. Update dispute status
  UPDATE public.one_vs_one_disputes
  SET status = 'resolved',
      admin_notes = p_admin_notes,
      resolved_by = v_admin_id,
      resolved_at = now(),
      updated_at = now()
  WHERE id = p_dispute_id;

  -- 5. Update result to verified with admin-awarded winner
  UPDATE public.one_vs_one_results
  SET status = 'verified',
      claimed_winner_id = p_winner_id,
      verified_by = v_admin_id,
      verified_at = now(),
      updated_at = now()
  WHERE match_id = v_dispute.match_id;

  -- 6. Update match status to completed
  UPDATE public.one_vs_one_matches
  SET status = 'completed',
      completed_at = now(),
      updated_at = now()
  WHERE id = v_dispute.match_id;

  -- 7. Release player active queue locks
  UPDATE public.one_vs_one_match_players
  SET is_active = false
  WHERE match_id = v_dispute.match_id;

  -- 8. Record Event
  INSERT INTO public.one_vs_one_events (
    match_id,
    actor_id,
    event_type,
    event_payload
  ) VALUES (
    v_dispute.match_id,
    v_admin_id,
    'dispute_resolved',
    jsonb_build_object(
      'resolved_by', v_admin_id,
      'winner_id', p_winner_id,
      'notes', p_admin_notes
    )
  );

  -- 9. Trigger automatic settlement for the verified winner
  v_settle_res := public.settle_one_vs_one_match(v_dispute.match_id, v_admin_id, FALSE);

  RETURN jsonb_build_object('success', true, 'settlement', v_settle_res);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_resolve_one_vs_one_dispute(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_one_vs_one_dispute(UUID, UUID, UUID, TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Atomic Payout Settlement Procedure: public.admin_finalize_payout_status
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_finalize_payout_status(
  p_payout_id UUID,
  p_new_status TEXT,
  p_utr_reference TEXT DEFAULT NULL,
  p_failure_reason TEXT DEFAULT NULL,
  p_receipt_url TEXT DEFAULT NULL,
  p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_admin_id UUID;
  v_payout RECORD;
  v_wallet RECORD;
  v_amount_paise BIGINT;
  v_amount_inr NUMERIC;
  v_player_id UUID;
  v_ticket_id UUID;
  v_date_str TEXT;
  v_tx_ref TEXT;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_deduct_locked BIGINT;
  v_tournament_name TEXT := 'Tournament';
BEGIN
  -- 1. Strictly derive admin identity via auth.uid()
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    IF auth.role() = 'service_role' OR current_user = 'postgres' THEN
      -- In service role / script context, select super_admin or default
      SELECT id INTO v_admin_id FROM public.admin_users WHERE is_active = true ORDER BY created_at ASC LIMIT 1;
    ELSE
      RAISE EXCEPTION 'Unauthorized: Sign in required';
    END IF;
  ELSE
    -- 2. Validate Financial Admin Permissions for authenticated callers
    IF NOT public.is_financial_admin() AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Unauthorized: Financial administrator privileges required';
    END IF;
  END IF;

  -- 3. Validate new status
  IF p_new_status NOT IN ('PAID', 'REJECTED', 'FAILED', 'PROCESSING', 'APPROVED') THEN
    RAISE EXCEPTION 'Invalid payout status: %', p_new_status;
  END IF;

  -- 4. Lock Payout Row
  SELECT * INTO v_payout
  FROM public.payout_transactions
  WHERE id = p_payout_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout transaction % not found', p_payout_id;
  END IF;

  -- Prevent duplicate finalization
  IF v_payout.payout_status = 'PAID' AND p_new_status = 'PAID' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Payout is already marked PAID.');
  END IF;

  IF v_payout.payout_status IN ('PAID', 'REJECTED', 'FAILED') AND p_new_status IN ('PAID', 'REJECTED', 'FAILED') AND v_payout.payout_status = p_new_status THEN
    RETURN jsonb_build_object('success', true, 'message', 'Payout is already in requested state.');
  END IF;

  v_player_id := v_payout.player_id;
  v_amount_paise := v_payout.amount_paise;
  v_amount_inr := v_payout.amount_inr;
  v_ticket_id := v_payout.ticket_id;

  -- Resolve tournament name if prize distribution
  IF v_payout.prize_distribution_id IS NOT NULL THEN
    SELECT t.name INTO v_tournament_name
    FROM public.prize_distributions pd
    JOIN public.tournaments t ON t.id = pd.tournament_id
    WHERE pd.id = v_payout.prize_distribution_id;
  ELSE
    v_tournament_name := 'Wallet Redemption';
  END IF;

  -- 5. Lock Player Wallet
  SELECT * INTO v_wallet
  FROM public.player_wallets
  WHERE user_id = v_player_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player wallet not found for user %', v_player_id;
  END IF;

  v_date_str := to_char(v_now, 'YYYYMMDD');

  -- 6. Execute State Transition
  IF p_new_status = 'PAID' THEN
    -- Payout successfully paid: release locked balance without restoring available
    v_deduct_locked := LEAST(v_wallet.locked_balance_paise, v_amount_paise);

    UPDATE public.player_wallets
    SET locked_balance_paise = GREATEST(0, locked_balance_paise - v_deduct_locked),
        updated_at = v_now
    WHERE user_id = v_player_id;

    -- Update payout transaction
    UPDATE public.payout_transactions
    SET payout_status = 'PAID',
        processed_by = v_admin_id,
        paid_at = v_now,
        utr_reference = COALESCE(p_utr_reference, utr_reference),
        receipt_url = COALESCE(p_receipt_url, receipt_url),
        updated_at = v_now
    WHERE id = p_payout_id;

    -- Insert wallet transaction (idempotent)
    v_tx_ref := 'TX-PAY-' || v_date_str || '-' || upper(substring(v_payout.id::text from 1 for 8));
    INSERT INTO public.wallet_transactions (
      transaction_ref,
      wallet_id,
      user_id,
      transaction_type,
      amount_paise,
      amount_inr,
      status,
      reference_type,
      reference_id,
      description,
      idempotency_key,
      created_at
    ) VALUES (
      v_tx_ref,
      v_wallet.id,
      v_player_id,
      'PAYOUT_COMPLETED',
      v_amount_paise,
      v_amount_inr,
      'completed',
      'payout',
      p_payout_id,
      'Payout Disbursed via ' || CASE WHEN v_payout.payment_method_type = 'upi' THEN 'Google Pay / UPI' ELSE 'Bank Transfer' END,
      'payout-paid-' || p_payout_id::text,
      v_now
    ) ON CONFLICT (idempotency_key) DO NOTHING;

    -- Synchronize associated support ticket
    UPDATE public.support_tickets
    SET status = 'resolved',
        resolution_notes = 'Payout disbursed successfully. UTR: ' || COALESCE(p_utr_reference, 'N/A'),
        resolved_by = v_admin_id,
        resolved_at = v_now,
        updated_at = v_now
    WHERE (id = v_ticket_id OR payout_transaction_id = p_payout_id)
      AND status <> 'resolved';

    -- Notify player
    INSERT INTO public.player_notifications (
      user_id,
      title,
      message,
      type,
      action_url,
      created_at
    ) VALUES (
      v_player_id,
      'Prize Payout Completed! 💸',
      'Your payout of ₹' || v_amount_inr::text || ' (' || v_tournament_name || ') has been successfully transferred via ' ||
        CASE WHEN v_payout.payment_method_type = 'upi' THEN 'Google Pay / UPI' ELSE 'Bank Transfer' END ||
        CASE WHEN p_utr_reference IS NOT NULL THEN ' (UTR: ' || p_utr_reference || ')' ELSE '' END || '.',
      'financial',
      '/dashboard/wallet',
      v_now
    );

  ELSIF p_new_status IN ('REJECTED', 'FAILED') THEN
    IF p_failure_reason IS NULL OR trim(p_failure_reason) = '' THEN
      RAISE EXCEPTION 'A mandatory explanation reason is required when rejecting or failing a payout.';
    END IF;

    -- Return locked funds back to available balance
    v_deduct_locked := LEAST(v_wallet.locked_balance_paise, v_amount_paise);

    UPDATE public.player_wallets
    SET locked_balance_paise = GREATEST(0, locked_balance_paise - v_deduct_locked),
        available_balance_paise = available_balance_paise + v_amount_paise,
        updated_at = v_now
    WHERE user_id = v_player_id;

    -- Update payout transaction
    UPDATE public.payout_transactions
    SET payout_status = p_new_status,
        failure_reason = p_failure_reason,
        processed_by = v_admin_id,
        updated_at = v_now
    WHERE id = p_payout_id;

    -- Insert wallet transaction record for the refund
    v_tx_ref := 'TX-RDM-REFUND-' || v_date_str || '-' || upper(substring(v_payout.id::text from 1 for 8));
    INSERT INTO public.wallet_transactions (
      transaction_ref,
      wallet_id,
      user_id,
      transaction_type,
      amount_paise,
      amount_inr,
      status,
      reference_type,
      reference_id,
      description,
      idempotency_key,
      created_at
    ) VALUES (
      v_tx_ref,
      v_wallet.id,
      v_player_id,
      'ONE_VS_ONE_ENTRY_REFUND', -- Uses refund type
      v_amount_paise,
      v_amount_inr,
      'completed',
      'payout',
      p_payout_id,
      'Payout Request ' || p_new_status || ': Funds returned to available balance',
      'payout-refund-' || p_payout_id::text,
      v_now
    ) ON CONFLICT (idempotency_key) DO NOTHING;

    -- Synchronize associated support ticket
    UPDATE public.support_tickets
    SET status = 'rejected',
        rejection_reason = p_failure_reason,
        resolved_by = v_admin_id,
        resolved_at = v_now,
        updated_at = v_now
    WHERE (id = v_ticket_id OR payout_transaction_id = p_payout_id)
      AND status <> 'rejected';

    -- Notify player
    INSERT INTO public.player_notifications (
      user_id,
      title,
      message,
      type,
      action_url,
      created_at
    ) VALUES (
      v_player_id,
      'Payout Request ' || CASE WHEN p_new_status = 'REJECTED' THEN 'Rejected' ELSE 'Failed' END,
      'Your payout transfer (' || v_payout.payout_reference || ') could not be completed. Reason: ' || p_failure_reason || '. Your balance of ₹' || v_amount_inr::text || ' has been fully restored to your available wallet balance.',
      'financial',
      '/dashboard/wallet',
      v_now
    );

  ELSIF p_new_status = 'PROCESSING' THEN
    UPDATE public.payout_transactions
    SET payout_status = 'PROCESSING',
        processed_by = v_admin_id,
        updated_at = v_now
    WHERE id = p_payout_id;

    INSERT INTO public.player_notifications (
      user_id,
      title,
      message,
      type,
      action_url,
      created_at
    ) VALUES (
      v_player_id,
      'Payout Processing Initiated',
      'Your payout of ₹' || v_amount_inr::text || ' is currently being disbursed by our finance team.',
      'financial',
      '/dashboard/wallet',
      v_now
    );

  ELSIF p_new_status = 'APPROVED' THEN
    UPDATE public.payout_transactions
    SET payout_status = 'APPROVED',
        processed_by = v_admin_id,
        updated_at = v_now
    WHERE id = p_payout_id;
  END IF;

  -- 7. Record immutable financial audit log
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
    v_admin_id,
    'UPDATE_PAYOUT_STATUS_' || p_new_status,
    'payout_transactions',
    p_payout_id::text,
    jsonb_build_object('status', v_payout.payout_status),
    jsonb_build_object('status', p_new_status, 'utr', p_utr_reference),
    jsonb_build_object(
      'payout_reference', v_payout.payout_reference,
      'utr_reference', p_utr_reference,
      'failure_reason', p_failure_reason,
      'admin_notes', p_admin_notes
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Payout status successfully updated to ' || p_new_status,
    'payout_id', p_payout_id,
    'new_status', p_new_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_finalize_payout_status FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_finalize_payout_status TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. Restore confirmed_slots_count synchronization in admin_approve_manual_registration
-- ----------------------------------------------------------------------------
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
  v_admin_id uuid;
BEGIN
  -- RBAC check
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Administrator privileges required';
  END IF;

  v_admin_id := auth.uid();

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
        verified_by = v_admin_id,
        verified_at = now(),
        approved_at = now(),
        confirmed_at = now(),
        verified_amount_paise = v_verified_amount,
        notes = COALESCE(p_note, notes),
        updated_at = now()
    WHERE id = p_registration_id;

    -- Synchronize confirmed slot count
    UPDATE public.tournaments
    SET confirmed_slots_count = (SELECT count(*) FROM public.participants WHERE tournament_id = v_reg.tournament_id),
        updated_at = now()
    WHERE id = v_reg.tournament_id;

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

  -- Prefer player's real name / display name for tournament rosters
  v_username := COALESCE(
    NULLIF(TRIM(v_profile.display_name), ''),
    NULLIF(TRIM(v_profile.efootball_id), ''),
    'Player'
  );
  v_real_name := v_username;
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

  -- Update registration to approved
  UPDATE public.tournament_registrations
  SET status = 'approved',
      participant_id = v_new_part_id,
      verified_by = v_admin_id,
      verified_at = now(),
      approved_at = now(),
      confirmed_at = now(),
      verified_amount_paise = v_verified_amount,
      notes = COALESCE(p_note, notes),
      updated_at = now()
  WHERE id = p_registration_id;

  -- Atomically synchronize confirmed slot count
  UPDATE public.tournaments
  SET confirmed_slots_count = (SELECT count(*) FROM public.participants WHERE tournament_id = v_reg.tournament_id),
      updated_at = now()
  WHERE id = v_reg.tournament_id;

  -- Insert into player_notifications
  INSERT INTO public.player_notifications (
    user_id,
    title,
    message,
    type,
    action_url,
    created_at
  ) VALUES (
    v_reg.user_id,
    'Tournament Registration Confirmed! 🏆',
    'Your registration for "' || v_tournament.name || '" has been approved by admin. You are now officially enrolled in the tournament.',
    'tournament',
    '/tournaments/' || v_tournament.id,
    now()
  );

  RETURN jsonb_build_object(
    'success', true, 
    'participant_id', v_new_part_id, 
    'message', 'Registration approved and participant confirmed successfully.'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_approve_manual_registration(uuid, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_manual_registration(uuid, bigint, text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. Reject Manual Registration: Add notification and audit
-- ----------------------------------------------------------------------------
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
  v_tournament RECORD;
  v_admin_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Administrator privileges required';
  END IF;

  v_admin_id := auth.uid();

  SELECT * INTO v_reg 
  FROM public.tournament_registrations 
  WHERE id = p_registration_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration request % not found', p_registration_id;
  END IF;

  IF v_reg.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Registration is already cancelled.');
  END IF;

  IF v_reg.status = 'rejected' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Registration is already rejected.');
  END IF;

  SELECT name INTO v_tournament
  FROM public.tournaments
  WHERE id = v_reg.tournament_id;

  UPDATE public.tournament_registrations
  SET status = 'rejected',
      rejection_reason = p_rejection_reason,
      verified_by = v_admin_id,
      verified_at = now(),
      updated_at = now()
  WHERE id = p_registration_id;

  -- Notify player
  INSERT INTO public.player_notifications (
    user_id,
    title,
    message,
    type,
    action_url,
    created_at
  ) VALUES (
    v_reg.user_id,
    'Registration Request Rejected',
    'Your registration for "' || COALESCE(v_tournament.name, 'Tournament') || '" could not be approved. Reason: ' || p_rejection_reason,
    'tournament',
    '/dashboard/tournaments',
    now()
  );

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Registration request rejected.'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_reject_manual_registration(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_manual_registration(uuid, text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. Data Repair: Historical Payout PO-RDM-20261116-1CBC6 (Idempotent)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_target_user_id UUID := '0dec658a-7a17-4f24-8c63-9b734737fc4a';
  v_payout_id UUID := 'b2b3912d-5015-450d-a87e-7da1f58197ee';
  v_ticket_id UUID := 'a6bcd07a-96e8-499e-86c8-37b329d43807';
  v_wallet RECORD;
BEGIN
  -- Verify payout is indeed PAID
  IF EXISTS (
    SELECT 1 FROM public.payout_transactions
    WHERE id = v_payout_id AND payout_status = 'PAID'
  ) THEN
    SELECT * INTO v_wallet
    FROM public.player_wallets
    WHERE user_id = v_target_user_id;

    -- Only deduct if locked balance still reflects the 5500 paise
    IF v_wallet.locked_balance_paise >= 5500 THEN
      UPDATE public.player_wallets
      SET locked_balance_paise = GREATEST(0, locked_balance_paise - 5500),
          updated_at = now()
      WHERE user_id = v_target_user_id;
    END IF;

    -- Mark the redemption ticket resolved
    UPDATE public.support_tickets
    SET status = 'resolved',
        resolution_notes = 'Payout disbursed. UTR: 54542154464 (historical reconciliation)',
        resolved_at = COALESCE(resolved_at, now()),
        updated_at = now()
    WHERE id = v_ticket_id AND status <> 'resolved';
  END IF;
END;
$$;
