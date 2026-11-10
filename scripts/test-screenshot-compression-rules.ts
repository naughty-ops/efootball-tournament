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

async function start() {
  const {
    validateImageSize,
    validateImageSignature,
    MEDIA_SIZE_LIMITS,
  } = await import('../lib/media/validation');
  const { uploadImage, deleteImage } = await import('../services/mediaService');
  const { createAdminClient } = await import('../lib/supabase/admin');

  console.log('📸 Starting Screenshot Upload & Validation Rules Verification Tests...\n');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.error(`❌ FAIL: ${testName}${details ? ` - ${details}` : ''}`);
    testsFailed++;
  }
}

async function runTests() {
  // ==========================================
  // SUITE 1: STRICT 2 MB REJECTION RULE
  // ==========================================
  console.log('--- SUITE 1: Strict 2 MB Rejection Rule ---');

  // Test 1: File size > 2 MB (e.g. 2.1 MB) for dispute_evidence
  const size2Point1MB = Math.round(2.1 * 1024 * 1024);
  const res2Point1Dispute = validateImageSize(size2Point1MB, 'dispute_evidence');
  assert(
    res2Point1Dispute.valid === false,
    'File > 2 MB rejected for dispute_evidence'
  );
  assert(
    res2Point1Dispute.error === 'File size exceeds the 2 MB limit. Please select a smaller screenshot.',
    'Exact 2 MB error string displayed',
    res2Point1Dispute.error
  );

  // Test 2: File size > 2 MB for match_evidence
  const res2Point1Match = validateImageSize(size2Point1MB, 'match_evidence');
  assert(
    res2Point1Match.valid === false &&
      res2Point1Match.error === 'File size exceeds the 2 MB limit. Please select a smaller screenshot.',
    'Exact 2 MB error string for match_evidence'
  );

  // Test 3: Extreme file size (10 MB)
  const size10MB = 10 * 1024 * 1024;
  const res10MB = validateImageSize(size10MB, 'dispute_evidence');
  assert(
    res10MB.valid === false &&
      res10MB.error === 'File size exceeds the 2 MB limit. Please select a smaller screenshot.',
    '10 MB rejected with 2 MB limit message'
  );

  // ==========================================
  // SUITE 2: MAXIMUM ACCEPTED SCREENSHOT SIZE: 500 KB
  // ==========================================
  console.log('\n--- SUITE 2: Maximum Accepted Screenshot Size (500 KB) ---');

  // Test 4: File between 500 KB and 2 MB (e.g. 750 KB)
  const size750KB = 750 * 1024;
  const res750KB = validateImageSize(size750KB, 'dispute_evidence');
  assert(
    res750KB.valid === false,
    '750 KB uncompressed file rejected by 500 KB limit'
  );
  assert(
    res750KB.error === 'Screenshot exceeds the 500 KB limit. Maximum accepted screenshot size is 500 KB per image.',
    '500 KB limit error message verified',
    res750KB.error
  );

  // Test 5: File at 500 KB boundary (500 * 1024 bytes)
  const size500KB = 500 * 1024;
  const res500KB = validateImageSize(size500KB, 'dispute_evidence');
  assert(
    res500KB.valid === true,
    '500 KB exact boundary accepted'
  );

  // Test 6: File below 500 KB (e.g. 350 KB)
  const size350KB = 350 * 1024;
  const res350KB = validateImageSize(size350KB, 'dispute_evidence');
  assert(
    res350KB.valid === true,
    '350 KB compressed screenshot accepted'
  );

  // Test 7: MEDIA_SIZE_LIMITS constant verification
  assert(
    MEDIA_SIZE_LIMITS.match_evidence === 500 * 1024 &&
      MEDIA_SIZE_LIMITS.dispute_evidence === 500 * 1024,
    'MEDIA_SIZE_LIMITS configured to exactly 500 KB for match and dispute evidence'
  );

  // ==========================================
  // SUITE 3: IMAGE TYPE VALIDATION ON SERVER
  // ==========================================
  console.log('\n--- SUITE 3: True Image Format & Signature Validation ---');

  // Valid JPEG header: FF D8 FF
  const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  const jpegCheck = validateImageSignature(jpegHeader);
  assert(jpegCheck.valid === true && jpegCheck.mimeType === 'image/jpeg', 'JPEG magic bytes accepted');

  // Valid PNG header: 89 50 4E 47 0D 0A 1A 0A
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  const pngCheck = validateImageSignature(pngHeader);
  assert(pngCheck.valid === true && pngCheck.mimeType === 'image/png', 'PNG magic bytes accepted');

  // Valid WebP header: RIFF .... WEBP
  const webpHeader = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
  const webpCheck = validateImageSignature(webpHeader);
  assert(webpCheck.valid === true && webpCheck.mimeType === 'image/webp', 'WebP magic bytes accepted');

  // Disallowed / Malicious format: SVG XML
  const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const svgCheck = validateImageSignature(svgBuffer);
  assert(svgCheck.valid === false, 'SVG/script strictly rejected by magic byte signature');

  // Corrupted / Executable buffer
  const exeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]);
  const exeCheck = validateImageSignature(exeBuffer);
  assert(exeCheck.valid === false, 'Executable binary rejected');

  // ==========================================
  // SUITE 4: CLOUDINARY STORAGE (NOT SUPABASE BINARY)
  // ==========================================
  console.log('\n--- SUITE 4: Live Cloudinary Evidence Storage Integration ---');

  // 1x1 valid transparent PNG (67 bytes)
  const validSmallPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );

  const adminClient = createAdminClient();
  const { data: userRows } = await (adminClient.from('profiles') as any).select('id').limit(1);
  const testUserId = userRows?.[0]?.id;

  let uploadedPublicId: string | null = null;
  try {
    const uploadRes = await uploadImage(validSmallPng, {
      category: 'dispute_evidence',
      entityId: 'test_evidence_match_123',
      userId: testUserId,
      visibility: 'private',
    });

    uploadedPublicId = uploadRes.cloudinary_public_id;

    assert(Boolean(uploadRes.secure_url), 'Cloudinary secure_url returned');
    assert(
      uploadRes.cloudinary_public_id.startsWith('efootball/disputes/evidence/'),
      `Stored in correct Cloudinary folder: ${uploadRes.cloudinary_public_id}`
    );
    assert(uploadRes.file_size > 0 && uploadRes.file_size <= 500 * 1024, `Stored byte length is accurate and within 500 KB (${uploadRes.file_size} B)`);
    assert(uploadRes.format === 'png', 'Image format stored as png');

    // Confirm that image binary is NOT stored in Supabase database
    const { data: assetRow } = await (adminClient.from('media_assets') as any)
      .select('*')
      .eq('cloudinary_public_id', uploadedPublicId)
      .single();

    assert(Boolean(assetRow), 'Metadata record exists in Supabase media_assets table');
    assert((assetRow as any).data === undefined && (assetRow as any).binary === undefined, 'No image binary stored in PostgreSQL');

    // Verify image is accessible via HTTPS
    const fetchRes = await fetch(uploadRes.secure_url, { method: 'HEAD' });
    assert(fetchRes.status === 200, `Cloudinary HTTPS delivery returned HTTP ${fetchRes.status}`);
  } finally {
    if (uploadedPublicId) {
      await deleteImage(uploadedPublicId, testUserId, true);
      console.log('Cleaned up test Cloudinary evidence asset.');
    }
  }

  // ==========================================
  // SUMMARY
  // ==========================================
  console.log(`\n========================================`);
  console.log(`TOTAL TESTS PASSED: ${testsPassed}`);
  console.log(`TOTAL TESTS FAILED: ${testsFailed}`);
  console.log(`========================================\n`);

    if (testsFailed > 0) {
      process.exit(1);
    }
  }

  await runTests();
}

start().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
