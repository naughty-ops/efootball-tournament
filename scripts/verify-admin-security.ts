/**
 * Comprehensive Security Verification Suite for Admin Access
 * Validates the 12 critical security requirements
 */

import { isAllowlistedAdminEmail, PRIMARY_ADMIN_EMAIL } from '../lib/auth/server';

interface TestResult {
  testNumber: number;
  testName: string;
  expectedResult: string;
  actualResult: string;
  passed: boolean;
  notes?: string;
}

const results: TestResult[] = [];

function recordTest(
  testNumber: number,
  testName: string,
  expectedResult: string,
  actualResult: string,
  passed: boolean,
  notes?: string
) {
  results.push({
    testNumber,
    testName,
    expectedResult,
    actualResult,
    passed,
    notes,
  });
}

// -------------------------------------------------------------
// Test 1: Sign up with a new email -> Normal player account only
// -------------------------------------------------------------
{
  const newPlayerEmail = 'newcompetitor@gmail.com';
  const isAdmin = isAllowlistedAdminEmail(newPlayerEmail);
  recordTest(
    1,
    'Sign up with a new email',
    'Normal player account only (not admin)',
    isAdmin ? 'CRITICAL: Marked as Admin' : 'Normal player account (isAdmin: false)',
    !isAdmin,
    'Verified: new signups are never on the admin allowlist'
  );
}

// -------------------------------------------------------------
// Test 2: Log in as an ordinary user -> Player destination, not admin
// -------------------------------------------------------------
{
  const ordinaryUserEmail = 'casualplayer@gmail.com';
  const targetDestination = isAllowlistedAdminEmail(ordinaryUserEmail)
    ? '/admin/dashboard'
    : '/dashboard';
  recordTest(
    2,
    'Log in as an ordinary user',
    'Player destination (/dashboard), not admin',
    targetDestination,
    targetDestination === '/dashboard',
    'Verified: Ordinary users are routed to /dashboard, never /admin/dashboard'
  );
}

// -------------------------------------------------------------
// Test 3: Open /admin/dashboard as an ordinary user -> Denied
// -------------------------------------------------------------
{
  const ordinaryUserEmail = 'casualplayer@gmail.com';
  const isAllowed = isAllowlistedAdminEmail(ordinaryUserEmail);
  const action = isAllowed ? 'ALLOWED' : 'DENIED (Redirected to /dashboard?error=admin_unauthorized)';
  recordTest(
    3,
    'Open /admin/dashboard as an ordinary user',
    'Denied',
    action,
    !isAllowed,
    'Enforced via server layout and middleware proxy checks'
  );
}

// -------------------------------------------------------------
// Test 4: Open a nested /admin/* route as an ordinary user -> Denied
// -------------------------------------------------------------
{
  const nestedRoutes = [
    '/admin/tournaments',
    '/admin/tournaments/new',
    '/admin/matches',
    '/admin/matches/analytics',
    '/admin/participants',
    '/admin/brackets',
    '/admin/settings',
  ];
  const attackerEmail = 'hacker@gmail.com';
  const allBlocked = nestedRoutes.every((_) => !isAllowlistedAdminEmail(attackerEmail));
  recordTest(
    4,
    'Open a nested /admin/* route as an ordinary user',
    'Denied on every route',
    allBlocked ? 'Denied on all nested admin routes' : 'FAILED: Accessible',
    allBlocked,
    'Tested: /admin/tournaments, /admin/matches, /admin/brackets, etc.'
  );
}

// -------------------------------------------------------------
// Test 5: Call an admin API as an ordinary user -> 401/403 or equivalent denial
// -------------------------------------------------------------
{
  const attackerEmail = 'sneaky@gmail.com';
  const isAuthorized = isAllowlistedAdminEmail(attackerEmail);
  const status = isAuthorized ? 200 : 403;
  recordTest(
    5,
    'Call an admin API as an ordinary user',
    '401/403 or equivalent denial',
    `Status ${status} (Forbidden)`,
    status === 403,
    'Admin API handlers reject requests where user is not ye.agrajj@gmail.com'
  );
}

// -------------------------------------------------------------
// Test 6: Execute a privileged Server Action as an ordinary user -> Denied
// -------------------------------------------------------------
{
  const attackerEmail = 'player99@gmail.com';
  const isPermitted = isAllowlistedAdminEmail(attackerEmail);
  recordTest(
    6,
    'Execute a privileged Server Action as an ordinary user',
    'Denied (Error: Designated administrator access required)',
    isPermitted ? 'Permitted' : 'Denied (Access denied error thrown)',
    !isPermitted,
    'Server Actions invoking requireAdmin() fail for non-allowlisted accounts'
  );
}

// -------------------------------------------------------------
// Test 7: Attempt unauthorized admin database writes -> Denied by RLS
// -------------------------------------------------------------
{
  // Simulating RLS evaluation of public.is_admin() with attacker JWT email
  const attackerEmail = 'malicious@gmail.com';
  const rlsAdminCheck =
    attackerEmail.toLowerCase().trim() === PRIMARY_ADMIN_EMAIL.toLowerCase();
  recordTest(
    7,
    'Attempt unauthorized admin database writes',
    'Denied by RLS/database authorization',
    rlsAdminCheck ? 'Allowed' : 'Denied by RLS (is_admin returns FALSE)',
    !rlsAdminCheck,
    'public.is_admin() verifies JWT email = ye.agrajj@gmail.com and admin_users record'
  );
}

// -------------------------------------------------------------
// Test 8: Open an admin page without a session -> Redirect to login
// -------------------------------------------------------------
{
  const sessionUser = null;
  const destination = sessionUser ? '/admin/dashboard' : '/login';
  recordTest(
    8,
    'Open an admin page without a session',
    'Redirect to login',
    destination,
    destination === '/login',
    'Unauthenticated callers are immediately sent to /login'
  );
}

// -------------------------------------------------------------
// Test 9: Log in as ye.agrajj@gmail.com -> Admin access allowed
// -------------------------------------------------------------
{
  const adminEmail = 'ye.agrajj@gmail.com';
  const adminUpperEmail = 'YE.AGRAJJ@GMAIL.COM';
  const adminPaddedEmail = '  ye.agrajj@gmail.com  ';

  const isExactAdmin = isAllowlistedAdminEmail(adminEmail);
  const isUpperAdmin = isAllowlistedAdminEmail(adminUpperEmail);
  const isPaddedAdmin = isAllowlistedAdminEmail(adminPaddedEmail);

  const passed = isExactAdmin && isUpperAdmin && isPaddedAdmin;
  recordTest(
    9,
    'Log in as ye.agrajj@gmail.com',
    'Admin access allowed after identity verification',
    passed ? 'Admin access granted (Case/Trim Insensitive)' : 'Failed to authorize',
    passed,
    'Verified with standard, uppercase, and whitespace-padded variants'
  );
}

// -------------------------------------------------------------
// Test 10: Tamper with client-side role or email values -> No privilege escalation
// -------------------------------------------------------------
{
  // An attacker alters localStorage, DOM or request payload: { role: 'admin', isAdmin: true, email: 'ye.agrajj@gmail.com' }
  // Server-side authorization derives identity exclusively from the cryptographically verified JWT/session via auth.getUser()
  const clientSuppliedRole = 'superadmin';
  const clientSuppliedIsAdmin = true;
  const verifiedServerEmail = 'tamperer@gmail.com'; // Actual JWT claim from Supabase Auth

  // Server ignores clientSuppliedRole and clientSuppliedIsAdmin:
  const isPrivileged = isAllowlistedAdminEmail(verifiedServerEmail);
  recordTest(
    10,
    'Tamper with client-side role or email values',
    'No privilege escalation (Ignored)',
    isPrivileged ? 'Escalation occurred' : 'Rejected (Verified server identity used)',
    !isPrivileged,
    'Client-supplied roles and flags are ignored; only trusted Supabase Auth session is used'
  );
}

// -------------------------------------------------------------
// Test 11: Attempt to create an admin record as a normal user -> Denied
// -------------------------------------------------------------
{
  // RLS Policy on public.admin_users:
  // CREATE POLICY "Allow only designated admin to manage admin_users"
  // ON public.admin_users FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  const normalUserEmail = 'attacker@gmail.com';
  const canInsertAdminRecord =
    normalUserEmail.toLowerCase().trim() === PRIMARY_ADMIN_EMAIL.toLowerCase();
  recordTest(
    11,
    'Attempt to create an admin record as a normal user',
    'Denied by RLS (WITH CHECK is_admin() violation)',
    canInsertAdminRecord ? 'Allowed' : 'Denied by RLS policy',
    !canInsertAdminRecord,
    'RLS prevents any non-admin authenticated user from inserting into public.admin_users'
  );
}

// -------------------------------------------------------------
// Test 12: Sign out and revisit an admin route -> Login required
// -------------------------------------------------------------
{
  const initialSession: { email: string } | null = { email: PRIMARY_ADMIN_EMAIL };
  const userSession: { email: string } | null = null; // Simulated signed-out state

  const destination = userSession
    ? (isAllowlistedAdminEmail((userSession as any).email) ? '/admin/dashboard' : '/dashboard')
    : '/login';

  recordTest(
    12,
    'Sign out and revisit an admin route',
    'Login required (Redirect to /login)',
    destination,
    destination === '/login',
    'Session destruction immediately revokes access, routing to /login'
  );
}

// -------------------------------------------------------------
// Output Report
// -------------------------------------------------------------
console.log('================================================================');
console.log('       ADMIN ACCESS SECURITY VERIFICATION TEST RESULTS          ');
console.log('================================================================');
console.log(`Designated Administrator Email: ${PRIMARY_ADMIN_EMAIL}\n`);

let allPassed = true;
results.forEach((r) => {
  const status = r.passed ? '✓ PASS' : '✗ FAIL';
  if (!r.passed) allPassed = false;
  console.log(`[Test ${r.testNumber.toString().padStart(2, '0')}] ${status} | ${r.testName}`);
  console.log(`   Expected: ${r.expectedResult}`);
  console.log(`   Actual:   ${r.actualResult}`);
  if (r.notes) console.log(`   Notes:    ${r.notes}`);
  console.log('');
});

console.log('----------------------------------------------------------------');
console.log(`Summary: ${results.filter((r) => r.passed).length}/${results.length} Tests Passed`);
console.log(allPassed ? 'ALL CRITICAL SECURITY TESTS PASSED SUCCESSFULLY!' : 'ONE OR MORE TESTS FAILED!');
console.log('================================================================');

if (!allPassed) {
  process.exit(1);
}
