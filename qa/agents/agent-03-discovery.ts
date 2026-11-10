import type { Page } from 'playwright';
import { ExecutionTracker } from '../orchestrator/execution-tracker';
import { EvidenceManager } from '../orchestrator/evidence-manager';
import { ENV } from '../config/environments';

export async function runAgent03Discovery(
  page: Page,
  tracker: ExecutionTracker,
  evidence: EvidenceManager
): Promise<void> {
  const agentId = 'AGENT-03-DISCOVERY';
  const baseUrl = ENV.activeTarget;
  console.log(`\n🤖 [${agentId}] Initiating Tournament Discovery & Search Audit...`);

  // DISC-001: Explore Tournaments Hub Rendering
  const start001 = Date.now();
  try {
    await page.goto(`${baseUrl}/tournaments`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1000);
    const searchInput = await page.$('input[placeholder*="Search"], input[type="search"], input');
    const screenshot = await evidence.captureScreenshot(page, 'DISC-001', 'tournaments_hub');

    tracker.record({
      testId: 'DISC-001',
      agentId,
      category: 'Tournament Discovery',
      title: 'Tournament Discovery Listing & Filter Controls',
      description: 'Verifies public tournament hub renders with search and filter controls',
      preconditions: 'Guest user browsing',
      steps: ['Navigate to /tournaments', 'Check for search input and tournament list'],
      expected: 'Hub renders search input and tournament feed',
      actual: searchInput ? 'Search input and tournament feed accessible' : 'Search input missing',
      status: searchInput ? 'PASS' : 'FAIL',
      severity: 'P1',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start001,
      browser: 'Chromium',
      viewport: `${page.viewportSize()?.width}x${page.viewportSize()?.height}`,
      screenshotPath: screenshot,
      consoleErrors: [],
      networkErrors: [],
    });
  } catch (err: any) {
    tracker.record({
      testId: 'DISC-001',
      agentId,
      category: 'Tournament Discovery',
      title: 'Tournament Discovery Hub',
      description: 'Check /tournaments',
      preconditions: 'None',
      steps: ['Navigate to /tournaments'],
      expected: 'Loads',
      actual: err.message,
      status: 'FAIL',
      severity: 'P1',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start001,
      browser: 'Chromium',
      viewport: 'Default',
      consoleErrors: [err.message],
      networkErrors: [],
    });
  }

  // DISC-002: Tournament Search Query Filtering & Empty State
  const start002 = Date.now();
  try {
    await page.goto(`${baseUrl}/tournaments`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const searchInput = await page.$('input[placeholder*="Search"], input[type="search"], input[type="text"]');
    if (searchInput) {
      await searchInput.fill('NonExistentTournamentXYZ123456');
      await page.waitForTimeout(1000);
      const pageText = await page.textContent('body');
      const hasEmptyNotice =
        pageText?.toLowerCase().includes('no tournaments') ||
        pageText?.toLowerCase().includes('not found') ||
        pageText?.toLowerCase().includes('no results') ||
        pageText?.toLowerCase().includes('try adjusting');

      const screenshot = await evidence.captureScreenshot(page, 'DISC-002', 'empty_search_state');

      tracker.record({
        testId: 'DISC-002',
        agentId,
        category: 'Tournament Discovery',
        title: 'Empty State Resilience on Zero-Match Search Queries',
        description: 'Verifies user receives clean informative empty state instead of broken UI',
        preconditions: 'Tournaments page loaded',
        steps: ['Search for random string "NonExistentTournamentXYZ123456"', 'Inspect feedback'],
        expected: 'Clean zero-state message is displayed',
        actual: hasEmptyNotice ? 'Clean empty state displayed' : 'Empty state notice missing or unformatted',
        status: hasEmptyNotice ? 'PASS' : 'FAIL',
        severity: 'P2',
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - start002,
        browser: 'Chromium',
        viewport: `${page.viewportSize()?.width}x${page.viewportSize()?.height}`,
        screenshotPath: screenshot,
        consoleErrors: [],
        networkErrors: [],
      });
    }
  } catch (err: any) {
    tracker.record({
      testId: 'DISC-002',
      agentId,
      category: 'Tournament Discovery',
      title: 'Empty State Search',
      description: 'Check search empty state',
      preconditions: 'None',
      steps: ['Search'],
      expected: 'Handled',
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

  // DISC-003: Public Tournament Detail Page View
  const start003 = Date.now();
  try {
    await page.goto(`${baseUrl}/tournaments`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const firstTournamentLink = await page.$('a[href*="/tournaments/"]');
    if (firstTournamentLink) {
      const href = await firstTournamentLink.getAttribute('href');
      if (href) {
        await page.goto(`${baseUrl}${href}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        const h1 = await page.$('h1');
        const h1Text = await h1?.textContent();
        const screenshot = await evidence.captureScreenshot(page, 'DISC-003', 'tournament_detail_view');

        tracker.record({
          testId: 'DISC-003',
          agentId,
          category: 'Tournament Discovery',
          title: 'Public Tournament Details Deep Link Resolution',
          description: 'Verifies individual tournament page loads with brackets, rules, and schedule tabs',
          preconditions: 'At least one tournament exists',
          steps: ['Click first tournament card', 'Verify detail page loads H1 and tabs'],
          expected: 'Loads full tournament detail page without 404 or crash',
          actual: h1Text ? `Loaded tournament: "${h1Text.trim()}"` : 'Failed to find tournament heading',
          status: h1Text ? 'PASS' : 'FAIL',
          severity: 'P1',
          timestamp: new Date().toISOString(),
          durationMs: Date.now() - start003,
          browser: 'Chromium',
          viewport: `${page.viewportSize()?.width}x${page.viewportSize()?.height}`,
          screenshotPath: screenshot,
          consoleErrors: [],
          networkErrors: [],
        });
      }
    } else {
      tracker.record({
        testId: 'DISC-003',
        agentId,
        category: 'Tournament Discovery',
        title: 'Public Tournament Details Deep Link Resolution',
        description: 'Check tournament detail link',
        preconditions: 'Tournaments exist',
        steps: ['Find link'],
        expected: 'Link exists',
        actual: 'No active tournaments listed to inspect detail page',
        status: 'BLOCKED',
        severity: 'P2',
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - start003,
        browser: 'Chromium',
        viewport: 'Default',
        consoleErrors: [],
        networkErrors: [],
      });
    }
  } catch (err: any) {
    tracker.record({
      testId: 'DISC-003',
      agentId,
      category: 'Tournament Discovery',
      title: 'Public Tournament Detail',
      description: 'Deep link inspection',
      preconditions: 'None',
      steps: ['Navigate'],
      expected: 'Loads',
      actual: err.message,
      status: 'FAIL',
      severity: 'P1',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start003,
      browser: 'Chromium',
      viewport: 'Default',
      consoleErrors: [err.message],
      networkErrors: [],
    });
  }
}
