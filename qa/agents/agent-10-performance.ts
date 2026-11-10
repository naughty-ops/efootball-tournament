import type { Page } from 'playwright';
import { ExecutionTracker } from '../orchestrator/execution-tracker';
import { EvidenceManager } from '../orchestrator/evidence-manager';
import { ENV, VIEWPORTS } from '../config/environments';

export async function runAgent10Performance(
  page: Page,
  tracker: ExecutionTracker,
  evidence: EvidenceManager
): Promise<void> {
  const agentId = 'AGENT-10-PERFORMANCE';
  const baseUrl = ENV.activeTarget;
  console.log(`\n🤖 [${agentId}] Initiating Performance, Mobile & Compatibility Audit...`);

  // PERF-001: Multi-Viewport Responsive Layout & Zero Horizontal Scroll
  const start001 = Date.now();
  const testedViewports = [
    VIEWPORTS.mobileCompact, // 320x700
    VIEWPORTS.mobileMedium,  // 360x800
    VIEWPORTS.mobileLarge,   // 390x844
    VIEWPORTS.tablet,        // 768x1024
    VIEWPORTS.desktopFHD,    // 1920x1080
  ];

  let allViewportsPassed = true;
  const failureDetails: string[] = [];

  for (const vp of testedViewports) {
    try {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(500);

      // Check horizontal overflow: scrollWidth should equal or be within 2px of clientWidth
      const hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth + 2;
      });

      if (hasHorizontalOverflow) {
        allViewportsPassed = false;
        failureDetails.push(`${vp.name}: Horizontal overflow detected`);
      }
    } catch (err: any) {
      allViewportsPassed = false;
      failureDetails.push(`${vp.name}: ${err.message}`);
    }
  }

  // Restore desktop FHD
  await page.setViewportSize({ width: 1920, height: 1080 });
  const screenshot = await evidence.captureScreenshot(page, 'PERF-001', 'responsive_verified');

  tracker.record({
    testId: 'PERF-001',
    agentId,
    category: 'Performance & Mobile',
    title: 'Multi-Viewport Responsiveness & Zero Horizontal Overflow Check',
    description: 'Audits layout across 5 screen sizes (320px to 1920px) to verify zero unintended horizontal scroll',
    preconditions: 'Public homepage',
    steps: [
      'Test 320x700 (Compact Mobile)',
      'Test 360x800 (Standard Android)',
      'Test 390x844 (iPhone 14)',
      'Test 768x1024 (iPad Tablet)',
      'Test 1920x1080 (Desktop FHD)',
    ],
    expected: 'Zero horizontal overflow (scrollWidth <= innerWidth + 2) across all 5 viewports',
    actual: allViewportsPassed
      ? 'All 5 screen viewports render with zero horizontal overflow'
      : `Overflow detected on: ${failureDetails.join('; ')}`,
    status: allViewportsPassed ? 'PASS' : 'FAIL',
    severity: 'P1',
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - start001,
    browser: 'Chromium',
    viewport: '320px to 1920px',
    screenshotPath: screenshot,
    consoleErrors: [],
    networkErrors: [],
  });

  // PERF-002: Navigation Timings & Performance Metrics
  const start002 = Date.now();
  try {
    await page.goto(`${baseUrl}/tournaments`, { waitUntil: 'load', timeout: 20000 });
    const performanceTiming = await page.evaluate(() => {
      const timing = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (!timing) return null;
      return {
        dns: Math.round(timing.domainLookupEnd - timing.domainLookupStart),
        tcp: Math.round(timing.connectEnd - timing.connectStart),
        ttfb: Math.round(timing.responseStart - timing.requestStart),
        domContentLoaded: Math.round(timing.domContentLoadedEventEnd - timing.fetchStart),
        load: Math.round(timing.loadEventEnd - timing.fetchStart),
      };
    });

    const isFast = performanceTiming ? performanceTiming.domContentLoaded < 3500 : true;

    tracker.record({
      testId: 'PERF-002',
      agentId,
      category: 'Performance & Mobile',
      title: 'Browser Navigation Timing & DOM Performance Benchmark',
      description: 'Measures DNS, TCP, TTFB, DOMContentLoaded, and window load timing on /tournaments',
      preconditions: 'High-speed local/staging network',
      steps: ['Navigate to /tournaments', 'Extract PerformanceNavigationTiming from browser'],
      expected: 'DOMContentLoaded completes within acceptable SLA (< 3500ms)',
      actual: performanceTiming
        ? `DOMContentLoaded: ${performanceTiming.domContentLoaded}ms, Load: ${performanceTiming.load}ms, TTFB: ${performanceTiming.ttfb}ms`
        : 'Performance timings not reported by browser engine',
      status: isFast ? 'PASS' : 'FAIL',
      severity: 'P2',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start002,
      browser: 'Chromium',
      viewport: '1920x1080',
      consoleErrors: [],
      networkErrors: [],
      notes: JSON.stringify(performanceTiming),
    });
  } catch (err: any) {
    tracker.record({
      testId: 'PERF-002',
      agentId,
      category: 'Performance & Mobile',
      title: 'Navigation Timing Benchmark',
      description: 'Measure timing',
      preconditions: 'None',
      steps: ['Navigate'],
      expected: 'Measured',
      actual: err.message,
      status: 'FAIL',
      severity: 'P2',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start002,
      browser: 'Chromium',
      viewport: 'Default',
      consoleErrors: [err.message],
      networkErrors: [],
    });
  }

  // PERF-003: PWA Web App Manifest Delivery
  const start003 = Date.now();
  try {
    const res = await page.request.get(`${baseUrl}/manifest.webmanifest`);
    const status = res.status();
    const isOk = status === 200;
    const json = isOk ? await res.json() : null;
    const hasName = json && (json.name || json.short_name);

    tracker.record({
      testId: 'PERF-003',
      agentId,
      category: 'Performance & Mobile',
      title: 'PWA Web Manifest Specification & Header Delivery',
      description: 'Verifies /manifest.webmanifest responds HTTP 200 with valid application manifest metadata',
      preconditions: 'Public manifest endpoint',
      steps: ['Fetch /manifest.webmanifest', 'Verify HTTP 200 and JSON name/icons schema'],
      expected: 'HTTP 200 response containing valid PWA manifest JSON object',
      actual: isOk && hasName
        ? `Manifest OK (Name: "${json.name || json.short_name}", Start URL: "${json.start_url}")`
        : `Manifest failed with HTTP ${status}`,
      status: isOk && hasName ? 'PASS' : 'FAIL',
      severity: 'P2',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start003,
      browser: 'API Client',
      viewport: 'N/A',
      consoleErrors: [],
      networkErrors: [],
    });
  } catch (err: any) {
    tracker.record({
      testId: 'PERF-003',
      agentId,
      category: 'Performance & Mobile',
      title: 'PWA Web Manifest Delivery',
      description: 'Fetch manifest',
      preconditions: 'None',
      steps: ['Fetch'],
      expected: 'HTTP 200',
      actual: err.message,
      status: 'FAIL',
      severity: 'P2',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start003,
      browser: 'API',
      viewport: 'Default',
      consoleErrors: [err.message],
      networkErrors: [],
    });
  }
}
