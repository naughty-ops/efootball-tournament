import * as fs from 'node:fs';
import * as path from 'node:path';
import { createClient } from '@supabase/supabase-js';

// Load .env.local
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

async function runTest() {
  const { getActiveOneVsOneCards } = await import('../services/oneVsOneService');
  const { createAdminClient } = await import('../lib/supabase/admin');

  const adminClient = createAdminClient();
  const res = await getActiveOneVsOneCards(adminClient);

  console.log('=== Active 1v1 Cards & Active Match Counts ===');
  console.log(`Status: ${res.error ? 'ERROR: ' + res.error : 'SUCCESS'}`);
  console.log(`Cards returned: ${res.data.length}`);

  for (const card of res.data) {
    console.log(`Card: "${card.name}" (ID: ${card.id})`);
    console.log(`  Entry: ₹${card.entry_amount} | Payout: ₹${card.advertised_payout}`);
    console.log(`  Total Active Matches: ${card.active_matches_count}`);
    console.log(`  Waiting Players: ${card.waiting_players_count}`);
    console.log(`  In-Progress Matches: ${card.in_progress_matches_count}`);
  }

  if (res.data.length === 0) {
    throw new Error('No active cards returned!');
  }

  for (const card of res.data) {
    if (typeof card.active_matches_count !== 'number') {
      throw new Error(`card.active_matches_count is not a number on card ${card.name}`);
    }
  }

  console.log('\n✅ All cards successfully carry validated active_matches_count numbers!');
}

runTest().catch((err) => {
  console.error('Test Failed:', err);
  process.exit(1);
});
