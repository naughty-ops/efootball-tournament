# PHASE 0 — BASELINE VERIFICATION REPORT
## Advanced Player Account & Professional Dashboard

**Repository:** `naughty-ops/efootball-tournament` (`D:\Project`)  
**Production:** `https://efootball-tournament-cyan.vercel.app`  
**Execution Date:** November 10, 2026  
**Status:** Baseline Verified (Strictly Read-Only Phase 0)  

---

### 1. Executive Baseline Summary

Before modifying any source code or database structures, an exhaustive baseline audit was conducted across the current workspace, active git branch, routes, server actions, and live Supabase PostgreSQL database (`cqgbeafenavkeirwsxbg`).

The platform has established production-ready modules (authoritative append-only wallet ledger, AES-256 encrypted payment storage, match scheduling & result reporting, WhatsApp administrator greeting verification, and administrative ticket operations). However, player account operations are fragmented across disparate sub-pages with orphaned features (dormant notifications, disconnected support tickets, missing in-session password updates, and permissive RLS policies on `matches` and `participants`).

---

### 2. Git & Working Tree Verification

- **Branch:** `master` (Up to date with `origin/master`)
- **Unstaged Modified Files:**
  - `app/actions/matchSchedulingActions.ts`: Champion & runner-up assignment persistence on final match result verification.
  - `app/dashboard/PlayerDashboardHeader.tsx`: Wallet tab added to pill navigation and profile dropdown.
  - `app/dashboard/profile/page.tsx`: Integrated `PaymentDetailsManager` into player profile.
  - `components/admin/AdminSidebar.tsx`: Prize Payouts desk navigation link.
  - `components/dashboard/PlayerDashboardSwipeWrapper.tsx`: Added `/dashboard/wallet` to horizontal swipe route sequence.
  - `lib/auth/server.ts`: Added `requireFinancialAdmin` helper.
  - `services/tournamentService.ts`: Recorded `runner_up_id` on tournament completion.
- **Untracked Additions:**
  - `ADVANCED_USER_ACCOUNT_AUDIT.md` (Read-only audit document)
  - `app/actions/walletActions.ts` (Bank/UPI payment methods management)
  - `app/admin/payouts/` & `components/admin/payouts/` (Admin payout queue & settlement)
  - `app/dashboard/wallet/` & `components/wallet/` (Player earnings, ledger, payout tracking)
  - `lib/wallet/` (AES-256-GCM encryption/decryption)
  - `services/walletService.ts` (Authoritative ledger & SLA payout service)
  - `supabase/migrations/20261110000000_create_advanced_player_wallet_system.sql`
  - `supabase/migrations/20261110000001_upgrade_player_wallet_and_payout_sla.sql`
  - `types/wallet.ts` (Financial ledger & payout transaction types)

---

### 3. Route & Component Architecture Topology

```
User Account Information Architecture (Current vs Target)

Current:
/dashboard                      -> Overview (KPI cards, active fixtures, joined tourneys)
/dashboard/tournaments          -> My Tournaments (All/Ongoing/Upcoming/Completed)
/dashboard/matches              -> My Matches (All/Upcoming/Live/Completed)
/dashboard/wallet               -> Wallet (Earnings, Payout SLA tracker, Ledger)
/dashboard/profile              -> Profile (In-game ID, WhatsApp greeting, Bank/UPI)
/dashboard/tickets              -> [ORPHANED] (Missing from header nav, lacks dashboard layout)
[Notifications]                 -> [DORMANT] (No UI bell or list; 33 DB records unread)

Target (6 Unified Sections):
1. /dashboard                   -> Overview (Identity, Verified stats, Next match, Quick actions)
2. /dashboard/tournaments       -> Competition (Tournaments & Matches unified hub)
   /dashboard/matches
3. /dashboard/wallet            -> Wallet (Earnings, Transaction history, 24h Payouts)
4. /dashboard/career            -> Career (Stats, analytics, achievements, streaks, form guide)
5. /dashboard/notifications     -> Notification Center (Interactive header bell + dedicated feed)
6. /dashboard/settings          -> Settings (Profile, Verification, Bank/UPI, Security, Legal, Contact)
   /terms                       -> Terms & Conditions (Versioned, acceptance tracking)
   /privacy                     -> Privacy Policy (Verified data practices)
```

---

### 4. Database Schema & RLS Policy Baseline

| Table Name | RLS Status | Verified Policy Condition | Vulnerability / Finding |
| :--- | :--- | :--- | :--- |
| `public.matches` | Enabled | `Allow write access on matches` (`ALL TO public USING (true)`) | **CRITICAL:** Allows public/authenticated write to match scores & status |
| `public.participants` | Enabled | `Allow write access on participants` (`ALL TO public USING (true)`) | **CRITICAL:** Allows public/authenticated mutations to tournament slots |
| `public.admin_users` | Enabled | `id = auth.uid()` | Verified table with `super_admin`, `admin`, `moderator`, `streamer` roles |
| `public.player_wallets` | Enabled | Select: `auth.uid() = user_id OR is_admin()`, Update: `is_admin()` | **SECURE:** Authoritative server ledger |
| `public.wallet_transactions`| Enabled | Insert: `is_admin()`, Select: `auth.uid() = user_id OR is_admin()` | **SECURE:** Append-only server ledger |
| `public.payout_transactions`| Enabled | Update: `is_admin()`, Insert: `auth.uid() = player_id OR is_admin()` | **SECURE:** SLA deadline & state tracking |
| `public.player_payment_methods`| Enabled | Owner check `auth.uid() = user_id` for CRUD | **SECURE:** AES-256 encrypted fields |
| `public.player_notifications` | Enabled | Select/Update: `auth.uid() = user_id` | **SECURE (Backend):** Missing frontend consumer |
| `public.support_tickets` | Enabled | Select/Update: `user_id = auth.uid() OR is_admin()` | **SECURE:** Support desk ownership |
| `public.terms_versions` | **NOT CREATED** | N/A | Needs creation for Phase 8 |
| `public.terms_acceptances` | **NOT CREATED**| N/A | Needs creation for Phase 8 |
| `public.achievements` | **NOT CREATED** | N/A | Needs creation for Phase 6 |
| `public.player_achievements`| **NOT CREATED**| N/A | Needs creation for Phase 6 |

---

### 5. Execution Phasing Plan

1. **PHASE 1 — Security Hardening:**
   - Drop permissive policies on `matches` and `participants`.
   - Implement database-backed admin role authorization (`super_admin > admin > moderator > streamer`).
   - Remove hardcoded `PRIMARY_ADMIN_EMAIL` locks; use `admin_users` table queries with cache.
2. **PHASE 2 — Account Architecture & Unified Layout:**
   - Update `PlayerDashboardHeader.tsx` to support 6 core sections: Overview, Competition, Wallet, Career, Notifications, Settings.
   - Embed notification bell with live unread badge.
   - Dark esports visual styling (deep navy/black `#08088F`, `#05053B`, yellow `#FFFF00`, mint green `#00C853`).
3. **PHASE 3 — Profile & Settings Center:**
   - Build grouped settings: Personal Info, Player Verification, Payment Details, Security (in-session password update), Support, Contact Admin, Legal.
4. **PHASE 4 — Wallet & Manual Payout Tracking:**
   - Polish earnings summary, transaction history filter, payout timeline with sanitized references.
5. **PHASE 5 — Competition Center:**
   - Unified tab experience between My Tournaments and My Matches.
   - Protect screenshot evidence until dispute or verification requires it.
6. **PHASE 6 — Player Career & Achievements:**
   - Database migration for `achievements` and `player_achievements`.
   - Verified career statistics, head-to-head records, form guide (`W-W-L-D-W`), streak tracking.
7. **PHASE 7 — Notification Center & Support Integration:**
   - Notification bell dropdown, unread count badge, mark-all-read action, dedicated `/dashboard/notifications` feed.
   - Fully integrate `/dashboard/tickets` with global navigation.
8. **PHASE 8 — Terms & Conditions and Privacy Policy:**
   - Database migration for `terms_versions` and `terms_acceptances`.
   - Public pages `/terms` and `/privacy`.
   - Versioned acceptance tracker during registration and settings.
9. **PHASE 9 — Performance & Polish:**
   - Query pagination, eliminate duplicate indexes, mobile touch optimization, loading skeletons.
10. **PHASE 10 — Final Regression Testing:**
    - Comprehensive test suite covering guest, unverified, verified, admin, and financial workflows.
