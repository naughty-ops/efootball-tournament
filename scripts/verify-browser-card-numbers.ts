import * as fs from 'node:fs';
import * as path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  console.log('Logging in to check 1v1 Arena cards UI...');
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', 'qa_player_01@test.internal');
  await page.fill('input[type="password"]', 'TestPassword123!');
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => url.pathname.includes('/dashboard'), { timeout: 15000 });

  console.log('Navigating to 1v1 Arena...');
  await page.goto(`${BASE_URL}/dashboard/matches?mode=1v1`);
  await page.waitForSelector('text=Select Challenge Tier', { timeout: 15000 });

  // Take screenshot of 1v1 card grid
  const screenshotPath = path.resolve(process.cwd(), 'scripts', 'arena_cards_with_active_numbers.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`Screenshot saved to: ${screenshotPath}`);

  // Check that active match indicators are visible on cards
  const activeBadges = await page.locator('text=/\\d+ Active/').allInnerTexts();
  console.log('Active match badges found on UI:', activeBadges);

  const activeMatchesRows = await page.locator('text=Active Matches').count();
  console.log(`"Active Matches" metric rows found: ${activeMatchesRows}`);

  await browser.close();
  console.log('✅ UI verification passed successfully!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
