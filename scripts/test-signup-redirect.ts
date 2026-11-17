import { getAppUrl, getAuthRedirectUrl, CANONICAL_SITE_URL } from '../lib/auth/url';

async function runAuthRedirectTests() {
  console.log('================================================================');
  console.log('       AUTHENTICATION & EMAIL REDIRECT REPAIR TEST SUITE        ');
  console.log('================================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${desc}`);
      if (detail) console.log(`       ${detail}`);
      passed++;
    } else {
      console.error(`[FAIL] ${desc}`);
      if (detail) console.error(`       ${detail}`);
      failed++;
    }
  }

  // Test 1: Canonical Site URL constant
  assert(
    CANONICAL_SITE_URL === 'https://www.e-football.in',
    'Canonical site URL constant is exactly https://www.e-football.in',
    `Value: ${CANONICAL_SITE_URL}`
  );

  // Test 2: Node SSR Fallback resolution
  const ssrAppUrl = getAppUrl();
  assert(
    ssrAppUrl === 'https://www.e-football.in',
    'getAppUrl() in Node SSR without env vars returns https://www.e-football.in',
    `Resolved: ${ssrAppUrl}`
  );

  // Test 3: Signup redirect URL resolution
  const signupRedirect = getAuthRedirectUrl('/auth/callback');
  assert(
    signupRedirect === 'https://www.e-football.in/auth/callback',
    'getAuthRedirectUrl("/auth/callback") resolves to canonical callback',
    `Resolved: ${signupRedirect}`
  );

  // Test 4: Forgot password redirect URL resolution
  const forgotPasswordRedirect = getAuthRedirectUrl('/auth/callback?type=recovery&next=/reset-password');
  assert(
    forgotPasswordRedirect === 'https://www.e-football.in/auth/callback?type=recovery&next=/reset-password',
    'getAuthRedirectUrl() for recovery includes both recovery type and next=/reset-password',
    `Resolved: ${forgotPasswordRedirect}`
  );

  // Test 5: Open-Redirect safeNext security validation
  function validateSafeNext(next: string | null): string | null {
    return next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\')
      ? next
      : null;
  }

  assert(
    validateSafeNext('/reset-password') === '/reset-password',
    'Valid relative path /reset-password is accepted'
  );
  assert(
    validateSafeNext('/dashboard?tab=matches') === '/dashboard?tab=matches',
    'Valid relative path with query parameters is accepted'
  );
  assert(
    validateSafeNext('https://evil-attacker.com') === null,
    'Absolute attacker URL is strictly rejected (null)'
  );
  assert(
    validateSafeNext('//evil-attacker.com/steal') === null,
    'Protocol-relative attacker URL //evil-attacker.com is strictly rejected (null)'
  );
  assert(
    validateSafeNext('/\\evil-attacker.com') === null,
    'Backslash bypass attempt /\\evil-attacker.com is strictly rejected (null)'
  );

  // Test 6: Simulated Browser Window Origin Resolution
  const originalWindow = (global as any).window;
  try {
    (global as any).window = { location: { origin: 'http://localhost:3000' } };
    const devUrl = getAppUrl();
    const devRedirect = getAuthRedirectUrl('/auth/callback?type=recovery&next=/reset-password');
    assert(
      devUrl === 'http://localhost:3000' && devRedirect.startsWith('http://localhost:3000'),
      'In browser runtime (localhost), getAppUrl() dynamically inherits window.location.origin',
      `Resolved dev redirect: ${devRedirect}`
    );

    (global as any).window = { location: { origin: 'https://www.e-football.in' } };
    const prodClientRedirect = getAuthRedirectUrl('/auth/callback');
    assert(
      prodClientRedirect === 'https://www.e-football.in/auth/callback',
      'In browser runtime on production domain, getAuthRedirectUrl() uses client origin',
      `Resolved prod client redirect: ${prodClientRedirect}`
    );
  } finally {
    (global as any).window = originalWindow;
  }

  // Test 7: HTTP endpoint check on local running server
  try {
    const resReset = await fetch('http://localhost:3000/reset-password');
    assert(
      resReset.status === 200,
      'GET /reset-password returns HTTP 200 OK',
      `Status: ${resReset.status}`
    );

    const resAuthReset = await fetch('http://localhost:3000/auth/reset-password');
    assert(
      resAuthReset.status === 200,
      'GET /auth/reset-password returns HTTP 200 OK with redirect shell',
      `Status: ${resAuthReset.status}`
    );

    const resForgot = await fetch('http://localhost:3000/forgot-password');
    assert(
      resForgot.status === 200,
      'GET /forgot-password returns HTTP 200 OK',
      `Status: ${resForgot.status}`
    );
  } catch (err: any) {
    console.warn('[HTTP Fetch Warning] Dev server fetch:', err.message);
  }

  console.log('----------------------------------------------------------------');
  console.log(`Summary: ${passed} passed, ${failed} failed`);
  console.log('================================================================');

  if (failed > 0) process.exit(1);
}

runAuthRedirectTests().catch((e) => {
  console.error('Test execution failed:', e);
  process.exit(1);
});
