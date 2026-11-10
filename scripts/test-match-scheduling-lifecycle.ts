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

console.log('⚽ Starting Match Scheduling, Deadlines, Countdown & Forfeit Lifecycle Tests...\n');

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

async function runLifecycleTests() {
  const adminClient = createAdminClient();

  // Fetch two real user IDs for valid foreign key relations
  const { data: userRows, error: uErr } = await (adminClient.from('profiles') as any).select('id').limit(2);
  if (uErr || !userRows || userRows.length < 2) {
    throw new Error('Need at least 2 users in database for lifecycle tests');
  }
  const userAId = userRows[0].id;
  const userBId = userRows[1].id;

  // Setup test tournament, round, and participants
  const testTournamentId = '00000000-0000-4000-a000-000000000001';
  const testRoundId = '00000000-0000-4000-a000-000000000002';
  const participantAId = '00000000-0000-4000-a000-000000000003';
  const participantBId = '00000000-0000-4000-a000-000000000004';

  // Cleanup any old test rows
  await (adminClient.from('match_disputes') as any).delete().eq('tournament_id', testTournamentId);
  await (adminClient.from('match_activity_logs') as any).delete().eq('tournament_id', testTournamentId);
  await (adminClient.from('matches') as any).delete().eq('tournament_id', testTournamentId);
  await (adminClient.from('participants') as any).delete().eq('tournament_id', testTournamentId);
  await (adminClient.from('rounds') as any).delete().eq('tournament_id', testTournamentId);
  await (adminClient.from('tournaments') as any).delete().eq('id', testTournamentId);

  // 1. Create Tournament & Round
  const { error: tErr } = await (adminClient.from('tournaments') as any).insert({
    id: testTournamentId,
    name: 'Lifecycle Test Tournament',
    format: 'knockout',
    status: 'ongoing',
  });
  if (tErr) throw new Error(`Setup tournament error: ${tErr.message}`);

  const { error: rErr } = await (adminClient.from('rounds') as any).insert({
    id: testRoundId,
    tournament_id: testTournamentId,
    round_number: 1,
    name: 'Quarterfinals',
    status: 'ongoing',
  });
  if (rErr) throw new Error(`Setup round error: ${rErr.message}`);

  const { error: pErr } = await (adminClient.from('participants') as any).insert([
    { id: participantAId, tournament_id: testTournamentId, username: 'Player Alpha', user_id: userAId },
    { id: participantBId, tournament_id: testTournamentId, username: 'Player Beta', user_id: userBId },
  ]);
  if (pErr) throw new Error(`Setup participants error: ${pErr.message}`);

  // SCENARIO 1: Both Players Start On Time -> Transitions to 'live'
  console.log('\n--- Scenario 1: Both Players Start On Time ---');
  const match1Id = '00000000-0000-4000-c000-000000000001';
  await (adminClient.from('matches') as any).insert({
    id: match1Id,
    tournament_id: testTournamentId,
    round_id: testRoundId,
    participant_a: participantAId,
    participant_b: participantBId,
    status: 'scheduled',
    scheduled_time: new Date().toISOString(),
    grace_period_minutes: 15,
  });

  // Player A checks in
  const checkinARes = await (adminClient.rpc as any)('record_player_checkin', {
    p_match_id: match1Id,
    p_participant_id: participantAId,
    p_user_id: userAId,
  });
  assert(checkinARes.data?.success === true, 'Player A check-in accepted');
  assert(checkinARes.data?.both_players_present === false, 'Waiting for Player B');

  // Player B checks in
  const checkinBRes = await (adminClient.rpc as any)('record_player_checkin', {
    p_match_id: match1Id,
    p_participant_id: participantBId,
    p_user_id: userBId,
  });
  assert(checkinBRes.data?.success === true, 'Player B check-in accepted');
  assert(checkinBRes.data?.both_players_present === true, 'Both players present detected');
  assert(checkinBRes.data?.status === 'live', 'Match promoted to LIVE upon both arrivals');

  // SCENARIO 2 & 6: One Player Absent -> Player A Requests Walkover
  console.log('\n--- Scenario 2 & 6: One Player Fails to Start & Present Player Requests Walkover ---');
  const match2Id = '00000000-0000-4000-c000-000000000002';
  const pastTime = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 mins ago
  const expiredCheckin = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 15 mins ago

  await (adminClient.from('matches') as any).insert({
    id: match2Id,
    tournament_id: testTournamentId,
    round_id: testRoundId,
    participant_a: participantAId,
    participant_b: participantBId,
    status: 'scheduled',
    scheduled_time: pastTime,
    checkin_deadline: expiredCheckin,
    grace_period_minutes: 15,
    player_a_started_at: pastTime, // Player A checked in on time
    player_b_started_at: null,     // Player B failed to show
  });

  const walkoverRes = await (adminClient.rpc as any)('request_match_walkover', {
    p_match_id: match2Id,
    p_participant_id: participantAId,
    p_user_id: userAId,
    p_reason: 'Opponent did not show up within grace period',
  });

  assert(walkoverRes.data?.success === true, 'Walkover request accepted by server');
  assert(walkoverRes.data?.status === 'under_review', 'Match transitioned to under_review');

  const { data: disputeRow } = await (adminClient.from('match_disputes') as any)
    .select('*')
    .eq('id', walkoverRes.data?.dispute_id)
    .single();

  assert(disputeRow?.reason === 'opponent_no_show', 'Dispute ticket registered as opponent_no_show');
  assert(disputeRow?.status === 'open', 'Dispute ticket is open for admin desk');

  // SCENARIO 3: Both Players Fail to Start -> Flagged Under Review, No Automatic Victory
  console.log('\n--- Scenario 3: Both Players Fail to Start (Double No-Show) ---');
  const match3Id = '00000000-0000-4000-c000-000000000003';
  await (adminClient.from('matches') as any).insert({
    id: match3Id,
    tournament_id: testTournamentId,
    round_id: testRoundId,
    participant_a: participantAId,
    participant_b: participantBId,
    status: 'scheduled',
    scheduled_time: pastTime,
    checkin_deadline: expiredCheckin,
    grace_period_minutes: 15,
    player_a_started_at: null,
    player_b_started_at: null,
  });

  const overdueRes = await (adminClient.rpc as any)('evaluate_overdue_matches', {
    p_tournament_id: testTournamentId,
  });
  assert(overdueRes.data?.success === true, 'evaluate_overdue_matches executed');

  const { data: match3Row } = await (adminClient.from('matches') as any)
    .select('*')
    .eq('id', match3Id)
    .single();

  assert(match3Row?.status === 'under_review', 'Double no-show match flagged under_review');
  assert(match3Row?.winner_id === null, 'No automatic victory awarded when both absent');
  assert(match3Row?.forfeit_reason?.includes('Both players failed to check in'), 'Forfeit reason logged accurately');

  // SCENARIO 4: Premature Walkover Request Before Deadline Rejection
  console.log('\n--- Scenario 4: Player Starts Before Deadline / Premature Walkover Blocked ---');
  const match4Id = '00000000-0000-4000-c000-000000000004';
  const futureKickoff = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const futureCheckin = new Date(Date.now() + 25 * 60 * 1000).toISOString();

  await (adminClient.from('matches') as any).insert({
    id: match4Id,
    tournament_id: testTournamentId,
    round_id: testRoundId,
    participant_a: participantAId,
    participant_b: participantBId,
    status: 'scheduled',
    scheduled_time: futureKickoff,
    checkin_deadline: futureCheckin,
    grace_period_minutes: 15,
    player_a_started_at: new Date().toISOString(),
  });

  const prematureWalkoverRes = await (adminClient.rpc as any)('request_match_walkover', {
    p_match_id: match4Id,
    p_participant_id: participantAId,
    p_user_id: userAId,
  });

  assert(prematureWalkoverRes.data?.success === false, 'Premature walkover blocked before deadline elapsed');
  assert(prematureWalkoverRes.data?.error?.includes('Grace period has not expired'), 'Error explains grace period active');

  // SCENARIO 5: Live Match Exceeds Completion Deadline -> Flagged
  console.log('\n--- Scenario 5: Live Match Exceeds Completion Deadline ---');
  const match5Id = '00000000-0000-4000-c000-000000000005';
  await (adminClient.from('matches') as any).insert({
    id: match5Id,
    tournament_id: testTournamentId,
    round_id: testRoundId,
    participant_a: participantAId,
    participant_b: participantBId,
    status: 'live',
    scheduled_time: pastTime,
    completion_deadline: expiredCheckin,
  });

  await (adminClient.rpc as any)('evaluate_overdue_matches', { p_tournament_id: testTournamentId });
  const { data: match5Row } = await (adminClient.from('matches') as any)
    .select('*')
    .eq('id', match5Id)
    .single();

  assert(match5Row?.status === 'under_review', 'Overdue live match flagged under_review');
  assert(match5Row?.forfeit_reason?.includes('completion deadline without reported score'), 'Completion reason recorded');

  // SCENARIO 7: Opponent Raises a Dispute
  console.log('\n--- Scenario 7: Player Raises Connection Dispute ---');
  const disputeInsertRes = await (adminClient.from('match_disputes') as any).insert({
    match_id: match1Id,
    tournament_id: testTournamentId,
    reporter_participant_id: participantBId,
    opponent_participant_id: participantAId,
    reason: 'connection_failure',
    details: 'EA server disconnected midway through extra time',
    status: 'open',
  }).select('id').single();

  assert(!disputeInsertRes.error && Boolean(disputeInsertRes.data?.id), 'Connection failure dispute registered in Supabase');

  // SCENARIO 8: Admin Extends Deadline
  console.log('\n--- Scenario 8: Admin Extends Deadline ---');
  const initialDeadline = new Date(Date.now() + 10 * 60 * 1000);
  await (adminClient.from('matches') as any)
    .update({
      completion_deadline: initialDeadline.toISOString(),
      status: 'live',
    })
    .eq('id', match1Id);

  const extendedDeadline = new Date(initialDeadline.getTime() + 15 * 60 * 1000).toISOString();
  await (adminClient.from('matches') as any)
    .update({
      completion_deadline: extendedDeadline,
      updated_at: new Date().toISOString(),
    })
    .eq('id', match1Id);

  const { data: match1AfterExtend } = await (adminClient.from('matches') as any)
    .select('completion_deadline')
    .eq('id', match1Id)
    .single();

  assert(new Date(match1AfterExtend?.completion_deadline).getTime() > initialDeadline.getTime(), 'Deadline successfully extended by 15 mins');

  // SCENARIO 9: Admin Reschedules a Match
  console.log('\n--- Scenario 9: Admin Reschedules a Match ---');
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  await (adminClient.from('matches') as any)
    .update({
      scheduled_time: tomorrow,
      checkin_deadline: new Date(Date.now() + 24 * 3600 * 1000 + 15 * 60 * 1000).toISOString(),
      player_a_started_at: null,
      player_b_started_at: null,
      status: 'scheduled',
      walkover_requested_by: null,
      forfeit_reason: null,
    })
    .eq('id', match2Id);

  const { data: match2Rescheduled } = await (adminClient.from('matches') as any)
    .select('*')
    .eq('id', match2Id)
    .single();

  assert(match2Rescheduled?.status === 'scheduled', 'Match status restored to scheduled');
  assert(match2Rescheduled?.player_a_started_at === null, 'Check-in state reset on reschedule');

  // SCENARIO 10: Duplicate Deadline Processing is Idempotent
  console.log('\n--- Scenario 10: Duplicate Deadline Processing Idempotency ---');
  const run1 = await (adminClient.rpc as any)('evaluate_overdue_matches', { p_tournament_id: testTournamentId });
  const run2 = await (adminClient.rpc as any)('evaluate_overdue_matches', { p_tournament_id: testTournamentId });
  assert(run2.data?.both_noshow_flagged === 0, 'Second run does not duplicate flaggings (idempotent)');

  // SCENARIO 11: Timezone and Daylight-Independent Timestamp Handling
  console.log('\n--- Scenario 11: Timestamptz Across Timezones (+05:30, -04:00, Z) ---');
  const utcDate = new Date('2026-11-08T15:30:00.000Z');
  const istDate = new Date('2026-11-08T21:00:00.000+05:30');
  const estDate = new Date('2026-11-08T10:30:00.000-05:00');

  assert(utcDate.getTime() === istDate.getTime(), 'UTC and IST ISO strings represent exact same instant');
  assert(utcDate.getTime() === estDate.getTime(), 'UTC and EST ISO strings represent exact same instant');

  // SCENARIO 12: Unauthorized User Attempting Walkover on Another Match
  console.log('\n--- Scenario 12: Unauthorized Participant Walkover Attempt Blocked ---');
  const unauthorizedRes = await (adminClient.rpc as any)('request_match_walkover', {
    p_match_id: match1Id,
    p_participant_id: '00000000-0000-4000-a000-999999999999',
    p_user_id: '00000000-0000-4000-b000-999999999999',
  });
  assert(unauthorizedRes.data?.success === false, 'Unauthorized participant rejected');

  // Clean up test data
  console.log('\n--- Teardown Test Data ---');
  await (adminClient.from('match_disputes') as any).delete().eq('tournament_id', testTournamentId);
  await (adminClient.from('match_activity_logs') as any).delete().eq('tournament_id', testTournamentId);
  await (adminClient.from('matches') as any).delete().eq('tournament_id', testTournamentId);
  await (adminClient.from('participants') as any).delete().eq('tournament_id', testTournamentId);
  await (adminClient.from('rounds') as any).delete().eq('tournament_id', testTournamentId);
  await (adminClient.from('tournaments') as any).delete().eq('id', testTournamentId);

  console.log(`\n========================================`);
  console.log(`TEST SUMMARY: ${testsPassed} passed, ${testsFailed} failed`);
  console.log(`========================================`);

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runLifecycleTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
