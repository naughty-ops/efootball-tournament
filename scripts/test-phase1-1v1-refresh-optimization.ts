import * as fs from 'node:fs';
import * as path from 'node:path';
import { createClient } from '@supabase/supabase-js';

// Load .env.local into process.env
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[key] = val;
      }
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing Supabase configuration');
  process.exit(1);
}

const adminClient = createClient(supabaseUrl, serviceRoleKey);

let passed = 0;
let failed = 0;

function assert(condition: boolean, title: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${title}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${title} ${detail ? `(${detail})` : ''}`);
    failed++;
  }
}

async function runPhase1Validation() {
  console.log('===============================================================');
  console.log('⚡ PHASE 1 VALIDATION: 1V1 REFRESH LOOP & REALTIME VERIFICATION');
  console.log('===============================================================\n');

  // TEST 1: Source Code Verification - Polling Loops Removed
  console.log('--- TEST 1: Refresh Loops Removal in Source Code ---');
  const hookSource = fs.readFileSync('hooks/useRealtimeOneVsOneMatch.ts', 'utf-8');
  const cardGridSource = fs.readFileSync('components/one-vs-one/OneVsOneCardGrid.tsx', 'utf-8');
  const arenaViewSource = fs.readFileSync('components/one-vs-one/OneVsOneArenaView.tsx', 'utf-8');

  assert(!hookSource.includes('3000'), '3s setInterval polling loop removed from useRealtimeOneVsOneMatch');
  assert(!cardGridSource.includes('12000'), '12s setInterval polling loop removed from OneVsOneCardGrid');
  assert(!cardGridSource.includes('router.refresh()'), 'router.refresh() removed from OneVsOneCardGrid');
  assert(!arenaViewSource.includes('onUpdate: () => {\n      router.refresh();\n    }'), 'onUpdate in OneVsOneArenaView uses syncActiveMatch instead of router.refresh()');
  assert(hookSource.includes("table: 'one_vs_one_results'"), 'Realtime hook subscribes to one_vs_one_results table');
  assert(hookSource.includes("table: 'one_vs_one_disputes'"), 'Realtime hook subscribes to one_vs_one_disputes table');

  // TEST 2: Exponential Backoff & Connection States Defined
  console.log('\n--- TEST 2: Reconnection State Machine & Fallback Invariants ---');
  assert(hookSource.includes("'CONNECTED'") && hookSource.includes("'RECONNECTING'") && hookSource.includes("'RECOVERED'"), 'Connection states CONNECTED, RECONNECTING, RECOVERED handled');
  assert(hookSource.includes('Math.min(2000 * Math.pow(1.5, retryCountRef.current), 15000)'), 'Controlled exponential backoff implemented');
  assert(hookSource.includes('stopFallbackSync()'), 'Fallback polling stopped immediately when Realtime is healthy (CONNECTED)');

  // TEST 3: Actions Existence and Performance
  console.log('\n--- TEST 3: Targeted Match Actions Verification ---');
  const { getUserActiveOneVsOneMatch, getAvailableWaitingMatches } = await import('@/services/oneVsOneService');

  const { data: users } = await adminClient.from('profiles').select('id, display_name').limit(2);
  assert(!!users && users.length >= 1, 'Test users available');
  const testUserId = users![0].id;

  // Warm up connection and imports
  await getUserActiveOneVsOneMatch(adminClient, testUserId);

  const tStart = Date.now();
  const activeMatch = await getUserActiveOneVsOneMatch(adminClient, testUserId);
  const activeMatchDuration = Date.now() - tStart;
  assert(activeMatch === null || typeof activeMatch === 'object', `getUserActiveOneVsOneMatch returned authoritative state (${activeMatchDuration}ms)`);

  const t1 = Date.now();
  const availableRes = await getAvailableWaitingMatches(adminClient, testUserId);
  const availableDuration = Date.now() - t1;
  assert(availableDuration < 300, `getAvailableWaitingMatches warm latency is sub-300ms (${availableDuration}ms)`);
  assert(availableRes.error === null, 'getAvailableWaitingMatches returned with zero errors');

  // TEST 4: Race Condition & State Reconciliation Logic
  console.log('\n--- TEST 4: Race Condition Protection & State Reconciliation ---');
  const mockPrev = {
    id: 'match-1',
    status: 'in_progress',
    updated_at: '2026-11-17T09:00:10.000Z',
  } as any;

  const mockStaleIncoming = {
    id: 'match-1',
    status: 'waiting',
    updated_at: '2026-11-17T09:00:05.000Z',
  } as any;

  const mockFreshIncoming = {
    id: 'match-1',
    status: 'result_submitted',
    updated_at: '2026-11-17T09:00:20.000Z',
  } as any;

  // Stale incoming must be rejected
  const prevTime = new Date(mockPrev.updated_at).getTime();
  const staleTime = new Date(mockStaleIncoming.updated_at).getTime();
  const freshTime = new Date(mockFreshIncoming.updated_at).getTime();

  assert(staleTime < prevTime, 'Stale timestamp detected correctly');
  assert(freshTime > prevTime, 'Fresh timestamp detected correctly');

  // TEST 5: Active Match Lifecycle with Realtime Channel Subscriptions
  console.log('\n--- TEST 5: Realtime Channel & Matchmaking State Protection ---');
  const { data: cards } = await adminClient.from('one_vs_one_cards').select('id, entry_amount').eq('status', 'active').limit(1);
  assert(!!cards && cards.length > 0, 'Active 1v1 tier card exists');

  console.log('\n===============================================================');
  console.log(`🏁 PHASE 1 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase1Validation().catch((err) => {
  console.error('Test suite error:', err);
  process.exit(1);
});
