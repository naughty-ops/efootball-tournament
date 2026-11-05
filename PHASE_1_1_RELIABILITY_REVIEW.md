# PHASE 1.1: YOUPI PG INTEGRATION RELIABILITY & SECURITY REVIEW

**Project:** eFootball Tournament Platform  
**Integration Gateway:** YOUPI PG Standalone Infrastructure  
**Author:** Senior Application Security & Payment Systems Engineer  
**Date:** November 4, 2026  
**Status:** Review & Remediation Complete — Ready for Phase 2  

---

## 1. Executive Summary

Following the initial Phase 1 delivery, an adversarial reliability and security audit was conducted targeting edge cases in payment order initiation: network drops, gateway timeouts, database persistence failures, concurrent registration race conditions for the final tournament slot, duplicate player submissions, and verification boundary invariants.

All identified defects were remediated directly in `lib/payment/payment-service.ts`, `lib/payment/types.ts`, and a new module [`lib/payment/verification-boundary.ts`](file:///d:/Project/lib/payment/verification-boundary.ts).

Two dedicated test suites—[`scripts/test-phase1-reliability-and-security.ts`](file:///d:/Project/scripts/test-phase1-reliability-and-security.ts) (10 checks) and [`scripts/test-youpi-payment-phase1.ts`](file:///d:/Project/scripts/test-youpi-payment-phase1.ts) (12 checks)—now pass at **100%**, alongside all existing registration regression suites and strict TypeScript compilation.

---

## 2. Defects Discovered & Remediations

### Defect 1: Premature Slot Release on Gateway Timeouts & Network Drops
* **Root Cause:** In the initial implementation, any error thrown by `youpiProvider.createPaymentOrder` caught by the service immediately marked `payment_orders.status = 'failed'` and `tournament_registrations.status = 'cancelled'`.
* **Impact:** In the event of a network blip or gateway processing delay where YOUPI PG *did* create the payment session, eFootball cancelled the player's slot reservation. Another competitor could claim the slot, leading to an oversold tournament if the original player subsequently paid.
* **Remediation:** 
  * Classify gateway errors into **definitive client rejections** (HTTP 4xx / `YouPiValidationError`) versus **indeterminate outcomes** (HTTP 5xx, `YouPiTimeoutError`, `YouPiNetworkError`).
  * On indeterminate outcomes, **never cancel the reservation**. The reservation status remains `pending_payment` with its 15-minute `reserved_until` expiry timer intact.
  * The payment order transitions to `attempted` with diagnostic notes (`manual_review_notes: 'Indeterminate gateway outcome: ...'`).

### Defect 2: Inability to Recover Gateway Sessions on Player Retry
* **Root Cause:** If a gateway request timed out or database persistence failed after receiving the payment ID, subsequent calls did not attempt to re-connect to the existing gateway session.
* **Impact:** Players attempting to retry were either blocked or risked creating orphaned sessions on YOUPI PG.
* **Remediation:**
  * Implemented an idempotent session recovery loop in `initiateTournamentRegistration`.
  * When an unexpired reservation exists with an order in `created`, `attempted`, or `manual_review_required` lacking gateway IDs, the service re-dispatches to YOUPI PG using the identical deterministic `orderId: existingOrder.id` and `idempotencyKey: existingOrder.id`.
  * YOUPI PG's `findByOrderId` finds the existing session and returns HTTP 200 OK with `activeSessionDetected: true`. eFootball updates the database and resumes the checkout session seamlessly.

### Defect 3: Microtask Race Condition on Duplicate Order Creation
* **Root Cause:** If a player fired multiple simultaneous registration requests in the same microsecond tick, all requests saw 0 existing orders and attempted to insert into `payment_orders`.
* **Impact:** Multiple duplicate order records could be created for a single registration hold.
* **Remediation:**
  * Added active order pre-checking on `registration_id`.
  * Added PostgreSQL `23505` unique constraint conflict handling on `payment_orders.insert`. If a parallel worker inserts an order first, secondary workers catch the duplicate key error, fetch the newly created order, and continue without error.

### Defect 4: Race Condition for Final Available Tournament Slot
* **Root Cause:** Application-level counting (`confirmedCount + activeReservations < max_participants`) allows two simultaneous requests to both see 1 slot remaining and both insert reservations.
* **Impact:** A 16-player tournament could admit 17 competitors.
* **Remediation:**
  * Delegated provisional reservation creation to the existing PostgreSQL stored procedure `public.reserve_tournament_slot(p_tournament_id, p_user_id, p_hold_duration_minutes)`.
  * `reserve_tournament_slot` performs `SELECT ... FOR UPDATE` row-locking on the `tournaments` record, serializing concurrent attempts.
  * Backed by the physical check constraint `chk_tournaments_slots` (`confirmed_slots_count + reserved_slots_count <= max_participants`), which aborts any transaction violating the ceiling.

### Defect 5: Ambiguity in Payment Verification Boundary
* **Root Cause:** Risk of telemetry (browser events, QR scans, manual UTR entries, SMS notifications, Gmail notifications) prematurely confirming payment.
* **Impact:** Fraudulent enrollment through telemetry spoofing.
* **Remediation:**
  * Created `lib/payment/verification-boundary.ts` with `evaluateVerificationEvidence()`.
  * Codified the immutable rule:
    * Browser success $\rightarrow$ Unverified telemetry (Level 0, status `attempted`).
    * QR scan $\rightarrow$ Intent only (Level 0, status `attempted`).
    * Manual UTR $\rightarrow$ Unverified user input (Level 0, status `pending_verification`).
    * SMS observation $\rightarrow$ Single-source mobile telemetry (Level 1, status `pending_verification`).
    * Gmail observation $\rightarrow$ Single-source email telemetry (Level 1, status `pending_verification`).
    * Dual SMS + Gmail $\rightarrow$ High-confidence telemetry (Level 2, status `pending_verification`).
    * **Settlement Invariant:** ONLY independently verified core bank evidence via `public.reconcile_and_confirm_payment` by an authorized admin establishes the final `'paid'` status.

### Defect 6: Audit Trail Gap
* **Root Cause:** Status transitions did not record structured before/after states and actor metadata.
* **Remediation:** Implemented `recordAuditTransition()` recording `previousStatus`, `newStatus`, `timestamp`, `actor`, `reason`, and `gatewayReference` into `admin_audit_logs`.

---

## 3. Files Created & Modified

| File | Action | Description |
| :--- | :--- | :--- |
| `lib/payment/verification-boundary.ts` | **Created** | Authoritative verification level and settlement evaluation rules. |
| `lib/payment/payment-service.ts` | **Modified** | Hardened timeout resilience, indeterminate state handling, session recovery, RPC integration, parallel order conflict handling, and transition auditing. |
| `lib/payment/types.ts` | **Modified** | Added `canRetry?: boolean` to registration result interface. |
| `lib/payment/index.ts` | **Modified** | Exported `verification-boundary`. |
| `scripts/test-phase1-reliability-and-security.ts` | **Created** | 10-check reliability and security automated test suite. |
| `scripts/test-youpi-payment-phase1.ts` | **Modified** | Updated checks 8, 9, 10 to reflect indeterminate state on timeouts. |

---

## 4. Database Schema & RPC Verification

* **Zero DDL Migrations Required:** All required database structures already exist in Supabase PostgreSQL:
  * `chk_tournaments_slots`: `CHECK (((confirmed_slots_count >= 0) AND (reserved_slots_count >= 0) AND ((confirmed_slots_count + reserved_slots_count) <= max_participants)))`
  * `idx_active_tournament_registration`: `UNIQUE (tournament_id, user_id) WHERE status IN ('pending_payment', 'confirmed')`
  * `reserve_tournament_slot`: RPC locking `tournaments` row `FOR UPDATE`, clearing expired holds, enforcing capacity, and incrementing `reserved_slots_count`.
  * `reconcile_and_confirm_payment`: Privileged RPC guarded by `IF NOT public.is_admin() THEN RETURN false ... END IF;`. Verified that no public client routes expose this RPC.

---

## 5. Automated Tests Executed & Exact Results

### 1. Dedicated Reliability & Security Suite (`scripts/test-phase1-reliability-and-security.ts`)

```text
================================================================
  YOUPI PG INTEGRATION: RELIABILITY & SECURITY VERIFICATION
================================================================

[PASS] Check #1 [Timeout Handling] Gateway Timeout Yields Indeterminate State Without Cancelling Reservation: OrderStatus: attempted, RegStatus: pending_payment
[PASS] Check #2 [Session Recovery] Player Retry Recovers Existing Gateway Session Without Duplicates: RecoveredPaymentId: pay_recovered_999888, TotalOrders: 1, OrderStatus: attempted
[PASS] Check #3 [Persistence Resilience] Reservation Preserved on Persistence Failure and Healed on Retry: HoldPreserved: true, HealedPaymentId: pay_persist_recovery_123
[PASS] Check #4 [Concurrency Control] Atomic Serialization Prevents Overselling Last Available Slot: SuccessCount: 1, RejectedCount: 1, TotalOccupied: 16/16
[PASS] Check #5 [Idempotency] Simultaneous Duplicate User Requests Produce Exactly One Reservation: TotalRegistrationsInDb: 1, TotalOrdersInDb: 1
[PASS] Check #6 [Slot Protection] Unresolved In-Flight Session Blocks Interceptor Registration: Interceptor blocked: true, Message: "Tournament is full. No slots available."
[PASS] Check #7 [Verification Boundary] SMS-Only Observation Confined to Pending Verification (Not Paid): Status: pending_verification, IsSettlement: false, Level: 1
[PASS] Check #8 [Verification Boundary] Gmail-Only Observation Confined to Pending Verification (Not Paid): Status: pending_verification, IsSettlement: false, Level: 1
[PASS] Check #9 [Verification Boundary] Dual SMS + Gmail Match Confined to Pending Verification (Not Paid): Status: pending_verification, IsSettlement: false, Level: 2
[PASS] Check #10 [Free Tournaments] Free Tournament Direct Registration Completely Preserved: isPaid: false, ParticipantCreated: true, PaymentOrdersCreated: 0

================================================================
  TOTAL RELIABILITY CHECKS: 10 | PASSED: 10 | FAILED: 0 (100%)
================================================================
```

### 2. Phase 1 Core Test Suite (`scripts/test-youpi-payment-phase1.ts`)
* **12 / 12 Tests Passed (100%)**

### 3. Existing Registration Regressions
* `scripts/test-tournament-creation-and-registration.ts`: **12 / 12 Tests Passed (100%)**
* `scripts/verify-rules-acceptance.ts`: **4 / 4 Checks Passed (100%)**
* `npx tsc --noEmit`: **0 TypeScript compilation errors**

---

## 6. Remaining Risks & Phase 2 Safety Assessment

| Area | Current State | Risk Level | Mitigation for Phase 2 |
| :--- | :--- | :--- | :--- |
| **Gateway Session In-Flight** | Reservation held for 15 minutes; recoverable on retry. | **Low** | Checkout UI will poll `/api/v1/checkout/:id/state` and SSE. |
| **High Concurrency Spikes** | PostgreSQL `reserve_tournament_slot` row-locks tournament rows. | **Low** | Supported natively by PostgreSQL connection pooling. |
| **Unverified Telemetry** | Confined strictly to `pending_verification`. | **Zero** | No auto-enrollment path exists without bank reconciliation. |
| **Client Spoofing** | Privileged RPCs require `is_admin()`; provider adapter is server-only. | **Zero** | Cryptographic secrets isolated to server environment. |

### Verdict on Phase 2
**Phase 2 (Checkout UI & Modal Component) is SAFE TO BEGIN.**  
The backend contract, concurrency guarantees, timeout resilience, and database-level invariants are verified and regression-tested.

---

### Awaiting Approval
No frontend checkout UI or webhooks have been implemented. Review the findings and authorize Phase 2 when ready.
