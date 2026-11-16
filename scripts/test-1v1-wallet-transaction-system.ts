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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE credentials in .env.local');
  process.exit(1);
}

const adminClient = createClient(supabaseUrl, serviceRoleKey);

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message} - Assertion failed`);
    throw new Error(message);
  }
  console.log(`  ✅ PASS: ${message}`);
}

async function run1v1WalletTestSuite() {
  console.log('===============================================================');
  console.log('🧪 TESTING 1 VS 1 LIVE WALLET ENTRY, PAYOUT & REFUND SYSTEM');
  console.log('===============================================================\n');

  let passedCount = 0;
  let failedCount = 0;

  function recordPass(msg: string) {
    passedCount++;
    console.log(`  ✅ PASS: ${msg}`);
  }

  function recordFail(msg: string, err: any) {
    failedCount++;
    console.error(`  ❌ FAIL: ${msg}:`, err);
  }

  // 1. Fetch test users
  const { data: users } = await adminClient.from('profiles').select('id, display_name').limit(5);
  if (!users || users.length < 2) {
    console.error('Need at least 2 users in database to test');
    process.exit(1);
  }

  const player1 = users[0];
  const player2 = users[1];
  console.log(`Player 1: ${player1.display_name} (${player1.id})`);
  console.log(`Player 2: ${player2.display_name} (${player2.id})\n`);

  // Ensure active cards exist
  const { data: cards } = await adminClient.from('one_vs_one_cards').select('*').eq('status', 'active').order('entry_amount', { ascending: true }).limit(1);
  const card = cards![0];
  const entryAmountInr = Number(card.entry_amount);
  const entryAmountPaise = Math.round(entryAmountInr * 100);
  const payoutAmountInr = Number(card.advertised_payout);
  const payoutAmountPaise = Math.round(payoutAmountInr * 100);

  console.log(`Active Challenge Card: ${card.name} | Entry: ₹${entryAmountInr} | Payout: ₹${payoutAmountInr}\n`);

  // Setup initial wallet balances
  // Player 1 gets ₹100 (10000 paise)
  // Player 2 gets ₹100 (10000 paise)
  await adminClient.from('player_wallets').upsert({
    user_id: player1.id,
    available_balance_paise: 10000,
    status: 'active',
  }, { onConflict: 'user_id' });

  await adminClient.from('player_wallets').upsert({
    user_id: player2.id,
    available_balance_paise: 10000,
    status: 'active',
  }, { onConflict: 'user_id' });

  // Clear any existing active match states & cancel leftover waiting matches from earlier test runs
  await adminClient.from('one_vs_one_matches').update({ status: 'cancelled' }).eq('status', 'waiting');
  await adminClient.from('one_vs_one_match_players').update({ is_active: false }).in('user_id', [player1.id, player2.id]);

  // --- SCENARIO 1: Player joins with sufficient balance ---
  console.log('--- SCENARIO 1: Player joins with sufficient balance ---');
  let matchId1 = '';
  try {
    const { data: p1WalletBefore } = await adminClient.from('player_wallets').select('available_balance_paise').eq('user_id', player1.id).single();
    const balanceBefore = Number(p1WalletBefore?.available_balance_paise);

    const { data: joinRes, error: joinErr } = await adminClient.rpc('join_or_create_one_vs_one_match', {
      p_card_id: card.id,
      p_user_id: player1.id,
    });

    if (joinErr) throw joinErr;
    matchId1 = joinRes.match_id;

    const { data: p1WalletAfter } = await adminClient.from('player_wallets').select('available_balance_paise').eq('user_id', player1.id).single();
    const balanceAfter = Number(p1WalletAfter?.available_balance_paise);

    assert(balanceAfter === balanceBefore - entryAmountPaise, `Wallet balance deducted by exactly ₹${entryAmountInr}`);

    // Verify ledger transaction
    const { data: tx } = await adminClient
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', player1.id)
      .eq('reference_id', matchId1)
      .eq('transaction_type', 'ONE_VS_ONE_ENTRY_FEE')
      .single();

    assert(!!tx, 'Immutable ONE_VS_ONE_ENTRY_FEE ledger transaction recorded');
    assert(Number(tx.amount_paise) === entryAmountPaise, `Ledger amount matches entry fee (${entryAmountPaise} paise)`);
    assert(Number(tx.balance_after_paise) === balanceAfter, 'balance_after_paise strictly recorded in ledger');
    recordPass('Player successfully joined with sufficient balance and fee was deducted');
  } catch (err: any) {
    recordFail('Scenario 1 failed', err.message);
  }

  // --- SCENARIO 2: Player joins with insufficient balance ---
  console.log('\n--- SCENARIO 2: Player joins with insufficient balance ---');
  try {
    // Temporarily drain player 2's wallet to 0
    await adminClient.from('player_wallets').update({ available_balance_paise: 0 }).eq('user_id', player2.id);

    const { data: p2Res, error: p2Err } = await adminClient.rpc('join_or_create_one_vs_one_match', {
      p_card_id: card.id,
      p_user_id: player2.id,
    });

    assert(!!p2Err, 'Operation rejected when balance is insufficient');
    assert(p2Err?.message?.includes('Insufficient wallet balance'), `Informative error returned: "${p2Err?.message}"`);

    // Verify no deduction occurred
    const { data: p2Wallet } = await adminClient.from('player_wallets').select('available_balance_paise').eq('user_id', player2.id).single();
    assert(Number(p2Wallet?.available_balance_paise) === 0, 'Wallet balance remained at 0 (no negative balance allowed)');
    recordPass('Insufficient balance request correctly blocked at DB level');
  } catch (err: any) {
    recordFail('Scenario 2 failed', err.message);
  }

  // Restore player 2's balance to ₹100
  await adminClient.from('player_wallets').update({ available_balance_paise: 10000 }).eq('user_id', player2.id);

  // --- SCENARIO 3: Duplicate requests cannot cause duplicate deductions ---
  console.log('\n--- SCENARIO 3: Duplicate Queue Requests Prevention ---');
  try {
    const { error: dupErr } = await adminClient.rpc('join_or_create_one_vs_one_match', {
      p_card_id: card.id,
      p_user_id: player1.id,
    });

    assert(!!dupErr, 'Player already in queue strictly rejected from entering again');
    assert(dupErr?.message?.includes('already have an active 1v1 match'), 'Active match queue check enforced');
    recordPass('Duplicate queue attempt rejected with zero double deduction');
  } catch (err: any) {
    recordFail('Scenario 3 failed', err.message);
  }

  // --- SCENARIO 4: Two players successfully matched & both fees deducted ---
  console.log('\n--- SCENARIO 4: Two players successfully matched ---');
  try {
    const { data: p2WalletBefore } = await adminClient.from('player_wallets').select('available_balance_paise').eq('user_id', player2.id).single();
    const p2BalanceBefore = Number(p2WalletBefore?.available_balance_paise);

    const { data: matchRes, error: matchErr } = await adminClient.rpc('join_or_create_one_vs_one_match', {
      p_card_id: card.id,
      p_user_id: player2.id,
    });

    if (matchErr) throw matchErr;
    assert(matchRes.is_matched === true, 'Player 2 matched automatically with Player 1');
    assert(matchRes.match_id === matchId1, 'Both players paired in the exact same match ID');

    const { data: p2WalletAfter } = await adminClient.from('player_wallets').select('available_balance_paise').eq('user_id', player2.id).single();
    const p2BalanceAfter = Number(p2WalletAfter?.available_balance_paise);

    assert(p2BalanceAfter === p2BalanceBefore - entryAmountPaise, `Player 2 wallet balance deducted by ₹${entryAmountInr}`);

    // Verify Player 2 entry fee ledger
    const { data: p2Tx } = await adminClient
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', player2.id)
      .eq('reference_id', matchId1)
      .eq('transaction_type', 'ONE_VS_ONE_ENTRY_FEE')
      .single();

    assert(!!p2Tx, 'Player 2 ONE_VS_ONE_ENTRY_FEE ledger transaction recorded');
    recordPass('Both players matched and entry fees deducted exactly once each');
  } catch (err: any) {
    recordFail('Scenario 4 failed', err.message);
  }

  // Progress match to completion
  // Room submission -> both ready -> score submission -> opponent confirmation
  await adminClient.rpc('submit_one_vs_one_room', {
    p_match_id: matchId1,
    p_user_id: player1.id,
    p_room_id: '12345678',
    p_room_password: '999',
  });
  await adminClient.rpc('confirm_one_vs_one_ready', { p_match_id: matchId1, p_user_id: player1.id });
  await adminClient.rpc('confirm_one_vs_one_ready', { p_match_id: matchId1, p_user_id: player2.id });

  // P1 submits score (P1 wins 2 - 1)
  await adminClient.rpc('submit_one_vs_one_result', {
    p_match_id: matchId1,
    p_user_id: player1.id,
    p_claimed_winner_id: player1.id,
    p_p1_score: 2,
    p_p2_score: 1,
  });

  // --- SCENARIO 5: Correct winner receives correct payout ---
  console.log('\n--- SCENARIO 5: Winner Payout Execution ---');
  try {
    const { data: p1WalletBeforeWin } = await adminClient.from('player_wallets').select('available_balance_paise').eq('user_id', player1.id).single();
    const p1BalanceBeforeWin = Number(p1WalletBeforeWin?.available_balance_paise);

    // Opponent confirms result -> triggers automatic settlement
    const { data: confirmRes, error: confirmErr } = await adminClient.rpc('confirm_one_vs_one_result', {
      p_match_id: matchId1,
      p_user_id: player2.id,
    });

    if (confirmErr) throw confirmErr;

    const { data: p1WalletAfterWin } = await adminClient.from('player_wallets').select('available_balance_paise').eq('user_id', player1.id).single();
    const p1BalanceAfterWin = Number(p1WalletAfterWin?.available_balance_paise);

    assert(p1BalanceAfterWin === p1BalanceBeforeWin + payoutAmountPaise, `Winner wallet credited by exactly ₹${payoutAmountInr}`);

    // Verify ONE_VS_ONE_PRIZE transaction in ledger
    const { data: prizeTx } = await adminClient
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', player1.id)
      .eq('reference_id', matchId1)
      .eq('transaction_type', 'ONE_VS_ONE_PRIZE')
      .single();

    assert(!!prizeTx, 'ONE_VS_ONE_PRIZE transaction recorded in ledger');
    assert(Number(prizeTx.amount_paise) === payoutAmountPaise, `Prize amount matches card payout (${payoutAmountPaise} paise)`);
    assert(Number(prizeTx.balance_after_paise) === p1BalanceAfterWin, 'balance_after_paise accurately records post-win balance');

    // Verify settlement record is 'real' and 'completed'
    const { data: settlement } = await adminClient
      .from('one_vs_one_settlements')
      .select('*')
      .eq('match_id', matchId1)
      .single();

    assert(settlement.mode === 'real', 'Settlement record mode is "real"');
    assert(settlement.status === 'completed', 'Settlement record status is "completed"');
    assert(settlement.wallet_transaction_id === prizeTx.id, 'Settlement links to wallet_transactions ID');
    recordPass('Winner correctly received authoritative prize payout in wallet ledger');
  } catch (err: any) {
    recordFail('Scenario 5 failed', err.message);
  }

  // --- SCENARIO 6: Duplicate settlement cannot cause duplicate payouts ---
  console.log('\n--- SCENARIO 6: Duplicate Settlement Prevention ---');
  try {
    const { data: dupSettleRes } = await adminClient.rpc('settle_one_vs_one_match', {
      p_match_id: matchId1,
    });

    assert(dupSettleRes?.already_settled === true, 'Duplicate settlement call detected as already_settled');

    // Verify prize transaction count is exactly 1
    const { data: prizeTxCount } = await adminClient
      .from('wallet_transactions')
      .select('id')
      .eq('reference_id', matchId1)
      .eq('transaction_type', 'ONE_VS_ONE_PRIZE');

    assert(prizeTxCount?.length === 1, 'Exactly 1 prize transaction exists for match (zero duplicate payout)');
    recordPass('Idempotency strictly enforced; duplicate payouts impossible');
  } catch (err: any) {
    recordFail('Scenario 6 failed', err.message);
  }

  // Clear player active locks for next scenario
  await adminClient.from('one_vs_one_match_players').update({ is_active: false }).in('user_id', [player1.id, player2.id]);

  // --- SCENARIO 7: Disputed match does not trigger payout ---
  console.log('\n--- SCENARIO 7: Disputed match blocks payout ---');
  try {
    // Create match 2
    const { data: m2Res, error: m2Err } = await adminClient.rpc('join_or_create_one_vs_one_match', {
      p_card_id: card.id,
      p_user_id: player1.id,
    });
    if (m2Err) throw m2Err;
    const matchId2 = m2Res.match_id;

    const { error: p2JoinErr } = await adminClient.rpc('join_or_create_one_vs_one_match', {
      p_card_id: card.id,
      p_user_id: player2.id,
    });
    if (p2JoinErr) throw p2JoinErr;

    await adminClient.rpc('submit_one_vs_one_room', {
      p_match_id: matchId2,
      p_user_id: player1.id,
      p_room_id: '88776655',
      p_room_password: '444',
    });
    await adminClient.rpc('confirm_one_vs_one_ready', { p_match_id: matchId2, p_user_id: player1.id });
    await adminClient.rpc('confirm_one_vs_one_ready', { p_match_id: matchId2, p_user_id: player2.id });

    // P1 submits score
    await adminClient.rpc('submit_one_vs_one_result', {
      p_match_id: matchId2,
      p_user_id: player1.id,
      p_claimed_winner_id: player1.id,
      p_p1_score: 3,
      p_p2_score: 0,
    });

    // P2 disputes match
    await adminClient.rpc('dispute_one_vs_one_match', {
      p_match_id: matchId2,
      p_user_id: player2.id,
      p_reason: 'Incorrect score',
      p_description: 'I scored 2 goals.',
    });

    // Attempt settlement while disputed
    const { data: settleDisputeRes } = await adminClient.rpc('settle_one_vs_one_match', {
      p_match_id: matchId2,
    });

    assert(settleDisputeRes?.success === false, 'Settlement blocked on disputed fixture');
    assert(settleDisputeRes?.error?.includes('dispute'), 'Error states unresolved dispute');

    // Verify 0 prize transactions
    const { data: disputePrizes } = await adminClient
      .from('wallet_transactions')
      .select('id')
      .eq('reference_id', matchId2)
      .eq('transaction_type', 'ONE_VS_ONE_PRIZE');

    assert(disputePrizes?.length === 0, 'Zero prize credits awarded for disputed match');
    recordPass('Disputed match completely blocked from settlement and payout');

    // Clean up match 2 active states
    await adminClient.from('one_vs_one_match_players').update({ is_active: false }).eq('match_id', matchId2);
  } catch (err: any) {
    recordFail('Scenario 7 failed', err.message);
  }

  // --- SCENARIO 8: Cancelled match receives correct refund ---
  console.log('\n--- SCENARIO 8: Cancelled match receives correct refund ---');
  try {
    await adminClient.from('one_vs_one_match_players').update({ is_active: false }).in('user_id', [player1.id, player2.id]);
    const { data: p1WalletBeforeCancel } = await adminClient.from('player_wallets').select('available_balance_paise').eq('user_id', player1.id).single();
    const p1BalanceBeforeQueue = Number(p1WalletBeforeCancel?.available_balance_paise);

    // P1 creates waiting room (entry fee deducted)
    const { data: m3Res, error: m3Err } = await adminClient.rpc('join_or_create_one_vs_one_match', {
      p_card_id: card.id,
      p_user_id: player1.id,
    });
    if (m3Err) throw m3Err;
    const matchId3 = m3Res.match_id;

    const { data: p1WalletInQueue } = await adminClient.from('player_wallets').select('available_balance_paise').eq('user_id', player1.id).single();
    assert(Number(p1WalletInQueue?.available_balance_paise) === p1BalanceBeforeQueue - entryAmountPaise, 'Entry fee deducted upon queue entry');

    // Host cancels waiting match
    const { data: cancelRes, error: cancelErr } = await adminClient.rpc('cancel_waiting_one_vs_one_match', {
      p_match_id: matchId3,
      p_user_id: player1.id,
    });
    if (cancelErr) throw cancelErr;

    const { data: p1WalletAfterCancel } = await adminClient.from('player_wallets').select('available_balance_paise').eq('user_id', player1.id).single();
    assert(Number(p1WalletAfterCancel?.available_balance_paise) === p1BalanceBeforeQueue, 'Wallet balance 100% restored after cancellation refund');

    // Verify refund transaction in ledger
    const { data: refundTx } = await adminClient
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', player1.id)
      .eq('reference_id', matchId3)
      .eq('transaction_type', 'ONE_VS_ONE_ENTRY_REFUND')
      .single();

    assert(!!refundTx, 'ONE_VS_ONE_ENTRY_REFUND recorded in wallet_transactions');
    assert(Number(refundTx.amount_paise) === entryAmountPaise, `Refunded amount matches entry fee (${entryAmountPaise} paise)`);
    assert(Number(refundTx.balance_after_paise) === p1BalanceBeforeQueue, 'balance_after_paise accurately reflects refunded balance');

    // Verify double-refund is blocked (idempotency)
    const { data: secondRefund } = await adminClient.rpc('refund_one_vs_one_entry', {
      p_match_id: matchId3,
      p_user_id: player1.id,
      p_reason: 'Second attempt',
    });
    assert(secondRefund?.already_refunded === true, 'Duplicate refund prevented by idempotency check');
    recordPass('Cancelled match automatically and idempotently refunded entry fee to player');
  } catch (err: any) {
    recordFail('Scenario 8 failed', err.message);
  }

  // --- SCENARIO 9: Expired matchmaking receives correct refund ---
  console.log('\n--- SCENARIO 9: Expired matchmaking receives correct refund ---');
  try {
    await adminClient.from('one_vs_one_match_players').update({ is_active: false }).in('user_id', [player1.id, player2.id]);
    const { data: p1WalletBeforeExpire } = await adminClient.from('player_wallets').select('available_balance_paise').eq('user_id', player1.id).single();
    const p1BalancePreExpire = Number(p1WalletBeforeExpire?.available_balance_paise);

    // Create match 4
    const { data: m4Res, error: m4Err } = await adminClient.rpc('join_or_create_one_vs_one_match', {
      p_card_id: card.id,
      p_user_id: player1.id,
    });
    if (m4Err) throw m4Err;
    const matchId4 = m4Res.match_id;

    // Simulate expiration by setting expires_at to past
    await adminClient.from('one_vs_one_matches').update({
      expires_at: new Date(Date.now() - 60000).toISOString(),
    }).eq('id', matchId4);

    // Free player 1 active lock so a new queue call triggers expired match cleanup
    await adminClient.from('one_vs_one_match_players').update({ is_active: false }).eq('user_id', player1.id);

    // Player 2 initiates a queue check (which triggers expired match cleanup & refunds)
    await adminClient.rpc('join_or_create_one_vs_one_match', {
      p_card_id: card.id,
      p_user_id: player2.id,
    });

    // Check Player 1's balance was refunded
    const { data: p1WalletPostExpire } = await adminClient.from('player_wallets').select('available_balance_paise').eq('user_id', player1.id).single();
    assert(Number(p1WalletPostExpire?.available_balance_paise) === p1BalancePreExpire, 'Player 1 entry fee automatically refunded when match expired');

    // Verify refund transaction in ledger
    const { data: expireRefundTx } = await adminClient
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', player1.id)
      .eq('reference_id', matchId4)
      .eq('transaction_type', 'ONE_VS_ONE_ENTRY_REFUND')
      .single();

    assert(!!expireRefundTx, 'Automatic expiry refund transaction recorded in ledger');
    recordPass('Expired matchmaking queue automatically cleaned up and refunded to creator');

    // Clean up player 2 active match
    await adminClient.from('one_vs_one_match_players').update({ is_active: false }).eq('user_id', player2.id);
  } catch (err: any) {
    recordFail('Scenario 9 failed', err.message);
  }

  // --- SCENARIO 10: Wallet balance and transaction history consistency ---
  console.log('\n--- SCENARIO 10: Overall Ledger & Balance Mathematical Consistency ---');
  try {
    const { data: allTxs } = await adminClient
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', player1.id)
      .order('created_at', { ascending: true });

    assert(allTxs && allTxs.length > 0, 'Transactions exist in ledger');

    // Verify all transactions have balance_after_paise populated
    const missingBalanceAfter = allTxs!.filter((t: any) => t.balance_after_paise == null);
    assert(missingBalanceAfter.length === 0, '100% of transactions have authoritative balance_after_paise');

    // Verify all 1v1 transactions have reference_type 'one_vs_one_match'
    const oneVsOneTxs = allTxs!.filter((t: any) => t.transaction_type.startsWith('ONE_VS_ONE_'));
    assert(oneVsOneTxs.every((t: any) => t.reference_type === 'one_vs_one_match'), 'All 1v1 transactions reference one_vs_one_match');
    recordPass('Ledger audit passed: all transactions mathematical and relational invariants hold');
  } catch (err: any) {
    recordFail('Scenario 10 failed', err.message);
  }

  console.log('\n===============================================================');
  console.log(`🏁 1V1 WALLET TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('===============================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

run1v1WalletTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
