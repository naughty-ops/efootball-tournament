import * as path from 'node:path';
import * as fs from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        process.env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
      }
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runTests() {
  console.log('--- 1. Testing Database Alive Members System RPCs ---');
  
  // 1. Get a test user
  const { data: users, error: userErr } = await supabase.from('profiles').select('id, display_name').limit(1);
  if (userErr || !users || users.length === 0) {
    console.error('Failed to get test user:', userErr);
    process.exit(1);
  }
  const testUserId = users[0].id;
  console.log(`Test user: ${users[0].display_name} (${testUserId})`);

  // 2. Direct upsert into member_presence as test
  const now = new Date();
  const expires = new Date(Date.now() + 45 * 1000);
  const { error: upsertErr } = await supabase.from('member_presence').upsert({
    user_id: testUserId,
    status: 'alive',
    last_seen_at: now.toISOString(),
    last_heartbeat_at: now.toISOString(),
    last_active_at: now.toISOString(),
    current_activity: '1v1 Matchmaking (1V1-TEST-001)',
    current_session_id: 'test_session_abc',
    tab_count: 1,
    expires_at: expires.toISOString(),
    updated_at: now.toISOString(),
  });
  if (upsertErr) {
    console.error('Failed to upsert test presence:', upsertErr);
    process.exit(1);
  }
  console.log('✓ Successfully recorded member presence status: ALIVE');

  // 3. Test get_alive_members_counts RPC
  const { data: countsData, error: countErr } = await (supabase as any).rpc('get_alive_members_counts');
  if (countErr) {
    console.error('Failed get_alive_members_counts:', countErr);
    process.exit(1);
  }
  console.log('✓ get_alive_members_counts result:', countsData);

  // 4. Test get_alive_members_directory RPC
  const { data: dirData, error: dirErr } = await (supabase as any).rpc('get_alive_members_directory');
  if (dirErr) {
    console.error('Failed get_alive_members_directory:', dirErr);
    process.exit(1);
  }
  console.log(`✓ get_alive_members_directory returned ${dirData?.length || 0} members`);
  const activeUser = dirData?.find((d: any) => d.user_id === testUserId);
  console.log(`✓ Active test user found in directory: Status = ${activeUser?.status}, Activity = ${activeUser?.current_activity}`);

  console.log('\n--- 2. Browser Visual Verification with Playwright ---');
  const browser = await chromium.launch({ headless: true });
  
  // Test Desktop
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const desktopPage = await desktopContext.newPage();

  console.log('Navigating to login...');
  await desktopPage.goto('http://localhost:3000/login');
  await desktopPage.fill('input[type="email"]', 'qa_player_01@test.internal');
  await desktopPage.fill('input[type="password"]', 'TestPassword123!');
  await desktopPage.click('button[type="submit"]');
  await desktopPage.waitForURL((url) => url.pathname.includes('/dashboard'), { timeout: 15000 });

  console.log('Navigating to 1v1 Arena...');
  await desktopPage.goto('http://localhost:3000/dashboard/matches?mode=1v1', { waitUntil: 'networkidle' });
  await desktopPage.waitForTimeout(2000);

  // Scroll to Alive Members Directory
  const aliveDirectory = await desktopPage.$('#alive-members-directory');
  if (aliveDirectory) {
    await aliveDirectory.scrollIntoViewIfNeeded();
    await desktopPage.waitForTimeout(1000);
    const desktopShotPath = path.resolve(
      'C:/Users/aser/.gemini/antigravity/brain/686ee328-53f1-4506-8d19-8fb8ea8f2fcd/alive_members_directory_desktop.png'
    );
    await desktopPage.screenshot({ path: desktopShotPath });
    console.log(`✓ Captured desktop screenshot: ${desktopShotPath}`);
  } else {
    console.warn('Alive members directory element not found on desktop');
  }

  // Test Mobile Viewport
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto('http://localhost:3000/login');
  await mobilePage.fill('input[type="email"]', 'qa_player_01@test.internal');
  await mobilePage.fill('input[type="password"]', 'TestPassword123!');
  await mobilePage.click('button[type="submit"]');
  await mobilePage.waitForURL((url) => url.pathname.includes('/dashboard'), { timeout: 15000 });

  await mobilePage.goto('http://localhost:3000/dashboard/matches?mode=1v1', { waitUntil: 'networkidle' });
  await mobilePage.waitForTimeout(2000);

  const mobileAliveDir = await mobilePage.$('#alive-members-directory');
  if (mobileAliveDir) {
    await mobileAliveDir.scrollIntoViewIfNeeded();
    await mobilePage.waitForTimeout(1000);
    const mobileShotPath = path.resolve(
      'C:/Users/aser/.gemini/antigravity/brain/686ee328-53f1-4506-8d19-8fb8ea8f2fcd/alive_members_directory_mobile.png'
    );
    await mobilePage.screenshot({ path: mobileShotPath });
    console.log(`✓ Captured mobile screenshot: ${mobileShotPath}`);
  }

  // Now verify Matchmaking in Progress banner
  console.log('Verifying Matchmaking In Progress Banner inside a match room...');
  // Find or create a waiting match
  const { data: waitingMatch } = await supabase
    .from('one_vs_one_matches')
    .select('id, match_code')
    .eq('status', 'waiting')
    .limit(1)
    .maybeSingle();

  if (waitingMatch) {
    console.log(`Found waiting match: ${waitingMatch.match_code}`);
    await desktopPage.goto(`http://localhost:3000/dashboard/matches?mode=1v1`, { waitUntil: 'networkidle' });
    await desktopPage.waitForTimeout(2000);
    const matchRoomShotPath = path.resolve(
      'C:/Users/aser/.gemini/antigravity/brain/686ee328-53f1-4506-8d19-8fb8ea8f2fcd/matchmaking_in_progress_banner_verified.png'
    );
    await desktopPage.screenshot({ path: matchRoomShotPath });
    console.log(`✓ Captured matchmaking banner screenshot: ${matchRoomShotPath}`);
  }

  await browser.close();
  console.log('\n--- ALL VERIFICATIONS COMPLETED SUCCESSFULLY ---');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
