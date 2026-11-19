import { createClient } from '@supabase/supabase-js';
import { createChunks } from '@supabase/ssr/dist/main/utils/chunker';
import * as fs from 'fs';
import * as path from 'path';

function loadEnvFile(filename: string) {
  const filePath = path.resolve(process.cwd(), filename);
  if (fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnvFile('.env.local');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const PROD_URL = 'https://www.e-football.in';

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const supabaseAnon = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function getAuthCookieHeader(email: string): Promise<string> {
  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (linkErr || !linkData?.properties?.hashed_token) {
    throw new Error(`Failed to generate magic link for ${email}: ${linkErr?.message}`);
  }

  const { data: sessionData, error: otpErr } = await supabaseAnon.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });

  if (otpErr || !sessionData?.session) {
    throw new Error(`Failed to verify OTP for ${email}: ${otpErr?.message}`);
  }

  const session = sessionData.session;
  const cookiePayload = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64');
  const baseCookieName = 'sb-cqgbeafenavkeirwsxbg-auth-token';
  const rawChunks = createChunks(baseCookieName, cookiePayload);

  return rawChunks.map((chunk) => `${chunk.name}=${chunk.value}`).join('; ');
}

interface TestSpec {
  email: string | null;
  role: string;
  route: string;
  shouldHaveAccess: boolean;
}

interface TestResult {
  role: string;
  email: string;
  route: string;
  status: number;
  hasErrorDigest: boolean;
  digest?: string;
  passed: boolean;
  details: string;
}

async function runTest(spec: TestSpec): Promise<TestResult> {
  const url = `${PROD_URL}${spec.route}`;
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Production-Recovery-Verification/1.0',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
  };

  if (spec.email) {
    const cookieHeader = await getAuthCookieHeader(spec.email);
    headers['Cookie'] = cookieHeader;
  }

  const response = await fetch(url, {
    method: 'GET',
    headers,
    redirect: 'manual',
  });

  const status = response.status;
  const html = await response.text();

  // In Next.js streaming RSC, an error inside the page renders an error digest element or boundary
  const digestMatch = html.match(/digest[\\"]*:\s*[\\"]*([0-9a-zA-Z]+)/i) || html.match(/Error Digest:?\s*([0-9a-zA-Z]+)/i);
  const digest = digestMatch ? digestMatch[1] : undefined;
  const hasErrorDigest = html.toLowerCase().includes('digest') || !!digest;

  let passed = false;
  let details = '';

  if (spec.role === 'unauthenticated') {
    // Unauthenticated must cloak with 404
    passed = status === 404;
    details = passed ? 'Cloaked with HTTP 404 (Passed)' : `Expected 404, got ${status}`;
  } else if (spec.shouldHaveAccess) {
    // Must return HTTP 200 and have NO error digest
    passed = status === 200 && !hasErrorDigest;
    details = passed
      ? 'Rendered successfully with 0 errors (HTTP 200)'
      : `Failed: Status ${status}${digest ? ` (Digest: ${digest})` : ''}`;
  } else {
    // Must be blocked (either 404 or Unauthorized Error Digest)
    passed = status === 404 || hasErrorDigest;
    details = passed
      ? `Blocked as expected (${status === 404 ? 'HTTP 404' : `Unauthorized Digest ${digest}`})`
      : 'Failed: unauthorized access was permitted';
  }

  return {
    role: spec.role,
    email: spec.email || 'unauthenticated',
    route: spec.route,
    status,
    hasErrorDigest,
    digest,
    passed,
    details,
  };
}

async function main() {
  console.log('========================================================================');
  console.log('🚀 LIVE PRODUCTION VERIFICATION SUITE: https://www.e-football.in');
  console.log('========================================================================\n');

  const specs: TestSpec[] = [
    // 1. Unauthenticated Cloaking
    { email: null, role: 'unauthenticated', route: '/admin/tickets', shouldHaveAccess: false },
    { email: null, role: 'unauthenticated', route: '/admin/wallet', shouldHaveAccess: false },
    { email: null, role: 'unauthenticated', route: '/admin/payouts', shouldHaveAccess: false },
    { email: null, role: 'unauthenticated', route: '/admin/avatars', shouldHaveAccess: false },
    { email: null, role: 'unauthenticated', route: '/admin/media', shouldHaveAccess: false },

    // 2. Super Administrator (Full Access)
    { email: 'ye.agrajj@gmail.com', role: 'super_admin', route: '/admin/tickets', shouldHaveAccess: true },
    { email: 'ye.agrajj@gmail.com', role: 'super_admin', route: '/admin/wallet', shouldHaveAccess: true },
    { email: 'ye.agrajj@gmail.com', role: 'super_admin', route: '/admin/payouts', shouldHaveAccess: true },
    { email: 'ye.agrajj@gmail.com', role: 'super_admin', route: '/admin/avatars', shouldHaveAccess: true },
    { email: 'ye.agrajj@gmail.com', role: 'super_admin', route: '/admin/media', shouldHaveAccess: true },

    // 3. Finance Administrator
    { email: 'agraj4242@gmail.com', role: 'finance_admin', route: '/admin/wallet', shouldHaveAccess: true },
    { email: 'agraj4242@gmail.com', role: 'finance_admin', route: '/admin/payouts', shouldHaveAccess: true },
    { email: 'agraj4242@gmail.com', role: 'finance_admin', route: '/admin/tickets', shouldHaveAccess: false },

    // 4. Support Administrator
    { email: 'supportefootballin@gmail.com', role: 'support_admin', route: '/admin/tickets', shouldHaveAccess: true },
    { email: 'supportefootballin@gmail.com', role: 'support_admin', route: '/admin/wallet', shouldHaveAccess: false },
    { email: 'supportefootballin@gmail.com', role: 'support_admin', route: '/admin/payouts', shouldHaveAccess: false },
  ];

  const results: TestResult[] = [];

  for (const spec of specs) {
    const res = await runTest(spec);
    results.push(res);
    console.log(`[${res.passed ? 'PASS' : 'FAIL'}] [${spec.role}] ${spec.route} -> ${res.details}`);
  }

  console.log('\n========================================================================');
  const totalPassed = results.filter((r) => r.passed).length;
  const totalFailed = results.filter((r) => !r.passed).length;
  console.log(`🏁 Summary: ${totalPassed} Passed, ${totalFailed} Failed (Total ${results.length})`);
  console.log('========================================================================');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
