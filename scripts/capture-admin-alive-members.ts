import * as path from 'node:path';
import * as fs from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        process.env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
      }
    }
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('Generating admin session for ye.agrajj@gmail.com...');
  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: 'ye.agrajj@gmail.com',
  });

  if (linkErr || !linkData?.properties?.hashed_token) {
    console.error('Failed to generate magic link:', linkErr);
    process.exit(1);
  }

  const client = createClient(SUPABASE_URL, ANON_KEY);
  const { data: sessionData, error: otpErr } = await client.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });

  if (otpErr || !sessionData.session) {
    console.error('verifyOtp error:', otpErr);
    process.exit(1);
  }

  const cookiePayload = 'base64-' + Buffer.from(JSON.stringify(sessionData.session)).toString('base64');
  console.log('✓ Admin session authenticated');

  const browser = await chromium.launch({ headless: true });

  // 1. Desktop Viewport
  console.log('Testing Desktop Admin Dashboard...');
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  await desktopContext.addCookies([
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

  const desktopPage = await desktopContext.newPage();
  await desktopPage.goto('http://localhost:3000/admin/dashboard', { waitUntil: 'networkidle' });
  await desktopPage.waitForTimeout(2000);

  console.log('Desktop URL:', desktopPage.url());

  // Verify Online Members Card at top
  const onlineCardTitle = await desktopPage.textContent('text="Online Members"');
  console.log('✓ Found top metric card: Online Members =', !!onlineCardTitle);

  // Verify Alive Members Operations Desk
  const deskTitle = await desktopPage.textContent('text="Alive Members Operations Desk"');
  console.log('✓ Found detailed desk: Alive Members Operations Desk =', !!deskTitle);

  // Capture top metrics & desk
  const topMetricsShot = path.resolve(
    'C:/Users/aser/.gemini/antigravity/brain/686ee328-53f1-4506-8d19-8fb8ea8f2fcd/admin_dashboard_top_online_count.png'
  );
  await desktopPage.screenshot({ path: topMetricsShot });
  console.log(`✓ Saved screenshot: ${topMetricsShot}`);

  // 2. Mobile Viewport
  console.log('Testing Mobile Admin Dashboard...');
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await mobileContext.addCookies([
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

  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto('http://localhost:3000/admin/dashboard', { waitUntil: 'networkidle' });
  await mobilePage.waitForTimeout(2000);

  const mobileShot = path.resolve(
    'C:/Users/aser/.gemini/antigravity/brain/686ee328-53f1-4506-8d19-8fb8ea8f2fcd/admin_dashboard_alive_members_mobile.png'
  );
  await mobilePage.screenshot({ path: mobileShot });
  console.log(`✓ Saved mobile screenshot: ${mobileShot}`);

  await browser.close();
  console.log('\n--- ADMIN DASHBOARD ALIVE MEMBERS VERIFICATION COMPLETE ---');
}

main().catch((err) => {
  console.error('Error running script:', err);
  process.exit(1);
});
