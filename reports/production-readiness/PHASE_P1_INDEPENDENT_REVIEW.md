# PHASE P1 INDEPENDENT DATABASE AUDIT & SECURITY REVIEW
**eFootball Tournament Platform**  
**Role:** Independent Principal PostgreSQL Security Auditor & Supabase Production Database Reviewer  
**Date:** November 11, 2026  
**Target Environment:** Supabase PostgreSQL 17 (`cqgbeafenavkeirwsxbg`, AWS region `ap-northeast-2`)  
**Audit Scope:** 5 Authored Phase P1 Migrations (`20261111000001` through `20261111000005`), PostgreSQL System Catalogs, Next.js Server Actions, and Client Services.

---

## 1. Executive Verdict

```
================================================================================
EXECUTIVE VERDICT: APPROVED WITH CONDITIONS (DEPLOYMENT BLOCKED PENDING FIXES)
================================================================================
- Overall Architecture & Intent: SOUND & ESSENTIAL
- Migration 1 (Security Definer Hardening) : REJECTED IN CURRENT FORM (Critical C-01, C-02)
- Migration 2 (Foreign Key Optimization)   : APPROVED WITH CONDITIONS (Redundancy M-01)
- Migration 3 (RLS InitPlan Optimization)  : APPROVED (100% Sound, Safe & Verified)
- Migration 4 (Security-Invoker View)      : APPROVED (100% Sound, Safe & Verified)
- Migration 5 (Atomic Registration RPC)    : APPROVED WITH CONDITIONS (Redundancy M-02)
================================================================================
```

### Executive Summary
The proposed Phase P1 database hardening introduces substantial architectural improvements, notably resolving 59 `auth_rls_initplan` CPU bottlenecks, fixing the `security_definer_view` vulnerability, establishing covering indexes for 32 foreign keys, and implementing an atomic row-locked registration procedure.

However, an independent architectural inspection revealed **two CRITICAL defects in Migration 1**:
1. Server action `submitScoreAction` (`app/actions/matchSchedulingActions.ts:824`) invokes `submit_player_score` using the elevated `adminClient` (`createAdminClient()`). Under PostgREST, `createAdminClient()` connects with the `service_role` key, where `auth.uid()` is `NULL`. Migration 1 asserts `IF NOT is_admin() THEN IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN RETURN error;`. Because `is_admin()` evaluates to `FALSE` when `auth.uid()` is `NULL`, **EVERY player match score submission across the platform would fail immediately**.
2. Server action `evaluateOverdueMatchesAction` (`app/actions/matchSchedulingActions.ts:1032`) also invokes `evaluate_overdue_matches` using `adminClient`. Migration 1 introduces `IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized: Administrator privileges required...'`. Because `service_role` has `auth.uid() = NULL`, this administrative routine **immediately crashes with an unhandled exception**.

Migrations **MUST NOT be applied to production** until these two authorization guards are corrected to explicitly accommodate the `service_role` authentication context.

---

## 2. Grouped Audit Findings

### Critical Findings (Must Fix Before Deployment)

#### [CRITICAL] C-01: Breakage of Match Score Submissions in `submit_player_score` via `adminClient`
- **Migration & Line Reference:** `supabase/migrations/20261111000001_security_definer_permission_hardening.sql:249-252`
- **Application Caller:** `app/actions/matchSchedulingActions.ts:824`
- **Analysis:**
  ```typescript
  // app/actions/matchSchedulingActions.ts
  export async function submitScoreAction(...) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser(); // Validates session
    const adminClient = createAdminClient();                  // Elevated service_role client
    const { data: rpcData, error: rpcErr } = await adminClient.rpc('submit_player_score', {
      p_match_id: data.matchId,
      p_participant_id: data.participantId,
      p_user_id: user.id,
      p_my_score: data.myScore,
      p_opponent_score: data.opponentScore,
    });
  ```
  In Migration 1, lines 249–252:
  ```sql
  IF NOT is_admin() THEN
    IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Session identity does not match requested user');
    END IF;
  ```
  Under PostgREST, a call authenticated via `SUPABASE_SERVICE_ROLE_KEY` runs with role `service_role` where `auth.uid()` evaluates to `NULL`.
  `public.is_admin()` contains `IF auth.uid() IS NULL THEN RETURN FALSE; END IF;`.
  Consequently, `is_admin()` returns `FALSE`, and `auth.uid() IS NULL` is `TRUE`. The RPC immediately aborts and returns an unauthorized error.
- **Remediation:** Update the authorization condition in `submit_player_score` to recognize `service_role`:
  ```sql
  IF NOT (is_admin() OR auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'service_role' OR current_user IN ('postgres', 'service_role')) THEN
    IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Session identity does not match requested user');
    END IF;
  ```

#### [CRITICAL] C-02: Server Action Crash in `evaluate_overdue_matches` via `adminClient`
- **Migration & Line Reference:** `supabase/migrations/20261111000001_security_definer_permission_hardening.sql:55-57`
- **Application Caller:** `app/actions/matchSchedulingActions.ts:1031-1034`
- **Analysis:**
  `evaluateOverdueMatchesAction` invokes `adminClient.rpc('evaluate_overdue_matches', { p_tournament_id })`.
  In Migration 1:
  ```sql
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Administrator privileges required to evaluate overdue matches';
  END IF;
  ```
  Since `adminClient` has no `auth.uid()`, `public.is_admin()` evaluates to `FALSE`. The database raises an uncaught exception, breaking automated and administrator-triggered deadline evaluations.
- **Remediation:**
  ```sql
  IF NOT (public.is_admin() OR auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'service_role' OR current_user IN ('postgres', 'service_role')) THEN
    RAISE EXCEPTION 'Unauthorized: Administrator privileges required to evaluate overdue matches';
  END IF;
  ```

---

### High Severity Findings

#### [HIGH] H-01: Incomplete Identity Binding on Direct Player Routines
- **Migration & Line Reference:** `supabase/migrations/20261111000001_security_definer_permission_hardening.sql:26-39`
- **Affected Functions:** `record_player_checkin`, `start_player_match`, `request_match_walkover`, `submit_match_screenshot_proof`
- **Analysis:** Migration 1 revokes `PUBLIC` and `anon` execute and grants `authenticated` and `service_role`. However, it does not re-declare the function bodies.
  In the current database catalog, these 4 functions only assert:
  ```sql
  IF NOT is_admin() THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.participants
      WHERE id = p_participant_id AND user_id = p_user_id
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unauthorized participant');
    END IF;
  END IF;
  ```
  While server actions in `app/actions/matchSchedulingActions.ts` pass `user.id` from `supabase.auth.getUser()`, any authenticated player calling Supabase PostgREST directly (`supabase.rpc('start_player_match', { p_match_id, p_participant_id: victim_part_id, p_user_id: victim_user_id })`) can spoof check-ins or walkover requests for another player.
- **Remediation:** Add procedure re-definitions for all four routines with the identical defense-in-depth check:
  `IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id AND NOT (is_admin() OR auth.role() = 'service_role') THEN ...`

---

### Medium Severity Findings

#### [MEDIUM] M-01: Triplicate Indexing on `payout_transactions(prize_distribution_id)`
- **Migration & Line Reference:** `supabase/migrations/20261111000002_foreign_key_index_optimization.sql:98, 137`
- **Analysis:**
  Inspection of the production database catalog (`pg_indexes`) reveals that index `idx_payout_tx_prize_dist` on `payout_transactions(prize_distribution_id)` **already exists**.
  Migration 2 introduces:
  - Line 98: `CREATE INDEX IF NOT EXISTS idx_payout_transactions_prize_distribution_id ON public.payout_transactions (prize_distribution_id) WHERE prize_distribution_id IS NOT NULL;`
  - Line 137: `CREATE UNIQUE INDEX IF NOT EXISTS uq_payout_transactions_prize_distribution_id ON public.payout_transactions (prize_distribution_id) WHERE prize_distribution_id IS NOT NULL;`
  Creating both results in three separate B-tree indexes indexing the identical foreign key column.
- **Remediation:** Remove line 98 (`idx_payout_transactions_prize_distribution_id`). The partial unique index `uq_payout_transactions_prize_distribution_id` provides complete covering support for foreign key lookups while enforcing data integrity.

#### [MEDIUM] M-02: Overlapping Unique Partial Indexes on `tournament_registrations`
- **Migration & Line Reference:** `supabase/migrations/20261111000005_atomic_tournament_registration.sql:20-22`
- **Analysis:**
  Production table `tournament_registrations` already contains:
  1. `idx_active_tournament_registration` on `(tournament_id, user_id) WHERE status IN ('pending_payment', 'confirmed')`
  2. `idx_active_whatsapp_registration` on `(tournament_id, user_id) WHERE status IN ('payment_submitted', 'under_verification', 'approved')`
  Together, these two indexes cover all active registration states. Adding `uq_tournament_registrations_active_user` across all 5 states creates an overlapping index.
- **Remediation:** Retain for consolidation, but document the index overlap.

---

### Low Severity Findings

#### [LOW] L-01: Pre-existing B-Tree Index on `profiles(avatar_id)`
- **Migration & Line Reference:** `supabase/migrations/20261111000002_foreign_key_index_optimization.sql:107`
- **Analysis:** Production catalog reveals `idx_profiles_avatar_id` already exists. The `CREATE INDEX IF NOT EXISTS` statement will safely no-op, but it is redundant.

---

## 3. Original vs. Proposed Permissions Comparison

| Routine / Object | Current ACL in Production | Proposed ACL in Migration 1 & 5 | Audit Evaluation |
| :--- | :--- | :--- | :--- |
| `admin_approve_manual_registration` | `{=X/postgres, anon=X, authenticated=X, service_role=X}` | `{authenticated=X, service_role=X}` | **APPROVED** (Removes dangerous anon/public execute) |
| `admin_reject_manual_registration` | `{=X/postgres, anon=X, authenticated=X, service_role=X}` | `{authenticated=X, service_role=X}` | **APPROVED** (Removes dangerous anon/public execute) |
| `admin_set_under_verification` | `{=X/postgres, anon=X, authenticated=X, service_role=X}` | `{authenticated=X, service_role=X}` | **APPROVED** (Removes dangerous anon/public execute) |
| `cancel_manual_registration` | `{=X/postgres, anon=X, authenticated=X, service_role=X}` | `{authenticated=X, service_role=X}` | **APPROVED** (Owner & admin verified internally) |
| `submit_manual_payment` | `{=X/postgres, anon=X, authenticated=X, service_role=X}` | `{authenticated=X, service_role=X}` | **APPROVED** (Owner & admin verified internally) |
| `evaluate_overdue_matches` | `{=X/postgres, anon=X, authenticated=X, service_role=X}` | `{authenticated=X, service_role=X}` | **CONDITIONALLY APPROVED** (Requires service_role fix C-02) |
| `sync_missing_profiles` | `{=X/postgres, anon=X, authenticated=X, service_role=X}` | `{authenticated=X, service_role=X}` | **APPROVED** (Strict internal admin validation) |
| `lock_tournament_financial_terms` | `{=X/postgres, anon=X, authenticated=X, service_role=X}` | `{service_role=X}` | **APPROVED** (Restricted strictly to triggers/service_role) |
| `submit_player_score` | `{=X/postgres, anon=X, authenticated=X, service_role=X}` | `{authenticated=X, service_role=X}` | **CONDITIONALLY APPROVED** (Requires service_role fix C-01) |
| `record_player_checkin` | `{=X/postgres, anon=X, authenticated=X, service_role=X}` | `{authenticated=X, service_role=X}` | **APPROVED WITH CONDITIONS** (Needs procedure body fix H-01) |
| `start_player_match` | `{=X/postgres, anon=X, authenticated=X, service_role=X}` | `{authenticated=X, service_role=X}` | **APPROVED WITH CONDITIONS** (Needs procedure body fix H-01) |
| `request_match_walkover` | `{=X/postgres, anon=X, authenticated=X, service_role=X}` | `{authenticated=X, service_role=X}` | **APPROVED WITH CONDITIONS** (Needs procedure body fix H-01) |
| `submit_match_screenshot_proof` | `{=X/postgres, anon=X, authenticated=X, service_role=X}` | `{authenticated=X, service_role=X}` | **APPROVED WITH CONDITIONS** (Needs procedure body fix H-01) |
| `register_player_for_tournament` | *Routine does not yet exist* | `{authenticated=X, service_role=X}` | **APPROVED** (Least privilege enforced from creation) |
| `tournament_participants_public` | View owner: `postgres`, `security_invoker = false` | View owner: `postgres`, `security_invoker = true` | **APPROVED** (Executes under caller RLS context) |

---

## 4. Registration RPC Security Assessment (`register_player_for_tournament`)

An exhaustive line-by-line inspection of Migration 5 confirms:

1. **Authentication & Identity Enforcement (Lines 57–74):**
   - Strictly asserts `v_caller_id := auth.uid()`. Rejects anonymous execution with `UNAUTHENTICATED`.
   - Prevents player account impersonation: `IF v_caller_id != p_user_id AND NOT v_is_admin THEN RETURN 'FORBIDDEN'`.
2. **Account Eligibility & Verification (Lines 86–129):**
   - Asserts profile exists in `public.profiles`.
   - Rejects accounts whose `account_status != 'active'` (enforces suspension/ban boundaries).
   - Enforces WhatsApp verification: requires `whatsapp_verified = true` OR `whatsapp_verification_status = 'verified'`.
   - Enforces valid non-empty `efootball_id`.
3. **Concurrency & Capacity Control (Lines 131–207):**
   - Acquires explicit row lock: `SELECT ... FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE`.
   - Strictly verifies `status = 'registration'`.
   - Rejects if `registration_deadline` has passed.
   - Atomically counts confirmed participants and active reservations under the lock:
     `v_total_occupied := v_participant_count + v_pending_reservation_count`.
     Rejects with `CAPACITY_FULL` if slots are exhausted.
4. **Private Tournament Access Security (Lines 163–187):**
   - If `is_private = TRUE`, mandates non-empty `p_access_code`.
   - Verifies against `access_code_hash` using bcrypt (`extensions.crypt`).
   - Fails safely with `INVALID_ACCESS_CODE` without leaking the hash.
5. **Paid vs. Free Tournament Workflow Preservation (Lines 234–380):**
   - **Paid Tournament:** Does **NOT** confirm enrollment or insert into `participants`. Strictly creates a record in `public.tournament_registrations` with `status = 'pending_payment'` and `payment_method = 'whatsapp_manual'`.
   - Increments `reserved_slots_count`.
   - Confirms that payment gateways or automated authorizations are **NOT** reintroduced.
   - Preserves manual WhatsApp administrative payment verification as authoritative.
   - **Free Tournament:** Atomically inserts active participant into `public.participants` and confirmed record into `public.tournament_registrations`.
   - Increments `confirmed_slots_count`.
6. **Caller Contract Compatibility:**
   - Arguments (`p_tournament_id, p_user_id, p_rules_accepted, p_access_code`) and return fields (`success, is_paid, status, participant_id, registration_id, amount_paise, entry_fee_inr, currency, message`) match `services/playerDashboardService.ts:1018-1041` with 100% precision.

---

## 5. RLS Policy Behavior Comparison (`Migration 3`)

Every rewritten policy in Migration 3 was compared against the active database policies extracted from `pg_policies`:

1. **Subquery Optimization Correctness:**
   - Replacing `auth.uid() = user_id` with `(SELECT auth.uid()) = user_id` does not change the truth value of the boolean expression for any row.
   - PostgreSQL executes the scalar subquery as an `InitPlan` once during query startup rather than evaluating `auth.uid()` for every scanned row.
2. **Policy Scope & Role Integrity:**
   - All roles (`public`, `authenticated`, `anon`) are preserved exactly as defined originally.
   - Table permissions (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, `ALL`) match 1:1.
   - `USING` and `WITH CHECK` clauses preserve identical security boundaries.
3. **Public Browsing Verification:**
   - `tournaments` public read policy (`status <> 'draft'`) was unaltered.
   - `participants_select_policy` retains public read for tournaments in `registration`, `ongoing`, or `completed` states.
   - Public tournament hub and live match viewers remain fully functional.

---

## 6. Index Duplication & Data Conflict Assessment (`Migration 2`)

Catalog inspection of table records prior to indexing:
1. **`payout_transactions.prize_distribution_id`:**
   - Query: `SELECT prize_distribution_id, count(*) FROM public.payout_transactions WHERE prize_distribution_id IS NOT NULL GROUP BY prize_distribution_id HAVING count(*) > 1;`
   - Result: `0 rows`. No duplicate prize distribution disbursements exist.
   - One record exists with `prize_distribution_id IS NULL` (manual player withdrawal).
   - Because the proposed unique constraint is partial (`WHERE prize_distribution_id IS NOT NULL`), NULL records are excluded and multiple manual withdrawals remain valid.
2. **`participants(tournament_id, user_id)`:**
   - Query: `SELECT tournament_id, user_id, count(*) FROM public.participants GROUP BY tournament_id, user_id HAVING count(*) > 1;`
   - Result: `0 rows`. Unique index creation will succeed without data conflict.
3. **`tournament_registrations`:**
   - Query: `SELECT tournament_id, user_id, count(*) FROM public.tournament_registrations WHERE status IN ('pending_payment', 'payment_submitted', 'under_verification', 'approved', 'confirmed') GROUP BY tournament_id, user_id HAVING count(*) > 1;`
   - Result: `0 rows`. Unique index creation will succeed without data conflict.

---

## 7. Security-Invoker View Assessment (`Migration 4`)

1. **View Definition:**
   `SELECT p.id, p.tournament_id, p.username, p.seed_number, p.status, p.created_at, p.updated_at FROM participants p JOIN tournaments t ON t.id = p.tournament_id WHERE t.status = ANY (ARRAY['registration', 'ongoing', 'completed']) AND p.status = ANY (ARRAY['active', 'eliminated'])`
2. **Data Exposure:**
   - Excludes `user_id`, `real_name`, `contact_info`, `terms_accepted`, and `rules_version`.
   - Guaranteed zero exposure of personal telephone numbers or PII.
3. **Execution Context:**
   - Setting `security_invoker = true` forces PostgreSQL to enforce caller RLS on `participants` and `tournaments`.
   - Because `participants_select_policy` permits public reading of active tournament participants, the view remains accessible to anonymous guests and authenticated players.
   - Eliminates Supabase Security Advisor linter error `security_definer_view`.

---

## 8. Application Compatibility Assessment

| Application Feature / File | Invocation Path | Compatibility Status | Notes |
| :--- | :--- | :--- | :--- |
| Self-Registration (`playerDashboardService.ts`) | `supabase.rpc('register_player_for_tournament', ...)` | **COMPATIBLE** | Matches argument signatures and return structure. |
| Admin Manual Registration Approval (`verificationActions.ts`) | `supabase.rpc('admin_approve_manual_registration', ...)` | **COMPATIBLE** | Caller uses authenticated admin client; permissions match. |
| Admin Payment Rejection (`verificationActions.ts`) | `supabase.rpc('admin_reject_manual_registration', ...)` | **COMPATIBLE** | Caller uses authenticated admin client; permissions match. |
| Admin Set Under Verification (`verificationActions.ts`) | `supabase.rpc('admin_set_under_verification', ...)` | **COMPATIBLE** | Caller uses authenticated admin client; permissions match. |
| Player Cancel Registration (`playerDashboardService.ts`) | `supabase.rpc('cancel_manual_registration', ...)` | **COMPATIBLE** | Caller uses authenticated player client; permissions match. |
| Player Submit Manual Payment (`verificationActions.ts`) | `supabase.rpc('submit_manual_payment', ...)` | **COMPATIBLE** | Caller uses authenticated player client; permissions match. |
| Player Score Submission (`matchSchedulingActions.ts:824`) | `adminClient.rpc('submit_player_score', ...)` | **INCOMPATIBLE (BLOCKING)** | Fails due to unhandled `service_role` in Migration 1 (Finding C-01). |
| Overdue Match Evaluation (`matchSchedulingActions.ts:1032`) | `adminClient.rpc('evaluate_overdue_matches', ...)` | **INCOMPATIBLE (BLOCKING)** | Fails due to unhandled `service_role` in Migration 1 (Finding C-02). |
| Player Match Check-In (`matchSchedulingActions.ts:39`) | `adminClient.rpc('record_player_checkin', ...)` | **COMPATIBLE** | Continues functioning; needs defense-in-depth update (Finding H-01). |
| Player Start Match (`matchSchedulingActions.ts:753`) | `adminClient.rpc('start_player_match', ...)` | **COMPATIBLE** | Continues functioning; needs defense-in-depth update (Finding H-01). |
| Player Request Walkover (`matchSchedulingActions.ts:93`) | `adminClient.rpc('request_match_walkover', ...)` | **COMPATIBLE** | Continues functioning; needs defense-in-depth update (Finding H-01). |
| Match Evidence Upload (`matchSchedulingActions.ts:935`) | `adminClient.rpc('submit_match_screenshot_proof', ...)` | **COMPATIBLE** | Continues functioning; needs defense-in-depth update (Finding H-01). |
| Public Participant Hub (`publicTournamentService.ts`) | `supabase.from('tournament_participants_public')` | **COMPATIBLE** | View remains queryable under `security_invoker = true`. |

---

## 9. Production Execution Risks

1. **Locking & Transaction Contention:**
   - Migration 2 creates 33 indexes. On the current production database (< 1,000 total rows across all tables), each index will build in under 5 milliseconds. The short-duration table share lock presents negligible risk to live users.
   - Migration 3 acquires brief metadata locks on table definitions during policy recreation (< 1 millisecond per table).
   - Migration 5 acquires row-level locks (`FOR UPDATE`) strictly on the specific tournament being registered for, preventing oversubscription without locking other tournaments.
2. **Data Hazard Risk:**
   - Zero destructive operations (`DROP TABLE`, `DROP COLUMN`, or `TRUNCATE`).
   - Zero unindexed table scans created.
3. **Rollback Feasibility:**
   - All migrations are non-destructive and fully reversible.
   - If rolled back, dropping newly created indexes and reverting functions leaves all existing tournament and user records untouched.

---

## 10. Required Corrections Before Deployment

Before executing any deployment to production, the following corrections are required:

1. **Update `evaluate_overdue_matches` in Migration 1:**
   Replace:
   ```sql
   IF NOT public.is_admin() THEN
     RAISE EXCEPTION 'Unauthorized: Administrator privileges required to evaluate overdue matches';
   END IF;
   ```
   With:
   ```sql
   IF NOT (public.is_admin() OR auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'service_role' OR current_user IN ('postgres', 'service_role')) THEN
     RAISE EXCEPTION 'Unauthorized: Administrator privileges required to evaluate overdue matches';
   END IF;
   ```

2. **Update `submit_player_score` in Migration 1:**
   Replace:
   ```sql
   IF NOT is_admin() THEN
     IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
       RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Session identity does not match requested user');
     END IF;
   ```
   With:
   ```sql
   IF NOT (is_admin() OR auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'service_role' OR current_user IN ('postgres', 'service_role')) THEN
     IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
       RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Session identity does not match requested user');
     END IF;
     IF NOT EXISTS (
       SELECT 1 FROM public.participants
       WHERE id = p_participant_id AND user_id = auth.uid()
     ) THEN
       RETURN jsonb_build_object('success', false, 'error', 'Unauthorized participant');
     END IF;
   END IF;
   ```

3. **Harden Remaining Player Routines in Migration 1:**
   Re-declare `record_player_checkin`, `start_player_match`, `request_match_walkover`, and `submit_match_screenshot_proof` to enforce session identity checks against `p_user_id` while allowing `service_role`.

4. **Clean Up Duplicate Index in Migration 2:**
   Remove redundant line 98 (`idx_payout_transactions_prize_distribution_id`) and keep only the partial unique index `uq_payout_transactions_prize_distribution_id`.

---

## 11. Migration-by-Migration Approval Table

| Migration | File Name | Auditor Status | Deployment Readiness | Conditions for Approval |
| :---: | :--- | :---: | :---: | :--- |
| **M1** | `20261111000001_security_definer_permission_hardening.sql` | **REJECTED** | **BLOCKED** | Apply service_role authorization fix to `submit_player_score` and `evaluate_overdue_matches`. |
| **M2** | `20261111000002_foreign_key_index_optimization.sql` | **APPROVED WITH CONDITIONS** | **READY** | Remove duplicate regular index on `payout_transactions(prize_distribution_id)`. |
| **M3** | `20261111000003_rls_initplan_optimization.sql` | **APPROVED** | **READY** | Zero defects. Ready for production execution. |
| **M4** | `20261111000004_security_invoker_view.sql` | **APPROVED** | **READY** | Zero defects. Ready for production execution. |
| **M5** | `20261111000005_atomic_tournament_registration.sql` | **APPROVED WITH CONDITIONS** | **READY** | Verify `service_role` accommodation if ever invoked via administrative tasks. |

---

**AUDIT CONCLUSION:**  
Phase P1 demonstrates high engineering quality and addresses critical platform security and performance vectors. However, applying the migrations as currently authored would introduce fatal authorization failures into the core match score submission and deadline evaluation server actions. **Deployment is paused until the specified authorization corrections are reviewed and approved.**
