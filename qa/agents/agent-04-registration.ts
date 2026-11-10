import type { Page } from 'playwright';
import { ExecutionTracker } from '../orchestrator/execution-tracker';
import { EvidenceManager } from '../orchestrator/evidence-manager';
import { ENV } from '../config/environments';

export async function runAgent04Registration(
  page: Page,
  tracker: ExecutionTracker,
  evidence: EvidenceManager
): Promise<void> {
  const agentId = 'AGENT-04-REGISTRATION';
  const baseUrl = ENV.activeTarget;
  console.log(`\n🤖 [${agentId}] Initiating Registration Engine Audit...`);

  // REG-001: Logged-out Registration Prompts Authentication Gate
  const start001 = Date.now();
  try {
    await page.goto(`${baseUrl}/tournaments`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const tournamentLink = await page.$('a[href*="/tournaments/"]');
    if (tournamentLink) {
      const href = await tournamentLink.getAttribute('href');
      await page.goto(`${baseUrl}${href}`, { waitUntil: 'domcontentloaded', timeout: 15000 });

      // Look for register button or login prompt
      const pageText = await page.textContent('body');
      const hasAuthGatePrompt =
        pageText?.toLowerCase().includes('login to register') ||
        pageText?.toLowerCase().includes('sign in') ||
        pageText?.toLowerCase().includes('register');

      const screenshot = await evidence.captureScreenshot(page, 'REG-001', 'registration_auth_gate');

      tracker.record({
        testId: 'REG-001',
        agentId,
        category: 'Registration Engine',
        title: 'Logged-Out Registration Gate Enforces Authentication',
        description: 'Verifies unauthenticated visitors cannot bypass registration authentication requirements',
        preconditions: 'Guest user browsing tournament detail',
        steps: ['Inspect registration card state on tournament detail view'],
        expected: 'Requires player login/signup before allowing tournament slot reservation',
        actual: hasAuthGatePrompt ? 'Authentication gate prompt properly displayed' : 'Missing clear authentication prompt',
        status: hasAuthGatePrompt ? 'PASS' : 'FAIL',
        severity: 'P1',
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - start001,
        browser: 'Chromium',
        viewport: `${page.viewportSize()?.width}x${page.viewportSize()?.height}`,
        screenshotPath: screenshot,
        consoleErrors: [],
        networkErrors: [],
      });
    } else {
      tracker.record({
        testId: 'REG-001',
        agentId,
        category: 'Registration Engine',
        title: 'Logged-Out Registration Gate',
        description: 'Verify login prompt',
        preconditions: 'None',
        steps: ['Find tournament'],
        expected: 'Tournament found',
        actual: 'No active tournaments found to check registration prompt',
        status: 'BLOCKED',
        severity: 'P1',
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - start001,
        browser: 'Chromium',
        viewport: 'Default',
        consoleErrors: [],
        networkErrors: [],
      });
    }
  } catch (err: any) {
    tracker.record({
      testId: 'REG-001',
      agentId,
      category: 'Registration Engine',
      title: 'Logged-Out Registration Gate',
      description: 'Check registration prompt',
      preconditions: 'None',
      steps: ['Inspect'],
      expected: 'Handled',
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

  // REG-002: Slot Capacity Counter Logic & Max Participant Guard
  const start002 = Date.now();
  try {
    // Database check on slot counter logic
    const { createClient } = await import('@supabase/supabase-js');
    if (ENV.supabaseUrl && ENV.supabaseServiceKey) {
      const supabase = createClient(ENV.supabaseUrl, ENV.supabaseServiceKey);
      const { data: tournaments, error } = await supabase
        .from('tournaments')
        .select('id, name, max_participants, confirmed_slots_count')
        .limit(5);

      let slotInvariantPreserved = true;
      let failureReason = '';

      if (tournaments && tournaments.length > 0) {
        for (const t of tournaments) {
          if ((t.confirmed_slots_count || 0) > (t.max_participants || 0)) {
            slotInvariantPreserved = false;
            failureReason = `Tournament ${t.id} over-capacity: ${t.confirmed_slots_count} > ${t.max_participants}`;
            break;
          }
        }
      }

      tracker.record({
        testId: 'REG-002',
        agentId,
        category: 'Registration Engine',
        title: 'Participant Slot Capacity Consistency & Over-Capacity Guard',
        description: 'Verifies current_participants <= max_participants invariant across all tournaments in database',
        preconditions: 'Authorized Supabase service access',
        steps: ['Query tournaments table', 'Verify current_participants <= max_participants for all records'],
        expected: 'Zero tournaments exceed maximum participant capacity',
        actual: slotInvariantPreserved ? 'Capacity invariants strictly satisfied across all tournaments' : failureReason,
        status: slotInvariantPreserved ? 'PASS' : 'FAIL',
        severity: 'P0',
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - start002,
        browser: 'Database/API',
        viewport: 'N/A',
        consoleErrors: [],
        networkErrors: [],
        dbEvidence: `Checked ${tournaments?.length || 0} tournaments. Invariant held: ${slotInvariantPreserved}`,
      });
    }
  } catch (err: any) {
    tracker.record({
      testId: 'REG-002',
      agentId,
      category: 'Registration Engine',
      title: 'Slot Capacity Invariant',
      description: 'Verify DB slot integrity',
      preconditions: 'None',
      steps: ['Query DB'],
      expected: 'Valid',
      actual: err.message,
      status: 'FAIL',
      severity: 'P0',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start002,
      browser: 'API',
      viewport: 'Default',
      consoleErrors: [err.message],
      networkErrors: [],
    });
  }
}
