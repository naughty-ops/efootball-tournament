const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const LOCAL_URL = 'http://localhost:3000';
const TOURNAMENT_ID = '6546f308-5de1-43ec-bb87-6b08e96d068f';

const ROUTES = [
  { name: 'Tournaments Listing', path: '/tournaments' },
  { name: 'Homepage', path: '/' },
  { name: 'Tournament Details', path: `/tournaments/${TOURNAMENT_ID}` },
  { name: 'Live Matches Hub', path: '/live' },
  { name: 'Login', path: '/login' },
  { name: 'Signup', path: '/signup' },
];

function median(values) {
  if (!values || values.length === 0) return 0;
  const nums = values.filter((v) => typeof v === 'number' && !isNaN(v)).sort((a, b) => a - b);
  if (nums.length === 0) return 0;
  const half = Math.floor(nums.length / 2);
  if (nums.length % 2) return nums[half];
  return (nums[half - 1] + nums[half]) / 2.0;
}

async function measureSingleRun(context, route, url) {
  const page = await context.newPage();

  let totalTransferBytes = 0;
  let requestCount = 0;
  let jsBytes = 0;
  let cssBytes = 0;
  let imageBytes = 0;
  let imageRequests = 0;

  page.on('response', (response) => {
    requestCount++;
    const headers = response.headers();
    const len = parseInt(headers['content-length'] || '0', 10);
    totalTransferBytes += len;

    const ct = headers['content-type'] || '';
    if (ct.includes('image')) {
      imageBytes += len;
      imageRequests++;
    } else if (ct.includes('javascript')) {
      jsBytes += len;
    } else if (ct.includes('css')) {
      cssBytes += len;
    }
  });

  await page.addInitScript(() => {
    window.__perfMetrics = {
      cls: 0,
      lcp: 0,
      tbt: 0,
    };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__perfMetrics.cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });

    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      if (entries.length > 0) {
        window.__perfMetrics.lcp = entries[entries.length - 1].startTime;
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const b = entry.duration - 50;
        if (b > 0) window.__perfMetrics.tbt += b;
      }
    }).observe({ type: 'longtask', buffered: true });
  });

  const startTime = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: 35000 });
  await page.waitForTimeout(1500);

  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const fcpEntry = performance.getEntriesByType('paint').find((e) => e.name === 'first-contentful-paint');
    return {
      ttfb: nav.responseStart && nav.requestStart
        ? Math.round(nav.responseStart - nav.requestStart)
        : Math.round(nav.responseStart || 0),
      fcp: fcpEntry ? Math.round(fcpEntry.startTime) : null,
      lcp: Math.round(window.__perfMetrics.lcp || 0),
      cls: Number((window.__perfMetrics.cls || 0).toFixed(4)),
      tbt: Math.round(window.__perfMetrics.tbt || 0),
      loadTime: nav.loadEventEnd ? Math.round(nav.loadEventEnd) : null,
    };
  });

  const elapsed = Date.now() - startTime;
  await page.close();

  return {
    ttfb: metrics.ttfb,
    fcp: metrics.fcp,
    lcp: metrics.lcp || metrics.fcp,
    cls: metrics.cls,
    tbt: metrics.tbt,
    loadTime: metrics.loadTime || elapsed,
    requests: requestCount,
    imageRequests,
    transferKb: Math.round(totalTransferBytes / 1024),
    imageKb: Math.round(imageBytes / 1024),
    jsKb: Math.round(jsBytes / 1024),
    cssKb: Math.round(cssBytes / 1024),
  };
}

async function benchmarkPersona(browser, deviceConfig, deviceName) {
  const runs = 5;
  const results = [];

  for (const route of ROUTES) {
    const url = `${LOCAL_URL}${route.path}`;
    console.log(`\nEvaluating [${deviceName}] ${route.name} (${route.path}):`);

    // 1. Cold Cache: Fresh Context for each run
    const coldRuns = [];
    process.stdout.write(`  Cold cache (5 runs): `);
    for (let r = 0; r < runs; r++) {
      const freshContext = await browser.newContext({ ...deviceConfig });
      try {
        const m = await measureSingleRun(freshContext, route, url);
        coldRuns.push(m);
        process.stdout.write(`${m.fcp}ms(Img:${m.imageKb}KB) `);
      } catch (err) {
        process.stdout.write(`[ERR: ${err.message}] `);
      } finally {
        await freshContext.close();
      }
    }
    console.log();

    // 2. Warm Cache: Single Context reused across 5 consecutive runs
    const warmRuns = [];
    process.stdout.write(`  Warm cache (5 runs): `);
    const warmContext = await browser.newContext({ ...deviceConfig });
    try {
      // prime cache first
      try {
        const primePage = await warmContext.newPage();
        await primePage.goto(url, { waitUntil: 'load', timeout: 35000 });
        await primePage.waitForTimeout(1000);
        await primePage.close();
      } catch (e) {}

      for (let r = 0; r < runs; r++) {
        try {
          const m = await measureSingleRun(warmContext, route, url);
          warmRuns.push(m);
          process.stdout.write(`${m.fcp}ms(Img:${m.imageKb}KB) `);
        } catch (err) {
          process.stdout.write(`[ERR: ${err.message}] `);
        }
      }
    } finally {
      await warmContext.close();
    }
    console.log();

    const coldMedian = {
      ttfb: median(coldRuns.map((r) => r.ttfb)),
      fcp: median(coldRuns.map((r) => r.fcp)),
      lcp: median(coldRuns.map((r) => r.lcp)),
      cls: median(coldRuns.map((r) => r.cls)),
      tbt: median(coldRuns.map((r) => r.tbt)),
      loadTime: median(coldRuns.map((r) => r.loadTime)),
      requests: median(coldRuns.map((r) => r.requests)),
      imageRequests: median(coldRuns.map((r) => r.imageRequests)),
      transferKb: median(coldRuns.map((r) => r.transferKb)),
      imageKb: median(coldRuns.map((r) => r.imageKb)),
      jsKb: median(coldRuns.map((r) => r.jsKb)),
    };

    const warmMedian = {
      ttfb: median(warmRuns.map((r) => r.ttfb)),
      fcp: median(warmRuns.map((r) => r.fcp)),
      lcp: median(warmRuns.map((r) => r.lcp)),
      cls: median(warmRuns.map((r) => r.cls)),
      tbt: median(warmRuns.map((r) => r.tbt)),
      loadTime: median(warmRuns.map((r) => r.loadTime)),
      requests: median(warmRuns.map((r) => r.requests)),
      imageRequests: median(warmRuns.map((r) => r.imageRequests)),
      transferKb: median(warmRuns.map((r) => r.transferKb)),
      imageKb: median(warmRuns.map((r) => r.imageKb)),
      jsKb: median(warmRuns.map((r) => r.jsKb)),
    };

    console.log(`    COLD MEDIANS -> TTFB: ${coldMedian.ttfb}ms | FCP: ${coldMedian.fcp}ms | LCP: ${coldMedian.lcp}ms | CLS: ${coldMedian.cls} | TBT: ${coldMedian.tbt}ms | Load: ${coldMedian.loadTime}ms | Reqs: ${coldMedian.requests} | Total: ${coldMedian.transferKb}KB | Images: ${coldMedian.imageKb}KB`);
    console.log(`    WARM MEDIANS -> TTFB: ${warmMedian.ttfb}ms | FCP: ${warmMedian.fcp}ms | LCP: ${warmMedian.lcp}ms | CLS: ${warmMedian.cls} | TBT: ${warmMedian.tbt}ms | Load: ${warmMedian.loadTime}ms | Reqs: ${warmMedian.requests} | Total: ${warmMedian.transferKb}KB | Images: ${warmMedian.imageKb}KB`);

    results.push({
      route: route.name,
      path: route.path,
      device: deviceName,
      cold: coldMedian,
      warm: warmMedian,
      rawCold: coldRuns,
      rawWarm: warmRuns,
    });
  }

  return results;
}

async function main() {
  console.log('================================================================');
  console.log('     PHASE 5: IMAGE OPTIMIZATION PERFORMANCE BENCHMARK          ');
  console.log('================================================================');
  console.log(`Target: ${LOCAL_URL}`);

  const browser = await chromium.launch({ headless: true });

  const desktopConfig = {
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  };

  const mobileConfig = devices['Pixel 7'];

  console.log('\n--- 1. DESKTOP BENCHMARK (1440x900) ---');
  const desktopResults = await benchmarkPersona(browser, desktopConfig, 'Desktop');

  console.log('\n--- 2. MOBILE BENCHMARK (Pixel 7: 412x915) ---');
  const mobileResults = await benchmarkPersona(browser, mobileConfig, 'Mobile (Pixel 7)');

  await browser.close();

  const finalOutput = {
    timestamp: new Date().toISOString(),
    targetUrl: LOCAL_URL,
    desktop: desktopResults,
    mobile: mobileResults,
  };

  const outputPath = path.join(__dirname, 'phase5-image-optimization-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(finalOutput, null, 2));
  console.log(`\nPhase 5 benchmarks successfully completed! Output saved to: ${outputPath}`);
}

main().catch((err) => {
  console.error('Fatal error during Phase 5 benchmark:', err);
  process.exit(1);
});
