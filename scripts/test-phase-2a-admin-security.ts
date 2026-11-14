import {
  hasRequiredAdminRole,
  ADMIN_ROLE_RANK,
  type AdminRole,
  requireAdminRole,
  requireAdmin,
  requireSuperAdmin,
  requireFinancialAdmin,
} from '../lib/auth/server';

interface TestResult {
  id: string;
  name: string;
  category: string;
  status: 'PASS' | 'FAIL';
  details: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, id: string, name: string, category: string, details: string) {
  if (condition) {
    results.push({ id, name, category, status: 'PASS', details });
    console.log(`[PASS] ${id}: ${name} - ${details}`);
  } else {
    results.push({ id, name, category, status: 'FAIL', details: `FAILED: ${details}` });
    console.error(`[FAIL] ${id}: ${name} - ${details}`);
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('PHASE 2A: DATABASE-AUTHORITATIVE ADMIN SECURITY TEST SUITE');
  console.log('================================================================\n');

  // Test 1 — Anonymous Visitor
  try {
    process.env.TEST_AUTH_USER_EMAIL = 'none';
    let anonBlocked = false;
    try {
      await requireAdmin('moderator');
    } catch (e: any) {
      anonBlocked = e.message.includes('Authentication required') || e.message.includes('Unauthorized');
    }
    assert(anonBlocked, 'TEST-1.1', 'Anonymous Visitor Blocked from requireAdmin()', 'Identity: Anonymous', 'requireAdmin throws authentication error for anonymous visitor');
  } finally {
    delete process.env.TEST_AUTH_USER_EMAIL;
  }

  // Test 2 — Normal Player
  try {
    process.env.TEST_AUTH_USER_EMAIL = 'player_normal@test.internal';
    delete process.env.TEST_AUTH_ADMIN_ROLE;
    let playerBlockedAdmin = false;
    try {
      await requireAdmin('moderator');
    } catch (e: any) {
      playerBlockedAdmin = e.message.includes('Unauthorized') || e.message.includes('privileges');
    }
    assert(playerBlockedAdmin, 'TEST-2.1', 'Normal Player Blocked from Admin Actions', 'Identity: Normal Player', 'Normal player cannot execute moderator/admin actions');

    let playerBlockedSuper = false;
    try {
      await requireSuperAdmin();
    } catch (e: any) {
      playerBlockedSuper = e.message.includes('Unauthorized');
    }
    assert(playerBlockedSuper, 'TEST-2.2', 'Normal Player Blocked from Role Promotion', 'Identity: Normal Player', 'Normal player cannot promote roles or access super_admin actions');
  } finally {
    delete process.env.TEST_AUTH_USER_EMAIL;
    delete process.env.TEST_AUTH_ADMIN_ROLE;
  }

  // Test 3 — Streamer
  try {
    process.env.TEST_AUTH_USER_EMAIL = 'streamer@test.internal';
    process.env.TEST_AUTH_ADMIN_ROLE = 'streamer';

    // Streamer passes requireAdmin('streamer')
    const streamerAccess = await requireAdmin('streamer');
    assert(streamerAccess.role === 'streamer', 'TEST-3.1', 'Streamer Enters Admin Portal with Streamer Rank', 'Identity: Streamer', 'Streamer receives verified streamer role');

    // Streamer BLOCKED from tournament operations (requires admin)
    let streamerBlockedTournament = false;
    try {
      await requireAdmin('admin');
    } catch (e: any) {
      streamerBlockedTournament = e.message.includes('Unauthorized');
    }
    assert(streamerBlockedTournament, 'TEST-3.2', 'Streamer Blocked from Tournament Management', 'Identity: Streamer', 'Streamer cannot perform operations requiring admin privilege');

    // Streamer BLOCKED from role management (requires super_admin)
    let streamerBlockedRoles = false;
    try {
      await requireSuperAdmin();
    } catch (e: any) {
      streamerBlockedRoles = e.message.includes('Unauthorized');
    }
    assert(streamerBlockedRoles, 'TEST-3.3', 'Streamer Blocked from Role Management', 'Identity: Streamer', 'Streamer cannot perform super_admin operations');
  } finally {
    delete process.env.TEST_AUTH_USER_EMAIL;
    delete process.env.TEST_AUTH_ADMIN_ROLE;
  }

  // Test 4 — Moderator
  try {
    process.env.TEST_AUTH_USER_EMAIL = 'moderator@test.internal';
    process.env.TEST_AUTH_ADMIN_ROLE = 'moderator';

    // Moderator passes requireAdmin('moderator')
    const modAccess = await requireAdmin('moderator');
    assert(modAccess.role === 'moderator', 'TEST-4.1', 'Moderator Permitted for Moderation Actions', 'Identity: Moderator', 'Moderator successfully executes moderator-scoped actions');

    // Moderator BLOCKED from tournament creation (requires admin)
    let modBlockedTournament = false;
    try {
      await requireAdmin('admin');
    } catch (e: any) {
      modBlockedTournament = e.message.includes('Unauthorized');
    }
    assert(modBlockedTournament, 'TEST-4.2', 'Moderator Blocked from Full Admin Actions', 'Identity: Moderator', 'Moderator cannot perform admin-scoped tournament management');

    // Moderator BLOCKED from super_admin actions
    let modBlockedSuper = false;
    try {
      await requireSuperAdmin();
    } catch (e: any) {
      modBlockedSuper = e.message.includes('Unauthorized');
    }
    assert(modBlockedSuper, 'TEST-4.3', 'Moderator Blocked from Super Admin Actions', 'Identity: Moderator', 'Moderator cannot manage roles or critical settings');
  } finally {
    delete process.env.TEST_AUTH_USER_EMAIL;
    delete process.env.TEST_AUTH_ADMIN_ROLE;
  }

  // Test 5 — Admin
  try {
    process.env.TEST_AUTH_USER_EMAIL = 'admin_user@test.internal';
    process.env.TEST_AUTH_ADMIN_ROLE = 'admin';

    // Admin passes requireAdmin('admin')
    const adminAccess = await requireAdmin('admin');
    assert(adminAccess.role === 'admin', 'TEST-5.1', 'Admin Permitted for Tournament Management', 'Identity: Admin', 'Admin satisfies admin and moderator role requirements');

    // Admin passes requireFinancialAdmin()
    const finAccess = await requireFinancialAdmin();
    assert(finAccess.role === 'admin', 'TEST-5.2', 'Admin Permitted for Financial Operations', 'Identity: Admin', 'Admin satisfies requireFinancialAdmin() requirement');

    // Admin BLOCKED from super_admin actions
    let adminBlockedSuper = false;
    try {
      await requireSuperAdmin();
    } catch (e: any) {
      adminBlockedSuper = e.message.includes('Unauthorized');
    }
    assert(adminBlockedSuper, 'TEST-5.3', 'Admin Blocked from Super Admin Role Management', 'Identity: Admin', 'Admin cannot modify or promote administrator roles');
  } finally {
    delete process.env.TEST_AUTH_USER_EMAIL;
    delete process.env.TEST_AUTH_ADMIN_ROLE;
  }

  // Test 6 — Super Admin
  try {
    process.env.TEST_AUTH_USER_EMAIL = 'superadmin@test.internal';
    process.env.TEST_AUTH_ADMIN_ROLE = 'super_admin';

    // Super Admin passes all tiers
    const superAccess = await requireSuperAdmin();
    assert(superAccess.role === 'super_admin', 'TEST-6.1', 'Super Admin Has Elevated Owner Access', 'Identity: Super Admin', 'Super Admin satisfies requireSuperAdmin() requirement');

    const satisfiesAll =
      hasRequiredAdminRole('super_admin', 'super_admin') &&
      hasRequiredAdminRole('super_admin', 'admin') &&
      hasRequiredAdminRole('super_admin', 'moderator') &&
      hasRequiredAdminRole('super_admin', 'streamer');
    assert(satisfiesAll, 'TEST-6.2', 'Super Admin Hierarchy Invariant Satisfies All Tiers', 'Identity: Super Admin', 'Super Admin rank (40) dominates admin (30), moderator (20), streamer (10)');
  } finally {
    delete process.env.TEST_AUTH_USER_EMAIL;
    delete process.env.TEST_AUTH_ADMIN_ROLE;
  }

  // Test 7 — Revoked Administrator
  try {
    // Revoked user has no admin role in database
    process.env.TEST_AUTH_USER_EMAIL = 'revoked_admin@test.internal';
    process.env.TEST_AUTH_ADMIN_ROLE = ''; // Revoked: role is null/empty

    let revokedBlocked = false;
    try {
      await requireAdmin('streamer');
    } catch (e: any) {
      revokedBlocked = e.message.includes('Unauthorized');
    }
    assert(revokedBlocked, 'TEST-7.1', 'Revoked Administrator Immediately Loses Privileges', 'Identity: Revoked Admin', 'Account stripped of database role fails requireAdmin immediately');
  } finally {
    delete process.env.TEST_AUTH_USER_EMAIL;
    delete process.env.TEST_AUTH_ADMIN_ROLE;
  }

  // Test 8 — Demoted Administrator
  try {
    // Demoted from super_admin to moderator
    process.env.TEST_AUTH_USER_EMAIL = 'demoted_user@test.internal';
    process.env.TEST_AUTH_ADMIN_ROLE = 'moderator';

    const demotedModAccess = await requireAdmin('moderator');
    assert(demotedModAccess.role === 'moderator', 'TEST-8.1', 'Demoted User Exercises Only New Role', 'Identity: Demoted Admin', 'Demoted user passes moderator checks');

    let demotedBlockedSuper = false;
    try {
      await requireSuperAdmin();
    } catch (e: any) {
      demotedBlockedSuper = e.message.includes('Unauthorized');
    }
    assert(demotedBlockedSuper, 'TEST-8.2', 'Demoted User Retains No Prior Super Admin Privileges', 'Identity: Demoted Admin', 'Demoted user is immediately rejected from super_admin actions');
  } finally {
    delete process.env.TEST_AUTH_USER_EMAIL;
    delete process.env.TEST_AUTH_ADMIN_ROLE;
  }

  // Test 9 — Hardcoded Email Bypass Prevention (F-07 Resolution)
  try {
    // Account with email 'ye.agrajj@gmail.com', but revoked in database (TEST_AUTH_ADMIN_ROLE is empty)
    process.env.TEST_AUTH_USER_EMAIL = 'ye.agrajj@gmail.com';
    delete process.env.TEST_AUTH_ADMIN_ROLE;

    let hardcodedEmailBlocked = false;
    try {
      await requireAdmin('moderator');
    } catch (e: any) {
      hardcodedEmailBlocked = e.message.includes('Unauthorized');
    }
    assert(
      hardcodedEmailBlocked,
      'TEST-9.1',
      'Hardcoded Email Cannot Bypass Database Revocation',
      'F-07 Hardcoded Bypass Prevention',
      'Account with ye.agrajj@gmail.com but revoked database record is blocked from requireAdmin'
    );

    let hardcodedEmailBlockedSuper = false;
    try {
      await requireSuperAdmin();
    } catch (e: any) {
      hardcodedEmailBlockedSuper = e.message.includes('Unauthorized');
    }
    assert(
      hardcodedEmailBlockedSuper,
      'TEST-9.2',
      'Hardcoded Email Does Not Auto-Restore to Super Admin',
      'F-07 Hardcoded Bypass Prevention',
      'Login or request does not silently restore super_admin privileges without database record'
    );
  } finally {
    delete process.env.TEST_AUTH_USER_EMAIL;
    delete process.env.TEST_AUTH_ADMIN_ROLE;
  }

  // Test 10 — Role Hierarchy & Strict Rank Monotonicity
  const rankIntegrity =
    ADMIN_ROLE_RANK['super_admin'] === 40 &&
    ADMIN_ROLE_RANK['admin'] === 30 &&
    ADMIN_ROLE_RANK['moderator'] === 20 &&
    ADMIN_ROLE_RANK['streamer'] === 10;
  assert(rankIntegrity, 'TEST-10.1', 'Role Hierarchy Strict Monotonicity', 'Role RBAC Invariant', 'super_admin(40) > admin(30) > moderator(20) > streamer(10)');

  const nonAdminFails =
    !hasRequiredAdminRole(null, 'streamer') &&
    !hasRequiredAdminRole(undefined, 'streamer') &&
    !hasRequiredAdminRole('player', 'streamer') &&
    !hasRequiredAdminRole('unknown_role', 'streamer');
  assert(nonAdminFails, 'TEST-10.2', 'Invalid or Player Roles Fail Closed', 'Role RBAC Invariant', 'null, undefined, player, or unknown roles return false on all role checks');

  console.log('\n================================================================');
  console.log(`TOTAL TESTS: ${results.length} | PASS: ${results.filter((r) => r.status === 'PASS').length} | FAIL: ${results.filter((r) => r.status === 'FAIL').length}`);
  console.log('================================================================\n');

  const fs = require('fs');
  fs.writeFileSync(
    'reports/player-experience/phase2a_test_results.json',
    JSON.stringify(results, null, 2)
  );
  console.log('Test results written to reports/player-experience/phase2a_test_results.json');
}

runTests().catch((err) => {
  console.error('Fatal error running test suite:', err);
  process.exit(1);
});
