# COMPLETE CODEBASE AUDIT & OPTIMIZATION INVENTORY REPORT

**Project:** eFootball Tournament Platform  
**Repository:** `naughty-ops/efootball-tournament`  
**Workspace:** `D:\Project`  
**Branch:** `cleanup/codebase-optimization`  
**Date:** 2026-11-02  
**Status:** Phase 1 Complete (Audit & Classification)

---

## 1. Executive Summary & Inventory Overview

A full-stack, file-by-file audit was executed across the entire repository. Dynamic references, route bindings, client/server boundaries, configuration files, service worker assets, and database schemas were analyzed without making speculative assumptions.

| Category | Total Count | Notes |
| :--- | :--- | :--- |
| **Total Non-Ignored Files** | **947** | Includes app code, assets, scripts, and old test artifacts |
| **Total Page Routes** | **41** | 13 Public, 4 Authenticated Player, 24 Admin Dashboard |
| **Total API Route Handlers** | **15** | Payment webhooks, LiveKit tokens, admin APIs, cron, auth |
| **Total React Components** | **56** | 8 Unused, 29 Single-use, 19 Shared |
| **Total Services** | **17** | All 17 active (only `services/index.ts` has dead `apiClient`) |
| **Total Hooks** | **2** | Both active (`useRealtimeMatches`, `useToast`) |
| **Total Lib Files** | **28** | 27 active, 1 unused (`lib/lifecycle/celebrationTrigger.ts`) |
| **Package Dependencies** | **22 runtime / 11 dev** | 1 unused dead client (`axios`), 1 unused animation (`motion`) |
| **Root Assets (`elogo/`)** | **8 files (24.5 MB)** | Never served by Next.js; raw development masters |
| **Public Assets (`public/`)** | **52 files** | 38 unreferenced (boilerplate SVGs, test images, unused logos) |
| **Old Test Results** | **603 files (35.8 MB)** | Local Playwright traces from Oct 28 in `.gitignore` |

---

## 2. Classification of All Findings

Each item in the project has been categorized under one of the mandatory classification tiers:

### A. SAFE TO REMOVE (Zero Functional Impact, Confirmed Orphaned)
1. **`components/kerala/` (7 components — 14.4 KB)**
   - `CoconutPalmSilhouette.tsx`
   - `KasavuGoldAccent.tsx`
   - `KeralaBackwaterCurve.tsx`
   - `KeralaEmptyState.tsx`
   - `KeralaIcons.tsx`
   - `PalmFrondCorner.tsx`
   - `PalmLeafPattern.tsx`
   - *Reason:* Abandoned decorative concept from September 2026. Zero imports or references across the entire codebase.
2. **`components/public/TournamentCarousel.tsx` (297 lines — 9.5 KB)**
   - *Reason:* Early mock carousel containing hardcoded dummy data (`defaultTournaments`). Superseded by dynamic `components/public/ImageCarousel.tsx` and server-rendered tournament feeds. Zero imports.
3. **`lib/lifecycle/celebrationTrigger.ts` (27 lines — 785 B)**
   - *Reason:* Dead session storage helper for winner celebrations never integrated into tournament or bracket views. Zero references.
4. **`services/index.ts` (8 lines — 175 B)**
   - *Reason:* Instantiates an `apiClient` via `axios`. Never imported by any component, route, or service. All actual services use native `fetch` or Supabase JS client.
5. **Boilerplate Next.js Template SVGs in `public/` (5 files)**
   - `public/file.svg`
   - `public/globe.svg`
   - `public/next.svg`
   - `public/vercel.svg`
   - `public/window.svg`
   - *Reason:* Default create-next-app boilerplate files never rendered.
6. **Temporary Test Images in `public/images/` (6 files — 3.9 MB)**
   - `public/images/1.jpeg` (171 KB)
   - `public/images/2.jpeg` (170 KB)
   - `public/images/3.jpeg` (49 KB)
   - `public/images/3.png` (1.77 MB)
   - `public/images/banner12.jpg` (54 KB)
   - `public/images/banner123.jpg.jpeg` (133 KB)
   - *Reason:* One-off developer uploads from August 8, 2026. Real banners used by the application are `banner1.jpg`, `banner2.jpg`, `banner3.jpg`.
7. **Unreferenced Logo Variants in `public/logos/` (11 files — ~15 MB)**
   - `logo-header-dark-solid.png` (7.18 MB)
   - `logo-header-dark.png` (1.18 MB)
   - `logo-header-light-solid.png` (1.27 MB)
   - `logo-header-light.png` (1.46 MB)
   - `logo-horizontal.png` (100 KB)
   - `logo-mark.png` (640 KB)
   - `logo-text-green.png` (90 KB)
   - `logo.png` (790 KB)
   - `pwa-set.png` (1.21 MB)
   - `app-icon-4k-master.png` (640 KB)
   - `splash-4k-master.png` (490 KB)
   - *Reason:* Every single header, footer, card, and page in the app exclusively renders `/logos/logo-mark-transparent.png`.
8. **Unreferenced Splash Images in `public/splash/` (4 files — 1.7 MB)**
   - `public/splash/splash-4k.png`
   - `public/splash/splash-landscape.png`
   - `public/splash/splash-mobile.png`
   - `public/splash/splash-portrait.png`
   - *Reason:* Never referenced by `manifest.json`, `sw.js`, or any application page.
9. **Obsolete Root Directory `elogo/` (8 files — 24.5 MB)**
   - *Reason:* Root folder not served by Next.js public directory. Contained raw high-resolution master PNGs that were already processed into `public/logos/`. Zero runtime access.
10. **Local Test Artifacts in `test-results/` (603 files — 35.8 MB)**
    - *Reason:* Playwright browser traces and failure screenshots from October 28. Already ignored by git.

---

### B. DUPLICATE (Redundant Code Requiring Consolidation)
1. **Database Test Endpoint: `app/api/db-test/route.ts` vs `app/api/health/db/route.ts`**
   - *Issue:* Both call `testSupabaseConnection()`. However, `health/db` includes rate limiting, client IP tracking, standard error envelopes, and cache headers. `db-test` is an unauthenticated, un-rate-limited development leftover.
   - *Action:* Delete `app/api/db-test/route.ts` and route all health checks to `/api/health/db`.
2. **LiveKit Token Generation: `app/api/live/token/route.ts` vs `app/api/livekit/token/route.ts`**
   - *Issue:* Both generate LiveKit access tokens with 95% identical logic. Furthermore, `app/(public)/live/[matchId]/page.tsx` contains an awkward client-side fallback where it tries `/api/live/token` first, and if that fails, tries `/api/livekit/token`.
   - *Action:* Consolidate the token generation logic into a single robust handler supporting both roles (`broadcaster` and `viewer`), while allowing both route paths to resolve cleanly without duplicating 130 lines of code.

---

### C. UNUSED (Dependencies & Packages)
1. **`axios` (in `package.json`)**
   - *Status:* Only imported by `services/index.ts` to create the unused `apiClient`. Once `services/index.ts` is deleted, `axios` has zero imports across the entire project. Safe to uninstall.
2. **`motion` (Framer Motion v14 in `package.json`)**
   - *Status:* Zero imports across all `.ts`, `.tsx`, `.js`, and `.jsx` files. UI animations are implemented using Tailwind CSS utilities and transitions. Safe to uninstall.
3. **`zustand` (in `package.json`)**
   - *Status:* Zero current store imports, BUT **explicitly requested by the user to be preserved** as part of the core technology stack. **MUST PRESERVE**.

---

### D. NEEDS REFACTORING & SECURITY REMEDIATION
1. **LiveKit Hardcoded Secret Leakage (`app/api/live/token/route.ts` & `app/api/livekit/token/route.ts`)**
   - *Critical Defect:* Lines 9-10 of both files define:
     ```ts
     const DEFAULT_API_KEY = 'API57Y48Vmbn4nm';
     const DEFAULT_API_SECRET = 'rkpn1ViaYdplx5TZzAc0NTlSQeSZimM7YYYMrghaY7C';
     ```
   - *Risk:* Hardcoded API secret credentials in client-reachable route handlers leak production LiveKit access.
   - *Remediation:* Remove hardcoded fallbacks completely. Strictly require `process.env.LIVEKIT_API_KEY` and `process.env.LIVEKIT_API_SECRET`. If either is missing, return an explicit 500 error response with `"LiveKit credentials not configured"`.

---

### E. NEEDS INVESTIGATION (Login Route Separation)
1. **`/login` vs `/auth/login`**
   - *Investigation:*
     - `/login` is customized as the Admin Portal Login page (`app/login/page.tsx`).
     - `/auth/login` is the Player Portal Login page (`app/auth/login/page.tsx`) with verification callbacks, password reset redirects, and player onboarding flows.
   - *Verdict:* Both are intentional, active, and serve distinct user experiences. **MUST PRESERVE BOTH**.

---

### F. MUST PRESERVE (Strictly Protected Assets & Infrastructure)
1. **All 41 Page Routes**:
   - 13 Public routes (home, tournament listings, bracket views, live streams, info).
   - 4 Player dashboard routes (profile, match history, registrations).
   - 24 Admin dashboard routes (bracket customizer, match results, participant manager, settings).
2. **All 36 Supabase SQL Migrations & Staged Re-alignments**:
   - `20260924000000_predictions_and_viewer_history.sql`
   - `20260925000000_add_penalty_fields_to_matches.sql`
   - `20261101000000_add_youpi_and_unified_payment_state_support.sql`
   - `20261101010000_create_reconcile_and_confirm_payment_rpc.sql`
   - `20261101020000_create_payment_utr_claims_and_atomic_lease.sql`
   - `20261101030000_production_security_and_drift_remediation.sql`
3. **Payment Infrastructure & Unified State Machine**:
   - `lib/payment/types.ts`
   - `lib/payment/factory.ts`
   - `lib/payment/eligibility.ts`
   - `lib/payment/youpi-adapter.ts`
   - `app/api/webhooks/youpi/route.ts`
   - `app/api/webhooks/razorpay/route.ts`
   - `app/api/webhooks/cashfree/route.ts`
   - `app/api/admin/reconcile-payment/route.ts`
   - `app/api/admin/payment-monitoring/route.ts`
   - `components/admin/PaymentMonitoringCard.tsx`
4. **PWA Core Infrastructure**:
   - `public/manifest.json` & `public/manifest.webmanifest`
   - `public/sw.js` (service worker)
   - `public/icons/icon-192x192.png`, `icon-512x512.png`, `icon-maskable.png`, `apple-touch-icon.png`
   - `components/shared/PWAInstaller.tsx` & `PWAInstallPrompt.tsx`
5. **Active Image Assets**:
   - `public/logos/logo-mark-transparent.png`
   - `public/images/banner1.jpg`, `banner2.jpg`, `banner3.jpg` and `public/images/banners/`
   - `public/favicon.ico`

---

## 3. Recommended Phased Execution Plan

1. **Phase 2 & 3: Component & Codebase Removals**
   - Delete `components/kerala/` (7 files).
   - Delete `components/public/TournamentCarousel.tsx`.
   - Delete `lib/lifecycle/celebrationTrigger.ts`.
   - Delete `services/index.ts`.
   - Run `npx tsc --noEmit` to verify type safety.
2. **Phase 4: API & Backend Consolidation & Security Fix**
   - Remove `app/api/db-test/route.ts`.
   - Remediate hardcoded credentials in `app/api/live/token/route.ts` and `app/api/livekit/token/route.ts`.
   - Verify all API endpoints pass syntax and type validation.
3. **Phase 5: Asset Pruning & Cleanup**
   - Remove root directory `elogo/` (24.5 MB).
   - Remove 5 boilerplate SVGs from `public/`.
   - Remove 6 unreferenced test images from `public/images/`.
   - Remove 11 unused logo variants from `public/logos/`.
   - Remove 4 unused splash images from `public/splash/`.
   - Clean up local `test-results/` (35.8 MB).
4. **Phase 6: Dependency Optimization**
   - Uninstall `axios` and `motion`.
   - Retain `zustand` as explicitly specified.
   - Run `npm run build` to confirm production build cleanliness.
5. **Phase 7: Full Verification**
   - Run typecheck, lint, and build.
   - Verify responsive viewports (320px to 1920px).
   - Generate final completion artifact.
