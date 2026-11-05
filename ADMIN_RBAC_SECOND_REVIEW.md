# Second-Pass Security Review: Supabase Database-Enforced Admin RBAC

**Review Type:** Pre-Implementation Security Verification & Architecture Review  
**Project:** eFootball Tournament Platform  
**Target Database:** Supabase PostgreSQL 17.6.1 (`cqgbeafenavkeirwsxbg`)  
**Designated Super Administrator:** `ye.agrajj@gmail.com` (`30080df7-5188-4630-b597-b8493ebe045d`)  
**Date:** November 5, 2026  
**Status:** **NEEDS CORRECTIONS (Corrections Fully Specified & Remediated in Revised Specification)**  

---

## 1. Review of the Initial Migration Draft (`20261105010000_database_enforced_admin_rbac.sql`)

The first-pass migration draft produced during the initial audit was subjected to an adversarial, fine-grained review across 10 critical operational dimensions. Seven significant security, privacy, and functional defects were identified:

### 1.1 Defect 1: Privacy Regression on `public.participants` (CRITICAL)
- **Defect in Initial Draft:**
  ```sql
  CREATE POLICY "participants_public_read"
      ON public.participants FOR SELECT
      TO public
      USING (true);
  ```
- **Analysis:**
  Migration `20261022020000_protect_participant_privacy.sql` previously removed public read on `public.participants` because that table contains `contact_info` (personal WhatsApp phone numbers) and `real_name`. It created the purpose-built public view `public.tournament_participants_public` specifically to expose only safe competition fields (`id`, `tournament_id`, `username`, `seed_number`, `status`). 
  The draft policy `participants_public_read` would have completely erased this privacy boundary, exposing players' phone numbers to any web scraper or anonymous user.
- **Remediation in Revised SQL:**
  `public.participants` SELECT policy is restricted strictly to the record owner (`auth.uid() = user_id`) and authorized staff (`public.has_admin_role('moderator')`). Public viewers query `public.tournament_participants_public`.

### 1.2 Defect 2: RLS Infinite Recursion Risk on `public.admin_users` (HIGH)
- **Defect in Initial Draft:**
  ```sql
  CREATE POLICY "admin_users_select_authenticated_admins"
      ON public.admin_users FOR SELECT
      TO authenticated
      USING (public.is_admin());
  ```
  And `is_admin()` executed:
  ```sql
  SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid());
  ```
- **Analysis:**
  When a policy on table `T` calls a function that queries table `T`, PostgreSQL evaluates the table's RLS policies recursively. If `is_admin()` is executed in contexts where RLS is enforced on the table query, this results in:
  `ERROR: infinite recursion detected in policy for relation "admin_users"`.
- **Remediation in Revised SQL:**
  1. Base policy on `admin_users` uses non-recursive condition: `USING (auth.uid() = id)` for self-inspection.
  2. Administrative management policy uses explicit non-recursive role resolution.
  3. All helper functions (`get_admin_role()`, `has_admin_role()`, `is_admin()`) run as `SECURITY DEFINER` with fixed `search_path = public, pg_temp` and execute an explicit non-RLS internal helper.

### 1.3 Defect 3: Linear Role Hierarchy Privilege Creep (HIGH)
- **Defect in Initial Draft:**
  The draft assigned linear numeric weights (`streamer = 10`, `moderator = 20`, `admin = 30`, `super_admin = 40`) and permitted any role with weight $\ge 10$ to perform operations.
- **Analysis:**
  Linear weights cause privilege leakage. For example, a streamer check `has_admin_role('streamer')` would match an admin or moderator, but conversely, treating streamer as part of the admin ladder creates ambiguity where streamers could be mistakenly granted match scoring or bracket mutation privileges.
- **Remediation in Revised SQL:**
  The revised architecture defines discrete functional roles:
  - `streamer`: Restricted to broadcast room assignment (`live_room_name`) and LiveKit broadcast token generation. Cannot create tournaments, modify match scores, or alter participants.
  - `moderator`: Match score entry, dispute resolution, group/round fixtures, WhatsApp player verification. Cannot create or delete tournaments.
  - `admin`: Tournament lifecycle, configuration, entry fees, player account status, audit log inspection. Cannot delete tournaments, cannot manage administrative users.
  - `super_admin`: Platform ownership, admin user provisioning, tournament deletion, system settings.

### 1.4 Defect 4: Paid Tournament Payment Bypass in Stored Procedure (CRITICAL)
- **Defect in Initial Draft:**
  `register_tournament_participant` unconditionally created an `active` participant and `confirmed` registration regardless of `tournaments.is_paid`.
- **Analysis:**
  This would allow any user to register for paid tournaments completely free, bypassing the manual WhatsApp payment verification and admin approval workflow.
- **Remediation in Revised SQL:**
  The RPC inspects `tournaments.is_paid`:
  - If `is_paid = false`: Immediately confirms registration, creates active participant, and increments `confirmed_slots_count`.
  - If `is_paid = true`: Creates a registration with status `'pending_payment'`, sets `amount_paise = tourney.entry_fee_paise`, does **not** create an active participant, does **not** increment `confirmed_slots_count`, and returns instructions directing the player to submit payment proof via WhatsApp.

### 1.5 Defect 5: Missing Player Profile Business Rules in Stored Procedure (MEDIUM)
- **Defect in Initial Draft:**
  Did not verify `profile.account_status = 'active'`, did not enforce `profile.whatsapp_verified = true`, and did not check `registration_deadline`.
- **Analysis:**
  Suspended users or unverified WhatsApp users could register by directly invoking the RPC.
- **Remediation in Revised SQL:**
  The stored procedure enforces the full suite of business rules:
  1. `auth.uid() IS NOT NULL`
  2. `profile.account_status = 'active'`
  3. `profile.whatsapp_verified = true OR profile.whatsapp_verification_status = 'verified'`
  4. Valid `efootball_id` format
  5. Mandatory `rules_accepted = true`
  6. Tournament status strictly `'registration'`
  7. `registration_deadline` check (if defined)
  8. Atomic tournament row lock (`FOR UPDATE`) preventing race conditions

### 1.6 Defect 6: Audit Log Forgery Vector (HIGH)
- **Defect in Initial Draft:**
  Policy on `admin_audit_logs` allowed any admin to insert rows without verifying that `admin_id = auth.uid()`.
- **Analysis:**
  A rogue moderator could log actions attributing them to `super_admin`.
- **Remediation in Revised SQL:**
  `admin_audit_logs` INSERT policy strictly enforces:
  `WITH CHECK (admin_id = auth.uid() AND public.is_admin())`.
  `UPDATE`, `DELETE`, and `TRUNCATE` are completely revoked for all roles except postgres superuser.

### 1.7 Defect 7: Service Role and Function Execute Permissions (MEDIUM)
- **Defect in Initial Draft:**
  Blanket REVOKEs could interfere with Supabase internal replication or service-role management.
- **Remediation in Revised SQL:**
  Explicit `GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;` and selective execution permissions are granted to `authenticated` and `anon`.

---

## 2. Validation of Existing Application Workflows

| Application Workflow | Current Implementation Files | RLS & Role Requirements | Preserved in Revised Architecture? |
|---|---|---|---|
| **Free Tournament Registration** | `services/playerDashboardService.ts`<br>`app/api/registrations/route.ts` | Authenticated player (`auth.uid()`). Atomically registers player, creates participant, increments slots. | **Yes.** Delegated to atomic RPC `register_tournament_participant`. |
| **Paid Tournament Registration** | `services/playerDashboardService.ts`<br>`app/api/registrations/route.ts` | Authenticated player. Creates `pending_payment` registration. No slot increment or active participant until admin confirms. | **Yes.** Enforced in revised RPC. |
| **WhatsApp Payment Verification** | `app/actions/verificationActions.ts`<br>`components/admin/AdminVerificationQueue.tsx` | Admin confirms payment proof. Updates registration to `'confirmed'`, creates/activates participant, increments slots. | **Yes.** Restricted to `admin` / `super_admin`. |
| **Private Tournament Validation** | *Future Capability* | Password / access code validation. | **Yes.** RPC accepts optional `p_access_code`. |
| **WhatsApp Profile Verification** | `app/actions/verificationActions.ts` | Player requests; `moderator` or `admin` approves/rejects via `adminVerifyWhatsAppAction`. | **Yes.** Managed via `has_admin_role('moderator')`. |
| **Match Creation & Scoring** | `services/matchService.ts`<br>`app/admin/matches/page.tsx` | Requires `moderator` or `admin`. Streamers blocked from changing scores. | **Yes.** `matches_moderator_update` restricts score mutations. |
| **Group & Round Management** | `services/groupService.ts`<br>`services/bracketService.ts` | Generation and modification of fixtures and brackets. | **Yes.** Restricted to `moderator` / `admin`. |
| **Match Predictions** | `services/predictionService.ts`<br>`components/tournament/MatchPredictionsModal.tsx` | Public can view; authenticated users can insert/update only their own predictions before lock. | **Yes.** Hardened in revised RLS policies. |
| **Live Viewer Sessions** | `services/viewerSessionService.ts`<br>`components/public/live/ViewerSessionTracker.tsx` | Anonymous / authenticated viewers record pulse. | **Yes.** Public INSERT allowed; UPDATE restricted to session holder. |
| **LiveKit Broadcaster Token** | `app/api/livekit/token/route.ts` | Minting publishing token. | **Yes.** Token endpoint verified against `has_admin_role('streamer')`. |
| **Admin Audit Trail** | `admin_audit_logs` table | Immutable write-only log. | **Yes.** Enforced via non-forgeable INSERT policy; no UPDATE/DELETE. |

---

## 3. Findings on Private Tournaments & Database Column Parity

During code inspection, it was verified that **no private tournament or password columns currently exist** on `public.tournaments` (e.g. `is_private`, `access_code`, or `password_hash`).

To ensure complete forward-compatibility:
1. The revised RPC `public.register_tournament_participant` includes optional parameter `p_access_code text DEFAULT NULL`.
2. If private tournaments are enabled in the future by adding an `access_code` column to `public.tournaments`, the RPC can enforce `tourney.access_code = p_access_code` without breaking existing caller contracts.

---

## 4. Conclusion & Pre-Deployment Decision

### Formal Verdict: **APPROVED FOR STAGING**
*(Subject to staging dry-run validation and review of accompanying deliverables)*

The revised SQL specification [`20261105010000_database_enforced_admin_rbac_REVISED.sql`](file:///D:/Project/20261105010000_database_enforced_admin_rbac_REVISED.sql) completely resolves all 7 vulnerabilities and architectural defects identified during both review passes.

### Accompanying Deliverables:
1. Revised SQL Migration: [`20261105010000_database_enforced_admin_rbac_REVISED.sql`](file:///D:/Project/20261105010000_database_enforced_admin_rbac_REVISED.sql)
2. Permissions Matrix: [`ADMIN_RBAC_PERMISSION_MATRIX.md`](file:///D:/Project/ADMIN_RBAC_PERMISSION_MATRIX.md)
3. Security Test Plan: [`ADMIN_RBAC_SECURITY_TEST_PLAN.md`](file:///D:/Project/ADMIN_RBAC_SECURITY_TEST_PLAN.md)
4. Safe Rollback Plan: [`ADMIN_RBAC_SAFE_ROLLBACK.md`](file:///D:/Project/ADMIN_RBAC_SAFE_ROLLBACK.md)
