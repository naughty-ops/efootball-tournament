import { chromium, type Page, type BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

interface RouteBenchmark {
  section: 'Public' | 'Dashboard' | 'Admin' | 'Auth';
  route: string;
  viewport: string;
  initialLoadMs: number;
  repeatLoadMs: number;
  rscRequests: number;
  supabaseRequests: number;
  totalRequests: number;
  hasErrors: boolean;
  errors: string[];
}

const BASE_URL = process.env.BENCHMARK_BASE_URL || 'http://localhost:3001';

const PUBLIC_ROUTES = [
  '/',
  '/tournaments',
  '/live',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
];

const AUTH_ROUTES = [
  '/auth/login',
  '/login',
  '/signup',
  '/forgot-password',
];

const DASHBOARD_ROUTES = [
  '/dashboard',
  '/dashboard/tournaments',
  '/dashboard/matches',
  '/dashboard/wallet',
  '/dashboard/career',
  '/dashboard/notifications',
  '/dashboard/settings',
  '/dashboard/tickets',
];

const ADMIN_ROUTES = [
  '/admin',
  '/admin/dashboard',
  '/admin/tournaments',
  '/admin/participants',
  '/admin/brackets',
  '/admin/matches',
  '/admin/payouts',
  '/admin/tickets',
  '/admin/cms/homepage',
  '/admin/media',
  '/admin/avatars',
  '/admin/settings',
];

async function measureRoute(
  context: BrowserContext,
  route: string,
  section: 'Public' | 'Dashboard' | 'Admin' | 'Auth',
  viewportName: string
): Promise<RouteBenchmark> {
  // Admin routes fetch more data (avatars + profile counts, etc.) — use a longer timeout
  const navTimeout = section === 'Admin' ? 45000 : 30000;

  const page = await context.newPage();
  const errors: string[] = [];
  let rscCount = 0;
  let supabaseCount = 0;
  let totalRequests = 0;

  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  page.on('request', (req) => {
    totalRequests++;
    const url = req.url();
    if (url.includes('_rsc=') || req.headers()['rsc']) rscCount++;
    if (url.includes('supabase.co')) supabaseCount++;
  });

  const url = `${BASE_URL}${route}`;

  try {
    // 1. Initial Load
    const t0 = performance.now();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: navTimeout });
    const t1 = performance.now();
    const initialLoadMs = Math.round(t1 - t0);

    // Wait for visual settle
    await page.waitForTimeout(100);

    // 2. Repeat Load / Revisit
    const t2 = performance.now();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: navTimeout });
    const t3 = performance.now();
    const repeatLoadMs = Math.round(t3 - t2);

    await page.close();
    await new Promise((r) => setTimeout(r, 200));

    return {
      section,
      route,
      viewport: viewportName,
      initialLoadMs,
      repeatLoadMs,
      rscRequests: rscCount,
      supabaseRequests: supabaseCount,
      totalRequests,
      hasErrors: errors.length > 0,
      errors,
    };
  } catch (err) {
    await page.close().catch(() => {});
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`  ⚠️  TIMEOUT/ERROR on ${route}: ${message}`);
    return {
      section,
      route,
      viewport: viewportName,
      initialLoadMs: -1,
      repeatLoadMs: -1,
      rscRequests: rscCount,
      supabaseRequests: supabaseCount,
      totalRequests,
      hasErrors: true,
      errors: [`TIMEOUT: ${message}`],
    };
  }
}

async function runAllBenchmarks() {
  console.log('🚀 Starting Comprehensive Website-Wide Route Benchmark Audit...');

  const browser = await chromium.launch({ headless: true });
  const results: RouteBenchmark[] = [];

  const playerStatePath = path.resolve(process.cwd(), 'scripts/auth_storage_state.json');
  const adminStatePath = path.resolve(process.cwd(), 'scripts/admin_storage_state.json');

  // VIEWPORT: Desktop (1440x900)
  console.log('\n--- AUDITING PUBLIC & AUTH ROUTES (Desktop) ---');
  const guestContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  for (const r of PUBLIC_ROUTES) {
    const res = await measureRoute(guestContext, r, 'Public', 'Desktop (1440x900)');
    results.push(res);
    console.log(`[Public] ${r}: Initial ${res.initialLoadMs}ms | Repeat ${res.repeatLoadMs}ms (RSC: ${res.rscRequests}, Supabase: ${res.supabaseRequests})`);
  }

  for (const r of AUTH_ROUTES) {
    const res = await measureRoute(guestContext, r, 'Auth', 'Desktop (1440x900)');
    results.push(res);
    console.log(`[Auth] ${r}: Initial ${res.initialLoadMs}ms | Repeat ${res.repeatLoadMs}ms`);
  }
  await guestContext.close();

  // DASHBOARD ROUTES (Player Context)
  console.log('\n--- AUDITING PLAYER DASHBOARD ROUTES (Desktop) ---');
  if (fs.existsSync(playerStatePath)) {
    const playerContext = await browser.newContext({
      storageState: playerStatePath,
      viewport: { width: 1440, height: 900 },
    });

    for (const r of DASHBOARD_ROUTES) {
      const res = await measureRoute(playerContext, r, 'Dashboard', 'Desktop (1440x900)');
      results.push(res);
      console.log(`[Dashboard] ${r}: Initial ${res.initialLoadMs}ms | Repeat ${res.repeatLoadMs}ms (RSC: ${res.rscRequests}, Supabase: ${res.supabaseRequests})`);
    }
    await playerContext.close();
  }

  // ADMIN ROUTES (Admin Context)
  console.log('\n--- AUDITING ADMIN ROUTES (Desktop) ---');
  if (fs.existsSync(adminStatePath)) {
    const adminContext = await browser.newContext({
      storageState: adminStatePath,
      viewport: { width: 1440, height: 900 },
    });

    for (const r of ADMIN_ROUTES) {
      const res = await measureRoute(adminContext, r, 'Admin', 'Desktop (1440x900)');
      results.push(res);
      const init = res.initialLoadMs < 0 ? 'TIMEOUT' : `${res.initialLoadMs}ms`;
      const repeat = res.repeatLoadMs < 0 ? 'TIMEOUT' : `${res.repeatLoadMs}ms`;
      console.log(`[Admin] ${r}: Initial ${init} | Repeat ${repeat} (RSC: ${res.rscRequests}, Supabase: ${res.supabaseRequests})${res.hasErrors ? ' ⚠️' : ''}`);
    }
    await adminContext.close();
  }

  // MOBILE VIEWPORT TEST (390x844)
  console.log('\n--- AUDITING RESPONSIVE VIEWPORT: Mobile (390x844) ---');
  const mobileGuest = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  for (const r of ['/', '/tournaments', '/live']) {
    const res = await measureRoute(mobileGuest, r, 'Public', 'Mobile (390x844)');
    results.push(res);
    console.log(`[Mobile Public] ${r}: Initial ${res.initialLoadMs}ms | Repeat ${res.repeatLoadMs}ms`);
  }
  await mobileGuest.close();

  if (fs.existsSync(playerStatePath)) {
    const mobilePlayer = await browser.newContext({
      storageState: playerStatePath,
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    for (const r of [
      '/dashboard',
      '/dashboard/tournaments',
      '/dashboard/matches',
      '/dashboard/wallet',
      '/dashboard/career',
      '/dashboard/notifications',
      '/dashboard/settings',
      '/dashboard/tickets',
    ]) {
      const res = await measureRoute(mobilePlayer, r, 'Dashboard', 'Mobile (390x844)');
      results.push(res);
      console.log(`[Mobile Dashboard] ${r}: Initial ${res.initialLoadMs}ms | Repeat ${res.repeatLoadMs}ms`);
    }
    await mobilePlayer.close();
  }

  if (fs.existsSync(adminStatePath)) {
    const mobileAdmin = await browser.newContext({
      storageState: adminStatePath,
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    for (const r of ['/admin/dashboard', '/admin/tournaments', '/admin/matches', '/admin/tickets']) {
      const res = await measureRoute(mobileAdmin, r, 'Admin', 'Mobile (390x844)');
      results.push(res);
      console.log(`[Mobile Admin] ${r}: Initial ${res.initialLoadMs}ms | Repeat ${res.repeatLoadMs}ms`);
    }
    await mobileAdmin.close();
  }

  // TABLET VIEWPORT TEST (768x1024)
  console.log('\n--- AUDITING RESPONSIVE VIEWPORT: Tablet (768x1024) ---');
  if (fs.existsSync(playerStatePath)) {
    const tabletPlayer = await browser.newContext({
      storageState: playerStatePath,
      viewport: { width: 768, height: 1024 },
    });
    for (const r of ['/dashboard', '/dashboard/tournaments', '/dashboard/matches', '/dashboard/wallet']) {
      const res = await measureRoute(tabletPlayer, r, 'Dashboard', 'Tablet (768x1024)');
      results.push(res);
      console.log(`[Tablet Dashboard] ${r}: Initial ${res.initialLoadMs}ms | Repeat ${res.repeatLoadMs}ms`);
    }
    await tabletPlayer.close();
  }

  // Save report
  const outPath = path.resolve(process.cwd(), 'reports/production-readiness/website_wide_benchmarks.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\n✅ Finished auditing ${results.length} route configurations! Saved to ${outPath}`);

  await browser.close();
}

runAllBenchmarks().catch((err) => {
  console.error('Benchmark execution error:', err);
  process.exit(1);
});
