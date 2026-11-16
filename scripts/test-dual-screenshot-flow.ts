import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'node:fs';
import * as path from 'node:path';

// 1. Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[key] = val;
      }
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ARTIFACT_DIR = 'C:/Users/aser/.gemini/antigravity/brain/686ee328-53f1-4506-8d19-8fb8ea8f2fcd';
const BASE_URL = 'http://localhost:3000';
const TEST_PASSWORD = 'TestPassword123!';

async function runTest() {
  console.log('=== 1. VERIFYING DATABASE COLUMNS & RPC SIGNATURE ===');
  
  // Query table directly
  const { data: sampleResult, error: sampleErr } = await adminClient
    .from('one_vs_one_results')
    .select('id, screenshot_url, opponent_screenshot_url')
    .limit(1);

  if (sampleErr) {
    console.error('❌ Error checking one_vs_one_results columns:', sampleErr.message);
  } else {
    console.log('✅ one_vs_one_results table successfully has screenshot_url and opponent_screenshot_url columns');
  }

  // Create two test users
  const p1Email = 'player1_screenshot_test@arenatest.internal';
  const p2Email = 'player2_screenshot_test@arenatest.internal';

  async function getOrCreateUser(email: string, displayName: string) {
    const { data: listData } = await adminClient.auth.admin.listUsers();
    let user = listData?.users.find((u) => u.email === email);
    if (!user) {
      const { data: createData, error } = await adminClient.auth.admin.createUser({
        email,
        password: TEST_PASSWORD,
        email_confirm: true,
        user_metadata: { display_name: displayName },
      });
      if (error || !createData.user) throw new Error(`Failed to create user ${email}: ${error?.message}`);
      user = createData.user;
    }
    // Update profile
    await adminClient.from('profiles').upsert({
      id: user.id,
      display_name: displayName,
      efootball_id: `${displayName.toUpperCase()}_EFT`,
    });
    // Set wallet
    await adminClient.from('wallets').upsert({
      user_id: user.id,
      balance: 1000,
      bonus_balance: 0,
      currency: 'INR',
    });
    // Set eligibility
    await adminClient.from('one_vs_one_eligibility_records').upsert(
      {
        user_id: user.id,
        policy_version: 'v1.0',
        jurisdiction: 'IN',
        eligibility_status: 'acknowledged',
        acknowledgement_timestamp: new Date().toISOString(),
      },
      { onConflict: 'user_id,policy_version' }
    );
    return user;
  }

  const user1 = await getOrCreateUser(p1Email, 'AlphaStriker');
  const user2 = await getOrCreateUser(p2Email, 'OmegaKeeper');

  console.log(`✅ Test users ready: User1 (${user1.id}), User2 (${user2.id})`);

  // Clean up any existing active matches for test users
  await adminClient
    .from('one_vs_one_match_players')
    .update({ is_active: false })
    .in('user_id', [user1.id, user2.id]);

  // Fetch active card
  const { data: cards } = await adminClient
    .from('one_vs_one_cards')
    .select('*')
    .eq('status', 'active')
    .order('entry_amount', { ascending: true })
    .limit(1);

  if (!cards || cards.length === 0) {
    throw new Error('No active cards found');
  }
  const card = cards[0];

  console.log(`Using challenge card: ${card.name} (Entry: ₹${card.entry_amount})`);

  // Player 1 creates / joins
  const { data: p1Res, error: matchErr } = await adminClient.rpc('join_or_create_one_vs_one_match', {
    p_user_id: user1.id,
    p_card_id: card.id,
    p_jurisdiction: 'IN',
  });
  if (matchErr) throw matchErr;
  const matchId = p1Res.match_id;

  // Player 2 joins
  const { data: p2Res, error: joinErr } = await adminClient.rpc('join_or_create_one_vs_one_match', {
    p_card_id: card.id,
    p_user_id: user2.id,
    p_jurisdiction: 'IN',
  });
  if (joinErr) throw joinErr;

  console.log(`✅ Match created & joined: ID ${matchId}`);

  // Submit room credentials
  await adminClient.rpc('submit_one_vs_one_room_credentials', {
    p_match_id: matchId,
    p_user_id: user1.id,
    p_room_id: '98765432',
    p_room_password: '1234',
  });

  // Both players ready
  await adminClient.rpc('confirm_one_vs_one_player_ready', {
    p_match_id: matchId,
    p_user_id: user1.id,
  });
  await adminClient.rpc('confirm_one_vs_one_player_ready', {
    p_match_id: matchId,
    p_user_id: user2.id,
  });

  console.log(`✅ Match is now in_progress`);

  // Setup sample test image for upload testing
  const dummyImgPath = path.resolve(process.cwd(), 'qa/dummy_match_screenshot.png');
  // 1x1 png pixel buffer
  const dummyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  fs.writeFileSync(dummyImgPath, dummyPng);

  // Upload to Supabase storage to simulate player 1 result screenshot
  const p1StoragePath = `1v1/${matchId}/${user1.id}_result_${Date.now()}.png`;
  await adminClient.storage.from('payment-proofs').upload(p1StoragePath, dummyPng, { contentType: 'image/png', upsert: true });

  // Submit result with screenshot
  const { data: submitRes, error: subErr } = await adminClient.rpc('submit_one_vs_one_result', {
    p_match_id: matchId,
    p_user_id: user1.id,
    p_p1_score: 3,
    p_p2_score: 1,
    p_claimed_winner_id: user1.id,
    p_screenshot_url: p1StoragePath,
  });
  if (subErr) throw subErr;

  console.log(`✅ Player 1 submitted score 3 - 1 with mandatory screenshot: ${p1StoragePath}`);

  // Launch Playwright to capture UI for Player 2 (Confirming with Opponent Screenshot)
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Login as User 2 (Opponent)
  console.log('Logging in as User 2 (OmegaKeeper)...');
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', p2Email);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard**', { timeout: 15000 });

  // Navigate to 1vs1
  await page.goto(`${BASE_URL}/dashboard/1vs1`);
  await page.waitForTimeout(3000);

  // Take screenshot of the opponent's view waiting for confirmation with screenshot upload dropzone
  const confScreenshotPath = path.join(ARTIFACT_DIR, 'opponent_review_and_screenshot_upload.png');
  await page.screenshot({ path: confScreenshotPath, fullPage: true });
  console.log(`📸 Captured: ${confScreenshotPath}`);

  // Now, upload User 2's screenshot through the UI or test the file input
  const fileInput = await page.$('input[type="file"]');
  if (fileInput) {
    await fileInput.setInputFiles(dummyImgPath);
    await page.waitForTimeout(1000);
    const dropzoneWithPreview = path.join(ARTIFACT_DIR, 'opponent_screenshot_selected_preview.png');
    await page.screenshot({ path: dropzoneWithPreview, fullPage: true });
    console.log(`📸 Captured: ${dropzoneWithPreview}`);
  }

  // Now upload User 2's confirmation screenshot to storage & confirm via RPC to test complete state
  const p2StoragePath = `1v1/${matchId}/${user2.id}_confirm_${Date.now()}.png`;
  await adminClient.storage.from('payment-proofs').upload(p2StoragePath, dummyPng, { contentType: 'image/png', upsert: true });

  const { data: confRes, error: confErr } = await adminClient.rpc('confirm_one_vs_one_result', {
    p_match_id: matchId,
    p_user_id: user2.id,
    p_opponent_screenshot_url: p2StoragePath,
  });
  if (confErr) throw confErr;

  console.log(`✅ Player 2 confirmed score with opponent screenshot: ${p2StoragePath}`);

  // Reload page to view completed match state with BOTH screenshots displayed
  await page.reload();
  await page.waitForTimeout(3000);

  const completedDualProofPath = path.join(ARTIFACT_DIR, 'completed_match_dual_screenshots.png');
  await page.screenshot({ path: completedDualProofPath, fullPage: true });
  console.log(`📸 Captured: ${completedDualProofPath}`);

  await browser.close();
  console.log('=== ALL TESTS AND SCREENSHOT CAPTURES COMPLETED SUCCESSFULLY! ===');
}

runTest().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
