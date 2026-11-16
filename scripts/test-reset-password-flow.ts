import { getAppUrl, getAuthRedirectUrl } from '../lib/auth/url';
import { resetPasswordSchema } from '../lib/validations';

async function runTests() {
  console.log('--- STARTING PASSWORD RESET FLOW INTEGRATION TESTS ---');

  // Test 1: URL Resolver
  console.log('\n[Test 1] Testing Auth URL Resolution...');
  const appUrl = getAppUrl();
  const authRedirect = getAuthRedirectUrl('/auth/callback?type=recovery&next=/reset-password');
  console.log('App URL:', appUrl);
  console.log('Redirect URL:', authRedirect);

  if (!authRedirect.includes('/auth/callback?type=recovery&next=/reset-password')) {
    throw new Error('Redirect URL missing recovery parameter');
  }
  console.log('✓ Test 1 Passed: Auth URL Resolution is correct.');

  // Test 2: Validation Schema
  console.log('\n[Test 2] Testing resetPasswordSchema validation...');
  // Too short (< 8 chars)
  const shortResult = resetPasswordSchema.safeParse({
    password: 'short',
    confirmPassword: 'short',
  });
  if (shortResult.success) {
    throw new Error('Short password should have failed validation');
  }

  // Mismatch
  const mismatchResult = resetPasswordSchema.safeParse({
    password: 'SecurePassword123!',
    confirmPassword: 'DifferentPassword123!',
  });
  if (mismatchResult.success) {
    throw new Error('Mismatched passwords should have failed validation');
  }

  // Valid (8+ chars and matching)
  const validResult = resetPasswordSchema.safeParse({
    password: 'SecurePassword123!',
    confirmPassword: 'SecurePassword123!',
  });
  if (!validResult.success) {
    throw new Error('Valid password rejected: ' + JSON.stringify(validResult.error));
  }
  console.log('✓ Test 2 Passed: Zod schema validates 8+ chars and confirmation match correctly.');

  // Test 3: HTTP Route Availability
  console.log('\n[Test 3] Testing HTTP Routes on local server...');
  const routes = [
    '/reset-password',
    '/auth/reset-password',
    '/forgot-password',
    '/reset-password?error=access_denied&error_code=otp_expired',
  ];

  for (const route of routes) {
    const url = `http://localhost:3000${route}`;
    try {
      const res = await fetch(url);
      console.log(`Fetch ${route} -> Status ${res.status}`);
      if (res.status !== 200) {
        throw new Error(`Route ${route} returned status ${res.status}`);
      }
    } catch (err: any) {
      console.error(`Failed to fetch ${url}:`, err.message);
      throw err;
    }
  }
  console.log('✓ Test 3 Passed: All reset password and forgot password routes respond with HTTP 200.');

  console.log('\n--- ALL PASSWORD RESET FLOW TESTS PASSED SUCCESSFULLY! ---');
}

runTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
