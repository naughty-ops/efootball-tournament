# PHASE 2.1 — CHECKOUT EXPIRY AND GATEWAY CONTRACT AUDIT REPORT

**Project:** eFootball Tournament Platform + YOUPI PG  
**Date:** November 4, 2026  
**Status:** AUDIT COMPLETE & HARDENED — AWAITING PHASE 3 APPROVAL  

---

## 1. Executive Summary

Phase 2.1 conducts a focused, adversarial review of the reservation expiry lifecycle, the real YOUPI PG API contract, and payment verification authority boundaries. 

The audit identified three critical edge cases:
1. **Status Precedence Masking**: In both `/api/payment/status` and `/api/payment/stream`, `expired` evaluation previously preceded `manual_review_required`. If late payment evidence arrived after hold expiry, the user was shown "Reservation expired" while hiding that their payment had been captured into manual review.
2. **Missing Late/Unmatched Exception Handler**: There was no explicit server-side workflow for handling payments arriving after hold expiry or after tournament capacity had been filled.
3. **Out-of-Order Gateway Jitter**: Network race conditions could deliver delayed SSE or poller messages (e.g., `ACTIVE` after `PROCESSING`), risking client UI state regressions.

All three issues have been resolved, and a complete 10-point test suite (`scripts/test-phase2-1-expiry-and-contract.ts`) passes with 100% compliance.

---

## 2. Reservation Expiry Safety Audit

### Investigation of Key Expiry Questions

| Question | Findings & Ground Truth | Security Assessment |
| :--- | :--- | :--- |
| **1. What actually releases a reservation?** | Reservations are released exclusively on the database server through two paths: <br>1. **`reserve_tournament_slot` Step 4**: Sweeps expired rows (`pending_payment` and `reserved_until < now()`) whenever any user attempts a new reservation.<br>2. **`release_expired_reservations()`**: Stored procedure executed every 5 minutes by `pg_cron`. | **Secure**: No client can unilaterally release another player's hold; release is atomic and coupled with row-level locks. |
| **2. Does the browser merely display expiry, or does it trigger a backend mutation?** | The browser countdown in `YouPiCheckoutModal.tsx` is **strictly presentational**. When the timer hits `00:00`, it changes local state to `expired` and triggers a read-only `fetchStatus()` query to synchronize with the server. It executes **zero mutations** against the database. | **Secure**: Browser display cannot be spoofed to force server-side state cancellation. |
| **3. Can an expired YOUPI checkout session still accept a payment?** | Once a YOUPI session transitions to `EXPIRED`, pipeline stage 4 in `pollers.routes.js` finds `NO_ACTIVE_SESSION`. The funds are credited to the bank/VPA, but YOUPI's attribution engine diverts it to the **`LATE_UNMATCHED` / `MANUAL_REVIEW`** support path. | **Secure**: An expired session never auto-transitions to `SUCCESS` in YOUPI. |
| **4. Can a delayed payment observation arrive after reservation expiry?** | **Yes.** A player scanning the QR code at 14m 50s may have their SMS/bank statement poller deliver the observation at 15m 30s. | **Addressed**: Handled via `handleLateOrUnmatchedPayment` exception workflow. |
| **5. Can an expired order later become paid?** | If late payment evidence arrives for an expired order, it **must not** automatically enroll the player. Instead, `handleLateOrUnmatchedPayment` captures the transaction and routes the order to `manual_review_required`. | **Addressed**: Prevents unauthorized participant creation while preserving audit trail. |
| **6. What happens when a payment is received after the tournament becomes full?** | When `confirmed_slots_count >= max_participants`, `handleLateOrUnmatchedPayment` flags the order as `LATE_PAYMENT_TOURNAMENT_FULL`, prevents enrollment (`canEnrollParticipant: false`), and queues the transaction for refund and manual review. | **Secure**: Overselling tournament slots is mathematically impossible. |
| **7. Can the same player recover their original payment reference?** | When an expired reservation is swept, a subsequent registration attempt cleans up the old record and issues a new reservation and order reference, while the historical order retains its gateway reference and audit log. | **Secure**: No key collisions; clean audit trail maintained. |

---

## 3. Actual YOUPI API Contract Verification

Direct inspection of `D:\Project\youpi-pg\apps\payment-api\src\routes\`:

### 1. `GET /api/v1/checkout/:id/state`
- **Authentication**: Publicly callable with session device checks (`checkSessionDeviceAccess`). If caller is not the payment owner or customer, customer PII (`name`, `email`, `phone`) and merchant metadata are strictly redacted.
- **Expiry Enforcement**: Lines 446–461: If `session.status === ACTIVE` and `expiresAt <= now`, it actively transitions session to `EXPIRED`, broadcasts SSE `status_change: { status: 'EXPIRED' }`, and returns `timeRemainingSeconds: 0, isTerminal: true`.
- **Payload Sanitization**: Payee VPA, amount, order ID, and public branding are returned. No merchant API keys or secrets are exposed.

### 2. `GET /api/v1/checkout/:id/stream`
- **Protocol**: Server-Sent Events (SSE).
- **Events Broadcasted**:
  - `status_change`: `{ status: 'ACTIVE' | 'PROCESSING' | 'MANUAL_REVIEW' | 'SUCCESS' | 'EXPIRED' | 'FAILED' }`
  - `state_change`: `{ status: ... }`
- **Device Access**: Enforces device binding to prevent unauthorized cross-device session eavesdropping.

### 3. Session Lookup by Merchant Order ID
- `GET /api/v1/orders/:orderId/cod`: Looks up sessions by merchant `orderId` (requires merchant authorization).
- `POST /api/v1/payments`: When provided with an existing merchant `orderId`, if an active session exists, it returns `activeSessionDetected: true` with `paymentId` and `checkoutUrl`. If terminal, it allows a retry with the same order reference.

### 4. eFootball SSE Proxy Sanitization Audit
Inspection of `app/api/payment/stream/route.ts`:
- **Auth Guard**: Rejects anonymous callers with `401 Unauthorized` and cross-account access attempts with `403 Forbidden`.
- **Payload Out**: Emits only `{ orderId, status, message, reservedUntil, timeRemainingSeconds, timestamp }`.
- **Secret Isolation**: 100% clean of `merchantSecret`, `apiKey`, `webhookSecret`, and internal database credentials.

---

## 4. Payment Status Authority Hierarchy

| Phase | Authoritative Source | Verification Boundary Rule |
| :--- | :--- | :--- |
| **Checkout Session Created** | eFootball `payment_orders` (`created`) + YOUPI PG (`ACTIVE` / `INITIATED`) | Provisional hold only; slot held for 15 minutes. |
| **UPI Intent Initiated** | Browser deep link / QR render | Telemetry only; no funds verified. |
| **Payment Observed** | YOUPI SMS / Gmail Observer (`PROCESSING` / `OBSERVED_SUCCESS`) | Provisional signal only. Displays amber "Verifying Settlement". **Never confirms enrollment.** |
| **Pending Verification** | eFootball `payment_orders` (`pending_verification`) | Telemetry recorded; awaiting reconciliation. |
| **Independent Bank Verification** | Bank Statement / Authorized Reconciler | Verification Level 3 required. |
| **Payment Reconciled & Confirmed** | eFootball Database (`paid`) | Triggers `participants` enrollment and confirmed registration badge. |

---

## 5. Hardened Changes Implemented

### 1. Late / Unmatched Payment Exception Workflow
- **File**: [`lib/payment/payment-service.ts`](file:///D:/Project/lib/payment/payment-service.ts)
- **Function**: `handleLateOrUnmatchedPayment(input, dbClient)`
- **Behavior**:
  - Detects if payment evidence arrives after hold expiry or when tournament is full.
  - Updates order status to `manual_review_required`.
  - Attaches detailed diagnostic notes and logs an entry to `admin_audit_logs`.
  - Sets `canEnrollParticipant = false`, preventing automatic participant creation.

### 2. Status Precedence Correction
- **Files**: [`app/api/payment/status/route.ts`](file:///D:/Project/app/api/payment/status/route.ts) & [`app/api/payment/stream/route.ts`](file:///D:/Project/app/api/payment/stream/route.ts)
- **Correction**: Re-ordered precedence so `manual_review_required` and `pending_verification` evaluate before `expired`. Late payments now accurately display the manual review notice rather than showing "Reservation expired".

### 3. Monotonic Status Progression
- **Files**: [`lib/payment/client-utils.ts`](file:///D:/Project/lib/payment/client-utils.ts) & [`components/tournament/YouPiCheckoutModal.tsx`](file:///D:/Project/components/tournament/YouPiCheckoutModal.tsx)
- **Function**: `canTransitionClientStatus(currentStatus, nextStatus)`
- **Behavior**: Blocks lagging or out-of-order events from downgrading `confirmed`, `manual_review`, `pending_verification`, or `payment_observed` back to `awaiting_payment`.

---

## 6. Verification & Automated Test Results

### A. Phase 2.1 Audit Suite (`scripts/test-phase2-1-expiry-and-contract.ts`)
All 10 checks passed:

```
===============================================================
   PHASE 2.1 — CHECKOUT EXPIRY & GATEWAY CONTRACT AUDIT
===============================================================

[PASS] Check #1 [Expiry Authority] Browser countdown reaching 0 does not mutate server reservation directly
[PASS] Check #2 [Exception Workflow] Expired checkout with delayed payment observation triggers manual review (no auto-enroll)
[PASS] Check #3 [Exception Workflow] Bank payment arriving after reservation expiry is preserved in manual review
[PASS] Check #4 [Capacity Protection] Late payment when tournament capacity is full blocks enrollment and queues for refund
[PASS] Check #5 [Recovery Workflow] Expired checkout recovery sweeps old reservation and allocates new slot cleanly
[PASS] Check #6 [Fault Tolerance] SSE disconnect during expiry triggers immediate fallback polling
[PASS] Check #7 [Security Boundary] Unauthorized SSE connection rejected with 401 (anon) and 403 (wrong user)
[PASS] Check #8 [Data Sanitization] SSE payload forwards strictly sanitized player status without merchant credentials
[PASS] Check #9 [State Machine] Out-of-order gateway events cannot degrade confirmed or in-review status
[PASS] Check #10 [Free Tournaments] Free tournament registration completely bypasses payment orders and checkout modal

===============================================================
   PHASE 2.1 AUDIT SUMMARY: 10/10 PASSED (0 FAILED)
===============================================================
```

### B. Regression Suite Verification
1. `scripts/test-phase2-checkout-ui.ts`: **14 / 14 PASSED**
2. `scripts/test-phase1-reliability-and-security.ts`: **10 / 10 PASSED**
3. `scripts/test-youpi-payment-phase1.ts`: **12 / 12 PASSED**
4. `scripts/test-tournament-creation-and-registration.ts`: **12 / 12 PASSED**
5. `scripts/verify-rules-acceptance.ts`: **4 / 4 PASSED**
6. `npx tsc --noEmit`: **0 Errors**

---

## 7. Remaining Risks & Phase 3 Readiness

| Risk | Mitigation | Status |
| :--- | :--- | :--- |
| **High Webhook Ingestion Volume** | Phase 3 will introduce idempotent webhook handlers with signature verification and replay caching. | Ready for Phase 3 |
| **Manual Review Escalations** | Admin review UI will be required for support staff to reconcile flagged transactions. | Scheduled for Phase 4 |
| **Real Payment Processing** | Kept disabled in development mode. No real money or credentials used. | Controlled |

### Phase 3 Verdict
**SAFE TO PROCEED TO PHASE 3 (Webhook Lifecycle & Bank Settlement Ingestion)** upon user approval.
