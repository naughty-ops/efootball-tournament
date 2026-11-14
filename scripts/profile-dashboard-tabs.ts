import { chromium, type Page, type BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

interface NavigationRecord {
  testSuite: string;
  iteration: number;
  from: string;
  to: string;
  selector: string;
  clickTimestamp: number;
  navCompleteTimestamp: number;
  totalDurationMs: number;
  rscRequestsCount: number;
  supabaseRequestsCount: number;
  totalNetworkRequestsCount: number;
  networkBytesTotal: number;
  consoleErrors: string[];
}

const DASHBOARD_TABS = [
  { name: 'Dashboard', path: '/dashboard', selector: 'header nav a[href="/dashboard"]' },
  { name: 'Tournaments', path: '/dashboard/tournaments', selector: 'header nav a[href="/dashboard/tournaments"]' },
  { name: 'Matches', path: '/dashboard/matches', selector: 'header nav a[href="/dashboard/matches"]' },
  { name: 'Wallet', path: '/dashboard/wallet', selector: 'header nav a[href="/dashboard/wallet"]' },
  { name: 'Settings', path: '/dashboard/settings', selector: 'header nav a[href="/dashboard/settings"]' },
];

const SUB_TABS = [
  { name: 'Career', path: '/dashboard/career', selector: 'a[href="/dashboard/career"]' },
  { name: 'Notifications', path: '/dashboard/notifications', selector: 'a[href="/dashboard/notifications"]' },
  { name: 'Tickets', path: '/dashboard/tickets', selector: 'a[href="/dashboard/tickets"]' },
];

async function measureNavigation(
  page: Page,
  testSuite: string,
  iteration: number,
  from: string,
  to: string,
  trigger: () => Promise<void>
): Promise<NavigationRecord> {
  const rscRequests: string[] = [];
  const supabaseRequests: string[] = [];
  const consoleErrors: string[] = [];
  let totalRequests = 0;
  let totalBytes = 0;

  const onRequest = (req: any) => {
    const url = req.url();
    totalRequests++;
    if (url.includes('_rsc=') || req.headers()['rsc']) {
      rscRequests.push(url);
    }
    if (url.includes('supabase.co')) {
      supabaseRequests.push(url);
    }
  };

  const onResponse = async (res: any) => {
    try {
      const headers = res.headers();
      const len = headers['content-length'];
      if (len) totalBytes += parseInt(len, 10);
    } catch {}
  };

  const onConsole = (msg: any) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  };

  page.on('request', onRequest);
  page.on('response', onResponse);
  page.on('console', onConsole);

  const clickTimestamp = performance.now();
  await trigger();
  
  // Wait until URL matches target
  await page.waitForURL(`**${to}*`, { timeout: 15000 });
  
  // Wait for visual content to settle
  await page.waitForTimeout(50);
  const navCompleteTimestamp = performance.now();

  page.off('request', onRequest);
  page.off('response', onResponse);
  page.off('console', onConsole);

  const duration = Math.round(navCompleteTimestamp - clickTimestamp);

  return {
    testSuite,
    iteration,
    from,
    to,
    selector: '',
    clickTimestamp,
    navCompleteTimestamp,
    totalDurationMs: duration,
    rscRequestsCount: rscRequests.length,
    supabaseRequestsCount: supabaseRequests.length,
    totalNetworkRequestsCount: totalRequests,
    networkBytesTotal: totalBytes,
    consoleErrors,
  };
}

async function runProfiling() {
  console.log('🚀 Starting Real-Time Browser Performance Profiling of Dashboard Tabs...');

  const storageStatePath = path.resolve(process.cwd(), 'scripts/auth_storage_state.json');
  if (!fs.existsSync(storageStatePath)) {
    throw new Error('auth_storage_state.json not found! Run scripts/test-login-player.ts first.');
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: storageStatePath,
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();
  const records: NavigationRecord[] = [];

  // Navigate to initial dashboard page
  console.log('Loading baseline /dashboard...');
  await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle' });
  await page.waitForSelector('header nav', { timeout: 10000 });
  console.log('Initial dashboard loaded successfully.');

  // TEST A: Sequential Dashboard navigation
  // Dashboard → Tournaments → Matches → Wallet → Career → Notifications → Settings → Tickets → Dashboard
  console.log('\n--- EXECUTING TEST A: Sequential Dashboard Navigation ---');
  const seqTabs = [
    { name: 'Tournaments', path: '/dashboard/tournaments' },
    { name: 'Matches', path: '/dashboard/matches' },
    { name: 'Wallet', path: '/dashboard/wallet' },
    { name: 'Career', path: '/dashboard/career' },
    { name: 'Notifications', path: '/dashboard/notifications' },
    { name: 'Settings', path: '/dashboard/settings' },
    { name: 'Tickets', path: '/dashboard/tickets' },
    { name: 'Dashboard', path: '/dashboard' },
  ];

  let currentPath = '/dashboard';
  for (const target of seqTabs) {
    const record = await measureNavigation(
      page,
      'Test A - Sequential',
      1,
      currentPath,
      target.path,
      async () => {
        // Try clicking nav link or open dropdown menu
        const visibleLink = page.locator(`header a[href="${target.path}"]:visible`).first();
        if (await visibleLink.count() > 0) {
          await visibleLink.click();
        } else {
          // Open profile dropdown menu (scoped to visible desktop/mobile)
          const dropdownTrigger = page.locator('header button[aria-label="User Profile Menu"]:visible').first();
          if (await dropdownTrigger.count() > 0) {
            await dropdownTrigger.click();
            await page.waitForTimeout(100);
            const menuLink = page.locator(`a[href="${target.path}"]:visible`).first();
            if (await menuLink.count() > 0) {
              await menuLink.click();
              return;
            }
          }
          await page.goto(`http://localhost:3000${target.path}`);
        }
      }
    );
    records.push(record);
    console.log(`[Test A] ${record.from} -> ${record.to}: ${record.totalDurationMs} ms (RSC: ${record.rscRequestsCount}, Supabase: ${record.supabaseRequestsCount})`);
    currentPath = target.path;
    await page.waitForTimeout(300);
  }

  // TEST B: Repeated navigation (10x Dashboard <-> Tournaments)
  console.log('\n--- EXECUTING TEST B: Repeated Navigation (10x Dashboard <-> Tournaments) ---');
  for (let i = 1; i <= 10; i++) {
    const toTournaments = await measureNavigation(
      page,
      'Test B - Repeated',
      i,
      '/dashboard',
      '/dashboard/tournaments',
      async () => {
        await page.locator('header nav a[href="/dashboard/tournaments"]').first().click();
      }
    );
    records.push(toTournaments);

    await page.waitForTimeout(150);

    const toDashboard = await measureNavigation(
      page,
      'Test B - Repeated',
      i,
      '/dashboard/tournaments',
      '/dashboard',
      async () => {
        await page.locator('header nav a[href="/dashboard"]').first().click();
      }
    );
    records.push(toDashboard);

    console.log(`[Test B - Iter ${i}] D->T: ${toTournaments.totalDurationMs}ms | T->D: ${toDashboard.totalDurationMs}ms (RSC D->T: ${toTournaments.rscRequestsCount}, T->D: ${toDashboard.rscRequestsCount})`);
  }

  // TEST C: Reverse navigation
  // Settings → Matches → Dashboard → Tournaments → Wallet → Matches
  console.log('\n--- EXECUTING TEST C: Reverse Navigation ---');
  const reverseSeq = [
    { from: '/dashboard', to: '/dashboard/settings' },
    { from: '/dashboard/settings', to: '/dashboard/matches' },
    { from: '/dashboard/matches', to: '/dashboard' },
    { from: '/dashboard', to: '/dashboard/tournaments' },
    { from: '/dashboard/tournaments', to: '/dashboard/wallet' },
    { from: '/dashboard/wallet', to: '/dashboard/matches' },
  ];

  for (const step of reverseSeq) {
    const record = await measureNavigation(
      page,
      'Test C - Reverse',
      1,
      step.from,
      step.to,
      async () => {
        const link = page.locator(`header nav a[href="${step.to}"]`).first();
        if (await link.count() > 0) {
          await link.click();
        } else {
          await page.goto(`http://localhost:3000${step.to}`);
        }
      }
    );
    records.push(record);
    console.log(`[Test C] ${record.from} -> ${record.to}: ${record.totalDurationMs} ms (RSC: ${record.rscRequestsCount}, Supabase: ${record.supabaseRequestsCount})`);
    await page.waitForTimeout(200);
  }

  // TEST F: Slow network simulation (Fast 3G profile)
  console.log('\n--- EXECUTING TEST F: Network Throttling (Simulated 3G) ---');
  const cdp = await context.newCDPSession(page);
  // Fast 3G: 1.5 Mbps down, 750 kbps up, 40ms latency
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: (1.5 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
    latency: 40,
  });

  const throttledNav1 = await measureNavigation(
    page,
    'Test F - Throttled 3G',
    1,
    '/dashboard/matches',
    '/dashboard/tournaments',
    async () => {
      await page.locator('header nav a[href="/dashboard/tournaments"]').first().click();
    }
  );
  records.push(throttledNav1);
  console.log(`[Test F - Throttled] Matches -> Tournaments: ${throttledNav1.totalDurationMs} ms (RSC: ${throttledNav1.rscRequestsCount})`);

  const throttledNav2 = await measureNavigation(
    page,
    'Test F - Throttled 3G',
    1,
    '/dashboard/tournaments',
    '/dashboard/wallet',
    async () => {
      await page.locator('header nav a[href="/dashboard/wallet"]').first().click();
    }
  );
  records.push(throttledNav2);
  console.log(`[Test F - Throttled] Tournaments -> Wallet: ${throttledNav2.totalDurationMs} ms (RSC: ${throttledNav2.rscRequestsCount})`);

  // Reset throttling
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: -1,
    uploadThroughput: -1,
    latency: 0,
  });

  // Save results
  const outPath = path.resolve(process.cwd(), 'reports/production-readiness/dashboard_profiling_baseline.json');
  fs.writeFileSync(outPath, JSON.stringify(records, null, 2));
  console.log(`\n✅ Profiling complete! Saved ${records.length} records to ${outPath}`);

  await browser.close();
}

runProfiling().catch(err => {
  console.error('Profiling error:', err);
  process.exit(1);
});
