import { chromium } from 'playwright';

async function inspectWallet() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err));

  console.log('Navigating to login...');
  await page.goto('http://localhost:3000/auth/login');
  await page.fill('input[type="email"]', 'qa_player_01@test.internal');
  await page.fill('input[type="password"]', 'TestPassword123!');
  await page.click('button[type="submit"]');

  await page.waitForURL('**/dashboard**', { timeout: 15000 });
  console.log('Logged in. Navigating to /dashboard/wallet...');

  await page.goto('http://localhost:3000/dashboard/wallet', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'scripts/wallet_page_initial.png', fullPage: true });
  console.log('Saved scripts/wallet_page_initial.png');

  // Look for Add Money buttons
  const addMoneyButtons = await page.getByRole('button', { name: /add money/i }).all();
  console.log('Found Add Money buttons count:', addMoneyButtons.length);

  if (addMoneyButtons.length > 0) {
    console.log('Clicking first Add Money button...');
    await addMoneyButtons[0].click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'scripts/add_money_modal_open.png' });
    console.log('Saved scripts/add_money_modal_open.png');

    // Check if modal dialog is visible and its bounding box
    const modal = await page.locator('div[role="dialog"], h2:has-text("Add Money to Wallet")').first();
    console.log('Modal visible:', await modal.isVisible());

    // Try clicking Proceed to Payment
    const proceedBtn = page.getByRole('button', { name: /proceed to payment/i });
    if (await proceedBtn.isVisible()) {
      console.log('Proceed to payment button is visible. Clicking...');
      await proceedBtn.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'scripts/add_money_step2.png' });
      console.log('Saved scripts/add_money_step2.png');
    } else {
      console.log('Proceed to payment button is NOT visible!');
    }
  }

  // Mobile viewport test
  console.log('Testing mobile viewport 390x844...');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.screenshot({ path: 'scripts/wallet_mobile_initial.png' });

  const mobileAddMoney = await page.getByRole('button', { name: /add money/i }).first();
  await mobileAddMoney.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'scripts/add_money_mobile_step1.png' });
  console.log('Saved scripts/add_money_mobile_step1.png');

  const mobileProceed = page.getByRole('button', { name: /proceed to payment/i });
  if (await mobileProceed.isVisible()) {
    await mobileProceed.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'scripts/add_money_mobile_step2.png' });
    console.log('Saved scripts/add_money_mobile_step2.png');
  }

  await browser.close();
}

inspectWallet().catch(console.error);
