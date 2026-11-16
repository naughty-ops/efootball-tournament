import { chromium } from 'playwright';

async function testLargeFileDeposit() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  console.log('Navigating to login...');
  await page.goto('http://localhost:3000/auth/login');
  await page.fill('input[type="email"]', 'qa_player_01@test.internal');
  await page.fill('input[type="password"]', 'TestPassword123!');
  await page.click('button[type="submit"]');

  await page.waitForURL('**/dashboard**');
  await page.goto('http://localhost:3000/dashboard/wallet', { waitUntil: 'networkidle' });

  // Click Add Money
  console.log('Opening Add Money modal...');
  await page.getByRole('button', { name: /add money/i }).first().click();
  await page.waitForTimeout(500);

  // Click Proceed to Payment
  await page.getByRole('button', { name: /proceed to payment/i }).click();
  await page.waitForTimeout(500);

  // Fill UTR
  const randUtr = '43' + Math.floor(1000000000 + Math.random() * 9000000000).toString();
  const utrInput = page.getByPlaceholder(/431289123456/i);
  await utrInput.fill(randUtr);

  // Upload 2.5MB test image
  const testImagePath = 'scripts/test-2.5mb.png';
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(testImagePath);
  await page.waitForTimeout(500);

  // Check if submit button is enabled
  const submitBtn = page.getByRole('button', { name: /submit deposit request/i });
  const isEnabled = await submitBtn.isEnabled();
  console.log('Submit button isEnabled:', isEnabled);

  if (isEnabled) {
    console.log('Submitting 2.5MB deposit proof...');
    await submitBtn.click();
    
    // Listen for response or error
    try {
      await page.waitForSelector('text=Deposit Request Submitted', { timeout: 15000 });
      console.log('SUCCESS: Deposit Request Submitted with 2.5MB file!');
      await page.screenshot({ path: 'scripts/large_file_deposit_success.png' });
    } catch (e) {
      console.error('FAILED to find success message. Checking for error on page:');
      const errorText = await page.locator('.text-rose-400, .text-red-500, [role="alert"]').allInnerTexts();
      console.error('Error elements found:', errorText);
      await page.screenshot({ path: 'scripts/large_file_deposit_failed.png' });
      throw e;
    }
  }

  await browser.close();
}

testLargeFileDeposit().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
