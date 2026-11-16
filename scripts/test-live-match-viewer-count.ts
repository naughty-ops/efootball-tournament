import * as fs from 'node:fs';
import * as path from 'node:path';
import { createClient } from '@supabase/supabase-js';

// Load environment variables from .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        process.env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
      }
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const anonClient = createClient(supabaseUrl, anonKey);
const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface TestCase {
  name: string;
  passed: boolean;
  error?: string;
}

const testResults: TestCase[] = [];

function recordTest(name: string, passed: boolean, error?: string) {
  testResults.push({ name, passed, error });
  if (passed) {
    console.log(`  ✅ PASS: ${name}`);
  } else {
    console.error(`  ❌ FAIL: ${name} - ${error}`);
  }
}

async function runViewerCountTestSuite() {
  console.log('========================================================================');
  console.log('   LIVE MATCH VIEWER COUNT: AUTHORITATIVE REAL-TIME TEST SUITE');
  console.log('========================================================================\n');

  // Setup: Find or create two test matches
  const { data: matches, error: mErr } = await adminClient
    .from('matches')
    .select('id, status')
    .limit(2);

  if (mErr || !matches || matches.length < 2) {
    throw new Error('Need at least 2 matches in database to run viewer count tests');
  }

  const matchAId = matches[0].id;
  const matchBId = matches[1].id;

  // Clean any existing viewers on these test matches
  await adminClient.from('match_viewers').delete().in('match_id', [matchAId, matchBId]);

  // Test Accounts
  const { data: usersData } = await adminClient.auth.admin.listUsers();
  const u1 = usersData?.users?.find((u) => u.email === 'qa_player_01@test.internal');
  const u2 = usersData?.users?.find((u) => u.email === 'qa_player_02@test.internal');

  if (!u1 || !u2) {
    throw new Error('Test users qa_player_01 and qa_player_02 required');
  }

  // Authenticated user clients
  const client1 = createClient(supabaseUrl, anonKey);
  const client2 = createClient(supabaseUrl, anonKey);

  await client1.auth.signInWithPassword({
    email: 'qa_player_01@test.internal',
    password: 'TestPassword123!',
  });
  await client2.auth.signInWithPassword({
    email: 'qa_player_02@test.internal',
    password: 'TestPassword123!',
  });

  // -------------------------------------------------------------------------
  // TEST 1: Initial State & Clean Zero Count
  // -------------------------------------------------------------------------
  try {
    const { data: count, error } = await anonClient.rpc('get_active_match_viewers_count', {
      p_match_id: matchAId,
    });
    recordTest('Initial active viewer count is 0', !error && count === 0);
  } catch (err: any) {
    recordTest('Initial active viewer count is 0', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 2: Single Authenticated User Joins (Count = 1)
  // -------------------------------------------------------------------------
  try {
    const { data: res1, error: err1 } = await client1.rpc('record_match_viewer_heartbeat', {
      p_match_id: matchAId,
      p_session_id: 'tab_u1_1',
      p_device_type: 'desktop',
    });

    const isSuccess = !err1 && res1?.success === true && res1?.viewer_count === 1;
    recordTest('Single user heartbeat registers viewer (count = 1)', isSuccess, err1?.message);
  } catch (err: any) {
    recordTest('Single user heartbeat registers viewer (count = 1)', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 3: Multi-Tab Deduplication for Authenticated User (Count MUST stay 1)
  // -------------------------------------------------------------------------
  try {
    // Same user (client1) opens a second tab with a different session ID
    const { data: resTab2, error: errTab2 } = await client1.rpc('record_match_viewer_heartbeat', {
      p_match_id: matchAId,
      p_session_id: 'tab_u1_2',
      p_device_type: 'desktop',
    });

    const countRes = await client1.rpc('get_active_match_viewers_count', {
      p_match_id: matchAId,
    });

    const passed =
      !errTab2 &&
      resTab2?.viewer_count === 1 &&
      countRes.data === 1;

    recordTest(
      'Same authenticated user opening second tab does NOT inflate count (count = 1)',
      passed,
      `viewer_count was ${resTab2?.viewer_count}, query count was ${countRes.data}`
    );
  } catch (err: any) {
    recordTest('Same authenticated user in multiple tabs deduplication', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 4: Second Distinct User Joins (Count = 2)
  // -------------------------------------------------------------------------
  try {
    const { data: res2, error: err2 } = await client2.rpc('record_match_viewer_heartbeat', {
      p_match_id: matchAId,
      p_session_id: 'tab_u2_1',
      p_device_type: 'mobile',
    });

    const isSuccess = !err2 && res2?.success === true && res2?.viewer_count === 2;
    recordTest('Second distinct user joins match (count = 2)', isSuccess, err2?.message);
  } catch (err: any) {
    recordTest('Second distinct user joins match (count = 2)', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 5: Anonymous Guest Joins (Count = 3)
  // -------------------------------------------------------------------------
  try {
    const guestSessionId = 'guest_device_7788';
    const { data: resG, error: errG } = await anonClient.rpc('record_match_viewer_heartbeat', {
      p_match_id: matchAId,
      p_session_id: guestSessionId,
      p_device_type: 'desktop',
    });

    const isSuccess = !errG && resG?.success === true && resG?.viewer_count === 3;
    recordTest('Anonymous guest user joins match (count = 3)', isSuccess, errG?.message);
  } catch (err: any) {
    recordTest('Anonymous guest user joins match (count = 3)', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 6: Same Guest Opens Second Tab on Same Device (Count MUST stay 3)
  // -------------------------------------------------------------------------
  try {
    const guestSessionId = 'guest_device_7788';
    const { data: resG2, error: errG2 } = await anonClient.rpc('record_match_viewer_heartbeat', {
      p_match_id: matchAId,
      p_session_id: guestSessionId,
      p_device_type: 'desktop',
    });

    const passed = !errG2 && resG2?.viewer_count === 3;
    recordTest('Same anonymous guest in multiple tabs does NOT inflate count (count = 3)', passed);
  } catch (err: any) {
    recordTest('Anonymous guest multi-tab deduplication', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 7: Match Isolation (Independent viewer counts between Match A & B)
  // -------------------------------------------------------------------------
  try {
    // User 1 watches Match B
    const { data: resB, error: errB } = await client1.rpc('record_match_viewer_heartbeat', {
      p_match_id: matchBId,
      p_session_id: 'tab_u1_matchB',
      p_device_type: 'desktop',
    });

    const countA = await anonClient.rpc('get_active_match_viewers_count', { p_match_id: matchAId });
    const countB = await anonClient.rpc('get_active_match_viewers_count', { p_match_id: matchBId });

    const passed = countA.data === 3 && countB.data === 1;
    recordTest(
      'Different matches maintain independent viewer counts (Match A = 3, Match B = 1)',
      passed,
      `Match A: ${countA.data}, Match B: ${countB.data}`
    );
  } catch (err: any) {
    recordTest('Match isolation test', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 8: Explicit User Departure (Count decreases accurately)
  // -------------------------------------------------------------------------
  try {
    // Client 2 leaves Match A
    const { data: leaveRes, error: leaveErr } = await client2.rpc('leave_match_viewer', {
      p_match_id: matchAId,
      p_session_id: 'tab_u2_1',
    });

    const countA = await anonClient.rpc('get_active_match_viewers_count', { p_match_id: matchAId });
    const passed = !leaveErr && leaveRes?.viewer_count === 2 && countA.data === 2;

    recordTest(
      'User leaving decreases viewer count immediately (count drops from 3 to 2)',
      passed,
      `Updated count: ${countA.data}`
    );
  } catch (err: any) {
    recordTest('User departure test', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 9: Automatic Expiration of Abandoned Sessions (Crash/Disconnect)
  // -------------------------------------------------------------------------
  try {
    // Simulate expired guest session by updating its expires_at to 10 seconds ago
    await adminClient
      .from('match_viewers')
      .update({ expires_at: new Date(Date.now() - 10_000).toISOString() })
      .eq('match_id', matchAId)
      .eq('session_id', 'guest_device_7788');

    // Query active count (should exclude the expired session without needing unload event)
    const countAfterExpiry = await anonClient.rpc('get_active_match_viewers_count', {
      p_match_id: matchAId,
    });

    const passed = countAfterExpiry.data === 1;
    recordTest(
      'Expired/abandoned session automatically excluded from active count (count drops to 1)',
      passed,
      `Count after expiry: ${countAfterExpiry.data}`
    );
  } catch (err: any) {
    recordTest('Session expiration test', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 10: Security & RLS Enforcement (Direct mutations rejected)
  // -------------------------------------------------------------------------
  try {
    // Attempt direct table insert bypassing RPC
    const { error: directInsertErr } = await anonClient.from('match_viewers').insert({
      match_id: matchAId,
      session_id: 'hacker_session',
      status: 'watching',
    });

    // Attempt direct table delete
    const { error: directDeleteErr } = await anonClient
      .from('match_viewers')
      .delete()
      .eq('match_id', matchAId);

    const isSecure = directInsertErr !== null && directDeleteErr !== null;
    recordTest(
      'Security Hardened: Direct client INSERT/DELETE on match_viewers blocked by RLS',
      isSecure,
      `Insert err: ${directInsertErr?.message}, Delete err: ${directDeleteErr?.message}`
    );
  } catch (err: any) {
    recordTest('Security RLS test', false, err.message);
  }

  // Clean up test data
  await adminClient.from('match_viewers').delete().in('match_id', [matchAId, matchBId]);

  console.log('\n========================================================================');
  const allPassed = testResults.every((t) => t.passed);
  console.log(`TOTAL TESTS: ${testResults.length} | PASSED: ${testResults.filter((t) => t.passed).length} | FAILED: ${testResults.filter((t) => !t.passed).length}`);
  console.log('========================================================================\n');

  if (!allPassed) {
    process.exit(1);
  }
}

runViewerCountTestSuite().catch((err) => {
  console.error('Fatal error in viewer count test suite:', err);
  process.exit(1);
});
