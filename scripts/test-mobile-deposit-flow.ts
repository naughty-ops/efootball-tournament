import { chromium } from 'playwright';
import * as fs from 'node:fs';

async function testMobileScrollAndSubmit() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();

  console.log('Navigating to login...');
  await page.goto('http://localhost:3000/auth/login');
  await page.fill('input[type="email"]', 'qa_player_01@test.internal');
  await page.fill('input[type="password"]', 'TestPassword123!');
  await page.click('button[type="submit"]');

  await page.waitForURL('**/dashboard**');
  await page.goto('http://localhost:3000/dashboard/wallet', { waitUntil: 'networkidle' });

  // Click Add Money
  await page.getByRole('button', { name: /add money/i }).first().click();
  await page.waitForTimeout(500);

  // Click Proceed to Payment
  await page.getByRole('button', { name: /proceed to payment/i }).click();
  await page.waitForTimeout(500);

  // Find scrollable body in modal
  const scrollableBody = page.locator('.overflow-y-auto').first();
  
  // Scroll down to UTR input
  const utrInput = page.getByPlaceholder(/431289123456/i);
  await utrInput.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'scripts/add_money_mobile_scrolled_utr.png' });
  console.log('Saved scripts/add_money_mobile_scrolled_utr.png');

  // Fill UTR
  const randUtr = '43' + Math.floor(1000000000 + Math.random() * 9000000000).toString();
  await utrInput.fill(randUtr);

  // Create a small test image to upload
  const testImagePath = 'scripts/test_receipt.png';
  if (!fs.existsSync(testImagePath)) {
    // 1x1 png base64
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    fs.writeFileSync(testImagePath, Buffer.from(pngBase64, 'base64'));
  }

  // Upload file
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(testImagePath);
  await page.waitForTimeout(500);

  await page.screenshot({ path: 'scripts/add_money_mobile_ready_to_submit.png' });
  console.log('Saved scripts/add_money_mobile_ready_to_submit.png');

  // Check if submit button is enabled
  const submitBtn = page.getByRole('button', { name: /submit deposit request/i });
  const isEnabled = await submitBtn.isEnabled();
  console.log('Submit button isEnabled:', isEnabled);

  if (isEnabled) {
    await submitBtn.click();
    console.log('Clicked submit button, waiting for success screen...');
    await page.waitForSelector('text=Deposit Request Submitted', { timeout: 15000 });
    await page.screenshot({ path: 'scripts/add_money_mobile_success.png' });
    console.log('Saved scripts/add_money_mobile_success.png');
  }

  await browser.close();
}

testMobileScrollAndSubmit().catch(console.error);
