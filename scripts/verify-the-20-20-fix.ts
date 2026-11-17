import { chromium } from 'playwright';
import * as path from 'node:path';

const BASE_URL = 'http://localhost:3000';
const ARTIFACTS_DIR = 'C:\\Users\\aser\\.gemini\\antigravity\\brain\\686ee328-53f1-4506-8d19-8fb8ea8f2fcd';
const TOURNAMENT_ID = '3074f4b2-e68f-4a9a-a9d3-1797e4db3088';

async function verifyTournamentFix() {
  console.log('--- VERIFYING THE 20-20 TOURNAMENT FIX ---');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // 1. Visit tournament details page
  const url = `${BASE_URL}/tournaments/${TOURNAMENT_ID}`;
  console.log(`Navigating to ${url}...`);
  await page.goto(url, { waitUntil: 'networkidle' });

  // Check tournament title
  await page.waitForSelector('text=THE 20-20', { timeout: 10000 });
  console.log('✅ Tournament title visible: THE 20-20');

  // Verify Champion: Muhsin (#6)
  const championLocator = page.locator('text=Muhsin').first();
  await championLocator.waitFor({ timeout: 5000 });
  console.log('✅ Champion Muhsin visible on the overview/header!');

  // Verify Runner-up: Shejeeh (#4)
  const runnerUpLocator = page.locator('text=Shejeeh').first();
  await runnerUpLocator.waitFor({ timeout: 5000 });
  console.log('✅ Runner-up Shejeeh visible!');

  // Capture Overview screenshot (clean, no overlay popup)
  const overviewPath = path.join(ARTIFACTS_DIR, 'the_20_20_tournament_fixed_overview.png');
  await page.screenshot({ path: overviewPath, fullPage: false });
  console.log(`📸 Overview screenshot saved: ${overviewPath}`);

  // Switch to Bracket tab
  const bracketTab = page.locator('button:has-text("Bracket"), [role="tab"]:has-text("Bracket")').first();
  if (await bracketTab.isVisible()) {
    await bracketTab.click();
    await page.waitForTimeout(1000);
    const bracketPath = path.join(ARTIFACTS_DIR, 'the_20_20_tournament_fixed_bracket.png');
    await page.screenshot({ path: bracketPath, fullPage: false });
    console.log(`📸 Bracket screenshot saved: ${bracketPath}`);
  }

  // Switch to Fixtures / Matches tab
  const fixturesTab = page.locator('button:has-text("Fixtures"), [role="tab"]:has-text("Fixtures"), button:has-text("Matches"), [role="tab"]:has-text("Matches")').first();
  if (await fixturesTab.isVisible()) {
    await fixturesTab.click();
    await page.waitForTimeout(1000);
    const fixturesPath = path.join(ARTIFACTS_DIR, 'the_20_20_tournament_fixed_fixtures.png');
    await page.screenshot({ path: fixturesPath, fullPage: false });
    console.log(`📸 Fixtures screenshot saved: ${fixturesPath}`);
  }

  await browser.close();
  console.log('🎉 Verification completed successfully!');
}

verifyTournamentFix().catch((err) => {
  console.error('❌ Failed to verify:', err);
  process.exit(1);
});
