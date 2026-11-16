import * as path from 'node:path';
import * as fs from 'node:fs';
import { chromium } from 'playwright';

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

async function verifyScreenshots() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // 1. Public Home
  console.log('Navigating to Public Home...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'scripts/public_home_hero_and_1v1_ad.png', fullPage: false });
  console.log('Saved scripts/public_home_hero_and_1v1_ad.png');

  // Scroll down to the 1v1 advertisement section
  const adSection = page.locator('text=HEAD-TO-HEAD BATTLES');
  if (await adSection.count() > 0) {
    await adSection.first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'scripts/public_home_1v1_ad_section.png', fullPage: false });
    console.log('Saved scripts/public_home_1v1_ad_section.png');
  }

  // 2. User Dashboard Home
  console.log('Logging in for Dashboard Home...');
  await page.goto('http://localhost:3000/login');
  await page.fill('input[type="email"]', 'qa_player_01@test.internal');
  await page.fill('input[type="password"]', 'TestPassword123!');
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => url.pathname.includes('/dashboard'));
  await page.waitForTimeout(1500);

  await page.screenshot({ path: 'scripts/user_dashboard_1v1_shortcut.png', fullPage: false });
  console.log('Saved scripts/user_dashboard_1v1_shortcut.png');

  // Scroll down to the 1v1 banner in Dashboard
  const dash1v1Banner = page.locator('text=eFootball 1 VS 1 Challenge Arena');
  if (await dash1v1Banner.count() > 0) {
    await dash1v1Banner.first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'scripts/user_dashboard_1v1_banner.png', fullPage: false });
    console.log('Saved scripts/user_dashboard_1v1_banner.png');
  }

  // 3. 1v1 Arena Cards (check eye icon & clean card design)
  console.log('Navigating to 1v1 Arena...');
  await page.goto('http://localhost:3000/dashboard/matches?mode=1v1');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'scripts/one_vs_one_arena_final_cards.png', fullPage: false });
  console.log('Saved scripts/one_vs_one_arena_final_cards.png');

  await browser.close();
  console.log('All screenshots captured successfully.');
}

verifyScreenshots().catch(err => {
  console.error(err);
  process.exit(1);
});
