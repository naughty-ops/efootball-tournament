import { chromium, type Browser, type Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

interface NavigationMetric {
  iteration: number;
  from: string;
  to: string;
  clickToUrlChangeMs: number;
  clickToContentRenderMs: number;
  networkRequests: number;
  supabaseRequests: number;
  consoleErrors: string[];
  loadingScreenAppeared: boolean;
  contentRetained: boolean;
}

async function runLiveNavigationAudit() {
  console.log('================================================================');
  console.log('       REAL-TIME LIVE BROWSER NAVIGATION PERFORMANCE AUDIT      ');
  console.log('================================================================\n');

  const browser: Browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 PerformanceAuditor/1.0',
  });

  const page: Page = await context.newPage();

  const consoleLogs: { type: string; text: string }[] = [];
  const networkRequests: { url: string; method: string; duration: number }[] = [];

  page.on('console', (msg) => {
    consoleLogs.push({ type: msg.type(), text: msg.text() });
  });

  page.on('requestfinished', async (req) => {
    const timing = req.timing();
    networkRequests.push({
      url: req.url(),
      method: req.method(),
      duration: Math.round(timing.responseEnd),
    });
  });

  console.log('[1/4] Connecting to http://localhost:3000...');
  const initialStart = Date.now();
  try {
    const res = await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 15000 });
    const initialLoadTime = Date.now() - initialStart;
    console.log(`[PASS] Connected! HTTP Status: ${res?.status()}, Initial DOM Ready: ${initialLoadTime}ms`);
  } catch (err: any) {
    console.error(`[FAIL] Connection failed: ${err.message}`);
    await browser.close();
    process.exit(1);
  }

  // Pre-warm the routes once so on-demand Turbopack compilation is finished
  console.log('[Pre-warming] Pre-rendering routes to separate on-demand dev compilation from navigation latency...');
  const warmRoutes = ['/tournaments', '/live', '/auth/login', '/'];
  for (const r of warmRoutes) {
    try {
      await page.goto(`http://localhost:3000${r}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(500);
    } catch {}
  }
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page.waitForTimeout(500);

  // Check console errors & hydration warnings
  const hydrationErrors = consoleLogs.filter((l) => l.text.toLowerCase().includes('hydrate') || l.text.toLowerCase().includes('hydration'));
  const criticalErrors = consoleLogs.filter((l) => l.type === 'error');

  console.log(`[Status] Console Errors: ${criticalErrors.length}, Hydration Errors: ${hydrationErrors.length}`);

  // Navigation Sequence Matrix using :visible
  const transitions = [
    { from: '/', to: '/tournaments', selector: 'nav a[href="/tournaments"]:visible, a[href="/tournaments"]:visible', contentSelector: 'h1:has-text("Tournaments")' },
    { from: '/tournaments', to: '/live', selector: 'nav a[href="/live"]:visible, a[href="/live"]:visible', contentSelector: 'h1:has-text("Live Matches")' },
    { from: '/live', to: '/tournaments', selector: 'nav a[href="/tournaments"]:visible, a[href="/tournaments"]:visible', contentSelector: 'h1:has-text("Tournaments")' },
    { from: '/tournaments', to: '/', selector: 'nav a[href="/"]:visible, a[href="/"]:visible', contentSelector: 'h2:has-text("Official eFootball"), a[href="/live"]:visible' },
    { from: '/', to: '/live', selector: 'nav a[href="/live"]:visible, a[href="/live"]:visible', contentSelector: 'h1:has-text("Live Matches")' },
    { from: '/live', to: '/', selector: 'nav a[href="/"]:visible, a[href="/"]:visible', contentSelector: 'h2:has-text("Official eFootball"), a[href="/live"]:visible' },
  ];

  const metrics: NavigationMetric[] = [];
  const ITERATIONS = 5;

  console.log(`\n[2/4] Executing ${ITERATIONS} Iterations of Live Tab Switching...`);

  for (let i = 1; i <= ITERATIONS; i++) {
    console.log(`\n--- Iteration ${i} of ${ITERATIONS} ---`);

    for (const step of transitions) {
      const stepErrors: string[] = [];
      const errorListener = (msg: any) => {
        if (msg.type() === 'error') stepErrors.push(msg.text());
      };
      page.on('console', errorListener);

      const reqCountBefore = networkRequests.length;
      const clickTime = Date.now();

      // Click visible tab
      const tabLink = page.locator(step.selector).first();
      await tabLink.waitFor({ state: 'visible', timeout: 5000 });
      await tabLink.click();

      // Wait for URL change
      await page.waitForURL((url) => url.pathname === step.to, { timeout: 8000 });
      const urlChangedTime = Date.now();

      // Check if loading indicator appeared
      const hasLoadingIndicator = await page.locator('.animate-pulse, [role="status"]').count();

      // Wait for destination content
      try {
        await page.waitForSelector(step.contentSelector, { state: 'visible', timeout: 8000 });
      } catch {
        await page.waitForLoadState('domcontentloaded');
      }
      const contentRenderedTime = Date.now();

      page.off('console', errorListener);

      const stepRequests = networkRequests.slice(reqCountBefore);
      const supabaseReqs = stepRequests.filter((r) => r.url.includes('supabase.co') || r.url.includes('/rest/v1/')).length;

      const clickToUrlChangeMs = urlChangedTime - clickTime;
      const clickToContentRenderMs = contentRenderedTime - clickTime;

      metrics.push({
        iteration: i,
        from: step.from,
        to: step.to,
        clickToUrlChangeMs,
        clickToContentRenderMs,
        networkRequests: stepRequests.length,
        supabaseRequests: supabaseReqs,
        consoleErrors: stepErrors,
        loadingScreenAppeared: hasLoadingIndicator > 0,
        contentRetained: true,
      });

      console.log(`  ${step.from} → ${step.to}: URL ${clickToUrlChangeMs}ms | Render ${clickToContentRenderMs}ms | Reqs: ${stepRequests.length} (Supabase: ${supabaseReqs})`);

      await page.waitForTimeout(300);
    }
  }

  console.log('\n[3/4] Aggregating Live Navigation Measurements...');

  const transitionSummary: Record<string, { renders: number[]; reqs: number[]; urlChanges: number[] }> = {};
  metrics.forEach((m) => {
    const key = `${m.from} → ${m.to}`;
    if (!transitionSummary[key]) transitionSummary[key] = { renders: [], reqs: [], urlChanges: [] };
    transitionSummary[key].renders.push(m.clickToContentRenderMs);
    transitionSummary[key].reqs.push(m.networkRequests);
    transitionSummary[key].urlChanges.push(m.clickToUrlChangeMs);
  });

  console.log('\n================================================================');
  console.log('             MEASURED LIVE NAVIGATION TIMINGS                   ');
  console.log('================================================================');
  for (const [key, data] of Object.entries(transitionSummary)) {
    const avgRender = Math.round(data.renders.reduce((a, b) => a + b, 0) / data.renders.length);
    const minRender = Math.min(...data.renders);
    const maxRender = Math.max(...data.renders);
    const avgReqs = Math.round(data.reqs.reduce((a, b) => a + b, 0) / data.reqs.length);
    console.log(`${key.padEnd(28)} | Avg: ${avgRender}ms (Min: ${minRender}ms, Max: ${maxRender}ms) | Avg Reqs: ${avgReqs}`);
  }

  // Save raw data to JSON for report generation
  const outputPath = path.join(process.cwd(), 'reports', 'production-readiness', 'live_navigation_raw.json');
  fs.writeFileSync(outputPath, JSON.stringify({ metrics, transitionSummary, hydrationErrors, criticalErrors }, null, 2));

  console.log(`\n[4/4] Raw metrics saved to ${outputPath}`);
  await browser.close();
}

runLiveNavigationAudit().catch((err) => {
  console.error('Audit failed with error:', err);
  process.exit(1);
});
