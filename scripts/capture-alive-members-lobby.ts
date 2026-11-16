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

async function main() {
  // Cancel active waiting matches for testing the lobby
  await supabase
    .from('one_vs_one_matches')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('status', 'waiting');

  console.log('Cleared waiting matches so lobby is rendered.');

  const browser = await chromium.launch({ headless: true });
  
  // Desktop
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const desktopPage = await desktopContext.newPage();
  await desktopPage.goto('http://localhost:3000/login');
  await desktopPage.fill('input[type="email"]', 'qa_player_01@test.internal');
  await desktopPage.fill('input[type="password"]', 'TestPassword123!');
  await desktopPage.click('button[type="submit"]');
  await desktopPage.waitForURL((url) => url.pathname.includes('/dashboard'), { timeout: 15000 });

  await desktopPage.goto('http://localhost:3000/dashboard/matches?mode=1v1', { waitUntil: 'networkidle' });
  await desktopPage.waitForTimeout(2000);

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
    console.warn('Alive directory not found');
  }

  // Mobile
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

  // Now create a waiting match to capture the Matchmaking In Progress Banner inside the room
  console.log('Creating a test 1v1 match to capture authentic Matchmaking In Progress banner...');
  const { data: card } = await supabase.from('one_vs_one_cards').select('id').eq('is_active', true).limit(1).single();
  const { data: user } = await supabase.from('profiles').select('id').eq('email', 'qa_player_01@test.internal').single();
  
  if (card && user) {
    const code = `1V1-TEST-${Math.floor(1000 + Math.random() * 9000)}`;
    const { data: newMatch } = await supabase.from('one_vs_one_matches').insert({
      card_id: card.id,
      match_code: code,
      status: 'waiting',
      match_mode: 'real',
      created_by: user.id,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    }).select().single();

    if (newMatch) {
      await supabase.from('one_vs_one_match_players').insert({
        match_id: newMatch.id,
        user_id: user.id,
        player_position: 1,
        ready_status: 'ready',
        is_active: true,
      });

      console.log(`Created match ${code}, navigating back...`);
      await desktopPage.goto('http://localhost:3000/dashboard/matches?mode=1v1', { waitUntil: 'networkidle' });
      await desktopPage.waitForTimeout(2000);

      const bannerShotPath = path.resolve(
        'C:/Users/aser/.gemini/antigravity/brain/686ee328-53f1-4506-8d19-8fb8ea8f2fcd/matchmaking_in_progress_banner_room.png'
      );
      await desktopPage.screenshot({ path: bannerShotPath });
      console.log(`✓ Captured match room banner screenshot: ${bannerShotPath}`);
    }
  }

  await browser.close();
}

main().catch(console.error);
