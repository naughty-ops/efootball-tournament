import { tournamentSchema } from '../lib/validations';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

function loadEnvFile(filename: string) {
  const filePath = path.resolve(process.cwd(), filename);
  if (fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cqgbeafenavkeirwsxbg.supabase.co';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let passed = 0;
let failed = 0;

function assert(condition: boolean, title: string, details?: string) {
  if (condition) {
    passed++;
    console.log(`✅ PASS: ${title}${details ? ` (${details})` : ''}`);
  } else {
    failed++;
    console.error(`❌ FAIL: ${title}${details ? ` (${details})` : ''}`);
  }
}

async function runWizardTestSuite() {
  console.log('================================================================');
  console.log('     ADMIN TOURNAMENT CREATION WIZARD TEST SUITE (10 CHECKS)    ');
  console.log('================================================================\n');

  // 1. Free Tournament Validation
  const freeTourney = {
    name: 'Free Community Cup 2026',
    description: 'Free to enter weekly showcase',
    format: 'knockout' as const,
    status: 'draft' as const,
    max_participants: 32,
    banner_image: '/images/banner1.jpg',
    rules_text: '8 minute match rules',
    start_date: '2026-11-10T10:00:00Z',
    end_date: '2026-11-12T18:00:00Z',
    registration_deadline: '2026-11-09T23:59:59Z',
    is_paid: false,
    entry_fee_rupees: 0,
    prize_pool_rupees: 1000,
  };
  const parseFree = tournamentSchema.safeParse(freeTourney);
  assert(parseFree.success, 'Free tournament schema parsed successfully');

  // 2. Paid Tournament Validation
  const paidTourney = {
    ...freeTourney,
    name: 'Pro Masters Paid Cup',
    status: 'registration' as const,
    is_paid: true,
    entry_fee_rupees: 150,
    prize_pool_rupees: 4000,
  };
  const parsePaid = tournamentSchema.safeParse(paidTourney);
  assert(parsePaid.success, 'Paid tournament schema parsed successfully with ₹150 entry fee');

  // 3. Paid tournament with 0 entry fee when open for registration MUST FAIL
  const invalidPaidTourney = {
    ...freeTourney,
    status: 'registration' as const,
    is_paid: true,
    entry_fee_rupees: 0,
    entry_fee_paise: 0,
  };
  const parseInvalidPaid = tournamentSchema.safeParse(invalidPaidTourney);
  assert(
    !parseInvalidPaid.success,
    'Paid tournament with ₹0 fee blocked from publishing registration',
    parseInvalidPaid.error?.issues[0]?.message
  );

  // 4. Registration deadline after start date MUST FAIL
  const invalidDeadline = {
    ...freeTourney,
    start_date: '2026-11-10T10:00:00Z',
    registration_deadline: '2026-11-15T10:00:00Z', // 5 days after tournament started!
  };
  const parseInvalidDeadline = tournamentSchema.safeParse(invalidDeadline);
  assert(
    !parseInvalidDeadline.success,
    'Registration deadline after start date is rejected',
    parseInvalidDeadline.error?.issues[0]?.message
  );

  // 5. Banner image presets validation
  const validPresets = [
    '/images/banner1.jpg',
    '/images/banner2.jpg',
    '/images/banner3.jpg',
    '/images/banners/efootball-championship.jpg',
    '/images/banners/efootball-stadium.jpg',
    'https://images.unsplash.com/photo-example.jpg',
  ];
  let allPresetsValid = true;
  for (const preset of validPresets) {
    const res = tournamentSchema.safeParse({ ...freeTourney, banner_image: preset });
    if (!res.success) {
      allPresetsValid = false;
      break;
    }
  }
  assert(allPresetsValid, 'Internal image asset paths and external HTTPS URLs accepted as banner images');

  // 6. Single League + Eliminators format validation
  const singleLeague = {
    ...freeTourney,
    format: 'single_league_knockout' as const,
    rounds_per_pair: 2,
    qualifiers_per_group: 6,
  };
  const parseSingleLeague = tournamentSchema.safeParse(singleLeague);
  assert(parseSingleLeague.success, 'Single League + Eliminators format accepted with rounds & qualifiers');

  // 7. Paise Calculation Safety
  const rupees = 49.50;
  const paise = Math.round(rupees * 100);
  assert(paise === 4950 && Number.isInteger(paise), 'Paise conversion rounds accurately without float drift', `₹49.50 -> ${paise} paise`);

  // 8. Negative entry fee rejection
  const negativeFee = {
    ...freeTourney,
    is_paid: true,
    entry_fee_rupees: -10,
  };
  const parseNegative = tournamentSchema.safeParse(negativeFee);
  assert(!parseNegative.success, 'Negative entry fee is rejected by schema');

  // 9. Excessive capacity rejection
  const excessCapacity = {
    ...freeTourney,
    max_participants: 2048,
  };
  const parseExcess = tournamentSchema.safeParse(excessCapacity);
  assert(!parseExcess.success, 'Participant limit above 1024 is rejected');

  // 10. Database Historical Data Preservation Check
  if (ANON_KEY) {
    const supabase = createClient(SUPABASE_URL, ANON_KEY);
    const { data: tournaments, error: tErr } = await supabase
      .from('tournaments')
      .select('id, name, status, confirmed_slots_count')
      .order('created_at', { ascending: true });

    const hasExpectedTournaments =
      !tErr &&
      tournaments &&
      tournaments.length >= 3 &&
      tournaments.some((t) => t.name === 'THE 20-20') &&
      tournaments.some((t) => t.name === 'Quick turnament');

    assert(
      Boolean(hasExpectedTournaments),
      'Historical tournaments remain intact in live database',
      `Tournaments found: ${tournaments?.length} (${tournaments?.map((t) => t.name).join(', ')})`
    );
  } else {
    console.log('⚠️ SKIP Test 10: NEXT_PUBLIC_SUPABASE_ANON_KEY not available');
  }

  console.log('\n================================================================');
  console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runWizardTestSuite().catch((e) => {
  console.error('Test execution failed:', e);
  process.exit(1);
});
