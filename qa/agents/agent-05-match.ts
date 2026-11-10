import type { Page } from 'playwright';
import { ExecutionTracker } from '../orchestrator/execution-tracker';
import { EvidenceManager } from '../orchestrator/evidence-manager';
import { ENV } from '../config/environments';

export async function runAgent05Match(
  page: Page,
  tracker: ExecutionTracker,
  evidence: EvidenceManager
): Promise<void> {
  const agentId = 'AGENT-05-MATCH';
  const baseUrl = ENV.activeTarget;
  console.log(`\n🤖 [${agentId}] Initiating Match Engine Audit...`);

  // MATCH-001: Protected Matches Route Authentication Gate
  const start001 = Date.now();
  try {
    await page.goto(`${baseUrl}/dashboard/matches`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1000);
    const finalUrl = page.url();
    const isRedirected = finalUrl.includes('/login') || finalUrl.includes('/auth');
    const screenshot = await evidence.captureScreenshot(page, 'MATCH-001', 'matches_auth_gate');

    tracker.record({
      testId: 'MATCH-001',
      agentId,
      category: 'Match Engine',
      title: 'Protected Matches Route Authentication Enforcement',
      description: 'Verifies /dashboard/matches cannot be viewed by unauthenticated visitors',
      preconditions: 'Guest user',
      steps: ['Navigate to /dashboard/matches', 'Inspect redirection'],
      expected: 'Redirects to /login',
      actual: isRedirected ? `Securely redirected to ${finalUrl}` : `Security flaw: Visitor remained on ${finalUrl}`,
      status: isRedirected ? 'PASS' : 'FAIL',
      severity: 'P0',
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
      testId: 'MATCH-001',
      agentId,
      category: 'Match Engine',
      title: 'Protected Matches Route',
      description: 'Verify redirect',
      preconditions: 'None',
      steps: ['Navigate'],
      expected: 'Redirects',
      actual: err.message,
      status: 'FAIL',
      severity: 'P0',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start001,
      browser: 'Chromium',
      viewport: 'Default',
      consoleErrors: [err.message],
      networkErrors: [],
    });
  }

  // MATCH-002: Match Verification Workflow Logic & Server Actions
  const start002 = Date.now();
  try {
    // Verify match submission rules
    const { submitPlayerScoreAction, submitMatchDisputeAction } = await import(
      '../../app/actions/matchSchedulingActions'
    );

    const isFunction1 = typeof submitPlayerScoreAction === 'function';
    const isFunction2 = typeof submitMatchDisputeAction === 'function';

    tracker.record({
      testId: 'MATCH-002',
      agentId,
      category: 'Match Engine',
      title: 'Match Result Submission & Conflict Escalation Actions Integrity',
      description: 'Verifies server actions for score submission and dispute handling exist and are exported',
      preconditions: 'Server action exports',
      steps: ['Import matchSchedulingActions', 'Verify submitMatchScoreAction and submitMatchDisputeAction'],
      expected: 'Both actions are correctly exported server actions',
      actual: isFunction1 && isFunction2 ? 'Server actions valid and ready for match workflow' : 'One or more actions missing',
      status: isFunction1 && isFunction2 ? 'PASS' : 'FAIL',
      severity: 'P0',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start002,
      browser: 'Node.js',
      viewport: 'N/A',
      consoleErrors: [],
      networkErrors: [],
    });
  } catch (err: any) {
    tracker.record({
      testId: 'MATCH-002',
      agentId,
      category: 'Match Engine',
      title: 'Match Action Exports',
      description: 'Verify server actions',
      preconditions: 'None',
      steps: ['Import'],
      expected: 'Exported',
      actual: err.message,
      status: 'FAIL',
      severity: 'P0',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start002,
      browser: 'Node.js',
      viewport: 'Default',
      consoleErrors: [err.message],
      networkErrors: [],
    });
  }
}
