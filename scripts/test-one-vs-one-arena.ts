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

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passedCount++;
  } else {
    console.error(`  ❌ FAIL: ${testName} - ${detail || 'Assertion failed'}`);
    failedCount++;
  }
}

async function runOneVsOneTestSuite() {
  console.log('===============================================================');
  console.log('🧪 TESTING 1 VS 1 CHALLENGE ARENA END-TO-END ENGINE');
  console.log('===============================================================\n');

  // Test accounts
  // Player 1 (Agraj): f4a0de78-8f3e-4483-8108-4f5d2b4b9d44
  // Player 2 (qa_player_01): e2e-qa user or secondary user in DB
  const { data: users } = await adminClient.from('profiles').select('id, display_name').limit(5);
  if (!users || users.length < 2) {
    console.error('Need at least 2 users in database to test');
    process.exit(1);
  }

  const player1 = users[0];
  const player2 = users[1];
  console.log(`Player 1: ${player1.display_name} (${player1.id})`);
  console.log(`Player 2: ${player2.display_name} (${player2.id})\n`);

  // Clean up any lingering active 1v1 match players for these test users
  await adminClient
    .from('one_vs_one_match_players')
    .update({ is_active: false })
    .in('user_id', [player1.id, player2.id]);

  // TEST 1: Entry Cards Verification
  console.log('--- TEST 1: Entry Cards Configuration ---');
  const { data: cards, error: cardsErr } = await adminClient
    .from('one_vs_one_cards')
    .select('*')
    .eq('status', 'active')
    .order('display_order', { ascending: true });

  assert(!cardsErr && !!cards && cards.length >= 3, 'Active challenge cards loaded');
  const cardA = cards![0]; // e.g. Rookie ₹10/₹15
  const cardB = cards![1]; // e.g. Pro ₹15/₹25
  assert(Number(cardA.entry_amount) > 0, `Card A Entry Amount is ₹${cardA.entry_amount}`);
  assert(Number(cardA.advertised_payout) > Number(cardA.entry_amount), `Card A Winner Payout is ₹${cardA.advertised_payout}`);

  // TEST 2: Age & Eligibility Acknowledgement
  console.log('\n--- TEST 2: Age & Eligibility Acknowledgement ---');
  const { error: eligErr } = await adminClient
    .from('one_vs_one_eligibility_records')
    .upsert({
      user_id: player1.id,
      policy_version: 'v1.0',
      jurisdiction: 'IN',
      eligibility_status: 'acknowledged',
    }, { onConflict: 'user_id,policy_version' });
  assert(!eligErr, 'Player 1 acknowledged age & rules');

  // TEST 3: Different Configurations Never Match
  console.log('\n--- TEST 3: Mismatched Cards Isolation ---');
  const { data: p1CardARes, error: p1CardAErr } = await adminClient.rpc('join_or_create_one_vs_one_match', {
    p_card_id: cardA.id,
    p_user_id: player1.id,
  });
  assert(!p1CardAErr && p1CardARes?.is_matched === false, 'Player 1 queued in Card A waiting room');

  // Player 2 queues in Card B
  const { data: p2CardBRes, error: p2CardBErr } = await adminClient.rpc('join_or_create_one_vs_one_match', {
    p_card_id: cardB.id,
    p_user_id: player2.id,
  });
  assert(!p2CardBErr && p2CardBRes?.is_matched === false, 'Player 2 queued in Card B waiting room');
  assert(p1CardARes?.match_id !== p2CardBRes?.match_id, 'Players in different tiers NEVER matched');

  // Cancel both to clear state
  await adminClient.rpc('cancel_waiting_one_vs_one_match', { p_match_id: p1CardARes.match_id, p_user_id: player1.id });
  await adminClient.rpc('cancel_waiting_one_vs_one_match', { p_match_id: p2CardBRes.match_id, p_user_id: player2.id });
  console.log('Cleaned up mismatched test rooms');

  // TEST 4: Concurrency & Duplicate Protection (Double-queue blocked)
  console.log('\n--- TEST 4: Concurrency & Duplicate Queue Protection ---');
  const { data: queue1 } = await adminClient.rpc('join_or_create_one_vs_one_match', {
    p_card_id: cardA.id,
    p_user_id: player1.id,
  });
  assert(queue1?.is_matched === false, 'Player 1 entered waiting queue');

  // Attempt to queue Player 1 again in another match simultaneously
  let duplicateBlocked = false;
  try {
    const { error: dupErr } = await adminClient.rpc('join_or_create_one_vs_one_match', {
      p_card_id: cardA.id,
      p_user_id: player1.id,
    });
    if (dupErr) duplicateBlocked = true;
  } catch {
    duplicateBlocked = true;
  }
  assert(duplicateBlocked, 'Duplicate active matchmaking request strictly rejected by DB');

  // TEST 5: Automatic Opponent Matching
  console.log('\n--- TEST 5: Automatic Opponent Matching ---');
  // Record initial wallet balances to test wallet non-mutation invariant
  const { data: p1WalletBefore } = await adminClient
    .from('player_wallets')
    .select('available_balance_paise, locked_balance_paise')
    .eq('user_id', player1.id)
    .maybeSingle();

  const { data: p2WalletBefore } = await adminClient
    .from('player_wallets')
    .select('available_balance_paise, locked_balance_paise')
    .eq('user_id', player2.id)
    .maybeSingle();

  const { data: queue2, error: queue2Err } = await adminClient.rpc('join_or_create_one_vs_one_match', {
    p_card_id: cardA.id,
    p_user_id: player2.id,
  });

  assert(!queue2Err && queue2?.is_matched === true, 'Player 2 paired automatically with Player 1');
  assert(queue2?.match_id === queue1.match_id, 'Both players received the exact same match ID');
  assert(queue2?.player_position === 2, 'Player 2 correctly assigned Position 2');

  const matchId = queue1.match_id;

  // Verify match status in database is now 'matched'
  const { data: matchDb } = await adminClient.from('one_vs_one_matches').select('*').eq('id', matchId).single();
  assert(matchDb.status === 'matched', 'Match status transitioned to matched');
  assert(matchDb.match_mode === 'free', 'Match mode is FREE');

  // TEST 6: Room Credentials Submission
  console.log('\n--- TEST 6: Room Credentials Workflow & Privacy ---');
  // Player 2 (non-host) cannot submit room credentials
  let nonHostBlocked = false;
  try {
    const { error: nonHostErr } = await adminClient.rpc('submit_one_vs_one_room', {
      p_match_id: matchId,
      p_user_id: player2.id,
      p_room_id: '99999999',
      p_room_password: '123',
    });
    if (nonHostErr) nonHostBlocked = true;
  } catch {
    nonHostBlocked = true;
  }
  assert(nonHostBlocked, 'Player 2 (non-host) blocked from setting room credentials');

  // Player 1 submits room
  const { error: hostSubmitErr } = await adminClient.rpc('submit_one_vs_one_room', {
    p_match_id: matchId,
    p_user_id: player1.id,
    p_room_id: '88776655',
    p_room_password: '4321',
  });
  assert(!hostSubmitErr, 'Player 1 successfully submitted Room ID (88776655) and Password (4321)');

  const { data: matchAfterRoom } = await adminClient.from('one_vs_one_matches').select('*').eq('id', matchId).single();
  assert(matchAfterRoom.status === 'room_submitted', 'Match status transitioned to room_submitted');
  assert(matchAfterRoom.room_id === '88776655', 'Room ID stored securely');

  // TEST 7: Ready Confirmation & Match Kickoff
  console.log('\n--- TEST 7: Readiness Confirmation & Match Kickoff ---');
  // Player 1 confirms ready
  const { data: p1ReadyRes } = await adminClient.rpc('confirm_one_vs_one_ready', {
    p_match_id: matchId,
    p_user_id: player1.id,
  });
  assert(p1ReadyRes.both_ready === false && p1ReadyRes.status === 'ready', 'Player 1 marked Ready; awaiting opponent');

  // Player 2 confirms ready
  const { data: p2ReadyRes } = await adminClient.rpc('confirm_one_vs_one_ready', {
    p_match_id: matchId,
    p_user_id: player2.id,
  });
  assert(p2ReadyRes.both_ready === true && p2ReadyRes.status === 'in_progress', 'Both players Ready; match auto-kickoff (in_progress)');

  // TEST 8: Score Submission & Opponent Confirmation
  console.log('\n--- TEST 8: Score Submission & Opponent Confirmation ---');
  // Player 1 submits 3-1 win for Player 1
  const { error: submitScoreErr } = await adminClient.rpc('submit_one_vs_one_result', {
    p_match_id: matchId,
    p_user_id: player1.id,
    p_claimed_winner_id: player1.id,
    p_p1_score: 3,
    p_p2_score: 1,
    p_screenshot_url: '1v1/test_proof.png',
  });
  assert(!submitScoreErr, 'Player 1 submitted score: 3 - 1');

  // Submitter cannot confirm own score
  let selfConfirmBlocked = false;
  try {
    const { error: scErr } = await adminClient.rpc('confirm_one_vs_one_result', {
      p_match_id: matchId,
      p_user_id: player1.id,
    });
    if (scErr) selfConfirmBlocked = true;
  } catch {
    selfConfirmBlocked = true;
  }
  assert(selfConfirmBlocked, 'Submitter blocked from self-confirming score');

  // Opponent confirms score
  const { error: oppConfirmErr } = await adminClient.rpc('confirm_one_vs_one_result', {
    p_match_id: matchId,
    p_user_id: player2.id,
  });
  assert(!oppConfirmErr, 'Opponent successfully confirmed score');

  const { data: completedMatch } = await adminClient.from('one_vs_one_matches').select('*').eq('id', matchId).single();
  assert(completedMatch.status === 'completed', 'Match completed successfully');

  // Player active status released
  const { data: p1Active } = await adminClient.from('one_vs_one_match_players').select('is_active').eq('match_id', matchId);
  const allInactive = p1Active?.every(p => !p.is_active);
  assert(allInactive === true, 'Player queue locks released on completion; players free to queue again');

  // TEST 9: Wallet Non-Mutation Invariant (Zero financial transactions)
  console.log('\n--- TEST 9: Strict Wallet Non-Mutation Invariant ---');
  const { data: p1WalletAfter } = await adminClient
    .from('player_wallets')
    .select('available_balance_paise, locked_balance_paise')
    .eq('user_id', player1.id)
    .maybeSingle();

  const { data: p2WalletAfter } = await adminClient
    .from('player_wallets')
    .select('available_balance_paise, locked_balance_paise')
    .eq('user_id', player2.id)
    .maybeSingle();

  assert(
    p1WalletBefore?.available_balance_paise === p1WalletAfter?.available_balance_paise &&
    p1WalletBefore?.locked_balance_paise === p1WalletAfter?.locked_balance_paise,
    'Player 1 wallet balance 100% UNCHANGED (0 paise deducted, 0 paise credited)'
  );

  assert(
    p2WalletBefore?.available_balance_paise === p2WalletAfter?.available_balance_paise &&
    p2WalletBefore?.locked_balance_paise === p2WalletAfter?.locked_balance_paise,
    'Player 2 wallet balance 100% UNCHANGED (0 paise deducted, 0 paise credited)'
  );

  const { data: oneVsOneTxns } = await adminClient
    .from('wallet_transactions')
    .select('*')
    .eq('reference_id', matchId);
  assert(!oneVsOneTxns || oneVsOneTxns.length === 0, 'Zero financial ledger transactions created (FREE mode verified)');

  // TEST 10: Dispute Lifecycle & Admin Resolution
  console.log('\n--- TEST 10: Dispute Lifecycle & Admin Resolution ---');
  // Create another match to test dispute flow
  const { data: q1 } = await adminClient.rpc('join_or_create_one_vs_one_match', { p_card_id: cardA.id, p_user_id: player1.id });
  await adminClient.rpc('join_or_create_one_vs_one_match', { p_card_id: cardA.id, p_user_id: player2.id });
  const disputeMatchId = q1.match_id;

  // Submit room & ready
  await adminClient.rpc('submit_one_vs_one_room', { p_match_id: disputeMatchId, p_user_id: player1.id, p_room_id: '11223344', p_room_password: '' });
  await adminClient.rpc('confirm_one_vs_one_ready', { p_match_id: disputeMatchId, p_user_id: player1.id });
  await adminClient.rpc('confirm_one_vs_one_ready', { p_match_id: disputeMatchId, p_user_id: player2.id });

  // Player 1 claims false score
  await adminClient.rpc('submit_one_vs_one_result', {
    p_match_id: disputeMatchId,
    p_user_id: player1.id,
    p_claimed_winner_id: player1.id,
    p_p1_score: 5,
    p_p2_score: 0,
  });

  // Player 2 disputes
  const { error: disputeErr } = await adminClient.rpc('dispute_one_vs_one_match', {
    p_match_id: disputeMatchId,
    p_user_id: player2.id,
    p_reason: 'Incorrect Score Claimed',
    p_description: 'Opponent claimed 5-0 but match ended 1-1 before opponent quit.',
    p_evidence_url: '1v1/dispute_evidence.png',
  });
  assert(!disputeErr, 'Player 2 successfully filed a match dispute');

  const { data: disputedMatchDb } = await adminClient.from('one_vs_one_matches').select('status').eq('id', disputeMatchId).single();
  assert(disputedMatchDb.status === 'disputed', 'Match status transitioned to disputed');

  // Admin resolves dispute
  const { data: disputeRow } = await adminClient.from('one_vs_one_disputes').select('id').eq('match_id', disputeMatchId).single();
  const { data: adminRecord } = await adminClient.from('admin_users').select('id').limit(1).single();

  const { error: resolveErr } = await adminClient.rpc('admin_resolve_one_vs_one_dispute', {
    p_dispute_id: disputeRow.id,
    p_admin_id: adminRecord.id,
    p_winner_id: player2.id,
    p_admin_notes: 'Reviewed evidence screenshot; Player 2 awarded victory.',
  });
  assert(!resolveErr, 'Admin resolved dispute and awarded verified result to Player 2');

  const { data: resolvedMatch } = await adminClient.from('one_vs_one_matches').select('status').eq('id', disputeMatchId).single();
  assert(resolvedMatch.status === 'completed', 'Disputed match transitioned to completed after admin determination');

  console.log('\n===============================================================');
  console.log(`🏁 TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('===============================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runOneVsOneTestSuite().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
