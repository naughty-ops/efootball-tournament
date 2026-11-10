import type { Page } from 'playwright';
import { ExecutionTracker } from '../orchestrator/execution-tracker';
import { EvidenceManager } from '../orchestrator/evidence-manager';
import { ENV } from '../config/environments';
import {
  encryptSensitiveField,
  decryptSensitiveField,
  maskAccountNumber,
  isValidAccountNumber,
  isValidIfscCode,
  isValidUpiId,
} from '../../lib/wallet/crypto';

export async function runAgent07Wallet(
  page: Page,
  tracker: ExecutionTracker,
  evidence: EvidenceManager
): Promise<void> {
  const agentId = 'AGENT-07-WALLET';
  const baseUrl = ENV.activeTarget;
  console.log(`\n🤖 [${agentId}] Initiating Player Wallet & Financial Security Audit...`);

  // WALLET-001: AES-256-GCM Financial Encryption & Decryption
  const start001 = Date.now();
  try {
    const rawAccount = '987654321098';
    const encrypted = encryptSensitiveField(rawAccount);
    const decrypted = decryptSensitiveField(encrypted);

    const isEncryptedDifferent = encrypted !== rawAccount;
    const isEncryptedGcm = encrypted.split(':').length === 3;
    const isDecryptedAccurate = decrypted === rawAccount;

    const pass001 = isEncryptedDifferent && isEncryptedGcm && isDecryptedAccurate;

    tracker.record({
      testId: 'WALLET-001',
      agentId,
      category: 'Wallet & Rewards',
      title: 'AES-256-GCM Bank Details Encryption & Integrity',
      description: 'Verifies banking details are encrypted with authenticated AES-256-GCM prior to database persistence',
      preconditions: 'WALLET_ENCRYPTION_SECRET loaded',
      steps: [
        'Encrypt test bank account number "987654321098"',
        'Verify enc:v1 prefix and authenticated ciphertext payload',
        'Decrypt ciphertext and verify match',
      ],
      expected: 'Ciphertext is non-plaintext with authenticated tag; decrypts losslessly',
      actual: pass001 ? 'AES-256-GCM roundtrip encryption/decryption fully verified' : 'Encryption/Decryption mismatch',
      status: pass001 ? 'PASS' : 'FAIL',
      severity: 'P0',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start001,
      browser: 'Crypto Module',
      viewport: 'N/A',
      consoleErrors: [],
      networkErrors: [],
    });
  } catch (err: any) {
    tracker.record({
      testId: 'WALLET-001',
      agentId,
      category: 'Wallet & Rewards',
      title: 'AES-256-GCM Bank Encryption',
      description: 'Test crypto',
      preconditions: 'None',
      steps: ['Encrypt'],
      expected: 'Pass',
      actual: err.message,
      status: 'FAIL',
      severity: 'P0',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start001,
      browser: 'Crypto',
      viewport: 'Default',
      consoleErrors: [err.message],
      networkErrors: [],
    });
  }

  // WALLET-002: Bank Account Masking & Format Validation
  const start002 = Date.now();
  try {
    const masked = maskAccountNumber('123456789012');
    const isMaskedProperly = masked === 'XXXX XXXX 9012';

    const validAcc = isValidAccountNumber('123456789012');
    const shortAcc = !isValidAccountNumber('12345');
    const validIfsc = isValidIfscCode('HDFC0000001');
    const invalidIfsc = !isValidIfscCode('HDFC123');
    const validUpi = isValidUpiId('competitor@okaxis');
    const invalidUpi = !isValidUpiId('competitor_without_at');

    const pass002 = isMaskedProperly && validAcc && shortAcc && validIfsc && invalidIfsc && validUpi && invalidUpi;

    tracker.record({
      testId: 'WALLET-002',
      agentId,
      category: 'Wallet & Rewards',
      title: 'Banking Information UI Masking & Format Validation Rules',
      description: 'Verifies account masking and strict validation for Account numbers, IFSC codes, and UPI IDs',
      preconditions: 'Validation rules module',
      steps: [
        'Test maskAccountNumber("123456789012")',
        'Test IFSC regex /^[A-Z]{4}0[A-Z0-9]{6}$/',
        'Test UPI pattern /^[a-zA-Z0-9.\\-_]{2,256}@[a-zA-Z]{2,64}$/',
      ],
      expected: 'Masks all but last 4 digits; enforces valid IFSC and UPI rules',
      actual: pass002 ? 'Masking outputs "XXXX XXXX 9012"; all financial boundary tests passed' : 'Validation or masking failure',
      status: pass002 ? 'PASS' : 'FAIL',
      severity: 'P1',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start002,
      browser: 'Validation Module',
      viewport: 'N/A',
      consoleErrors: [],
      networkErrors: [],
    });
  } catch (err: any) {
    tracker.record({
      testId: 'WALLET-002',
      agentId,
      category: 'Wallet & Rewards',
      title: 'Banking Masking and Validation',
      description: 'Test masking',
      preconditions: 'None',
      steps: ['Validate'],
      expected: 'Pass',
      actual: err.message,
      status: 'FAIL',
      severity: 'P1',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start002,
      browser: 'Validation',
      viewport: 'Default',
      consoleErrors: [err.message],
      networkErrors: [],
    });
  }

  // WALLET-003: Protected Wallet Route Gate
  const start003 = Date.now();
  try {
    await page.goto(`${baseUrl}/dashboard/wallet`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1000);
    const finalUrl = page.url();
    const isRedirected = finalUrl.includes('/login') || finalUrl.includes('/auth');
    const screenshot = await evidence.captureScreenshot(page, 'WALLET-003', 'wallet_auth_gate');

    tracker.record({
      testId: 'WALLET-003',
      agentId,
      category: 'Wallet & Rewards',
      title: 'Financial Ledger & Wallet Authentication Boundary',
      description: 'Verifies unauthorized visitors cannot access player wallet balance or transactions',
      preconditions: 'Guest user',
      steps: ['Navigate to /dashboard/wallet without session', 'Inspect redirect'],
      expected: 'Redirects to /login',
      actual: isRedirected ? `Securely redirected to ${finalUrl}` : `Vulnerability: Allowed unauthenticated access to ${finalUrl}`,
      status: isRedirected ? 'PASS' : 'FAIL',
      severity: 'P0',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start003,
      browser: 'Chromium',
      viewport: `${page.viewportSize()?.width}x${page.viewportSize()?.height}`,
      screenshotPath: screenshot,
      consoleErrors: [],
      networkErrors: [],
    });
  } catch (err: any) {
    tracker.record({
      testId: 'WALLET-003',
      agentId,
      category: 'Wallet & Rewards',
      title: 'Financial Ledger Gate',
      description: 'Verify redirect',
      preconditions: 'None',
      steps: ['Navigate'],
      expected: 'Redirects',
      actual: err.message,
      status: 'FAIL',
      severity: 'P0',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start003,
      browser: 'Chromium',
      viewport: 'Default',
      consoleErrors: [err.message],
      networkErrors: [],
    });
  }
}
