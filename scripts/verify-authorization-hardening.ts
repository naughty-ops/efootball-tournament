/**
 * Automated Verification Test Suite for Milestone 1.1:
 * PostgreSQL Authorization Hardening
 */

import fs from 'fs';
import path from 'path';

// Helper to safely load environment variables from .env.local
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

import { createClient } from '@supabase/supabase-js';

interface TestResult {
  id: number;
  name: string;
  category: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(id: number, name: string, category: string, passed: boolean, details: string) {
  results.push({ id, name, category, passed, details });
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${status} [Test ${id}] (${category}): ${name} - ${details}`);
}

async function runAuthorizationVerification() {
  console.log('================================================================');
  console.log('      MILESTONE 1.1: POSTGRESQL AUTHORIZATION HARDENING         ');
  console.log('================================================================\n');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local');
    process.exit(1);
  }

  // Create client simulating untrusted client/browser (anon role)
  const anonClient = createClient(supabaseUrl, supabaseAnonKey);

  // ---------------------------------------------------------------------------
  // Check 1: Anon cannot execute confirm_tournament_reservation
  // ---------------------------------------------------------------------------
  {
    const { data, error } = await anonClient.rpc('confirm_tournament_reservation', {
      p_registration_id: '00000000-0000-0000-0000-000000000000',
    });

    const isDenied = Boolean(
      error &&
      (error.code === '42501' ||
        error.message?.includes('permission denied') ||
        error.message?.includes('not found') ||
        error.message?.includes('Unauthorized'))
    );

    record(
      1,
      'anon role cannot execute confirm_tournament_reservation',
      'RPC Privilege Lockdown',
      isDenied,
      isDenied
        ? `Access denied as expected: "${error?.message}"`
        : `VULNERABILITY: call returned data: ${JSON.stringify(data)}`
    );
  }

  // ---------------------------------------------------------------------------
  // Check 2: Anon cannot execute reconcile_tournament_slots
  // ---------------------------------------------------------------------------
  {
    const { data, error } = await anonClient.rpc('reconcile_tournament_slots', {
      p_tournament_id: '00000000-0000-0000-0000-000000000000',
    });

    const isDenied = Boolean(
      error &&
      (error.code === '42501' ||
        error.message?.includes('permission denied') ||
        error.message?.includes('not found') ||
        error.message?.includes('Unauthorized'))
    );

    record(
      2,
      'anon role cannot execute reconcile_tournament_slots',
      'RPC Privilege Lockdown',
      isDenied,
      isDenied
        ? `Access denied as expected: "${error?.message}"`
        : `VULNERABILITY: call returned data: ${JSON.stringify(data)}`
    );
  }

  // ---------------------------------------------------------------------------
  // Check 3: Anon cannot execute release_expired_reservations
  // ---------------------------------------------------------------------------
  {
    const { data, error } = await anonClient.rpc('release_expired_reservations', {
      p_tournament_id: '00000000-0000-0000-0000-000000000000',
    });

    const isDenied = Boolean(
      error &&
      (error.code === '42501' ||
        error.message?.includes('permission denied') ||
        error.message?.includes('not found') ||
        error.message?.includes('Unauthorized'))
    );

    record(
      3,
      'anon role cannot execute release_expired_reservations',
      'RPC Privilege Lockdown',
      isDenied,
      isDenied
        ? `Access denied as expected: "${error?.message}"`
        : `VULNERABILITY: call returned data: ${JSON.stringify(data)}`
    );
  }

  // ---------------------------------------------------------------------------
  // Check 4: Anon cannot execute reserve_tournament_slot
  // ---------------------------------------------------------------------------
  {
    const { data, error } = await anonClient.rpc('reserve_tournament_slot', {
      p_tournament_id: '00000000-0000-0000-0000-000000000000',
      p_user_id: '00000000-0000-0000-0000-000000000000',
      p_hold_duration_minutes: 12,
    });

    const isDenied = Boolean(
      error &&
      (error.code === '42501' ||
        error.message?.includes('permission denied') ||
        error.message?.includes('not found') ||
        error.message?.includes('Unauthorized'))
    );

    record(
      4,
      'anon role cannot execute reserve_tournament_slot',
      'RPC Privilege Lockdown',
      isDenied,
      isDenied
        ? `Access denied as expected: "${error?.message}"`
        : `Returned: ${JSON.stringify(data)}`
    );
  }

  // ---------------------------------------------------------------------------
  // Check 5: Direct client insert on payment_refund_requests is completely denied
  // ---------------------------------------------------------------------------
  {
    const { data, error } = await anonClient.from('payment_refund_requests').insert({
      tournament_id: '00000000-0000-0000-0000-000000000000',
      order_id: '00000000-0000-0000-0000-000000000000',
      transaction_id: '00000000-0000-0000-0000-000000000000',
      user_id: '00000000-0000-0000-0000-000000000000',
      amount_paise: 50000,
      currency: 'INR',
      reason: 'Malicious injection test',
    });

    const isDenied = Boolean(error);
    record(
      5,
      'Direct client INSERT on payment_refund_requests is denied by RLS',
      'RLS Enforcement',
      isDenied,
      isDenied
        ? `Insert blocked by RLS: "${error?.message}"`
        : `VULNERABILITY: Insert succeeded: ${JSON.stringify(data)}`
    );
  }

  // ---------------------------------------------------------------------------
  // Check 6: Unrelated public tournament viewing remains functional
  // ---------------------------------------------------------------------------
  {
    const { data: tournaments, error } = await anonClient
      .from('tournaments')
      .select('id, name, status, format, max_participants, confirmed_slots_count')
      .order('created_at');

    const works = !error && Array.isArray(tournaments) && tournaments.length > 0;
    record(
      6,
      'Public tournament catalog viewing remains functional for anonymous users',
      'Public Access Integrity',
      works,
      works
        ? `Successfully fetched ${tournaments.length} public tournaments`
        : `Failed to fetch tournaments: ${error?.message}`
    );
  }

  // ---------------------------------------------------------------------------
  // Check 7: Historical tournament and participant counts remain intact
  // ---------------------------------------------------------------------------
  {
    const { data: the2020 } = await anonClient
      .from('tournaments')
      .select('name, max_participants, confirmed_slots_count, reserved_slots_count')
      .eq('name', 'THE 20-20')
      .single();

    const { data: quick } = await anonClient
      .from('tournaments')
      .select('name, max_participants, confirmed_slots_count, reserved_slots_count')
      .eq('name', 'Quick turnament')
      .single();

    const the2020Matches = the2020?.confirmed_slots_count === 20 && the2020?.reserved_slots_count === 0;
    const quickMatches = quick?.confirmed_slots_count === 12 && quick?.reserved_slots_count === 0;

    record(
      7,
      'Historical tournament slots remain strictly consistent ("THE 20-20"=20, "Quick turnament"=12)',
      'Historical Data Integrity',
      the2020Matches && quickMatches,
      `THE 20-20: ${the2020?.confirmed_slots_count}/${the2020?.max_participants}, Quick turnament: ${quick?.confirmed_slots_count}/${quick?.max_participants}`
    );
  }

  console.log('\n================================================================');
  const allPassed = results.every((r) => r.passed);
  console.log(`TOTAL CHECKS: ${results.length} | PASSED: ${results.filter((r) => r.passed).length} | FAILED: ${results.filter((r) => !r.passed).length}`);
  console.log(`STATUS: ${allPassed ? 'ALL AUTHORIZATION CHECKS PASSED ✅' : 'SOME CHECKS FAILED ❌'}`);
  console.log('================================================================');

  if (!allPassed) {
    process.exit(1);
  }
}

runAuthorizationVerification().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
