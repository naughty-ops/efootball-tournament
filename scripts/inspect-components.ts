import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 320, height: 600 });

  // 1. Check Public Header at 320px
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  const publicMetrics = await page.evaluate(() => {
    const header = document.querySelector('header');
    const pill = header?.firstElementChild as HTMLElement;
    const topBar = pill?.firstElementChild as HTMLElement;
    const rightActions = topBar?.lastElementChild as HTMLElement;
    const navPill = header?.querySelector('nav') as HTMLElement;

    return {
      windowWidth: window.innerWidth,
      pillRight: pill?.getBoundingClientRect().right,
      rightActionsRight: rightActions?.getBoundingClientRect().right,
      spillRight: (rightActions?.getBoundingClientRect().right ?? 0) - window.innerWidth,
      navScrollWidth: navPill?.scrollWidth,
      navClientWidth: navPill?.clientWidth,
    };
  });
  console.log('Public Header at 320px:', publicMetrics);

  // 2. Check Dashboard at 320px
  await page.goto('http://localhost:3000/dashboard', { waitUntil: 'domcontentloaded' });
  const dashboardMetrics = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Dashboard Navigation"]') as HTMLElement;
    if (!nav) return { notFound: true };
    const links = Array.from(nav.querySelectorAll('a')).map((a) => {
      const rect = a.getBoundingClientRect();
      return {
        text: a.innerText.trim(),
        width: Math.round(rect.width),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
      };
    });
    return {
      navScrollWidth: nav.scrollWidth,
      navClientWidth: nav.clientWidth,
      links,
    };
  });
  console.log('Dashboard Nav at 320px:', dashboardMetrics);

  // 3. Check Admin TopNav & New Tournament Wizard at 320px
  await page.goto('http://localhost:3000/admin/tournaments/new', { waitUntil: 'domcontentloaded' });
  const wizardMetrics = await page.evaluate(() => {
    const header = document.querySelector('header') as HTMLElement;
    const wizardTracker = document.querySelector('.grid-cols-3') as HTMLElement;
    return {
      url: window.location.pathname,
      headerRect: header ? header.getBoundingClientRect() : null,
      wizardTrackerRect: wizardTracker ? wizardTracker.getBoundingClientRect() : null,
    };
  });
  console.log('Wizard / Admin at 320px:', wizardMetrics);

  await browser.close();
}

run().catch(console.error);
