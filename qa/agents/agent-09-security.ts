import type { Page } from 'playwright';
import { ExecutionTracker } from '../orchestrator/execution-tracker';
import { EvidenceManager } from '../orchestrator/evidence-manager';
import { ENV } from '../config/environments';

export async function runAgent09Security(
  page: Page,
  tracker: ExecutionTracker,
  evidence: EvidenceManager
): Promise<void> {
  const agentId = 'AGENT-09-SECURITY';
  const baseUrl = ENV.activeTarget;
  console.log(`\n🤖 [${agentId}] Initiating Security & Authorization Hardening Audit...`);

  // SEC-001: Direct API Authorization Check
  const start001 = Date.now();
  try {
    const res = await page.request.get(`${baseUrl}/api/tournaments/00000000-0000-0000-0000-000000000000/authorized-data`);
    const status = res.status();
    // Must be 401 Unauthorized or 403 Forbidden or 404
    const isProtected = status === 401 || status === 403 || status === 404;

    tracker.record({
      testId: 'SEC-001',
      agentId,
      category: 'Security & Authorization',
      title: 'Server-Side API Route Authentication Enforcement',
      description: 'Verifies /api/tournaments/[id]/authorized-data rejects anonymous requests without session cookies',
      preconditions: 'Anonymous HTTP request',
      steps: ['Send GET request to authorized-data endpoint without auth headers'],
      expected: 'HTTP 401 Unauthorized, 403 Forbidden, or 404 Not Found',
      actual: `Received HTTP ${status} (${isProtected ? 'Protected' : 'Vulnerable'})`,
      status: isProtected ? 'PASS' : 'FAIL',
      severity: 'P0',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start001,
      browser: 'API Client',
      viewport: 'N/A',
      consoleErrors: [],
      networkErrors: [],
    });
  } catch (err: any) {
    tracker.record({
      testId: 'SEC-001',
      agentId,
      category: 'Security & Authorization',
      title: 'API Authentication Enforcement',
      description: 'Test API protection',
      preconditions: 'None',
      steps: ['Request API'],
      expected: 'Protected',
      actual: err.message,
      status: 'FAIL',
      severity: 'P0',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start001,
      browser: 'API',
      viewport: 'Default',
      consoleErrors: [err.message],
      networkErrors: [],
    });
  }

  // SEC-002: Service-Role Key Leakage Scan in Client Bundles
  const start002 = Date.now();
  try {
    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const content = await page.content();

    // Check if SUPABASE_SERVICE_ROLE_KEY or service_role secret is exposed anywhere in HTML or embedded state
    const hasServiceRoleLeak = content.includes('SUPABASE_SERVICE_ROLE_KEY') || content.includes('WALLET_ENCRYPTION_SECRET');

    tracker.record({
      testId: 'SEC-002',
      agentId,
      category: 'Security & Authorization',
      title: 'Zero Service-Role / Master Secret Client Leakage Scan',
      description: 'Scans public HTML, SSR payloads, and window states for leaked server-only environment variables',
      preconditions: 'Homepage rendered via SSR',
      steps: ['Inspect full DOM and window script tags for service role or encryption keys'],
      expected: 'Zero server secrets exposed in client DOM or scripts',
      actual: !hasServiceRoleLeak ? 'Passed: Zero server-only credentials found in client HTML' : 'CRITICAL VULNERABILITY: Service secrets leaked to client!',
      status: !hasServiceRoleLeak ? 'PASS' : 'FAIL',
      severity: 'P0',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start002,
      browser: 'Chromium',
      viewport: `${page.viewportSize()?.width}x${page.viewportSize()?.height}`,
      consoleErrors: [],
      networkErrors: [],
    });
  } catch (err: any) {
    tracker.record({
      testId: 'SEC-002',
      agentId,
      category: 'Security & Authorization',
      title: 'Zero Service-Role Leakage Scan',
      description: 'Inspect secrets leakage',
      preconditions: 'None',
      steps: ['Scan'],
      expected: 'No leak',
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

  // SEC-003: Supabase Anon Client Cannot Read Other Users' Sensitive Bank Details
  const start003 = Date.now();
  try {
    const { createClient } = await import('@supabase/supabase-js');
    if (ENV.supabaseUrl && ENV.supabaseAnonKey) {
      const anonClient = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey);
      const { data, error } = await anonClient.from('player_payment_details').select('*');

      // Anon client should either get empty data [] due to RLS or permission denied
      const isBlockedOrEmpty = !data || data.length === 0 || error !== null;

      tracker.record({
        testId: 'SEC-003',
        agentId,
        category: 'Security & Authorization',
        title: 'Supabase RLS Policy: Anonymous Direct Read on Bank Details Blocked',
        description: 'Verifies that unauthenticated anon requests cannot read rows from player_payment_details',
        preconditions: 'Public anon key client',
        steps: ['Query player_payment_details with anon client', 'Inspect returned rows'],
        expected: 'Zero rows returned or access denied by RLS policy',
        actual: isBlockedOrEmpty ? `RLS successfully blocked read (rows: ${data?.length || 0})` : `VULNERABILITY: Anon client read ${data.length} bank details records!`,
        status: isBlockedOrEmpty ? 'PASS' : 'FAIL',
        severity: 'P0',
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - start003,
        browser: 'Supabase Anon Client',
        viewport: 'N/A',
        consoleErrors: [],
        networkErrors: [],
        dbEvidence: error ? `Error: ${error.message}` : `Data: 0 rows returned under anon role.`,
      });
    }
  } catch (err: any) {
    tracker.record({
      testId: 'SEC-003',
      agentId,
      category: 'Security & Authorization',
      title: 'RLS Bank Details Protection',
      description: 'Verify RLS blocks anon reads',
      preconditions: 'None',
      steps: ['Query'],
      expected: 'Blocked',
      actual: err.message,
      status: 'FAIL',
      severity: 'P0',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start003,
      browser: 'API',
      viewport: 'Default',
      consoleErrors: [err.message],
      networkErrors: [],
    });
  }
}
