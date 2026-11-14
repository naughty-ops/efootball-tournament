import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
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

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('Generating admin magic link for ye.agrajj@gmail.com...');
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: 'ye.agrajj@gmail.com',
  });

  if (error || !data?.properties?.action_link) {
    console.error('Failed to generate magic link:', error);
    process.exit(1);
  }

  const rawLink = data.properties.action_link;
  const parsedUrl = new URL(rawLink);
  // Extract token from search params or hash if present
  console.log('Action link search:', parsedUrl.search);

  // Sign in using the hashed token or otp via verifyOtp
  const tokenHash = data.properties.hashed_token;
  console.log('Token hash:', tokenHash);

  // We can also create a session using supabaseAdmin.auth.admin or signInWithOtp
  // Even better: use supabase client to verifyOtp
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const client = createClient(SUPABASE_URL, anonKey);
  const { data: sessionData, error: otpErr } = await client.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });

  if (otpErr || !sessionData.session) {
    console.error('verifyOtp error:', otpErr);
    process.exit(1);
  }

  console.log('Admin session established successfully!');
  const session = sessionData.session;

  const cookiePayload = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  await context.addCookies([
    {
      name: 'sb-cqgbeafenavkeirwsxbg-auth-token',
      value: cookiePayload,
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);

  const page = await context.newPage();
  console.log('Navigating to http://localhost:3000/admin/dashboard ...');
  await page.goto('http://localhost:3000/admin/dashboard', { waitUntil: 'networkidle' });
  console.log('Admin URL after navigation:', page.url());

  const statePath = path.resolve(process.cwd(), 'scripts/admin_storage_state.json');
  await context.storageState({ path: statePath });
  console.log('Successfully saved admin storage state to:', statePath);

  await browser.close();
}

main().catch(err => {
  console.error('Admin session setup error:', err);
  process.exit(1);
});
