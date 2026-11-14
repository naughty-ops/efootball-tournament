import { chromium, type Browser, type Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

interface NavigationTiming {
  from: string;
  to: string;
  durationMs: number;
  reqs: number;
}

async function measureNavigationSuite(port: number, envName: string): Promise<Record<string, number>> {
  console.log(`\n================================================================`);
  console.log(`    TESTING ${envName.toUpperCase()} SERVER (http://localhost:${port})`);
  console.log(`================================================================`);

  const browser: Browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page: Page = await context.newPage();

  const baseUrl = `http://localhost:${port}`;
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  const transitions = [
    { from: '/', to: '/tournaments', selector: 'nav a[href="/tournaments"]:visible, a[href="/tournaments"]:visible', contentSelector: 'h1:has-text("Tournaments")' },
    { from: '/tournaments', to: '/live', selector: 'nav a[href="/live"]:visible, a[href="/live"]:visible', contentSelector: 'h1:has-text("Live Matches")' },
    { from: '/live', to: '/tournaments', selector: 'nav a[href="/tournaments"]:visible, a[href="/tournaments"]:visible', contentSelector: 'h1:has-text("Tournaments")' },
    { from: '/tournaments', to: '/', selector: 'nav a[href="/"]:visible, a[href="/"]:visible', contentSelector: 'a[href="/tournaments"]:visible' },
    { from: '/', to: '/live', selector: 'nav a[href="/live"]:visible, a[href="/live"]:visible', contentSelector: 'h1:has-text("Live Matches")' },
    { from: '/live', to: '/', selector: 'nav a[href="/"]:visible, a[href="/"]:visible', contentSelector: 'a[href="/tournaments"]:visible' },
  ];

  const timings: Record<string, number[]> = {};

  // 3 iterations
  for (let i = 1; i <= 3; i++) {
    for (const step of transitions) {
      const key = `${step.from} → ${step.to}`;
      if (!timings[key]) timings[key] = [];

      const start = Date.now();
      const tabLink = page.locator(step.selector).first();
      await tabLink.waitFor({ state: 'visible', timeout: 5000 });
      await tabLink.click();

      await page.waitForURL((url) => url.pathname === step.to, { timeout: 8000 });
      try {
        await page.waitForSelector(step.contentSelector, { state: 'visible', timeout: 8000 });
      } catch {
        await page.waitForLoadState('domcontentloaded');
      }
      const duration = Date.now() - start;
      timings[key].push(duration);

      await page.waitForTimeout(200);
    }
  }

  const results: Record<string, number> = {};
  for (const [key, list] of Object.entries(timings)) {
    const avg = Math.round(list.reduce((a, b) => a + b, 0) / list.length);
    results[key] = avg;
    console.log(`  ${key.padEnd(28)} : ${avg}ms`);
  }

  await browser.close();
  return results;
}

async function main() {
  const devResults = await measureNavigationSuite(3000, 'Development (next dev)');
  const prodResults = await measureNavigationSuite(3001, 'Production (next start)');

  console.log('\n================================================================');
  console.log('       DEVELOPMENT VS PRODUCTION NAVIGATION COMPARISON          ');
  console.log('================================================================');
  console.log('Route Transition            | Development (Dev) | Production (Prod) | Speedup');
  console.log('----------------------------|-------------------|-------------------|--------');

  const comparisonRows: any[] = [];
  for (const key of Object.keys(devResults)) {
    const dev = devResults[key];
    const prod = prodResults[key] || 0;
    const speedup = dev > 0 ? `${Math.round(((dev - prod) / dev) * 100)}% faster` : 'N/A';
    console.log(`${key.padEnd(28)}| ${dev.toString().padStart(17)}ms| ${prod.toString().padStart(17)}ms| ${speedup}`);
    comparisonRows.push({ transition: key, devMs: dev, prodMs: prod, speedup });
  }

  const outPath = path.join(process.cwd(), 'reports', 'production-readiness', 'dev_vs_prod_comparison.json');
  fs.writeFileSync(outPath, JSON.stringify(comparisonRows, null, 2));
  console.log(`\nComparison saved to ${outPath}`);
}

main().catch(console.error);
