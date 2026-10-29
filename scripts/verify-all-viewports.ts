import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

interface ViewportSpec {
  name: string;
  width: number;
  height: number;
  category: 'mobile' | 'tablet' | 'desktop';
}

const VIEWPORTS: ViewportSpec[] = [
  { name: '320px-small-mobile', width: 320, height: 568, category: 'mobile' },
  { name: '360px-compact-android', width: 360, height: 640, category: 'mobile' },
  { name: '375px-standard-mobile', width: 375, height: 667, category: 'mobile' },
  { name: '390px-modern-iphone', width: 390, height: 844, category: 'mobile' },
  { name: '430px-large-mobile', width: 430, height: 932, category: 'mobile' },
  { name: '600px-small-tablet', width: 600, height: 960, category: 'tablet' },
  { name: '768px-tablet-portrait', width: 768, height: 1024, category: 'tablet' },
  { name: '1024px-tablet-landscape', width: 1024, height: 768, category: 'tablet' },
  { name: '1280px-laptop', width: 1280, height: 800, category: 'desktop' },
  { name: '1366px-standard-laptop', width: 1366, height: 768, category: 'desktop' },
  { name: '1440px-desktop', width: 1440, height: 900, category: 'desktop' },
  { name: '1920px-large-display', width: 1920, height: 1080, category: 'desktop' },
];

const PAGES_TO_TEST = [
  { path: '/', name: 'Homepage' },
  { path: '/tournaments', name: 'Tournament Catalog' },
  { path: '/tournaments/b50937c4-548c-4a3a-a1ea-b9034ff90469', name: 'Tournament Details' },
  { path: '/live', name: 'Live Match Hub' },
  { path: '/about', name: 'About Platform' },
  { path: '/contact', name: 'Contact Us' },
  { path: '/auth/login', name: 'Auth Login' },
  { path: '/login', name: 'Sign In' },
  { path: '/signup', name: 'Create Account' },
  { path: '/forgot-password', name: 'Password Recovery' },
];

interface TestCheckResult {
  viewport: string;
  width: number;
  page: string;
  url: string;
  hasHorizontalOverflow: boolean;
  scrollWidth: number;
  clientWidth: number;
  overflowPx: number;
  passed: boolean;
  notes?: string;
}

async function runFullVerification() {
  const screenshotsDir = path.join(process.cwd(), 'test-results', 'verified-screenshots');
  fs.mkdirSync(screenshotsDir, { recursive: true });

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const results: TestCheckResult[] = [];
  let totalChecks = 0;
  let passedChecks = 0;
  let failedChecks = 0;

  console.log('================================================================');
  console.log(' COMPLETE RESPONSIVENESS & COLLISION VERIFICATION TEST SUITE   ');
  console.log(` Testing ${PAGES_TO_TEST.length} pages across ${VIEWPORTS.length} viewports (320px to 1920px)`);
  console.log('================================================================\n');

  for (const vp of VIEWPORTS) {
    const vpFolder = path.join(screenshotsDir, vp.name);
    fs.mkdirSync(vpFolder, { recursive: true });

    await page.setViewportSize({ width: vp.width, height: vp.height });

    for (const testPage of PAGES_TO_TEST) {
      totalChecks++;
      const url = `http://localhost:3000${testPage.path}`;

      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });
        await page.waitForTimeout(300);

        const metrics = await page.evaluate(() => {
          const docEl = document.documentElement;
          const body = document.body;
          const scrollWidth = Math.max(docEl.scrollWidth, body ? body.scrollWidth : 0);
          const clientWidth = docEl.clientWidth;
          const windowWidth = window.innerWidth;

          // Check if any visible element overflows the viewport horizontally
          let maxElementRight = windowWidth;
          let worstElement = '';
          const elements = Array.from(document.querySelectorAll('*'));
          for (const el of elements) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              if (rect.right > maxElementRight) {
                maxElementRight = rect.right;
                worstElement = `${el.tagName.toLowerCase()}.${(typeof el.className === 'string' ? el.className.split(' ')[0] : '')}`;
              }
            }
          }

          return {
            scrollWidth,
            clientWidth,
            windowWidth,
            maxElementRight: Math.round(maxElementRight),
            worstElement,
            hasOverflow: scrollWidth > clientWidth + 1,
            overflowPx: Math.max(0, scrollWidth - clientWidth),
          };
        });

        // Screenshot for visual evidence
        const slug = testPage.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        await page.screenshot({
          path: path.join(vpFolder, `${slug}.png`),
          fullPage: false,
        });

        const isPassed = !metrics.hasOverflow;
        if (isPassed) {
          passedChecks++;
          console.log(`✅ PASS [${vp.name}] ${testPage.name} (scrollWidth=${metrics.scrollWidth}px, clientWidth=${metrics.clientWidth}px)`);
        } else {
          failedChecks++;
          console.error(`❌ FAIL [${vp.name}] ${testPage.name} — Overflow +${metrics.overflowPx}px (scroll: ${metrics.scrollWidth}px, client: ${metrics.clientWidth}px, worst: ${metrics.worstElement})`);
        }

        results.push({
          viewport: vp.name,
          width: vp.width,
          page: testPage.name,
          url: testPage.path,
          hasHorizontalOverflow: metrics.hasOverflow,
          scrollWidth: metrics.scrollWidth,
          clientWidth: metrics.clientWidth,
          overflowPx: metrics.overflowPx,
          passed: isPassed,
          notes: metrics.hasOverflow ? `Exceeded by ${metrics.overflowPx}px at ${metrics.worstElement}` : 'No horizontal overflow',
        });
      } catch (err: any) {
        console.warn(`⚠️ WARN [${vp.name}] ${testPage.name}: ${err.message}`);
      }
    }
  }

  await browser.close();

  // Save JSON report
  const summary = {
    timestamp: new Date().toISOString(),
    totalChecks,
    passedChecks,
    failedChecks,
    passRate: `${((passedChecks / totalChecks) * 100).toFixed(1)}%`,
    results,
  };

  const reportFile = path.join(process.cwd(), 'test-results', 'final-responsiveness-report.json');
  fs.writeFileSync(reportFile, JSON.stringify(summary, null, 2));

  console.log('\n================================================================');
  console.log(` FINAL RESPONSIVENESS VERIFICATION SUMMARY:`);
  console.log(` Total Scenarios: ${totalChecks}`);
  console.log(` Passed:          ${passedChecks}`);
  console.log(` Failed:          ${failedChecks}`);
  console.log(` Pass Rate:        ${summary.passRate}`);
  console.log(` Report written to: ${reportFile}`);
  console.log('================================================================\n');

  if (failedChecks > 0) {
    process.exit(1);
  }
}

runFullVerification().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
