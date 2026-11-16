import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  console.log('Logging in...');
  await page.goto('http://localhost:3000/login');
  await page.fill('input[type="email"]', 'qa_player_01@test.internal');
  await page.fill('input[type="password"]', 'TestPassword123!');
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => url.pathname.includes('/dashboard'), { timeout: 15000 });
  console.log('Logged in to:', page.url());

  console.log('Navigating to /dashboard/matches...');
  await page.goto('http://localhost:3000/dashboard/matches', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  console.log('Current URL:', page.url());

  const hasElem = await page.$('#alive-members-directory');
  console.log('Has #alive-members-directory:', !!hasElem);

  const bodyText = await page.textContent('body');
  console.log('Body contains Alive Members:', bodyText?.includes('Alive Members'));
  console.log('Body contains Competition Center:', bodyText?.includes('Competition Center'));

  await page.screenshot({
    path: 'C:/Users/aser/.gemini/antigravity/brain/686ee328-53f1-4506-8d19-8fb8ea8f2fcd/debug_matches_page.png',
    fullPage: true,
  });
  console.log('Screenshot saved.');
  await browser.close();
}

main().catch(console.error);
