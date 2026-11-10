import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';

// Mock server-only for standalone tsx script execution
const require = createRequire(import.meta.url);
const Module = require('module');
const origRequire = Module.prototype.require;
Module.prototype.require = function (id: string, ...args: any[]) {
  if (id === 'server-only') return {};
  return origRequire.apply(this, [id, ...args]);
};

// Load .env.local into process.env
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

async function runAvatarTests() {
  console.log('========================================================');
  console.log('🛡️ RUNNING ADMIN-MANAGED AVATAR SYSTEM AUDIT & TESTS');
  console.log('========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}${detail ? ` -> ${detail}` : ''}`);
      failed++;
    }
  }

  const {
    getActiveAvatars,
    getAllAvatarsAdmin,
    selectPlayerAvatar,
    createAdminAvatar,
    updateAdminAvatar,
    deleteAdminAvatar,
    DEFAULT_AVATAR_URL,
  } = await import('../services/avatarService');
  const { createAdminClient } = await import('../lib/supabase/admin');

  const adminClient = createAdminClient();

  // Find a test user from auth.users / profiles
  const { data: usersData } = await adminClient.auth.admin.listUsers();
  const testUser = usersData?.users?.[0];

  if (!testUser) {
    console.warn('⚠️ No registered users found in auth.users to test avatar profile assignment.');
    return;
  }
  const testUserId = testUser.id;

  // -----------------------------------------------------------
  // TEST GROUP 1: Query Active & Admin Avatars
  // -----------------------------------------------------------
  console.log('--- TEST GROUP 1: Library Retrieval & Seeding ---');

  const activeAvatars = await getActiveAvatars();
  assert(activeAvatars.length >= 6, `Active avatars populated (found ${activeAvatars.length})`);

  const defaultAvatar = activeAvatars.find((a) => a.image_url === '/avatars/default-avatar.svg');
  assert(Boolean(defaultAvatar), 'Official default eFootball avatar exists');

  const adminAvatars = await getAllAvatarsAdmin();
  assert(adminAvatars.length >= activeAvatars.length, 'Admin retrieval includes all library items');

  // -----------------------------------------------------------
  // TEST GROUP 2: Player Avatar Selection & Persistence
  // -----------------------------------------------------------
  console.log('\n--- TEST GROUP 2: Player Avatar Selection ---');

  const targetAvatar = activeAvatars.find((a) => a.name === 'Golden Champion') || activeAvatars[0];
  const selectRes = await selectPlayerAvatar(testUserId, targetAvatar.id);

  assert(selectRes.success, 'Valid active avatar selection succeeds');
  assert(
    selectRes.profile?.avatar_id === targetAvatar.id &&
      selectRes.profile?.avatar_url === targetAvatar.image_url,
    'Profile avatar_id and avatar_url updated synchronously'
  );

  // -----------------------------------------------------------
  // TEST GROUP 3: Security & Validation Guards
  // -----------------------------------------------------------
  console.log('\n--- TEST GROUP 3: Inactive & Non-Existent Avatar Rejections ---');

  // Create temporary inactive avatar
  const inactiveRes = await createAdminAvatar({
    name: `Test Staged Avatar ${Date.now()}`,
    imageUrl: '/avatars/test-staged.svg',
    category: 'Special',
    isActive: false,
    displayOrder: 999,
  });

  assert(inactiveRes.success && Boolean(inactiveRes.avatar), 'Admin creates staged inactive avatar');
  const inactiveAvatar = inactiveRes.avatar!;

  // Attempt selection of inactive avatar
  const blockedInactive = await selectPlayerAvatar(testUserId, inactiveAvatar.id);
  assert(
    !blockedInactive.success && blockedInactive.error?.includes('unavailable or inactive'),
    'Selection of inactive avatar is strictly rejected'
  );

  // Attempt selection with fake UUID
  const fakeUuid = '00000000-0000-0000-0000-000000000000';
  const blockedFake = await selectPlayerAvatar(testUserId, fakeUuid);
  assert(
    !blockedFake.success && blockedFake.error?.includes('does not exist'),
    'Selection of non-existent avatar ID is rejected'
  );

  // -----------------------------------------------------------
  // TEST GROUP 4: Admin Management & Safeguarded Deletion
  // -----------------------------------------------------------
  console.log('\n--- TEST GROUP 4: Safeguarded Deletion & Reassignment ---');

  // Create temporary active avatar and assign it to test user
  const tempActiveRes = await createAdminAvatar({
    name: `Temporary Active ${Date.now()}`,
    imageUrl: '/avatars/temp-active.svg',
    category: 'Strikers',
    isActive: true,
    displayOrder: 100,
  });
  const tempActive = tempActiveRes.avatar!;

  await selectPlayerAvatar(testUserId, tempActive.id);

  // Delete the avatar while test user is using it!
  const deleteRes = await deleteAdminAvatar(tempActive.id);
  assert(deleteRes.success, 'Admin safeguarded deletion succeeds');
  assert(deleteRes.reassignedCount >= 1, 'In-use avatar deletion reassigns active players');

  // Verify test user now has fallback default avatar
  const { data: updatedProfile } = await (adminClient.from('profiles') as any)
    .select('avatar_id, avatar_url')
    .eq('id', testUserId)
    .single();

  assert(
    updatedProfile.avatar_id !== tempActive.id &&
      (updatedProfile.avatar_url.includes('default-avatar.svg') || updatedProfile.avatar_url.includes('/avatars/')),
    'Player profile automatically migrated to valid default avatar without broken reference'
  );

  // Cleanup staged inactive avatar
  await deleteAdminAvatar(inactiveAvatar.id);

  // Re-select default avatar for clean state
  if (defaultAvatar) {
    await selectPlayerAvatar(testUserId, defaultAvatar.id);
  }

  // -----------------------------------------------------------
  // SUMMARY
  // -----------------------------------------------------------
  console.log('\n========================================================');
  console.log(`🎯 AVATAR SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================\n');

  if (failed > 0) process.exit(1);
}

runAvatarTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
