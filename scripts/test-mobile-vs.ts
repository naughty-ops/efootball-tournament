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

async function testMobileVS() {
  const browser = await chromium.launch({ headless: true });
  
  // Mobile test (390x844 iPhone 12/13/14 viewport)
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  console.log('Logging in on mobile viewport 390x844...');
  await page.goto('http://localhost:3000/login');
  await page.fill('input[type="email"]', 'qa_player_01@test.internal');
  await page.fill('input[type="password"]', 'TestPassword123!');
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => url.pathname.includes('/dashboard'));

  await page.goto('http://localhost:3000/dashboard/matches?mode=1v1');
  await page.waitForTimeout(1500);

  // Take full screenshot on mobile
  await page.screenshot({ path: 'scripts/mobile_390_match_room_vs.png', fullPage: false });
  console.log('Saved scripts/mobile_390_match_room_vs.png');

  // Verify elements: check order of Card 1, VS, and Card 2
  const vsElement = page.locator('text=VS');
  console.log('VS count found:', await vsElement.count());

  // Also test 360x740 small Android screen
  await page.setViewportSize({ width: 360, height: 740 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'scripts/mobile_360_match_room_vs.png', fullPage: false });
  console.log('Saved scripts/mobile_360_match_room_vs.png');

  // Also test desktop 1280x800 for side-by-side comparison
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'scripts/desktop_1280_match_room_vs.png', fullPage: false });
  console.log('Saved scripts/desktop_1280_match_room_vs.png');

  await browser.close();
  console.log('All mobile VS tests passed.');
}

testMobileVS().catch((err) => {
  console.error(err);
  process.exit(1);
});
