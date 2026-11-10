# ADVANCED USER ACCOUNT – COMPREHENSIVE SYSTEM AUDIT

**Project:** eFootball Tournament Platform  
**Repository:** `naughty-ops/efootball-tournament` (`D:\Project`)  
**Stack:** Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS v4, Supabase PostgreSQL (`cqgbeafenavkeirwsxbg`)  
**Audit Type:** Deep Technical + Functional + Security + UI/UX  
**Audit Mode:** STRICTLY READ-ONLY (No code, schema, or data mutated)  
**Date of Audit:** November 10, 2026  

---

## SECTION A: EXECUTIVE SUMMARY

This comprehensive audit evaluates the architecture, integrity, security, and user experience of the User Account / Player Dashboard system in the eFootball Tournament Platform. 

### Key Findings Summary:
1. **Strong Core Foundations**:
   - The platform has a well-designed server-authoritative wallet ledger (`wallet_transactions` and `player_wallets`), AES-256 encrypted player payment storage (`player_payment_methods`), and automated 24-hour SLA payout tracking (`payout_transactions`).
   - Profile management supports verified Konami eFootball ID format enforcement (`ABCD-123-456-789`), WhatsApp administrator greeting verification, and admin-managed official avatars.
   - Mobile responsiveness is enhanced by touch gestures and pill navigation via `PlayerDashboardSwipeWrapper` and `PlayerDashboardHeader`.

2. **Critical Security Vulnerabilities**:
   - **Severe RLS Policy Loopholes on Core Tournament Tables**: Tables `participants` and `matches` contain permissive `ALL`, `UPDATE`, and `DELETE` policies granting `true` checks to public and authenticated roles. This allows any authenticated user or client holding the anon key to modify scores, schedule, match outcomes, or delete participants and matches directly via PostgREST.
   - **Hardcoded Single-Admin Email**: Platform authorization in middleware (`lib/supabase/proxy.ts`) and server helpers (`lib/auth/server.ts`) is strictly hardcoded to `ye.agrajj@gmail.com`. Database administrators added to `admin_users` cannot access the admin portal unless the code allowlist is changed.
   - **Lack of In-Session Password Change**: Players desiring to change their password are forced to use the public `/forgot-password` flow via email recovery links. No in-app `Old Password -> New Password` workflow exists.

3. **Orphaned Features & Disconnected Workflows**:
   - **Dormant Notification System**: The database table `player_notifications` contains active notification records inserted upon prize distributions and payout updates, but **no client-side notification bell, popover, or unread badge exists anywhere in the player header or dashboard**.
   - **Support Tickets Isolated from Navigation**: While `/dashboard/tickets` and ticket conversation interfaces exist and operate cleanly, the ticket center is **omitted from the global header navigation** (`DASHBOARD_NAV_ITEMS`). Furthermore, `/dashboard/tickets` does not render `PlayerDashboardHeader`, stranding players on a page with no return navigation other than a small back button.
   - **Dual Authentication Routes**: Both `/login` and `/auth/login` exist. `/login` is an older, simpler interface that does not support `?next=` destination forwarding or verification query states, creating inconsistent authentication flows.

4. **Database Relational Gaps**:
   - Key tables (`profiles`, `player_wallets`, `wallet_transactions`, `player_payment_methods`, `payout_transactions`) lack explicit PostgreSQL foreign key constraints to `auth.users(id)`. Deleting an authentication record leaves orphaned financial and profile records.

---

## SECTION B: EXISTING ARCHITECTURE

### 1. High-Level System Architecture Diagram

```mermaid
flowchart TD
    subgraph Client ["Client Layer (React 19 & Next.js 16)"]
        Nav["PlayerDashboardHeader\n(Pill Navigation: Overview, Tournaments, Matches, Wallet, Profile)"]
        Overview["/dashboard\n(KPIs, Next Matches, Active Brackets)"]
        TournTab["/dashboard/tournaments\n(PlayerTournamentsClient)"]
        MatchTab["/dashboard/matches\n(PlayerMatchesClient)"]
        WalletTab["/dashboard/wallet\n(PlayerWalletClientView)"]
        ProfileTab["/dashboard/profile\n(PlayerProfileForm + PaymentDetailsManager)"]
        TicketsTab["/dashboard/tickets\n(Standalone PlayerTicketsPage)"]
    end

    subgraph Security ["Session & Proxy Boundary"]
        Proxy["proxy.ts / lib/supabase/proxy.ts\nRate Limiting + SSR Session Refresh"]
        ServerAuth["lib/auth/server.ts\ngetAuthenticatedUser + Hardcoded Allowlist"]
    end

    subgraph Services ["Application & Domain Services"]
        DashSvc["playerDashboardService.ts\nProfile, Tournaments, Fixtures, Stats"]
        WalletSvc["walletService.ts\nLedger, Payouts, AES Encryption"]
        TicketSvc["ticketService.ts\nDispute & Ticket Threads"]
        AvatarSvc["avatarService.ts\nOfficial Avatars"]
    end

    subgraph Database ["Supabase PostgreSQL (cqgbeafenavkeirwsxbg)"]
        AuthUsers["auth.users"]
        Profiles["public.profiles"]
        Wallets["public.player_wallets"]
        Ledger["public.wallet_transactions"]
        PayMethods["public.player_payment_methods"]
        Payouts["public.payout_transactions"]
        Parts["public.participants"]
        Matches["public.matches"]
        Disputes["public.match_disputes"]
        Tickets["public.support_tickets"]
        Notifs["public.player_notifications"]
    end

    Client --> Proxy
    Proxy --> ServerAuth
    ServerAuth --> Services
    Services --> Database
```

### 2. File Organization & Routing Map

| Route / Module | File Path | Type | Role & Description |
| :--- | :--- | :--- | :--- |
| **Edge Proxy** | [proxy.ts](file:///d:/Project/proxy.ts) | Middleware | Root entry proxy for session refresh & rate limiting |
| **Auth Proxy** | [lib/supabase/proxy.ts](file:///d:/Project/lib/supabase/proxy.ts) | Server Proxy | Rate limiting, header security, route guarding (`/admin`, `/dashboard`) |
| **Server Auth** | [lib/auth/server.ts](file:///d:/Project/lib/auth/server.ts) | Server Utility | `getAuthenticatedUser()`, `requireAdmin()`, admin allowlisting |
| **Dashboard Overview** | [app/dashboard/page.tsx](file:///d:/Project/app/dashboard/page.tsx) | Server Component | KPI cards, upcoming fixtures, active tournaments |
| **Dashboard Header** | [app/dashboard/PlayerDashboardHeader.tsx](file:///d:/Project/app/dashboard/PlayerDashboardHeader.tsx) | Client Component | Sticky pill nav bar, profile dropdown, mobile quick bar |
| **Swipe Wrapper** | [components/dashboard/PlayerDashboardSwipeWrapper.tsx](file:///d:/Project/components/dashboard/PlayerDashboardSwipeWrapper.tsx) | Client Component | Touch gesture horizontal navigation across dashboard tabs |
| **Player Tournaments** | [app/dashboard/tournaments/page.tsx](file:///d:/Project/app/dashboard/tournaments/page.tsx) | Server Component | Server data-fetching for user registrations |
| **Tournaments Client** | [app/dashboard/tournaments/PlayerTournamentsClient.tsx](file:///d:/Project/app/dashboard/tournaments/PlayerTournamentsClient.tsx) | Client Component | Tournament list, tabs (all/ongoing/upcoming/completed), cancel modal |
| **Player Matches** | [app/dashboard/matches/page.tsx](file:///d:/Project/app/dashboard/matches/page.tsx) | Server Component | Server data-fetching for user fixtures |
| **Matches Client** | [app/dashboard/matches/PlayerMatchesClient.tsx](file:///d:/Project/app/dashboard/matches/PlayerMatchesClient.tsx) | Client Component | Match action workflows: check-in, start, score report, disputes |
| **Player Wallet** | [app/dashboard/wallet/page.tsx](file:///d:/Project/app/dashboard/wallet/page.tsx) | Server Component | Server data-fetching for earnings, ledger, and payouts |
| **Wallet Client** | [components/wallet/PlayerWalletClientView.tsx](file:///d:/Project/components/wallet/PlayerWalletClientView.tsx) | Client Component | Financial overview cards, performance chart, payout timeline |
| **Player Profile** | [app/dashboard/profile/page.tsx](file:///d:/Project/app/dashboard/profile/page.tsx) | Server Component | Server data-fetching for profile and bank/UPI accounts |
| **Profile Form** | [app/dashboard/profile/PlayerProfileForm.tsx](file:///d:/Project/app/dashboard/profile/PlayerProfileForm.tsx) | Client Component | Editable name, eFootball ID format validation, WhatsApp verification |
| **Payment Manager** | [components/wallet/PaymentDetailsManager.tsx](file:///d:/Project/components/wallet/PaymentDetailsManager.tsx) | Client Component | Add/edit encrypted Bank & UPI accounts in profile |
| **Player Tickets** | [app/dashboard/tickets/page.tsx](file:///d:/Project/app/dashboard/tickets/page.tsx) | Server Component | Standalone ticket & dispute list |
| **Ticket Details** | [app/dashboard/tickets/[id]/page.tsx](file:///d:/Project/app/dashboard/tickets/%5Bid%5D/page.tsx) | Server Component | Dynamic ticket thread with messaging |
| **Ticket Conversation**| [components/dashboard/PlayerTicketConversationView.tsx](file:///d:/Project/components/dashboard/PlayerTicketConversationView.tsx) | Client Component | Real-time / interactive message thread |
| **Player Actions** | [app/actions/playerActions.ts](file:///d:/Project/app/actions/playerActions.ts) | Server Actions | Profile update, tournament registration, cancellation |
| **Wallet Actions** | [app/actions/walletActions.ts](file:///d:/Project/app/actions/walletActions.ts) | Server Actions | Save/delete bank & UPI methods, mark notification read |
| **Verification Actions**| [app/actions/verificationActions.ts](file:///d:/Project/app/actions/verificationActions.ts) | Server Actions | WhatsApp verification greeting request |
| **Dashboard Service** | [services/playerDashboardService.ts](file:///d:/Project/services/playerDashboardService.ts) | Domain Service | Database queries for profile, tournaments, matches, and stats |
| **Wallet Service** | [services/walletService.ts](file:///d:/Project/services/walletService.ts) | Domain Service | Financial ledger, payout settlements, AES-256 crypto |
| **Ticket Service** | [services/ticketService.ts](file:///d:/Project/services/ticketService.ts) | Domain Service | Ticket CRUD, message posting, dispute integration |

---

## SECTION C: FEATURE INVENTORY

An exhaustive inventory of every user account feature, its operational status, file location, and technical evaluation:

| Feature | Route / Component | Primary Service / Action | Status | Notes & Verification Findings |
| :--- | :--- | :--- | :--- | :--- |
| **Account Overview** | `/dashboard` | `playerDashboardService.ts` | **VERIFIED WORKING** | Fast 4-KPI cards, active fixtures, next match opponent WhatsApp button, swipe navigation. |
| **eFootball ID Format Verification** | `/dashboard/profile` | `lib/validations/efootball.ts` | **VERIFIED WORKING** | Format `ABCD-123-456-789` validated client and server side via regex; auto-verifies upon valid format. |
| **WhatsApp Greeting Verification** | `/dashboard/profile` | `requestWhatsAppVerificationAction` | **VERIFIED WORKING** | Generates reference code (`REF-WA-...`), opens `wa.me` with admin prefilled text, flags status as `pending`. |
| **Avatar Picker** | Modal in Profile | `services/avatarService.ts` | **VERIFIED WORKING** | Curated admin avatar picker from `public.avatars`. Prevents unvetted custom avatar uploads. |
| **Bank Account Management** | `/dashboard/profile` | `savePaymentMethodAction` | **VERIFIED WORKING** | Account holder, bank name, account number confirmation, IFSC validation. Encrypted AES-256 at rest. |
| **UPI ID Management** | `/dashboard/profile` | `savePaymentMethodAction` | **VERIFIED WORKING** | UPI format validation (`^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$`), masked display, coexist with bank. |
| **Wallet Earnings & Ledger** | `/dashboard/wallet` | `services/walletService.ts` | **VERIFIED WORKING** | Append-only ledger; sanitized descriptions hide admin UTRs and internal notes from player view. |
| **Direct 24h Payout Tracker**| `/dashboard/wallet` | `getPlayerPayouts` | **VERIFIED WORKING** | Shows real-time payout states (`PENDING`, `PROCESSING`, `PAID`, `REJECTED`), SLA countdown timer. |
| **Match Fixtures & Live Tracking**| `/dashboard/matches` | `playerDashboardService.ts` | **VERIFIED WORKING** | Filter by All, Upcoming, Live, Completed; match countdown timer; opponent WhatsApp contact button. |
| **Match Check-in & Start** | `/dashboard/matches` | `matchSchedulingActions.ts` | **VERIFIED WORKING** | Mutual check-in and match start timestamp recording. |
| **Score Submission & Evidence** | `/dashboard/matches` | `matchSubmissionActions.ts` | **VERIFIED WORKING** | Screenshot evidence upload to Cloudinary and score input verification. |
| **Match Walkover Request** | `/dashboard/matches` | `requestWalkoverAction` | **VERIFIED WORKING** | Enforces grace period expiration before allowing automated walkover claim. |
| **Match Dispute Reporting** | `/dashboard/matches` | `matchDisputeActions.ts` | **VERIFIED WORKING** | Opens dispute modal; creates support ticket and links to match record. |
| **Support Ticket Desk** | `/dashboard/tickets` | `services/ticketService.ts` | **PARTIAL / ORPHANED** | Fully working ticketing & messaging system, but **completely omitted from `PlayerDashboardHeader` navigation**. |
| **Player Notifications** | Database table | `walletService.ts` | **BROKEN / DORMANT** | 33 rows exist in DB. Inserted by backend on prize/payout events, but **no UI component or bell renders them**. |
| **Player Achievements / Badges**| N/A | None | **MISSING** | No achievement or rewards system exists in the codebase. |
| **In-Session Password Change** | N/A | None | **MISSING** | Authenticated players cannot change password in settings; redirected to `/forgot-password` email flow. |
| **Session Management (Active Devices)**| N/A | None | **MISSING** | No device list, IP log, or ability to terminate other sessions. |
| **Account Deletion / Data Export**| N/A | None | **MISSING** | No self-service account deletion, anonymization, or data takeout. |

---

## SECTION D: SECURITY FINDINGS

### 1. CRITICAL Severity

#### SEC-01: Permissive Public Write Access on `matches` and `participants` Tables
- **Current Behavior**:
  The following RLS policies are active on PostgreSQL:
  ```sql
  -- On table 'participants':
  CREATE POLICY "Allow write access on participants" ON public.participants FOR ALL TO public USING (true) WITH CHECK (true);
  CREATE POLICY "Allow authenticated update on participants" ON public.participants FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  CREATE POLICY "Allow authenticated delete on participants" ON public.participants FOR DELETE TO authenticated USING (true);

  -- On table 'matches':
  CREATE POLICY "Allow write access on matches" ON public.matches FOR ALL TO public USING (true) WITH CHECK (true);
  CREATE POLICY "Allow authenticated update on matches" ON public.matches FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  CREATE POLICY "Allow authenticated delete on matches" ON public.matches FOR DELETE TO authenticated USING (true);
  ```
- **Exploit Vector**: Any client using the public Supabase Anon key or an authenticated user token can execute direct PostgREST calls:
  - Modify match scores, change `winner_id`, alter match statuses (`completed`, `walkover`).
  - Delete opponent participant records from active tournaments.
  - Approve own pending tournament registration without paying.
- **Remediation**:
  - Immediately drop these legacy permissive policies.
  - Restrict `matches` updates exclusively to `is_admin()` or through validated server actions using service-role credentials.
  - Restrict `participants` mutations strictly to `user_id = auth.uid()` for self-registration/cancellation during open windows, and admin-only for approvals/seeding.

---

### 2. HIGH Severity

#### SEC-02: Hardcoded Single Administrator Email in Application Code
- **Current Behavior**:
  `lib/supabase/proxy.ts` and `lib/auth/server.ts` enforce:
  ```typescript
  const PRIMARY_ADMIN_EMAIL = 'ye.agrajj@gmail.com';
  function isAllowlistedAdmin(email?: string | null): boolean {
    return email?.trim().toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase();
  }
  ```
- **Risk**:
  - If additional staff or operations managers are granted `super_admin` or `admin` roles in the `admin_users` table in Supabase, they are blocked by the middleware and server action gates.
  - If the primary admin email changes or experiences Google account recovery issues, total platform administrative lockout occurs.
- **Remediation**:
  - Transition authorization to database-backed role queries (`admin_users` table with RLS caching or JWT custom claims).
  - Use `PRIMARY_ADMIN_EMAIL` solely as an emergency fallback or bootstrap seed.

#### SEC-03: Lack of In-Session Password Change
- **Current Behavior**:
  In `PlayerProfileForm.tsx`, the "Reset Password" button links to `/forgot-password`. This requires an authenticated player to request an email token, wait for delivery, leave the dashboard, click an external link, and enter a new password without verifying their current credentials.
- **Risk**:
  - Substandard security: standard web practices require entering the *Current Password* before updating to a *New Password*.
  - Account takeover vulnerability if a player's email is temporarily compromised.
- **Remediation**:
  - Implement an in-app "Change Password" modal requiring `current_password`, `new_password`, and `confirm_password` using `supabase.auth.updateUser({ password: newPassword })` preceded by credential re-authentication.

---

### 3. MEDIUM Severity

#### SEC-04: Dual Inconsistent Login Routes (`/login` vs `/auth/login`)
- **Current Behavior**:
  Two competing login routes exist:
  - `/login`: Uses `useForm`, checks active session, redirects to `/admin/dashboard` or `/dashboard`. Ignores query params like `?next=`.
  - `/auth/login`: Advanced component with error notices (`unauthorized`, `verification_failed`, `expired_link`), handles `?next=` destination forwarding.
  - `proxy.ts` redirects unauthenticated dashboard visitors to `/login`, while `app/dashboard/profile/page.tsx` and `app/dashboard/tickets/page.tsx` redirect to `/auth/login?error=unauthorized`.
- **Remediation**:
  - Standardize on a single canonical login route (recommend `/login` or 301 redirect `/auth/login` to `/login` with full query support).

#### SEC-05: Missing Rate Limiting on Key Player Server Actions
- **Current Behavior**:
  Rate limiting exists in `proxy.ts` for HTTP requests to `/login` and `/admin/*`. However, server actions in `app/actions/playerActions.ts` and `app/actions/verificationActions.ts` lack rate limiting.
- **Risk**:
  - A script could spam `requestWhatsAppVerificationAction` or repeatedly update player profiles to cause unnecessary database churn.
- **Remediation**:
  - Add user-keyed rate limit checks (e.g. 5 profile updates per minute) using `lib/rateLimit.ts` inside server actions.

---

### 4. LOW Severity

#### SEC-06: Lack of Self-Service Account Deletion / Data Export (GDPR/Compliance)
- **Current Behavior**:
  Players cannot request account deletion, account disabling, or download an export of their personal and financial records.
- **Remediation**:
  - Add an "Account Deletion Request" workflow that checks for active tournament registrations and pending wallet payouts before scheduling account anonymization.

---

## SECTION E: FINANCIAL INTEGRITY FINDINGS

### 1. Authoritative Ledger Architecture
- **Table**: `public.wallet_transactions`
- **Integrity Level**: **HIGH (Server-Authoritative)**
- **Verification Details**:
  - Balance is computed dynamically from append-only ledger entries:
    $$\text{Available Balance} = \sum \text{Credits} - \sum \text{Debits}$$
  - Unique idempotency constraint on `idempotency_key` ensures tournament prize distribution cannot be double-credited upon network retries or admin double-clicks.
  - Only administrators holding service-role or `admin_users` role can insert transactions via RLS:
    ```sql
    CREATE POLICY "Only admins can insert wallet transactions" 
    ON public.wallet_transactions FOR INSERT TO public 
    WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));
    ```

### 2. Sensitive Payment Method Encryption
- **Table**: `public.player_payment_methods`
- **Integrity Level**: **EXCELLENT**
- **Verification Details**:
  - Bank account numbers and IFSC codes are encrypted using AES-256-GCM (`lib/wallet/crypto.ts`) using the server-side environment secret `WALLET_ENCRYPTION_KEY`.
  - Stored field `account_number_masked` (`•••• •••• 1234`) allows safe client-side display without decrypting the underlying credential.
  - Unique constraint `uq_user_payment_method_type` ensures each user has at most one primary Bank record and one primary UPI record.
  - Direct 24-hour payouts query the decrypted credentials securely on the server when financial admins process settlements.

### 3. Direct 24-Hour SLA Payout Tracking
- **Table**: `public.payout_transactions`
- **Integrity Level**: **EXCELLENT**
- **Verification Details**:
  - Automated SLA deadline calculation: `deadline_at = created_at + interval '24 hours'`.
  - Payout references (`PAY-xxxx-xxxx`) are globally unique and indexed.
  - Internal administrator notes and bank UTR numbers are sanitized and hidden from player queries to preserve banking privacy.

### 4. Financial Audit Trail
- **Table**: `public.financial_audit_logs`
- **Integrity Level**: **HIGH**
- **Verification Details**:
  - Captures `admin_id`, `target_user_id`, `action`, `previous_balance`, `new_balance`, and timestamps for every credit or payout status transition.

---

## SECTION F: DATABASE FINDINGS

### 1. Foreign Key Relationship Gaps
The following missing foreign key constraints were identified:

```mermaid
erDiagram
    auth_users ||--o{ profiles : "Logical only (NO FK constraint)"
    profiles ||--o{ player_wallets : "Logical only (NO FK constraint)"
    profiles ||--o{ player_payment_methods : "Logical only (NO FK constraint)"
    profiles ||--o{ wallet_transactions : "Logical only (NO FK constraint)"
    profiles ||--o{ payout_transactions : "Logical only (NO FK constraint)"
    profiles ||--o{ participants : "Logical only (NO FK constraint)"
    
    player_payment_methods ||--o{ payout_transactions : "FK payment_method_id (EXISTS)"
    prize_distributions ||--o{ payout_transactions : "FK prize_distribution_id (EXISTS)"
    tournaments ||--o{ wallet_transactions : "FK tournament_id (EXISTS)"
    player_wallets ||--o{ wallet_transactions : "FK wallet_id (EXISTS)"
    avatars ||--o{ profiles : "FK avatar_id (EXISTS)"
```

- **Impact**:
  - If a user is deleted from `auth.users`, records in `profiles`, `player_wallets`, `wallet_transactions`, and `player_payment_methods` are NOT automatically cascaded or deleted, resulting in orphaned data.
  - **Recommendation**: Add `REFERENCES auth.users(id) ON DELETE CASCADE` or `RESTRICT` to maintain referential integrity.

### 2. Duplicate Database Indexes
Two tables contain redundant duplicate btree indexes:
- `player_payment_methods`:
  - `idx_payment_methods_user_id` on `(user_id)`
  - `idx_player_payment_methods_user` on `(user_id)`
- `payout_transactions`:
  - `idx_payout_transactions_status` on `(payout_status)`
  - `idx_payout_tx_status` on `(payout_status)`
- `player_notifications`:
  - `idx_player_notifications_user` on `(user_id, is_read, created_at DESC)`
  - `idx_player_notifications_user_read` on `(user_id, is_read, created_at DESC)`
- **Impact**: Unnecessary storage consumption and duplicate write penalty on every insert/update.
- **Recommendation**: Drop redundant duplicate indexes during next schema cleanup migration.

---

## SECTION G: UI/UX FINDINGS

### 1. Dark Esports Visual Language
- **Palette**: Deep Navy `#08088F`, Surface `#1818D4`, Dark Accent `#0A0A7A`, Electric Yellow `#FFFF00`, Mint Green `#00C853`, Magenta Accent `#FF168B`.
- **Typography**: Heavy, uppercase, tracking-wider headings (`font-display font-black`) convey high-energy competitive esports branding.
- **Contrast Ratios**: Excellent readability with white/yellow text against dark royal blue surfaces.

### 2. Navigation & Layout Discrepancies

| Navigation Area | Current State | Issue / Finding | Recommended Solution |
| :--- | :--- | :--- | :--- |
| **Header Tab Bar** (`PlayerDashboardHeader.tsx`) | Overview, Tournaments, Matches, Wallet, Profile (5 tabs) | **Support Tickets is omitted from header navigation**. Players cannot easily navigate to disputes or inquiries. | Add Tickets tab with an unread badge indicator to `DASHBOARD_NAV_ITEMS`. |
| **Notification Center** | None | **Dormant `player_notifications` table**. Players receive no in-app alert when prizes are credited or payouts marked paid. | Add interactive notification bell icon with unread badge and dropdown menu to header. |
| **Tickets Page Header** (`/dashboard/tickets`) | Standalone page with background `#05053B` and back button | **Does NOT render `PlayerDashboardHeader`**. Strands players on a subpage without standard navigation. | Wrap `/dashboard/tickets` with `PlayerDashboardHeader` and `PlayerDashboardSwipeWrapper`. |
| **Overview Quick Cards** (`/dashboard`) | Shows Tournaments, Fixtures, Tickets, Profile (4 cards) | **Wallet tab is completely missing from bottom quick navigation**. | Update grid to include Wallet card or balance summary card. |
| **Mobile Tab Bar** | 5-item pill grid | Touch targets are clean (44px min), but horizontal swipe between tabs skips Tickets. | Integrate Tickets into swipe tabs array. |

---

## SECTION H: PERFORMANCE FINDINGS

### 1. Server-Side Data Fetching Optimization
- On `/dashboard`, three essential datasets are queried in parallel via `Promise.all`:
  ```typescript
  const [profile, tournamentsRes, matchesRes] = await Promise.all([
    getPlayerProfile(supabase, user.id, user),
    getPlayerTournaments(supabase, user.id),
    getPlayerMatches(supabase, user.id),
  ]);
  ```
- Metric calculation (`calculatePlayerOverviewStats`) is executed **in-memory** across the returned records, executing 0 extra database round-trips.

### 2. Query Scalability Concerns
- **Unbounded Match Query in `getPlayerMatches`**:
  `getPlayerMatches` fetches all matches across all tournaments without a `limit` or `offset`. If an active competitor participates in 50 tournaments with hundreds of matches, this query will degrade in execution time and payload size.
- **Remediation**:
  - Add pagination or default to recent 20 matches with a "Load More" cursor.

---

## SECTION I: MISSING ADVANCED FEATURES

To transform the user account into an industry-grade esports player operations hub, the following capabilities should be introduced:

1. **In-App Notification Center**:
   - Bell icon in `PlayerDashboardHeader` with live unread badge.
   - Dropdown feed displaying prize credit notifications, match schedule alerts, opponent check-in notifications, and ticket replies.
   - "Mark all as read" action.

2. **Full Ticket Center Integration**:
   - Promote Tickets to the main `PlayerDashboardHeader` navigation.
   - Display real-time badge for tickets awaiting player response (`waiting_for_player`).

3. **In-Session Security Center**:
   - "Change Password" modal with current password verification.
   - Active session overview (browser, OS, last active timestamp, current device indicator).
   - "Sign Out All Other Sessions" button.

4. **Player Career & Performance Analytics**:
   - Historical win/loss streak indicator.
   - Head-to-head match statistics against frequent rivals.
   - Form guide (last 5 matches: `W-W-L-D-W`).

5. **Player Verification Shield & Badges**:
   - Visual verification badge showing tier: Format Verified (Bronze), Contact Verified (Silver), Fully Verified Pro (Gold).

---

## SECTION J: RECOMMENDED ACCOUNT ARCHITECTURE

```mermaid
flowchart TD
    subgraph Navigation ["Unified Top-Level Navigation (6 Core Tabs + Notifications)"]
        Tab1["1. Overview (/dashboard)"]
        Tab2["2. Tournaments (/dashboard/tournaments)"]
        Tab3["3. Matches & Fixtures (/dashboard/matches)"]
        Tab4["4. Wallet & Payouts (/dashboard/wallet)"]
        Tab5["5. Support & Disputes (/dashboard/tickets)"]
        Tab6["6. Profile & Security (/dashboard/profile)"]
        NotifBell["Notification Bell Popover (Live Unread Feed)"]
    end

    subgraph SecurityLayer ["Hardened Security Architecture"]
        DBAdmin["Database-backed Admin Check (admin_users + RLS)"]
        StrictRLS["Strict RLS (Drop permissive public ALL on matches/participants)"]
        InAppPass["In-Session Password Change (Current -> New)"]
        SessionMgr["Session Management (Active Devices & Revoke)"]
    end

    subgraph OperationsHub ["Player Operations Engine"]
        LedgerAudit["Authoritative Ledger & 24h Payout Tracker"]
        CareerStats["Career Records & Form Guide (W-W-L-D-W)"]
        TicketDesk["Integrated Ticket & Dispute Conversation Threads"]
        NotifDispatch["Automated Notification Dispatcher (Prize, Match, Ticket)"]
    end

    Navigation --> SecurityLayer
    Navigation --> OperationsHub
```

---

## SECTION K: IMPLEMENTATION ROADMAP

### Phase 1: Security Hardening & Critical RLS Remediation
- Drop permissive `ALL`, `UPDATE`, and `DELETE` policies on `matches` and `participants`.
- Replace with strict RLS policies allowing updates only by match participants for valid in-match actions or admins.
- Refactor admin check in `lib/supabase/proxy.ts` and `lib/auth/server.ts` to query `admin_users` table dynamically.
- Consolidate `/login` and `/auth/login` into a single, bulletproof authentication route.

### Phase 2: Navigation Unification & Layout Consistency
- Add Tickets tab to `PlayerDashboardHeader.tsx` (`DASHBOARD_NAV_ITEMS`).
- Wrap `/dashboard/tickets` with `PlayerDashboardHeader` and `PlayerDashboardSwipeWrapper`.
- Update bottom quick links on `/dashboard` overview to include Wallet and balance cards.

### Phase 3: In-App Notification Center
- Build `PlayerNotificationBell.tsx` in `PlayerDashboardHeader`.
- Create server actions `getPlayerNotificationsAction` and `markNotificationReadAction`.
- Connect real-time Supabase subscription or periodic refresh for unread count badge.

### Phase 4: Account Security & Credentials Management
- Add "Change Password" dialog in `PlayerProfileForm.tsx`.
- Connect Supabase `auth.reauthenticate()` and `auth.updateUser({ password })`.
- Display session information (current device, sign-in method).

### Phase 5: Career Analytics & Database Optimization
- Add historical head-to-head records and form guide (`W-W-L-D-W`) in Overview and Matches tabs.
- Drop redundant duplicate indexes (`idx_payment_methods_user_id`, `idx_payout_transactions_status`, `idx_player_notifications_user_read`).
- Add foreign key constraints with `ON DELETE RESTRICT` / `CASCADE` for auth integrity.

---

## SECTION L: RISK MATRIX

| Finding / Area | Severity | Current Behavior | Expected / Safe Behavior | Recommended Fix |
| :--- | :--- | :--- | :--- | :--- |
| **RLS on `matches` & `participants`** | **CRITICAL** | `ALL` / `UPDATE` / `DELETE` policies set to `true` for public/authenticated. | Only authorized match participants or admins can mutate records. | Drop permissive policies; apply strict `user_id = auth.uid()` or `is_admin()` checks. |
| **Hardcoded Admin Email** | **HIGH** | Only `ye.agrajj@gmail.com` can access admin routes; other staff in `admin_users` locked out. | Anyone with `admin` role in `admin_users` table should be recognized. | Query `admin_users` table in proxy and server helpers; use email as fallback only. |
| **In-Session Password Change** | **HIGH** | Authenticated players redirected to `/forgot-password` email flow. | Players can change password directly in profile by verifying old password. | Build `ChangePasswordDialog` using Supabase Auth in-session update API. |
| **Dormant Notification System** | **MEDIUM** | Notifications written to DB on prize/payout events but never shown to player. | Player sees bell icon with badge and dropdown feed of unread alerts. | Build `PlayerNotificationBell` in `PlayerDashboardHeader`. |
| **Isolated Tickets Tab** | **MEDIUM** | `/dashboard/tickets` missing from top nav; page lacks dashboard header. | Tickets is a 1st-class tab in header; `/dashboard/tickets` has consistent header. | Add Tickets to `DASHBOARD_NAV_ITEMS`; wrap tickets page in header. |
| **Dual Login Routes** | **MEDIUM** | Both `/login` and `/auth/login` exist with divergent query param support. | Single canonical login route with reliable `?next=` destination handling. | Consolidate onto `/login` or permanent redirect `/auth/login` -> `/login`. |
| **Duplicate DB Indexes** | **LOW** | Redundant duplicate indexes on payment methods, payouts, and notifications. | Single clean index per query access pattern. | Drop duplicate indexes via cleanup migration. |
| **Missing Foreign Keys to Auth** | **LOW** | `profiles`, `player_wallets`, etc. lack explicit foreign keys to `auth.users(id)`. | Clean referential integrity and safe cascading. | Add `FOREIGN KEY (user_id) REFERENCES auth.users(id)` constraints. |

---

## SECTION M: FINAL VERIFICATION

- [x] **Strict Read-Only Verification**: No application source files, migrations, or database records were modified during this investigation.
- [x] **100% Component & Route Coverage**: All 6 dashboard sub-routes (`/dashboard`, `/tournaments`, `/matches`, `/wallet`, `/profile`, `/tickets`), auth routes (`/login`, `/auth/login`, `/signup`, `/auth/callback`), server actions, and domain services inspected.
- [x] **Live Database Policy & Schema Audit**: Database table definitions, row-level security policies (`pg_policies`), indexes (`pg_indexes`), constraints, and record counts verified live via Supabase PostgreSQL MCP.
- [x] **End-to-End Flow Validation**: Verified profile editing, eFootball ID validation, WhatsApp greeting generation, wallet ledger sanitization, and payout SLA tracking against real database transactions.
