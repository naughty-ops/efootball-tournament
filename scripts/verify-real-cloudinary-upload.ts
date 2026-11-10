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

async function verifyRealUpload() {
  console.log('================================================================');
  console.log('🚀 LIVE CLOUDINARY UPLOAD VERIFICATION TEST (CLOUD: l5hy2qmt)');
  console.log('================================================================\n');

  // STEP 1: Verify environment variables
  console.log('[STEP 1] Checking Environment Variables...');
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();

  const missing: string[] = [];
  if (!cloudName) missing.push('CLOUDINARY_CLOUD_NAME');
  if (!apiKey) missing.push('CLOUDINARY_API_KEY');
  if (!apiSecret) missing.push('CLOUDINARY_API_SECRET');

  if (missing.length > 0) {
    console.error('❌ Missing environment variables:', missing.join(', '));
    process.exit(1);
  }

  console.log('✅ All 3 Cloudinary environment variables are loaded and non-empty.');
  console.log(`   Cloud Name: ${cloudName}`);
  console.log(`   API Key: ${apiKey.slice(0, 4)}...${apiKey.slice(-4)} (Configured)`);
  console.log(`   API Secret: [REDACTED] (Configured, length: ${apiSecret.length})\n`);

  const { uploadImage } = await import('../services/mediaService');
  const { createAdminAvatar } = await import('../services/avatarService');
  const { getCloudinary } = await import('../lib/cloudinary/server');
  const { createAdminClient } = await import('../lib/supabase/admin');

  // STEP 2: Create a real, valid JPEG image buffer
  // Standard minimal valid 1x1 JPEG
  const validJpeg = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
    0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
    0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
    0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
    0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
    0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
    0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
    0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
    0x00, 0xbf, 0x00, 0xff, 0xd9,
  ]);

  console.log(`[STEP 2] Prepared real test JPEG buffer (${validJpeg.length} bytes)...\n`);

  // STEP 3: Execute real upload through mediaService.uploadImage (used by /admin/avatars)
  console.log('[STEP 3] Uploading real JPEG to Cloudinary via uploadImage()...');
  const adminId = '30080df7-5188-4630-b597-b8493ebe045d'; // Allowlisted administrator ye.agrajj@gmail.com
  const uploadStartTime = Date.now();

  const uploadedAsset = await uploadImage(validJpeg, {
    category: 'admin_media',
    userId: adminId,
    visibility: 'public',
  });
  const uploadDuration = Date.now() - uploadStartTime;

  console.log('✅ Cloudinary upload returned HTTP success!');
  console.log(`   Duration: ${uploadDuration}ms`);
  console.log(`   Public ID: ${uploadedAsset.cloudinary_public_id}`);
  console.log(`   Secure URL: ${uploadedAsset.secure_url}`);
  console.log(`   Format: ${uploadedAsset.format}`);
  console.log(`   Resource Type: ${uploadedAsset.resource_type}`);
  console.log(`   File Size: ${uploadedAsset.file_size} bytes\n`);

  // STEP 4: Verify the asset exists directly in Cloudinary Assets via Cloudinary Admin API
  console.log('[STEP 4] Querying Cloudinary Admin API for asset in cloud l5hy2qmt...');
  const cloudinary = getCloudinary();
  const remoteAsset = await cloudinary.api.resource(uploadedAsset.cloudinary_public_id);

  console.log('✅ Asset confirmed on Cloudinary servers:');
  console.log(`   Remote public_id: ${remoteAsset.public_id}`);
  console.log(`   Remote format: ${remoteAsset.format}`);
  console.log(`   Remote bytes: ${remoteAsset.bytes}`);
  console.log(`   Remote created_at: ${remoteAsset.created_at}`);
  console.log(`   Remote secure_url: ${remoteAsset.secure_url}\n`);

  // STEP 5: Create Avatar in avatar library table (as done in /admin/avatars)
  console.log('[STEP 5] Creating Avatar library record with Cloudinary public_id...');
  const avatarRes = await createAdminAvatar({
    name: `Official Verification Avatar ${Date.now().toString().slice(-4)}`,
    imageUrl: uploadedAsset.secure_url,
    cloudinaryPublicId: uploadedAsset.cloudinary_public_id,
    category: 'General',
    displayOrder: 1,
    isActive: true,
  });

  if (!avatarRes.success || !avatarRes.avatar) {
    console.error('❌ Failed to create avatar record:', avatarRes.error);
    process.exit(1);
  }

  const avatar = avatarRes.avatar;
  console.log('✅ Avatar record inserted in Supabase avatars table:');
  console.log(`   Avatar ID: ${avatar.id}`);
  console.log(`   Name: ${avatar.name}`);
  console.log(`   Image URL: ${avatar.image_url}`);
  console.log(`   Cloudinary Public ID: ${avatar.cloudinary_public_id}\n`);

  // STEP 6: Verify Database Record directly from Supabase
  console.log('[STEP 6] Verifying database record directly from Supabase...');
  const adminClient = createAdminClient();
  const { data: dbAvatar, error: dbErr } = await (adminClient.from('avatars') as any)
    .select('*')
    .eq('id', avatar.id)
    .single();

  if (dbErr || !dbAvatar) {
    console.error('❌ Failed to fetch avatar from Supabase:', dbErr?.message);
    process.exit(1);
  }

  if (dbAvatar.cloudinary_public_id !== uploadedAsset.cloudinary_public_id) {
    console.error(`❌ Mismatch in cloudinary_public_id! DB: ${dbAvatar.cloudinary_public_id}, Cloudinary: ${uploadedAsset.cloudinary_public_id}`);
    process.exit(1);
  }
  console.log('✅ Supabase avatars table record verified:');
  console.log(`   DB cloudinary_public_id: ${dbAvatar.cloudinary_public_id}`);
  console.log(`   DB image_url: ${dbAvatar.image_url}\n`);

  // STEP 7: Fetch the secure_url via HTTPS to confirm the image opens
  console.log(`[STEP 7] Fetching image over HTTPS from ${uploadedAsset.secure_url}...`);
  const httpRes = await fetch(uploadedAsset.secure_url);
  console.log(`   HTTP Status Code: ${httpRes.status} ${httpRes.statusText}`);
  const contentType = httpRes.headers.get('content-type');
  console.log(`   Content-Type: ${contentType}`);
  const imageBytes = await httpRes.arrayBuffer();
  console.log(`   Received Bytes: ${imageBytes.byteLength}`);

  if (httpRes.status !== 200) {
    console.error(`❌ HTTPS request failed with status ${httpRes.status}`);
    process.exit(1);
  }
  console.log('✅ Live secure_url opened successfully with HTTP 200!\n');

  console.log('================================================================');
  console.log('🎉 ALL 8 VERIFICATION CHECKS PASSED WITH REAL LIVE CLOUDINARY!');
  console.log('================================================================');
}

verifyRealUpload().catch((err) => {
  console.error('❌ Live Upload Verification Failed:', err);
  process.exit(1);
});
