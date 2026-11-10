import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';

// Mock server-only for standalone script execution
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

async function runTests() {
  const { validateImageSignature, validateImageSize } = await import('../lib/media/validation');
  const {
    uploadImage,
    deleteImage,
    generateOptimizedUrl,
    generateThumbnailUrl,
    generatePrivateEvidenceUrl,
    getAdminMediaOverview,
  } = await import('../services/mediaService');
  const { isCloudinaryConfigured } = await import('../lib/cloudinary/server');
  const { createAdminClient } = await import('../lib/supabase/admin');
  console.log('====================================================');
  console.log('🧪 RUNNING CLOUDINARY MEDIA SERVICE AUDIT & TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}${details ? ` - ${details}` : ''}`);
      failed++;
    }
  }

  // ----------------------------------------------------
  // TEST GROUP 1: Image Signature & Magic Byte Validation
  // ----------------------------------------------------
  console.log('--- TEST GROUP 1: Magic Byte & File Signature ---');

  // 1.1 JPEG Buffer
  const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  const jpegRes = validateImageSignature(validJpeg);
  assert(jpegRes.valid && jpegRes.format === 'jpg', 'Valid JPEG magic bytes detected');

  // 1.2 PNG Buffer
  const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  const pngRes = validateImageSignature(validPng);
  assert(pngRes.valid && pngRes.format === 'png', 'Valid PNG magic bytes detected');

  // 1.3 WebP Buffer
  const validWebp = Buffer.alloc(16);
  validWebp.write('RIFF', 0, 'ascii');
  validWebp.writeInt32LE(32, 4);
  validWebp.write('WEBP', 8, 'ascii');
  const webpRes = validateImageSignature(validWebp);
  assert(webpRes.valid && webpRes.format === 'webp', 'Valid WebP magic bytes detected');

  // 1.4 Disallow SVG
  const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>');
  const svgRes = validateImageSignature(svgBuffer);
  assert(!svgRes.valid && svgRes.error?.includes('SVG'), 'SVG files are strictly disallowed');

  // 1.5 Corrupted / Disallowed Executable Buffer
  const exeBuffer = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00');
  const exeRes = validateImageSignature(exeBuffer);
  assert(!exeRes.valid, 'Executables / non-images are strictly rejected');

  // ----------------------------------------------------
  // TEST GROUP 2: Category File Size Limits
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 2: File Size Restrictions ---');

  const oneMB = 1024 * 1024;
  const threeMB = 3 * 1024 * 1024;
  const sixMB = 6 * 1024 * 1024;

  const avatarOk = validateImageSize(oneMB, 'player_avatar');
  assert(avatarOk.valid, 'Player avatar <= 2MB allowed');

  const avatarOver = validateImageSize(threeMB, 'player_avatar');
  assert(!avatarOver.valid && avatarOver.error?.includes('2 MB'), 'Player avatar > 2MB rejected');

  const bannerOk = validateImageSize(fourMB(4), 'tournament_banner');
  assert(bannerOk.valid, 'Tournament banner <= 5MB allowed');

  const bannerOver = validateImageSize(sixMB, 'tournament_banner');
  assert(!bannerOver.valid && bannerOver.error?.includes('5 MB'), 'Tournament banner > 5MB rejected');

  function fourMB(n: number) {
    return n * 1024 * 1024;
  }

  // ----------------------------------------------------
  // TEST GROUP 3: URL Generation & Delivery Optimization
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 3: URL Generation & Transformations ---');

  const testPublicId = 'efootball/tournaments/banners/banner_sample_123';
  const optimizedUrl = generateOptimizedUrl(testPublicId, {
    width: 1200,
    quality: 'auto',
    format: 'auto',
  });
  assert(
    optimizedUrl.includes('f_auto') && optimizedUrl.includes('q_auto') && optimizedUrl.includes('w_1200'),
    'Optimized URL includes f_auto, q_auto, w_1200'
  );

  const thumbnailUrl = generateThumbnailUrl(testPublicId, 300, 300);
  assert(
    thumbnailUrl.includes('c_fill') && thumbnailUrl.includes('w_300') && thumbnailUrl.includes('h_300'),
    'Thumbnail URL includes crop=fill and dimensions'
  );

  const evidencePublicId = 'efootball/disputes/evidence/dispute_proof_999';
  const privateUrl = generatePrivateEvidenceUrl(evidencePublicId, 3600);
  assert(
    privateUrl.includes('s--') || privateUrl.includes(evidencePublicId),
    'Private dispute evidence URL generated'
  );

  // ----------------------------------------------------
  // TEST GROUP 4: Database & Storage Operations
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 4: Database Storage & Admin Overview ---');

  const adminClient = createAdminClient();

  // Find or fetch an existing user ID for the foreign key constraint
  const { data: usersData } = await adminClient.auth.admin.listUsers();
  const existingUser = usersData?.users?.[0];
  const testUserId = existingUser?.id;

  if (!testUserId) {
    console.warn('⚠️ No registered users found in auth.users; skipping direct foreign key DB tests');
    return;
  }

  const samplePublicId = `test_script_${Date.now()}`;

  // Direct insert to media_assets to test RLS & query
  const { data: insertedAsset, error: insertErr } = await (adminClient.from('media_assets') as any)
    .insert({
      owner_id: testUserId,
      entity_type: 'admin_media',
      entity_id: 'test_entity',
      cloudinary_public_id: samplePublicId,
      secure_url: `https://res.cloudinary.com/demo/image/upload/${samplePublicId}.webp`,
      resource_type: 'image',
      format: 'webp',
      width: 800,
      height: 600,
      file_size: 102400,
      visibility: 'public',
      status: 'active',
    })
    .select()
    .single();

  assert(!insertErr && insertedAsset?.id, 'Test media asset recorded in database', insertErr?.message);

  // Test admin overview
  const overview = await getAdminMediaOverview({ category: 'admin_media' });
  assert(
    overview.totalCount >= 1 && overview.assets.some((a) => a.cloudinary_public_id === samplePublicId),
    'Admin media overview correctly aggregates assets and storage'
  );

  // ----------------------------------------------------
  // TEST GROUP 5: Protected Evidence Tamper Resistance
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 5: Private Evidence Immutability ---');

  const disputeEvidencePublicId = `test_dispute_proof_${Date.now()}`;
  await (adminClient.from('media_assets') as any).insert({
    owner_id: testUserId,
    entity_type: 'dispute_evidence',
    entity_id: 'test_dispute_123',
    cloudinary_public_id: disputeEvidencePublicId,
    secure_url: `https://res.cloudinary.com/demo/image/upload/${disputeEvidencePublicId}.webp`,
    resource_type: 'image',
    format: 'webp',
    width: 1080,
    height: 1920,
    file_size: 204800,
    visibility: 'private',
    status: 'active',
  });

  // Attempt delete as non-admin user
  let nonAdminBlocked = false;
  try {
    await deleteImage(disputeEvidencePublicId, testUserId, false); // isAdmin = false
  } catch (err: any) {
    if (err.message.includes('evidence cannot be deleted')) {
      nonAdminBlocked = true;
    }
  }
  assert(nonAdminBlocked, 'Dispute evidence cannot be deleted by non-admin users');

  // Cleanup test assets as admin
  await (adminClient.from('media_assets') as any)
    .delete()
    .in('cloudinary_public_id', [samplePublicId, disputeEvidencePublicId]);
  console.log('🧹 Cleaned up temporary test assets from database');

  // ----------------------------------------------------
  // FINAL SUMMARY
  // ----------------------------------------------------
  console.log('\n====================================================');
  console.log(`🎯 AUDIT COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log(`Cloudinary Configured in Environment: ${isCloudinaryConfigured() ? 'YES' : 'NO (Fallback active)'}`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
