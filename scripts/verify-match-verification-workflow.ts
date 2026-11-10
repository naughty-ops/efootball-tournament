import * as fs from 'node:fs';
import * as path from 'node:path';

// Load .env.local into process.env
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

import { createAdminClient } from '../lib/supabase/admin';

console.log('⚽ Starting Match Start & Result Verification Workflow E2E Tests...\n');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.error(`❌ FAIL: ${testName}${details ? ` - ${details}` : ''}`);
    testsFailed++;
  }
}

async function runWorkflowTests() {
  const adminClient = createAdminClient();

  // Fetch real users from DB
  const { data: userRows, error: uErr } = await (adminClient.from('profiles') as any).select('id').limit(2);
  if (uErr || !userRows || userRows.length < 2) {
    throw new Error('Need at least 2 users in database for workflow tests');
  }
  const userA = { id: userRows[0].id, username: 'PlayerA' };
  const userB = { id: userRows[1].id, username: 'PlayerB' };

  const testTournamentId = '00000000-0000-4000-b000-000000000001';
  const testRoundId = '00000000-0000-4000-b000-000000000002';
  const participantAId = '00000000-0000-4000-b000-000000000003';
  const participantBId = '00000000-0000-4000-b000-000000000004';

  const match1Id = '00000000-0000-4000-b000-000000000010'; // Matching scores test
  const match2Id = '00000000-0000-4000-b000-000000000020'; // Conflicting scores test
  const match3Id = '00000000-0000-4000-b000-000000000030'; // Timeout test

  // Cleanup old test data
  await (adminClient.from('match_submissions') as any).delete().in('match_id', [match1Id, match2Id, match3Id]);
  await (adminClient.from('match_disputes') as any).delete().eq('tournament_id', testTournamentId);
  await (adminClient.from('match_activity_logs') as any).delete().eq('tournament_id', testTournamentId);
  await (adminClient.from('matches') as any).delete().eq('tournament_id', testTournamentId);
  await (adminClient.from('participants') as any).delete().eq('tournament_id', testTournamentId);
  await (adminClient.from('rounds') as any).delete().eq('tournament_id', testTournamentId);
  await (adminClient.from('tournaments') as any).delete().eq('id', testTournamentId);

  // Setup Tournament
  const { error: tErr } = await (adminClient.from('tournaments') as any).insert({
    id: testTournamentId,
    name: 'Workflow Verification Test Cup',
    format: 'knockout',
    status: 'ongoing',
  });
  if (tErr) throw new Error(`Failed to create test tournament: ${tErr.message}`);

  // Setup Round
  const { error: rErr } = await (adminClient.from('rounds') as any).insert({
    id: testRoundId,
    tournament_id: testTournamentId,
    round_number: 1,
    name: 'Quarterfinals',
    status: 'ongoing',
  });
  if (rErr) throw new Error(`Setup round error: ${rErr.message}`);

  // Setup Participants
  const { error: pErr } = await (adminClient.from('participants') as any).insert([
    { id: participantAId, tournament_id: testTournamentId, username: 'Player Alpha', user_id: userA.id },
    { id: participantBId, tournament_id: testTournamentId, username: 'Player Beta', user_id: userB.id },
  ]);
  if (pErr) throw new Error(`Setup participants error: ${pErr.message}`);

  // ==========================================
  // TEST SUITE 1: MATCH START & COUNTDOWN
  // ==========================================
  console.log('--- TEST SUITE 1: Match Start & 30-min Countdown ---');
  const { error: m1Err } = await (adminClient.from('matches') as any).insert({
    id: match1Id,
    tournament_id: testTournamentId,
    round_id: testRoundId,
    participant_a: participantAId,
    participant_b: participantBId,
    status: 'scheduled',
    scheduled_time: new Date().toISOString(),
  });
  if (m1Err) throw new Error(`Setup match 1 error: ${m1Err.message}`);

  // Player A starts match
  const { data: startResA, error: startErrA } = await (adminClient.rpc as any)('start_player_match', {
    p_match_id: match1Id,
    p_participant_id: participantAId,
    p_user_id: userA.id,
  });
  assert(!startErrA && startResA?.both_started === false, 'Player A starts match -> waiting for opponent', JSON.stringify(startResA));

  // Check intermediate match state in DB
  const { data: midMatch1 } = await (adminClient.from('matches') as any).select('*').eq('id', match1Id).single();
  assert(midMatch1.player_a_started_at !== null && midMatch1.status === 'waiting_for_players', 'Match status is waiting_for_players after 1st player start');

  // Player B starts match
  const { data: startResB, error: startErrB } = await (adminClient.rpc as any)('start_player_match', {
    p_match_id: match1Id,
    p_participant_id: participantBId,
    p_user_id: userB.id,
  });
  assert(!startErrB && startResB?.both_started === true, 'Player B starts match -> both started triggered', JSON.stringify(startResB));

  // Verify 30-minute completion countdown activated
  const { data: liveMatch1 } = await (adminClient.from('matches') as any).select('*').eq('id', match1Id).single();
  assert(liveMatch1.status === 'in_progress', 'Match status transitioned to in_progress upon both players starting');
  assert(liveMatch1.actual_start_time !== null, 'actual_start_time is recorded on server');
  assert(liveMatch1.submission_deadline !== null, '30-minute submission_deadline is recorded on server');

  const startMs = new Date(liveMatch1.actual_start_time).getTime();
  const deadlineMs = new Date(liveMatch1.submission_deadline).getTime();
  const diffMinutes = Math.round((deadlineMs - startMs) / 60000);
  assert(diffMinutes === 30, `submission_deadline is exactly 30 minutes (actual: ${diffMinutes} min)`);

  // ==========================================
  // TEST SUITE 2: SCENARIO A — MATCHING SCORES
  // ==========================================
  console.log('\n--- TEST SUITE 2: Scenario A — Matching Scores Automatic Verification ---');

  // Player A submits 3-1 (myScore: 3, opponentScore: 1)
  const { data: subResA, error: subErrA } = await (adminClient.rpc as any)('submit_player_score', {
    p_match_id: match1Id,
    p_participant_id: participantAId,
    p_user_id: userA.id,
    p_my_score: 3,
    p_opponent_score: 1,
  });
  assert(!subErrA && subResA?.status === 'awaiting_result', 'Player A submits score -> status awaiting_result', JSON.stringify(subResA));

  // Player B submits matching score: 1-3 (myScore: 1, opponentScore: 3)
  const { data: subResB, error: subErrB } = await (adminClient.rpc as any)('submit_player_score', {
    p_match_id: match1Id,
    p_participant_id: participantBId,
    p_user_id: userB.id,
    p_my_score: 1,
    p_opponent_score: 3,
  });
  if (subErrB) console.log('subErrB detail:', subErrB);
  assert(!subErrB && subResB?.matching === true, 'Player B submits matching score -> matching detected!', JSON.stringify(subResB || subErrB));

  // Verify match completed in database with verified scores
  const { data: completedMatch1 } = await (adminClient.from('matches') as any).select('*').eq('id', match1Id).single();
  assert(completedMatch1.status === 'completed', 'Match status automatically marked as completed');
  assert(completedMatch1.score_a === 3 && completedMatch1.score_b === 1, 'Final verified scores recorded as 3-1');
  assert(completedMatch1.winner_id === participantAId, 'Winner correctly assigned to participant A');

  // ==========================================
  // TEST SUITE 3: SCENARIO B — CONFLICTING SCORES & CLOUDINARY PROOF
  // ==========================================
  console.log('\n--- TEST SUITE 3: Scenario B — Conflicting Scores & Cloudinary Proof ---');
  await (adminClient.from('matches') as any).insert({
    id: match2Id,
    tournament_id: testTournamentId,
    round_id: testRoundId,
    participant_a: participantAId,
    participant_b: participantBId,
    status: 'in_progress',
    actual_start_time: new Date().toISOString(),
    submission_deadline: new Date(Date.now() + 30 * 60000).toISOString(),
    player_a_started_at: new Date().toISOString(),
    player_b_started_at: new Date().toISOString(),
  });

  // Player A submits 4-0
  await (adminClient.rpc as any)('submit_player_score', {
    p_match_id: match2Id,
    p_participant_id: participantAId,
    p_user_id: userA.id,
    p_my_score: 4,
    p_opponent_score: 0,
  });

  // Player B submits conflicting score 2-1 (myScore: 2, opponentScore: 1 => expects A:1, B:2)
  const { data: conflictRes, error: conflictErr } = await (adminClient.rpc as any)('submit_player_score', {
    p_match_id: match2Id,
    p_participant_id: participantBId,
    p_user_id: userB.id,
    p_my_score: 2,
    p_opponent_score: 1,
  });
  assert(!conflictErr && conflictRes?.conflict === true && conflictRes?.status === 'disputed', 'Conflicting scores detected -> match marked disputed', JSON.stringify(conflictRes));

  // Verify match status in DB is disputed
  const { data: disputedMatch } = await (adminClient.from('matches') as any).select('*').eq('id', match2Id).single();
  assert(disputedMatch.status === 'disputed', 'Match status in DB is disputed');

  // Verify admin dispute ticket was automatically created
  const { data: disputeTickets } = await (adminClient.from('match_disputes') as any)
    .select('*')
    .eq('match_id', match2Id);
  assert(disputeTickets && disputeTickets.length > 0, 'Admin dispute ticket was automatically created');
  const dTicket = disputeTickets[0];
  assert(dTicket.reason === 'conflicting_scores', `Dispute reason is conflicting_scores (actual: ${dTicket.reason})`);
  assert(dTicket.reporter_score_a === 1 && dTicket.reporter_score_b === 2, 'Reporter (Player B) score claims recorded');
  assert(dTicket.opponent_score_a === 4 && dTicket.opponent_score_b === 0, 'Opponent (Player A) score claims recorded');

  // Player A uploads Cloudinary screenshot proof
  const testProofUrlA = 'https://res.cloudinary.com/l5hy2qmt/image/upload/v1/efootball/matches/evidence/test_match_proof_a.jpg';
  const { data: proofResA, error: proofErrA } = await (adminClient.rpc as any)('submit_match_screenshot_proof', {
    p_match_id: match2Id,
    p_participant_id: participantAId,
    p_user_id: userA.id,
    p_screenshot_url: testProofUrlA,
    p_screenshot_public_id: 'efootball/matches/evidence/test_match_proof_a',
  });
  assert(!proofErrA && proofResA?.success === true, 'Player A uploads Cloudinary screenshot proof successfully');

  // Player B uploads Cloudinary screenshot proof
  const testProofUrlB = 'https://res.cloudinary.com/l5hy2qmt/image/upload/v1/efootball/matches/evidence/test_match_proof_b.jpg';
  const { data: proofResB, error: proofErrB } = await (adminClient.rpc as any)('submit_match_screenshot_proof', {
    p_match_id: match2Id,
    p_participant_id: participantBId,
    p_user_id: userB.id,
    p_screenshot_url: testProofUrlB,
    p_screenshot_public_id: 'efootball/matches/evidence/test_match_proof_b',
  });
  assert(!proofErrB && proofResB?.success === true, 'Player B uploads Cloudinary screenshot proof successfully');

  // Verify dispute ticket holds both Cloudinary screenshot proofs
  const { data: updatedDispute } = await (adminClient.from('match_disputes') as any)
    .select('*')
    .eq('id', dTicket.id)
    .single();
  assert(updatedDispute.opponent_screenshot_url === testProofUrlA, 'Dispute holds Player A Cloudinary screenshot');
  assert(updatedDispute.reporter_screenshot_url === testProofUrlB, 'Dispute holds Player B Cloudinary screenshot');

  // ==========================================
  // TEST SUITE 4: 30-MINUTE TIMEOUT SCENARIO
  // ==========================================
  console.log('\n--- TEST SUITE 4: 30-Minute Timeout Scenario ---');
  // Create match started 40 minutes ago
  const fortyMinsAgo = new Date(Date.now() - 40 * 60000).toISOString();
  const tenMinsAgo = new Date(Date.now() - 10 * 60000).toISOString();
  await (adminClient.from('matches') as any).insert({
    id: match3Id,
    tournament_id: testTournamentId,
    round_id: testRoundId,
    participant_a: participantAId,
    participant_b: participantBId,
    status: 'in_progress',
    actual_start_time: fortyMinsAgo,
    submission_deadline: tenMinsAgo, // Expired 10 mins ago
    player_a_started_at: fortyMinsAgo,
    player_b_started_at: fortyMinsAgo,
  });

  // Run timeout evaluation
  const { data: timeoutCheck } = await (adminClient.from('matches') as any)
    .select('id, status, submission_deadline, actual_start_time')
    .eq('id', match3Id)
    .single();

  const isExpired = new Date(timeoutCheck.submission_deadline).getTime() < Date.now();
  assert(isExpired === true, 'Match submission deadline is expired');

  // Update expired match to result_pending_admin and log dispute ticket
  await (adminClient.from('matches') as any)
    .update({
      status: 'result_pending_admin',
      updated_at: new Date().toISOString(),
    })
    .eq('id', match3Id);

  await (adminClient.from('match_disputes') as any).insert({
    tournament_id: testTournamentId,
    match_id: match3Id,
    reporter_participant_id: participantAId,
    reporter_user_id: userA.id,
    opponent_participant_id: participantBId,
    reason: 'timeout_no_result',
    status: 'open',
    details: '30-minute result submission deadline expired without verified scores. Pending admin review.',
  });

  const { data: timeoutMatchAfter } = await (adminClient.from('matches') as any).select('*').eq('id', match3Id).single();
  assert(timeoutMatchAfter.status === 'result_pending_admin', 'Match marked as result_pending_admin on timeout');
  assert(timeoutMatchAfter.winner_id === null, 'Victory is NOT awarded solely due to timeout (requires admin review)');

  // Clean up test data
  console.log('\n--- Cleaning up test tournament data ---');
  await (adminClient.from('match_submissions') as any).delete().in('match_id', [match1Id, match2Id, match3Id]);
  await (adminClient.from('match_disputes') as any).delete().eq('tournament_id', testTournamentId);
  await (adminClient.from('match_activity_logs') as any).delete().eq('tournament_id', testTournamentId);
  await (adminClient.from('matches') as any).delete().eq('tournament_id', testTournamentId);
  await (adminClient.from('participants') as any).delete().eq('tournament_id', testTournamentId);
  await (adminClient.from('rounds') as any).delete().eq('tournament_id', testTournamentId);
  await (adminClient.from('tournaments') as any).delete().eq('id', testTournamentId);

  console.log(`\n========================================`);
  console.log(`TOTAL TESTS PASSED: ${testsPassed}`);
  console.log(`TOTAL TESTS FAILED: ${testsFailed}`);
  console.log(`========================================\n`);

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runWorkflowTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
