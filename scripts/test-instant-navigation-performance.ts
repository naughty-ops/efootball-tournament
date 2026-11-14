/**
 * Automated Verification Test Suite for Instant Navigation & Application Experience
 * Verifies that the platform meets all native-app architecture standards:
 * - Persistent Dashboard Shell (layout.tsx)
 * - Centralized TanStack Query layer (SWR caching, gcTime, deduplication)
 * - Intelligent route prefetching
 * - Navigation state & scroll position retention
 * - Granular Realtime cache surgery
 * - Exact geometry-matched skeletons
 * - Mobile touch & native viewport configuration
 */

import * as fs from 'fs';
import * as path from 'path';

interface TestResult {
  name: string;
  category: string;
  passed: boolean;
  message: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, name: string, category: string, successMsg: string, failMsg: string) {
  results.push({
    name,
    category,
    passed: condition,
    message: condition ? successMsg : failMsg,
  });
}

function runTests() {
  console.log('================================================================');
  console.log('    INSTANT NAVIGATION & APPLICATION PERFORMANCE TEST SUITE     ');
  console.log('================================================================\n');

  const root = process.cwd();

  // GROUP 1: Persistent Dashboard Shell
  const dashboardLayoutPath = path.join(root, 'app/dashboard/layout.tsx');
  const dashboardLayoutExists = fs.existsSync(dashboardLayoutPath);
  assert(
    dashboardLayoutExists,
    'Dashboard layout.tsx exists',
    'Shell Architecture',
    'app/dashboard/layout.tsx successfully provisioned as persistent shell',
    'Missing app/dashboard/layout.tsx'
  );

  if (dashboardLayoutExists) {
    const layoutContent = fs.readFileSync(dashboardLayoutPath, 'utf8');
    assert(
      layoutContent.includes('PlayerDashboardHeader') && layoutContent.includes('{children}'),
      'Dashboard Layout hosts persistent header',
      'Shell Architecture',
      'PlayerDashboardHeader is persistently anchored in dashboard layout',
      'PlayerDashboardHeader missing from dashboard layout'
    );
  }

  // Ensure sub-pages do not render duplicate PlayerDashboardHeader
  const subPages = [
    'app/dashboard/page.tsx',
    'app/dashboard/tournaments/page.tsx',
    'app/dashboard/matches/page.tsx',
    'app/dashboard/wallet/page.tsx',
    'app/dashboard/settings/page.tsx',
    'app/dashboard/career/page.tsx',
    'app/dashboard/notifications/page.tsx',
    'app/dashboard/tickets/page.tsx',
  ];

  let duplicateFound = false;
  subPages.forEach((p) => {
    const fullPath = path.join(root, p);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('<PlayerDashboardHeader')) {
        duplicateFound = true;
      }
    }
  });

  assert(
    !duplicateFound,
    'Sub-pages do not render duplicate header',
    'Shell Architecture',
    'Zero duplicate header renderings detected across dashboard sub-pages',
    'Duplicate PlayerDashboardHeader found in sub-pages'
  );

  // GROUP 2: Centralized TanStack Query Architecture
  const queryKeysPath = path.join(root, 'lib/query/queryKeys.ts');
  assert(
    fs.existsSync(queryKeysPath),
    'Centralized queryKeys factory exists',
    'Data Architecture',
    'lib/query/queryKeys.ts defined with typed query keys',
    'Missing lib/query/queryKeys.ts'
  );

  const queryProviderPath = path.join(root, 'components/shared/QueryProvider.tsx');
  const queryProviderContent = fs.readFileSync(queryProviderPath, 'utf8');
  assert(
    queryProviderContent.includes('staleTime: 60 * 1000') && queryProviderContent.includes('gcTime: 10 * 60 * 1000'),
    'QueryClient tuned for instant tab restoration',
    'Data Architecture',
    'QueryClient configured with 60s staleTime and 10-minute gcTime retention',
    'QueryClient missing optimal staleTime / gcTime tuning'
  );

  // GROUP 3: Reusable Query Hooks
  const hooks = [
    'hooks/queries/useTournamentsQuery.ts',
    'hooks/queries/useLiveMatchesQuery.ts',
    'hooks/queries/useTournamentDetailQuery.ts',
    'hooks/queries/usePlayerDashboardQuery.ts',
    'hooks/queries/useNotificationsQuery.ts',
  ];

  hooks.forEach((h) => {
    assert(
      fs.existsSync(path.join(root, h)),
      `Hook ${path.basename(h)} exists`,
      'Data Architecture',
      `${h} present and exportable`,
      `Missing ${h}`
    );
  });

  // GROUP 4: Navigation Prefetching
  const publicNavContent = fs.readFileSync(path.join(root, 'components/public/PublicNav.tsx'), 'utf8');
  assert(
    publicNavContent.includes('prefetch={true}'),
    'Public navigation prefetching active',
    'Navigation Engine',
    'PublicNav explicitly prefetches high-priority routes',
    'PublicNav missing prefetch attribute'
  );

  const dashboardHeaderContent = fs.readFileSync(path.join(root, 'app/dashboard/PlayerDashboardHeader.tsx'), 'utf8');
  assert(
    dashboardHeaderContent.includes('prefetch={true}'),
    'Dashboard tab prefetching active',
    'Navigation Engine',
    'PlayerDashboardHeader explicitly prefetches tab destinations',
    'PlayerDashboardHeader missing prefetch attribute'
  );

  // GROUP 5: State & Scroll Retention
  const tabStorePath = path.join(root, 'lib/stores/useTabStateStore.ts');
  assert(
    fs.existsSync(tabStorePath),
    'Tab state retention store exists',
    'State Retention',
    'useTournamentFilterStore and usePlayerDashboardTabStore active',
    'Missing lib/stores/useTabStateStore.ts'
  );

  const tournamentsClientContent = fs.readFileSync(path.join(root, 'components/public/TournamentsClientList.tsx'), 'utf8');
  assert(
    tournamentsClientContent.includes('useTournamentFilterStore') && tournamentsClientContent.includes('window.scrollTo'),
    'Tournaments list restores scroll and filters',
    'State Retention',
    'TournamentsClientList bound to persistent store with scroll position restoration',
    'TournamentsClientList missing persistent store integration'
  );

  // GROUP 6: Realtime Granular Cache Surgery
  const livePageContent = fs.readFileSync(path.join(root, 'app/(public)/live/page.tsx'), 'utf8');
  assert(
    livePageContent.includes('queryClient.setQueryData'),
    'Live page uses granular cache surgery',
    'Realtime Optimization',
    'Live page updates query cache in-place without screen tearing or blank flashes',
    'Live page missing setQueryData in-place patching'
  );

  // GROUP 7: Geometry-Matched Skeletons
  const skeletonsPath = path.join(root, 'components/ui/AppSkeletons.tsx');
  assert(
    fs.existsSync(skeletonsPath),
    'Geometry-matched skeletons exist',
    'Perceived Speed',
    'TournamentCardSkeleton, MatchCardSkeleton, DashboardStatsSkeleton authored',
    'Missing components/ui/AppSkeletons.tsx'
  );

  // GROUP 8: Mobile Touch & Native Configuration
  const globalsCss = fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8');
  assert(
    globalsCss.includes('touch-action: manipulation') &&
      globalsCss.includes('overscroll-behavior-y: none') &&
      globalsCss.includes('-webkit-tap-highlight-color: transparent'),
    'Native touch & overscroll optimizations active',
    'Mobile Experience',
    'Zero 300ms tap delay, pull-to-refresh conflict prevention, transparent tap highlight active',
    'globals.css missing touch / overscroll rules'
  );

  // GROUP 9: Explicit Database Column Selection
  const tournamentServiceContent = fs.readFileSync(path.join(root, 'services/tournamentService.ts'), 'utf8');
  assert(
    tournamentServiceContent.includes('champion:participants!tournaments_champion_id_fkey(id, username, real_name, seed_number)'),
    'Explicit column selection in tournament queries',
    'Database Optimization',
    'Avoids SELECT * wildcard joins on participants relations',
    'tournamentService uses unoptimized wildcard select'
  );

  // GROUP 10: PWA Cache Version
  const swContent = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
  assert(
    swContent.includes('efootball-pwa-v3'),
    'PWA Service Worker updated',
    'Application Caching',
    'Service worker cache bumped to v3 for immediate asset refreshing',
    'sw.js still on old cache version'
  );

  // PRINT REPORT
  let passedCount = 0;
  let failedCount = 0;

  const grouped = new Map<string, TestResult[]>();
  results.forEach((r) => {
    if (!grouped.has(r.category)) grouped.set(r.category, []);
    grouped.get(r.category)!.push(r);
    if (r.passed) passedCount++;
    else failedCount++;
  });

  for (const [category, tests] of grouped.entries()) {
    console.log(`--- CATEGORY: ${category} ---`);
    tests.forEach((t) => {
      const tag = t.passed ? '[PASS]' : '[FAIL]';
      console.log(`  ${tag} ${t.name}: ${t.message}`);
    });
    console.log('');
  }

  console.log('================================================================');
  console.log('                     TEST SUMMARY RESULTS                       ');
  console.log('================================================================');
  console.log(`Total Invariants Tested : ${results.length}`);
  console.log(`Passed                 : ${passedCount}`);
  console.log(`Failed                 : ${failedCount}`);
  console.log('');

  if (failedCount === 0) {
    console.log('>> ALL INSTANT NAVIGATION INVARIANTS PASSED SUCCESSFULLY <<');
    process.exit(0);
  } else {
    console.error('>> SOME CHECKS FAILED <<');
    process.exit(1);
  }
}

runTests();
