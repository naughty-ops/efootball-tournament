import { chromium, Browser, BrowserContext } from 'playwright';
import { createServerClient } from '@supabase/ssr';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cqgbeafenavkeirwsxbg.supabase.co';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const ADMIN_REFRESH_TOKEN = process.env.TEST_ADMIN_REFRESH_TOKEN || '';
const PLAYER_REFRESH_TOKEN = process.env.TEST_PLAYER_REFRESH_TOKEN || '';

const TOURNAMENT_ID = '3074f4b2-e68f-4a9a-a9d3-1797e4db3088'; // "THE 20-20"
const MATCH_ID = 'd1b663ed-761d-47e6-9895-80ee64bab6cb';

interface ViewportConfig {
  name: string;
  width: number;
  height: number;
  category: 'mobile' | 'tablet' | 'desktop';
}

const VIEWPORTS: ViewportConfig[] = [
  { name: '320px', width: 320, height: 568, category: 'mobile' },
  { name: '360px', width: 360, height: 640, category: 'mobile' },
  { name: '375px', width: 375, height: 667, category: 'mobile' },
  { name: '390px', width: 390, height: 844, category: 'mobile' },
  { name: '430px', width: 430, height: 932, category: 'mobile' },
  { name: '768px', width: 768, height: 1024, category: 'tablet' },
  { name: '1024px', width: 1024, height: 768, category: 'tablet' },
  { name: '1280px', width: 1280, height: 800, category: 'desktop' },
  { name: '1440px', width: 1440, height: 900, category: 'desktop' },
  { name: '1920px', width: 1920, height: 1080, category: 'desktop' },
];

interface RouteAuditSpec {
  url: string;
  name: string;
  authType: 'anon' | 'player' | 'admin';
  interaction?: (page: any) => Promise<void>;
}

const ROUTES_TO_AUDIT: RouteAuditSpec[] = [
  // 1. Public Pages
  { url: '/', name: 'public-home', authType: 'anon' },
  { url: '/tournaments', name: 'public-tournaments-catalog', authType: 'anon' },
  { url: `/tournaments/${TOURNAMENT_ID}`, name: 'public-tournament-detail-overview', authType: 'anon' },
  { url: `/t/${TOURNAMENT_ID}`, name: 'public-tournament-shortlink', authType: 'anon' },
  { url: '/live', name: 'public-live-hub', authType: 'anon' },
  { url: `/live/${MATCH_ID}`, name: 'public-live-match-viewing', authType: 'anon' },
  { url: '/about', name: 'public-about', authType: 'anon' },
  { url: '/contact', name: 'public-contact', authType: 'anon' },

  // 2. Auth Pages
  { url: '/login', name: 'auth-login', authType: 'anon' },
  { url: '/signup', name: 'auth-signup', authType: 'anon' },
  { url: '/auth/login', name: 'auth-login-alt', authType: 'anon' },
  { url: '/forgot-password', name: 'auth-forgot-password', authType: 'anon' },
  { url: '/auth/reset-password', name: 'auth-reset-password', authType: 'anon' },

  // 3. User Dashboard Pages (Authenticated Player)
  { url: '/dashboard', name: 'player-dashboard-overview', authType: 'player' },
  { url: '/dashboard/tournaments', name: 'player-dashboard-tournaments', authType: 'player' },
  { url: '/dashboard/matches', name: 'player-dashboard-matches', authType: 'player' },
  { url: '/dashboard/profile', name: 'player-dashboard-profile', authType: 'player' },

  // 4. Admin Portal Pages (Authenticated Admin)
  { url: '/admin/dashboard', name: 'admin-dashboard', authType: 'admin' },
  { url: '/admin/tournaments', name: 'admin-tournaments-catalog', authType: 'admin' },
  { url: '/admin/tournaments/new', name: 'admin-tournament-wizard-step1', authType: 'admin' },
  { url: `/admin/tournaments/${TOURNAMENT_ID}`, name: 'admin-tournament-detail', authType: 'admin' },
  { url: `/admin/tournaments/${TOURNAMENT_ID}/edit`, name: 'admin-tournament-edit', authType: 'admin' },
  { url: `/admin/tournaments/${TOURNAMENT_ID}/participants`, name: 'admin-tournament-participants', authType: 'admin' },
  { url: `/admin/tournaments/${TOURNAMENT_ID}/matches`, name: 'admin-tournament-matches', authType: 'admin' },
  { url: `/admin/tournaments/${TOURNAMENT_ID}/bracket`, name: 'admin-tournament-bracket', authType: 'admin' },
  { url: `/admin/tournaments/${TOURNAMENT_ID}/groups`, name: 'admin-tournament-groups', authType: 'admin' },
  { url: '/admin/participants', name: 'admin-participants-roster', authType: 'admin' },
  { url: '/admin/matches', name: 'admin-matches-center', authType: 'admin' },
  { url: '/admin/matches/analytics', name: 'admin-matches-analytics', authType: 'admin' },
  { url: '/admin/matches/predictions', name: 'admin-matches-predictions', authType: 'admin' },
  { url: '/admin/matches/viewers', name: 'admin-matches-viewers', authType: 'admin' },
  { url: '/admin/brackets', name: 'admin-brackets-list', authType: 'admin' },
  { url: '/admin/settings', name: 'admin-settings', authType: 'admin' },
];

async function getCookiesForRefreshToken(refreshToken: string) {
  const cookiesObj: Record<string, string> = {};
  const sb = createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll: () => Object.entries(cookiesObj).map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach((c) => (cookiesObj[c.name] = c.value)),
    },
  });
  await sb.auth.refreshSession({ refresh_token: refreshToken });
  return Object.entries(cookiesObj).map(([name, value]) => ({
    name,
    value,
    domain: 'localhost',
    path: '/',
    httpOnly: false,
    secure: false,
    sameSite: 'Lax' as const,
  }));
}

interface DefectFinding {
  route: string;
  name: string;
  viewport: string;
  defectType: 'horizontal-overflow' | 'element-spill' | 'text-collision' | 'inaccessible-control';
  details: string;
  screenshotPath: string;
}

async function runAudit() {
  const outputDir = path.join(process.cwd(), 'test-results', 'deep-audit');
  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  console.log('Retrieving authentic session tokens from Supabase Auth...');
  const adminCookies = await getCookiesForRefreshToken(ADMIN_REFRESH_TOKEN);
  const playerCookies = await getCookiesForRefreshToken(PLAYER_REFRESH_TOKEN);
  console.log(`✓ Admin session generated: ${adminCookies.length} cookies`);
  console.log(`✓ Player session generated: ${playerCookies.length} cookies\n`);

  const findings: DefectFinding[] = [];
  let totalEvaluated = 0;
  let totalPassed = 0;

  for (const vp of VIEWPORTS) {
    console.log(`\n================================================================`);
    console.log(`   TESTING VIEWPORT: ${vp.name} (${vp.width}x${vp.height} - ${vp.category})`);
    console.log(`================================================================`);

    const vpDir = path.join(outputDir, vp.name);
    fs.mkdirSync(vpDir, { recursive: true });

    // We create isolated contexts for anon, player, and admin
    const anonContext = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const playerContext = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    await playerContext.addCookies(playerCookies);
    const adminContext = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    await adminContext.addCookies(adminCookies);

    for (const spec of ROUTES_TO_AUDIT) {
      totalEvaluated++;
      const context = spec.authType === 'admin' ? adminContext : spec.authType === 'player' ? playerContext : anonContext;
      const page = await context.newPage();
      const targetUrl = `http://localhost:3000${spec.url}`;

      try {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(400);

        // Evaluate layout metrics
        const metrics = await page.evaluate(() => {
          const docEl = document.documentElement;
          const body = document.body;
          const scrollW = Math.max(docEl.scrollWidth, body ? body.scrollWidth : 0);
          const clientW = docEl.clientWidth;
          const winW = window.innerWidth;

          // Detect any elements visually protruding past viewport right edge uncontained
          const protruding: Array<{ selector: string; right: number; width: number; text: string }> = [];
          const allElements = Array.from(document.querySelectorAll('*'));
          for (const el of allElements) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              // Ignore elements intentionally translated off-screen (e.g. closed sidebar -translate-x-full)
              if (rect.left < -100 && rect.right < 0) continue;
              if (rect.right > winW + 2) {
                // Check if element is contained inside an intentional scroll container or clipped overflow:hidden ancestor
                let contained = false;
                let parent = el.parentElement;
                while (parent && parent !== document.body && parent !== document.documentElement) {
                  const style = window.getComputedStyle(parent);
                  if (['auto', 'scroll'].includes(style.overflowX) || ['auto', 'scroll'].includes(style.overflow)) {
                    contained = true;
                    break;
                  }
                  if (['hidden', 'clip'].includes(style.overflowX) || ['hidden', 'clip'].includes(style.overflow)) {
                    const pRect = parent.getBoundingClientRect();
                    if (pRect.right <= winW + 2) {
                      contained = true;
                      break;
                    }
                  }
                  parent = parent.parentElement;
                }
                if (contained) continue;

                const tag = el.tagName.toLowerCase();
                const cls = (typeof el.className === 'string' ? el.className.split(' ').slice(0, 3).join('.') : '');
                const selector = `${tag}${el.id ? '#' + el.id : ''}${cls ? '.' + cls : ''}`;
                protruding.push({
                  selector,
                  right: Math.round(rect.right),
                  width: Math.round(rect.width),
                  text: (el.textContent || '').trim().substring(0, 30),
                });
              }
            }
          }

          return {
            scrollWidth: scrollW,
            clientWidth: clientW,
            windowWidth: winW,
            hasOverflow: scrollW > clientW + 1,
            overflowPx: Math.max(0, scrollW - clientW),
            protrudingCount: protruding.length,
            worstProtrusion: protruding[0] || null,
          };
        });

        const screenshotFile = path.join(vpDir, `${spec.name}.png`);
        await page.screenshot({ path: screenshotFile, fullPage: false });

        if (metrics.hasOverflow || (metrics.worstProtrusion && metrics.worstProtrusion.right > vp.width + 5)) {
          const detail = metrics.hasOverflow
            ? `Page horizontal overflow +${metrics.overflowPx}px (scroll: ${metrics.scrollWidth}px > client: ${metrics.clientWidth}px)`
            : `Element protrusion: ${metrics.worstProtrusion?.selector} extends to ${metrics.worstProtrusion?.right}px (viewport: ${vp.width}px)`;
          console.error(`❌ DEFECT [${vp.name}] ${spec.name} (${spec.url}) — ${detail}`);
          findings.push({
            route: spec.url,
            name: spec.name,
            viewport: vp.name,
            defectType: metrics.hasOverflow ? 'horizontal-overflow' : 'element-spill',
            details: detail,
            screenshotPath: screenshotFile,
          });
        } else {
          totalPassed++;
          console.log(`✓ PASS [${vp.name}] ${spec.name} (scroll: ${metrics.scrollWidth}px / client: ${metrics.clientWidth}px)`);
        }
      } catch (err: any) {
        console.warn(`⚠️ ERROR [${vp.name}] ${spec.name}: ${err.message}`);
      } finally {
        await page.close();
      }
    }

    await anonContext.close();
    await playerContext.close();
    await adminContext.close();
  }

  await browser.close();

  const reportPath = path.join(process.cwd(), 'test-results', 'deep-audit-summary.json');
  fs.writeFileSync(reportPath, JSON.stringify({ totalEvaluated, totalPassed, findingsCount: findings.length, findings }, null, 2));

  console.log('\n================================================================');
  console.log(` DEEP AUDIT COMPLETE:`);
  console.log(` Total Scenarios Evaluated: ${totalEvaluated}`);
  console.log(` Scenarios Clean (0px overflow): ${totalPassed}`);
  console.log(` Defects Identified: ${findings.length}`);
  console.log(` Report written to: ${reportPath}`);
  console.log('================================================================\n');
}

runAudit().catch(console.error);
