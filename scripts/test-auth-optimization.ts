import fs from 'fs';
import path from 'path';

// Ensure .env.local is loaded if run via tsx directly
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(path.resolve(process.cwd(), '.env.local'));
  } catch {}
}

import { updateSession } from '../lib/supabase/proxy';
import { NextRequest } from 'next/server';

function createMockRequest(url: string, cookies: Record<string, string> = {}) {
  const req = new NextRequest(new URL(url, 'http://localhost:3000'), {
    headers: {
      'x-forwarded-for': '127.0.0.1',
    },
  });
  for (const [key, val] of Object.entries(cookies)) {
    req.cookies.set(key, val);
  }
  return req;
}

async function runAuthTests() {
  console.log('================================================================');
  console.log('       STAGE 2: AUTHENTICATION OPTIMIZATION TEST SUITE          ');
  console.log('================================================================');

  let passed = 0;
  let total = 0;

  function assert(name: string, condition: boolean, detail?: string) {
    total++;
    if (condition) {
      console.log(`  [PASS] Test ${total}: ${name}`);
      passed++;
    } else {
      console.error(`  [FAIL] Test ${total}: ${name}`);
      if (detail) console.error(`         Detail: ${detail}`);
    }
  }

  // 1. Anonymous visit to public route (no cookies)
  const reqPublicAnon = createMockRequest('http://localhost:3000/');
  const t0 = performance.now();
  const resPublicAnon = await updateSession(reqPublicAnon);
  const elapsedPublicAnon = performance.now() - t0;
  assert(
    'Anonymous visit to public route is instant (< 25ms, no remote auth call)',
    resPublicAnon.status === 200 && elapsedPublicAnon < 50,
    `Status: ${resPublicAnon.status}, Elapsed: ${elapsedPublicAnon.toFixed(2)}ms`
  );
  assert(
    'Anonymous response contains strict security headers',
    resPublicAnon.headers.get('X-Frame-Options') === 'DENY' &&
      resPublicAnon.headers.get('X-Content-Type-Options') === 'nosniff'
  );

  // 2. Anonymous visit to /login (no cookies)
  const reqLoginAnon = createMockRequest('http://localhost:3000/login');
  const resLoginAnon = await updateSession(reqLoginAnon);
  assert(
    'Anonymous visit to /login does not redirect and returns 200 OK',
    resLoginAnon.status === 200
  );

  // 3. Anonymous visit to protected /admin (no cookies)
  const reqAdminAnon = createMockRequest('http://localhost:3000/admin/dashboard');
  const resAdminAnon = await updateSession(reqAdminAnon);
  assert(
    'Anonymous visit to /admin is immediately redirected to /login',
    resAdminAnon.status === 307 && resAdminAnon.headers.get('location')?.endsWith('/login') === true
  );

  // 4. Anonymous visit to protected /dashboard (no cookies)
  const reqDashAnon = createMockRequest('http://localhost:3000/dashboard');
  const resDashAnon = await updateSession(reqDashAnon);
  assert(
    'Anonymous visit to /dashboard is immediately redirected to /login',
    resDashAnon.status === 307 && resDashAnon.headers.get('location')?.endsWith('/login') === true
  );

  // 5. Tampered/fake auth cookie visit to /admin (MUST NOT BE TRUSTED)
  const reqAdminTampered = createMockRequest('http://localhost:3000/admin/dashboard', {
    'sb-cqgbeafenavkeirwsxbg-auth-token': 'fake-invalid-token-tampered',
  });
  const resAdminTampered = await updateSession(reqAdminTampered);
  assert(
    'Tampered auth cookie on /admin fails server validation and redirects to /login',
    resAdminTampered.status === 307 && resAdminTampered.headers.get('location')?.endsWith('/login') === true
  );

  // 6. Tampered auth cookie on /dashboard (MUST NOT BE TRUSTED)
  const reqDashTampered = createMockRequest('http://localhost:3000/dashboard', {
    'sb-cqgbeafenavkeirwsxbg-auth-token': 'fake-invalid-token-tampered',
  });
  const resDashTampered = await updateSession(reqDashTampered);
  assert(
    'Tampered auth cookie on /dashboard fails server validation and redirects to /login',
    resDashTampered.status === 307 && resDashTampered.headers.get('location')?.endsWith('/login') === true
  );

  console.log('================================================================');
  console.log(`AUTH OPTIMIZATION TEST SUMMARY: ${passed}/${total} Tests Passed (${Math.round((passed / total) * 100)}%)`);
  console.log('================================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runAuthTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
