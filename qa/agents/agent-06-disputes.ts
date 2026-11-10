import type { Page } from 'playwright';
import { ExecutionTracker } from '../orchestrator/execution-tracker';
import { EvidenceManager } from '../orchestrator/evidence-manager';
import { ENV } from '../config/environments';

export async function runAgent06Disputes(
  page: Page,
  tracker: ExecutionTracker,
  evidence: EvidenceManager
): Promise<void> {
  const agentId = 'AGENT-06-DISPUTES';
  const baseUrl = ENV.activeTarget;
  console.log(`\n🤖 [${agentId}] Initiating Dispute & Evidence System Audit...`);

  // DISP-001: Contact Support Ticket Form - Upload Feature Killed Everywhere Else
  const start001 = Date.now();
  try {
    await page.goto(`${baseUrl}/contact`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const fileUploadInput = await page.$('input[type="file"]');
    const pageText = await page.textContent('body');
    const hasDisputeNotice =
      pageText?.toLowerCase().includes('screenshot proof') &&
      pageText?.toLowerCase().includes('matches');

    const screenshot = await evidence.captureScreenshot(page, 'DISP-001', 'contact_support_no_upload');

    const pass = !fileUploadInput && hasDisputeNotice;

    tracker.record({
      testId: 'DISP-001',
      agentId,
      category: 'Disputes & Evidence',
      title: 'Evidence Upload Restriction: Contact Support Form Disallows File Uploads',
      description: 'Verifies file uploads are removed from public/support forms and restricted strictly to My Matches disputes',
      preconditions: 'Navigate to /contact',
      steps: [
        'Inspect /contact for file input',
        'Verify informational notice directing match disputes to My Matches room',
      ],
      expected: 'No file input exists on /contact; clear dispute room notice displayed',
      actual: pass
        ? 'File input cleanly removed; dispute proof notice rendered'
        : `fileInput: ${Boolean(fileUploadInput)}, notice: ${hasDisputeNotice}`,
      status: pass ? 'PASS' : 'FAIL',
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
      testId: 'DISP-001',
      agentId,
      category: 'Disputes & Evidence',
      title: 'Evidence Upload Restriction',
      description: 'Verify contact form has no file upload',
      preconditions: 'None',
      steps: ['Navigate to /contact'],
      expected: 'No file input',
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

  // DISP-002: Pre-Match Issue Reporting Modal - Upload Disabled (Text-Only)
  const start002 = Date.now();
  try {
    const fs = await import('fs');
    const path = await import('path');
    const reportModalPath = path.resolve(process.cwd(), 'components/match/ReportMatchIssueModal.tsx');
    const content = fs.readFileSync(reportModalPath, 'utf8');

    const hasMediaUploadZone = content.includes('MediaUploadZone') || content.includes('type="file"');

    tracker.record({
      testId: 'DISP-002',
      agentId,
      category: 'Disputes & Evidence',
      title: 'Pre-Match Issue Modal Evidence Policy Verification',
      description: 'Verifies pre-match issue reporting modal is strictly text-based and does not accept files',
      preconditions: 'Static source analysis of ReportMatchIssueModal.tsx',
      steps: ['Scan ReportMatchIssueModal.tsx for MediaUploadZone or file inputs'],
      expected: 'Zero media upload components present in pre-match modal',
      actual: !hasMediaUploadZone ? 'Verified: MediaUploadZone eliminated from pre-match modal' : 'Defect: MediaUploadZone still present in pre-match modal',
      status: !hasMediaUploadZone ? 'PASS' : 'FAIL',
      severity: 'P1',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start002,
      browser: 'Source Code Audit',
      viewport: 'N/A',
      consoleErrors: [],
      networkErrors: [],
    });
  } catch (err: any) {
    tracker.record({
      testId: 'DISP-002',
      agentId,
      category: 'Disputes & Evidence',
      title: 'Pre-Match Issue Modal Policy',
      description: 'Verify code integrity',
      preconditions: 'None',
      steps: ['Scan file'],
      expected: 'Clean',
      actual: err.message,
      status: 'FAIL',
      severity: 'P1',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start002,
      browser: 'Source',
      viewport: 'Default',
      consoleErrors: [err.message],
      networkErrors: [],
    });
  }
}
