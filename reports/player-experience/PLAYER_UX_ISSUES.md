# PLAYER UX ISSUES & DEFECT CATALOG
**Project:** eFootball Tournament Platform  
**Target Environment:** Local Production Server (`http://localhost:3001`) / Production (`https://efootball-tournament-cyan.vercel.app`)  
**Audit Date:** November 12, 2026  
**Auditor Persona:** Senior UX & Interface Auditor  

---

## 1. CRITICAL UX DEFECTS (IMMEDIATE PLAYER BLOCKERS)

### UX-01: Horizontal Viewport Overflow on Mobile Devices (360×800)
* **Severity:** **CRITICAL**
* **Location:** [app/dashboard/PlayerDashboardHeader.tsx](file:///D:/Project/app/dashboard/PlayerDashboardHeader.tsx#L188-L238)
* **Evidence:** Playwright automated viewport evaluation at 360×800 px recorded `scrollWidth: 381px` (+21px overflow) across all 8 player dashboard pages.
* **Root Cause:** The flex container on mobile (`<div className="flex lg:hidden items-center gap-1.5 sm:gap-2 shrink-0">`) aggregates the "Explore" button, Notification Bell, and Profile Avatar dropdown trigger without sufficient padding constraints, causing the pill container to exceed 360px viewport boundaries.
* **Player Impact:** When scrolling vertically, players unintentionally scroll horizontally, creating a jarring, swaying screen jitter on standard Android devices (Samsung Galaxy A/M series, Xiaomi Redmi).
* **Remediation:** Apply `max-w-full overflow-hidden`, hide text label "Explore" below 390px, and reduce avatar container padding from `pl-1.5 pr-2` to `p-1`.

---

### UX-02: Unauthenticated Dashboard Access Redirects to Admin Portal (`/login`)
* **Severity:** **CRITICAL**
* **Location:** [lib/supabase/proxy.ts](file:///D:/Project/lib/supabase/proxy.ts#L71-L75)
* **Evidence:** 
  ```typescript
  // Fast redirect for protected routes when no candidate session cookie exists
  if (!hasAuthCookie && (isAdminRoute || isDashboardRoute)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login'; // <-- SENDS PLAYERS TO ADMIN LOGIN
    return applySecurityHeaders(NextResponse.redirect(url));
  }
  ```
* **Root Cause:** Both `isAdminRoute` and `isDashboardRoute` share the same hardcoded redirect target `/login`. `/login` is exclusively the Admin Portal ("Protected Admin Route • eFootball Tournament System").
* **Player Impact:** Players whose session cookies expire or who follow a shared dashboard link are dumped onto the red Admin Portal, causing them to believe they do not have platform access or that their account is banned.
* **Remediation:** Disaggregate routes: redirect `isDashboardRoute` to `/auth/login?next=/dashboard`, and `isAdminRoute` to `/login`.

---

### UX-03: Shared-IP Denial-of-Service via Inflexible Auth Rate Limiter
* **Severity:** **CRITICAL**
* **Location:** [lib/rateLimit.ts](file:///D:/Project/lib/rateLimit.ts#L10) & [lib/supabase/proxy.ts](file:///D:/Project/lib/supabase/proxy.ts#L24-L28)
* **Evidence:** In raw Playwright audit, 26 page navigation requests triggered HTTP 429:
  `Failed to load resource: the server responded with a status of 429 (Too Many Requests)`
* **Root Cause:** `RATE_LIMIT_RULES.auth` enforces a limit of 10 requests per 60 seconds per IP on `/login` and `/auth/login`. In collegiate dormitories, esports cafes, gaming tournaments, and mobile cellular networks (CGNAT), dozens of players share one external IP.
* **Player Impact:** Legitimate players attempting to sign up, sign in, or recover passwords are locked out with an unhandled JSON error: `{"error":"Too Many Requests","message":"Rate limit exceeded..."}`.
* **Remediation:** Increase auth rate limit window or tier by account/session identifier; exclude prefetch requests and introduce a user-friendly 429 error modal with retry countdown.

---

### UX-04: iOS Safari Pop-Up Blocker Ejection During Paid Registration
* **Severity:** **CRITICAL**
* **Location:** [components/tournament/TournamentRegistrationCard.tsx](file:///D:/Project/components/tournament/TournamentRegistrationCard.tsx#L150-L155)
* **Evidence:**
  ```typescript
  const res = await registerForTournamentAction(tournament.id, { rulesAccepted: true });
  // Asynchronous gap loses iOS user gesture token!
  if (typeof window !== 'undefined') {
    const opened = window.open(waUrl, '_blank');
    if (!opened) {
      window.location.assign(waUrl); // <-- FORCIBLY EJECTS USER
    }
  }
  ```
* **Root Cause:** iOS Safari strictly requires `window.open` to be invoked synchronously in direct response to a tap event. Because `await registerForTournamentAction` takes 300–800ms, Safari classifies `window.open` as an unsolicited pop-up and blocks it. The fallback `window.location.assign` forcefully navigates the player away from the app.
* **Player Impact:** Players are abruptly ejected from the tournament details page into WhatsApp, losing their app context. If they do not have WhatsApp installed, the browser shows a dead error page.
* **Remediation:** After registration is confirmed, render an in-app confirmation modal with a prominent "Proceed to WhatsApp Verification" button and a "Copy Message & Registration ID" button.

---

## 2. MAJOR UX DEFECTS (USABILITY & ACCESSIBILITY DEFICITS)

### UX-05: Missing In-App Withdrawal/Cancellation for Free Tournaments
* **Severity:** **MAJOR**
* **Location:** [components/tournament/TournamentRegistrationCard.tsx](file:///D:/Project/components/tournament/TournamentRegistrationCard.tsx#L167-L177)
* **Root Cause:** `handleCancelRequest` is only surfaced for `registrationRecord.status === 'pending_payment'`. Confirmed participants in free tournaments have no UI action to withdraw.
* **Player Impact:** Players whose schedule changes cannot release their slot, resulting in "no-shows" on match day and preventing waitlisted players from competing.
* **Remediation:** Introduce a "Withdraw Registration" confirmation modal calling a server action to release the participant record before bracket generation.

---

### UX-06: Mobile Touch Target Violations (< 44×44px WCAG 2.5.5)
* **Severity:** **MAJOR**
* **Location:** Across all dashboard tabs (notably [PlayerDashboardHeader.tsx](file:///D:/Project/app/dashboard/PlayerDashboardHeader.tsx#L204-L218) and [notifications/page.tsx](file:///D:/Project/app/dashboard/notifications/page.tsx))
* **Evidence:** Playwright mobile audit recorded:
  * `/dashboard`: 5 targets under 36×36px
  * `/dashboard/matches`: 6 targets under 36×36px
  * `/dashboard/wallet`: 6 targets under 36×36px
  * `/dashboard/notifications`: 9 targets under 36×36px
* **Root Cause:** Quick buttons use `h-7 w-7` (28×28px) or `p-1` without CSS `min-h-[44px] min-w-[44px]` or invisible tap boundary padding (`before:absolute before:inset-[-8px]`).
* **Player Impact:** High rate of frustrating mis-taps on mobile touchscreens.
* **Remediation:** Add `touch-target-expand` utility or enforce `min-h-[44px] min-w-[44px]` on all interactive triggers.

---

### UX-07: Inconsistent Brand Visual Identity on Public `/about` Page
* **Severity:** **MAJOR**
* **Location:** [app/(public)/about/page.tsx](file:///D:/Project/app/(public)/about/page.tsx#L25-L55)
* **Evidence:** Feature cards render with `bg-[#1818D4] border-white/20 text-white rounded-[28px]`, contrasting sharply with the deep dark theme used across the rest of the site (`bg-[#050814]`, `bg-[#0A0E1A]`, `bg-[#111827]`).
* **Player Impact:** Creates a disjointed experience where the `/about` page feels like a legacy template or an unskinned external page.
* **Remediation:** Align `/about` card styles with dark glassmorphism surfaces (`bg-white/5 border-white/10 text-white`).

---

### UX-08: Support Center Swipe Navigation Tab Metadata Desynchronization
* **Severity:** **MAJOR**
* **Location:** [app/dashboard/tickets/page.tsx](file:///D:/Project/app/dashboard/tickets/page.tsx#L58)
* **Evidence:**
  ```tsx
  <PlayerDashboardSwipeWrapper currentSection="settings">
  ```
* **Root Cause:** The `currentSection` prop is copy-pasted as `"settings"` rather than `"tickets"`.
* **Player Impact:** When a player attempts to swipe horizontally between tabs on mobile, swiping on the tickets page acts as though they are on settings, jumping to unintended tabs.
* **Remediation:** Correct `currentSection="tickets"`.

---

## 3. MODERATE UX DEFECTS (CONFUSION & REDUCED EFFICIENCY)

### UX-09: Ambiguous eFootball ID Input Masking
* **Severity:** **MODERATE**
* **Location:** [components/settings/PlayerSettingsClientView.tsx](file:///D:/Project/components/settings/PlayerSettingsClientView.tsx#L390-L405)
* **Root Cause:** Players must manually type hyphens in `ABCD-123-456-789`. If they paste a raw 13-character string, form validation rejects it without auto-formatting.
* **Remediation:** Implement an input mask that automatically strips spaces/dashes and formats user keystrokes into `XXXX-XXX-XXX-XXX`.

---

### UX-10: Payout Request Destination Cannot Be Edited Inline
* **Severity:** **MODERATE**
* **Location:** [components/wallet/RequestPayoutModal.tsx](file:///D:/Project/components/wallet/RequestPayoutModal.tsx#L39-L46)
* **Root Cause:** The modal selects `preferredMethod` automatically; if the player wants to send this specific withdrawal to UPI instead of Bank, they are forced to cancel out, navigate to Settings, switch preferred method, and return to Wallet.
* **Remediation:** Add a radio selection in `RequestPayoutModal` to choose between saved payment methods on the fly.

---

### UX-11: Absence of Public Tournament Search and Filter Bar
* **Severity:** **MODERATE**
* **Location:** [app/(public)/tournaments/page.tsx](file:///D:/Project/app/(public)/tournaments/page.tsx)
* **Root Cause:** Tournaments are rendered in a single flat list without search input or status chips (Free / Paid / Knockout / Open).
* **Player Impact:** As the tournament archive grows, players must scroll through dozens of cards to find an active competition.
* **Remediation:** Add a sticky search and category filter bar above the tournament grid.

---

## 4. MINOR UX DEFECTS (POLISH & COSMETIC)

### UX-12: Heading Semantic Tagging Omission on Auth Screens
* **Severity:** **MINOR**
* **Location:** [app/auth/login/page.tsx](file:///D:/Project/app/auth/login/page.tsx), [app/signup/page.tsx](file:///D:/Project/app/signup/page.tsx)
* **Root Cause:** Page headers are rendered inside `CardTitle` without an explicit `<h1>` tag, resulting in missing document heading hierarchies.
* **Remediation:** Wrap title text with `<h1>` with appropriate typography classes.

### UX-13: Missing Opponent Online Status Indicator
* **Severity:** **MINOR**
* **Location:** [app/dashboard/matches/PlayerMatchesClient.tsx](file:///D:/Project/app/dashboard/matches/PlayerMatchesClient.tsx)
* **Root Cause:** Opponents have avatar and WhatsApp contact info, but no heartbeat indicator showing if they are currently active on the platform.
