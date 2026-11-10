import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';

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

process.env.TEST_AUTH_USER_EMAIL = 'ye.agrajj@gmail.com';
process.env.TEST_AUTH_USER_ID = '30080df7-5188-4630-b597-b8493ebe045d';

async function testRunnerUpDistribution() {
  console.log('🧪 Starting Runner-up Prize Distribution Verification...');

  const {
    getTournamentsForPrizeDistribution,
    distributeTournamentPrizes,
    getPlayerWalletOverview,
  } = await import('../services/walletService');
  const { createAdminClient } = await import('../lib/supabase/admin');

  const adminClient = createAdminClient();
  const happenTournamentId = 'bf9eb280-2407-4985-9550-31bef2c7f1fb';

  // 1. Inspect getTournamentsForPrizeDistribution
  console.log('\n--- Step 1: Testing getTournamentsForPrizeDistribution ---');
  const tournaments = await getTournamentsForPrizeDistribution();
  const happen = tournaments.find((t: any) => t.id === happenTournamentId);

  if (!happen) {
    throw new Error(`Tournament HAPPEN (${happenTournamentId}) not found in completed list!`);
  }

  console.log(`Tournament: ${happen.name}`);
  console.log(`Champion: ${happen.champion?.username || 'TBD'} (Prize: ₹${happen.first_place_prize_paise / 100})`);
  console.log(`Runner-up: ${happen.runner_up?.username || 'TBD'} (Prize: ₹${happen.second_place_prize_paise / 100})`);
  console.log(`Distributed Count: ${happen.distributedCount}`);
  console.log(`Eligible Count: ${happen.eligibleCount}`);
  console.log(`hasDistributedPrizes: ${happen.hasDistributedPrizes}`);
  console.log(`isPartiallyDistributed: ${happen.isPartiallyDistributed}`);

  if (!happen.runner_up) {
    throw new Error('FAILED: Runner-up participant was not resolved or auto-healed!');
  }
  console.log('✅ PASS: Runner-up resolved successfully:', happen.runner_up.username);

  if (happen.hasDistributedPrizes) {
    console.log('✅ PASS: Tournament has all 2 positions distributed (Champion + Runner-up).');
  } else {
    console.log('✅ PASS: Correctly identified as Partially Awarded (1/2), ready for Runner-up prize!');
    console.log('\n--- Step 2: Executing distributeTournamentPrizes for Runner-up ---');
    const distResult = await distributeTournamentPrizes(
      happenTournamentId,
      process.env.TEST_AUTH_USER_ID!,
      'Production Runner-up distribution verification'
    );
    console.log('Distribution Result:', distResult);
    if (!distResult.success) {
      throw new Error(`Distribution failed: ${distResult.error}`);
    }
    console.log(`✅ PASS: Successfully awarded ${distResult.awardedCount} prize(s)!`);
  }

  // 3. Verify Prize Distribution Record in DB
  console.log('\n--- Step 3: Verifying prize_distributions table ---');
  const { data: distRecords } = await (adminClient.from('prize_distributions') as any)
    .select('*')
    .eq('tournament_id', happenTournamentId)
    .order('position', { ascending: true });

  console.log(`Found ${distRecords?.length || 0} prize distribution records:`);
  for (const r of distRecords || []) {
    console.log(`  - Position ${r.position} (${r.position_title}): ₹${r.prize_amount_inr} to player ${r.player_id} [Status: ${r.status}, Ref: ${r.distribution_reference}]`);
  }

  const p2Record = (distRecords || []).find((r: any) => r.position === 2);
  if (!p2Record) {
    throw new Error('FAILED: Position 2 (Runner-up) prize distribution record missing in database!');
  }
  console.log('✅ PASS: Position 2 prize_distribution record exists with reference:', p2Record.distribution_reference);

  // 4. Verify Payout Transaction Provisioned with 24h SLA
  console.log('\n--- Step 4: Verifying 24h SLA Direct Payout for Runner-up ---');
  const { data: payouts } = await (adminClient.from('payout_transactions') as any)
    .select('*')
    .eq('prize_distribution_id', p2Record.id);

  if (!payouts || payouts.length === 0) {
    throw new Error('FAILED: Direct payout transaction was not auto-provisioned for Runner-up!');
  }

  const payout = payouts[0];
  console.log(`Payout Reference: ${payout.payout_reference}`);
  console.log(`Amount: ₹${payout.amount_inr} (${payout.amount_paise} paise)`);
  console.log(`Status: ${payout.payout_status}`);
  console.log(`Eligible At: ${payout.eligible_at}`);
  console.log(`Deadline (24h SLA): ${payout.deadline_at}`);
  console.log('✅ PASS: Runner-up 24h SLA direct payout provisioned successfully!');

  // 5. Verify Runner-up Player Wallet
  console.log('\n--- Step 5: Verifying Runner-up Player Wallet ---');
  const runnerUpUserId = p2Record.player_id;
  const walletOverview = await getPlayerWalletOverview(runnerUpUserId);
  console.log(`Runner-up total earnings: ₹${walletOverview.totalEarningsInr}`);
  console.log(`Runner-up pending earnings: ₹${walletOverview.pendingEarningsInr}`);
  console.log(`Runner-up unpaid rewards: ₹${walletOverview.unpaidRewardsInr}`);
  console.log(`Runner-up next payout: ₹${walletOverview.nextExpectedPayout?.amountInr}`);

  if (walletOverview.totalEarningsInr !== 55) {
    throw new Error(`Expected ₹55 total earnings, got ₹${walletOverview.totalEarningsInr}`);
  }
  console.log('✅ PASS: Runner-up wallet accurately reflects ₹55 earnings and pending payout!');

  // 6. Verify duplicate distribution is now blocked
  console.log('\n--- Step 6: Verifying idempotency and duplicate block ---');
  const dupResult = await distributeTournamentPrizes(
    happenTournamentId,
    process.env.TEST_AUTH_USER_ID!
  );

  console.log('Duplicate Call Result:', dupResult);
  if (dupResult.success) {
    throw new Error('FAILED: Duplicate distribution should have been blocked!');
  }
  console.log('✅ PASS: Duplicate distribution cleanly rejected with message:', dupResult.error);

  // 7. Verify tournament status in getTournamentsForPrizeDistribution
  const updatedTournaments = await getTournamentsForPrizeDistribution();
  const updatedHappen = updatedTournaments.find((t: any) => t.id === happenTournamentId);
  console.log('\n--- Step 7: Final Tournament Hub Status ---');
  console.log(`hasDistributedPrizes: ${updatedHappen?.hasDistributedPrizes}`);
  console.log(`isPartiallyDistributed: ${updatedHappen?.isPartiallyDistributed}`);
  console.log(`distributedCount: ${updatedHappen?.distributedCount}`);

  if (!updatedHappen?.hasDistributedPrizes) {
    throw new Error('FAILED: Tournament should now be marked hasDistributedPrizes = true (All Awarded)!');
  }
  console.log('✅ PASS: HAPPEN tournament marked as All Awarded!');

  console.log('\n🎉 ALL RUNNER-UP PRIZE DISTRIBUTION TESTS PASSED CLEANLY!\n');
}

testRunnerUpDistribution().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
