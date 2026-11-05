# PHASE 4.2.1 — FINANCIAL WORKFLOW INTEGRITY AUDIT

**Project:** eFootball Tournament Platform + YOUPI PG Integration  
**Workspace:** `D:\Project`  
**Supabase Project:** `cqgbeafenavkeirwsxbg`  
**Status:** AUDIT COMPLETE — CONDITIONAL FINDINGS DOCUMENTED  
**Date:** 2026-11-04  

---

## 1. Executive Summary

This audit independently assesses the financial workflow integrity, concurrency serialization, database constraint enforcement, and audit ledger immutability of the Phase 4.2 UTR Verification Desk and Payment Exception Management system.

Unlike previous superficial checks that halted at the initial authentication gate, this audit established authenticated PostgreSQL transaction contexts (simulating the allowlisted administrator `ye.agrajj@gmail.com`) to evaluate every downstream business invariant in `public.reconcile_and_confirm_payment`.

### Core Assessment Summary

| Functional Area | Audit Status | Critical Findings |
| :--- | :--- | :--- |
| **1. UTR Validation & Normalization** | **VERIFIED ✅** | Strict 8+ alphanumeric length enforcement; case and space normalization; B-Tree uniqueness. |
| **2. Concurrency & Double Claims** | **VERIFIED ✅** | `payment_utr_claims.normalized_utr` PK blocks duplicate claims; `idx_active_tournament_registration` blocks duplicate player slots. |
| **3. Non-Pending & Post-Rejection Guards** | **VERIFIED ✅** | Orders in `paid`, `failed`, or `created` status cannot be reconciled; failed orders cannot be re-approved. |
| **4. Capacity & Expired Reservation** | **VERIFIED ✅** | If capacity is full and hold is expired, system locks slot counter and queues refund (`refund_pending`). |
| **5. Financial State Terminology** | **VERIFIED ✅** | Webhook ingress != Application payment confirmed != Bank settlement verified. |
| **6. Audit Trail Immutability** | **FAILED ❌ (HIGH RISK)** | `public.admin_audit_logs` has **RLS DISABLED** (`relrowsecurity = false`). Default public grants allow `UPDATE`, `DELETE`, and `TRUNCATE` by `authenticated` and `anon` roles. |
| **7. Exception Lifecycle Persistence** | **FAILED ❌ (GAP)** | Exception management desk (`/admin/payments/exceptions`) updates React component state only. **No database persistence** exists; refresh resets all investigation and resolution records. |

---

## 2. Verified Controls

The following 8 critical financial controls were tested and verified against the live PostgreSQL database:

### 2.1. UTR Format Validation & Normalization
- **Normalizer:** Database procedure executes `v_clean_utr := UPPER(REGEXP_REPLACE(COALESCE(p_bank_reference, ''), '[^a-zA-Z0-9]', '', 'g'))`.
- **Validation:** Enforces `LENGTH(v_clean_utr) >= 8`.
- **Test Evidence:** Probed with `'12345'`. RPC safely returned:
  ```json
  {
    "success": false,
    "status": "invalid_utr",
    "message": "Invalid bank reference: Evidence reference must be at least 8 alphanumeric characters"
  }
  ```

### 2.2. Physical B-Tree Concurrency Serialization on UTR Claims
- **Mechanism:** `public.payment_utr_claims` utilizes `normalized_utr VARCHAR(64) PRIMARY KEY` using a B-Tree index.
- **RPC Insert:** `INSERT INTO public.payment_utr_claims (...) VALUES (...) ON CONFLICT (normalized_utr) DO NOTHING RETURNING normalized_utr INTO v_claim_inserted;`
- **Test Evidence:** When a second claim was submitted using identical normalized characters (`' duplicateutr 9999 '` matching existing `'DUPLICATEUTR9999'`), the insert returned `NULL`, and the procedure cleanly rejected the second claim:
  ```json
  {
    "success": false,
    "status": "duplicate_utr",
    "message": "Banking reference DUPLICATEUTR9999 has already been claimed by another payment order"
  }
  ```

### 2.3. Settlement Invariance & Anti-Double Approval
- **Mechanism:** `SELECT ... FOR UPDATE` acquires an exclusive row lock on `payment_orders`. It checks:
  ```sql
  IF v_order.status NOT IN ('manual_review_required', 'pending_verification') THEN ...
  ```
- **Test Evidence:** When an authorized administrator attempted to reconcile an already settled order (`1b046595-ba50-48f0-bbcf-d51e24e802fc`, status: `paid`), the procedure refused execution:
  ```json
  {
    "success": false,
    "status": "paid",
    "message": "Cannot reconcile order with status: paid. Only pending or review orders are eligible."
  }
  ```

### 2.4. Irreversible Rejection Workflow
- **Mechanism:** When `p_decision = 'reject'`, `payment_orders.status` is updated to `'failed'`, capturing admin notes and timestamp.
- **Post-Rejection Guard:** Once marked `'failed'`, subsequent reconciliation attempts are rejected by the non-pending status guard.
- **Test Evidence:** Rejection test marked order `failed`. Subsequent approval attempt failed with:
  ```json
  {
    "success": false,
    "status": "failed",
    "message": "Cannot reconcile order with status: failed. Only pending or review orders are eligible."
  }
  ```

### 2.5. Amount & Currency Matching
- **Mechanism:** Enforces exact parity: `v_order.amount_paise = v_tourn.entry_fee_paise` and `currency = 'INR'`.
- **Test Evidence:** Probed with order amount 4000 paise vs tournament entry fee 5000 paise. Procedure rejected transaction:
  ```json
  {
    "success": false,
    "status": "amount_mismatch",
    "message": "Financial mismatch: Order amount (4000 paise) does not match tournament entry fee (5000 paise)"
  }
  ```

### 2.6. Capacity Overflow Prevention on Expired Holds
- **Mechanism:** When `v_reg.status = 'expired'` and `confirmed_slots_count >= max_participants`:
  - Slot counter is **not** incremented.
  - Participant record is **not** created.
  - Order status is set to `'refund_pending'`.
  - Record is inserted into `public.payment_refund_requests` (`status: 'pending_review'`).
- **Test Evidence:** Probed against full tournament. Returned:
  ```json
  {
    "success": true,
    "status": "refund_pending",
    "message": "Tournament capacity reached after hold expired. Payment captured and queued for refund."
  }
  ```
  And confirmed `payment_refund_requests` record provisioned for 5000 paise.

### 2.7. Duplicate Registration Prevention
- **Mechanism:** Physical unique index `idx_active_tournament_registration` on `(tournament_id, user_id)`.
- **Test Evidence:** Concurrent attempt to register the same user twice in a tournament was aborted at the database engine level with constraint violation `23505`.

### 2.8. Authorization Fencing
- Unauthenticated / anon callers receive PostgreSQL error `42501 permission denied for function reconcile_and_confirm_payment`.
- Authenticated non-admin callers (or service-role callers lacking an admin user session) receive `{ success: false, status: 'unauthorized', message: 'Unauthorized: Privileged reconciliation requires owner administrator privilege' }`.

---

## 3. Failed or Unverified Controls

### 3.1. [CRITICAL] `admin_audit_logs` Lacks RLS and Allows Untrusted Mutation
- **Catalog Inspection:**
  - `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'admin_audit_logs';`
  - Output: `relrowsecurity: false`, `relforcerowsecurity: false`.
  - `information_schema.role_table_grants` reveals:
    ```
    grantee: authenticated | privileges: SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER
    grantee: anon          | privileges: SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER
    ```
- **Security Impact:**
  Audit logs must be append-only and tamper-proof. In the current configuration, any authenticated user (or anon client) can modify or delete audit log records using standard PostgREST table endpoints (`supabase.from('admin_audit_logs').delete()`).
- **Audit Verdict:** **FAILED.** Requires immediate RLS enforcement and privilege revocation.

### 3.2. [HIGH] Payment Exception Management Lacks Database Persistence
- **Code Inspection:**
  In [`app/admin/payments/exceptions/page.tsx`](file:///d:/Project/app/admin/payments/exceptions/page.tsx#L152-L169):
  ```typescript
  const handleUpdateStatus = (newStatus: ExceptionStatus) => {
    if (!selectedException) return;
    const updated = exceptions.map((e) =>
      e.reference === selectedException.reference
        ? { ...e, status: newStatus, resolvedAt: ... }
        : e
    );
    setExceptions(updated); // In-memory React state ONLY
  };
  ```
- **Impact Against Audit Requirements:**
  - *Open exceptions remain open after refresh:* **YES** (re-synthesized from orders/webhooks).
  - *Investigation status persists:* **NO (FAILS)**. Browser refresh resets status to `open`.
  - *Resolution requires an authorized administrator:* **NO (FAILS)**. No server-side endpoint or authorization check exists.
  - *Resolution reason and actor are recorded:* **NO (FAILS)**. Notes entered in modal are discarded on reload.
  - *Resolved exceptions do not silently reappear:* **NO (FAILS)**. Resolved items reappear on browser refresh.
  - *Dismissed exceptions retain history:* **NO (FAILS)**. Dismissals are lost on reload.
- **Audit Verdict:** **FAILED.** Requires a dedicated `payment_exceptions` ledger table and API endpoint.

### 3.3. [MEDIUM] UI Tab Categorization vs RPC Status Eligibility
- In [`app/admin/payments/verification/page.tsx`](file:///d:/Project/app/admin/payments/verification/page.tsx#L583), orders in `created` and `attempted` status are grouped under the "Pending" review filter.
- However, `public.reconcile_and_confirm_payment` line 238 strictly requires:
  ```sql
  IF v_order.status NOT IN ('manual_review_required', 'pending_verification') THEN
  ```
- If an admin attempts to approve a claim for an order in `created` status (where a player initiated checkout but never submitted UTR proof), the RPC rejects the action with `Cannot reconcile order with status: created`.
- **Audit Verdict:** UI should either display an informational badge explaining that user evidence has not yet been submitted, or filter out non-submitted orders from the actionable approval queue.

---

## 4. Actual Database Constraints & Indexes

Live catalog verification confirms the following constraints on production database `cqgbeafenavkeirwsxbg`:

| Table | Constraint / Index | Definition | Purpose |
| :--- | :--- | :--- | :--- |
| `payment_utr_claims` | `payment_utr_claims_pkey` | `PRIMARY KEY (normalized_utr) USING btree` | Guarantees physical serialization; blocks duplicate UTR claims across all orders. |
| `payment_utr_claims` | `payment_utr_claims_order_id_fkey` | `FOREIGN KEY (order_id) REFERENCES payment_orders(id) ON DELETE RESTRICT` | Prevents orphaned claims and maintains referential integrity. |
| `payment_utr_claims` | `idx_utr_claims_order_id` | `INDEX ON payment_utr_claims(order_id) USING btree` | Accelerates order-level claim lookups. |
| `tournaments` | `tournaments_format_check` | `CHECK (format = ANY (ARRAY['knockout', 'league', 'group_knockout']))` | Ensures valid tournament structure. |
| `tournaments` | `tournaments_status_check` | `CHECK (status = ANY (ARRAY['draft', 'registration', 'ongoing', 'completed']))` | Enforces tournament lifecycle states. |
| `tournament_registrations` | `idx_active_tournament_registration` | `UNIQUE (tournament_id, user_id)` (filtered) | Prevents double registrations for the same user in a tournament. |
| `payment_orders` | `payment_orders_pkey` | `PRIMARY KEY (id)` | Unique order identification. |

---

## 5. Financial State Terminology

To prevent operational ambiguity, the platform strictly delineates the five stages of transaction processing:

```
[Gateway Webhook Ingress]
         │  (HTTP webhook received & signed into payment_webhook_events)
         ▼
[Application Payment Confirmed]
         │  (payment_orders.status = 'paid', registration confirmed, participant created)
         ▼
[Bank Settlement Independently Verified]
         │  (Admin matches funds in merchant bank statement via UTR Verification Desk)
         ├── If capacity full & expired hold ──► [Refund Pending]
         │                                            │ (payment_refund_requests queued)
         │                                            ▼
         └─────────────────────────────────────► [Refund Completed]
                                                      (Bank payout executed & ledger updated)
```

1. **Gateway Notification Received (`payment_webhook_events`):**
   Indicates an external service posted a webhook payload. Does **not** signify that platform business rules have executed or that funds are settled.
2. **Application Payment Confirmed (`payment_orders.status = 'paid'`):**
   Indicates that platform business logic accepted the payment and confirmed tournament entry.
3. **Bank Settlement Independently Verified:**
   **Application `PAID` status is NOT bank settlement.** Bank settlement denotes physical credit into the merchant bank account, independently reconciled by an administrator via the UTR Verification Desk.
4. **Refund Pending (`payment_orders.status = 'refund_pending'`):**
   Indicates payment was collected, but the slot could not be fulfilled (e.g., late payment after hold expired and tournament filled). Funds are queued in `public.payment_refund_requests`.
5. **Refund Completed (`payment_orders.status = 'refunded'`):**
   Indicates that funds have been returned to the payer via gateway refund or direct bank reversal.

---

## 6. Test Evidence Summary

| Test Suite | File | Checks | Result |
| :--- | :--- | :--- | :--- |
| **Phase 4.2.1 Financial Integrity** | [`scripts/test-phase4-2-1-financial-integrity.ts`](file:///d:/Project/scripts/test-phase4-2-1-financial-integrity.ts) | 8 checks | **8 / 8 PASS ✅** |
| **Phase 4.2 Desk Integration** | [`scripts/test-phase4-2-verification-and-exceptions.ts`](file:///d:/Project/scripts/test-phase4-2-verification-and-exceptions.ts) | 8 checks | **8 / 8 PASS ✅** |
| **Phase 3.5.1 Regression Suite** | [`scripts/verify-phase3-5-1-read-only.ts`](file:///d:/Project/scripts/verify-phase3-5-1-read-only.ts) | 8 checks | **8 / 8 PASS ✅** |
| **Downstream SQL Probes** | Live PostgreSQL transactions with `ROLLBACK` | 7 business rules | **7 / 7 VERIFIED ✅** |
| **TypeScript Compilation** | `npx tsc --noEmit` | Whole codebase | **0 ERRORS ✅** |
| **ESLint Quality Check** | `npx eslint` | All Phase 4.2 files | **0 ERRORS ✅** |

---

## 7. Required Fixes (Proposed Database Migrations)

> [!IMPORTANT]
> The following migrations are **proposed only**. In accordance with strict phase restrictions, **no SQL has been executed** and no database schema changes have been made.

### 7.1. Proposed Migration: `20261105010000_harden_admin_audit_logs_rls.sql`
```sql
-- ============================================================================
-- Migration: 20261105010000_harden_admin_audit_logs_rls.sql
-- Description:
-- Enforces strict Row Level Security on public.admin_audit_logs to make
-- audit trails immutable and tamper-proof.
-- ============================================================================

-- 1. Enable & Force Row Level Security
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs FORCE ROW LEVEL SECURITY;

-- 2. Revoke dangerous mutating privileges from all non-superuser roles
REVOKE UPDATE, DELETE, TRUNCATE ON public.admin_audit_logs FROM PUBLIC, anon, authenticated;
REVOKE INSERT ON public.admin_audit_logs FROM anon;

-- 3. Read policy: Only allowlisted administrators can view audit logs
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins can view audit logs"
  ON public.admin_audit_logs FOR SELECT TO authenticated
  USING (public.is_admin());

-- 4. Insert policy: Only allowlisted administrators or service_role can insert
DROP POLICY IF EXISTS "Admins and service_role can insert audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins and service_role can insert audit logs"
  ON public.admin_audit_logs FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR auth.role() = 'service_role');
```

### 7.2. Proposed Migration: `20261105020000_create_payment_exceptions_ledger.sql`
```sql
-- ============================================================================
-- Migration: 20261105020000_create_payment_exceptions_ledger.sql
-- Description:
-- Provisions a persistent ledger for tracking and resolving payment exceptions.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payment_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference VARCHAR(64) UNIQUE NOT NULL,
  category VARCHAR(32) NOT NULL,
  severity VARCHAR(16) NOT NULL DEFAULT 'medium',
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  order_id UUID REFERENCES public.payment_orders(id) ON DELETE SET NULL,
  transaction_id UUID,
  webhook_event_id VARCHAR(100),
  reason TEXT NOT NULL,
  resolution_notes TEXT,
  assigned_to UUID REFERENCES auth.users(id),
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_payment_exceptions_status ON public.payment_exceptions(status);
CREATE INDEX IF NOT EXISTS idx_payment_exceptions_order_id ON public.payment_exceptions(order_id);

ALTER TABLE public.payment_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_exceptions FORCE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on payment_exceptions"
  ON public.payment_exceptions FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
```

---

## 8. Safety & Approval Recommendation

### Is Phase 4.2 Safe to Approve for Production?

**VERDICT: CONDITIONAL APPROVAL / APPROVAL WITHHELD FOR LIVE SETTLEMENT**

1. **Ready & Sound for Pre-Production / Staging:**
   - The UTR Verification Desk (`/admin/payments/verification`) is mechanically sound, transactionally secure, and verified against race conditions, duplicate claims, and capacity overflows.
   - Real-money payment processing remains strictly disabled.
2. **Blockers for Live Production Sign-Off:**
   - **Blocker 1:** Audit logs on `admin_audit_logs` are currently mutable by standard API clients because RLS is not active. This must be fixed with proposed migration `20261105010000`.
   - **Blocker 2:** Payment exception state updates (investigation/resolution notes) do not persist to disk, which would lead to operational confusion and loss of resolution history during live financial triage. This should be resolved with proposed migration `20261105020000`.

**Recommended Next Step:**
Review and authorize execution of the two proposed remedial migrations before initiating Phase 4.3 (Refund Operations Desk).
