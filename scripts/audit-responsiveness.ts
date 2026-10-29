import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

interface ViewportConfig {
  name: string;
  width: number;
  height: number;
}

const VIEWPORTS: ViewportConfig[] = [
  { name: '320px-small-mobile', width: 320, height: 600 },
  { name: '375px-standard-mobile', width: 375, height: 667 },
  { name: '390px-modern-mobile', width: 390, height: 844 },
  { name: '768px-tablet-portrait', width: 768, height: 1024 },
  { name: '1024px-tablet-landscape', width: 1024, height: 768 },
  { name: '1280px-laptop', width: 1280, height: 800 },
  { name: '1440px-desktop', width: 1440, height: 900 },
  { name: '1920px-large-desktop', width: 1920, height: 1080 },
];

const ROUTES = [
  { path: '/', name: 'home' },
  { path: '/tournaments', name: 'tournaments-catalog' },
  { path: '/tournaments/b50937c4-548c-4a3a-a1ea-b9034ff90469', name: 'tournament-detail' },
  { path: '/live', name: 'live-hub' },
  { path: '/about', name: 'about' },
  { path: '/contact', name: 'contact' },
  { path: '/auth/login', name: 'login' },
  { path: '/signup', name: 'signup' },
  { path: '/forgot-password', name: 'forgot-password' },
  { path: '/dashboard', name: 'dashboard-overview' },
  { path: '/dashboard/tournaments', name: 'dashboard-tournaments' },
  { path: '/dashboard/matches', name: 'dashboard-matches' },
  { path: '/dashboard/profile', name: 'dashboard-profile' },
  { path: '/admin/dashboard', name: 'admin-dashboard' },
  { path: '/admin/tournaments', name: 'admin-tournaments' },
  { path: '/admin/tournaments/new', name: 'admin-tournaments-new' },
  { path: '/admin/participants', name: 'admin-participants' },
  { path: '/admin/matches', name: 'admin-matches' },
  { path: '/admin/settings', name: 'admin-settings' },
];

interface OverflowFinding {
  route: string;
  viewport: string;
  width: number;
  scrollWidth: number;
  clientWidth: number;
  overflowPx: number;
  offendingElements: Array<{
    tag: string;
    id: string;
    className: string;
    rect: { left: number; right: number; width: number };
    outerSnippet: string;
  }>;
}

async function runAudit() {
  const screenshotsDir = path.join(process.cwd(), 'test-results', 'screenshots');
  fs.mkdirSync(screenshotsDir, { recursive: true });

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const findings: OverflowFinding[] = [];
  const baseUrl = 'http://localhost:3000';

  console.log(`Starting responsive audit across ${ROUTES.length} routes and ${VIEWPORTS.length} viewports...`);

  for (const vp of VIEWPORTS) {
    console.log(`\n=== Testing Viewport: ${vp.name} (${vp.width}x${vp.height}) ===`);
    const vpDir = path.join(screenshotsDir, vp.name);
    fs.mkdirSync(vpDir, { recursive: true });

    await page.setViewportSize({ width: vp.width, height: vp.height });

    for (const route of ROUTES) {
      const url = `${baseUrl}${route.path}`;
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(500); // allow layout & animations to settle

        // Check horizontal overflow
        const overflowData = await page.evaluate(() => {
          const docEl = document.documentElement;
          const body = document.body;
          const scrollWidth = Math.max(docEl.scrollWidth, body ? body.scrollWidth : 0);
          const clientWidth = docEl.clientWidth;
          const windowWidth = window.innerWidth;

          const offenders: Array<{
            tag: string;
            id: string;
            className: string;
            rect: { left: number; right: number; width: number };
            outerSnippet: string;
          }> = [];

          if (scrollWidth > clientWidth + 1) {
            // Find elements extending beyond windowWidth
            const allElements = Array.from(document.querySelectorAll('*'));
            for (const el of allElements) {
              const rect = el.getBoundingClientRect();
              // Ignore zero-size or hidden elements
              if (rect.width === 0 || rect.height === 0) continue;
              if (rect.right > windowWidth + 1.5) {
                offenders.push({
                  tag: el.tagName.toLowerCase(),
                  id: el.id || '',
                  className: (typeof el.className === 'string' ? el.className : '').substring(0, 100),
                  rect: {
                    left: Math.round(rect.left),
                    right: Math.round(rect.right),
                    width: Math.round(rect.width),
                  },
                  outerSnippet: el.outerHTML.substring(0, 150),
                });
              }
            }
          }

          return {
            scrollWidth,
            clientWidth,
            windowWidth,
            hasOverflow: scrollWidth > clientWidth + 1,
            offenders: offenders.slice(0, 10), // cap to top 10
          };
        });

        const screenshotPath = path.join(vpDir, `${route.name}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });

        if (overflowData.hasOverflow) {
          console.log(`[OVERFLOW] ${route.path} on ${vp.name}: scrollWidth=${overflowData.scrollWidth} > clientWidth=${overflowData.clientWidth} (+${overflowData.scrollWidth - overflowData.clientWidth}px)`);
          findings.push({
            route: route.path,
            viewport: vp.name,
            width: vp.width,
            scrollWidth: overflowData.scrollWidth,
            clientWidth: overflowData.clientWidth,
            overflowPx: overflowData.scrollWidth - overflowData.clientWidth,
            offendingElements: overflowData.offenders,
          });
        } else {
          console.log(`[PASS] ${route.path} on ${vp.name}`);
        }
      } catch (err: any) {
        console.warn(`[WARN] Error navigating to ${url} on ${vp.name}: ${err.message}`);
      }
    }
  }

  await browser.close();

  const reportPath = path.join(process.cwd(), 'test-results', 'responsiveness-audit-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(findings, null, 2));

  console.log(`\nAudit complete!`);
  console.log(`Total overflow issues detected: ${findings.length}`);
  console.log(`Full report saved to: ${reportPath}`);
}

runAudit().catch((err) => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
