/**
 * Production Smoke Test Runner
 * 
 * Executes non-destructive, read-only smoke tests against:
 * 1. Target URL: https://efootball-tournament-cyan.vercel.app
 * 2. Checks route status codes, security boundaries, webhook signature rejection, cron protection.
 */

const BASE_URL = 'https://efootball-tournament-cyan.vercel.app';

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

async function fetchRoute(path: string, options: RequestInit = {}): Promise<{ status: number; text: string; location?: string }> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    redirect: 'manual',
    ...options
  });
  const text = await res.text();
  const location = res.headers.get('location') || undefined;
  return { status: res.status, text, location };
}

async function runSmokeTests() {
  console.log('================================================================');
  console.log('       PRODUCTION SMOKE TESTS: LIVE HTTP VERIFICATION           ');
  console.log(`       Target: ${BASE_URL}                                      `);
  console.log('================================================================\n');

  // --- 1. Public Route Health Checks ---
  console.log('--- 1. Public Route Health Checks ---');
  try {
    const landing = await fetchRoute('/');
    assert(landing.status === 200, `Landing Page (/) status 200 (actual: ${landing.status})`);
  } catch (err: any) {
    assert(false, 'Landing Page (/) reachable', err.message);
  }

  try {
    const tournaments = await fetchRoute('/tournaments');
    assert(tournaments.status === 200, `Tournaments Page (/tournaments) status 200 (actual: ${tournaments.status})`);
  } catch (err: any) {
    assert(false, 'Tournaments Page (/tournaments) reachable', err.message);
  }

  try {
    const login = await fetchRoute('/login');
    assert(login.status === 200, `Login Page (/login) status 200 (actual: ${login.status})`);
  } catch (err: any) {
    assert(false, 'Login Page (/login) reachable', err.message);
  }

  // --- 2. Admin Route Protection ---
  console.log('\n--- 2. Admin Route Protection (Unauthenticated) ---');
  try {
    const adminPage = await fetchRoute('/admin');
    // Expect redirect (307/308/302) to login, or 401/403/404
    const isProtected = adminPage.status === 307 || adminPage.status === 308 || adminPage.status === 302 || adminPage.status === 401 || adminPage.status === 403;
    assert(isProtected, `Admin Page (/admin) protected (status: ${adminPage.status}, location: ${adminPage.location || 'none'})`);
  } catch (err: any) {
    assert(false, 'Admin Page (/admin) protection check', err.message);
  }

  try {
    const adminApi = await fetchRoute('/api/admin/reconcile-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: '00000000-0000-0000-0000-000000000000', decision: 'approve' })
    });
    // If not deployed yet on Vercel, might be 404; if deployed, must be 401
    assert(adminApi.status === 401 || adminApi.status === 404, `Admin Reconcile API protected without auth (status: ${adminApi.status})`);
  } catch (err: any) {
    assert(false, 'Admin Reconcile API protection check', err.message);
  }

  // --- 3. Payment Webhook Protection ---
  console.log('\n--- 3. Payment Webhook Signature Protection ---');
  try {
    const cfWebhook = await fetchRoute('/api/webhooks/cashfree', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { order: { order_id: 'test' } } })
    });
    assert(cfWebhook.status === 400 || cfWebhook.status === 401 || cfWebhook.status === 403, `Cashfree Webhook rejects forged payload (status: ${cfWebhook.status})`);
  } catch (err: any) {
    assert(false, 'Cashfree Webhook check', err.message);
  }

  try {
    const rzWebhook = await fetchRoute('/api/webhooks/razorpay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'payment.captured' })
    });
    assert(rzWebhook.status === 400 || rzWebhook.status === 401 || rzWebhook.status === 403, `Razorpay Webhook rejects unsigned payload (status: ${rzWebhook.status})`);
  } catch (err: any) {
    assert(false, 'Razorpay Webhook check', err.message);
  }

  try {
    const youpiWebhook = await fetchRoute('/api/webhooks/youpi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'observation' })
    });
    // YouPi webhook might be 401/403 or 404 if not yet deployed
    assert(youpiWebhook.status === 401 || youpiWebhook.status === 403 || youpiWebhook.status === 404, `YouPi Webhook rejects unauthenticated call (status: ${youpiWebhook.status})`);
  } catch (err: any) {
    assert(false, 'YouPi Webhook check', err.message);
  }

  // --- 4. Cron Endpoint Protection ---
  console.log('\n--- 4. Cron Endpoint Secret Protection ---');
  try {
    const cronNoAuth = await fetchRoute('/api/cron/release-expired-reservations', {
      method: 'GET'
    });
    assert(cronNoAuth.status === 401 || cronNoAuth.status === 403, `Cron endpoint rejects unauthenticated request (status: ${cronNoAuth.status})`);
  } catch (err: any) {
    assert(false, 'Cron unauthenticated check', err.message);
  }

  try {
    const cronBadAuth = await fetchRoute('/api/cron/release-expired-reservations', {
      method: 'GET',
      headers: { Authorization: 'Bearer INVALID_SECRET_TOKEN_XYZ' }
    });
    assert(cronBadAuth.status === 401 || cronBadAuth.status === 403, `Cron endpoint rejects forged token (status: ${cronBadAuth.status})`);
  } catch (err: any) {
    assert(false, 'Cron forged token check', err.message);
  }

  console.log('\n================================================================');
  console.log(`SMOKE TEST RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSmokeTests().catch(err => {
  console.error('Smoke test runner failed:', err);
  process.exit(1);
});
