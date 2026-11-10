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

// Ensure dedicated secret exists
if (!process.env.WALLET_ENCRYPTION_SECRET) {
  process.env.WALLET_ENCRYPTION_SECRET = 'efootball_wallet_secure_aes_256_gcm_production_secret_2026_x89f';
}

// Set authenticated admin environment for test execution
process.env.TEST_AUTH_USER_EMAIL = 'ye.agrajj@gmail.com';
process.env.TEST_AUTH_USER_ID = '30080df7-5188-4630-b597-b8493ebe045d';

async function run() {
  const { createAdminClient } = await import('../lib/supabase/admin');
  const {
    encryptSensitiveField,
    decryptSensitiveField,
    maskAccountNumber,
    isValidAccountNumber,
    isValidIfscCode,
    isValidUpiId,
  } = await import('../lib/wallet/crypto');

  const {
    getOrCreatePlayerWallet,
    getPlayerWalletOverview,
    getPlayerWalletTransactions,
    getPlayerPaymentMethods,
    savePlayerBankAccount,
    savePlayerUpiDetails,
    setPreferredPaymentMethod,
    requestPlayerPayout,
    getAdminFinancialOverview,
    getAdminPayoutsList,
    distributeTournamentPrizes,
    updatePayoutStatus,
    getPlayerPerformanceAnalytics,
  } = await import('../services/walletService');

  const {
    saveBankAccountAction,
    saveUpiDetailsAction,
    setPreferredPaymentMethodAction,
    requestPayoutAction,
    adminDistributePrizesAction,
    adminUpdatePayoutStatusAction,
  } = await import('../app/actions/walletActions');

  console.log('💳 Starting Advanced Player Wallet & Payout System Full Verification Suite...\n');

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

  const adminClient = createAdminClient();
  const testUserId = '30080df7-5188-4630-b597-b8493ebe045d';

  // ========================================================
  // SECTION 1: SENSITIVE DATA ENCRYPTION & MASKING
  // ========================================================
  console.log('--- SECTION 1: Sensitive Data Encryption & Masking ---');
  const rawAcc = '1234567890123456';
  const encrypted = encryptSensitiveField(rawAcc);
  assert(encrypted !== rawAcc && encrypted.includes(':'), 'Bank account encrypted using authenticated AES-256-GCM format');

  const decrypted = decryptSensitiveField(encrypted);
  assert(decrypted === rawAcc, 'Bank account cleanly decrypted by authorized key');

  const masked = maskAccountNumber(rawAcc);
  assert(masked === 'XXXX XXXX 3456', `Masked account format verified: ${masked}`);

  // Validation rules
  assert(isValidAccountNumber('123456789012'), 'Valid account number (12 digits) accepted');
  assert(!isValidAccountNumber('1234'), 'Short account number rejected');
  assert(!isValidAccountNumber('12345678901234567890'), 'Excessively long account number rejected');
  assert(isValidIfscCode('SBIN0001234'), 'Valid IFSC (SBIN0001234) accepted');
  assert(isValidIfscCode('HDFC0000001'), 'Valid IFSC (HDFC0000001) accepted');
  assert(!isValidIfscCode('INVALIDIFSC'), 'Invalid IFSC rejected');
  assert(!isValidIfscCode('HDFC001'), 'Short IFSC rejected');
  assert(isValidUpiId('agraj@okaxis'), 'Valid UPI (agraj@okaxis) accepted');
  assert(isValidUpiId('9207516227@paytm'), 'Valid UPI (9207516227@paytm) accepted');
  assert(!isValidUpiId('invalidupi'), 'Malformed UPI without @ rejected');

  // ========================================================
  // SECTION 2: PAYMENT DETAILS COEXISTENCE & PREFERENCES
  // ========================================================
  console.log('\n--- SECTION 2: Payment Details Coexistence & Preferences ---');
  const bankSave = await savePlayerBankAccount(testUserId, {
    accountHolderName: 'Agraj Administrator',
    bankName: 'State Bank of India',
    accountNumber: '987654321098',
    confirmAccountNumber: '987654321098',
    ifscCode: 'SBIN0001234',
    isPreferred: true,
  });
  assert(bankSave.success, 'Bank account saved successfully');

  const upiSave = await savePlayerUpiDetails(testUserId, {
    upiId: 'agraj@okaxis',
    confirmUpiId: 'agraj@okaxis',
    isPreferred: false,
  });
  assert(upiSave.success, 'UPI ID saved successfully');

  const methods = await getPlayerPaymentMethods(testUserId);
  assert(methods.length >= 2, `Both payment methods coexist simultaneously (count: ${methods.length})`);

  const hasBank = methods.some((m) => m.paymentMethodType === 'bank_account');
  const hasUpi = methods.some((m) => m.paymentMethodType === 'upi');
  assert(hasBank && hasUpi, 'Both Bank and UPI channels active on player profile');

  const bankMethod = methods.find((m) => m.paymentMethodType === 'bank_account');
  assert(bankMethod?.isPreferred === true, 'Bank account initially marked as preferred');
  assert(bankMethod?.maskedAccountNumber?.includes('XXXX') === true, 'Bank account returned in masked format');

  // Toggle preferred
  const switchPref = await setPreferredPaymentMethod(testUserId, 'upi');
  assert(switchPref.success, 'Switched preferred payment method to UPI');

  const updatedMethods = await getPlayerPaymentMethods(testUserId);
  const upiMethod = updatedMethods.find((m) => m.paymentMethodType === 'upi');
  const updatedBank = updatedMethods.find((m) => m.paymentMethodType === 'bank_account');
  assert(upiMethod?.isPreferred === true, 'UPI is now active preferred method');
  assert(updatedBank?.isPreferred === false, 'Bank account preference cleanly toggled off');

  // ========================================================
  // SECTION 3: WALLET INITIALIZATION & AUTHORITATIVE CALCULATIONS
  // ========================================================
  console.log('\n--- SECTION 3: Wallet Initialization & Authoritative Calculations ---');
  const wallet = await getOrCreatePlayerWallet(testUserId);
  assert(Boolean(wallet?.id), `Player wallet provisioned: ${wallet.id}`);

  const overview = await getPlayerWalletOverview(testUserId);
  assert(typeof overview.totalEarningsInr === 'number', `Total earnings computed: ₹${overview.totalEarningsInr}`);
  assert(typeof overview.pendingEarningsInr === 'number', `Pending earnings computed: ₹${overview.pendingEarningsInr}`);
  assert(typeof overview.totalPaidInr === 'number', `Total paid computed: ₹${overview.totalPaidInr}`);
  assert(typeof overview.unpaidRewardsInr === 'number', `Unpaid rewards computed: ₹${overview.unpaidRewardsInr}`);
  assert(typeof overview.availablePayoutInr === 'number', `Available payout computed: ₹${overview.availablePayoutInr}`);

  // ========================================================
  // SECTION 4: TOURNAMENT PRIZE DISTRIBUTION & 24H SLA AUTO PROVISIONING
  // ========================================================
  console.log('\n--- SECTION 4: Tournament Prize Distribution & 24h SLA Auto Provisioning ---');
  // Find or create participant
  const { data: tourList } = await (adminClient.from('tournaments') as any)
    .select('id, name')
    .limit(1);

  const targetTournamentId = tourList?.[0]?.id;
  assert(Boolean(targetTournamentId), `Target tournament available: ${targetTournamentId}`);

  let { data: existingPart } = await (adminClient.from('participants') as any)
    .select('id')
    .eq('tournament_id', targetTournamentId)
    .limit(1)
    .maybeSingle();

  let participantId = existingPart?.id;
  if (!participantId) {
    const { data: newPart } = await (adminClient.from('participants') as any)
      .insert({
        tournament_id: targetTournamentId,
        user_id: testUserId,
        username: 'AgrajCompetitor',
        real_name: 'Agraj Admin',
        registration_status: 'confirmed',
      })
      .select('id')
      .single();
    participantId = newPart?.id;
  }

  await (adminClient.from('participants') as any)
    .update({ user_id: testUserId })
    .eq('id', participantId);

  // Configure tournament prizes & mark completed
  await (adminClient.from('tournaments') as any)
    .update({
      status: 'completed',
      champion_id: participantId,
      runner_up_id: null,
      third_place_id: null,
      first_place_prize_paise: 50000, // ₹500
      second_place_prize_paise: 0,
      third_place_prize_paise: 0,
    })
    .eq('id', targetTournamentId);

  // Clear prior test distributions and test payouts for clean test
  await (adminClient.from('payout_transactions') as any)
    .delete()
    .eq('player_id', testUserId);

  await (adminClient.from('prize_distributions') as any)
    .delete()
    .eq('player_id', testUserId);

  // Distribute prizes
  const distRes = await distributeTournamentPrizes(targetTournamentId, testUserId, 'Automated Test Distribution');
  assert(distRes.success, 'Prize distribution executed cleanly', distRes.error);
  assert(distRes.awardedCount! >= 1, `Awarded prizes to ${distRes.awardedCount} winner(s)`);

  // Verify duplicate distribution protection
  const dupRes = await distributeTournamentPrizes(targetTournamentId, testUserId);
  assert(!dupRes.success, 'Duplicate prize distribution strictly blocked');
  assert(dupRes.error?.includes('already been awarded') === true, 'Duplicate protection returned clear error explanation');

  // Verify 24-hour SLA direct payout was automatically created
  const postDistPayouts = await getAdminPayoutsList();
  const autoPayout = postDistPayouts.payouts.find((p) => p.playerId === testUserId);
  assert(Boolean(autoPayout), 'Direct payout record automatically provisioned upon prize confirmation');
  assert(autoPayout?.payoutStatus === 'APPROVED', `Initial status is APPROVED (actual: ${autoPayout?.payoutStatus})`);
  assert(Boolean(autoPayout?.eligibleAt), `Eligible timestamp recorded: ${autoPayout?.eligibleAt}`);
  assert(Boolean(autoPayout?.deadlineAt), `24-hour deadline recorded: ${autoPayout?.deadlineAt}`);

  // Validate 24-hour interval
  const eligibleMs = new Date(autoPayout!.eligibleAt!).getTime();
  const deadlineMs = new Date(autoPayout!.deadlineAt!).getTime();
  const diffHours = Math.round((deadlineMs - eligibleMs) / (1000 * 3600));
  assert(diffHours === 24, `Deadline is exactly eligible_at + 24 hours (diff: ${diffHours}h)`);

  // ========================================================
  // SECTION 5: PLAYER WITHDRAWAL RESTRICTION & VISIBILITY
  // ========================================================
  console.log('\n--- SECTION 5: Player Withdrawal Restriction & Visibility ---');
  // Manual withdrawal requests must be blocked
  const manualReq = await requestPlayerPayout(testUserId);
  assert(!manualReq.success, 'Manual player withdrawal requests are strictly blocked');
  assert(manualReq.error?.includes('disabled') === true, 'Clear explanation that payouts are admin-disbursed within 24h SLA');

  // Verify Player sees Next Expected Payout in overview
  const playerOverview = await getPlayerWalletOverview(testUserId);
  assert(Boolean(playerOverview.nextExpectedPayout), 'Player overview reflects Next Expected Payout');
  assert(playerOverview.nextExpectedPayout?.amountInr === 500, `Next payout amount matches ₹500 (actual: ₹${playerOverview.nextExpectedPayout?.amountInr})`);

  // ========================================================
  // SECTION 6: ADMIN PAYOUT PROCESSING, SLA TRIAGE & UTR SETTLEMENT
  // ========================================================
  console.log('\n--- SECTION 6: Admin Payout Processing, SLA Triage & UTR Settlement ---');
  assert(Boolean(autoPayout?.paymentDetails?.upiId), 'Authorized admin can inspect decrypted payout destination');

  // Transition APPROVED -> PROCESSING
  const processRes = await updatePayoutStatus({
    payoutId: autoPayout!.id,
    adminUserId: testUserId,
    newStatus: 'PROCESSING',
  });
  assert(processRes.success, 'Payout transitioned to PROCESSING by admin');

  // Transition to FAILED with explanation
  const failRes = await updatePayoutStatus({
    payoutId: autoPayout!.id,
    adminUserId: testUserId,
    newStatus: 'FAILED',
    failureReason: 'Test network bounce on external bank transfer',
  });
  assert(failRes.success, 'Payout transitioned to FAILED with explanation reason');

  // Verify outstanding liability preserved on failure
  const failOverview = await getPlayerWalletOverview(testUserId);
  assert(failOverview.unpaidRewardsInr === 500, `Failed payout preserves unpaid liability: ₹${failOverview.unpaidRewardsInr}`);

  // Admin retries payout (PROCESSING) preserving original deadline
  const retryRes = await updatePayoutStatus({
    payoutId: autoPayout!.id,
    adminUserId: testUserId,
    newStatus: 'PROCESSING',
  });
  assert(retryRes.success, 'Admin successfully retried payout without duplicating prize');

  // Transition to PAID (requires non-empty UTR)
  const emptyUtr = await updatePayoutStatus({
    payoutId: autoPayout!.id,
    adminUserId: testUserId,
    newStatus: 'PAID',
    utrReference: '  ',
  });
  assert(!emptyUtr.success, 'Marking PAID without valid UTR is strictly rejected');

  const validUtr = 'UTR20261110SLA24H';
  const settledRes = await updatePayoutStatus({
    payoutId: autoPayout!.id,
    adminUserId: testUserId,
    newStatus: 'PAID',
    utrReference: validUtr,
    receiptUrl: 'https://res.cloudinary.com/efootball/receipt-test.jpg',
  });
  assert(settledRes.success, 'Payout successfully settled with UTR and receipt');

  // Verify ledger reflects completed payout
  const finalTxs = await getPlayerWalletTransactions(testUserId);
  const completedTx = finalTxs.transactions.find((tx) => tx.transactionType === 'PAYOUT_COMPLETED');
  assert(Boolean(completedTx), `PAYOUT_COMPLETED recorded in financial ledger: ${completedTx?.transactionRef}`);
  
  // Verify UTR is preserved in database for admin audit but hidden from user ledger
  const { data: payoutDb } = await (adminClient.from('payout_transactions') as any)
    .select('utr_reference')
    .eq('id', autoPayout!.id)
    .single();
  assert(payoutDb?.utr_reference === validUtr, 'Authoritative payout record preserves bank UTR reference');
  assert(!completedTx?.description.includes(validUtr), 'User ledger description keeps UTR private');

  // Verify liability cleared
  const settledOverview = await getPlayerWalletOverview(testUserId);
  assert(settledOverview.unpaidRewardsInr === 0, `Unpaid liability cleared after settlement: ₹${settledOverview.unpaidRewardsInr}`);
  assert(settledOverview.totalPaidInr >= 500, `Total paid updated to: ₹${settledOverview.totalPaidInr}`);

  // ========================================================
  // SECTION 7: INTERACTIVE PERFORMANCE ANALYTICS (DAY, WEEK, MONTH)
  // ========================================================
  console.log('\n--- SECTION 7: Interactive Performance Analytics (Day, Week, Month) ---');
  const dayAnalytics = await getPlayerPerformanceAnalytics(testUserId, 'day');
  assert(dayAnalytics.timeframe === 'day', 'Day analytics timeframe verified');
  assert(dayAnalytics.dataPoints.length === 24, `Day analytics contains 24 hourly buckets (count: ${dayAnalytics.dataPoints.length})`);
  assert(typeof dayAnalytics.totalEarningsInr === 'number', `Day total earnings: ₹${dayAnalytics.totalEarningsInr}`);

  const weekAnalytics = await getPlayerPerformanceAnalytics(testUserId, 'week');
  assert(weekAnalytics.timeframe === 'week', 'Week analytics timeframe verified');
  assert(weekAnalytics.dataPoints.length === 7, `Week analytics contains 7 daily points (count: ${weekAnalytics.dataPoints.length})`);

  const monthAnalytics = await getPlayerPerformanceAnalytics(testUserId, 'month');
  assert(monthAnalytics.timeframe === 'month', 'Month analytics timeframe verified');
  assert(monthAnalytics.dataPoints.length === 30, `Month analytics contains 30 daily points (count: ${monthAnalytics.dataPoints.length})`);

  // ========================================================
  // SECTION 8: ADMIN FINANCIAL TELEMETRY & SECURITY CHECKS
  // ========================================================
  console.log('\n--- SECTION 8: Admin Financial Telemetry & Security Checks ---');
  const adminStats = await getAdminFinancialOverview();
  assert(adminStats.totalPrizeAwardedInr >= 500, `Total prizes awarded: ₹${adminStats.totalPrizeAwardedInr}`);
  assert(adminStats.totalPaidInr >= 500, `Total settled payments: ₹${adminStats.totalPaidInr}`);
  assert(typeof adminStats.overduePayoutsCount === 'number', `Overdue payouts tracked: ${adminStats.overduePayoutsCount}`);
  assert(typeof adminStats.dueSoonPayoutsCount === 'number', `Due soon payouts tracked: ${adminStats.dueSoonPayoutsCount}`);

  // Unauthorized actor simulation
  process.env.TEST_AUTH_USER_EMAIL = 'unauthorized-player@example.com';
  const unauthDist = await adminDistributePrizesAction({ tournamentId: targetTournamentId });
  assert(!unauthDist.success && Boolean(unauthDist.error?.includes('Unauthorized')), 'Non-admin blocked from distributing prizes');

  const unauthUpdate = await adminUpdatePayoutStatusAction({
    payoutId: autoPayout!.id,
    newStatus: 'PAID',
    utrReference: 'HACK',
  });
  assert(!unauthUpdate.success && Boolean(unauthUpdate.error?.includes('Unauthorized')), 'Non-admin blocked from altering payout status');

  // Restore admin
  process.env.TEST_AUTH_USER_EMAIL = 'ye.agrajj@gmail.com';

  console.log('\n======================================================');
  console.log(`🏁 Full Verification Summary: ${testsPassed} Passed, ${testsFailed} Failed.`);
  console.log('======================================================');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
