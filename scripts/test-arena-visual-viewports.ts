import { chromium } from 'playwright';

async function testArenaVisualViewports() {
  const browser = await chromium.launch({ headless: true });

  const viewports = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'mobile', width: 390, height: 844 },
  ];

  for (const vp of viewports) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();

    console.log(`Testing viewport: ${vp.name} (${vp.width}x${vp.height})...`);
    await page.goto('http://localhost:3000/auth/login');
    await page.fill('input[type="email"]', 'qa_player_01@test.internal');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/dashboard**');
    await page.goto('http://localhost:3000/dashboard/matches', { waitUntil: 'networkidle' });

    // Capture Tournament fixtures default
    await page.screenshot({ path: `scripts/arena_${vp.name}_tournaments.png` });
    console.log(`Saved scripts/arena_${vp.name}_tournaments.png`);

    // Switch to 1 VS 1 Challenge Arena
    const arenaTab = page.getByRole('button', { name: /1 vs 1 challenge arena/i });
    if (await arenaTab.isVisible()) {
      await arenaTab.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: `scripts/arena_${vp.name}_1v1_hub.png` });
      console.log(`Saved scripts/arena_${vp.name}_1v1_hub.png`);
    }

    await context.close();
  }

  await browser.close();
  console.log('All visual screenshots saved successfully!');
}

testArenaVisualViewports().catch((err) => {
  console.error('Visual test failed:', err);
  process.exit(1);
});
