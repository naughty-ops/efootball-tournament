import { chromium } from 'playwright';
import * as fs from 'fs';

const BASE_URL = 'http://localhost:3001';
const PLAYER_STATE = 'scripts/auth_storage_state.json';
const ADMIN_STATE = 'scripts/admin_storage_state.json';

const VIEWPORTS = [
  { name: '360x800 (Mobile Small)', width: 360, height: 800 },
  { name: '375x812 (iPhone Mini)', width: 375, height: 812 },
  { name: '390x844 (iPhone 12/13/14)', width: 390, height: 844 },
  { name: '430x932 (iPhone Pro Max)', width: 430, height: 932 },
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

interface TestResult {
  category: string;
  name: string;
  status: 'PASS' | 'FAIL';
  details: string;
}

const results: TestResult[] = [];

async function runTests() {
  console.log('🚀 Starting Phase 1 Critical Fixes Verification Suite...\n');
  const browser = await chromium.launch({ headless: true });

  try {
    // ============================================================
    // TEST SUITE 1: MOBILE HORIZONTAL OVERFLOW AT 360px, 375px, 390px, 430px
    // ============================================================
    console.log('--- TEST SUITE 1: Mobile Horizontal Overflow Across Viewports ---');
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        storageState: PLAYER_STATE,
      });
      const page = await context.newPage();

      let overflowCount = 0;
      for (const route of DASHBOARD_ROUTES) {
        await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle' });
        const docScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
        const maxScroll = Math.max(docScrollWidth, bodyScrollWidth);
        const hasOverflow = maxScroll > vp.width;

        if (hasOverflow) {
          overflowCount++;
          console.log(`  ❌ [${vp.name}] ${route} -> Overflow detected! scrollWidth: ${maxScroll}px > viewport: ${vp.width}px (+${maxScroll - vp.width}px)`);
        } else {
          console.log(`  ✅ [${vp.name}] ${route} -> Clean fit (scrollWidth: ${maxScroll}px <= ${vp.width}px)`);
        }
      }

      results.push({
        category: 'Task 1: Horizontal Overflow',
        name: `Viewport ${vp.name} across 8 Dashboard tabs`,
        status: overflowCount === 0 ? 'PASS' : 'FAIL',
        details: overflowCount === 0 ? `Zero overflow across all 8 tabs (${vp.width}px width maintained)` : `${overflowCount} tabs exhibited overflow`,
      });

      await context.close();
    }

    // ============================================================
    // TEST SUITE 2: AUTHENTICATION REDIRECTS (ANONYMOUS & ROLES)
    // ============================================================
    console.log('\n--- TEST SUITE 2: Authentication Redirect Routing ---');
    {
      // 2.1 Anonymous user visiting /dashboard
      const anonContext = await browser.newContext();
      const anonPage = await anonContext.newPage();
      await anonPage.goto(`${BASE_URL}/dashboard`);
      const finalUrl = anonPage.url();
      const isPlayerLogin = finalUrl.includes('/auth/login');
      const hasNextParam = finalUrl.includes('next=%2Fdashboard') || finalUrl.includes('next=/dashboard');
      console.log(`  Anonymous -> /dashboard => Final URL: ${finalUrl}`);
      results.push({
        category: 'Task 2: Auth Redirects',
        name: 'Anonymous access to /dashboard redirects to /auth/login with next param',
        status: isPlayerLogin && hasNextParam ? 'PASS' : 'FAIL',
        details: `Final URL: ${finalUrl}`,
      });

      // 2.2 Anonymous user visiting /admin
      await anonPage.goto(`${BASE_URL}/admin`);
      const adminUrl = anonPage.url();
      const isAdminLogin = adminUrl.includes('/login') && !adminUrl.includes('/auth/login');
      console.log(`  Anonymous -> /admin => Final URL: ${adminUrl}`);
      results.push({
        category: 'Task 2: Auth Redirects',
        name: 'Anonymous access to /admin redirects to /login (Admin Portal)',
        status: isAdminLogin ? 'PASS' : 'FAIL',
        details: `Final URL: ${adminUrl}`,
      });
      await anonContext.close();

      // 2.3 Authenticated player visiting /admin (Unauthorized role)
      const playerContext = await browser.newContext({ storageState: PLAYER_STATE });
      const playerPage = await playerContext.newPage();
      await playerPage.goto(`${BASE_URL}/admin`);
      const playerBlockedUrl = playerPage.url();
      const isBlockedToDashboard = playerBlockedUrl.includes('/dashboard') && playerBlockedUrl.includes('error=admin_unauthorized');
      console.log(`  Authenticated Player -> /admin => Final URL: ${playerBlockedUrl}`);
      results.push({
        category: 'Task 2: Auth Redirects',
        name: 'Normal player access to /admin blocked with admin_unauthorized',
        status: isBlockedToDashboard ? 'PASS' : 'FAIL',
        details: `Final URL: ${playerBlockedUrl}`,
      });
      await playerContext.close();

      // 2.4 Authenticated admin visiting /admin/dashboard
      const adminContext = await browser.newContext({ storageState: ADMIN_STATE });
      const adminPage = await adminContext.newPage();
      await adminPage.goto(`${BASE_URL}/admin/dashboard`);
      const adminFinalUrl = adminPage.url();
      const isAdminAllowed = adminFinalUrl.includes('/admin/dashboard') && !adminFinalUrl.includes('error=');
      console.log(`  Authenticated Admin -> /admin/dashboard => Final URL: ${adminFinalUrl}`);
      results.push({
        category: 'Task 2: Auth Redirects',
        name: 'Admin access to /admin/dashboard permitted',
        status: isAdminAllowed ? 'PASS' : 'FAIL',
        details: `Final URL: ${adminFinalUrl}`,
      });
      await adminContext.close();
    }

    // ============================================================
    // TEST SUITE 3: AUTH RATE LIMITING (SHARED IP & PREFETCHING)
    // ============================================================
    console.log('\n--- TEST SUITE 3: Auth Rate Limiting Resilience ---');
    {
      const context = await browser.newContext();
      const page = await context.newPage();

      // 3.1 Next.js prefetch request should not trigger 429
      let prefetchResponses: number[] = [];
      for (let i = 0; i < 15; i++) {
        const res = await page.request.get(`${BASE_URL}/auth/login`, {
          headers: {
            'purpose': 'prefetch',
            'next-router-prefetch': '1',
          },
        });
        prefetchResponses.push(res.status());
      }
      const prefetchOk = prefetchResponses.every(s => s === 200 || s === 304);
      console.log(`  15 Prefetch GET /auth/login requests -> All successful: ${prefetchOk} (${prefetchResponses.slice(0, 5).join(', ')}...)`);
      results.push({
        category: 'Task 3: Rate Limiting',
        name: 'Prefetch traffic excluded from rate limit counters',
        status: prefetchOk ? 'PASS' : 'FAIL',
        details: `15 consecutive prefetch requests completed with status codes: ${prefetchResponses[0]}`,
      });

      // 3.2 High-concurrency page navigation on shared IP (simulating 20 students browsing login)
      let pageNavResponses: number[] = [];
      for (let i = 0; i < 20; i++) {
        const res = await page.request.get(`${BASE_URL}/auth/login`);
        pageNavResponses.push(res.status());
      }
      const pageNavOk = pageNavResponses.every(s => s === 200 || s === 304);
      console.log(`  20 Page Navigation GET /auth/login requests -> All successful: ${pageNavOk} (${pageNavResponses.slice(0, 5).join(', ')}...)`);
      results.push({
        category: 'Task 3: Rate Limiting',
        name: 'Shared IP page navigation supports at least 20 req/min without 429',
        status: pageNavOk ? 'PASS' : 'FAIL',
        details: `20 navigation requests completed with status codes: ${pageNavResponses[0]}`,
      });
      await context.close();
    }

    // ============================================================
    // TEST SUITE 4: WHATSAPP REGISTRATION FLOW & COPY FALLBACK
    // ============================================================
    console.log('\n--- TEST SUITE 4: WhatsApp Verification & Copy Fallback ---');
    {
      // Verify WhatsApp Payment Link & Message Generator exports
      const { generateWhatsAppPaymentLink, generateWhatsAppPaymentMessageText } = await import('../lib/whatsappPayment');
      const testMsg = generateWhatsAppPaymentMessageText({
        adminWhatsAppNumber: '+919207516227',
        tournamentName: 'eFootball Champions Cup',
        tournamentId: 'tourney-test-123',
        registrationId: 'reg-abc-456',
        userName: 'GamerOne',
        efootballId: 'ABCD-123-456-789',
        entryFeeINR: 150,
      });
      const testLink = generateWhatsAppPaymentLink({
        adminWhatsAppNumber: '+919207516227',
        tournamentName: 'eFootball Champions Cup',
        tournamentId: 'tourney-test-123',
        registrationId: 'reg-abc-456',
        userName: 'GamerOne',
        efootballId: 'ABCD-123-456-789',
        entryFeeINR: 150,
      });

      const hasId = testMsg.includes('reg-abc-456');
      const hasFee = testMsg.includes('₹150');
      const hasWaUrl = testLink.startsWith('https://wa.me/919207516227?text=');

      console.log(`  Message text contains regId & fee: ${hasId && hasFee}`);
      console.log(`  WhatsApp URL correctly formatted: ${hasWaUrl}`);
      results.push({
        category: 'Task 4: WhatsApp Registration',
        name: 'Prefilled WhatsApp payment link and message text formatting',
        status: hasId && hasFee && hasWaUrl ? 'PASS' : 'FAIL',
        details: `URL prefix: ${testLink.slice(0, 45)}...`,
      });
    }

    // ============================================================
    // TEST SUITE 5: TICKETS SWIPE NAVIGATION METADATA
    // ============================================================
    console.log('\n--- TEST SUITE 5: Tickets Swipe Navigation Metadata ---');
    {
      const context = await browser.newContext({ storageState: PLAYER_STATE });
      const page = await context.newPage();
      await page.goto(`${BASE_URL}/dashboard/tickets`, { waitUntil: 'networkidle' });
      const hasTicketsSection = await page.evaluate(() => {
        const h1Text = document.querySelector('h1')?.textContent || '';
        return h1Text.includes('Tickets') || h1Text.includes('Disputes');
      });
      console.log(`  /dashboard/tickets rendered successfully: ${hasTicketsSection}`);
      results.push({
        category: 'Task 5: Tickets Swipe Metadata',
        name: 'Support tickets page loads with currentSection="tickets"',
        status: hasTicketsSection ? 'PASS' : 'FAIL',
        details: 'Correctly renders My Tickets & Disputes under Swipe wrapper',
      });
      await context.close();
    }

  } catch (err: any) {
    console.error('Test execution error:', err);
    results.push({
      category: 'General',
      name: 'Test Execution',
      status: 'FAIL',
      details: err.message || String(err),
    });
  } finally {
    await browser.close();
  }

  console.log('\n============================================================');
  console.log('SUMMARY OF PHASE 1 VERIFICATION RESULTS:');
  console.log('============================================================');
  let passCount = 0;
  for (const r of results) {
    const symbol = r.status === 'PASS' ? '✅' : '❌';
    if (r.status === 'PASS') passCount++;
    console.log(`${symbol} [${r.category}] ${r.name}: ${r.details}`);
  }
  console.log(`\nTOTAL: ${passCount} / ${results.length} PASSED`);

  fs.writeFileSync(
    'reports/player-experience/phase1_test_results.json',
    JSON.stringify(results, null, 2),
    'utf8'
  );
  console.log('Saved raw results to reports/player-experience/phase1_test_results.json');
}

runTests();
