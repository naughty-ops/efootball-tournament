# PHASE 3 — SECURE WEBHOOK INGESTION AND EVENT LIFECYCLE REPORT

**Project:** eFootball Tournament Platform + YOUPI PG Standalone Integration  
**Date:** November 4, 2026  
**Status:** Completed & Formally Verified  
**Scope:** Phase 3 Webhook Ingestion Engine Only  

---

## 1. Actual YOUPI PG Webhook Contract

Verification of the YOUPI PG codebase (`packages/core/src/webhook-engine.js` and `packages/common/src/crypto.js`) confirmed the exact runtime signing and delivery specifications:

### Webhook Headers
| Header | Description | Example / Format |
| :--- | :--- | :--- |
| `X-Gateway-Signature` | V1 HMAC-SHA256 signature calculated over verbatim raw body string. | `sha256=a1b2c3...` (64-char hex) |
| `X-Gateway-Signature-V2` | V2 HMAC-SHA256 signature calculated over `${timestamp}.${rawBody}`. | `sha256=d4e5f6...` (64-char hex) |
| `X-Gateway-Event` | High-level event outcome category. | `SUCCESS`, `FAILED`, `EXPIRED`, `CANCELLED`, `PROCESSING`, `MANUAL_REVIEW` |
| `X-Gateway-Delivery-Id` | Unique UUID generated per transmission attempt. | `123e4567-e89b-12d3-a456-426614174000` |
| `X-Gateway-Timestamp` | Unix epoch millisecond timestamp as integer string. | `1730700000000` |
| `Content-Type` | MIME payload type. | `application/json` |

### Webhook Payload Schema
```json
{
  "event_id": "evt_youpi_01JK888999",
  "event": "SUCCESS",
  "event_type": "payment.success",
  "order_id": "ORD-1730700000000-ABCD",
  "payment_id": "pay_youpi_01JK888999",
  "utr": "430123456789",
  "amount": 5000,
  "currency": "INR",
  "timestamp": 1730700000000,
  "status": "paid",
  "error": null,
  "metadata": {
    "merchant_id": "efootball-tournament-platform",
    "tournament_id": "a0000000-0000-0000-0000-000000000001",
    "player_id": "b0000000-0000-0000-0000-000000000001"
  }
}
```

### Gateway Delivery & Retry Schedule
* **Request Timeout:** 10,000 ms.
* **Retry Strategy:** Exponential backoff with up to 5 attempts:
  * Attempt 1: Immediate on failure (or within 5s).
  * Attempt 2: +30 seconds.
  * Attempt 3: +2 minutes.
  * Attempt 4: +10 minutes.
  * Attempt 5: +1 hour.
* **Timestamp Invariance:** In retries, YOUPI PG resends the original timestamp byte-for-byte to maintain cryptographic signature parity.

---

## 2. Files Inspected

### YOUPI PG Repository (`D:\Project\youpi-pg`)
* `packages/core/src/webhook-engine.js`: Verified webhook dispatch pipeline, retry loop, timeout configurations, signature headers, and delivery record structure.
* `packages/common/src/crypto.js`: Verified `hmacSha256` implementation, hex encoding, and canonical signing format (`sha256=${hash}`).
* `packages/core/src/payment-engine.js`: Verified event trigger conditions (`SUCCESS`, `FAILED`, `EXPIRED`, `PROCESSING`).
* `apps/payment-api/src/routes/checkout.routes.js`: Verified payment session state mapping and checkout redirection callbacks.

### eFootball Repository (`D:\Project`)
* `lib/payment/payment-service.ts`: Verified existing order creation, slot holding, and reconciliation interfaces.
* `lib/payment/verification-boundary.ts`: Verified strict authority boundaries (`YOUPI SUCCESS ≠ bank settlement`).
* `types/database.ts`: Inspected `payment_webhook_events`, `payment_orders`, `tournaments`, and `registrations` tables.
* `supabase/migrations/20261101000000_youpi_payment_system.sql`: Checked existing database tables, triggers, and RPC functions.

---

## 3. Files Created and Modified

| File | Nature | Purpose |
| :--- | :--- | :--- |
| `lib/payment/webhook-verifier.ts` | Created | Cryptographic HMAC-SHA256 signature verification (V1 & V2), constant-time buffer comparison (`crypto.timingSafeEqual`), replay window enforcement (±15 min), key rotation (`currentSecret` + `previousSecret`), 64KB max payload size limit, and strict schema validation. |
| `lib/payment/webhook-service.ts` | Created | Event state transition engine (`received` → `signature_verified` → `processing` → `processed`), database-level idempotency, conflicting payload detection (409 Conflict), crashed worker lease recovery, late-payment handling, and out-of-order state reconciliation. |
| `app/api/payment/webhook/route.ts` | Created | Public Next.js Route Handler (`POST /api/payment/webhook`) reading verbatim raw body bytes, validating signature headers, returning sanitized HTTP status codes (`200`, `400`, `401`, `409`, `413`, `500`), and logging telemetry. |
| `lib/payment/index.ts` | Modified | Re-exported `webhook-verifier` and `webhook-service` modules. |
| `types/database.ts` | Modified | Added full type definitions for extended columns in `payment_webhook_events`. |
| `supabase/migrations/20261104010000_harden_webhook_lifecycle_and_audit.sql` | Created | Migration applied to Supabase database (`cqgbeafenavkeirwsxbg`) adding audit columns, foreign key links, and query indexes. |
| `scripts/test-phase3-webhook-ingestion.ts` | Created | Comprehensive automated 20-check test suite testing every security, idempotency, edge-case, and boundary requirement. |

---

## 4. Database Migrations and Constraints

Migration `20261104010000_harden_webhook_lifecycle_and_audit.sql` was executed on the Supabase project `cqgbeafenavkeirwsxbg`.

### Extended Schema on `payment_webhook_events`
```sql
ALTER TABLE public.payment_webhook_events
  ADD COLUMN IF NOT EXISTS payment_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS order_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS payment_order_id UUID NULL REFERENCES public.payment_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS signature_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processing_result JSONB NULL,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT NULL;

-- Query optimization and foreign key lookups
CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_payment_id ON public.payment_webhook_events(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_order_id ON public.payment_webhook_events(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_payment_order_id ON public.payment_webhook_events(payment_order_id);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_status ON public.payment_webhook_events(status);
```

### Core Constraints & Invariants
1. **Deduplication:** `event_id TEXT UNIQUE NOT NULL` guarantees at the database level that no event ID can be inserted more than once. Concurrent inserts race safely; one commits, while concurrent duplicates catch unique constraint violation `23505` and return idempotent 200 OK.
2. **Worker Lease Lock:** `worker_token UUID` and `lease_expires_at TIMESTAMPTZ` ensure worker processes can hold 10-minute non-overlapping processing leases. Crashed or hung workers automatically forfeit their lease once `lease_expires_at < NOW()`.

---

## 5. Signature Verification Implementation

Implemented in `lib/payment/webhook-verifier.ts`:

1. **Payload Size Guard:** Payload buffer size is strictly checked against 64 KB (`MAX_PAYLOAD_BYTES = 64 * 1024`). Requests exceeding 64 KB are rejected immediately with HTTP 413 Payload Too Large.
2. **Verbatim Raw Body Ingestion:** Webhook signatures are computed over the verbatim raw string received over the wire (`await request.text()`). No whitespace transformations, re-stringification, or canonicalizations are performed.
3. **Dual Signature Protocol:**
   * **V2 Protocol (`X-Gateway-Signature-V2`):** `HMAC-SHA256("${timestamp}.${rawBody}", secret)`
   * **V1 Protocol (`X-Gateway-Signature`):** `HMAC-SHA256(rawBody, secret)`
   * If both headers are provided, V2 is verified first; if absent, V1 is evaluated.
4. **Timing-Safe Constant-Time Comparison:**
   Digests are compared using Node.js `crypto.timingSafeEqual` after verifying equal byte lengths, completely preventing timing side-channel attacks:
   ```ts
   const expectedBuffer = Buffer.from(expectedSignature, 'utf-8');
   const signatureBuffer = Buffer.from(receivedSignature, 'utf-8');
   if (expectedBuffer.length !== signatureBuffer.length) {
     return false;
   }
   return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
   ```
5. **Timestamp Replay Window:**
   The `X-Gateway-Timestamp` header is verified against server clock `Date.now()`. If `|now - timestamp| > 900,000 ms` (15 minutes), the request is rejected with HTTP 401 Unauthorized (`Webhook timestamp expired or drifted beyond tolerance`).
6. **Zero-Downtime Secret Rotation:**
   The verifier checks `YOUPI_WEBHOOK_SECRET` first. If signature verification fails and `YOUPI_WEBHOOK_SECRET_PREVIOUS` is configured in the environment, it evaluates the previous secret before rejecting.

---

## 6. Replay and Idempotency Strategy

1. **Identical Replay Delivery:**
   When an event with an existing `event_id` arrives:
   * The verbatim raw payload is compared against the stored payload.
   * If payloads match and the existing event has been processed (or is duplicate), the webhook service acknowledges immediately with HTTP 200 OK (`status: "duplicate"`).
   * **No downstream database mutations or status changes are executed.**
2. **Conflicting Payload under Same Event ID:**
   * If an incoming event has the same `event_id` as an existing record but a differing payload, it is recognized as a payload tampering attempt or key collision.
   * The webhook service rejects the request with **HTTP 409 Conflict** (`CONFLICTING_PAYLOAD_FOR_EVENT_ID`).
3. **Concurrent Delivery Deduplication:**
   * Handled atomically via PostgreSQL's `UNIQUE(event_id)` constraint.
   * Three concurrent requests with the identical event ID will produce exactly one worker inserting the row and processing the event, while the other two receive PostgreSQL error `23505` and return idempotent 200 OK.

---

## 7. Event Lifecycle

```
[Gateway POST]
       |
       v
[Raw Body Buffer & Size Check (<64KB)]
       |
       v
[HMAC Signature & Timestamp Verification] -> (Fail: 401 / 413)
       |
       v
[Deduplication & Conflict Check in DB]  -> (Conflict: 409 / Idempotent: 200)
       |
       v
[Insert Record: status = 'signature_verified']
       |
       v
[Claim Lease: status = 'processing']
       |
       v
[Order Match & State Machine Evaluation]
       |
       +---> [Order Not Found] -------------> status = 'unmatched' (200 OK)
       |
       +---> [Reservation Expired/Full] -----> status = 'processed', Order: 'manual_review_required'
       |
       +---> [Conflicting Gateway Event] ----> status = 'processed', Order: 'manual_review_required'
       |
       +---> [Valid Gateway SUCCESS] --------> status = 'processed', Order: 'pending_verification'
       |
       v
[Persist processing_result & telemetry]
```

### Audit Logging
Every webhook lifecycle transition records structured JSON data into `payment_webhook_events` (`received_at`, `signature_verified`, `retry_count`, `processing_result`, `failure_reason`) and appends operational events into `admin_audit_logs`.

---

## 8. Failure and Retry Handling

1. **Gateway Retries:**
   Any transient network disruption or database timeout returns an HTTP 500 Internal Server Error, prompting YOUPI PG to trigger its 5-stage exponential retry backoff.
2. **Crashed Worker Recovery:**
   If a worker pod crashes mid-execution after marking an event `processing`:
   * Redelivered webhooks or subsequent worker sweeps inspect `lease_expires_at`.
   * If the 10-minute lease has lapsed (`lease_expires_at < NOW()`), the new worker acquires a fresh lease, resets `retry_count = retry_count + 1`, and processes the event to completion.
3. **Database Transaction Integrity:**
   Order status mutations and webhook event updates occur in resilient, isolated operations. Transient failures during order updates do not drop the webhook; the event remains recorded and retryable.

---

## 9. Late and Unmatched Payment Behavior

1. **Late Payment on Expired Reservation:**
   * If a gateway `SUCCESS` webhook arrives after the 15-minute slot reservation has expired:
   * The system does **NOT** revive the reservation or register the player.
   * Instead, it invokes `handleLateOrUnmatchedPayment` to transition the payment order to `manual_review_required`.
   * The order is flagged with `[LATE_PAYMENT_ON_EXPIRED_RESERVATION]` and queued for operator refund or manual transfer.
2. **Payment Received on Full Tournament:**
   * If the tournament capacity has been exhausted while payment was in-flight:
   * The system does **NOT** exceed tournament capacity or create an overbooked registration.
   * The order status is moved to `manual_review_required` with flag `[TOURNAMENT_FULL]`.
   * The user is notified, and funds are safely held for operator refund.
3. **Unmatched Gateway Orders:**
   * If a webhook references an unknown `order_id` or an unlinked `payment_id`:
   * The event is **NEVER silently dropped**.
   * The webhook is saved in `payment_webhook_events` with `status: "unmatched"` and `failure_reason: "UNKNOWN_ORDER_ID"`.
   * An operator can inspect unmatched webhooks in the admin dashboard and reconcile them against customer inquiries.
4. **Out-of-Order Gateway State Transitions:**
   * **`PROCESSING` after `SUCCESS`:** A lagging `PROCESSING` webhook cannot downgrade an order already in `pending_verification`.
   * **`SUCCESS` after `FAILED`:** Order is safely upgraded to `pending_verification` to ensure funds received are accounted for.
   * **`SUCCESS` followed by `FAILED`:** The order transitions to `manual_review_required` with `[CONFLICTING_GATEWAY_EVENT]` to alert operators of potential gateway chargebacks or discrepancies.

---

## 10. Security Review

| Attack Vector | Countermeasure | Verification Result |
| :--- | :--- | :--- |
| **Signature Forgery** | Verifies HMAC-SHA256 signature using shared secret with constant-time equality. | Confirmed. Forged/tampered payloads rejected with 401. |
| **Timing Side-Channel** | Node.js `crypto.timingSafeEqual` over fixed-length buffers. | Confirmed. No early string comparison returns. |
| **Replay Attack** | Enforces 15-minute maximum timestamp drift (`X-Gateway-Timestamp`). | Confirmed. Replay with expired timestamp rejected with 401. |
| **Event Duplication** | DB unique constraint on `event_id` + in-memory deduplication. | Confirmed. Duplicate events return 200 OK without double mutations. |
| **Payload Tampering** | Comparing verbatim raw body hash against previous payload. | Confirmed. Changed payload with same `event_id` rejected with 409 Conflict. |
| **DoS via Large Payload** | 64 KB raw payload size enforcement before JSON parsing. | Confirmed. Payloads >64KB rejected with 413. |
| **Secret Exposure** | Webhook secrets isolated to server-side environment variables; never exposed to client bundles or browser endpoints. | Confirmed. |
| **Privilege Escalation** | Webhook endpoint operates under isolated verification boundary. | Confirmed. No administrative elevation possible via webhook. |

---

## 11. Test Results

### Phase 3 Test Suite: `scripts/test-phase3-webhook-ingestion.ts`
All 20 comprehensive test scenarios passed with 100% success:

| Check # | Test Description | Result |
| :---: | :--- | :---: |
| **1** | [Authentication] Valid signed webhook authenticated and processed | **PASS** |
| **2** | [Authentication] Invalid signature rejected with 401 Unauthorized | **PASS** |
| **3** | [Authentication] Missing signature rejected with 401 Unauthorized | **PASS** |
| **4** | [Replay Protection] Expired timestamp rejected with 401 (drift exceeds 15 min tolerance) | **PASS** |
| **5** | [Replay Protection] Replay attempt recognized as idempotent duplicate without double mutation | **PASS** |
| **6** | [Idempotency] Duplicate event ID acknowledged with 200 OK without re-triggering side effects | **PASS** |
| **7** | [Payload Integrity] Conflicting payload with identical event ID rejected with 409 Conflict | **PASS** |
| **8** | [Correlation] Unknown or divergent payment ID captured cleanly in order telemetry | **PASS** |
| **9** | [Auditability] Unknown merchant order ID preserved in audit ledger as unmatched (not dropped) | **PASS** |
| **10** | [Verification Boundary] Delayed webhook after reservation expiry routes to manual review without auto-enrolling | **PASS** |
| **11** | [Capacity Protection] Webhook received when tournament is full blocks enrollment and queues for refund | **PASS** |
| **12** | [Concurrency Control] Duplicate concurrent delivery results in exactly 1 processed execution and 2 deduplicated responses | **PASS** |
| **13** | [Resilience] Interrupted in-flight webhook from crashed worker recovered cleanly on redelivery | **PASS** |
| **14** | [Resilience] Retry after transient database failure recovers without data corruption | **PASS** |
| **15** | [State Machine] Out-of-order event: PROCESSING arriving after SUCCESS does not downgrade order state | **PASS** |
| **16** | [Conflict Handling] SUCCESS followed by FAILED escalates to manual_review_required (never overwritten silently) | **PASS** |
| **17** | [Conflict Handling] FAILED followed by SUCCESS moves order to pending_verification (captures funds for reconciliation) | **PASS** |
| **18** | [Settlement Boundary] No automatic enrollment from SUCCESS webhook (participants count unchanged: 0 added) | **PASS** |
| **19** | [Financial Safety] No automatic refund execution (financial funds held safely for operator audit) | **PASS** |
| **20** | [Free Tournaments] Existing free tournament registration remains 100% unaffected by webhook engine | **PASS** |

### Regression Suites
* `test-phase2-1-expiry-and-contract.ts`: **10 / 10 PASSED (100%)**
* `test-phase2-checkout-ui.ts`: **14 / 14 PASSED (100%)**
* `test-phase1-reliability-and-security.ts`: **10 / 10 PASSED (100%)**
* `test-youpi-payment-phase1.ts`: **12 / 12 PASSED (100%)**
* `verify-rules-acceptance.ts`: **4 / 4 PASSED (100%)**
* TypeScript Verification (`npx tsc --noEmit`): **0 ERRORS**

---

## 12. Known Limitations & Operational Considerations

1. **Webhook Ingress Network Reachability:**
   In local development, YOUPI PG running on `127.0.0.1:6100` cannot dispatch webhooks to eFootball if the platforms are hosted on isolated network namespaces or containers unless a shared bridge or proxy is configured. In staging/production, a publicly routable HTTPS endpoint with valid TLS is required.
2. **Worker Lease Sweeper:**
   Crashed worker lease recovery currently triggers reactively upon redelivery of the same event ID or manual query. A periodic cron or background job (e.g., Supabase pg_cron or Next.js scheduled worker) can be added in Phase 4 to sweep stale leases proactively.
3. **Manual Review UI:**
   Orders routed to `manual_review_required` (due to late payments, oversubscribed tournaments, or conflicting gateway statuses) currently await operator action via the database RPC or admin dashboard.

---

## 13. Explicit Confirmation: Mandatory Authority Boundary Enforced

It is explicitly confirmed that throughout Phase 3:
* **YOUPI SUCCESS ≠ verified bank settlement.**
* No webhook event directly calls `reconcile_and_confirm_payment`.
* No confirmed participant record is inserted into `participants` by webhook ingestion.
* No tournament capacity is automatically consumed by webhook ingestion.
* No automatic bank refund is executed.
* All successful webhook deliveries advance the payment order strictly to `pending_verification` (or `manual_review_required`), awaiting independent bank verification or authorized operator reconciliation.
