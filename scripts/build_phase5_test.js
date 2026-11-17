const fs = require('fs');
const path = require('path');

const migrationPath = path.resolve('supabase/migrations/20261118030000_advanced_upi_rotation_engine.sql');
const migrationSql = fs.readFileSync(migrationPath, 'utf8');

const testScenariosSql = `
DO $phase5_tests$
DECLARE
  c_super_admin CONSTANT uuid := '30080df7-5188-4630-b597-b8493ebe045d';
  c_finance_admin CONSTANT uuid := '367ac76c-7733-4ff3-b714-b50d637dc69e';
  c_test_player CONSTANT uuid := '78962ed9-ff97-4701-943f-065462f1762a';
  c_unauthorized_user CONSTANT uuid := '00000000-0000-0000-0000-000000000099';

  v_acc_1 uuid;
  v_acc_2 uuid;
  v_acc_3 uuid;
  v_acc_4 uuid;
  v_wallet_id uuid;
  v_deposit_id uuid;
  v_legacy_deposit_id uuid;
  v_res jsonb;
  v_row_count integer;
  v_active boolean;
  v_i integer;
  v_utr text;
  v_caught boolean;
  v_prev_bal bigint;
BEGIN
  -- 0. Ensure player wallet exists
  SELECT id, available_balance_paise INTO v_wallet_id, v_prev_bal 
  FROM public.player_wallets 
  WHERE user_id = c_test_player;

  IF v_wallet_id IS NULL THEN
    INSERT INTO public.player_wallets (user_id, available_balance_paise, status)
    VALUES (c_test_player, 0, 'active')
    RETURNING id, available_balance_paise INTO v_wallet_id, v_prev_bal;
  END IF;

  -- Deactivate any initial accounts seeded from site_settings before starting queue test
  UPDATE public.upi_accounts SET is_active = false WHERE is_active = true;

  -- -------------------------------------------------------------------------
  -- TEST 1: Multiple UPI Accounts & Single-Active Enforcement
  -- -------------------------------------------------------------------------
  INSERT INTO public.upi_accounts (
    upi_id, account_holder_name, max_successful_transactions, is_active, is_enabled, queue_order, notes
  ) VALUES (
    'acc1@icici', 'Merchant Desk 1', 18, true, true, 1, 'Test Account 1'
  ) RETURNING id INTO v_acc_1;

  INSERT INTO public.upi_accounts (
    upi_id, account_holder_name, max_successful_transactions, is_active, is_enabled, queue_order, notes
  ) VALUES (
    'acc2@hdfc', 'Merchant Desk 2', 18, false, true, 2, 'Test Account 2'
  ) RETURNING id INTO v_acc_2;

  INSERT INTO public.upi_accounts (
    upi_id, account_holder_name, max_successful_transactions, is_active, is_enabled, queue_order, notes
  ) VALUES (
    'acc3@sbi', 'Merchant Desk 3 (Disabled)', 18, false, false, 3, 'Test Account 3'
  ) RETURNING id INTO v_acc_3;

  v_caught := false;
  BEGIN
    INSERT INTO public.upi_accounts (
      upi_id, account_holder_name, max_successful_transactions, is_active, is_enabled, queue_order
    ) VALUES (
      'conflict@upi', 'Conflict Desk', 18, true, true, 99
    );
  EXCEPTION WHEN unique_violation THEN
    v_caught := true;
  END;

  IF NOT v_caught THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Single-active constraint did not reject second active account!';
  END IF;

  -- -------------------------------------------------------------------------
  -- TEST 2: Sanitized Public Endpoint & Deposit Assignment
  -- -------------------------------------------------------------------------
  v_res := public.get_active_upi_account();
  IF (v_res->>'has_active_account')::boolean != true OR (v_res->'account'->>'upi_id') != 'acc1@icici' THEN
    RAISE EXCEPTION 'TEST 2 FAILED: get_active_upi_account returned unexpected result: %', v_res;
  END IF;
  IF v_res->'account' ? 'verified_transactions_count' OR v_res->'account' ? 'notes' THEN
    RAISE EXCEPTION 'TEST 2 FAILED: get_active_upi_account leaked internal administrative fields!';
  END IF;

  -- Set player context for assignment
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', c_test_player::text, true);

  v_res := public.assign_upi_to_wallet_deposit(
    c_test_player, v_wallet_id, 100, 'TEST-UTR-001', 'proofs/test1.png', 'Player note', NULL
  );
  IF (v_res->>'success')::boolean != true THEN
    RAISE EXCEPTION 'TEST 2 FAILED: assign_upi_to_wallet_deposit error: %', v_res;
  END IF;
  v_deposit_id := (v_res->>'deposit_id')::uuid;

  -- -------------------------------------------------------------------------
  -- TEST 3: Actor Identity Security (Anon & Non-Admin Spoofing Prevention)
  -- -------------------------------------------------------------------------
  -- 3a. Simulate anon role: p_admin_id must NEVER be accepted
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claim.role', 'anon', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);

  v_res := public.admin_approve_wallet_deposit(v_deposit_id, c_super_admin, 'Spoofed anon attempt');
  IF (v_res->>'success')::boolean != false OR NOT (v_res->>'error' LIKE '%Authentication required%') THEN
    RAISE EXCEPTION 'TEST 3a FAILED: Anon caller was able to supply p_admin_id: %', v_res;
  END IF;

  v_res := public.admin_rotate_upi_account(v_acc_2, c_super_admin, 'Spoofed anon rotate');
  IF (v_res->>'success')::boolean != false OR NOT (v_res->>'error' LIKE '%Authentication required%') THEN
    RAISE EXCEPTION 'TEST 3a FAILED: Anon caller rotated account: %', v_res;
  END IF;

  v_res := public.admin_release_rejected_deposit_utr(v_deposit_id, c_super_admin, 'Spoofed anon release');
  IF (v_res->>'success')::boolean != false OR NOT (v_res->>'error' LIKE '%Authentication required%') THEN
    RAISE EXCEPTION 'TEST 3a FAILED: Anon caller released UTR: %', v_res;
  END IF;

  -- 3b. Simulate authenticated player session: p_admin_id must be IGNORED and auth.uid() enforced
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', c_test_player::text, true);

  v_res := public.admin_approve_wallet_deposit(v_deposit_id, c_super_admin, 'Spoofed player attempt');
  IF (v_res->>'success')::boolean != false OR NOT (v_res->>'error' LIKE '%Requires active financial administrator%') THEN
    RAISE EXCEPTION 'TEST 3b FAILED: Authenticated player was able to spoof p_admin_id: %', v_res;
  END IF;

  v_res := public.admin_rotate_upi_account(v_acc_2, c_super_admin, 'Spoofed player rotate');
  IF (v_res->>'success')::boolean != false OR NOT (v_res->>'error' LIKE '%Requires active financial administrator%') THEN
    RAISE EXCEPTION 'TEST 3b FAILED: Authenticated player was able to rotate with spoofed p_admin_id: %', v_res;
  END IF;

  -- 3c. Simulate service_role: p_admin_id is accepted only if valid active financial admin
  PERFORM set_config('role', 'service_role', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);

  -- Null p_admin_id under service_role must fail
  v_res := public.admin_approve_wallet_deposit(v_deposit_id, NULL, 'Service role with null admin');
  IF (v_res->>'success')::boolean != false OR NOT (v_res->>'error' LIKE '%Administrator identity required%') THEN
    RAISE EXCEPTION 'TEST 3c FAILED: Service role with null p_admin_id allowed: %', v_res;
  END IF;

  -- Non-admin p_admin_id under service_role must fail
  v_res := public.admin_approve_wallet_deposit(v_deposit_id, c_unauthorized_user, 'Service role with non-admin');
  IF (v_res->>'success')::boolean != false OR NOT (v_res->>'error' LIKE '%Requires active financial administrator%') THEN
    RAISE EXCEPTION 'TEST 3c FAILED: Service role with non-admin p_admin_id allowed: %', v_res;
  END IF;

  -- Valid finance_admin under service_role must succeed
  v_res := public.admin_approve_wallet_deposit(v_deposit_id, c_finance_admin, 'Legitimate service approval');
  IF (v_res->>'success')::boolean != true THEN
    RAISE EXCEPTION 'TEST 3c FAILED: Valid finance admin under service role rejected: %', v_res;
  END IF;

  -- -------------------------------------------------------------------------
  -- TEST 4: Approving Payments 2..17 Without Rotation
  -- -------------------------------------------------------------------------
  FOR v_i IN 2..17 LOOP
    v_utr := 'TEST-UTR-AUTO-' || lpad(v_i::text, 4, '0');
    v_res := public.assign_upi_to_wallet_deposit(
      c_test_player, v_wallet_id, 10, v_utr, 'proofs/test.png', NULL, NULL
    );
    v_deposit_id := (v_res->>'deposit_id')::uuid;

    v_res := public.admin_approve_wallet_deposit(v_deposit_id, c_finance_admin, 'Approved ' || v_i);
    IF (v_res->>'success')::boolean != true OR (v_res->>'rotation_triggered')::boolean != false THEN
      RAISE EXCEPTION 'TEST 4 FAILED on approval %: %', v_i, v_res;
    END IF;
  END LOOP;

  SELECT verified_transactions_count, is_active INTO v_row_count, v_active 
  FROM public.upi_accounts WHERE id = v_acc_1;
  IF v_row_count != 17 OR v_active != true THEN
    RAISE EXCEPTION 'TEST 4 FAILED: Acc 1 count (%) or active status (%) mismatch', v_row_count, v_active;
  END IF;

  -- -------------------------------------------------------------------------
  -- TEST 5: 18th Payment Triggers Automatic Rotation
  -- -------------------------------------------------------------------------
  v_utr := 'TEST-UTR-AUTO-0018';
  v_res := public.assign_upi_to_wallet_deposit(
    c_test_player, v_wallet_id, 10, v_utr, 'proofs/test.png', NULL, NULL
  );
  v_deposit_id := (v_res->>'deposit_id')::uuid;

  v_res := public.admin_approve_wallet_deposit(v_deposit_id, c_finance_admin, 'Approved 18');
  IF (v_res->>'success')::boolean != true OR (v_res->>'rotation_triggered')::boolean != true THEN
    RAISE EXCEPTION 'TEST 5 FAILED: 18th payment did not rotate: %', v_res;
  END IF;

  IF (SELECT is_active FROM public.upi_accounts WHERE id = v_acc_1) != false THEN
    RAISE EXCEPTION 'TEST 5 FAILED: Acc 1 not deactivated!';
  END IF;
  IF (SELECT is_active FROM public.upi_accounts WHERE id = v_acc_2) != true THEN
    RAISE EXCEPTION 'TEST 5 FAILED: Acc 2 not activated!';
  END IF;
  IF (SELECT verified_transactions_count FROM public.upi_accounts WHERE id = v_acc_2) != 0 THEN
    RAISE EXCEPTION 'TEST 5 FAILED: Acc 2 counter not 0!';
  END IF;

  -- -------------------------------------------------------------------------
  -- TEST 6: Skipping Disabled Accounts in Sequence
  -- -------------------------------------------------------------------------
  INSERT INTO public.upi_accounts (
    upi_id, account_holder_name, max_successful_transactions, is_active, is_enabled, queue_order
  ) VALUES (
    'acc4@axis', 'Merchant Desk 4', 18, false, true, 4
  ) RETURNING id INTO v_acc_4;

  UPDATE public.upi_accounts SET max_successful_transactions = 1 WHERE id = v_acc_2;

  v_utr := 'TEST-UTR-SKIP-DISABLED';
  v_res := public.assign_upi_to_wallet_deposit(
    c_test_player, v_wallet_id, 10, v_utr, 'proofs/test.png', NULL, NULL
  );
  v_deposit_id := (v_res->>'deposit_id')::uuid;

  v_res := public.admin_approve_wallet_deposit(v_deposit_id, c_finance_admin, 'Approved limit on acc 2');
  IF (v_res->>'rotation_triggered')::boolean != true THEN
    RAISE EXCEPTION 'TEST 6 FAILED: Rotation not triggered on Account 2 limit!';
  END IF;

  IF (SELECT is_active FROM public.upi_accounts WHERE id = v_acc_3) = true THEN
    RAISE EXCEPTION 'TEST 6 FAILED: Disabled Account 3 was activated!';
  END IF;
  IF (SELECT is_active FROM public.upi_accounts WHERE id = v_acc_4) != true THEN
    RAISE EXCEPTION 'TEST 6 FAILED: Enabled Account 4 was not activated!';
  END IF;

  -- -------------------------------------------------------------------------
  -- TEST 7: Legacy Pending Deposit (upi_account_id IS NULL) Compatibility
  -- -------------------------------------------------------------------------
  INSERT INTO public.wallet_deposits (
    deposit_reference, user_id, wallet_id, amount_paise, amount_inr, status, payment_method,
    utr_reference, proof_image_path, upi_account_id, created_at, updated_at
  ) VALUES (
    'DEP-LEGACY-001', c_test_player, v_wallet_id, 5000, 50, 'under_review', 'upi_qr',
    'LEGACY-UTR-999', 'proofs/legacy.png', NULL, now(), now()
  ) RETURNING id INTO v_legacy_deposit_id;

  v_res := public.admin_approve_wallet_deposit(v_legacy_deposit_id, c_finance_admin, 'Approved legacy deposit');
  IF (v_res->>'success')::boolean != true OR (v_res->>'rotation_triggered')::boolean != false THEN
    RAISE EXCEPTION 'TEST 7 FAILED: Legacy deposit approval failed: %', v_res;
  END IF;

  IF (SELECT status FROM public.wallet_deposits WHERE id = v_legacy_deposit_id) != 'approved' THEN
    RAISE EXCEPTION 'TEST 7 FAILED: Legacy deposit status not approved!';
  END IF;

  -- -------------------------------------------------------------------------
  -- TEST 8: Manual Rotation with Deadlock-Free Locking Order & Authenticated Admin
  -- -------------------------------------------------------------------------
  -- Set authenticated finance admin session (p_admin_id ignored, auth.uid() derived)
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', c_finance_admin::text, true);

  v_res := public.admin_rotate_upi_account(v_acc_1, NULL, 'Manual switch to Account 1');
  IF (v_res->>'success')::boolean != true THEN
    RAISE EXCEPTION 'TEST 8 FAILED: admin_rotate_upi_account error: %', v_res;
  END IF;

  IF (SELECT is_active FROM public.upi_accounts WHERE id = v_acc_1) != true THEN
    RAISE EXCEPTION 'TEST 8 FAILED: Account 1 was not activated!';
  END IF;
  IF (SELECT is_active FROM public.upi_accounts WHERE id = v_acc_4) != false THEN
    RAISE EXCEPTION 'TEST 8 FAILED: Account 4 was not deactivated!';
  END IF;

  -- -------------------------------------------------------------------------
  -- TEST 9: Duplicate UTR & Controlled Admin UTR Release
  -- -------------------------------------------------------------------------
  v_res := public.assign_upi_to_wallet_deposit(
    c_test_player, v_wallet_id, 10, 'LEGACY-UTR-999', 'proofs/dup.png', NULL, NULL
  );
  IF (v_res->>'success')::boolean != false OR NOT (v_res->>'error' LIKE '%already been registered%') THEN
    RAISE EXCEPTION 'TEST 9 FAILED: Duplicate UTR submission was allowed: %', v_res;
  END IF;

  -- -------------------------------------------------------------------------
  -- TEST 10: Audit Log Truncate Protection (Statement-Level Trigger)
  -- -------------------------------------------------------------------------
  v_caught := false;
  BEGIN
    EXECUTE 'TRUNCATE TABLE public.upi_rotation_events';
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;

  IF NOT v_caught THEN
    RAISE EXCEPTION 'TEST 10 FAILED: TRUNCATE on upi_rotation_events was not blocked!';
  END IF;

  v_caught := false;
  BEGIN
    EXECUTE 'TRUNCATE TABLE public.upi_payment_audit_logs';
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;

  IF NOT v_caught THEN
    RAISE EXCEPTION 'TEST 10 FAILED: TRUNCATE on upi_payment_audit_logs was not blocked!';
  END IF;

  -- -------------------------------------------------------------------------
  -- TEST 11: Queue Exhaustion Pausing (Fallback when all accounts exhausted)
  -- -------------------------------------------------------------------------
  PERFORM set_config('role', 'service_role', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);

  UPDATE public.upi_accounts SET is_enabled = false WHERE id != v_acc_1;
  UPDATE public.upi_accounts SET verified_transactions_count = 0, max_successful_transactions = 1 WHERE id = v_acc_1;

  v_utr := 'TEST-UTR-QUEUE-EXHAUST';
  v_res := public.assign_upi_to_wallet_deposit(
    c_test_player, v_wallet_id, 10, v_utr, 'proofs/test.png', NULL, NULL
  );
  v_deposit_id := (v_res->>'deposit_id')::uuid;

  v_res := public.admin_approve_wallet_deposit(v_deposit_id, c_finance_admin, 'Exhausting queue');
  IF (v_res->>'rotation_triggered')::boolean != true THEN
    RAISE EXCEPTION 'TEST 11 FAILED: Rotation flag not set on exhaustion: %', v_res;
  END IF;

  IF (SELECT count(*) FROM public.upi_accounts WHERE is_active = true) != 0 THEN
    RAISE EXCEPTION 'TEST 11 FAILED: Queue was not paused on exhaustion!';
  END IF;

  v_res := public.get_active_upi_account();
  IF (v_res->>'has_active_account')::boolean != false THEN
    RAISE EXCEPTION 'TEST 11 FAILED: get_active_upi_account did not report paused: %', v_res;
  END IF;

END $phase5_tests$;
`;

const fullTransactionalQuery = 'BEGIN;\n' +
migrationSql + '\n' +
testScenariosSql + '\n' +
"SELECT 'ALL_PHASE5_SECURITY_TESTS_PASSED_SUCCESSFULLY' AS result;\n" +
'ROLLBACK;\n';

fs.writeFileSync('scripts/run_phase5_transactional_test.sql', fullTransactionalQuery);
console.log('Generated scripts/run_phase5_transactional_test.sql, length:', fullTransactionalQuery.length);
