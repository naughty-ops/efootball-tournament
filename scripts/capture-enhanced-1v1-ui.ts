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

async function captureEnhancedUI() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('Logging in...');
  await page.goto('http://localhost:3000/login');
  await page.fill('input[type="email"]', 'qa_player_01@test.internal');
  await page.fill('input[type="password"]', 'TestPassword123!');
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => url.pathname.includes('/dashboard'));

  // 1. Navigate to 1v1 Arena
  console.log('Navigating to 1v1 Arena...');
  await page.goto('http://localhost:3000/dashboard/matches?mode=1v1');
  await page.waitForTimeout(2000);

  // Screenshot 1: Stats and Tier Cards
  await page.screenshot({ path: 'scripts/enhanced_1v1_arena_top.png', fullPage: false });
  console.log('Saved scripts/enhanced_1v1_arena_top.png');

  // Scroll down to 3-step guide and history
  const guide = page.locator('text=How 1 VS 1 Challenge Arena Works');
  if (await guide.count() > 0) {
    await guide.first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'scripts/enhanced_1v1_guide_and_history.png', fullPage: false });
    console.log('Saved scripts/enhanced_1v1_guide_and_history.png');
  }

  // Full page view
  await page.screenshot({ path: 'scripts/enhanced_1v1_full_page.png', fullPage: true });
  console.log('Saved scripts/enhanced_1v1_full_page.png');

  await browser.close();
  console.log('All enhanced UI screenshots saved successfully.');
}

captureEnhancedUI().catch(err => {
  console.error(err);
  process.exit(1);
});
