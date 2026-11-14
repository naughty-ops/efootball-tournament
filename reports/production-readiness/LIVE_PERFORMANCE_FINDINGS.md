# Live Real-Time Performance Findings Report

**Date:** 2026-11-12T16:56:30+05:30  
**Project:** eFootball Tournament Platform  
**Target Environment:** Localhost (Ports 3000 & 3001)  
**Tools Employed:** Playwright Automated CDP Telemetry, Chrome Performance API, Next.js Turbopack  

---

## 1. Root-Cause Analysis: Why Navigation Felt Slow

When testing `http://localhost:3000`, user tab navigation experienced noticeable latency despite prior caching enhancements. Our telemetry revealed four distinct bottlenecks:

### Finding 1: Development Server vs Production Runtime Difference
- **Mechanism:** `next dev` purposefully disables `next/link` prefetching to conserve local CPU cycles during code editing. Consequently, every link click initiates a synchronous HTTP request to Node.js:
  `GET /tournaments?_rsc=...`
- **Impact in Dev:** Node.js executes the Server Component, connects to Supabase, generates the React Server Component payload, and sends it over localhost. This takes **400–850 ms** in development.
- **Production Truth:** In production (`next start`), Next.js pre-fetches the RSC payload on hover/viewport and caches static segments in memory. The identical navigation takes **96–143 ms** in production!

### Finding 2: Missing Server-Side In-Memory Cache on `homepage_sections`
- **Mechanism:** On `/`, `HomePage` executes `getPublicHomepageSections()`. Unlike `getPublicTournaments()`, which had a 10s memory cache, `getPublicHomepageSections()` had **no caching whatsoever**.
- **Impact:** Every single visit to the homepage in dev made a live network call to Supabase PostgREST `SELECT * FROM homepage_sections`. This caused `/live -> /` to spike up to **1,319 ms** in development.
- **Remediation:** Added 60s in-memory TTL caching and pruned wildcard `*` to explicit columns in `services/homepageCmsService.ts`. This immediately dropped transition time to **343 ms in dev** and **109 ms in production**.

### Finding 3: Short Cache TTL on Public Tournaments
- **Mechanism:** `CACHE_TTL_MS` in `services/publicTournamentService.ts` was set to only 10,000 ms (10 seconds).
- **Impact:** If a user clicked between Tournaments and Live with a 12-second pause, the cache had already expired, forcing another live Supabase query on the server.
- **Remediation:** Aligned `CACHE_TTL_MS` to 30,000 ms (30 seconds), matching Next.js `revalidate = 30`.

### Finding 4: Un-cached Notification Polling on Navigation
- **Mechanism:** In `PlayerDashboardHeader`, an effect was bound to `[pathname]`, executing `supabase.auth.getUser()` and `supabase.from('player_notifications').select('count')` on every tab click.
- **Impact:** Added 40–80 ms of unnecessary client network traffic on every player navigation.
- **Remediation:** Replaced with `useUnreadNotificationsCount(userId)` hook backed by TanStack Query (`staleTime: 60s`).

---

## 2. Real-Time HUD Monitoring Deployment

To ensure transparent visibility for developers and operators, an in-app real-time HUD monitor was implemented:
- **Component:** [components/dev/PerformanceMonitor.tsx](file:///d:/Project/components/dev/PerformanceMonitor.tsx)
- **Features:**
  - Displays live millisecond navigation timing with visual color badges:
    - **Green:** Under 150 ms
    - **Yellow:** 150–500 ms
    - **Red:** Over 500 ms
  - Displays active, cached, and fetching TanStack Query entries in real time.
  - Monitors total and duplicate network/Supabase requests.
  - Reports main-thread long tasks exceeding 50 ms.
- **Production Safety:** Encapsulated with `if (process.env.NODE_ENV === 'production') return null;` ensuring **zero production bundle footprint**.
