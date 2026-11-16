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

async function checkPages() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('Logging in...');
  await page.goto('http://localhost:3000/login');
  await page.fill('input[type="email"]', 'qa_player_01@test.internal');
  await page.fill('input[type="password"]', 'TestPassword123!');
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => url.pathname.includes('/dashboard'));

  // 1. Check Matches Page
  console.log('Checking Matches Page...');
  await page.goto('http://localhost:3000/dashboard/matches');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'scripts/clean_matches_page_header.png' });
  console.log('Saved scripts/clean_matches_page_header.png');

  const textMatches = await page.evaluate(() => document.body.innerHTML.includes('bg-[#05053B] border border-white/10 rounded-2xl w-fit'));
  console.log('Has removed element in Matches page:', textMatches);

  // 2. Check Tournaments Page
  console.log('Checking Tournaments Page...');
  await page.goto('http://localhost:3000/dashboard/tournaments');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'scripts/clean_tournaments_page_header.png' });
  console.log('Saved scripts/clean_tournaments_page_header.png');

  const textTourn = await page.evaluate(() => document.body.innerHTML.includes('bg-[#05053B] border border-white/10 rounded-2xl w-fit'));
  console.log('Has removed element in Tournaments page:', textTourn);

  await browser.close();
  console.log('Verification done.');
}
checkPages().catch(console.error);
