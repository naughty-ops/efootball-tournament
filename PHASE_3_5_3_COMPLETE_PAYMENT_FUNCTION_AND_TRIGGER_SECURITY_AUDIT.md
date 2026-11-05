# PHASE 3.5.3 — COMPLETE PAYMENT FUNCTION & TRIGGER SECURITY AUDIT

**Author:** Antigravity Agentic Security Pairing Engine  
**Project:** eFootball Tournament Platform & YOUPI PG Integration  
**Repositories:** `D:\Project` | `D:\Project\youpi-pg`  
**Database Project ID:** `cqgbeafenavkeirwsxbg` (Supabase PostgreSQL)  
**Execution Constraints:** No Phase 4 features, zero gateway calls, no automated settlement, no live migration execution  
**Date:** 2026-11-04  

---

## 1. Executive Summary

Phase 3.5.3 resolves catalog inventory discrepancies, performs an in-depth security analysis of PostgreSQL trigger functions, establishes a granular payment function permission matrix, and formalizes migration reconciliation readiness.

### Key Audit Findings
1. **Catalog Discrepancy Resolved**: The entire `public` schema contains **exactly 14 distinct function names** across **15 total signatures**. The functions that influence payment state, webhook ingestion, tournament reservations, registration confirmation, refunds, or financial terms comprise **13 distinct function names** and **14 signatures** (plus the generic utility trigger `set_updated_at`). The Phase 3.5.2 prose miscount ("10 functions / 11 signatures") is formally corrected.
2. **Trigger Function Analysis (`lock_tournament_financial_terms`)**:
   - PostgreSQL strictly forbids invoking functions with return type `trigger` as ordinary RPCs or direct `SELECT` queries (enforced via `SQLSTATE 0A000: trigger functions can only be called as triggers`). Direct invocation attempts by `anon` or `authenticated` are blocked at the engine level.
   - Existing `EXECUTE` privileges on this function are necessary for authorized roles (`authenticated` admins and `service_role`) to perform legitimate `UPDATE` operations on `public.tournaments`.
   - Schema qualification is complete (`public.tournament_registrations`, `public.payment_transactions`).
   - A forward-only hardening migration proposal (`20261104050000`) has been prepared to explicitly place `pg_temp` last in `search_path` (`SET search_path = public, pg_temp;`) to eliminate temporary table search-path preemption risks.
3. **Comprehensive Payment Permission Matrix**: All 15 function signatures have been audited and categorized into strictly scoped operational tiers: Webhook-only internal RPCs (`service_role` only), Player-facing reservation RPCs (`authenticated` with `auth.uid() = p_user_id` validation), Admin-facing reconciliation RPCs (`authenticated` with strict `is_admin()` gatekeeping), and Database Triggers.
4. **Migration Reconciliation Readiness**: Audited all 5 unrecorded disk migrations plus the new forward-only migration proposal. Verified that `supabase migration repair --status applied` is the correct procedure because all schema objects already exist in the live database. Clean replay remains **BLOCKED** due to host environment limitations (Docker daemon absent).

---

## 2. Objective 1 — Function & Signature Inventory Reconciliation

### 2.1 Resolution of Inventory Discrepancy
In Phase 3.5.2, the prose summary stated "10 functions across 11 signatures", while the inventory table listed 12 distinct names and 13 signatures. 

To resolve this discrepancy conclusively, an unrestricted query was executed against `pg_proc` joining `pg_namespace` for the entire `public` schema:

```sql
SELECT 
    p.oid,
    p.proname,
    pg_get_function_identity_arguments(p.oid) AS identity_arguments,
    r.rolname AS owner,
    p.prosecdef AS is_security_definer,
    p.prorettype::regtype::text AS return_type,
    p.proconfig AS search_path_config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles r ON r.oid = p.proowner
WHERE n.nspname = 'public'
ORDER BY p.proname, identity_arguments;
```

#### Complete Live Database Catalog Result (All Functions in `public`)
```
Total records in pg_proc (public schema): EXACTLY 15
Distinct proname count (public schema):  EXACTLY 14
```

| # | OID | Function Name | Identity Arguments | Owner | SecDef | Return Type | Search Path Configuration |
| :-: | :-: | :--- | :--- | :---: | :---: | :---: | :--- |
| 1 | `19885` | `acquire_webhook_processing_lease` | `varchar, varchar, jsonb, varchar, int` | `postgres` | `true` | `record` | `search_path=public, pg_temp` |
| 2 | `20359` | `apply_webhook_order_transition_and_complete` | `varchar, varchar, uuid, varchar, text, text, text, varchar, text` | `postgres` | `true` | `record` | `search_path=public, pg_temp` |
| 3 | `20354` | `claim_webhook_worker_lease` | `varchar, varchar, jsonb, varchar, varchar, varchar, int` | `postgres` | `true` | `record` | `search_path=public, pg_temp` |
| 4 | `19886` | `complete_webhook_processing_lease` | `varchar, varchar, varchar, jsonb` | `postgres` | `true` | `boolean` | `search_path=public, pg_temp` |
| 5 | `20356` | `complete_webhook_worker_lease` | `varchar, varchar, varchar, varchar, text, uuid` | `postgres` | `true` | `record` | `search_path=public, pg_temp` |
| 6 | `19657` | `confirm_tournament_reservation` | `uuid, uuid, text, text, text` | `postgres` | `true` | `record` | `search_path=public, auth, pg_temp` |
| 7 | `19685` | `confirm_tournament_reservation` | `uuid, uuid, uuid, text, text, text` | `postgres` | `true` | `record` | `search_path=public, auth, pg_temp` |
| 8 | `19484` | `is_admin` | *(none)* | `postgres` | `true` | `boolean` | `search_path=public, auth` |
| 9 | `19718` | `lock_tournament_financial_terms` | *(none)* | `postgres` | `true` | `trigger` | `search_path=public` |
| 10 | `19866` | `reconcile_and_confirm_payment` | `uuid, text, text, text` | `postgres` | `true` | `record` | `search_path=public, auth, pg_temp` |
| 11 | `19659` | `reconcile_tournament_slots` | `uuid` | `postgres` | `true` | `record` | `search_path=public, auth, pg_temp` |
| 12 | `19658` | `release_expired_reservations` | `uuid` | `postgres` | `true` | `integer` | `search_path=public, auth, pg_temp` |
| 13 | `20357` | `release_webhook_worker_lease` | `varchar, varchar, text` | `postgres` | `true` | `record` | `search_path=public, pg_temp` |
| 14 | `19655` | `reserve_tournament_slot` | `uuid, uuid, int` | `postgres` | `true` | `record` | `search_path=public, auth, pg_temp` |
| 15 | `17580` | `set_updated_at` | *(none)* | `postgres` | `false` | `trigger` | *NULL (default)* |

### 2.2 Functional Categorization Breakdown
1. **Webhook Processing Engine (6 functions, 6 signatures):**
   - Active: `claim_webhook_worker_lease`, `apply_webhook_order_transition_and_complete`, `complete_webhook_worker_lease`, `release_webhook_worker_lease`.
   - Legacy: `acquire_webhook_processing_lease`, `complete_webhook_processing_lease`.
2. **Registration & Slot Lifecycle (4 functions, 5 signatures):**
   - `reserve_tournament_slot` (player slot hold).
   - `confirm_tournament_reservation` (2 overloads: 5-arg free, 6-arg paid/captured).
   - `release_expired_reservations` (cleanup worker/cron).
   - `reconcile_tournament_slots` (counter reconciliation).
3. **Financial Reconciliation & Ledger (1 function, 1 signature):**
   - `reconcile_and_confirm_payment` (owner manual verification, UTR claim, ledger transition).
4. **Financial Invariant Protection Trigger (1 function, 1 signature):**
   - `lock_tournament_financial_terms` (`BEFORE UPDATE` trigger on `tournaments`).
5. **Security Gatekeeper (1 function, 1 signature):**
   - `is_admin` (authoritative platform admin check used across RLS and privileged functions).
6. **Generic Utility Trigger (1 function, 1 signature):**
   - `set_updated_at` (sets `updated_at = NOW()` on row updates for `matches`, `participants`, `tournaments`).

*Subtotal of functions influencing payment, webhook, registration, reservation, refunds, or financial terms:* **13 distinct function names, 14 total signatures.**  
*Grand total in `public` schema:* **14 distinct function names, 15 total signatures.**

---

## 3. Objective 2 — In-Depth Analysis of `lock_tournament_financial_terms`

### 3.1 Function Definition & Relation Inspection
Decompiled source from `pg_get_functiondef(19718)`:

```sql
CREATE OR REPLACE FUNCTION public.lock_tournament_financial_terms()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.is_paid IS DISTINCT FROM OLD.is_paid) OR 
     (NEW.entry_fee_paise IS DISTINCT FROM OLD.entry_fee_paise) OR 
     (NEW.currency IS DISTINCT FROM OLD.currency) THEN
     
     IF EXISTS (
       SELECT 1 FROM public.tournament_registrations
       WHERE tournament_id = OLD.id
         AND status IN ('confirmed', 'pending_payment')
     ) OR EXISTS (
       SELECT 1 FROM public.payment_transactions
       WHERE tournament_id = OLD.id
         AND status != 'failed'
     ) OR (OLD.confirmed_slots_count > 0) OR (OLD.reserved_slots_count > 0) THEN
       RAISE EXCEPTION 'Cannot modify financial terms (is_paid, entry_fee_paise, currency) when active registrations or payment records exist for tournament %', OLD.id;
     END IF;
  END IF;
  RETURN NEW;
END;
$function$
```

### 3.2 Evaluation of Specific Audit Criteria
1. **Referenced Relations**:
   - `public.tournament_registrations`
   - `public.payment_transactions`
   - All references are explicitly schema-qualified with `public.`.
2. **Trigger Bindings**:
   - Bound to table: `public.tournaments`
   - Trigger Name: `trg_lock_tournament_financial_terms`
   - Timing: `BEFORE UPDATE`
   - Action: `EXECUTE FUNCTION lock_tournament_financial_terms()`
3. **RPC Invocability (Direct Call Test)**:
   A direct execution probe was tested:
   ```sql
   SELECT public.lock_tournament_financial_terms();
   ```
   **Engine Response**:
   ```
   ERROR: 0A000: trigger functions can only be called as triggers
   CONTEXT: compilation of PL/pgSQL function "lock_tournament_financial_terms" near line 1
   ```
   PostgreSQL enforces at the engine level that trigger functions cannot be called via direct SQL statements, PostgREST endpoints, or client RPCs.
4. **Analysis of EXECUTE Privileges**:
   - When an `UPDATE` statement is issued against `public.tournaments`, PostgreSQL verifies that the role executing the `UPDATE` has `EXECUTE` privileges on the associated trigger function.
   - If `EXECUTE` is revoked from `authenticated`, authenticated platform administrators updating tournament metadata (e.g. updating tournament start dates, participant scores, or status) will fail with: `permission denied for function lock_tournament_financial_terms`.
   - `anon` cannot exploit the function because: (a) it cannot be called directly as an RPC, and (b) `anon` has no `UPDATE` privileges on `public.tournaments` under RLS.
5. **Search Path Hardening**:
   - Currently configured: `SET search_path = public;`
   - In PostgreSQL, if `pg_temp` is not explicitly declared in `search_path`, PostgreSQL implicitly prepends `pg_temp` before `public`.
   - Explicitly configuring `SET search_path = public, pg_temp;` ensures temporary tables cannot shadow public schema relations.
6. **Forward-Only Hardening Migration Proposal**:
   Created migration file: `supabase/migrations/20261104050000_reconcile_legacy_webhook_and_trigger_search_paths.sql`:
   ```sql
   ALTER FUNCTION public.lock_tournament_financial_terms()
     SET search_path = public, pg_temp;
   ```
   *Execution is deferred until operator-approved deployment.*

---

## 4. Objective 3 — Complete Payment Permission Matrix

The following matrix categorizes all 15 function signatures in the `public` schema, their access controls, callers, and risk profiles:

| Function Name & Signature | Owner | SecDef | Configured `search_path` | anon | auth | PUBLIC (0) | service_role | Intended Caller | Application Usage & Invariant Fencing | Risk Assessment |
| :--- | :---: | :---: | :--- | :---: | :---: | :---: | :---: | :--- | :--- | :--- |
| **`claim_webhook_worker_lease`**<br>`(varchar, varchar, jsonb, varchar, varchar, varchar, int)` | `postgres` | `true` | `public, pg_temp` | `false` | `false` | `false` | `true` | Backend Webhook Service | Called by `lib/payment/webhook-service.ts` to lock webhook row (`FOR UPDATE`) and acquire exclusive lease. | **SECURE / FENCED**<br>No public access; tamper-checked. |
| **`apply_webhook_order_transition_and_complete`**<br>`(varchar, varchar, uuid, varchar, text, text, text, varchar, text)` | `postgres` | `true` | `public, pg_temp` | `false` | `false` | `false` | `true` | Backend Webhook Service | Called by `lib/payment/webhook-service.ts` to atomically mutate `payment_orders` and complete webhook under locks. | **SECURE / FENCED**<br>Cannot downgrade paid orders; caps at pending. |
| **`complete_webhook_worker_lease`**<br>`(varchar, varchar, varchar, varchar, text, uuid)` | `postgres` | `true` | `public, pg_temp` | `false` | `false` | `false` | `true` | Backend Webhook Service | Completes webhook events that do not modify orders (e.g. signature failure logging). Fenced by wall-clock expiry. | **SECURE / FENCED**<br>Expired lease rejects completion. |
| **`release_webhook_worker_lease`**<br>`(varchar, varchar, text)` | `postgres` | `true` | `public, pg_temp` | `false` | `false` | `false` | `true` | Backend Webhook Service | Releases active lease and sets immediate expiry to enable rapid gateway retries. | **SECURE / FENCED**<br>Requires matching worker token. |
| **`acquire_webhook_processing_lease`**<br>`(varchar, varchar, jsonb, varchar, int)` | `postgres` | `true` | `public, pg_temp` | `false` | `false` | `false` | `true` | Legacy Backend Worker | Retained for backward compatibility. Hardened to `public, pg_temp` in Phase 3.5.2. | **SECURE / FENCED**<br>Restricted to `service_role`. |
| **`complete_webhook_processing_lease`**<br>`(varchar, varchar, varchar, jsonb)` | `postgres` | `true` | `public, pg_temp` | `false` | `false` | `false` | `true` | Legacy Backend Worker | Retained for backward compatibility. Hardened to `public, pg_temp` in Phase 3.5.2. | **SECURE / FENCED**<br>Restricted to `service_role`. |
| **`reserve_tournament_slot`**<br>`(uuid, uuid, int)` | `postgres` | `true` | `public, auth, pg_temp` | `false` | `true` | `false` | `true` | Authenticated Player / Checkout | Called by `lib/payment/payment-service.ts` to create 12-min reservation hold. Enforces `auth.uid() = p_user_id`. | **SECURE / AUTHENTICATED**<br>Cannot reserve on behalf of other players. |
| **`confirm_tournament_reservation`**<br>`(uuid, uuid, text, text, text)` | `postgres` | `true` | `public, auth, pg_temp` | `false` | `false` | `false` | `true` | Privileged Backend | Confirms free tournament reservations and links participant row. Guarded by `is_admin() \|\| service_role`. | **SECURE / FENCED**<br>Direct anon/auth RPC blocked. |
| **`confirm_tournament_reservation`**<br>`(uuid, uuid, uuid, text, text, text)` | `postgres` | `true` | `public, auth, pg_temp` | `false` | `false` | `false` | `true` | Privileged Backend | Confirms paid reservations; verifies captured transaction binding. Enforces capacity/refund queueing. | **SECURE / FENCED**<br>Direct anon/auth RPC blocked. |
| **`reconcile_and_confirm_payment`**<br>`(uuid, text, text, text)` | `postgres` | `true` | `public, auth, pg_temp` | `false` | `true`* | `false` | `true` | Platform Admin Portal | Admin reconciliation of pending/review orders. Validates bank UTR in `payment_utr_claims`. Records audit log. | **SECURE / ROLE-GATED**<br>\*Immediate internal gate: `IF NOT is_admin() THEN RETURN unauthorized`. |
| **`reconcile_tournament_slots`**<br>`(uuid)` | `postgres` | `true` | `public, auth, pg_temp` | `false` | `false` | `false` | `true` | Maintenance / Admin | Re-synchronizes `confirmed_slots_count` and `reserved_slots_count` against participant table and active holds. | **SECURE / FENCED**<br>Requires `service_role` or admin. |
| **`release_expired_reservations`**<br>`(uuid)` | `postgres` | `true` | `public, auth, pg_temp` | `false` | `false` | `false` | `true` | Maintenance / pg_cron | Expires abandoned `pending_payment` holds and decrements reservation counters. | **SECURE / FENCED**<br>Requires `service_role` or admin. |
| **`lock_tournament_financial_terms`**<br>`()` | `postgres` | `true` | `public` | `true`** | `true`** | `true`** | `true` | Database Trigger | `BEFORE UPDATE` Trigger on `tournaments` preventing changes to `is_paid` / fees when registrations exist. | **SECURE / TRIGGER**<br>\*\*Cannot be called directly (`0A000`). Executed only during table updates. |
| **`is_admin`**<br>`()` | `postgres` | `true` | `public, auth` | `true` | `true` | `false` | `true` | Security Dependency | Evaluates whether current session belongs to platform admin email (`ye.agrajj@gmail.com`). | **SECURE / READ-ONLY**<br>Pure validation logic. |
| **`set_updated_at`**<br>`()` | `postgres` | `false` | *NULL* | `true` | `true` | `true` | `true` | Database Trigger | `BEFORE UPDATE` Trigger updating `updated_at = NOW()` on `matches`, `participants`, `tournaments`. | **SECURE / TRIGGER**<br>Cannot be called directly (`0A000`). |

---

## 5. Objective 4 — Migration Reconciliation Readiness & Checklist

### 5.1 Verification of Unrecorded Migrations
The live database was inspected to confirm whether every intended change from the 5 unrecorded disk migrations is present:
1. `20261102000000_create_homepage_cms_tables.sql`: Tables `homepage_sections` (11 rows) and `homepage_audit_history` exist with full RLS and indexes.
2. `20261104010000_harden_webhook_lifecycle_and_audit.sql`: Columns `payment_id`, `order_id`, `payment_order_id`, `signature_verified`, `received_at`, `retry_count`, `processing_result`, `failure_reason` exist on `payment_webhook_events`.
3. `20261104020000_atomic_webhook_worker_lease_and_lifecycle.sql`: Column `processed_at` is nullable; column `processing_started_at` exists; indexes `idx_payment_webhook_events_worker_lease` and `idx_payment_webhook_events_lease_status` exist.
4. `20261104030000_atomic_webhook_order_transition_and_fencing.sql`: Replaced TOCTOU race with atomic order/event transaction function.
5. `20261104040000_webhook_security_audit_and_hardening.sql`: Replaced functions with `clock_timestamp()` and `search_path = public, pg_temp`; revoked privileges from `PUBLIC`, `anon`, and `authenticated`; granted strictly to `service_role`.

### 5.2 Adequacy of New Migration `20261104050000`
The forward-only migration file:
`d:\Project\supabase\migrations\20261104050000_reconcile_legacy_webhook_and_trigger_search_paths.sql`
contains:
- Hardening of `acquire_webhook_processing_lease` to `SET search_path = public, pg_temp;`.
- Hardening of `complete_webhook_processing_lease` to `SET search_path = public, pg_temp;`.
- Hardening of `lock_tournament_financial_terms` to `SET search_path = public, pg_temp;`.

This migration represents the exact delta needed to ensure clean replay builds match the hardened live database.

### 5.3 Safety Analysis of `supabase migration repair`
- Running `supabase migration repair --status applied <version>` does **not** execute SQL; it merely marks versions as applied in `supabase_migrations.schema_migrations`.
- Because the live schema already contains all DDL changes from versions `20261102000000` through `20261104040000`, running migration repair will **not skip any missing changes**.
- It prevents Supabase CLI from attempting to execute duplicate DDL statements (e.g. attempting to re-add existing columns or tables).
- Subsequent execution of `supabase db push` will apply only `20261104050000`.

### 5.4 Clean Replay Status
* **Status:** **BLOCKED**
* **Reason:** Local container environment (Docker) is absent on this machine. Running destructive reset operations against the live cloud Supabase database is strictly prohibited.

### 5.5 Migration Reconciliation Checklist (Pre-Requisites for Operator Execution)
When the operator connects the Supabase CLI to apply migrations in a formal staging or deployment pipeline, execute the following verified sequence:

- [ ] **Prerequisite 1**: Verify working directory is clean (`git status`).
- [ ] **Prerequisite 2**: Confirm Supabase CLI is authenticated with project `cqgbeafenavkeirwsxbg`.
- [ ] **Step 1**: Register unrecorded historical migrations as applied:
  ```bash
  supabase migration repair --status applied 20261102000000
  supabase migration repair --status applied 20261104010000
  supabase migration repair --status applied 20261104020000
  supabase migration repair --status applied 20261104030000
  supabase migration repair --status applied 20261104040000
  ```
- [ ] **Step 2**: Apply the forward-only reconciliation migration:
  ```bash
  supabase db push
  ```
- [ ] **Step 3**: Verify remote migration list:
  ```bash
  supabase migration list
  ```
- [ ] **Verification**: Confirm `20261104050000` is recorded as the latest applied migration.

---

## 6. Objective 5 — Regression & Non-Destructive Verification

All verification procedures were performed strictly in read-only and non-destructive modes:
1. **Read-Only Database Security Suite (`scripts/verify-phase3-5-1-read-only.ts`):**
   - Public schema write rejection: **PASS** (`42501` RLS denial)
   - Microsecond timestamp parity: **PASS** (`0.000000s` delta)
   - Unprivileged execution rejection across all 6 webhook RPCs: **PASS** (`PGRST202` / `42501`)
   - Outcome: **8/8 checks passed** (Zero mutations performed).
2. **Rules & Registration Acceptance Suite (`scripts/verify-rules-acceptance.ts`):**
   - Free registration flow, order creation payload, terms elimination: **PASS** (4/4 passed).
3. **TypeScript Compilation Integrity:**
   - Command: `npx tsc --noEmit`
   - Outcome: **0 errors**.

---

## 7. Remaining Risks & Mitigations

1. **Host Replay Environment**:
   - *Risk*: Clean replay cannot be simulated locally due to absence of Docker daemon.
   - *Mitigation*: Static code analysis of all migration DDL files confirms defensive idempotency (`IF NOT EXISTS`, `ON CONFLICT`, `CREATE OR REPLACE`). Destructive replay against live cloud infrastructure was avoided.
2. **Authenticated Scope on `reconcile_and_confirm_payment`**:
   - *Risk*: `authenticated` role possesses `EXECUTE` privilege on `reconcile_and_confirm_payment`.
   - *Mitigation*: The function immediately executes `IF NOT public.is_admin() THEN RETURN 'unauthorized';`. Non-admin authenticated tokens are rejected before any database state is evaluated or locked.

---

## 8. Final Decision & Status

| Objective | Status | Notes |
| :--- | :---: | :--- |
| **1. Function Inventory Reconciliation** | **PASS** | Formally resolved: Exactly 14 distinct names, 15 signatures in `public`. |
| **2. Trigger Function Security (`lock_financial_terms`)** | **PASS** | Validated direct call prevention (`0A000`); forward-only migration prepared. |
| **3. Payment Permission Matrix** | **PASS** | Complete 15-signature matrix established with caller tiers. |
| **4. Migration Reconciliation Readiness** | **PASS / READY** | Idempotency confirmed; repair sequence validated; replay blocked. |
| **5. Regression & Non-Destructive Testing** | **PASS** | Read-only suites green (8/8 PASS, 4/4 PASS, `tsc` clean). |
| **OVERALL VERDICT** | **PASS (AUDIT COMPLETE)** | Database security remediation finalized. |

### Strict Stop Conditions Affirmed
- Phase 4 has **NOT** been started.
- Real-money transactions are **NOT** enabled.
- Automated settlement is **NOT** authorized.
- Tournament registrations are **NOT** automatically confirmed.
- Refunds are **NOT** automatically issued.
- No deployment has been initiated.

Antigravity is stopped and awaiting operator approval.
