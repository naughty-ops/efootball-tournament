import { chromium } from 'playwright';

async function test() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  console.log('Navigating to http://localhost:3000/auth/login ...');
  await page.goto('http://localhost:3000/auth/login', { waitUntil: 'networkidle' });

  console.log('Filling credentials: qa_player_01@test.internal ...');
  await page.fill('input[type="email"]', 'qa_player_01@test.internal');
  await page.fill('input[type="password"]', 'TestPassword123!');
  await page.click('button[type="submit"]');

  console.log('Waiting for URL /dashboard...');
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  console.log('Successfully navigated to:', page.url());

  // Save storage state for reuse
  await context.storageState({ path: 'scripts/auth_storage_state.json' });
  console.log('Saved storage state to scripts/auth_storage_state.json');

  await browser.close();
}

test().catch(err => {
  console.error('Login test failed:', err);
  process.exit(1);
});
