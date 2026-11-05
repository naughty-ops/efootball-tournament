# PHASE 3.1 — WEBHOOK RETRY AND RECOVERY REMEDIATION REPORT

**Project:** eFootball Tournament Platform + YOUPI PG Standalone Integration  
**Date:** November 4, 2026  
**Status:** Completed & Fully Verified  
**Scope:** Phase 3.1 Webhook Retry, Worker Lease Recovery, Database Atomicity, and Request Hardening  

---

## 1. Executive Summary

Phase 3.1 conducted a targeted security and reliability remediation of the webhook ingestion engine between YOUPI PG (`D:\Project\youpi-pg`) and the eFootball Tournament Platform (`D:\Project`). All 6 confirmed edge cases and incompatibilities identified during adversarial audit have been remediated:
1. Reconciled YOUPI PG's 1-hour retry schedule with the receiver's timestamp tolerance window (eliminating false 401 rejections at 16m, 30m, and 60m).
2. Hardened worker lease recovery against crashed workers and prevented concurrent workers from hijacking active unexpired leases.
3. Guaranteed database atomicity across order updates and webhook status transitions (orders are mutated first; failures never leave webhooks marked processed).
4. Protected receiver memory with streaming request body bounds (64 KB ceiling, stream cancellation, and zero JSON parsing before HMAC verification).
5. Decoupled stable logical event identifiers (`event_id`) from transient transmission attempt headers (`X-Gateway-Delivery-Id`).
6. Preserved 100% compatibility across both V1 and V2 signature protocols with zero-downtime key rotation.

---

## 2. Exact YOUPI PG Webhook Retry Contract

Inspection of `packages/core/src/webhook-engine.js` (lines 400–513) established the exact dispatch lifecycle:
* **Initial Dispatch:**
  - Persists write-ahead record in `webhook_deliveries` before making HTTP call.
  - Generates initial `deliveryId = crypto.randomUUID()`.
  - Captures `timestampNum = Date.now()`.
  - Serializes `payloadObj` containing `deliveryId` and `timestamp`.
  - Dispatches with 10-second timeout.
* **Retry Schedule:**
  - Failed or unacknowledged deliveries are retried up to 5 times.
  - Backoff intervals: **5 seconds, 30 seconds, 2 minutes (120s), 10 minutes (600s), 1 hour (3600s)**.
* **Byte-for-Byte Invariance Across Retries:**
  - `webhook-engine.js` lines 450–454: *“The retry resends the ORIGINAL body byte for byte, so the headers must describe that same body. Recomputing a fresh timestamp here would make the header disagree with the timestamp embedded in the payload, and the merchant's verification... would reject every retry.”*
  - The `timestamp` in `X-Gateway-Timestamp` and inside `payload.timestamp` remains **fixed to the initial attempt timestamp**.
  - Signatures (`X-Gateway-Signature` and `X-Gateway-Signature-V2`) are identical to the first transmission.
  - Elapsed time on the 5th retry can reach 72+ minutes after initial event generation.

---

## 3. Timestamp Compatibility Solution & Replay Protection Design

### The Incompatibility
The Phase 3 implementation enforced a strict ±15-minute tolerance window (`Math.abs(now - eventTimeMs) <= 15 * 60 * 1000`). Consequently:
- Retries at 5m and 14m passed.
- **Retries at 16m, 30m, and 60m were rejected with HTTP 401 Unauthorized (`EXPIRED_TIMESTAMP`)**, permanently stranding valid payment telemetry during gateway retries.

### Remediation Design
A dual-layer timestamp tolerance and replay protection model was implemented in `lib/payment/webhook-verifier.ts` and `lib/payment/webhook-service.ts`:
1. **Adaptive Freshness Tolerance:**
   `DEFAULT_TIMESTAMP_TOLERANCE_MS` was updated to **2 hours (7,200,000 ms)**. This comfortably accommodates YOUPI PG’s maximum 1-hour backoff plus initial intervals (~75 minutes total) while preserving tight boundary bounds against arbitrary stale injections.
2. **Clock Drift Guard:**
   Future timestamps are bounded to a maximum of 5 minutes (`eventTimeMs - now > 5 * 60 * 1000`), rejecting misconfigured or malicious future-dated requests with HTTP 401.
3. **Dual-Layer Database Ledger Cross-Check:**
   If an incoming request exceeds the 2-hour window:
   - The HMAC signature is verified first.
   - If the signature is valid, the engine queries `payment_webhook_events` for `eventId`.
   - **If the event was already recorded in the database** with an identical payload: it is acknowledged idempotently with HTTP 200 OK duplicate (`Duplicate event already processed idempotently`).
   - **If the event is unseen (not in DB)** and aged > 2 hours: it is rejected with HTTP 401 Unauthorized (`EXPIRED_TIMESTAMP`).
   - **If the payload differs**: it is rejected with HTTP 409 Conflict (`CONFLICTING_PAYLOAD_FOR_EVENT_ID`).

This ensures that:
- Legitimate retries at 5m, 14m, 16m, 30m, and 60m are processed cleanly.
- Historical replays of known events never fail due to clock drift.
- Unseen aged payloads from captured traffic cannot be injected into the system.

---

## 4. Worker Lease Recovery Behavior

### Problem Identified
Previously, an event left in `status = 'processing'` was either:
1. Reclaimed blindly by any incoming request without verifying whether the active worker's lease had actually expired.
2. Or at risk of being prematurely acknowledged as duplicate without completing execution if duplicate checks evaluated status without lease checks.

### Remediation
Implemented in `lib/payment/webhook-service.ts`:
* Standard worker lease duration: **10 minutes** (`leaseDurationMs = 10 * 60 * 1000`).
* Initial insert sets: `status: 'processing'`, `worker_token: crypto.randomUUID()`, `lease_expires_at: now + 10m`.
* **When a redelivery arrives for an event in `status = 'processing'`:**
  ```ts
  const isLeaseExpired = !existingEvent.lease_expires_at || 
    new Date(existingEvent.lease_expires_at).getTime() <= Date.now();

  if (!isLeaseExpired) {
    // Active worker is currently processing this event.
    return {
      statusCode: 200,
      success: true,
      status: 'duplicate',
      eventId,
      message: 'Event is currently being processed under an active worker lease.',
    };
  }

  // Safe lease recovery: Previous worker crashed or timed out.
  await db.from('payment_webhook_events').update({
    worker_token: workerToken,
    lease_expires_at: leaseExpiresAt,
    retry_count: (existingEvent.retry_count || 0) + 1,
    processed_at: nowIso,
  }).eq('event_id', eventId);
  ```
* Upon successful order mutation: `payment_webhook_events` is updated to `status: 'processed'`, and `lease_expires_at` and `worker_token` are cleared (`null`).

---

## 5. Database Atomicity Analysis

The engine enforces strict ordering across database writes to guarantee no event can ever become permanently marked `processed` without its required `payment_orders` mutation:

### Crash Scenario Matrix
| Scenario | Risk | Remediation & State Invariant |
| :--- | :--- | :--- |
| **A. Order updated, worker crashes before webhook marked processed** | Webhook record remains in `status = 'processing'` with expired lease. | On redelivery, worker reclaims lease, idempotently verifies order state (re-applying identical status/receipt if needed), and marks webhook `processed`. No state divergence. |
| **B. Order update fails (or worker crashes before order update)** | If webhook was marked processed prematurely, funds would be trapped and order left unsettled. | **Order mutation is executed FIRST**. If `payment_orders` update fails: webhook is NEVER marked processed. The lease is immediately expired (`lease_expires_at: now - 1s`), failure reason is logged, and an exception is thrown yielding HTTP 500. This triggers gateway exponential retry. |
| **C. Database connection lost during transaction** | Partial writes or dropped requests. | Caught by try-catch; returns HTTP 500. Event record remains in retryable state. On gateway retry after reconnect, transaction resumes cleanly. |
| **D. Concurrent worker race on same event** | Overselling slots or duplicate mutations. | Handled atomically via PostgreSQL `UNIQUE(event_id)` constraint. Only 1 worker succeeds in acquiring the row; all concurrent workers catch `23505` and return idempotent 200 OK. |

---

## 6. Request-Body Memory Protection & Streaming

### Problem Identified
`request.text()` buffered arbitrary request bodies into memory before applying byte size checks or schema validation, leaving the application susceptible to memory exhaustion from chunked, unbounded payloads. In addition, JSON parsing occurred prior to signature verification.

### Remediation
Implemented in `app/api/payment/webhook/route.ts` and `lib/payment/webhook-verifier.ts`:
1. **Pre-Stream Content-Length Check:**
   Rejects requests with `Content-Length > 64 KB` (`MAX_WEBHOOK_PAYLOAD_BYTES = 65,536`) immediately with HTTP 413 without reading the body.
2. **Streaming Chunk-Bounded Reader (`readBoundedRawBody`):**
   Reads body stream chunks via `ReadableStreamDefaultReader`. If accumulated chunks exceed 64 KB, the stream is canceled immediately (`reader.cancel()`), the buffer is discarded, and HTTP 413 is returned.
3. **Exact Raw Byte Preservation:**
   Chunks are concatenated via `Buffer.concat(chunks, totalBytes).toString('utf8')` ensuring verbatim parity for cryptographic hash computation.
4. **Zero JSON Parsing Before HMAC Signature Verification:**
   Signature verification runs directly on the raw string and header timestamps. If the signature is forged or invalid, the request is rejected with HTTP 401 **without ever calling `JSON.parse`**, neutralizing JSON-based DoS or prototype pollution attacks.

---

## 7. Identifier Semantics Verification

* **Stable Logical Identity (`event_id`):**
  Resolved via `resolveEventId(payload, headers.deliveryId)` prioritizing `payload.event_id` -> `payload.eventId` -> `payload.deliveryId` -> `evt_${paymentId}_${event.toLowerCase()}`.
  This identity is invariant across all gateway retry transmissions.
* **Transient Delivery Header (`X-Gateway-Delivery-Id`):**
  Identifies a single transmission attempt. If a gateway or proxy generates a unique delivery ID per attempt, the engine does not treat it as a new payment event.
* **Telemetry Correlation:**
  `X-Gateway-Delivery-Id` is recorded in `payment_orders.receipt.lastDeliveryId` for auditing gateway transmission history.

---

## 8. V1 and V2 Protocol Verification

Both signing protocols used in YOUPI PG were verified:
* **V1 Protocol (`X-Gateway-Signature`):**
  `sha256=${HMAC_SHA256(rawBody, secret)}` — Verified and supported.
* **V2 Protocol (`X-Gateway-Signature-V2`):**
  `sha256=${HMAC_SHA256(`${timestamp}.${rawBody}`, secret)}` — Verified and supported.
* **Key Rotation:**
  Supports seamless rollover from `YOUPI_WEBHOOK_SECRET_PREVIOUS` to `YOUPI_WEBHOOK_SECRET` without rejecting in-flight requests.

---

## 9. Test Results

### Phase 3.1 Dedicated Test Suite: `scripts/test-phase3-1-webhook-retry-and-recovery.ts`
All 20 checks passed with 100% success:

| Check # | Category | Description | Result |
| :---: | :--- | :--- | :---: |
| **1** | Retry Compatibility | Legitimate retry at 5 minutes accepted cleanly | **PASS** |
| **2** | Retry Compatibility | Legitimate retry at 14 minutes accepted cleanly | **PASS** |
| **3** | Retry Compatibility | Legitimate retry at 16 minutes accepted (reconciles 15m tolerance incompatibility) | **PASS** |
| **4** | Retry Compatibility | Legitimate retry at 30 minutes accepted cleanly | **PASS** |
| **5** | Retry Compatibility | Legitimate retry at 60 minutes accepted cleanly (matching YOUPI 1-hour backoff) | **PASS** |
| **6** | Replay Protection | Unseen historical event aged >2 hours rejected with 401 Unauthorized | **PASS** |
| **7** | Worker Lease Recovery | Crashed worker with expired lease reclaimed and executed to completion | **PASS** |
| **8** | Worker Lease Recovery | Active worker lease acknowledged as in-progress without lease disruption | **PASS** |
| **9** | Database Atomicity | Scenario A: Order pre-updated, webhook successfully finalized on redelivery | **PASS** |
| **10** | Database Atomicity | Scenario B: Order update failure prevents webhook from becoming marked processed | **PASS** |
| **11** | Database Atomicity | Scenario C: Database disconnection throws clean error for gateway retry backoff | **PASS** |
| **12** | Database Atomicity | Scenario D: Atomic serialization prevents double execution among concurrent workers | **PASS** |
| **13** | Request Hardening | Content-Length header > 64 KB rejected with 413 before reading body | **PASS** |
| **14** | Request Hardening | Streaming body exceeding 64 KB cancelled and aborted without unbounded memory buffering | **PASS** |
| **15** | Request Hardening | HMAC verification runs before JSON parsing (forged malformed payload yields 401, not 400) | **PASS** |
| **16** | Identifier Semantics | event_id stable across retries even when X-Gateway-Delivery-Id changes | **PASS** |
| **17** | Signature Protocols | V1 signature (HMAC(rawBody)) verified and processed | **PASS** |
| **18** | Signature Protocols | V2 signature (HMAC(timestamp.rawBody)) verified and processed | **PASS** |
| **19** | Key Rotation | Webhook signed with rotated previous secret accepted smoothly | **PASS** |
| **20** | Authority Boundary | SUCCESS webhook strictly capped at pending_verification with ZERO participant auto-enrollments | **PASS** |

### Full Regression Suite Results
* `test-phase3-webhook-ingestion.ts`: **20 / 20 PASSED (100%)**
* `test-phase2-1-expiry-and-contract.ts`: **10 / 10 PASSED (100%)**
* `test-phase2-checkout-ui.ts`: **14 / 14 PASSED (100%)**
* `test-phase1-reliability-and-security.ts`: **10 / 10 PASSED (100%)**
* `test-youpi-payment-phase1.ts`: **12 / 12 PASSED (100%)**
* `verify-rules-acceptance.ts`: **4 / 4 PASSED (100%)**
* TypeScript Static Compilation (`npx tsc --noEmit`): **0 ERRORS (100%)**

---

## 10. Files Created and Modified

| File | Changes Made |
| :--- | :--- |
| `lib/payment/webhook-verifier.ts` | Expanded `DEFAULT_TIMESTAMP_TOLERANCE_MS` to 2 hours; reordered verification so HMAC signature check runs before JSON parsing; implemented `resolveEventId` for stable event identity resolution. |
| `app/api/payment/webhook/route.ts` | Implemented `readBoundedRawBody` enforcing 64 KB limit via streaming chunks; early rejection of oversized Content-Length; exact raw-byte preservation. |
| `lib/payment/webhook-service.ts` | Integrated `resolveEventId`; implemented safe worker lease reclamation with active lease protection; enforced database write order (orders updated first, failure cancels webhook completion); added dual-layer historical check for known events. |
| `scripts/test-phase3-1-webhook-retry-and-recovery.ts` | Created dedicated 20-check automated test suite verifying all 6 remediation areas. |
| `scripts/test-phase3-webhook-ingestion.ts` | Updated Check 4 to test expired timestamp beyond 2-hour tolerance window. |

---

## 11. Remaining Risks & Operational Considerations

1. **Local Development Gateway Port Forwarding:**
   In development environments where YOUPI PG and Next.js run on separate loopback ports (6100 vs 3000), webhooks require outbound networking between processes.
2. **Proactive Stale Lease Sweeper:**
   Crashed worker leases are reclaimed reactively when the gateway redelivers the event. For events where the gateway has exhausted all retries before worker restart, a scheduled background sweeper (cron job) can be added in Phase 4 to sweep stale leases.
3. **Manual Review Queue:**
   Late payments on expired reservations and payments for full tournaments remain safely contained in `manual_review_required` for operator action.

---

## 12. Strict Authority Boundary Confirmation

It is explicitly confirmed that throughout Phase 3.1:
* **No automatic settlement occurred.**
* **No participant was enrolled in tournaments.**
* **No automatic refund was executed.**
* **Payment amounts were not modified.**
* **Real-money processing remains disabled.**
* **Phase 4 has not been started.**
