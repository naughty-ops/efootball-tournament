const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const ssr = require('@supabase/ssr');
const fs = require('fs');
const path = require('path');

process.loadEnvFile('.env.local');

const BASE_URL = 'http://localhost:3000';
const PROD_URL = 'https://efootball-tournament-cyan.vercel.app';

const ADMIN_EMAIL = 'ye.agrajj@gmail.com';
const PLAYER_EMAIL = 'sulaiman@gmail.com';

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const anonSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function getSessionForEmail(email) {
  const { data: linkData, error: linkErr } = await adminSupabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkErr) throw linkErr;

  const { data: sessionData, error: sessErr } = await anonSupabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });
  if (sessErr) throw sessErr;
  return sessionData.session;
}

function median(arr) {
  if (!arr || arr.length === 0) return 0;
  const nums = arr.filter((x) => typeof x === 'number' && !isNaN(x)).sort((a, b) => a - b);
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

async function measureRouteWithPersona(browser, targetBaseUrl, targetPath, personaName, session = null) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  if (session) {
    const cookieChunks = ssr.createChunks('sb-cqgbeafenavkeirwsxbg-auth-token', JSON.stringify(session));
    const urlObj = new URL(targetBaseUrl);
    const cookiesToAdd = cookieChunks.map((chunk) => ({
      name: chunk.name,
      value: chunk.value,
      domain: urlObj.hostname,
      path: '/',
      httpOnly: false,
      secure: urlObj.protocol === 'https:',
      sameSite: 'Lax',
    }));
    await context.addCookies(cookiesToAdd);
  }

  const page = await context.newPage();
  let totalTransferBytes = 0;
  let requestCount = 0;
  let responseStatuses = [];

  page.on('response', (res) => {
    requestCount++;
    const len = parseInt(res.headers()['content-length'] || '0', 10);
    totalTransferBytes += len;
    responseStatuses.push({ url: res.url(), status: res.status() });
  });

  const url = `${targetBaseUrl}${targetPath}`;
  const startTs = Date.now();

  let finalUrl = '';
  let status = 0;
  let redirectDetected = false;

  try {
    const res = await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    status = res ? res.status() : 0;
    finalUrl = page.url();
    redirectDetected = finalUrl !== url;

    // Wait for hydration and data loading
    await page.waitForTimeout(1500);

    const timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] || {};
      const paint = performance.getEntriesByType('paint');
      const fcp = paint.find((p) => p.name === 'first-contentful-paint');
      return {
        ttfb: nav.responseStart && nav.requestStart
          ? Math.round(nav.responseStart - nav.requestStart)
          : Math.round(nav.responseStart || 0),
        fcp: fcp ? Math.round(fcp.startTime) : null,
        loadTime: nav.loadEventEnd ? Math.round(nav.loadEventEnd) : null,
        domContentLoaded: nav.domContentLoadedEventEnd ? Math.round(nav.domContentLoadedEventEnd) : null,
      };
    });

    const elapsed = Date.now() - startTs;
    await context.close();

    return {
      persona: personaName,
      targetPath,
      finalUrl,
      status,
      redirectDetected,
      ttfb: timing.ttfb,
      fcp: timing.fcp,
      loadTime: timing.loadTime || elapsed,
      domContentLoaded: timing.domContentLoaded,
      requests: requestCount,
      transferKb: Math.round(totalTransferBytes / 1024),
    };
  } catch (err) {
    await context.close();
    return {
      persona: personaName,
      targetPath,
      error: err.message,
    };
  }
}

async function runPersonaBenchmarks() {
  console.log('================================================================');
  console.log('          AUTHENTICATED PERSONA BENCHMARKS (3 PERSONAS)         ');
  console.log('================================================================');

  console.log('1. Acquiring sessions from Supabase Auth...');
  const adminSession = await getSessionForEmail(ADMIN_EMAIL);
  console.log('  Admin session acquired for:', ADMIN_EMAIL);
  const playerSession = await getSessionForEmail(PLAYER_EMAIL);
  console.log('  Player session acquired for:', PLAYER_EMAIL);

  const browser = await chromium.launch({ headless: true });

  const testCases = [
    // Persona 1: Anonymous Visitor
    {
      persona: 'Anonymous Visitor',
      path: '/dashboard',
      session: null,
      description: 'Player Dashboard Guard (Redirect to /login)',
    },
    {
      persona: 'Anonymous Visitor',
      path: '/admin/dashboard',
      session: null,
      description: 'Admin Dashboard Guard (Redirect to /login)',
    },
    {
      persona: 'Anonymous Visitor',
      path: '/',
      session: null,
      description: 'Public Homepage (Zero Auth Overhead)',
    },

    // Persona 2: Authenticated Player
    {
      persona: 'Authenticated Player',
      path: '/dashboard',
      session: playerSession,
      description: 'Player Dashboard (Real Player Profile & Tournaments)',
    },
    {
      persona: 'Authenticated Player',
      path: '/admin/dashboard',
      session: playerSession,
      description: 'Player Attempting Admin Dashboard (Blocked / Route Guard)',
    },

    // Persona 3: Authenticated Administrator
    {
      persona: 'Authenticated Administrator',
      path: '/admin/dashboard',
      session: adminSession,
      description: 'Admin Dashboard (Metrics, Verification Queue, Audit Logs)',
    },
    {
      persona: 'Authenticated Administrator',
      path: '/dashboard',
      session: adminSession,
      description: 'Admin Viewing Player Dashboard',
    },
  ];

  const results = [];
  const runsPerCase = 3;

  for (const tc of testCases) {
    console.log(`\nTesting: [${tc.persona}] -> ${tc.path} (${tc.description})`);
    const runResults = [];

    for (let r = 0; r < runsPerCase; r++) {
      process.stdout.write(`  Run ${r + 1}/${runsPerCase}... `);
      const res = await measureRouteWithPersona(browser, BASE_URL, tc.path, tc.persona, tc.session);
      if (res.error) {
        console.log(`FAILED: ${res.error}`);
      } else {
        runResults.push(res);
        console.log(`Status: ${res.status} | TTFB: ${res.ttfb}ms | FCP: ${res.fcp}ms | Load: ${res.loadTime}ms | Final: ${new URL(res.finalUrl).pathname}`);
      }
    }

    if (runResults.length > 0) {
      const summary = {
        persona: tc.persona,
        targetPath: tc.path,
        description: tc.description,
        finalPath: new URL(runResults[0].finalUrl).pathname,
        redirectDetected: runResults[0].redirectDetected,
        medianTtfb: median(runResults.map((x) => x.ttfb)),
        medianFcp: median(runResults.map((x) => x.fcp)),
        medianLoad: median(runResults.map((x) => x.loadTime)),
        medianRequests: median(runResults.map((x) => x.requests)),
        medianTransferKb: median(runResults.map((x) => x.transferKb)),
        runs: runResults,
      };
      results.push(summary);
      console.log(`  --> MEDIANS: TTFB: ${summary.medianTtfb}ms | FCP: ${summary.medianFcp}ms | Load: ${summary.medianLoad}ms | Reqs: ${summary.medianRequests} | Size: ${summary.medianTransferKb}KB`);
    }
  }

  await browser.close();

  const outPath = path.join(__dirname, 'persona-benchmark-results.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nPersona benchmark finished! Saved to: ${outPath}`);
}

runPersonaBenchmarks().catch((err) => {
  console.error('Fatal persona benchmark error:', err);
  process.exit(1);
});
