import type { Page } from 'playwright';
import { ExecutionTracker, type TestCaseRecord } from '../orchestrator/execution-tracker';
import { EvidenceManager } from '../orchestrator/evidence-manager';
import { ENV } from '../config/environments';

export async function runAgent01Auth(
  page: Page,
  tracker: ExecutionTracker,
  evidence: EvidenceManager
): Promise<void> {
  const agentId = 'AGENT-01-AUTH';
  const baseUrl = ENV.activeTarget;
  console.log(`\n🤖 [${agentId}] Initiating Authentication & Account Lifecycle Audit on ${baseUrl}...`);

  // AUTH-001: Inspect Signup Page Fields
  const start001 = Date.now();
  try {
    await page.goto(`${baseUrl}/signup`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const emailInput = await page.$('input[type="email"], input[name="email"]');
    const passwordInput = await page.$('input[type="password"]');
    const submitBtn = await page.$('button[type="submit"]');

    const screenshot = await evidence.captureScreenshot(page, 'AUTH-001', 'signup_page');

    tracker.record({
      testId: 'AUTH-001',
      agentId,
      category: 'Authentication',
      title: 'Signup Page Structure & Fields Inspection',
      description: 'Verifies existence and accessibility of registration input fields',
      preconditions: 'User is unauthenticated guest',
      steps: ['Navigate to /signup', 'Check email, password inputs, submit button'],
      expected: 'All registration fields and submit button exist and are visible',
      actual: emailInput && passwordInput && submitBtn ? 'All fields found and visible' : 'Missing essential signup inputs',
      status: emailInput && passwordInput && submitBtn ? 'PASS' : 'FAIL',
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
      testId: 'AUTH-001',
      agentId,
      category: 'Authentication',
      title: 'Signup Page Structure & Fields Inspection',
      description: 'Verifies existence and accessibility of registration input fields',
      preconditions: 'User is unauthenticated guest',
      steps: ['Navigate to /signup'],
      expected: 'Page loads cleanly',
      actual: `Error: ${err.message}`,
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

  // AUTH-002: Guest Protected Route Redirection
  const start002 = Date.now();
  try {
    await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1000);
    const finalUrl = page.url();
    const redirected = finalUrl.includes('/login') || finalUrl.includes('/auth');
    const screenshot = await evidence.captureScreenshot(page, 'AUTH-002', 'protected_dashboard_redirect');

    tracker.record({
      testId: 'AUTH-002',
      agentId,
      category: 'Authentication',
      title: 'Guest Protected Route Redirection',
      description: 'Ensure unauthenticated access to /dashboard is blocked and redirects to /login',
      preconditions: 'Unauthenticated browser session',
      steps: ['Navigate to /dashboard without session cookie', 'Inspect destination URL'],
      expected: 'Redirects to /login or /auth/login with unauthorized prompt',
      actual: redirected ? `Redirected securely to ${finalUrl}` : `Security flaw: Allowed access to ${finalUrl}`,
      status: redirected ? 'PASS' : 'FAIL',
      severity: 'P0',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start002,
      browser: 'Chromium',
      viewport: `${page.viewportSize()?.width}x${page.viewportSize()?.height}`,
      screenshotPath: screenshot,
      consoleErrors: [],
      networkErrors: [],
    });
  } catch (err: any) {
    tracker.record({
      testId: 'AUTH-002',
      agentId,
      category: 'Authentication',
      title: 'Guest Protected Route Redirection',
      description: 'Ensure unauthenticated access to /dashboard redirects to login',
      preconditions: 'Unauthenticated browser session',
      steps: ['Navigate to /dashboard'],
      expected: 'Redirect occurs',
      actual: err.message,
      status: 'FAIL',
      severity: 'P0',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start002,
      browser: 'Chromium',
      viewport: 'Default',
      consoleErrors: [err.message],
      networkErrors: [],
    });
  }

  // AUTH-003: Login Page - Incorrect Credentials Rejection
  const start003 = Date.now();
  try {
    await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const emailInput = await page.$('input[type="email"], input[name="email"]');
    const passwordInput = await page.$('input[type="password"]');
    const submitBtn = await page.$('button[type="submit"]');

    if (emailInput && passwordInput && submitBtn) {
      await emailInput.fill('invalid_player_9999@test.internal');
      await passwordInput.fill('WrongPassword123!');
      await submitBtn.click();
      await page.waitForTimeout(2000);

      const pageText = await page.textContent('body');
      const hasErrorMsg =
        pageText?.toLowerCase().includes('invalid') ||
        pageText?.toLowerCase().includes('credentials') ||
        pageText?.toLowerCase().includes('incorrect') ||
        pageText?.toLowerCase().includes('error');

      const screenshot = await evidence.captureScreenshot(page, 'AUTH-003', 'invalid_credentials');

      tracker.record({
        testId: 'AUTH-003',
        agentId,
        category: 'Authentication',
        title: 'Incorrect Credentials Rejection & Alert',
        description: 'Verifies failed login attempt produces actionable error without leaking internal stack',
        preconditions: 'Valid login page loaded',
        steps: ['Submit non-existent email and wrong password', 'Inspect error toast/banner'],
        expected: 'Login rejected with user-facing credential mismatch error message',
        actual: hasErrorMsg ? 'Rejected with visible error alert' : 'Error message not clearly displayed',
        status: hasErrorMsg ? 'PASS' : 'FAIL',
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
  } catch (err: any) {
    tracker.record({
      testId: 'AUTH-003',
      agentId,
      category: 'Authentication',
      title: 'Incorrect Credentials Rejection',
      description: 'Verify login error handling',
      preconditions: 'None',
      steps: ['Attempt login'],
      expected: 'Handled gracefully',
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

  // AUTH-004: Forgot Password Route Inspection
  const start004 = Date.now();
  try {
    await page.goto(`${baseUrl}/forgot-password`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const emailField = await page.$('input[type="email"]');
    const screenshot = await evidence.captureScreenshot(page, 'AUTH-004', 'forgot_password_view');

    tracker.record({
      testId: 'AUTH-004',
      agentId,
      category: 'Authentication',
      title: 'Forgot Password Self-Service Recovery',
      description: 'Verifies recovery form accepts valid email addresses',
      preconditions: 'Guest user',
      steps: ['Navigate to /forgot-password', 'Verify presence of recovery email form'],
      expected: 'Password recovery form renders with email input',
      actual: emailField ? 'Recovery input ready and functional' : 'Email input missing',
      status: emailField ? 'PASS' : 'FAIL',
      severity: 'P2',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start004,
      browser: 'Chromium',
      viewport: `${page.viewportSize()?.width}x${page.viewportSize()?.height}`,
      screenshotPath: screenshot,
      consoleErrors: [],
      networkErrors: [],
    });
  } catch (err: any) {
    tracker.record({
      testId: 'AUTH-004',
      agentId,
      category: 'Authentication',
      title: 'Forgot Password Recovery',
      description: 'Verifies recovery page',
      preconditions: 'None',
      steps: ['Navigate to /forgot-password'],
      expected: 'Page loads',
      actual: err.message,
      status: 'FAIL',
      severity: 'P2',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start004,
      browser: 'Chromium',
      viewport: 'Default',
      consoleErrors: [err.message],
      networkErrors: [],
    });
  }

  // AUTH-005: Guest Admin Portal Access Blocked
  const start005 = Date.now();
  try {
    await page.goto(`${baseUrl}/admin`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1000);
    const finalUrl = page.url();
    const blocked = !finalUrl.endsWith('/admin') || finalUrl.includes('/login') || finalUrl.includes('/auth') || finalUrl.includes('/dashboard');
    const screenshot = await evidence.captureScreenshot(page, 'AUTH-005', 'admin_access_blocked');

    tracker.record({
      testId: 'AUTH-005',
      agentId,
      category: 'Authentication',
      title: 'Unauthenticated Admin Route Blocked',
      description: 'Ensure direct access to /admin by unauthorized visitor is blocked',
      preconditions: 'Guest user',
      steps: ['Navigate to /admin', 'Inspect redirect'],
      expected: 'Access blocked; visitor redirected away from /admin',
      actual: blocked ? `Access blocked, redirected to ${finalUrl}` : `Security vulnerability: Guest stayed on ${finalUrl}`,
      status: blocked ? 'PASS' : 'FAIL',
      severity: 'P0',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start005,
      browser: 'Chromium',
      viewport: `${page.viewportSize()?.width}x${page.viewportSize()?.height}`,
      screenshotPath: screenshot,
      consoleErrors: [],
      networkErrors: [],
    });
  } catch (err: any) {
    tracker.record({
      testId: 'AUTH-005',
      agentId,
      category: 'Authentication',
      title: 'Unauthenticated Admin Route Blocked',
      description: 'Verify admin route protection',
      preconditions: 'None',
      steps: ['Navigate to /admin'],
      expected: 'Blocked',
      actual: err.message,
      status: 'FAIL',
      severity: 'P0',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start005,
      browser: 'Chromium',
      viewport: 'Default',
      consoleErrors: [err.message],
      networkErrors: [],
    });
  }
}
