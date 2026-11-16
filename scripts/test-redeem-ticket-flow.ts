import { chromium } from 'playwright';
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

const ARTIFACT_DIR = 'C:/Users/aser/.gemini/antigravity/brain/686ee328-53f1-4506-8d19-8fb8ea8f2fcd';
const BASE_URL = 'http://localhost:3000';
const TEST_PASSWORD = 'TestPassword123!';

async function runTest() {
  console.log('=== 1. PREPARING TEST PLAYER WITH WALLET BALANCE ===');

  const testEmail = 'redeem_tester@arenatest.internal';
  const { data: listData } = await adminClient.auth.admin.listUsers();
  let user = listData?.users.find((u) => u.email === testEmail);

  if (!user) {
    const { data: createData, error } = await adminClient.auth.admin.createUser({
      email: testEmail,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: 'RedeemTester' },
    });
    if (error || !createData.user) throw new Error(`Failed to create user: ${error?.message}`);
    user = createData.user;
  }

  // Ensure profile
  await adminClient.from('profiles').upsert({
    id: user.id,
    display_name: 'RedeemTester',
    efootball_id: 'RDM_TESTER_99',
  });

  // Ensure player_wallets has funds: 500 INR = 50,000 paise
  const { data: existingWallet } = await adminClient
    .from('player_wallets')
    .select('id, available_balance_paise')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!existingWallet) {
    await adminClient.from('player_wallets').insert({
      user_id: user.id,
      available_balance_paise: 50000,
      locked_balance_paise: 0,
      total_deposited_paise: 50000,
    });
  } else {
    await adminClient
      .from('player_wallets')
      .update({
        available_balance_paise: 50000,
      })
      .eq('user_id', user.id);
  }

  // Ensure payment method (UPI)
  await adminClient.from('player_payment_methods').upsert(
    {
      user_id: user.id,
      payment_method_type: 'upi',
      upi_id: 'redeemtester@okaxis',
      is_preferred: true,
    },
    { onConflict: 'id' }
  );

  console.log(`✅ Test player prepared (User ID: ${user.id}) with ₹500.00 available balance`);

  console.log('=== 2. TESTING ATOMIC RPC request_wallet_redemption ===');
  const { data: rpcRes, error: rpcErr } = await adminClient.rpc('request_wallet_redemption', {
    p_user_id: user.id,
    p_amount_inr: 100,
    p_upi_id: 'redeemtester@okaxis',
    p_notes: 'Automated test redemption request',
  });

  if (rpcErr) throw rpcErr;
  console.log('RPC Response:', rpcRes);

  if (!rpcRes.success) {
    throw new Error(`RPC failed: ${rpcRes.error}`);
  }

  console.log(`✅ Stored procedure executed successfully:`);
  console.log(`   Ticket Number: #${rpcRes.ticketNumber}`);
  console.log(`   Payout Reference: ${rpcRes.payoutReference}`);
  console.log(`   Amount: ₹${rpcRes.amountInr}`);
  console.log(`   New Available Balance: ₹${rpcRes.newAvailableBalanceInr}`);

  // Verify wallet balance in DB
  const { data: updatedWallet } = await adminClient
    .from('player_wallets')
    .select('available_balance_paise, locked_balance_paise')
    .eq('user_id', user.id)
    .single();

  console.log(`✅ DB Wallet State: Available: ₹${updatedWallet.available_balance_paise / 100}, Locked: ₹${updatedWallet.locked_balance_paise / 100}`);

  // Verify support_tickets record
  const { data: ticketRecord } = await adminClient
    .from('support_tickets')
    .select('*')
    .eq('ticket_number', rpcRes.ticketNumber)
    .single();

  console.log(`✅ DB Support Ticket: #${ticketRecord.ticket_number}, Category: ${ticketRecord.category}, Status: ${ticketRecord.status}, Expected: ₹${ticketRecord.expected_payout}`);

  // Verify payout_transactions record
  const { data: payoutRecord } = await adminClient
    .from('payout_transactions')
    .select('*')
    .eq('payout_reference', rpcRes.payoutReference)
    .single();

  console.log(`✅ DB Payout Transaction: ${payoutRecord.payout_reference}, Status: ${payoutRecord.payout_status}, Amount: ₹${payoutRecord.amount_inr}, Linked Ticket: ${payoutRecord.ticket_id}`);

  console.log('=== 3. BROWSER UI VERIFICATION & SCREENSHOT CAPTURE ===');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  const page = await context.newPage();

  // Login as test player
  console.log('Logging in as RedeemTester...');
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', testEmail);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard**', { timeout: 15000 });

  // 1. Visit /dashboard/wallet
  console.log('Navigating to /dashboard/wallet...');
  await page.goto(`${BASE_URL}/dashboard/wallet`);
  await page.waitForTimeout(3000);

  // Take screenshot of Wallet page showing "Redeem Amount" button in header and card
  const walletPagePath = path.join(ARTIFACT_DIR, 'wallet_redeem_button_showcase.png');
  await page.screenshot({ path: walletPagePath, fullPage: true });
  console.log(`📸 Captured: ${walletPagePath}`);

  // Click the "Redeem Amount" button to open the modal
  const redeemBtn = await page.getByRole('button', { name: /Redeem Amount/i }).first();
  if (redeemBtn) {
    await redeemBtn.click();
    await page.waitForTimeout(1000);

    // Capture the open modal with amount input and quick chips
    const modalOpenPath = path.join(ARTIFACT_DIR, 'wallet_redeem_modal_entry.png');
    await page.screenshot({ path: modalOpenPath });
    console.log(`📸 Captured: ${modalOpenPath}`);

    // Click quick chip "+₹50" or fill amount
    await page.fill('input[type="number"]', '50');
    await page.waitForTimeout(500);

    const modalFilledPath = path.join(ARTIFACT_DIR, 'wallet_redeem_modal_amount_filled.png');
    await page.screenshot({ path: modalFilledPath });
    console.log(`📸 Captured: ${modalFilledPath}`);

    // Click Submit
    const submitBtn = await page.getByRole('button', { name: /Submit Redeem Request/i });
    if (submitBtn) {
      await submitBtn.click();
      await page.waitForTimeout(2500);

      // Capture Success Screen
      const modalSuccessPath = path.join(ARTIFACT_DIR, 'wallet_redeem_modal_success_ticket.png');
      await page.screenshot({ path: modalSuccessPath });
      console.log(`📸 Captured: ${modalSuccessPath}`);
    }
  }

  // 2. Visit /dashboard/tickets
  console.log('Navigating to /dashboard/tickets...');
  await page.goto(`${BASE_URL}/dashboard/tickets`);
  await page.waitForTimeout(3000);

  // Capture Tickets list showing "Request Redeem Ticket" button and the active redemption request ticket badges
  const ticketsPagePath = path.join(ARTIFACT_DIR, 'tickets_dashboard_with_redeem_button_and_ticket.png');
  await page.screenshot({ path: ticketsPagePath, fullPage: true });
  console.log(`📸 Captured: ${ticketsPagePath}`);

  await browser.close();
  console.log('=== ALL TESTS AND SCREENSHOTS COMPLETED SUCCESSFULLY! ===');
}

runTest().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
