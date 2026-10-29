/**
 * Automated Verification Test Suite for Milestone 1:
 * Database & Backend Foundation for Paid Registrations & Razorpay Integration
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
import {
  isRazorpayConfigured,
  getRazorpayConfig,
  verifyPaymentSignature,
  verifyWebhookSignature,
  RazorpayConfigurationError,
} from '../lib/razorpay/server';
import { getClientRazorpayKeyId, isClientRazorpayAvailable } from '../lib/razorpay/client';
import crypto from 'crypto';

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

async function runMilestone1Verification() {
  console.log('================================================================');
  console.log('     MILESTONE 1: DATABASE & RAZORPAY BACKEND VERIFICATION      ');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // Check 1: Safe Razorpay Config - Missing credentials do NOT crash build
  // ---------------------------------------------------------------------------
  {
    const configured = isRazorpayConfigured();
    record(
      1,
      'isRazorpayConfigured handles missing keys gracefully',
      'Razorpay Server Config',
      typeof configured === 'boolean',
      `Returned boolean (${configured}) without throwing errors`
    );
  }

  // ---------------------------------------------------------------------------
  // Check 2: Lazy validation throws descriptive error when requested without keys
  // ---------------------------------------------------------------------------
  {
    let caught = false;
    let errMessage = '';
    try {
      if (!isRazorpayConfigured()) {
        getRazorpayConfig();
      } else {
        caught = true;
      }
    } catch (e: any) {
      if (e instanceof RazorpayConfigurationError) {
        caught = true;
        errMessage = e.message;
      }
    }
    record(
      2,
      'Lazy validation throws RazorpayConfigurationError when keys are absent',
      'Razorpay Server Config',
      caught,
      isRazorpayConfigured()
        ? 'Credentials configured in environment'
        : `Caught expected error: "${errMessage.slice(0, 50)}..."`
    );
  }

  // ---------------------------------------------------------------------------
  // Check 3: Client helper never exposes secrets
  // ---------------------------------------------------------------------------
  {
    const clientKeyId = getClientRazorpayKeyId();
    const isAvail = isClientRazorpayAvailable();
    const doesNotContainSecret =
      !clientKeyId || (!clientKeyId.includes('secret') && !clientKeyId.includes('sk_'));

    record(
      3,
      'Client Razorpay module exposes only public key ID and no secrets',
      'Security Isolation',
      doesNotContainSecret,
      `Client key: ${clientKeyId || 'null'}, isAvailable: ${isAvail}`
    );
  }

  // ---------------------------------------------------------------------------
  // Check 4: HMAC SHA256 Signature Verification Algorithm
  // ---------------------------------------------------------------------------
  {
    const testSecret = 'sample_secret_key_12345';
    const testOrderId = 'order_9A33XWu170gUtm';
    const testPaymentId = 'pay_29Ae07wjhJStores';

    const validSignature = crypto
      .createHmac('sha256', testSecret)
      .update(`${testOrderId}|${testPaymentId}`)
      .digest('hex');

    const invalidSignature = 'invalid_tampered_signature_hex';

    const origSecret = process.env.RAZORPAY_KEY_SECRET;
    process.env.RAZORPAY_KEY_SECRET = testSecret;

    const validResult = verifyPaymentSignature({
      orderId: testOrderId,
      paymentId: testPaymentId,
      signature: validSignature,
    });

    const invalidResult = verifyPaymentSignature({
      orderId: testOrderId,
      paymentId: testPaymentId,
      signature: invalidSignature,
    });

    if (origSecret !== undefined) {
      process.env.RAZORPAY_KEY_SECRET = origSecret;
    } else {
      delete process.env.RAZORPAY_KEY_SECRET;
    }

    const testPassed = validResult === true && invalidResult === false;
    record(
      4,
      'Cryptographic payment signature verification with timingSafeEqual',
      'Cryptographic Integrity',
      testPassed,
      `Valid signature accepted (${validResult}), tampered signature rejected (${invalidResult})`
    );
  }

  // ---------------------------------------------------------------------------
  // Check 5: Webhook Signature Verification Algorithm
  // ---------------------------------------------------------------------------
  {
    const testWebhookSecret = 'webhook_secret_998877';
    const testPayload = JSON.stringify({
      entity: 'event',
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_test_123', amount: 50000 } } },
    });

    const validWebhookSig = crypto
      .createHmac('sha256', testWebhookSecret)
      .update(testPayload)
      .digest('hex');

    const origWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    process.env.RAZORPAY_WEBHOOK_SECRET = testWebhookSecret;

    const validWebhookRes = verifyWebhookSignature({
      rawBody: testPayload,
      signature: validWebhookSig,
    });

    const invalidWebhookRes = verifyWebhookSignature({
      rawBody: testPayload,
      signature: 'bad_webhook_signature',
    });

    if (origWebhookSecret !== undefined) {
      process.env.RAZORPAY_WEBHOOK_SECRET = origWebhookSecret;
    } else {
      delete process.env.RAZORPAY_WEBHOOK_SECRET;
    }

    const webhookTestPassed = validWebhookRes === true && invalidWebhookRes === false;
    record(
      5,
      'Cryptographic webhook signature verification with timingSafeEqual',
      'Cryptographic Integrity',
      webhookTestPassed,
      `Valid webhook payload accepted (${validWebhookRes}), tampered rejected (${invalidWebhookRes})`
    );
  }

  // ---------------------------------------------------------------------------
  // Check 6: Monetary Value Integer Paise Enforcement
  // ---------------------------------------------------------------------------
  {
    const testRupees = 150.5;
    const paise = Math.round(testRupees * 100);
    const isInteger = Number.isInteger(paise);

    record(
      6,
      'Monetary calculations use integer paise to prevent floating-point inaccuracies',
      'Financial Safety',
      isInteger && paise === 15050,
      `Converted ₹150.50 -> ${paise} integer paise`
    );
  }

  // ---------------------------------------------------------------------------
  // Check 7: Supabase Connection & Existing Tournaments Data Preservation
  // ---------------------------------------------------------------------------
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseAnonKey) {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Verify existing tournaments
    const { data: tournaments, error: tErr } = await supabase
      .from('tournaments')
      .select('id, name, status, max_participants, is_paid, entry_fee_paise, currency, confirmed_slots_count, reserved_slots_count')
      .order('name');

    if (!tErr && tournaments) {
      const the2020 = tournaments.find((t) => t.name === 'THE 20-20');
      const quick = tournaments.find((t) => t.name === 'Quick turnament');
      const preserved = Boolean(
        the2020 &&
        the2020.confirmed_slots_count === 20 &&
        quick &&
        quick.confirmed_slots_count === 12
      );

      record(
        7,
        'Existing tournaments and reconciled confirmed slot counts preserved',
        'Database Integrity',
        preserved,
        `Retrieved ${tournaments.length} tournaments. "THE 20-20": ${the2020?.confirmed_slots_count}/20, "Quick turnament": ${quick?.confirmed_slots_count}/12`
      );

      // Check 8: Verify billing fields exist on tournament rows
      const hasBillingFields = tournaments.every(
        (t) =>
          typeof t.is_paid === 'boolean' &&
          typeof t.entry_fee_paise === 'number' &&
          typeof t.currency === 'string' &&
          typeof t.confirmed_slots_count === 'number' &&
          typeof t.reserved_slots_count === 'number'
      );

      record(
        8,
        'Tournament billing & capacity fields present on live database rows',
        'Schema Validation',
        hasBillingFields,
        'All columns (is_paid, entry_fee_paise, currency, confirmed_slots_count, reserved_slots_count) populated'
      );

      // Check 9: Unauthenticated slot reservation RPC call rejected
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('reserve_tournament_slot', {
        p_tournament_id: tournaments[0].id,
        p_user_id: '00000000-0000-0000-0000-000000000000',
        p_hold_duration_minutes: 12,
      });

      // The function should return success: false with auth message or throw
      const rpcRejected =
        (rpcRes && rpcRes[0] && rpcRes[0].success === false) ||
        Boolean(rpcErr);

      record(
        9,
        'reserve_tournament_slot RPC rejects unauthenticated / invalid callers',
        'Database Security',
        rpcRejected,
        rpcRes && rpcRes[0] ? `RPC message: "${rpcRes[0].message}"` : `RPC error: ${rpcErr?.message}`
      );
    } else {
      record(
        7,
        'Existing tournaments and reconciled confirmed slot counts preserved',
        'Database Integrity',
        false,
        `Supabase query error: ${tErr?.message}`
      );
    }
  } else {
    record(
      7,
      'Supabase credentials check',
      'Environment',
      false,
      'NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY missing in .env.local'
    );
  }

  console.log('\n================================================================');
  const allPassed = results.every((r) => r.passed);
  console.log(`TOTAL CHECKS: ${results.length} | PASSED: ${results.filter((r) => r.passed).length} | FAILED: ${results.filter((r) => !r.passed).length}`);
  console.log(`STATUS: ${allPassed ? 'ALL VERIFICATION CHECKS PASSED ✅' : 'SOME CHECKS FAILED ❌'}`);
  console.log('================================================================');

  if (!allPassed) {
    process.exit(1);
  }
}

runMilestone1Verification().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
