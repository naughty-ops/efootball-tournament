# PHASE 2 — ACCOUNT ARCHITECTURE & UNIFIED LAYOUT REPORT
## 6-Section Information Architecture & Navigation

**Repository:** `naughty-ops/efootball-tournament` (`D:\Project`)  
**Status:** Completed & Verified  
**Date:** November 10, 2026  

---

### 1. Unified Information Architecture

The player dashboard navigation has been refactored from disparate tabs into the 6 primary core sections specified in the design framework:

1. **Overview (`/dashboard`)**: Identity banner, verified performance KPIs, upcoming fixtures, active tournament brackets, quick actions.
2. **Competition (`/dashboard/tournaments` & `/dashboard/matches`)**: Unified competition management spanning registered leagues, live matches, matchday actions, and disputes.
3. **Wallet (`/dashboard/wallet`)**: Authoritative append-only earnings ledger, performance charts, and 24-hour manual payout tracker.
4. **Career (`/dashboard/career`)**: Verified career records, head-to-head opponent statistics, win/loss streak analytics, and achievements.
5. **Notifications (`/dashboard/notifications`)**: Interactive notification center with real-time unread badge counter in header.
6. **Settings (`/dashboard/settings`)**: Grouped account settings: personal info, official avatars, eFootball ID verification, payment details (Bank & UPI), security (in-session password changes), support, and Contact Admin.

---

### 2. Navigation Architecture Upgraded

**File Updated:** [`app/dashboard/PlayerDashboardHeader.tsx`](file:///d:/Project/app/dashboard/PlayerDashboardHeader.tsx)

- **Central Pill Nav Bar:**
  - Expanded to 6 items: Overview, Competition, Wallet, Career, Alerts, Settings.
  - Active tab indicators automatically handle path variations (e.g. `Competition` is active on both `/dashboard/tournaments` and `/dashboard/matches`; `Settings` is active on both `/dashboard/settings` and `/dashboard/profile`).
  - Pulsing notification badge on Alerts tab when unread items exist.
- **Mobile Quick Bar (< xl):**
  - Brand logo with transparent badge.
  - Explore Tournaments quick button.
  - Notification Bell with live unread badge (`#FF168B` pulsing indicator).
  - Player avatar with dropdown trigger.
- **Desktop Toolbar (xl+):**
  - Dedicated Notification Bell with animated unread badge.
  - Explore Tournaments pill button.
  - Competitor badge with dropdown popover.
- **Interactive Dropdown Popover:**
  - Links to all 6 core sections plus direct access to Support Desk & Disputes (`/dashboard/tickets`).
  - Sign-out button with loading state.

---

### 3. Swipe Gesture Transition Sequence

**File Updated:** [`components/dashboard/PlayerDashboardSwipeWrapper.tsx`](file:///d:/Project/components/dashboard/PlayerDashboardSwipeWrapper.tsx)

Sequential swipe sequence:
```typescript
const DASHBOARD_ROUTES = [
  '/dashboard',
  '/dashboard/tournaments',
  '/dashboard/matches',
  '/dashboard/wallet',
  '/dashboard/career',
  '/dashboard/notifications',
  '/dashboard/settings',
];
```
- Smooth horizontal swipe gesture transitions between adjacent sections.
- Automatic route prefetching for adjacent views.
- Normalized path mapping for legacy routes (`/dashboard/profile` $\rightarrow$ `/dashboard/settings`).

---

### 4. Verification & Testing

- `npx tsc --noEmit`: Exited with code `0` (Zero compilation errors).
- Clean responsive layout across desktop, tablet, and mobile viewports.
