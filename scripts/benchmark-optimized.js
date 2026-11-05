const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const TOURNAMENT_ID = '6546f308-5de1-43ec-bb87-6b08e96d068f';

const ROUTES = [
  { name: 'Homepage', path: '/' },
  { name: 'Tournaments Listing', path: '/tournaments' },
  { name: 'Tournament Details', path: `/tournaments/${TOURNAMENT_ID}` },
  { name: 'Login', path: '/login' },
  { name: 'Signup', path: '/signup' },
  { name: 'Live Matches Hub', path: '/live' },
  { name: 'Player Dashboard (Redirect/Gate)', path: '/dashboard' },
  { name: 'Admin Dashboard (Auth Gate)', path: '/admin/dashboard' },
];

async function measureRoute(browser, route, deviceConfig, deviceName) {
  const context = await browser.newContext({
    ...deviceConfig,
  });
  const page = await context.newPage();

  let totalTransferBytes = 0;
  let requestCount = 0;
  let jsBytes = 0;
  let cssBytes = 0;
  let imageBytes = 0;

  page.on('response', (response) => {
    requestCount++;
    const headers = response.headers();
    const len = parseInt(headers['content-length'] || '0', 10);
    totalTransferBytes += len;

    const ct = headers['content-type'] || '';
    if (ct.includes('javascript')) jsBytes += len;
    else if (ct.includes('css')) cssBytes += len;
    else if (ct.includes('image')) imageBytes += len;
  });

  const url = `${BASE_URL}${route.path}`;
  const startTime = Date.now();

  try {
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    // Allow any asynchronous rendering / hydration / initial API calls to complete
    await page.waitForTimeout(1500);

    const metrics = await page.evaluate(() => {
      const navTiming = performance.getEntriesByType('navigation')[0] || {};
      const paintEntries = performance.getEntriesByType('paint');

      const fcpEntry = paintEntries.find((e) => e.name === 'first-contentful-paint');
      const fcp = fcpEntry ? Math.round(fcpEntry.startTime) : null;

      const ttfb = navTiming.responseStart && navTiming.requestStart
        ? Math.round(navTiming.responseStart - navTiming.requestStart)
        : Math.round(navTiming.responseStart || 0);

      const domContentLoaded = navTiming.domContentLoadedEventEnd
        ? Math.round(navTiming.domContentLoadedEventEnd)
        : null;

      const loadTime = navTiming.loadEventEnd
        ? Math.round(navTiming.loadEventEnd)
        : null;

      return {
        fcp,
        ttfb,
        domContentLoaded,
        loadTime,
      };
    });

    const elapsed = Date.now() - startTime;

    await context.close();

    return {
      route: route.name,
      path: route.path,
      device: deviceName,
      ttfb: metrics.ttfb,
      fcp: metrics.fcp,
      loadTime: metrics.loadTime || elapsed,
      domContentLoaded: metrics.domContentLoaded,
      requests: requestCount,
      transferKb: (totalTransferBytes / 1024).toFixed(1),
      jsKb: (jsBytes / 1024).toFixed(1),
      cssKb: (cssBytes / 1024).toFixed(1),
      imageKb: (imageBytes / 1024).toFixed(1),
    };
  } catch (err) {
    await context.close();
    return {
      route: route.name,
      path: route.path,
      device: deviceName,
      error: err.message,
    };
  }
}

async function runBenchmark() {
  console.log('================================================================');
  console.log('       RUNNING POST-OPTIMIZATION PERFORMANCE BENCHMARK          ');
  console.log('================================================================');
  console.log(`Target: ${BASE_URL}\n`);

  const browser = await chromium.launch({ headless: true });
  const results = [];

  const desktopConfig = {
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  };

  const mobileConfig = devices['Pixel 7'];

  console.log('--- Benchmarking Desktop (1440x900) ---');
  for (const route of ROUTES) {
    process.stdout.write(`  Measuring [Desktop] ${route.name}... `);
    const result = await measureRoute(browser, route, desktopConfig, 'Desktop');
    results.push(result);
    if (result.error) {
      console.log(`FAILED: ${result.error}`);
    } else {
      console.log(`TTFB: ${result.ttfb}ms | FCP: ${result.fcp}ms | Load: ${result.loadTime}ms | Reqs: ${result.requests} | Size: ${result.transferKb}KB`);
    }
  }

  console.log('\n--- Benchmarking Mobile (Pixel 7: 412x915) ---');
  for (const route of ROUTES) {
    process.stdout.write(`  Measuring [Mobile] ${route.name}... `);
    const result = await measureRoute(browser, route, mobileConfig, 'Mobile (Pixel 7)');
    results.push(result);
    if (result.error) {
      console.log(`FAILED: ${result.error}`);
    } else {
      console.log(`TTFB: ${result.ttfb}ms | FCP: ${result.fcp}ms | Load: ${result.loadTime}ms | Reqs: ${result.requests} | Size: ${result.transferKb}KB`);
    }
  }

  await browser.close();

  const outputPath = path.join(__dirname, 'performance-optimized-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);
}

runBenchmark().catch((err) => {
  console.error('Fatal benchmark error:', err);
  process.exit(1);
});
