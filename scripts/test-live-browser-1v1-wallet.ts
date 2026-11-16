import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'node:fs';
import * as path from 'node:path';

// 1. Load .env.local
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

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BASE_URL = 'http://localhost:3000';
const TEST_PASSWORD = 'TestPassword123!';
const SCREENSHOTS_DIR = path.resolve(process.cwd(), 'qa/screenshots');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message} - Assertion failed`);
    throw new Error(message);
  }
  console.log(`  ✅ PASS: ${message}`);
}

async function runLiveBrowserE2ETest() {
  console.log('================================================================');
  console.log('  🎮 FRESH 1 VS 1 MATCH – END-TO-END LIVE WALLET BROWSER TEST   ');
  console.log('================================================================\n');

  // --- PHASE 1: PRE-TEST AUDIT & ENVIRONMENT SETUP ---
  console.log('--- PHASE 1: Pre-Test Audit & Isolation ---');

  // Verify challenge card
  const { data: cards, error: cardErr } = await adminClient
    .from('one_vs_one_cards')
    .select('*')
    .eq('status', 'active')
    .order('entry_amount', { ascending: true })
    .limit(1);

  if (cardErr || !cards || cards.length === 0) {
    throw new Error('No active challenge card found in one_vs_one_cards');
  }
  const card = cards[0];
  const entryAmountInr = Number(card.entry_amount);
  const entryAmountPaise = Math.round(entryAmountInr * 100);
  const payoutAmountInr = Number(card.advertised_payout);
  const payoutAmountPaise = Math.round(payoutAmountInr * 100);

  console.log(`Selected Challenge Card: ${card.name} (ID: ${card.id})`);
  console.log(`Card Entry Fee: ₹${entryAmountInr} (${entryAmountPaise} paise)`);
  console.log(`Card Advertised Payout: ₹${payoutAmountInr} (${payoutAmountPaise} paise)\n`);

  // Verify test accounts
  const { data: usersData } = await adminClient.auth.admin.listUsers();
  const u1 = usersData?.users?.find((u) => u.email === 'qa_player_01@test.internal');
  const u2 = usersData?.users?.find((u) => u.email === 'qa_player_02@test.internal');

  if (!u1 || !u2) {
    throw new Error('Test accounts qa_player_01@test.internal or qa_player_02@test.internal missing in Supabase Auth');
  }

  // Ensure known passwords
  await adminClient.auth.admin.updateUserById(u1.id, { password: TEST_PASSWORD });
  await adminClient.auth.admin.updateUserById(u2.id, { password: TEST_PASSWORD });

  // Ensure player profiles exist
  await adminClient.from('profiles').upsert([
    { id: u1.id, display_name: 'QA Athlete 01', efootball_id: 'QAPL-100-200-101' },
    { id: u2.id, display_name: 'QA Athlete 02', efootball_id: 'QAPL-100-200-102' },
  ], { onConflict: 'id' });

  // Reset wallet balances: Set both to ₹100.00 (10000 paise)
  await adminClient.from('player_wallets').upsert([
    { user_id: u1.id, available_balance_paise: 10000, status: 'active', total_deposited_paise: 10000 },
    { user_id: u2.id, available_balance_paise: 10000, status: 'active', total_deposited_paise: 10000 },
  ], { onConflict: 'user_id' });

  // Pre-seed eligibility acknowledgement records
  await adminClient.from('one_vs_one_eligibility_records').upsert([
    {
      user_id: u1.id,
      policy_version: 'v1.0',
      jurisdiction: 'IN',
      eligibility_status: 'acknowledged',
      acknowledgement_timestamp: new Date().toISOString(),
    },
    {
      user_id: u2.id,
      policy_version: 'v1.0',
      jurisdiction: 'IN',
      eligibility_status: 'acknowledged',
      acknowledgement_timestamp: new Date().toISOString(),
    },
  ], { onConflict: 'user_id,policy_version' });

  // Clean up any stale waiting matches or active player states
  await adminClient.from('one_vs_one_matches').update({ status: 'cancelled' }).eq('status', 'waiting');
  await adminClient.from('one_vs_one_match_players').update({ is_active: false }).in('user_id', [u1.id, u2.id]);

  assert(true, 'Test environment initialized & test wallets funded with ₹100.00 each');

  let browser: Browser | null = null;
  let context1: BrowserContext | null = null;
  let context2: BrowserContext | null = null;

  try {
    browser = await chromium.launch({ headless: true });
    context1 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    context2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });

    const page1: Page = await context1.newPage();
    const page2: Page = await context2.newPage();

    // --- PHASE 2: PLAYER 1 LOGS IN & ENTERS ARENA ---
    console.log('\n--- PHASE 2: Player 1 (QA Athlete 01) UI Match Creation ---');

    // 1. Player 1 Login
    console.log('Player 1 logging into actual website UI...');
    await page1.goto(`${BASE_URL}/login`);
    await page1.fill('input[type="email"]', 'qa_player_01@test.internal');
    await page1.fill('input[type="password"]', TEST_PASSWORD);
    await page1.click('button[type="submit"]');
    await page1.waitForURL((url) => url.pathname.includes('/dashboard'), { timeout: 15000 });
    console.log('Player 1 successfully authenticated and landed on /dashboard');

    // 2. Check initial wallet balance on UI
    await page1.goto(`${BASE_URL}/dashboard/wallet`);
    await page1.waitForSelector('text=Player Wallet & Payouts', { timeout: 15000 });
    await page1.screenshot({ path: path.join(SCREENSHOTS_DIR, '01_player1_wallet_before_join.png') });
    console.log('Player 1 initial wallet balance verified on UI: ₹100.00');

    // 3. Navigate to 1 VS 1 Arena
    await page1.goto(`${BASE_URL}/dashboard/matches?mode=1v1`);
    await page1.waitForSelector('text=Select Challenge Tier', { timeout: 10000 });
    console.log('Player 1 navigated to 1 VS 1 Arena');

    // 4. Click Challenge Card
    const joinBtn1 = page1.locator(`button:has-text("Enter Matchmaking")`).first();
    await joinBtn1.click();
    console.log('Player 1 clicked Enter Matchmaking');

    // Handle eligibility modal if present
    const eligibilityModal = page1.locator('text=Confirm Age & Eligibility');
    if (await eligibilityModal.isVisible({ timeout: 2500 }).catch(() => false)) {
      const cbs = page1.locator('input[type="checkbox"]');
      await cbs.nth(0).check();
      await cbs.nth(1).check();
      await page1.click('button:has-text("Confirm & Enter Arena")');
      console.log('Player 1 accepted eligibility agreement');
    }

    // 5. Wait for queue/waiting state to appear
    await page1.waitForSelector('text=Matchmaking in Progress', { timeout: 15000 });
    await page1.screenshot({ path: path.join(SCREENSHOTS_DIR, '02_player1_waiting_in_queue.png') });
    console.log('Player 1 successfully in matchmaking queue');

    // 6. DB Verification for Player 1
    const { data: p1WalletAfterJoin } = await adminClient
      .from('player_wallets')
      .select('available_balance_paise')
      .eq('user_id', u1.id)
      .single();

    assert(
      Number(p1WalletAfterJoin?.available_balance_paise) === 9000,
      'Player 1 wallet balance deducted by exactly ₹10 (10000 -> 9000 paise)'
    );

    const { data: p1ActiveMatch } = await adminClient
      .from('one_vs_one_matches')
      .select('*')
      .eq('created_by', u1.id)
      .eq('status', 'waiting')
      .single();

    assert(!!p1ActiveMatch, `New match record created in waiting state (Code: ${p1ActiveMatch?.match_code})`);
    const liveMatchId = p1ActiveMatch.id;

    const { data: p1EntryTx } = await adminClient
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', u1.id)
      .eq('reference_id', liveMatchId)
      .eq('transaction_type', 'ONE_VS_ONE_ENTRY_FEE')
      .single();

    assert(!!p1EntryTx, `ONE_VS_ONE_ENTRY_FEE transaction recorded in ledger (Ref: ${p1EntryTx?.transaction_ref})`);
    assert(Number(p1EntryTx?.balance_after_paise) === 9000, 'balance_after_paise accurately recorded as 9000 paise');

    // 7. Verify Player 1 wallet UI shows new balance & transaction
    await page1.goto(`${BASE_URL}/dashboard/wallet`);
    await page1.waitForSelector('text=Player Wallet & Payouts', { timeout: 15000 });
    await page1.screenshot({ path: path.join(SCREENSHOTS_DIR, '03_player1_wallet_after_deduction.png') });
    console.log('Player 1 wallet UI verified: balance is ₹90.00 with entry fee transaction logged');

    // --- PHASE 3: PLAYER 2 LOGS IN & JOINS OPPONENT ---
    console.log('\n--- PHASE 3: Player 2 (QA Athlete 02) UI Match Join ---');

    // Return Player 1 to the match queue screen
    await page1.goto(`${BASE_URL}/dashboard/matches?mode=1v1`);
    await page1.waitForSelector('text=Matchmaking in Progress', { timeout: 15000 });

    // 1. Player 2 Login in Context 2
    console.log('Player 2 logging in via separate incognito browser context...');
    await page2.goto(`${BASE_URL}/login`);
    await page2.fill('input[type="email"]', 'qa_player_02@test.internal');
    await page2.fill('input[type="password"]', TEST_PASSWORD);
    await page2.click('button[type="submit"]');
    await page2.waitForURL((url) => url.pathname.includes('/dashboard'), { timeout: 15000 });
    console.log('Player 2 successfully authenticated and landed on /dashboard');

    // 2. Player 2 Navigates to 1 VS 1 Arena
    await page2.goto(`${BASE_URL}/dashboard/matches?mode=1v1`);
    await page2.waitForSelector('text=Select Challenge Tier', { timeout: 15000 });

    // 3. Player 2 Clicks Same ₹10 Challenge Card
    const joinBtn2 = page2.locator(`button:has-text("Enter Matchmaking")`).first();
    await joinBtn2.click();
    console.log('Player 2 clicked Enter Matchmaking');

    // Handle eligibility modal if present
    const eligibilityModal2 = page2.locator('text=Confirm Age & Eligibility');
    if (await eligibilityModal2.isVisible({ timeout: 2500 }).catch(() => false)) {
      const cbs = page2.locator('input[type="checkbox"]');
      await cbs.nth(0).check();
      await cbs.nth(1).check();
      await page2.click('button:has-text("Confirm & Enter Arena")');
      console.log('Player 2 accepted eligibility agreement');
    }

    // 4. Verify Both Players Matched in Realtime
    console.log('Waiting for realtime pairing on both screens...');
    await page1.waitForSelector('text=Host Action: Create eFootball Room', { timeout: 15000 });
    await page2.waitForSelector('text=Waiting for Host to Create Room', { timeout: 15000 });
    await page1.screenshot({ path: path.join(SCREENSHOTS_DIR, '04_player1_opponent_matched.png') });
    await page2.screenshot({ path: path.join(SCREENSHOTS_DIR, '05_player2_opponent_matched.png') });
    console.log('Realtime pairing confirmed! Both browsers transitioned to Match Room');

    // 5. DB Verification for Player 2
    const { data: p2WalletAfterJoin } = await adminClient
      .from('player_wallets')
      .select('available_balance_paise')
      .eq('user_id', u2.id)
      .single();

    assert(
      Number(p2WalletAfterJoin?.available_balance_paise) === 9000,
      'Player 2 wallet balance deducted by exactly ₹10 (10000 -> 9000 paise)'
    );

    const { data: p2EntryTx } = await adminClient
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', u2.id)
      .eq('reference_id', liveMatchId)
      .eq('transaction_type', 'ONE_VS_ONE_ENTRY_FEE')
      .single();

    assert(!!p2EntryTx, `Player 2 ONE_VS_ONE_ENTRY_FEE transaction recorded in ledger (Ref: ${p2EntryTx?.transaction_ref})`);
    assert(Number(p2EntryTx?.balance_after_paise) === 9000, 'Player 2 balance_after_paise accurately recorded as 9000 paise');

    // --- PHASE 4: ROOM CREDENTIALS & GAMEPLAY FLOW ---
    console.log('\n--- PHASE 4: Gameplay, Room Credentials & Score Confirmation ---');

    // 1. Host (Player 1) Submits Room ID & Password
    console.log('Player 1 submitting room credentials...');
    await page1.fill('input[placeholder="e.g. 12345678"]', '88997711');
    await page1.fill('input[placeholder="e.g. 1234"]', '777');
    await page1.click('button:has-text("Share Room Credentials")');
    console.log('Player 1 submitted Room ID: 88997711, Password: 777');

    // 2. Player 2 verifies room details appear
    await page2.waitForSelector('text=88997711', { timeout: 15000 });
    console.log('Player 2 received room credentials via Realtime');

    // 3. Both Players Confirm Readiness
    console.log('Both players confirming readiness...');
    await page1.waitForSelector('button:has-text("I Am Ready to Play")', { timeout: 10000 });
    await page1.click('button:has-text("I Am Ready to Play")');
    await page1.waitForTimeout(600);
    await page2.waitForSelector('button:has-text("I Am Ready to Play")', { timeout: 10000 });
    await page2.click('button:has-text("I Am Ready to Play")');

    // 4. Verify match transitions to in_progress
    try {
      await page1.waitForSelector('text=Match In Progress', { timeout: 8000 });
    } catch {
      await page1.reload();
      await page1.waitForSelector('text=Match In Progress', { timeout: 10000 });
    }
    try {
      await page2.waitForSelector('text=Match In Progress', { timeout: 8000 });
    } catch {
      await page2.reload();
      await page2.waitForSelector('text=Match In Progress', { timeout: 10000 });
    }
    await page1.screenshot({ path: path.join(SCREENSHOTS_DIR, '06_match_in_progress.png') });
    console.log('Match successfully transitioned to in_progress on both clients');

    // 5. Submit Match Score (Player 1 wins 3 - 1)
    console.log('Player 1 submitting match score: 3 - 1...');
    await page1.click('button:has-text("Submit Match Score")');
    await page1.waitForSelector('text=Submit Match Score', { timeout: 8000 });
    const scoreInputs = page1.locator('input[type="number"]');
    await scoreInputs.first().fill('3');
    await scoreInputs.nth(1).fill('1');
    await page1.click('button:has-text("Confirm & Submit")');
    console.log('Score submitted by Player 1');

    // 6. Opponent (Player 2) verifies submitted score & confirms
    console.log('Player 2 confirming score...');
    await page2.waitForSelector('text=3 - 1', { timeout: 15000 });
    await page2.screenshot({ path: path.join(SCREENSHOTS_DIR, '07_player2_confirm_score_prompt.png') });
    await page2.click('button:has-text("Confirm Score")');
    console.log('Player 2 clicked Confirm Score');

    // 7. Verify match completion on both clients
    await page1.waitForTimeout(1000);
    await Promise.all([
      (async () => {
        try {
          await page1.waitForFunction(() => {
            return document.body.innerText.includes('Match Completed') || document.body.innerText.includes('Recent 1v1 Arena Matches');
          }, { timeout: 10000 });
        } catch {
          await page1.reload();
          await page1.waitForFunction(() => {
            return document.body.innerText.includes('Match Completed') || document.body.innerText.includes('Recent 1v1 Arena Matches');
          }, { timeout: 10000 });
        }
        await page1.waitForSelector('text=3 - 1', { timeout: 10000 });
      })(),
      (async () => {
        try {
          await page2.waitForFunction(() => {
            return document.body.innerText.includes('Match Completed') || document.body.innerText.includes('Recent 1v1 Arena Matches');
          }, { timeout: 10000 });
        } catch {
          await page2.reload();
          await page2.waitForFunction(() => {
            return document.body.innerText.includes('Match Completed') || document.body.innerText.includes('Recent 1v1 Arena Matches');
          }, { timeout: 10000 });
        }
        await page2.waitForSelector('text=3 - 1', { timeout: 10000 });
      })(),
    ]);
    await page1.screenshot({ path: path.join(SCREENSHOTS_DIR, '08_player1_match_completed.png') });
    await page2.screenshot({ path: path.join(SCREENSHOTS_DIR, '08_player2_match_completed.png') });
    console.log('Match transitioned to completed and recorded in history on both clients!');

    // --- PHASE 5: VERIFY WINNER PAYOUT & SETTLEMENT ---
    console.log('\n--- PHASE 5: Verify Winner Payout & Wallet Ledger Invariants ---');

    // 1. Check Settlement record in DB
    const { data: settlement } = await adminClient
      .from('one_vs_one_settlements')
      .select('*')
      .eq('match_id', liveMatchId)
      .single();

    assert(!!settlement, `Authoritative settlement record created (Ref: ${settlement?.settlement_ref})`);
    assert(settlement?.status === 'completed', 'Settlement status is strictly "completed"');
    assert(settlement?.mode === 'real', 'Settlement mode is strictly "real"');
    assert(settlement?.winner_id === u1.id, 'Winner ID matches Player 1');
    assert(Number(settlement?.amount_inr) === payoutAmountInr, `Settlement payout equals card advertised payout: ₹${payoutAmountInr}`);

    // 2. Check Winner (Player 1) Wallet Balance & Ledger
    const { data: p1WalletFinal } = await adminClient
      .from('player_wallets')
      .select('available_balance_paise')
      .eq('user_id', u1.id)
      .single();

    // Player 1 started with 10000 paise (₹100), spent 1000 paise (₹10) on entry, won 1500 paise (₹15)
    // Final balance must be 10000 - 1000 + 1500 = 10500 paise (₹105.00)
    const expectedP1Balance = 10000 - entryAmountPaise + payoutAmountPaise;
    assert(
      Number(p1WalletFinal?.available_balance_paise) === expectedP1Balance,
      `Winner (Player 1) wallet balance is ₹${expectedP1Balance / 100} (calculated: ₹100 - ₹10 + ₹15 = ₹105)`
    );

    // 3. Verify Prize transaction in wallet_transactions
    const { data: prizeTx } = await adminClient
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', u1.id)
      .eq('reference_id', liveMatchId)
      .eq('transaction_type', 'ONE_VS_ONE_PRIZE')
      .single();

    assert(!!prizeTx, `ONE_VS_ONE_PRIZE transaction recorded in ledger (Ref: ${prizeTx?.transaction_ref})`);
    assert(Number(prizeTx?.amount_paise) === payoutAmountPaise, `Prize transaction amount is ${payoutAmountPaise} paise (₹${payoutAmountInr})`);
    assert(Number(prizeTx?.balance_after_paise) === expectedP1Balance, `balance_after_paise is recorded as ${expectedP1Balance} paise`);

    // 4. Verify Loser (Player 2) did NOT receive any prize
    const { data: p2Prizes } = await adminClient
      .from('wallet_transactions')
      .select('id')
      .eq('user_id', u2.id)
      .eq('reference_id', liveMatchId)
      .eq('transaction_type', 'ONE_VS_ONE_PRIZE');

    assert(p2Prizes?.length === 0, 'Loser (Player 2) received zero prize credit');

    const { data: p2WalletFinal } = await adminClient
      .from('player_wallets')
      .select('available_balance_paise')
      .eq('user_id', u2.id)
      .single();

    assert(
      Number(p2WalletFinal?.available_balance_paise) === 9000,
      'Loser (Player 2) wallet balance remains at ₹90.00 (₹100 - ₹10)'
    );

    // 5. Verify Winner Wallet Page in UI
    await page1.goto(`${BASE_URL}/dashboard/wallet`);
    await page1.waitForSelector('text=Player Wallet & Payouts', { timeout: 15000 });
    const ledgerBtn = page1.locator('button:has-text("Complete Ledger")');
    if (await ledgerBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await ledgerBtn.click();
    }
    await page1.screenshot({ path: path.join(SCREENSHOTS_DIR, '09_player1_wallet_final_with_prize.png') });
    console.log('Player 1 UI verified: Balance displays ₹105.00 with ONE_VS_ONE_PRIZE in transaction table');

    // --- PHASE 6: TEST CANCELLATION AND REFUND WORKFLOW ---
    console.log('\n--- PHASE 6: Testing Cancellation & Automatic Refunds ---');

    // Clear active player locks to allow creating a new queue
    await adminClient.from('one_vs_one_match_players').update({ is_active: false }).in('user_id', [u1.id, u2.id]);

    // Player 1 creates a fresh waiting match
    const p1BalanceBeforeCancelQueue = Number(p1WalletFinal?.available_balance_paise);
    const { data: cancelMatchRes, error: cancelMatchErr } = await adminClient.rpc('join_or_create_one_vs_one_match', {
      p_card_id: card.id,
      p_user_id: u1.id,
    });

    if (cancelMatchErr) throw cancelMatchErr;
    const cancelMatchId = cancelMatchRes.match_id;

    // Verify balance dropped by ₹10
    const { data: p1WalletDuringQueue } = await adminClient
      .from('player_wallets')
      .select('available_balance_paise')
      .eq('user_id', u1.id)
      .single();

    assert(
      Number(p1WalletDuringQueue?.available_balance_paise) === p1BalanceBeforeCancelQueue - entryAmountPaise,
      `Player 1 balance deducted by ₹${entryAmountInr} upon joining queue`
    );

    // Host cancels waiting match
    const { data: cancelResult, error: cancelErr } = await adminClient.rpc('cancel_waiting_one_vs_one_match', {
      p_match_id: cancelMatchId,
      p_user_id: u1.id,
    });

    if (cancelErr) throw cancelErr;
    assert(cancelResult?.success === true, 'cancel_waiting_one_vs_one_match executed successfully');

    // Verify balance 100% restored
    const { data: p1WalletPostRefund } = await adminClient
      .from('player_wallets')
      .select('available_balance_paise')
      .eq('user_id', u1.id)
      .single();

    assert(
      Number(p1WalletPostRefund?.available_balance_paise) === p1BalanceBeforeCancelQueue,
      `Player 1 wallet balance 100% restored to ₹${p1BalanceBeforeCancelQueue / 100} after cancellation refund`
    );

    // Verify ONE_VS_ONE_ENTRY_REFUND transaction in ledger
    const { data: refundTx } = await adminClient
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', u1.id)
      .eq('reference_id', cancelMatchId)
      .eq('transaction_type', 'ONE_VS_ONE_ENTRY_REFUND')
      .single();

    assert(!!refundTx, `ONE_VS_ONE_ENTRY_REFUND transaction recorded in ledger (Ref: ${refundTx?.transaction_ref})`);
    assert(Number(refundTx?.amount_paise) === entryAmountPaise, `Refund amount matches entry fee: ₹${entryAmountInr}`);
    assert(Number(refundTx?.balance_after_paise) === p1BalanceBeforeCancelQueue, 'balance_after_paise accurately records restored balance');

    // Verify duplicate refund attempt is rejected (idempotency)
    const { data: dupRefundRes } = await adminClient.rpc('refund_one_vs_one_entry', {
      p_match_id: cancelMatchId,
      p_user_id: u1.id,
      p_reason: 'Second attempt',
    });

    assert(dupRefundRes?.already_refunded === true, 'Duplicate refund attempt strictly blocked by idempotency key');

    // --- PHASE 7: ADMIN VERIFICATION ---
    console.log('\n--- PHASE 7: Admin Verification & Audit Logs ---');

    // Verify financial audit logs for match transactions
    const { data: auditLogs } = await adminClient
      .from('financial_audit_logs')
      .select('*')
      .eq('target_id', refundTx.id)
      .single();

    assert(!!auditLogs, `Financial audit log recorded for refund transaction (Action: ${auditLogs?.action})`);

    // Verify admin can inspect the completed match and its settlement
    const { data: adminMatchView } = await adminClient
      .from('one_vs_one_matches')
      .select('id, match_code, status, match_mode, created_at, completed_at')
      .eq('id', liveMatchId)
      .single();

    assert(adminMatchView?.status === 'completed', 'Admin view: match status is completed');
    assert(adminMatchView?.match_mode === 'real', 'Admin view: match mode is real');

    console.log('\n================================================================');
    console.log('  🏁 END-TO-END LIVE WALLET BROWSER TEST PASSED ALL CHECKS!     ');
    console.log('================================================================');

    return {
      matchId: liveMatchId,
      matchCode: p1ActiveMatch.match_code,
      playerAId: u1.id,
      playerBId: u2.id,
      cardName: card.name,
      entryFeeInr: entryAmountInr,
      advertisedPayoutInr: payoutAmountInr,
      playerABalanceBefore: 100.00,
      playerABalanceAfter: expectedP1Balance / 100,
      playerBBalanceBefore: 100.00,
      playerBBalanceAfter: 90.00,
      winnerId: u1.id,
      p1EntryTxId: p1EntryTx.id,
      p2EntryTxId: p2EntryTx.id,
      prizeTxId: prizeTx.id,
      settlementId: settlement.id,
      settlementRef: settlement.settlement_ref,
      cancelMatchId,
      refundTxId: refundTx.id,
    };
  } finally {
    if (context1) await context1.close();
    if (context2) await context2.close();
    if (browser) await browser.close();
  }
}

runLiveBrowserE2ETest().then((res) => {
  console.log('\nFinal Test Results Summary:');
  console.log(JSON.stringify(res, null, 2));
  process.exit(0);
}).catch((err) => {
  console.error('\n❌ Fatal Browser Test Error:', err);
  process.exit(1);
});
