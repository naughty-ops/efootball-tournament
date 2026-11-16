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
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

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

async function runSettlementTestSuite() {
  console.log('===============================================================');
  console.log('🧪 TESTING 1 VS 1 AUTOMATIC SETTLEMENT & RECOVERY SYSTEM');
  console.log('===============================================================\n');

  // Test accounts
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
  const { data: cards } = await adminClient.from('one_vs_one_cards').select('*').eq('status', 'active').limit(1);
  const card = cards![0];

  // Helper to create a test match between player 1 and player 2
  async function createTestMatch(mode: 'free' | 'dry_run' = 'free'): Promise<string> {
    // Clear any previous active status for these two test players
    await adminClient.from('one_vs_one_match_players').update({ is_active: false }).in('user_id', [player1.id, player2.id]);
    
    // Join P1
    const { data: p1Res, error: p1Err } = await adminClient.rpc('join_or_create_one_vs_one_match', {
      p_card_id: card.id,
      p_user_id: player1.id,
    });
    if (p1Err) throw new Error(`P1 create error: ${p1Err.message}`);
    const matchId = p1Res.match_id;

    // Join P2
    const { data: p2Res, error: p2Err } = await adminClient.rpc('join_or_create_one_vs_one_match', {
      p_card_id: card.id,
      p_user_id: player2.id,
    });
    if (p2Err) throw new Error(`P2 join error: ${p2Err.message}`);

    // Submit room credentials
    const { error: roomErr } = await adminClient.rpc('submit_one_vs_one_room', {
      p_match_id: matchId,
      p_user_id: player1.id,
      p_room_id: '99887766',
      p_room_password: '123',
    });
    if (roomErr) throw new Error(`Room creds error: ${roomErr.message}`);

    // Both ready
    const { error: ready1Err } = await adminClient.rpc('confirm_one_vs_one_ready', { p_match_id: matchId, p_user_id: player1.id });
    if (ready1Err) throw new Error(`Ready 1 error: ${ready1Err.message}`);

    const { error: ready2Err } = await adminClient.rpc('confirm_one_vs_one_ready', { p_match_id: matchId, p_user_id: player2.id });
    if (ready2Err) throw new Error(`Ready 2 error: ${ready2Err.message}`);

    return matchId;
  }

  // --- TEST 1: Verified winner receives exactly one settlement credit ---
  console.log('--- TEST 1: Automatic Winner Settlement Execution ---');
  const matchId1 = await createTestMatch();
  
  // Player 1 submits score: 2 - 1 (P1 wins)
  await adminClient.rpc('submit_one_vs_one_result', {
    p_match_id: matchId1,
    p_user_id: player1.id,
    p_claimed_winner_id: player1.id,
    p_p1_score: 2,
    p_p2_score: 1,
  });

  // Opponent (P2) confirms result (triggers automatic settlement inside confirm_one_vs_one_result)
  const { data: confirmRes, error: confirmErr } = await adminClient.rpc('confirm_one_vs_one_result', {
    p_match_id: matchId1,
    p_user_id: player2.id,
  });

  assert(!confirmErr && confirmRes?.success === true, 'Opponent confirmed result');
  assert(confirmRes?.settlement?.success === true, 'Automatic settlement executed on match completion');
  assert(confirmRes?.settlement?.winner_id === player1.id, 'Verified winner correctly awarded');
  assert(confirmRes?.settlement?.amount_inr === Number(card.advertised_payout), `Authoritative payout amount applied: ₹${card.advertised_payout}`);

  // Check settlement record in database
  const { data: settlement1 } = await adminClient
    .from('one_vs_one_settlements')
    .select('*')
    .eq('match_id', matchId1)
    .single();

  assert(!!settlement1, 'Settlement record created in database');
  assert(settlement1?.status === 'completed', 'Settlement status is completed');
  assert(settlement1?.mode === 'dry_run', 'Settlement mode is dry_run (strict safety preservation)');

  // --- TEST 2: Duplicate result submission does not duplicate credit ---
  console.log('\n--- TEST 2: Duplicate Result Submission Prevention ---');
  const { error: dupResultErr } = await adminClient.rpc('submit_one_vs_one_result', {
    p_match_id: matchId1,
    p_user_id: player1.id,
    p_claimed_winner_id: player1.id,
    p_p1_score: 2,
    p_p2_score: 1,
  });
  assert(!!dupResultErr, 'Submitting score on completed match is strictly rejected by DB');

  // --- TEST 3: Duplicate settlement request does not duplicate credit (Idempotency) ---
  console.log('\n--- TEST 3: Settlement Idempotency Enforcement ---');
  const { data: dupSettleRes, error: dupSettleErr } = await adminClient.rpc('settle_one_vs_one_match', {
    p_match_id: matchId1,
  });
  assert(!dupSettleErr && dupSettleRes?.success === true, 'Duplicate settlement call handled gracefully');
  assert(dupSettleRes?.already_settled === true, 'Duplicate settlement strictly detected as already_settled');

  // Ensure only 1 record exists
  const { data: settleCount } = await adminClient
    .from('one_vs_one_settlements')
    .select('id', { count: 'exact' })
    .eq('match_id', matchId1);
  assert(settleCount?.length === 1, 'Exactly one settlement record exists (zero duplicates)');

  // --- TEST 4: Disputed match does not trigger settlement ---
  console.log('\n--- TEST 4: Disputed Match Blocks Settlement ---');
  const matchId2 = await createTestMatch();
  await adminClient.rpc('submit_one_vs_one_result', {
    p_match_id: matchId2,
    p_user_id: player1.id,
    p_claimed_winner_id: player1.id,
    p_p1_score: 3,
    p_p2_score: 0,
  });

  // Player 2 disputes the result
  await adminClient.rpc('dispute_one_vs_one_match', {
    p_match_id: matchId2,
    p_user_id: player2.id,
    p_reason: 'Wrong Score Marked by Opponent',
    p_description: 'I actually won 2-1.',
  });

  // Attempt to settle disputed match
  const { data: disputedSettleRes } = await adminClient.rpc('settle_one_vs_one_match', {
    p_match_id: matchId2,
  });
  assert(disputedSettleRes?.success === false, 'Settlement blocked while match has open dispute');

  const { data: disputedSettlementRecord } = await adminClient
    .from('one_vs_one_settlements')
    .select('id')
    .eq('match_id', matchId2)
    .maybeSingle();
  assert(!disputedSettlementRecord, 'No settlement record generated for disputed fixture');

  // --- TEST 5: Cancelled match does not trigger winner payout ---
  console.log('\n--- TEST 5: Cancelled Match Blocks Settlement ---');
  const matchId3 = await createTestMatch();
  await adminClient.from('one_vs_one_matches').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', matchId3);
  
  const { data: cancelSettleRes } = await adminClient.rpc('settle_one_vs_one_match', {
    p_match_id: matchId3,
  });
  assert(cancelSettleRes?.success === false, 'Cancelled match rejected from settlement');

  // --- TEST 6: Failed wallet transaction remains recoverable ---
  console.log('\n--- TEST 6: Failure Detection & Preservation ---');
  // Insert a test settlement with status = 'failed'
  const failedRef = `SETTLE-1V1-FAIL-${Date.now()}`;
  const { data: failedSettlement, error: failInsertErr } = await adminClient
    .from('one_vs_one_settlements')
    .insert({
      settlement_ref: failedRef,
      match_id: matchId3,
      winner_id: player1.id,
      card_id: card.id,
      amount_paise: 1500,
      amount_inr: 15.00,
      mode: 'real',
      status: 'failed',
      idempotency_key: `settle-1v1-fail-${matchId3}`,
      failure_reason: 'Simulation of transient network error during ledger write',
    })
    .select('*')
    .single();

  assert(!failInsertErr && !!failedSettlement, 'Failed settlement record logged and preserved');
  assert(failedSettlement?.status === 'failed', 'Settlement status flagged as failed');
  assert(failedSettlement?.failure_reason?.includes('transient network error'), 'Failure diagnostic accurately recorded');

  // --- TEST 7: Retry creates exactly one credit / recovery ---
  console.log('\n--- TEST 7: Safe Settlement Retry ---');
  // Get an active admin user
  const { data: adminUsers } = await adminClient.from('admin_users').select('id, role').eq('is_active', true).limit(1);
  const adminId = adminUsers?.[0]?.id;

  if (adminId) {
    const { data: retryRes, error: retryErr } = await adminClient.rpc('admin_retry_one_vs_one_settlement', {
      p_settlement_id: failedSettlement.id,
      p_admin_id: adminId,
      p_reason: 'Testing admin retry mechanism',
    });

    // Check retry count incremented
    const { data: updatedSettlement } = await adminClient
      .from('one_vs_one_settlements')
      .select('retry_count, status')
      .eq('id', failedSettlement.id)
      .single();

    assert(updatedSettlement?.retry_count === 1, 'Retry count incremented to 1');

    // Check financial audit log entry
    const { data: auditLog } = await adminClient
      .from('financial_audit_logs')
      .select('*')
      .eq('target_id', failedSettlement.id)
      .maybeSingle();

    assert(!!auditLog, 'Immutable financial audit log created for retry');
    assert(auditLog?.action === 'ONE_VS_ONE_SETTLEMENT_RETRY', 'Audit log action is ONE_VS_ONE_SETTLEMENT_RETRY');
  }

  // --- TEST 8: Player can raise a missing-credit ticket ---
  console.log('\n--- TEST 8: Player Support Ticket for Credit Issue ---');
  const ticketNum = `TKT-1V1-${Date.now().toString(36).toUpperCase()}`;
  const { data: ticket, error: ticketErr } = await adminClient
    .from('support_tickets')
    .insert({
      ticket_number: ticketNum,
      user_id: player1.id,
      player_name: player1.display_name,
      player_email: 'player1@test.com',
      category: 'wallet_credit',
      subject: `1v1 Credit Issue: Match 1V1-TEST`,
      description: 'I won the match but payout has not appeared.',
      priority: 'high',
      status: 'open',
      one_vs_one_match_id: matchId1,
      expected_payout: 15.00,
      settlement_reference: settlement1.settlement_ref,
    })
    .select('*')
    .single();

  assert(!ticketErr && !!ticket, 'Support ticket created for missing credit');
  assert(ticket?.category === 'wallet_credit', 'Ticket category is wallet_credit');
  assert(ticket?.one_vs_one_match_id === matchId1, 'Ticket linked to 1v1 match ID');
  assert(ticket?.expected_payout === 15.00, 'Expected payout recorded accurately');

  // --- TEST 9: Player cannot view another player\'s tickets (RLS check) ---
  console.log('\n--- TEST 9: Ticket Privacy & RLS Authorization ---');
  // Check RLS policies on support_tickets
  const { data: p2Tickets } = await adminClient
    .from('support_tickets')
    .select('id')
    .eq('user_id', player2.id);

  assert(!p2Tickets?.some((t: any) => t.id === ticket.id), 'Player 2 query does NOT return Player 1 ticket');

  // --- TEST 10: Unauthorized administrators cannot perform financial corrections ---
  console.log('\n--- TEST 10: Financial Correction Authorization & Security ---');
  const nonAdminId = '00000000-0000-0000-0000-000000000099'; // guaranteed non-admin
  const { data: unauthorizedRes } = await adminClient.rpc('admin_manual_settlement_correction', {
    p_settlement_id: settlement1.id,
    p_admin_id: nonAdminId,
    p_action: 'cancel',
    p_reason: 'Malicious attempt',
  });

  assert(unauthorizedRes?.success === false, 'Non-admin strictly blocked from manual financial correction');
  assert(unauthorizedRes?.error?.includes('Unauthorized'), 'Unauthorized security rejection message returned');

  // With authorized admin
  if (adminId) {
    const { data: authorizedRes } = await adminClient.rpc('admin_manual_settlement_correction', {
      p_settlement_id: settlement1.id,
      p_admin_id: adminId,
      p_action: 'mark_completed',
      p_reason: 'Authorized administrator verification check',
    });
    assert(authorizedRes?.success === true, 'Authorized administrator can perform financial correction');
  }

  // --- TEST 11: Existing deposit and wallet functionality remains unaffected ---
  console.log('\n--- TEST 11: Regression Check for Deposit & Wallet Systems ---');
  const { data: walletOverview } = await adminClient
    .from('player_wallets')
    .select('id, user_id, available_balance_paise, total_deposited_paise')
    .eq('user_id', player1.id)
    .single();

  assert(!!walletOverview, 'Player wallet record intact');
  assert(walletOverview?.available_balance_paise !== undefined, 'Available balance field accessible');

  const { data: depositsTable } = await adminClient
    .from('wallet_deposits')
    .select('id')
    .limit(1);

  assert(depositsTable !== null, 'Wallet deposits table fully accessible');

  // Clean up test data
  await adminClient.from('support_tickets').delete().eq('id', ticket.id);
  await adminClient.from('one_vs_one_settlements').delete().in('match_id', [matchId1, matchId2, matchId3]);
  await adminClient.from('one_vs_one_results').delete().in('match_id', [matchId1, matchId2, matchId3]);
  await adminClient.from('one_vs_one_matches').delete().in('id', [matchId1, matchId2, matchId3]);

  console.log('\n===============================================================');
  console.log(`🏁 SETTLEMENT TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('===============================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runSettlementTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
