import { chromium, type Page, type BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

interface AuditResult {
  phase: string;
  category: string;
  url: string;
  viewport: string;
  title: string;
  heading: string;
  hasHorizontalOverflow: boolean;
  overflowWidth?: number;
  smallTouchTargetsCount: number;
  smallTouchTargets: string[];
  consoleErrors: string[];
  consoleWarnings: string[];
  missingAltImagesCount: number;
  interactiveElementsCount: number;
  notes: string[];
}

const BASE_URL = process.env.AUDIT_BASE_URL || 'http://localhost:3001';

const VIEWPORTS = [
  { name: 'Desktop (1440x900)', width: 1440, height: 900, isMobile: false },
  { name: 'Mobile Standard (390x844)', width: 390, height: 844, isMobile: true },
  { name: 'Mobile Small (360x800)', width: 360, height: 800, isMobile: true },
  { name: 'Mobile Large (430x932)', width: 430, height: 932, isMobile: true },
  { name: 'Tablet (768x1024)', width: 768, height: 1024, isMobile: false },
];

async function inspectPage(
  context: BrowserContext,
  route: string,
  phase: string,
  category: string,
  vp: { name: string; width: number; height: number; isMobile: boolean }
): Promise<AuditResult> {
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  const consoleWarnings: string[] = [];
  const notes: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
    if (msg.type() === 'warning') consoleWarnings.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  const url = `${BASE_URL}${route}`;

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(500); // Allow React components to settle

    const title = await page.title().catch(() => '');
    const heading = await page.$eval('h1, h2', (el) => el.textContent?.trim() || '').catch(() => 'No H1/H2');

    // 1. Horizontal overflow detection
    const overflowInfo = await page.evaluate(() => {
      const docEl = document.documentElement;
      const body = document.body;
      const scrollW = Math.max(docEl.scrollWidth, body.scrollWidth);
      const clientW = Math.max(docEl.clientWidth, body.clientWidth);
      return {
        hasOverflow: scrollW > clientW + 2,
        scrollW,
        clientW,
      };
    });

    // 2. Touch target size check (< 44x44px for buttons & primary links)
    const touchTargetIssues = await page.evaluate((isMobile) => {
      const interactiveEls = Array.from(document.querySelectorAll('button, a, input[type="button"], input[type="submit"]'));
      const small: string[] = [];

      for (const el of interactiveEls) {
        const rect = el.getBoundingClientRect();
        // Only inspect visible elements
        if (rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== 'hidden') {
          // If on mobile, evaluate minimum 40px touch bounds
          if (isMobile && (rect.width < 36 || rect.height < 36)) {
            const text = (el.textContent || el.getAttribute('aria-label') || el.className || 'element').trim().slice(0, 30);
            small.push(`${el.tagName.toLowerCase()} "${text}" (${Math.round(rect.width)}x${Math.round(rect.height)}px)`);
          }
        }
      }
      return small;
    }, vp.isMobile);

    // 3. Image accessibility check (missing alt attribute)
    const missingAltCount = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      return imgs.filter((img) => !img.hasAttribute('alt') || img.getAttribute('alt') === '').length;
    });

    // 4. Interactive elements count
    const interactiveCount = await page.evaluate(() => {
      return document.querySelectorAll('button, a, input, select, textarea').length;
    });

    // 5. Specific route checks
    if (route === '/') {
      const hasTournamentsSection = await page.evaluate(() => Boolean(document.querySelector('#tournaments, [data-section="tournaments"], a[href="/tournaments"]')));
      notes.push(`Homepage tournaments section visible: ${hasTournamentsSection}`);
    } else if (route === '/tournaments') {
      const tournamentCards = await page.$$eval('[data-testid="tournament-card"], .tournament-card, a[href^="/tournaments/"], a[href^="/t/"]', (els) => els.length);
      notes.push(`Discovered tournament cards count: ${tournamentCards}`);
    } else if (route === '/dashboard/wallet') {
      const hasBalanceCard = await page.evaluate(() => Boolean(document.body.innerText.includes('Balance') || document.body.innerText.includes('Earnings')));
      notes.push(`Wallet balance UI rendered: ${hasBalanceCard}`);
    } else if (route === '/dashboard/matches') {
      const matchCount = await page.evaluate(() => document.querySelectorAll('[data-testid="match-card"], .match-card').length);
      notes.push(`Visible match items: ${matchCount}`);
    }

    await page.close();

    return {
      phase,
      category,
      url,
      viewport: vp.name,
      title,
      heading,
      hasHorizontalOverflow: overflowInfo.hasOverflow,
      overflowWidth: overflowInfo.scrollW,
      smallTouchTargetsCount: touchTargetIssues.length,
      smallTouchTargets: touchTargetIssues.slice(0, 5),
      consoleErrors,
      consoleWarnings,
      missingAltImagesCount: missingAltCount,
      interactiveElementsCount: interactiveCount,
      notes,
    };
  } catch (err: any) {
    await page.close().catch(() => {});
    return {
      phase,
      category,
      url,
      viewport: vp.name,
      title: 'ERROR',
      heading: 'ERROR',
      hasHorizontalOverflow: false,
      smallTouchTargetsCount: 0,
      smallTouchTargets: [],
      consoleErrors: [err.message || String(err)],
      consoleWarnings: [],
      missingAltImagesCount: 0,
      interactiveElementsCount: 0,
      notes: [`Failed to load: ${err.message}`],
    };
  }
}

async function runComprehensivePlayerAudit() {
  console.log('🏁 Starting Complete Player Experience Audit across All User Journeys...');

  const browser = await chromium.launch({ headless: true });
  const results: AuditResult[] = [];

  const playerStatePath = path.resolve(process.cwd(), 'scripts/auth_storage_state.json');

  // --- 1. FIRST-TIME VISITOR (Guest Context) ---
  console.log('\n--- 1. FIRST-TIME VISITOR AUDIT ---');
  const publicRoutes = ['/', '/tournaments', '/live', '/about', '/contact', '/privacy', '/terms'];

  // Test on Desktop and Mobile
  for (const vp of [VIEWPORTS[0], VIEWPORTS[1], VIEWPORTS[2]]) {
    console.log(`Auditing Public Routes on ${vp.name}...`);
    const guestCtx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile });
    for (const r of publicRoutes) {
      const res = await inspectPage(guestCtx, r, 'Phase 1', 'Public', vp);
      results.push(res);
      console.log(`  [${vp.name}] ${r} -> Title: "${res.title.slice(0, 25)}...", Overflow: ${res.hasHorizontalOverflow}, Errors: ${res.consoleErrors.length}`);
    }
    await guestCtx.close();
  }

  // --- 2. AUTHENTICATION & REGISTRATION ---
  console.log('\n--- 2. AUTH & ONBOARDING AUDIT ---');
  const authRoutes = ['/auth/login', '/signup', '/forgot-password', '/login'];
  for (const vp of [VIEWPORTS[0], VIEWPORTS[1]]) {
    const guestCtx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile });
    for (const r of authRoutes) {
      const res = await inspectPage(guestCtx, r, 'Phase 2', 'Auth', vp);
      results.push(res);
      console.log(`  [${vp.name}] ${r} -> Heading: "${res.heading}", TouchTarget Issues: ${res.smallTouchTargetsCount}`);
    }
    await guestCtx.close();
  }

  // --- 3. PLAYER DASHBOARD (8 TABS) ---
  console.log('\n--- 3. PLAYER DASHBOARD ALL 8 TABS AUDIT ---');
  const dashboardRoutes = [
    '/dashboard',
    '/dashboard/tournaments',
    '/dashboard/matches',
    '/dashboard/wallet',
    '/dashboard/career',
    '/dashboard/notifications',
    '/dashboard/settings',
    '/dashboard/tickets',
  ];

  if (fs.existsSync(playerStatePath)) {
    for (const vp of [VIEWPORTS[0], VIEWPORTS[1], VIEWPORTS[2], VIEWPORTS[4]]) {
      console.log(`Auditing Player Dashboard on ${vp.name}...`);
      const playerCtx = await browser.newContext({
        storageState: playerStatePath,
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.isMobile,
      });

      for (const r of dashboardRoutes) {
        const res = await inspectPage(playerCtx, r, 'Phase 5', 'Dashboard', vp);
        results.push(res);
        console.log(`  [${vp.name}] ${r} -> Overflow: ${res.hasHorizontalOverflow}, SmallTargets: ${res.smallTouchTargetsCount}, Notes: ${res.notes.join('; ')}`);
      }
      await playerCtx.close();
    }
  } else {
    console.warn('⚠️ Player state file not found! Skipping authenticated dashboard audit.');
  }

  // --- SAVE RAW AUDIT DATA ---
  const outPath = path.resolve(process.cwd(), 'reports/player-experience/raw_audit_results.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\n✅ Completed Player Experience Audit! Total inspections: ${results.length}. Saved to ${outPath}`);

  await browser.close();
}

runComprehensivePlayerAudit().catch((err) => {
  console.error('Player Experience Audit script error:', err);
  process.exit(1);
});
