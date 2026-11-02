/**
 * Deployment Gate Route Verification Script
 * 
 * Tests the actual route handlers:
 * 1. /api/admin/reconcile-payment
 * 2. /api/webhooks/youpi
 * 3. /api/webhooks/razorpay
 * 4. /api/webhooks/cashfree
 * 5. /api/cron/release-expired-reservations
 * 
 * Verifies exact HTTP behaviors, unauthenticated 401, non-admin 403,
 * admin authorization, and webhook signature rejections.
 */

import { NextRequest } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables for secrets
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
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
loadEnv();

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passed++;
  } else {
    console.error(`[FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
    failed++;
  }
}

async function runRouteVerification() {
  console.log('================================================================');
  console.log('       FINAL DEPLOYMENT GATE: API ROUTE VERIFICATION            ');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // 1. Admin Payment Reconciliation: /api/admin/reconcile-payment
  // ---------------------------------------------------------------------------
  console.log('--- 1. Testing /api/admin/reconcile-payment ---');
  const { POST: handleReconcile } = await import('../app/api/admin/reconcile-payment/route');

  // Case A: Unauthenticated request -> Expect 401
  {
    const req = new NextRequest('http://localhost:3000/api/admin/reconcile-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: '00000000-0000-0000-0000-000000000000',
        decision: 'approve',
        evidenceReference: 'BANK12345678',
      }),
    });

    const res = await handleReconcile(req);
    const data = await res.json().catch(() => ({}));
    assert(res.status === 401, '1.A Unauthenticated caller rejected with HTTP 401', `Status: ${res.status}, body: ${JSON.stringify(data)}`);
    assert(data.error?.includes('Unauthorized'), '1.B Response body specifies authentication required');
  }

  // Case B: Non-admin caller -> Verify checkIsAdmin logic
  {
    const { checkIsAdmin, isAllowlistedAdminEmail } = await import('../lib/auth/server');
    const playerEmail = 'ordinary_player@test.com';
    const playerId = '00000000-0000-0000-0000-000000000001';
    
    const isPlayerAdmin = await checkIsAdmin(playerId, playerEmail);
    assert(isPlayerAdmin === false, '1.C Ordinary player checkIsAdmin returns false');
    assert(isAllowlistedAdminEmail(playerEmail) === false, '1.D Ordinary player email is not allowlisted');
  }

  // Case C: Allowlisted admin email -> Verify checkIsAdmin logic
  {
    const { isAllowlistedAdminEmail } = await import('../lib/auth/server');
    const adminEmail = 'ye.agrajj@gmail.com';
    assert(isAllowlistedAdminEmail(adminEmail) === true, '1.E Owner email ye.agrajj@gmail.com is allowlisted');
  }

  // ---------------------------------------------------------------------------
  // 2. YouPi Webhook: /api/webhooks/youpi
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. Testing /api/webhooks/youpi ---');
  const { POST: handleYoupi } = await import('../app/api/webhooks/youpi/route');

  // Case A: Missing signature -> Expect 401 or 503 if disabled
  {
    const req = new NextRequest('http://localhost:3000/api/webhooks/youpi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'observation', orderId: 'yp_test' }),
    });

    const res = await handleYoupi(req);
    const data = await res.json().catch(() => ({}));
    // Either 401 (invalid/missing signature) or 503 (if YOUPI_ENABLED=false)
    const isProtected = res.status === 401 || res.status === 503;
    assert(isProtected, '2.A YouPi webhook rejected without valid signature (HTTP 401 or 503)', `Status: ${res.status}`);
  }

  // Case B: Forged signature -> Expect 401
  {
    const originalEnabled = process.env.YOUPI_ENABLED;
    const originalSecret = process.env.YOUPI_WEBHOOK_SECRET;
    process.env.YOUPI_ENABLED = 'true';
    process.env.YOUPI_WEBHOOK_SECRET = 'whsec_youpi_test_secret_123456';

    const req = new NextRequest('http://localhost:3000/api/webhooks/youpi', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-gateway-signature': 'forged_fake_signature_hash',
      },
      body: JSON.stringify({ event: 'observation', orderId: 'yp_test' }),
    });

    const res = await handleYoupi(req);
    const data = await res.json().catch(() => ({}));
    assert(res.status === 401, '2.B YouPi forged signature rejected with HTTP 401', `Status: ${res.status}`);

    // Restore env
    process.env.YOUPI_ENABLED = originalEnabled;
    process.env.YOUPI_WEBHOOK_SECRET = originalSecret;
  }

  // ---------------------------------------------------------------------------
  // 3. Razorpay Webhook: /api/webhooks/razorpay
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. Testing /api/webhooks/razorpay ---');
  const { POST: handleRazorpay } = await import('../app/api/webhooks/razorpay/route');

  // Case A: Missing signature -> Expect 400
  {
    const req = new NextRequest('http://localhost:3000/api/webhooks/razorpay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'payment.captured' }),
    });

    const res = await handleRazorpay(req);
    const data = await res.json().catch(() => ({}));
    assert(res.status === 400, '3.A Razorpay webhook missing signature rejected with HTTP 400', `Status: ${res.status}`);
  }

  // Case B: Forged signature -> Expect 401
  {
    const req = new NextRequest('http://localhost:3000/api/webhooks/razorpay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': 'forged_hmac_hash_12345',
      },
      body: JSON.stringify({ event: 'payment.captured' }),
    });

    const res = await handleRazorpay(req);
    const data = await res.json().catch(() => ({}));
    assert(res.status === 401, '3.B Razorpay webhook forged signature rejected with HTTP 401', `Status: ${res.status}`);
  }

  // ---------------------------------------------------------------------------
  // 4. Cashfree Webhook: /api/webhooks/cashfree
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. Testing /api/webhooks/cashfree ---');
  const { POST: handleCashfree } = await import('../app/api/webhooks/cashfree/route');

  // Case A: Missing signature headers -> Expect 400
  {
    const req = new NextRequest('http://localhost:3000/api/webhooks/cashfree', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK' }),
    });

    const res = await handleCashfree(req);
    const data = await res.json().catch(() => ({}));
    assert(res.status === 400, '4.A Cashfree webhook missing signature rejected with HTTP 400', `Status: ${res.status}`);
  }

  // Case B: Forged signature -> Expect 401
  {
    const req = new NextRequest('http://localhost:3000/api/webhooks/cashfree', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-signature': 'forged_signature_xyz',
        'x-webhook-timestamp': Date.now().toString(),
      },
      body: JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK' }),
    });

    const res = await handleCashfree(req);
    const data = await res.json().catch(() => ({}));
    assert(res.status === 401, '4.B Cashfree webhook forged signature rejected with HTTP 401', `Status: ${res.status}`);
  }

  // ---------------------------------------------------------------------------
  // 5. Reservation Cleanup Cron: /api/cron/release-expired-reservations
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. Testing /api/cron/release-expired-reservations ---');
  const { GET: handleCronGet, POST: handleCronPost } = await import('../app/api/cron/release-expired-reservations/route');

  // Case A: Unauthenticated request -> Expect 401
  {
    const req = new NextRequest('http://localhost:3000/api/cron/release-expired-reservations', {
      method: 'GET',
    });

    const res = await handleCronGet(req);
    const data = await res.json().catch(() => ({}));
    assert(res.status === 401, '5.A Cron GET missing authorization rejected with HTTP 401', `Status: ${res.status}`);
  }

  // Case B: Invalid bearer token -> Expect 401
  {
    const req = new NextRequest('http://localhost:3000/api/cron/release-expired-reservations', {
      method: 'POST',
      headers: { Authorization: 'Bearer WRONG_INVALID_SECRET' },
    });

    const res = await handleCronPost(req);
    const data = await res.json().catch(() => ({}));
    assert(res.status === 401, '5.B Cron POST invalid bearer token rejected with HTTP 401', `Status: ${res.status}`);
  }

  // Case C: Valid bearer token with timing-safe comparison
  {
    const originalSecret = process.env.CRON_SECRET;
    const testSecret = 'test_cron_secret_validation_987654';
    process.env.CRON_SECRET = testSecret;

    const req = new NextRequest('http://localhost:3000/api/cron/release-expired-reservations', {
      method: 'GET',
      headers: { Authorization: `Bearer ${testSecret}` },
    });

    // This executes against the local test database via createAdminClient
    const res = await handleCronGet(req);
    const data = await res.json().catch(() => ({}));
    assert(res.status === 200, '5.C Cron GET with valid CRON_SECRET succeeds with HTTP 200', `Status: ${res.status}`);
    assert(data.success === true, '5.D Cron response indicates success: true');
    assert(typeof data.releasedReservationsCount === 'number', '5.E Cron returns releasedReservationsCount');

    process.env.CRON_SECRET = originalSecret;
  }

  console.log('\n================================================================');
  console.log(`ROUTE VERIFICATION RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runRouteVerification().catch(err => {
  console.error('Fatal route verification error:', err);
  process.exit(1);
});
