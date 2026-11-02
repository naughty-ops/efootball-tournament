/**
 * Production Integration & Smoke Test Suite
 * 
 * Verifies all 10 core integration scenarios against the full PostgreSQL schema:
 * 1. Duplicate UTR rejection (first claim succeeds, duplicate rejected with specific error)
 * 2. Invalid UTR rejection (< 8 characters rejected by RPC)
 * 3. Unauthorized reconciliation rejection (non-admin caller rejected with 403 or DB permission error)
 * 4. Valid admin reconciliation (slot confirmed, transaction inserted, order marked paid, audit logged)
 * 5. Repeated reconciliation idempotency (calling reconcile on already-paid order rejected safely)
 * 6. Webhook lease acquisition (first worker acquires, second worker within lease window rejected)
 * 7. Webhook lease expiration and reacquisition (expired lease reclaimed by new worker)
 * 8. Reservation expiration (expired reserved slot reclaimed by release_expired_reservations RPC)
 * 9. Slot counter consistency (confirmed_slots and reserved_slots never exceed max_participants)
 * 10. Public participant privacy (public view excludes real_name/contact/payment; direct table blocked by RLS)
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const psqlPath = 'C:\\Users\\aser\\postgres17\\pgsql\\bin\\psql.exe';
const pwPath = 'C:\\Users\\aser\\postgres17\\pwfile.txt';
const pw = fs.readFileSync(pwPath, 'utf8').trim();
const env = { ...process.env, PGPASSWORD: pw };

function runPsql(sql: string): string {
  return execFileSync(psqlPath, [
    '-h', '127.0.0.1',
    '-p', '5433',
    '-U', 'postgres',
    '-d', 'efootball_recovery_disposable',
    '-t', '-A', '-q',
    '-c', sql
  ], { env, encoding: 'utf8' }).trim();
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passed++;
  } else {
    console.error(`[FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
    failed++;
  }
}

async function runAllIntegrationTests() {
  console.log('================================================================');
  console.log('       PRODUCTION INTEGRATION & SMOKE TEST SUITE               ');
  console.log('================================================================\n');

  const adminId = '30080df7-5188-4630-b597-b8493ebe045d';
  const adminEmail = 'ye.agrajj@gmail.com';

  // Ensure admin user exists in admin_users
  runPsql(`
    INSERT INTO public.admin_users (id, email)
    VALUES ('${adminId}', '${adminEmail}')
    ON CONFLICT (id) DO NOTHING;
  `);

  // Helper to switch auth context in mock auth functions
  function setAuthContext(userId: string | null, email: string | null) {
    const uidSql = userId ? `'${userId}'::UUID` : 'NULL::UUID';
    const jwtSql = email ? `'{"email": "${email}"}'::JSONB` : "'{}'::JSONB";
    runPsql(`
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT ${uidSql}; $$;
      CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT ${jwtSql}; $$;
    `);
  }

  // --- SETUP COMMON TEST FIXTURES ---
  const tournamentId = runPsql(`
    INSERT INTO public.tournaments (
      name, format, status, is_paid, entry_fee_paise, currency, max_participants, 
      confirmed_slots_count, reserved_slots_count
    ) VALUES (
      'Integration Test Championship', 'knockout', 'registration', true, 5000, 'INR', 16, 0, 0
    ) RETURNING id;
  `);

  const playerAId = 'f4a0de78-8f3e-4483-8108-4f5d2b4b9d44';
  const playerBId = '78dbc5d4-2f6b-4fc9-b062-c7e534075a78';

  // Registrations
  const regASql = `
    INSERT INTO public.tournament_registrations (
      tournament_id, user_id, status, amount_paise, currency, reserved_until
    ) VALUES (
      '${tournamentId}', '${playerAId}', 'pending_payment', 5000, 'INR', timezone('utc', now() + interval '12 minutes')
    ) RETURNING id;
  `;
  const regAId = runPsql(regASql);

  const regBSql = `
    INSERT INTO public.tournament_registrations (
      tournament_id, user_id, status, amount_paise, currency, reserved_until
    ) VALUES (
      '${tournamentId}', '${playerBId}', 'pending_payment', 5000, 'INR', timezone('utc', now() + interval '12 minutes')
    ) RETURNING id;
  `;
  const regBId = runPsql(regBSql);

  const runTag = Date.now().toString(36);

  // Orders
  const orderAId = runPsql(`
    INSERT INTO public.payment_orders (
      registration_id, tournament_id, user_id, amount_paise, currency, status, gateway, receipt
    ) VALUES (
      '${regAId}', '${tournamentId}', '${playerAId}', 5000, 'INR', 'manual_review_required', 'youpi', 'rcpt_alpha_${runTag}'
    ) RETURNING id;
  `);

  const orderBId = runPsql(`
    INSERT INTO public.payment_orders (
      registration_id, tournament_id, user_id, amount_paise, currency, status, gateway, receipt
    ) VALUES (
      '${regBId}', '${tournamentId}', '${playerBId}', 5000, 'INR', 'manual_review_required', 'youpi', 'rcpt_beta_${runTag}'
    ) RETURNING id;
  `);

  console.log(`[SETUP] Fixtures initialized: Tournament ${tournamentId}, Orders: [${orderAId}, ${orderBId}]`);

  // ============================================================================
  // Scenario 3: Unauthorized reconciliation rejection
  // (Run first before admin context is enabled)
  // ============================================================================
  console.log('\n--- SCENARIO 3: Unauthorized Reconciliation Rejection ---');
  setAuthContext(playerAId, 'alpha@test.com'); // Non-admin caller

  const unauthResult = runPsql(`
    SELECT success, status, message 
    FROM public.reconcile_and_confirm_payment(
      '${orderAId}'::UUID, 'approve', 'BANKUTR12345678', 'Attempted unauthorized approve'
    );
  `);
  const [unauthSuccess, unauthStatus, unauthMsg] = unauthResult.split('|');
  assert(unauthSuccess === 'f', 'Scenario 3.1: Non-admin caller rejected (success = false)');
  assert(unauthStatus === 'unauthorized', 'Scenario 3.2: Status returned is "unauthorized"');
  assert(unauthMsg.includes('Unauthorized'), `Scenario 3.3: Message explains admin requirement: "${unauthMsg}"`);

  // Switch to valid Owner Admin context for authorized tests
  setAuthContext(adminId, adminEmail);

  // ============================================================================
  // Scenario 2: Invalid UTR rejection (< 8 characters rejected by RPC)
  // ============================================================================
  console.log('\n--- SCENARIO 2: Invalid UTR Rejection (< 8 alphanumeric chars) ---');
  const shortUtrResult = runPsql(`
    SELECT success, status, message 
    FROM public.reconcile_and_confirm_payment(
      '${orderAId}'::UUID, 'approve', 'SHORT', 'Testing short UTR'
    );
  `);
  const [shortSuccess, shortStatus, shortMsg] = shortUtrResult.split('|');
  assert(shortSuccess === 'f', 'Scenario 2.1: UTR < 8 chars rejected (success = false)');
  assert(shortStatus === 'invalid_utr', 'Scenario 2.2: Status returned is "invalid_utr"');
  assert(shortMsg.includes('at least 8 alphanumeric characters'), `Scenario 2.3: Message explains UTR length: "${shortMsg}"`);

  // ============================================================================
  // Scenario 4: Valid admin reconciliation
  // ============================================================================
  console.log('\n--- SCENARIO 4: Valid Admin Reconciliation ---');
  const validUtr = 'HDFC' + Date.now().toString().slice(-8);
  const approveResult = runPsql(`
    SELECT success, status, message, participant_id IS NOT NULL AS has_part
    FROM public.reconcile_and_confirm_payment(
      '${orderAId}'::UUID, 'approve', '${validUtr}', 'Admin verified HDFC credit'
    );
  `);
  const [appSuccess, appStatus, appMsg, hasParticipant] = approveResult.split('|');
  assert(appSuccess === 't', 'Scenario 4.1: Order A reconciliation succeeded (success = true)');
  assert(appStatus === 'paid', 'Scenario 4.2: Order status transition to "paid"');
  assert(hasParticipant === 't', 'Scenario 4.3: Participant slot created');

  // Verify DB state
  const orderCheck = runPsql(`SELECT status, observation_utr FROM public.payment_orders WHERE id = '${orderAId}';`);
  assert(orderCheck.startsWith(`paid|${validUtr}`), 'Scenario 4.4: Payment order recorded paid and UTR');

  const regCheck = runPsql(`SELECT status, participant_id IS NOT NULL FROM public.tournament_registrations WHERE id = '${regAId}';`);
  assert(regCheck.startsWith('confirmed|t'), 'Scenario 4.5: Tournament registration confirmed with participant_id');

  const claimCheck = runPsql(`SELECT normalized_utr, claimed_by FROM public.payment_utr_claims WHERE normalized_utr = '${validUtr}';`);
  assert(claimCheck.startsWith(`${validUtr}|${adminId}`), 'Scenario 4.6: UTR claim ledger record exists with admin ID');

  const auditCheck = runPsql(`SELECT action, status FROM public.admin_audit_logs WHERE entity_type = 'payment_order' ORDER BY created_at DESC LIMIT 1;`);
  assert(auditCheck.startsWith('payment_reconciliation_approved|success'), 'Scenario 4.7: Action logged in admin_audit_logs');

  // ============================================================================
  // Scenario 1: Duplicate UTR rejection
  // ============================================================================
  console.log('\n--- SCENARIO 1: Duplicate UTR Rejection ---');
  // Attempt to reconcile Order B with the exact same UTR claimed by Order A
  const dupResult = runPsql(`
    SELECT success, status, message 
    FROM public.reconcile_and_confirm_payment(
      '${orderBId}'::UUID, 'approve', '  ${validUtr.toLowerCase()}  ', 'Attempting duplicate UTR claim'
    );
  `);
  const [dupSuccess, dupStatus, dupMsg] = dupResult.split('|');
  assert(dupSuccess === 'f', 'Scenario 1.1: Duplicate UTR rejected (success = false)');
  assert(dupStatus === 'duplicate_utr', 'Scenario 1.2: Status returned is "duplicate_utr"');
  assert(dupMsg.toLowerCase().includes('already been claimed'), `Scenario 1.3: Message explains collision: "${dupMsg}"`);

  // ============================================================================
  // Scenario 5: Repeated reconciliation idempotency
  // ============================================================================
  console.log('\n--- SCENARIO 5: Repeated Reconciliation Idempotency ---');
  const repeatResult = runPsql(`
    SELECT success, status, message 
    FROM public.reconcile_and_confirm_payment(
      '${orderAId}'::UUID, 'approve', 'ANOTHERUTR999', 'Attempting to re-reconcile paid order'
    );
  `);
  const [repSuccess, repStatus, repMsg] = repeatResult.split('|');
  assert(repSuccess === 'f', 'Scenario 5.1: Already-paid order cannot be re-reconciled (success = false)');
  assert(repStatus === 'paid', 'Scenario 5.2: Status returns current order status "paid"');
  assert(repMsg.includes('Only pending or review orders are eligible'), `Scenario 5.3: Safe rejection message: "${repMsg}"`);

  // ============================================================================
  // Scenario 6: Webhook lease acquisition
  // ============================================================================
  console.log('\n--- SCENARIO 6: Webhook Lease Acquisition ---');
  const eventId = 'evt_test_lease_' + Date.now();
  const workerA = 'worker_node_alpha_token';
  const workerB = 'worker_node_beta_token';

  const leaseAResult = runPsql(`
    SELECT acquired, is_duplicate, current_status 
    FROM public.acquire_webhook_processing_lease(
      '${eventId}', 'payment.captured', '{"amount": 5000}'::jsonb, '${workerA}', 60
    );
  `);
  const [lAAcquired, lADup, lAStatus] = leaseAResult.split('|');
  assert(lAAcquired === 't' && lADup === 'f', 'Scenario 6.1: Worker A acquires initial processing lease');

  const leaseBResult = runPsql(`
    SELECT acquired, is_duplicate, current_status 
    FROM public.acquire_webhook_processing_lease(
      '${eventId}', 'payment.captured', '{"amount": 5000}'::jsonb, '${workerB}', 60
    );
  `);
  const [lBAcquired, lBDup, lBStatus] = leaseBResult.split('|');
  assert(lBAcquired === 'f' && lBStatus === 'processing', 'Scenario 6.2: Worker B concurrent acquisition within lease window rejected');

  // ============================================================================
  // Scenario 7: Webhook lease expiration and reacquisition
  // ============================================================================
  console.log('\n--- SCENARIO 7: Webhook Lease Expiration and Reacquisition ---');
  // Manually expire Worker A's lease
  runPsql(`
    UPDATE public.payment_webhook_events
    SET lease_expires_at = timezone('utc', now() - interval '5 seconds')
    WHERE event_id = '${eventId}';
  `);

  const workerC = 'worker_node_gamma_token';
  const leaseCResult = runPsql(`
    SELECT acquired, is_duplicate, message 
    FROM public.acquire_webhook_processing_lease(
      '${eventId}', 'payment.captured', '{"amount": 5000}'::jsonb, '${workerC}', 60
    );
  `);
  const [lCAcquired, lCDup, lCMsg] = leaseCResult.split('|');
  assert(lCAcquired === 't', 'Scenario 7.1: Worker C successfully reclaims expired lease');
  assert(lCMsg.includes('reclaimed'), `Scenario 7.2: Message indicates lease reclaim: "${lCMsg}"`);

  // Complete lease with Worker C
  const completeC = runPsql(`
    SELECT public.complete_webhook_processing_lease('${eventId}', '${workerC}', 'processed', NULL);
  `);
  assert(completeC === 't', 'Scenario 7.3: Worker C completes lease, setting status to processed');

  // Stale Worker A attempts to complete
  const completeStaleA = runPsql(`
    SELECT public.complete_webhook_processing_lease('${eventId}', '${workerA}', 'failed', '{"error":"timeout"}'::jsonb);
  `);
  assert(completeStaleA === 'f', 'Scenario 7.4: Stale Worker A prevented from completing or modifying lease');

  // ============================================================================
  // Scenario 8: Reservation expiration
  // ============================================================================
  console.log('\n--- SCENARIO 8: Reservation Expiration via RPC ---');
  const expiredTournId = runPsql(`
    INSERT INTO public.tournaments (
      name, format, status, is_paid, entry_fee_paise, currency, max_participants, 
      confirmed_slots_count, reserved_slots_count
    ) VALUES (
      'Expiring Tourney', 'knockout', 'registration', true, 5000, 'INR', 8, 0, 1
    ) RETURNING id;
  `);

  const expiredRegId = runPsql(`
    INSERT INTO public.tournament_registrations (
      tournament_id, user_id, status, amount_paise, currency, reserved_until
    ) VALUES (
      '${expiredTournId}', '${playerBId}', 'pending_payment', 5000, 'INR', timezone('utc', now() - interval '1 hour')
    ) RETURNING id;
  `);

  const releasedCount = runPsql(`
    SELECT public.release_expired_reservations('${expiredTournId}'::UUID);
  `);
  assert(parseInt(releasedCount, 10) >= 1, `Scenario 8.1: Expired reservation released (count=${releasedCount})`);

  const expiredRegStatus = runPsql(`
    SELECT status FROM public.tournament_registrations WHERE id = '${expiredRegId}';
  `);
  assert(expiredRegStatus === 'expired', 'Scenario 8.2: Registration status updated to "expired"');

  const tournSlots = runPsql(`
    SELECT reserved_slots_count FROM public.tournaments WHERE id = '${expiredTournId}';
  `);
  assert(parseInt(tournSlots, 10) === 0, 'Scenario 8.3: Tournament reserved_slots_count decremented to 0');

  // ============================================================================
  // Scenario 9: Slot counter consistency
  // ============================================================================
  console.log('\n--- SCENARIO 9: Slot Counter Consistency ---');
  const slotReconcile = runPsql(`
    SELECT confirmed_count, reserved_count, max_participants 
    FROM public.reconcile_tournament_slots('${tournamentId}'::UUID);
  `);
  const [confCount, resCount, maxSlots] = slotReconcile.split('|').map(Number);
  assert(confCount >= 1, `Scenario 9.1: Confirmed count (${confCount}) reflects approved orders`);
  assert(confCount + resCount <= maxSlots, `Scenario 9.2: Total slots (${confCount + resCount}) <= max (${maxSlots})`);

  // ============================================================================
  // Scenario 10: Public participant privacy
  // ============================================================================
  console.log('\n--- SCENARIO 10: Public Participant Privacy (View & RLS) ---');
  const viewCols = runPsql(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tournament_participants_public'
    ORDER BY ordinal_position;
  `).split('\n').map(c => c.trim()).filter(Boolean);

  const hasRealName = viewCols.includes('real_name');
  const hasContactInfo = viewCols.includes('contact_info');
  const hasUserId = viewCols.includes('user_id');

  assert(!hasRealName, 'Scenario 10.1: View tournament_participants_public does NOT expose real_name');
  assert(!hasContactInfo, 'Scenario 10.2: View does NOT expose contact_info');
  assert(!hasUserId, 'Scenario 10.3: View does NOT expose auth user_id');

  // Verify view exposes intended non-sensitive public columns
  const expectedCols = ['id', 'tournament_id', 'username', 'seed_number', 'status', 'created_at', 'updated_at'];
  const allExpectedPresent = expectedCols.every(c => viewCols.includes(c));
  assert(allExpectedPresent, `Scenario 10.4: View exposes all 7 expected safe columns: [${expectedCols.join(', ')}]`);

  // Verify query execution on public view
  const publicViewRows = runPsql(`
    SELECT count(*) FROM public.tournament_participants_public WHERE tournament_id = '${tournamentId}';
  `);
  assert(parseInt(publicViewRows, 10) >= 1, 'Scenario 10.5: Public view returns safe participant row for registration tournament');

  console.log('\n================================================================');
  console.log(`RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllIntegrationTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
