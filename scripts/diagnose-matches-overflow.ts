import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3000';
const PLAYER_STATE = 'scripts/auth_storage_state.json';

async function diagnose() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 360, height: 800 },
    storageState: PLAYER_STATE,
  });

  const page = await context.newPage();
  await page.goto(`${BASE_URL}/dashboard/matches`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const docScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  console.log('Document scrollWidth at 360px viewport:', docScrollWidth);

  const overflowingElements = await page.evaluate(() => {
    const results: any[] = [];
    const all = document.querySelectorAll('*');
    for (const el of Array.from(all)) {
      const rect = el.getBoundingClientRect();
      if (rect.right > 361 || el.scrollWidth > 361) {
        results.push({
          tagName: el.tagName,
          className: typeof el.className === 'string' ? el.className : '',
          id: el.id,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          rectRight: rect.right,
          rectWidth: rect.width,
          outerHTMLSnippet: el.outerHTML.slice(0, 160),
        });
      }
    }
    return results;
  });

  console.log(`Found ${overflowingElements.length} overflowing elements:`);
  for (const item of overflowingElements.slice(0, 15)) {
    console.log(JSON.stringify(item, null, 2));
  }

  await browser.close();
}

diagnose().catch(console.error);
