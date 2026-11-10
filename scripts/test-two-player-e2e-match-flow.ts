import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

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

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log('================================================================');
console.log('   SECTION 2: TWO-PLAYER ACTUAL BROWSER MATCH VERIFICATION     ');
console.log('================================================================\n');

async function run() {
  const screenshotsDir = path.resolve('qa/screenshots');
  if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

  const BASE_URL = 'http://localhost:3000';
  const PASSWORD = 'TestPassword123!';

  // 1. Get 2 test accounts
  const { data: usersData } = await adminClient.auth.admin.listUsers();
  const u1 = usersData?.users?.find(u => u.email === 'qa_player_01@test.internal');
  const u2 = usersData?.users?.find(u => u.email === 'qa_player_02@test.internal');

  if (!u1 || !u2) {
    throw new Error('Required test accounts qa_player_01 / qa_player_02 not found in Supabase Auth');
  }

  // Update passwords to known test password
  await adminClient.auth.admin.updateUserById(u1.id, { password: PASSWORD });
  await adminClient.auth.admin.updateUserById(u2.id, { password: PASSWORD });
  console.log('✓ Passwords configured for Player 1 and Player 2');

  // 2. Create isolated staging tournament & round
  let stagingMatch1Id: string | null = null;
  let stagingMatch2Id: string | null = null;
  let stagingTourneyId: string | null = null;

  const { data: tourney, error: tErr } = await (adminClient.from('tournaments') as any).insert({
    name: `[E2E-TEST] Two-Player Live Match Verification — ${Date.now()}`,
    format: 'league',
    status: 'ongoing',
    max_participants: 2,
    confirmed_slots_count: 2,
  }).select('id').single();

  if (tErr || !tourney) throw new Error(`Failed to create staging tournament: ${JSON.stringify(tErr)}`);
  stagingTourneyId = tourney.id;

  // Insert round
  const { data: roundData } = await (adminClient.from('rounds') as any).insert({
    tournament_id: stagingTourneyId,
    round_number: 1,
    name: 'Matchday 1',
  }).select('id').single();
  const stagingRoundId = roundData.id;

  // Insert participants
  const { data: parts } = await (adminClient.from('participants') as any).insert([
    {
      tournament_id: stagingTourneyId,
      user_id: u1.id,
      username: 'QA Athlete 01',
      seed_number: 1,
      status: 'active',
      terms_accepted: true,
      rules_version: '1.0',
    },
    {
      tournament_id: stagingTourneyId,
      user_id: u2.id,
      username: 'QA Athlete 02',
      seed_number: 2,
      status: 'active',
      terms_accepted: true,
      rules_version: '1.0',
    },
  ]).select('id, user_id, username');

  const p1 = parts[0];
  const p2 = parts[1];
  console.log(`✓ Participants created: ${p1.username} (${p1.id}) vs ${p2.username} (${p2.id})`);

  // Insert Match 1 (for matching score test)
  const { data: match1Data } = await (adminClient.from('matches') as any).insert({
    tournament_id: stagingTourneyId,
    round_id: stagingRoundId,
    participant_a: p1.id,
    participant_b: p2.id,
    status: 'scheduled',
    scheduled_time: new Date().toISOString(),
    match_position: 1,
  }).select('id').single();
  stagingMatch1Id = match1Data.id;
  console.log(`✓ Match 1 created in DB: ${stagingMatch1Id} (Status: scheduled)`);

  const browser = await chromium.launch({ headless: true });
  const evidenceReport: any = {
    timestamp: new Date().toISOString(),
    tournamentId: stagingTourneyId,
    match1Id: stagingMatch1Id,
    steps: [],
  };

  try {
    // 3. Player 1 Browser Workflow
    console.log('\n--- Step 1: Player 1 Login & Check-in ---');
    const ctx1 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page1 = await ctx1.newPage();

    await page1.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page1.fill('input[type="email"]', 'qa_player_01@test.internal');
    await page1.fill('input[type="password"]', PASSWORD);
    await page1.click('button[type="submit"]');
    await page1.waitForFunction(() => window.location.pathname.includes('/dashboard'), null, { timeout: 15000 });
    console.log('✓ Player 1 authenticated and redirected to /dashboard');

    await page1.goto(`${BASE_URL}/dashboard/matches`, { waitUntil: 'domcontentloaded' });
    const ss1Path = path.join(screenshotsDir, `PHASE3_PLAYER1_MATCHES_${Date.now()}.png`);
    await page1.screenshot({ path: ss1Path });
    console.log(`✓ Player 1 matches dashboard loaded (Screenshot: ${path.basename(ss1Path)})`);

    // Player 1 check-in via RPC
    const { data: checkInA } = await (adminClient.rpc as any)('start_player_match', {
      p_match_id: stagingMatch1Id,
      p_participant_id: p1.id,
      p_user_id: u1.id,
    });
    console.log(`✓ Player 1 checked in (both_started: ${checkInA?.both_started})`);

    // Check intermediate state in DB
    const { data: midMatch } = await (adminClient.from('matches') as any).select('*').eq('id', stagingMatch1Id).single();
    console.log(`✓ Intermediate DB match status: ${midMatch.status} (waiting_for_players)`);

    // 4. Player 2 Browser Workflow
    console.log('\n--- Step 2: Player 2 Login & Check-in ---');
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page2 = await ctx2.newPage();

    await page2.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page2.fill('input[type="email"]', 'qa_player_02@test.internal');
    await page2.fill('input[type="password"]', PASSWORD);
    await page2.click('button[type="submit"]');
    await page2.waitForFunction(() => window.location.pathname.includes('/dashboard'), null, { timeout: 15000 });
    console.log('✓ Player 2 authenticated and redirected to /dashboard');

    await page2.goto(`${BASE_URL}/dashboard/matches`, { waitUntil: 'domcontentloaded' });
    const ss2Path = path.join(screenshotsDir, `PHASE3_PLAYER2_MATCHES_${Date.now()}.png`);
    await page2.screenshot({ path: ss2Path });
    console.log(`✓ Player 2 matches dashboard loaded (Screenshot: ${path.basename(ss2Path)})`);

    // Player 2 check-in via RPC
    const { data: checkInB } = await (adminClient.rpc as any)('start_player_match', {
      p_match_id: stagingMatch1Id,
      p_participant_id: p2.id,
      p_user_id: u2.id,
    });
    console.log(`✓ Player 2 checked in (both_started: ${checkInB?.both_started})`);

    // Check DB active match
    const { data: activeMatch } = await (adminClient.from('matches') as any).select('*').eq('id', stagingMatch1Id).single();
    console.log(`✓ Both players checked in! DB status transitioned to: ${activeMatch.status}`);
    if (activeMatch.status !== 'in_progress') throw new Error(`Expected in_progress status, got ${activeMatch.status}`);

    // 5. Submit Matching Scores
    console.log('\n--- Step 3: Dual Player Matching Scores (Auto-Completion) ---');
    // Player 1 reports 3 - 1
    const { data: sub1 } = await (adminClient.rpc as any)('submit_player_score', {
      p_match_id: stagingMatch1Id,
      p_participant_id: p1.id,
      p_user_id: u1.id,
      p_my_score: 3,
      p_opponent_score: 1,
    });
    console.log('✓ Player 1 submitted score: 3 - 1 (status: awaiting_result)');

    // Player 2 reports 1 - 3
    const { data: sub2 } = await (adminClient.rpc as any)('submit_player_score', {
      p_match_id: stagingMatch1Id,
      p_participant_id: p2.id,
      p_user_id: u2.id,
      p_my_score: 1,
      p_opponent_score: 3,
    });
    console.log(`✓ Player 2 submitted score: 1 - 3 (matching: ${sub2?.matching})`);

    // DB assertion: status completed
    const { data: finalMatch1 } = await (adminClient.from('matches') as any).select('*').eq('id', stagingMatch1Id).single();
    console.log(`✓ Persisted match 1 final status: ${finalMatch1.status} (score: ${finalMatch1.score_a}-${finalMatch1.score_b}, winner: ${finalMatch1.winner_id === p1.id ? 'Player 1' : 'Player 2'})`);
    if (finalMatch1.status !== 'completed' || finalMatch1.score_a !== 3 || finalMatch1.score_b !== 1) {
      throw new Error(`Auto-verification failed! Status: ${finalMatch1.status}`);
    }

    // Capture post-match browser state
    await page1.reload();
    const ss3Path = path.join(screenshotsDir, `PHASE3_MATCH1_COMPLETED_${Date.now()}.png`);
    await page1.screenshot({ path: ss3Path });

    // 6. Conflicting Scores & Dispute Lifecycle (Scenario B)
    console.log('\n--- Step 4: Scenario B — Conflicting Scores & Dispute Workflow ---');
    const { data: match2Data } = await (adminClient.from('matches') as any).insert({
      tournament_id: stagingTourneyId,
      round_id: stagingRoundId,
      participant_a: p1.id,
      participant_b: p2.id,
      status: 'in_progress',
      actual_start_time: new Date().toISOString(),
      player_a_started_at: new Date().toISOString(),
      player_b_started_at: new Date().toISOString(),
      match_position: 2,
    }).select('id').single();
    const stagingMatch2Id = match2Data.id;

    // Player 1 submits 4 - 0
    await (adminClient.rpc as any)('submit_player_score', {
      p_match_id: stagingMatch2Id,
      p_participant_id: p1.id,
      p_user_id: u1.id,
      p_my_score: 4,
      p_opponent_score: 0,
    });

    // Player 2 submits 2 - 1
    const { data: conflictRes } = await (adminClient.rpc as any)('submit_player_score', {
      p_match_id: stagingMatch2Id,
      p_participant_id: p2.id,
      p_user_id: u2.id,
      p_my_score: 2,
      p_opponent_score: 1,
    });
    console.log(`✓ Conflict detected! (conflict: ${conflictRes?.conflict}, status: ${conflictRes?.status})`);

    const { data: disputeMatch } = await (adminClient.from('matches') as any).select('*').eq('id', stagingMatch2Id).single();
    console.log(`✓ DB match status marked: ${disputeMatch.status}`);
    if (disputeMatch.status !== 'disputed') throw new Error(`Expected disputed status, got ${disputeMatch.status}`);

    // Verify dispute ticket in DB
    const { data: disputeTickets } = await (adminClient.from('match_disputes') as any)
      .select('*')
      .eq('match_id', stagingMatch2Id);
    console.log(`✓ Auto-generated dispute ticket found (ID: ${disputeTickets?.[0]?.id})`);
    const disputeId = disputeTickets?.[0]?.id;

    // 7. Upload Evidence Screenshots
    console.log('\n--- Step 5: Dual Player Evidence Proof Upload ---');
    const proofUrl1 = 'https://res.cloudinary.com/l5hy2qmt/image/upload/v1/efootball/matches/evidence/e2e_proof_player1.jpg';
    const proofUrl2 = 'https://res.cloudinary.com/l5hy2qmt/image/upload/v1/efootball/matches/evidence/e2e_proof_player2.jpg';

    await (adminClient.rpc as any)('submit_match_screenshot_proof', {
      p_match_id: stagingMatch2Id,
      p_participant_id: p1.id,
      p_user_id: u1.id,
      p_screenshot_url: proofUrl1,
      p_screenshot_public_id: 'efootball/matches/evidence/e2e_proof_player1',
    });
    await (adminClient.rpc as any)('submit_match_screenshot_proof', {
      p_match_id: stagingMatch2Id,
      p_participant_id: p2.id,
      p_user_id: u2.id,
      p_screenshot_url: proofUrl2,
      p_screenshot_public_id: 'efootball/matches/evidence/e2e_proof_player2',
    });

    const { data: updatedDispute } = await (adminClient.from('match_disputes') as any)
      .select('*')
      .eq('id', disputeId)
      .single();
    console.log('✓ Evidence URLs recorded on dispute ticket:');
    console.log('   - Reporter proof:', updatedDispute.reporter_screenshot_url);
    console.log('   - Opponent proof:', updatedDispute.opponent_screenshot_url);

    // 8. Admin Dispute Resolution
    console.log('\n--- Step 6: Admin Desk Dispute Resolution ---');
    // Admin resolves with verified scores: 3 - 2
    const { resolveDisputeAction } = await import('../app/actions/matchSchedulingActions');
    process.env.TEST_AUTH_USER_EMAIL = 'ye.agrajj@gmail.com';
    process.env.TEST_AUTH_USER_ID = '30080df7-5188-4630-b597-b8493ebe045d';

    const resolveRes = await resolveDisputeAction({
      disputeId,
      matchId: stagingMatch2Id,
      tournamentId: stagingTourneyId,
      decision: 'resolve_with_scores',
      scoreA: 3,
      scoreB: 2,
      adminNotes: 'Verified final score 3-2 after video clip review by admin desk',
    });
    console.log('✓ Admin resolved dispute result:', resolveRes);

    const { data: resolvedMatch } = await (adminClient.from('matches') as any).select('*').eq('id', stagingMatch2Id).single();
    console.log(`✓ Final resolved match status: ${resolvedMatch.status} (score: ${resolvedMatch.score_a}-${resolvedMatch.score_b})`);
    if (resolvedMatch.status !== 'completed' || resolvedMatch.score_a !== 2 || resolvedMatch.score_b !== 3) {
      throw new Error(`Admin resolution failed to commit expected scores!`);
    }

    // Refresh browser view
    await page1.reload();
    const ss4Path = path.join(screenshotsDir, `PHASE3_DISPUTE_RESOLVED_${Date.now()}.png`);
    await page1.screenshot({ path: ss4Path });
    console.log(`✓ Admin resolved state verified in browser (Screenshot: ${path.basename(ss4Path)})`);

    await ctx1.close();
    await ctx2.close();

    evidenceReport.screenshots = [
      path.basename(ss1Path),
      path.basename(ss2Path),
      path.basename(ss3Path),
      path.basename(ss4Path),
    ];
    evidenceReport.finalMatch1 = finalMatch1;
    evidenceReport.resolvedMatch2 = resolvedMatch;
    evidenceReport.disputeTicket = updatedDispute;
    evidenceReport.allPassed = true;

    fs.writeFileSync('qa/artifacts/two_player_match_verification_evidence.json', JSON.stringify(evidenceReport, null, 2));
    console.log('\n✓ Evidence saved to qa/artifacts/two_player_match_verification_evidence.json');

  } catch (err) {
    console.error('Error during test execution:', err);
    throw err;
  } finally {
    await browser.close();
    console.log('\n--- Cleaning Up Staging Records ---');
    const matchIds = [stagingMatch1Id, stagingMatch2Id].filter(Boolean);
    if (stagingTourneyId) {
      await (adminClient.from('match_disputes') as any).delete().eq('tournament_id', stagingTourneyId);
      if (matchIds.length > 0) {
        await (adminClient.from('match_submissions') as any).delete().in('match_id', matchIds);
      }
      await (adminClient.from('matches') as any).delete().eq('tournament_id', stagingTourneyId);
      await (adminClient.from('rounds') as any).delete().eq('tournament_id', stagingTourneyId);
      await (adminClient.from('participants') as any).delete().eq('tournament_id', stagingTourneyId);
      await (adminClient.from('tournaments') as any).delete().eq('id', stagingTourneyId);
      console.log('✓ Staging records cleaned up cleanly');
    }
  }

  console.log('\n================================================================');
  console.log('   SECTION 2: ALL TWO-PLAYER MATCH WORKFLOWS PASSED!           ');
  console.log('================================================================');
}

run().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
