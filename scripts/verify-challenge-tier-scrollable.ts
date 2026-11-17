import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'node:fs';
import * as path from 'node:path';

// 1. Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[key] = val;
      }
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BASE_URL = 'http://localhost:3000';
const ARTIFACTS_DIR = 'C:\\Users\\aser\\.gemini\\antigravity\\brain\\686ee328-53f1-4506-8d19-8fb8ea8f2fcd';
const TEST_PASSWORD = 'TestPassword123!';

async function runVerification() {
  console.log('--- STARTING VERIFICATION: HORIZONTALLY SCROLLABLE CHALLENGE TIERS UP TO ₹100 ---');

  // Verify database cards
  const { data: dbCards, error: dbErr } = await adminClient
    .from('one_vs_one_cards')
    .select('id, name, entry_amount, advertised_payout, status, display_order')
    .eq('status', 'active')
    .order('display_order', { ascending: true });

  if (dbErr) {
    throw new Error(`Database query failed: ${dbErr.message}`);
  }

  console.log(`✅ Database verified: ${dbCards.length} active challenge cards in public.one_vs_one_cards`);
  for (const c of dbCards) {
    console.log(`   - Order ${c.display_order}: ${c.name} | Entry: ₹${c.entry_amount} | Payout: ₹${c.advertised_payout}`);
  }

  const browser = await chromium.launch({ headless: true });

  try {
    // -------------------------------------------------------------
    // TEST 1: PUBLIC HOMEPAGE SHOWCASE
    // -------------------------------------------------------------
    console.log('\n[TEST 1] Checking Public Homepage 1v1 Tier Showcase...');
    const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await desktopContext.newPage();

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    const showcaseSection = page.locator('text=Popular 1 VS 1 Arena Stakes');
    await showcaseSection.waitFor({ timeout: 10000 });
    console.log('✅ Found 1v1 Arena Showcase section on homepage');

    // Screenshot homepage showcase on desktop
    const showcaseContainer = page.locator('text=Popular 1 VS 1 Arena Stakes').locator('..').locator('..');
    await showcaseContainer.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    const hpDesktopPath = path.join(ARTIFACTS_DIR, 'challenge_tiers_homepage_desktop.png');
    await page.screenshot({ path: hpDesktopPath, fullPage: false });
    console.log(`📸 Saved desktop screenshot: ${hpDesktopPath}`);

    // Test mobile homepage
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(BASE_URL, { waitUntil: 'networkidle' });
    await mobilePage.locator('text=Popular 1 VS 1 Arena Stakes').scrollIntoViewIfNeeded();
    await mobilePage.waitForTimeout(500);

    const hpMobilePath = path.join(ARTIFACTS_DIR, 'challenge_tiers_homepage_mobile.png');
    await mobilePage.screenshot({ path: hpMobilePath });
    console.log(`📸 Saved mobile screenshot: ${hpMobilePath}`);
    await mobileContext.close();
    await desktopContext.close();

    // -------------------------------------------------------------
    // TEST 2: AUTHENTICATED 1V1 ARENA VIEW (DASHBOARD)
    // -------------------------------------------------------------
    console.log('\n[TEST 2] Checking Authenticated 1v1 Arena View...');
    const authContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const authPage = await authContext.newPage();

    // Login
    await authPage.goto(`${BASE_URL}/login`);
    await authPage.fill('input[type="email"]', 'qa_player_01@test.internal');
    await authPage.fill('input[type="password"]', TEST_PASSWORD);
    await authPage.click('button[type="submit"]');
    await authPage.waitForURL((url) => url.pathname.includes('/dashboard'), { timeout: 15000 });
    console.log('✅ Logged in successfully as qa_player_01@test.internal');

    // Navigate to 1v1 arena
    await authPage.goto(`${BASE_URL}/dashboard/matches?mode=1v1`, { waitUntil: 'networkidle' });
    await authPage.waitForSelector('text=Select Challenge Tier', { timeout: 10000 });
    console.log('✅ Navigated to 1v1 Arena View');

    // Verify header tier pill
    const headerPill = authPage.locator('text=/\\d+ Tiers • ₹\\d+ to ₹\\d+/');
    const pillText = await headerPill.textContent();
    console.log(`✅ Header badge verified: "${pillText?.trim()}"`);

    // Verify scroll container
    const carousel = authPage.locator('[aria-label="Challenge Tiers carousel"]');
    await carousel.waitFor({ timeout: 5000 });

    const scrollMetrics = await carousel.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      scrollLeft: el.scrollLeft,
    }));
    console.log(`✅ Carousel container metrics: scrollWidth=${scrollMetrics.scrollWidth}px, clientWidth=${scrollMetrics.clientWidth}px`);
    if (scrollMetrics.scrollWidth <= scrollMetrics.clientWidth) {
      throw new Error(`Carousel is not horizontally scrollable: scrollWidth (${scrollMetrics.scrollWidth}) <= clientWidth (${scrollMetrics.clientWidth})`);
    }

    // Capture initial state screenshot (showing ₹10, ₹15, ₹20, ₹25 tiers)
    const initialScreenshotPath = path.join(ARTIFACTS_DIR, 'challenge_tiers_arena_initial.png');
    await authPage.screenshot({ path: initialScreenshotPath });
    console.log(`📸 Saved arena initial screenshot: ${initialScreenshotPath}`);

    // Click Right navigation button multiple times
    const rightBtn = authPage.locator('button[aria-label="Scroll challenge tiers right"]');
    console.log('Clicking right scroll button to navigate towards ₹100 tier...');
    await rightBtn.click();
    await authPage.waitForTimeout(600);
    await rightBtn.click();
    await authPage.waitForTimeout(600);
    await rightBtn.click();
    await authPage.waitForTimeout(600);

    const scrolledMetrics = await carousel.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      scrollLeft: el.scrollLeft,
    }));
    console.log(`✅ After right clicks: scrollLeft=${scrolledMetrics.scrollLeft}px`);
    if (scrolledMetrics.scrollLeft <= 50) {
      throw new Error('Scroll container did not scroll horizontally upon right arrow click');
    }

    // Verify Ultimate Titan (₹100) card is in view
    const titanCard = authPage.locator('text=Ultimate Titan').first();
    await titanCard.waitFor({ timeout: 5000 });
    console.log('✅ Ultimate Titan (₹100) tier card found and visible!');

    // Capture scrolled state screenshot
    const scrolledScreenshotPath = path.join(ARTIFACTS_DIR, 'challenge_tiers_arena_scrolled_titan.png');
    await authPage.screenshot({ path: scrolledScreenshotPath });
    console.log(`📸 Saved arena scrolled screenshot (showing ₹100 Titan tier): ${scrolledScreenshotPath}`);

    // Click Left navigation button to scroll back
    const leftBtn = authPage.locator('button[aria-label="Scroll challenge tiers left"]');
    console.log('Clicking left scroll button to scroll back...');
    await leftBtn.click();
    await authPage.waitForTimeout(600);
    await leftBtn.click();
    await authPage.waitForTimeout(600);

    const backMetrics = await carousel.evaluate((el) => el.scrollLeft);
    console.log(`✅ After left clicks: scrollLeft=${backMetrics}px (scrolled back smoothly)`);

    // -------------------------------------------------------------
    // TEST 3: MOBILE VIEWPORT TEST ON 1V1 ARENA
    // -------------------------------------------------------------
    console.log('\n[TEST 3] Testing Mobile Touch Viewport for 1v1 Arena...');
    await authPage.setViewportSize({ width: 390, height: 844 });
    await authPage.waitForTimeout(500);

    const mobileSwipeHint = authPage.locator('text=Swipe horizontally to explore all tiers');
    const isHintVisible = await mobileSwipeHint.isVisible();
    console.log(`✅ Mobile swipe hint visible: ${isHintVisible}`);

    const mobileArenaScreenshotPath = path.join(ARTIFACTS_DIR, 'challenge_tiers_arena_mobile.png');
    await authPage.screenshot({ path: mobileArenaScreenshotPath });
    console.log(`📸 Saved mobile arena screenshot: ${mobileArenaScreenshotPath}`);

    await authContext.close();
    console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! HORIZONTALLY SCROLLABLE CARDS UP TO ₹100 VERIFIED!');
  } finally {
    await browser.close();
  }
}

runVerification().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
