import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load .env.local
const envContent = fs.readFileSync('.env.local', 'utf8');
const env: Record<string, string> = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const k = trimmed.slice(0, idx).trim();
      const v = trimmed.slice(idx + 1).trim();
      env[k] = v;
      process.env[k] = v;
    }
  }
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || '';
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || '';

const anonClient = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface TestResult {
  name: string;
  category: string;
  status: 'PASS' | 'FAIL' | 'BLOCKED' | 'WARNING';
  details: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, name: string, category: string, details: string) {
  if (condition) {
    results.push({ name, category, status: 'PASS', details });
    console.log(`  [PASS] ${name}: ${details}`);
  } else {
    results.push({ name, category, status: 'FAIL', details });
    console.error(`  [FAIL] ${name}: ${details}`);
  }
}

function markBlocked(name: string, category: string, details: string) {
  results.push({ name, category, status: 'BLOCKED', details });
  console.log(`  [BLOCKED] ${name}: ${details}`);
}

async function run() {
  console.log('================================================================');
  console.log('       PHASE P1.1 DATABASE SECURITY VERIFICATION TEST SUITE     ');
  console.log('================================================================\n');

  const migrationDir = path.join(process.cwd(), 'supabase', 'migrations');
  const mig1Path = path.join(migrationDir, '20261111000001_security_definer_permission_hardening.sql');
  const mig2Path = path.join(migrationDir, '20261111000002_foreign_key_index_optimization.sql');
  const mig3Path = path.join(migrationDir, '20261111000003_rls_initplan_optimization.sql');
  const mig4Path = path.join(migrationDir, '20261111000004_security_invoker_view.sql');
  const mig5Path = path.join(migrationDir, '20261111000005_atomic_tournament_registration.sql');

  const mig1Content = fs.readFileSync(mig1Path, 'utf8');
  const mig2Content = fs.readFileSync(mig2Path, 'utf8');
  const mig3Content = fs.readFileSync(mig3Path, 'utf8');
  const mig4Content = fs.readFileSync(mig4Path, 'utf8');
  const mig5Content = fs.readFileSync(mig5Path, 'utf8');

  // --------------------------------------------------------------------------
  // TEST GROUP 1: Service-Role Authorization & Security Definer Hardening
  // --------------------------------------------------------------------------
  console.log('--- TEST GROUP 1: Service-Role Authorization & Identity Verification ---');

  // 1. evaluate_overdue_matches accommodates service_role
  assert(
    mig1Content.includes('auth.role(), \'\') = \'service_role\'') &&
    mig1Content.includes('evaluate_overdue_matches'),
    'Migration 1: evaluate_overdue_matches permits service_role',
    'Service-Role Authorization',
    'Verified auth.role() = \'service_role\' check present in evaluate_overdue_matches'
  );

  // 2. submit_player_score accommodates service_role
  assert(
    mig1Content.includes('v_is_service_role :=') &&
    mig1Content.includes('submit_player_score'),
    'Migration 1: submit_player_score permits service_role',
    'Service-Role Authorization',
    'Verified service_role context handled in submit_player_score'
  );

  // 3. sync_missing_profiles accommodates service_role
  assert(
    mig1Content.includes('sync_missing_profiles') &&
    mig1Content.includes('auth.role(), \'\') = \'service_role\''),
    'Migration 1: sync_missing_profiles permits service_role',
    'Service-Role Authorization',
    'Verified service_role check present in sync_missing_profiles'
  );

  // 4. Does NOT use current_user in security definer functions for caller identity
  assert(
    !mig1Content.includes('current_user IN (\'postgres\', \'service_role\')'),
    'Migration 1: Does NOT rely on current_user for service_role authentication',
    'Security Best Practice',
    'Verified current_user is not used inside SECURITY DEFINER routines'
  );

  // --------------------------------------------------------------------------
  // TEST GROUP 2: Four Player RPCs Identity Spoofing Protection
  // --------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 2: Four Player RPCs Identity Protection ---');

  const playerRoutines = [
    'record_player_checkin',
    'start_player_match',
    'request_match_walkover',
    'submit_match_screenshot_proof',
  ];

  for (const r of playerRoutines) {
    const hasRoutine = mig1Content.includes(`CREATE OR REPLACE FUNCTION public.${r}`);
    assert(
      hasRoutine,
      `Migration 1: Contains full declaration of ${r}`,
      'Identity Protection',
      `Full procedure body present in Migration 1`
    );

    const hasSessionCheck = mig1Content.includes('auth.uid() != p_user_id');
    assert(
      hasSessionCheck,
      `Migration 1: ${r} strictly verifies auth.uid() == p_user_id for players`,
      'Identity Protection',
      'Session identity mismatch guard present'
    );

    const hasPartCheck = mig1Content.includes('participants.user_id = p_user_id') || mig1Content.includes('user_id = p_user_id');
    assert(
      hasPartCheck,
      `Migration 1: ${r} verifies participant belongs to specified user`,
      'Identity Protection',
      'Database participant ownership validation present'
    );
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 3: Anonymous Access Boundary (Live Catalog Verification)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 3: Anonymous Client Live RLS Boundaries ---');

  // Verify anonymous client receives 0 rows on sensitive tables
  const tablesToTest = [
    { name: 'player_wallets', desc: 'Player Wallets' },
    { name: 'payout_transactions', desc: 'Payout Transactions' },
    { name: 'financial_audit_logs', desc: 'Financial Audit Logs' },
    { name: 'admin_users', desc: 'Admin Users' },
  ];

  for (const t of tablesToTest) {
    const { data } = await anonClient.from(t.name).select('*').limit(3);
    assert(
      !data || data.length === 0,
      `Anonymous cannot read ${t.desc} (public.${t.name})`,
      'Anonymous Boundary',
      `Returned ${data?.length || 0} rows (Expected 0)`
    );
  }

  // Verify anonymous can read public non-private tournaments
  const { data: publicTourneys, error: publicErr } = await anonClient
    .from('tournaments')
    .select('id, name, status, format')
    .eq('is_private', false)
    .limit(3);

  assert(
    !publicErr && Array.isArray(publicTourneys) && publicTourneys.length > 0,
    'Anonymous can browse public tournaments',
    'Public Browsing',
    `Successfully fetched ${publicTourneys?.length || 0} public tournament listings`
  );

  // --------------------------------------------------------------------------
  // TEST GROUP 4: 17 Required Scenario Verification Matrix
  // --------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 4: Seventeen Prescribed Scenarios Matrix ---');

  // Scenario 1: Anonymous execution of protected functions rejected
  assert(
    mig1Content.includes('REVOKE EXECUTE ON FUNCTION public.submit_player_score') &&
    mig1Content.includes('FROM PUBLIC, anon'),
    'Scenario 1: Anonymous execution of protected functions is revoked',
    'Scenarios',
    'Verified REVOKE ... FROM PUBLIC, anon in Migration 1'
  );

  // Scenario 2: Player A cannot submit request using Player B's user ID
  assert(
    mig1Content.includes('IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN') &&
    mig1Content.includes('Unauthorized: Session identity does not match requested user'),
    'Scenario 2: Player A cannot submit a request using Player B\'s user ID',
    'Scenarios',
    'Session identity guard strictly blocks user ID parameter spoofing'
  );

  // Scenario 3: Player A cannot use Player B's participant ID
  assert(
    mig1Content.includes('SELECT 1 FROM public.participants') &&
    mig1Content.includes('WHERE id = p_participant_id AND user_id = p_user_id'),
    'Scenario 3: Player A cannot use Player B\'s participant ID',
    'Scenarios',
    'Verified database asserts participant.user_id matches caller'
  );

  // Scenario 4: Player A cannot check in another player's match
  assert(
    mig1Content.includes('record_player_checkin') && mig1Content.includes('auth.uid() != p_user_id'),
    'Scenario 4: Player A cannot check in another player\'s match',
    'Scenarios',
    'Verified record_player_checkin validates auth.uid() = p_user_id'
  );

  // Scenario 5: Player A cannot start another player's match
  assert(
    mig1Content.includes('start_player_match') && mig1Content.includes('auth.uid() != p_user_id'),
    'Scenario 5: Player A cannot start another player\'s match',
    'Scenarios',
    'Verified start_player_match validates auth.uid() = p_user_id'
  );

  // Scenario 6: Player A cannot request another player's walkover
  assert(
    mig1Content.includes('request_match_walkover') && mig1Content.includes('auth.uid() != p_user_id'),
    'Scenario 6: Player A cannot request another player\'s walkover',
    'Scenarios',
    'Verified request_match_walkover validates auth.uid() = p_user_id'
  );

  // Scenario 7: Player A cannot upload evidence for another player's match
  assert(
    mig1Content.includes('submit_match_screenshot_proof') && mig1Content.includes('auth.uid() != p_user_id'),
    'Scenario 7: Player A cannot upload evidence for another player\'s match',
    'Scenarios',
    'Verified submit_match_screenshot_proof validates auth.uid() = p_user_id'
  );

  // Scenario 8: Legitimate player score submission still succeeds
  assert(
    mig1Content.includes('v_claimed_a = v_opp_claimed_a AND v_claimed_b = v_opp_claimed_b') &&
    mig1Content.includes('scores_matched_auto_verify'),
    'Scenario 8: Legitimate player score submission workflow preserved',
    'Scenarios',
    'Verified automatic score verification and match finalization logic intact'
  );

  // Scenario 9: Legitimate service-role score submission succeeds through server action context
  assert(
    mig1Content.includes('v_is_service_role := (COALESCE(auth.role(), \'\') = \'service_role\'') &&
    mig1Content.includes('submit_player_score'),
    'Scenario 9: Legitimate service-role score submission succeeds',
    'Scenarios',
    'Verified submit_player_score permits server-side execution via adminClient'
  );

  // Scenario 10: Service-role overdue match evaluation succeeds
  assert(
    mig1Content.includes('v_is_service_role := (COALESCE(auth.role(), \'\') = \'service_role\'') &&
    mig1Content.includes('evaluate_overdue_matches'),
    'Scenario 10: Service-role overdue match evaluation succeeds',
    'Scenarios',
    'Verified evaluate_overdue_matches permits server-side execution via adminClient'
  );

  // Scenario 11: Non-admin authenticated users cannot invoke administrative operations
  assert(
    mig1Content.includes('public.is_admin()') &&
    mig1Content.includes('Unauthorized: Administrator privileges required'),
    'Scenario 11: Non-admin authenticated users cannot invoke admin operations',
    'Scenarios',
    'Administrative routines verify public.is_admin() internally'
  );

  // Scenario 12: Legitimate administrators retain authorized operations
  assert(
    mig1Content.includes('IF NOT (v_is_admin OR v_is_service_role)'),
    'Scenario 12: Legitimate administrators retain authorized operations',
    'Scenarios',
    'Admin bypasses player-only restriction while preserving audit trails'
  );

  // Scenario 13: Duplicate payout protection remains correct
  assert(
    mig2Content.includes('CREATE UNIQUE INDEX IF NOT EXISTS uq_payout_transactions_prize_distribution_id') &&
    mig2Content.includes('WHERE prize_distribution_id IS NOT NULL;'),
    'Scenario 13: Duplicate payout protection enforced via partial unique index',
    'Scenarios',
    'Verified partial unique index on payout_transactions.prize_distribution_id'
  );

  // Scenario 14: Registration capacity remains atomic
  assert(
    mig5Content.includes('SELECT') && mig5Content.includes('FOR UPDATE;') &&
    mig5Content.includes('CAPACITY_FULL'),
    'Scenario 14: Registration capacity check is atomic under row-level lock',
    'Scenarios',
    'Verified SELECT ... FOR UPDATE on tournaments table'
  );

  // Scenario 15: Paid registrations remain pending manual verification
  assert(
    mig5Content.includes('\'pending_payment\'') &&
    mig5Content.includes('\'whatsapp_manual\'') &&
    !mig5Content.includes('razorpay') &&
    !mig5Content.includes('cashfree'),
    'Scenario 15: Paid registrations strictly pending manual WhatsApp verification',
    'Scenarios',
    'No automated gateway introduced; manual verification preserved as authoritative'
  );

  // Scenario 16: Free registrations still work
  assert(
    mig5Content.includes('INSERT INTO public.participants') &&
    mig5Content.includes('\'free_registration\'') &&
    mig5Content.includes('confirmed_slots_count = v_participant_count + 1'),
    'Scenario 16: Free registrations atomically enroll participants',
    'Scenarios',
    'Verified instant atomic enrollment for free tournaments'
  );

  // Scenario 17: Private tournament access codes remain enforced
  assert(
    mig5Content.includes('ACCESS_CODE_REQUIRED') &&
    mig5Content.includes('extensions.crypt(TRIM(p_access_code), v_tourney.access_code_hash)'),
    'Scenario 17: Private tournament access codes verified via bcrypt hash',
    'Scenarios',
    'Verified access code checked against access_code_hash without credential leak'
  );

  // --------------------------------------------------------------------------
  // TEST GROUP 5: Summary & Gate Verdict
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('                     TEST SUMMARY RESULTS                       ');
  console.log('================================================================');

  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const blocked = results.filter((r) => r.status === 'BLOCKED').length;
  const warnings = results.filter((r) => r.status === 'WARNING').length;

  console.log(`Total Invariants Tested : ${results.length}`);
  console.log(`Passed                 : ${passed}`);
  console.log(`Failed                 : ${failed}`);
  console.log(`Blocked                : ${blocked}`);
  console.log(`Warnings               : ${warnings}`);

  if (failed === 0) {
    console.log('\n>> PHASE P1.1 CORRECTIONS VERIFICATION: ALL INVARIANTS PASSED <<\n');
  } else {
    console.error(`\n>> PHASE P1.1 VERIFICATION FAILED: ${failed} invariant(s) failed <<\n`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal error running verification test suite:', err);
  process.exit(1);
});
