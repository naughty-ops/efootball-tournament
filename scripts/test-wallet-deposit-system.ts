import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';

// Mock server-only before any other imports
const req = createRequire(import.meta.url);
const Module = req('module');
const origRequire = Module.prototype.require;

Module.prototype.require = function (id: string, ...args: any[]) {
  if (id === 'server-only') return {};
  if (id === 'next/cache') return { revalidatePath: () => {} };
  return origRequire.apply(this, [id, ...args]);
};

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

if (!process.env.WALLET_ENCRYPTION_SECRET) {
  process.env.WALLET_ENCRYPTION_SECRET = 'efootball_wallet_secure_aes_256_gcm_production_secret_2026_x89f';
}

async function runTests() {
  console.log('===============================================================');
  console.log('🧪 TESTING QR CODE + UPI MANUAL DEPOSIT & LEDGER SYSTEM');
  console.log('===============================================================\n');

  const { createAdminClient } = await import('../lib/supabase/admin');
  const adminClient = createAdminClient();

  const {
    getOrCreatePlayerWallet,
    getPlayerWalletOverview,
    getWalletPaymentSettings,
    updateWalletPaymentSettings,
    createWalletDepositRequest,
    adminApproveDeposit,
    adminRejectDeposit,
    getPlayerWalletDeposits,
    getAdminWalletDeposits,
  } = await import('../services/walletService');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${msg}`);
      failed++;
    }
  }

  // 1. Verify Storage Buckets
  console.log('\n--- TEST 1: Supabase Storage Buckets ---');
  const { data: buckets } = await adminClient.storage.listBuckets();
  const proofsBucket = buckets?.find((b: any) => b.id === 'payment-proofs');
  const assetsBucket = buckets?.find((b: any) => b.id === 'payment-assets');

  assert(!!proofsBucket, 'Bucket payment-proofs exists');
  assert(proofsBucket?.public === false, 'Bucket payment-proofs is PRIVATE');
  assert(!!assetsBucket, 'Bucket payment-assets exists');
  assert(assetsBucket?.public === true, 'Bucket payment-assets is PUBLIC');

  // 2. Get active user and wallet
  console.log('\n--- TEST 2: User & Wallet Verification ---');
  const { data: users } = await adminClient.from('profiles').select('id, display_name').limit(2);
  if (!users || users.length < 2) {
    throw new Error('Need at least 2 users (player and admin) for tests');
  }

  const testPlayer = users[0];
  const testAdmin = users[1];
  console.log(`  Target Player: ${testPlayer.display_name} (${testPlayer.id})`);
  console.log(`  Target Admin: ${testAdmin.display_name} (${testAdmin.id})`);

  const wallet = await getOrCreatePlayerWallet(testPlayer.id);
  assert(!!wallet && !!wallet.id, `Player wallet verified (id: ${wallet.id})`);

  const initialOverview = await getPlayerWalletOverview(testPlayer.id);
  const initialAvailablePaise = initialOverview.availableBalancePaise;
  const initialDepositedPaise = initialOverview.totalDepositedPaise;
  console.log(`  Initial Available: ₹${initialOverview.availableBalanceInr} (${initialAvailablePaise} paise)`);
  console.log(`  Initial Deposited: ₹${initialOverview.totalDepositedInr} (${initialDepositedPaise} paise)`);

  // 3. Payment Settings Retrieval & Update
  console.log('\n--- TEST 3: Wallet Payment Settings ---');
  const settings = await getWalletPaymentSettings(adminClient);
  assert(!!settings.upiId, `Default/Current UPI ID loaded: ${settings.upiId}`);
  assert(settings.minDepositInr === 10, 'Min deposit is ₹10');
  assert(settings.maxDepositInr === 2000, 'Max deposit is ₹2000');

  // 4. Amount Validation (₹10 - ₹2000 limit)
  console.log('\n--- TEST 4: Deposit Amount Limits Validation ---');
  const underMinRes = await createWalletDepositRequest({
    userId: testPlayer.id,
    amountInr: 5, // Below ₹10
    utrReference: '123456789012',
    proofImagePath: 'test/proof.png',
  });
  assert(!underMinRes.success && !!underMinRes.error, `Rejected deposit below minimum ₹10: "${underMinRes.error}"`);

  const overMaxRes = await createWalletDepositRequest({
    userId: testPlayer.id,
    amountInr: 2500, // Above ₹2000
    utrReference: '123456789012',
    proofImagePath: 'test/proof.png',
  });
  assert(!overMaxRes.success && !!overMaxRes.error, `Rejected deposit above maximum ₹2000: "${overMaxRes.error}"`);

  // 5. Create Valid Deposit Request
  console.log('\n--- TEST 5: Create Valid Deposit Request ---');
  const testUtr1 = '99' + Math.floor(1000000000 + Math.random() * 9000000000).toString();
  const testAmountInr = 150; // ₹150

  const depositRes1 = await createWalletDepositRequest({
    userId: testPlayer.id,
    amountInr: testAmountInr,
    utrReference: testUtr1,
    proofImagePath: `proofs/${testPlayer.id}/test_proof_1.jpg`,
  });

  assert(depositRes1.success && !!depositRes1.depositId, `Deposit request created (ID: ${depositRes1.depositId})`);
  assert(depositRes1.depositRef?.startsWith('DEP-') === true, `Reference format valid (${depositRes1.depositRef})`);

  // 6. Duplicate UTR Rejection
  console.log('\n--- TEST 6: Duplicate UTR Prevention ---');
  const dupRes = await createWalletDepositRequest({
    userId: testPlayer.id,
    amountInr: 100,
    utrReference: testUtr1, // Same UTR
    proofImagePath: `proofs/${testPlayer.id}/test_proof_dup.jpg`,
  });
  assert(!dupRes.success && dupRes.error?.includes('already been submitted') === true, `Duplicate active UTR rejected: "${dupRes.error}"`);

  // 7. Admin Approval & Atomic Balance Crediting
  console.log('\n--- TEST 7: Admin Deposit Approval & Atomic Balance Credit ---');
  const approveRes = await adminApproveDeposit({
    depositId: depositRes1.depositId!,
    adminId: testAdmin.id,
    adminNotes: 'Verified in bank statement #TEST-4421',
  });

  assert(approveRes.success, 'adminApproveDeposit stored procedure executed successfully');

  // Check updated wallet balance
  const postApproveOverview = await getPlayerWalletOverview(testPlayer.id);
  const expectedNewBalancePaise = initialAvailablePaise + 15000;
  const expectedNewDepositedPaise = initialDepositedPaise + 15000;

  assert(
    postApproveOverview.availableBalancePaise === expectedNewBalancePaise,
    `Available balance incremented from ${initialAvailablePaise} to ${expectedNewBalancePaise} paise (₹${postApproveOverview.availableBalanceInr})`
  );
  assert(
    postApproveOverview.totalDepositedPaise === expectedNewDepositedPaise,
    `Total deposited incremented from ${initialDepositedPaise} to ${expectedNewDepositedPaise} paise`
  );

  // Check ledger entry
  const { data: transactions } = await adminClient
    .from('wallet_transactions')
    .select('*')
    .eq('reference_id', depositRes1.depositId)
    .order('created_at', { ascending: false });

  assert(transactions && transactions.length === 1, 'Ledger entry created in wallet_transactions');
  const ledgerEntry = transactions![0];
  assert(ledgerEntry.transaction_type === 'DEPOSIT_APPROVED', 'Ledger type is DEPOSIT_APPROVED');
  assert(ledgerEntry.reference_type === 'deposit', 'Reference type is deposit');
  assert(Number(ledgerEntry.amount_paise) === 15000, 'Ledger amount is 15000 paise');
  assert(
    Number(ledgerEntry.balance_after_paise) === expectedNewBalancePaise,
    `Ledger records accurate balance_after_paise (${ledgerEntry.balance_after_paise})`
  );

  // Check in-app notification
  const { data: notifications } = await adminClient
    .from('player_notifications')
    .select('*')
    .eq('user_id', testPlayer.id)
    .order('created_at', { ascending: false })
    .limit(1);

  assert(
    !!notifications &&
      notifications.length > 0 &&
      (notifications[0].title.includes('Wallet Credited') || notifications[0].title.includes('Deposit')),
    `In-app notification sent: "${notifications?.[0]?.title}"`
  );

  // 8. Idempotency Check (Duplicate Approval Prevention)
  console.log('\n--- TEST 8: Re-approval Idempotency Prevention ---');
  let duplicateApproveError = false;
  try {
    const res = await adminApproveDeposit({
      depositId: depositRes1.depositId!,
      adminId: testAdmin.id,
      adminNotes: 'Duplicate attempt',
    });
    if (!res.success) duplicateApproveError = true;
  } catch (err: any) {
    duplicateApproveError = true;
  }
  assert(duplicateApproveError, 'Attempting to re-approve an approved deposit is blocked');

  // 9. Deposit Rejection Flow
  console.log('\n--- TEST 9: Admin Deposit Rejection Flow ---');
  const testUtr2 = '98' + Math.floor(1000000000 + Math.random() * 9000000000).toString();
  const depositRes2 = await createWalletDepositRequest({
    userId: testPlayer.id,
    amountInr: 200,
    utrReference: testUtr2,
    proofImagePath: `proofs/${testPlayer.id}/test_proof_reject.jpg`,
  });
  assert(depositRes2.success && !!depositRes2.depositId, `Deposit 2 created for rejection test (ID: ${depositRes2.depositId})`);

  const balanceBeforeReject = (await getPlayerWalletOverview(testPlayer.id)).availableBalancePaise;

  const rejectRes = await adminRejectDeposit({
    depositId: depositRes2.depositId!,
    adminId: testAdmin.id,
    rejectionReason: 'UTR not found in merchant bank records after 30 minute check.',
  });

  assert(rejectRes.success, 'adminRejectDeposit stored procedure executed successfully');

  // Verify wallet balance is UNCHANGED
  const balanceAfterReject = (await getPlayerWalletOverview(testPlayer.id)).availableBalancePaise;
  assert(
    balanceBeforeReject === balanceAfterReject,
    'Player wallet balance remained unchanged upon rejection'
  );

  // Verify deposit record status
  const { data: deposit2Record } = await adminClient
    .from('wallet_deposits')
    .select('*')
    .eq('id', depositRes2.depositId)
    .single();

  assert(deposit2Record.status === 'rejected', 'Deposit status updated to rejected');
  assert(
    deposit2Record.rejection_reason === 'UTR not found in merchant bank records after 30 minute check.',
    'Rejection reason recorded accurately'
  );

  // 10. Query Service Functions
  console.log('\n--- TEST 10: Query Functions Verification ---');
  const playerDeposits = await getPlayerWalletDeposits(testPlayer.id);
  assert(playerDeposits.deposits.length >= 2, `getPlayerWalletDeposits returned ${playerDeposits.deposits.length} deposits`);

  const adminDeposits = await getAdminWalletDeposits();
  assert(adminDeposits.deposits.length >= 2, `getAdminWalletDeposits returned ${adminDeposits.deposits.length} deposits`);
  assert(adminDeposits.summary.approvedSumInr > 0, `Admin summary approvedSumInr = ₹${adminDeposits.summary.approvedSumInr}`);

  // Summary
  console.log('\n===============================================================');
  console.log(`🏁 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error in test runner:', err);
  process.exit(1);
});
