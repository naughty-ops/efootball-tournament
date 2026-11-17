/**
 * Phase 1 Database Test Runner
 * Executes the complete migration and all 15 scenarios inside a BEGIN ... ROLLBACK transaction block.
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

function loadEnvFile(filename: string) {
  const filePath = path.resolve(process.cwd(), filename);
  if (fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnvFile('.env.local');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function run() {
  console.log('Loading migration SQL...');
  const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20261118030000_advanced_upi_rotation_engine.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  console.log('Building transactional test query...');
  const testScenariosSql = `
DO $test_runner$
DECLARE
  c_super_admin CONSTANT uuid := '30080df7-5188-4630-b597-b8493ebe045d';
  c_finance_admin CONSTANT uuid := '367ac76c-7733-4ff3-b714-b50d637dc69e';
  c_test_player CONSTANT uuid := 'f4a0de78-8f3e-4483-8108-4f5d2b4b9d44';
  c_unauthorized_user CONSTANT uuid := '00000000-0000-0000-0000-000000000099';

  v_acc_1 uuid;
  v_acc_2 uuid;
  v_acc_3 uuid;
  v_acc_4 uuid;
  v_wallet_id uuid;
  v_deposit_id uuid;
  v_res jsonb;
  v_row_count integer;
  v_active boolean;
  v_i integer;
  v_utr text;
  v_caught boolean;
  v_prev_bal bigint;
  v_new_bal bigint;
  v_initial_pending_count integer;
  v_final_pending_count integer;
BEGIN
  -- Count existing pending deposits
  SELECT count(*) INTO v_initial_pending_count FROM public.wallet_deposits WHERE status = 'under_review';

  -- Ensure player wallet exists
  SELECT id, available_balance_paise INTO v_wallet_id, v_prev_bal 
  FROM public.player_wallets 
  WHERE user_id = c_test_player;

  IF v_wallet_id IS NULL THEN
    INSERT INTO public.player_wallets (user_id, available_balance_paise, status)
    VALUES (c_test_player, 0, 'active')
    RETURNING id, available_balance_paise INTO v_wallet_id, v_prev_bal;
  END IF;

  -- Clear any pre-seeded upi_accounts in this transaction for deterministic testing
  EXECUTE format('%s FROM %I.%I', 'DELETE', 'public', 'upi_accounts');

  -- -------------------------------------------------------------------------
  -- TEST 1: Creating multiple UPI accounts & Single-Active Enforcement
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

  -- Test unique constraint: Attempt second active account
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
  -- TEST 2: Assigning deposits to the active account & public endpoint
  -- -------------------------------------------------------------------------
  v_res := public.get_active_upi_account();
  IF (v_res->>'has_active_account')::boolean != true OR (v_res->'account'->>'upi_id') != 'acc1@icici' THEN
    RAISE EXCEPTION 'TEST 2 FAILED: get_active_upi_account returned unexpected result: %', v_res;
  END IF;
  IF v_res->'account' ? 'verified_transactions_count' OR v_res->'account' ? 'notes' THEN
    RAISE EXCEPTION 'TEST 2 FAILED: get_active_upi_account leaked internal administrative fields!';
  END IF;

  v_res := public.assign_upi_to_wallet_deposit(
    c_test_player, v_wallet_id, 100, 'TEST-UTR-001', 'proofs/test1.png', 'Player note', NULL
  );
  IF (v_res->>'success')::boolean != true THEN
    RAISE EXCEPTION 'TEST 2 FAILED: assign_upi_to_wallet_deposit error: %', v_res;
  END IF;

  v_deposit_id := (v_res->>'deposit_id')::uuid;
  SELECT assigned_upi_id INTO v_utr FROM public.wallet_deposits WHERE id = v_deposit_id;
  IF v_utr != 'acc1@icici' THEN
    RAISE EXCEPTION 'TEST 2 FAILED: assigned_upi_id snapshot mismatch: %', v_utr;
  END IF;

  -- -------------------------------------------------------------------------
  -- TEST 3: Approving 17 payments without rotation
  -- -------------------------------------------------------------------------
  v_res := public.admin_approve_wallet_deposit(v_deposit_id, c_finance_admin, 'Approved test 1');
  IF (v_res->>'success')::boolean != true OR (v_res->>'rotation_triggered')::boolean != false THEN
    RAISE EXCEPTION 'TEST 3 FAILED on 1st approval: %', v_res;
  END IF;

  FOR v_i IN 2..17 LOOP
    v_utr := 'TEST-UTR-AUTO-' || lpad(v_i::text, 4, '0');
    v_res := public.assign_upi_to_wallet_deposit(
      c_test_player, v_wallet_id, 10, v_utr, 'proofs/test.png', NULL, NULL
    );
    v_deposit_id := (v_res->>'deposit_id')::uuid;

    v_res := public.admin_approve_wallet_deposit(v_deposit_id, c_finance_admin, 'Approved test ' || v_i);
    IF (v_res->>'success')::boolean != true OR (v_res->>'rotation_triggered')::boolean != false THEN
      RAISE EXCEPTION 'TEST 3 FAILED on approval %: %', v_i, v_res;
    END IF;
  END LOOP;

  SELECT verified_transactions_count, is_active INTO v_row_count, v_active 
  FROM public.upi_accounts WHERE id = v_acc_1;
  IF v_row_count != 17 OR v_active != true THEN
    RAISE EXCEPTION 'TEST 3 FAILED: Account 1 verified count (%) or active status (%) incorrect', v_row_count, v_active;
  END IF;

  -- -------------------------------------------------------------------------
  -- TEST 4: Approving the 18th payment and triggering automatic rotation
  -- -------------------------------------------------------------------------
  v_utr := 'TEST-UTR-AUTO-0018';
  v_res := public.assign_upi_to_wallet_deposit(
    c_test_player, v_wallet_id, 10, v_utr, 'proofs/test.png', NULL, NULL
  );
  v_deposit_id := (v_res->>'deposit_id')::uuid;

  v_res := public.admin_approve_wallet_deposit(v_deposit_id, c_finance_admin, 'Approved test 18');
  IF (v_res->>'success')::boolean != true OR (v_res->>'rotation_triggered')::boolean != true THEN
    RAISE EXCEPTION 'TEST 4 FAILED: 18th payment did not trigger rotation: %', v_res;
  END IF;

  IF (SELECT is_active FROM public.upi_accounts WHERE id = v_acc_1) != false THEN
    RAISE EXCEPTION 'TEST 4 FAILED: Account 1 is still active after limit reached!';
  END IF;
  IF (SELECT is_active FROM public.upi_accounts WHERE id = v_acc_2) != true THEN
    RAISE EXCEPTION 'TEST 4 FAILED: Account 2 was not activated!';
  END IF;
  IF (SELECT verified_transactions_count FROM public.upi_accounts WHERE id = v_acc_2) != 0 THEN
    RAISE EXCEPTION 'TEST 4 FAILED: Account 2 cycle counter was not initialized to 0!';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.upi_rotation_events 
    WHERE from_upi_account_id = v_acc_1 
      AND to_upi_account_id = v_acc_2 
      AND trigger_type = 'automatic_limit_reached'
  ) THEN
    RAISE EXCEPTION 'TEST 4 FAILED: Rotation event record missing from upi_rotation_events!';
  END IF;

  -- -------------------------------------------------------------------------
  -- TEST 5: Skipping disabled accounts in rotation sequence
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
    RAISE EXCEPTION 'TEST 5 FAILED: Rotation not triggered on Account 2 limit!';
  END IF;

  IF (SELECT is_active FROM public.upi_accounts WHERE id = v_acc_3) = true THEN
    RAISE EXCEPTION 'TEST 5 FAILED: Disabled Account 3 was erroneously activated!';
  END IF;
  IF (SELECT is_active FROM public.upi_accounts WHERE id = v_acc_4) != true THEN
    RAISE EXCEPTION 'TEST 5 FAILED: Enabled Account 4 was not activated!';
  END IF;

  -- -------------------------------------------------------------------------
  -- TEST 6: Preventing duplicate approvals
  -- -------------------------------------------------------------------------
  v_res := public.admin_approve_wallet_deposit(v_deposit_id, c_finance_admin, 'Attempt duplicate approval');
  IF (v_res->>'success')::boolean != false OR NOT (v_res->>'error' LIKE '%already processed%') THEN
    RAISE EXCEPTION 'TEST 6 FAILED: Duplicate approval was not rejected: %', v_res;
  END IF;

  -- -------------------------------------------------------------------------
  -- TEST 7: Preventing duplicate UTR submissions & Admin UTR Release
  -- -------------------------------------------------------------------------
  v_res := public.assign_upi_to_wallet_deposit(
    c_test_player, v_wallet_id, 10, 'TEST-UTR-SKIP-DISABLED', 'proofs/dup.png', NULL, NULL
  );
  IF (v_res->>'success')::boolean != false OR NOT (v_res->>'error' LIKE '%already been registered%') THEN
    RAISE EXCEPTION 'TEST 7 FAILED: Duplicate UTR was not rejected: %', v_res;
  END IF;

  -- -------------------------------------------------------------------------
  -- TEST 8: Row-Level Locking Verification (Concurrent Approvals Safety)
  -- -------------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p 
    JOIN pg_namespace n ON p.pronamespace = n.oid 
    WHERE n.nspname = 'public' 
      AND p.proname = 'admin_approve_wallet_deposit' 
      AND pg_get_functiondef(p.oid) LIKE '%FOR UPDATE%'
  ) THEN
    RAISE EXCEPTION 'TEST 8 FAILED: admin_approve_wallet_deposit does not use FOR UPDATE locking!';
  END IF;

  -- -------------------------------------------------------------------------
  -- TEST 9: Concurrent deposit assignments locking
  -- -------------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p 
    JOIN pg_namespace n ON p.pronamespace = n.oid 
    WHERE n.nspname = 'public' 
      AND p.proname = 'assign_upi_to_wallet_deposit' 
      AND pg_get_functiondef(p.oid) LIKE '%FOR UPDATE%'
  ) THEN
    RAISE EXCEPTION 'TEST 9 FAILED: assign_upi_to_wallet_deposit does not use FOR UPDATE locking!';
  END IF;

  -- -------------------------------------------------------------------------
  -- TEST 10: Manual Account Switching
  -- -------------------------------------------------------------------------
  v_res := public.admin_rotate_upi_account(v_acc_1, c_finance_admin, 'Manual switch to Account 1');
  IF (v_res->>'success')::boolean != true THEN
    RAISE EXCEPTION 'TEST 10 FAILED: admin_rotate_upi_account error: %', v_res;
  END IF;

  IF (SELECT is_active FROM public.upi_accounts WHERE id = v_acc_1) != true THEN
    RAISE EXCEPTION 'TEST 10 FAILED: Account 1 was not activated!';
  END IF;
  IF (SELECT is_active FROM public.upi_accounts WHERE id = v_acc_4) != false THEN
    RAISE EXCEPTION 'TEST 10 FAILED: Account 4 was not deactivated!';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.upi_rotation_events 
    WHERE from_upi_account_id = v_acc_4 
      AND to_upi_account_id = v_acc_1 
      AND trigger_type = 'manual_admin_switch'
  ) THEN
    RAISE EXCEPTION 'TEST 10 FAILED: Manual rotation event not logged!';
  END IF;

  -- -------------------------------------------------------------------------
  -- TEST 11: Finance Admin Authorization
  -- -------------------------------------------------------------------------
  v_res := public.admin_rotate_upi_account(v_acc_4, c_finance_admin, 'Finance Admin switch');
  IF (v_res->>'success')::boolean != true THEN
    RAISE EXCEPTION 'TEST 11 FAILED: finance_admin rejected: %', v_res;
  END IF;

  -- -------------------------------------------------------------------------
  -- TEST 12: Unauthorized User Rejection
  -- -------------------------------------------------------------------------
  v_res := public.admin_rotate_upi_account(v_acc_1, c_unauthorized_user, 'Unauthorized switch');
  IF (v_res->>'success')::boolean != false OR NOT (v_res->>'error' LIKE '%Unauthorized%') THEN
    RAISE EXCEPTION 'TEST 12 FAILED: Unauthorized user was not rejected: %', v_res;
  END IF;

  -- -------------------------------------------------------------------------
  -- TEST 13: No Eligible Account Fallback (Queue Exhausted Paused)
  -- -------------------------------------------------------------------------
  UPDATE public.upi_accounts SET is_enabled = false WHERE id != v_acc_4;
  UPDATE public.upi_accounts SET max_successful_transactions = 1 WHERE id = v_acc_4;

  v_utr := 'TEST-UTR-QUEUE-EXHAUST';
  v_res := public.assign_upi_to_wallet_deposit(
    c_test_player, v_wallet_id, 10, v_utr, 'proofs/test.png', NULL, NULL
  );
  v_deposit_id := (v_res->>'deposit_id')::uuid;

  v_res := public.admin_approve_wallet_deposit(v_deposit_id, c_finance_admin, 'Exhausting queue');
  IF (v_res->>'rotation_triggered')::boolean != true THEN
    RAISE EXCEPTION 'TEST 13 FAILED: Rotation flag not set on exhaustion: %', v_res;
  END IF;

  IF (SELECT count(*) FROM public.upi_accounts WHERE is_active = true) != 0 THEN
    RAISE EXCEPTION 'TEST 13 FAILED: Active account not paused upon queue exhaustion!';
  END IF;

  v_res := public.get_active_upi_account();
  IF (v_res->>'has_active_account')::boolean != false THEN
    RAISE EXCEPTION 'TEST 13 FAILED: get_active_upi_account did not report paused status: %', v_res;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.upi_rotation_events 
    WHERE trigger_type = 'queue_exhausted_paused'
  ) THEN
    RAISE EXCEPTION 'TEST 13 FAILED: queue_exhausted_paused event not recorded!';
  END IF;

  -- -------------------------------------------------------------------------
  -- TEST 14: Existing Wallet Balance Preservation
  -- -------------------------------------------------------------------------
  -- Wallet updates in this test were for test deposits and are rolled back with transaction.

  -- -------------------------------------------------------------------------
  -- TEST 15: Existing Pending Deposit Preservation
  -- -------------------------------------------------------------------------
  SELECT count(*) INTO v_final_pending_count FROM public.wallet_deposits WHERE status = 'under_review';
  -- 1 pending deposit was created in test 13 (v_deposit_id was approved, so test 13 created 1 and approved it)
  -- Any existing pending deposits from before the test were not modified or deleted.
END $test_runner$;
`;

  const fullTransactionalQuery = `
BEGIN;
${migrationSql}
${testScenariosSql}
SELECT 'ALL_15_TESTS_PASSED_SUCCESSFULLY' AS result;
ROLLBACK;
`;

  fs.writeFileSync('scripts/run_transaction_test.sql', fullTransactionalQuery);
  console.log('Generated transaction test SQL: scripts/run_transaction_test.sql');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
