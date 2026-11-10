import { chromium } from 'playwright';

async function test() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  console.log('Navigating to login...');
  await page.goto('http://localhost:3000/login');
  await page.fill('input[type="email"]', 'qa_player_01@test.internal');
  await page.fill('input[type="password"]', 'TestPassword123!');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4000);
  console.log('Current URL after submit:', page.url());
  const bodyText = await page.locator('body').innerText();
  console.log('Body snippet:', bodyText.slice(0, 300));
  await page.screenshot({ path: 'qa/screenshots/debug_login_after_submit.png' });
  await browser.close();
}

test();
