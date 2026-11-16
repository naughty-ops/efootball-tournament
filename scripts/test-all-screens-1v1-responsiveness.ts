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

const VIEWPORTS = [
  { name: 'mobile_small_360', width: 360, height: 740 },
  { name: 'mobile_standard_390', width: 390, height: 844 },
  { name: 'tablet_768', width: 768, height: 1024 },
  { name: 'laptop_1024', width: 1024, height: 768 },
  { name: 'desktop_1440', width: 1440, height: 900 },
];

async function testAllScreens() {
  const browser = await chromium.launch({ headless: true });

  for (const vp of VIEWPORTS) {
    console.log(`\n=== Testing Viewport: ${vp.name} (${vp.width}x${vp.height}) ===`);
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();

    // Log in
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', 'qa_player_01@test.internal');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => url.pathname.includes('/dashboard'));

    // Go to 1v1 Arena
    await page.goto('http://localhost:3000/dashboard/matches?mode=1v1');
    await page.waitForTimeout(1500);

    // Verify horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });

    console.log(`[${vp.name}] Horizontal Overflow detected: ${hasHorizontalOverflow}`);

    // Take screenshots
    const topScreenshotPath = `scripts/responsive_${vp.name}_arena_top.png`;
    await page.screenshot({ path: topScreenshotPath, fullPage: false });
    console.log(`Saved ${topScreenshotPath}`);

    // Scroll to guide & history
    const guide = page.locator('text=How 1 VS 1 Challenge Arena Works');
    if (await guide.count() > 0) {
      await guide.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      const bottomScreenshotPath = `scripts/responsive_${vp.name}_arena_bottom.png`;
      await page.screenshot({ path: bottomScreenshotPath, fullPage: false });
      console.log(`Saved ${bottomScreenshotPath}`);
    }

    await context.close();
  }

  // Now create an active match to capture the animated room in action!
  console.log('\n=== Testing Animated Room Experience ===');
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  await page.goto('http://localhost:3000/login');
  await page.fill('input[type="email"]', 'qa_player_01@test.internal');
  await page.fill('input[type="password"]', 'TestPassword123!');
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => url.pathname.includes('/dashboard'));
  await page.goto('http://localhost:3000/dashboard/matches?mode=1v1');
  await page.waitForTimeout(1200);

  // Take screenshot of room if in active match or click to view
  const activeRoomHeading = page.locator('text=Active Match Room');
  if (await activeRoomHeading.count() > 0) {
    await page.screenshot({ path: 'scripts/animated_room_live_view.png', fullPage: false });
    console.log('Saved scripts/animated_room_live_view.png');
  } else {
    // If no active room, join a queue or we simulate room view
    console.log('No active match room currently running for player 1.');
  }

  await browser.close();
  console.log('All responsive and animation tests complete.');
}

testAllScreens().catch((err) => {
  console.error(err);
  process.exit(1);
});
