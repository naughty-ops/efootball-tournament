# PHASE 2: YOUPI PG CHECKOUT UI — DELIVERY REPORT

**Project:** eFootball Tournament Platform  
**Payment Gateway:** YOUPI PG Standalone Engine  
**Phase:** Phase 2 (Player-Facing Checkout Interface & Real-Time Status Stream)  
**Date:** November 4, 2026  
**Status:** COMPLETE & VERIFIED — READY FOR APPROVAL  

---

## 1. Executive Summary

Phase 2 implements the player-facing checkout interface for paid eFootball tournaments, bridging players with the YOUPI PG standalone payment gateway while strictly adhering to:
1. **Zero Secret Exposure:** Browser code never directly connects to YOUPI admin APIs or receives merchant credentials (`merchant_secret`, `api_key`, `webhook_secret`).
2. **Authenticated Backend Proxy:** All checkout status and stream requests pass through eFootball authenticated endpoints (`/api/payment/status` and `/api/payment/stream`) that enforce strict player ownership (`order.user_id === user.id`).
3. **Strict Verification Boundary:** Browser events, QR scans, manual UTR entries, and observer signals (SMS / Gmail) can **never** mark an order as `confirmed` or enroll a player into the tournament. Only authoritative settlement confirms registration.
4. **Preservation of Free Tournaments:** Free tournament registration flows remain 100% direct and completely bypass checkout UI and payment order generation.
5. **eFootball Dark Gaming Aesthetic:** Custom modal and bottom-drawer UI utilizing dark glassmorphism, high-contrast neon accents (`#00e676`), dynamic QR generation, mobile UPI deep-linking, copy actions, and native SFX.

---

## 2. Architecture & Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       PLAYER BROWSER (CLIENT-SIDE)                          │
│                                                                             │
│  TournamentRegistrationCard ──► YouPiCheckoutModal                          │
│                                   │ (Dynamic QR Code SVG)                   │
│                                   │ (UPI Intent: upi://pay)                 │
│                                   │ (Live Countdown Timer)                  │
│                                   ▼                                         │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │ Authenticated Requests Only
                                    │ (Bearer Supabase JWT Cookie)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    EFOOTBALL SERVER-SIDE PROXY LAYER                        │
│                                                                             │
│  GET /api/payment/status?orderId=...  GET /api/payment/stream?orderId=...   │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ 1. Validate Authenticated Supabase Session                            │  │
│  │ 2. Enforce Player Ownership (order.user_id === session.user.id)       │  │
│  │ 3. Redact all internal secrets / keys                                 │  │
│  └──────────────────────────────────┬────────────────────────────────────┘  │
└─────────────────────────────────────┼───────────────────────────────────────┘
                                      │ Internal S2S Request
                                      │ (X-Merchant-Id, X-Signature HMAC)
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                  YOUPI PG STANDALONE PAYMENT GATEWAY                        │
│                                                                             │
│  GET /api/v1/checkout/:id/state    GET /api/v1/checkout/:id/stream (SSE)   │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ - Dynamic UPI URI Generation                                          │  │
│  │ - Real-Time Status Broadcasts (ACTIVE, PROCESSING, MANUAL_REVIEW)     │  │
│  │ - 15-Minute Reservation Expiry                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Deliverables Implemented:

1. **`lib/payment/types.ts`:**
   - Client-safe payment state contracts (`ClientPaymentStatus`: `'creating' | 'awaiting_payment' | 'payment_observed' | 'pending_verification' | 'manual_review' | 'confirmed' | 'failed' | 'expired' | 'unavailable'`).
   - `PaymentOrderStatusResponse`: Sanitized payload contract strictly devoid of secret material.
   - `YouPiCheckoutStateResponse`: Mapping contract for YOUPI checkout states.

2. **`lib/payment/client-utils.ts`:**
   - `formatPaiseToRupees(paise)`: Precise currency formatting without floating-point inaccuracies.
   - `formatCountdownTimer(secondsRemainingOrIso)`: Real-time reservation countdown formatting (`MM:SS`).
   - `getCountdownColorClass(seconds)`: Visual urgency transitions (Green -> Amber -> Pulse Rose).
   - `getStatusBadgeConfig(status)`: Unambiguous status badges preventing unverified payments from showing confirmed styling.

3. **`lib/payment/youpi-provider.ts`:**
   - Added `getCheckoutState(paymentId)`: Securely queries `GET /api/v1/checkout/:id/state` from the standalone gateway using server-to-server credentials.

4. **`app/api/payment/status/route.ts`:**
   - Server-side status proxy endpoint.
   - Enforces user authentication and strict order ownership (`user.id === order.user_id`).
   - Returns 401 for unauthenticated requests, 403 for unauthorized access attempts (`FORBIDDEN_ORDER_ACCESS`).
   - Sanitizes and formats the response, merging DB state with YOUPI checkout state.

5. **`app/api/payment/stream/route.ts`:**
   - Authenticated Server-Sent Events (SSE) proxy streaming real-time status transitions.
   - Forwards events (`status_change`) from YOUPI PG `/api/v1/checkout/:id/stream` to the client.
   - Cleans up underlying SSE connection when client disconnects or modal unmounts.

6. **`components/tournament/YouPiCheckoutModal.tsx`:**
   - Premium modal dialog (`role="dialog"`, `aria-modal="true"`) responsive on mobile and desktop.
   - Live dynamic QR code (`qrcode.react`) with eFootball branding.
   - One-click UPI deep-link (`upi://pay?pa=...&pn=...&am=...&cu=INR&tr=...`).
   - 1-click copy-to-clipboard for Order ID, Payee VPA, and exact Amount.
   - Live reservation countdown timer synchronized with backend `reserved_until`.
   - Real-time status transitions with polling fallback (3s -> 5s -> 10s backoff).
   - Expandable instructions accordion for UPI apps.
   - Native eFootball SFX integration (`playTouch` on interaction, `playConnecting` on confirmed enrollment).

7. **`components/tournament/TournamentRegistrationCard.tsx`:**
   - Updated to support both paid and free tournaments seamlessly.
   - For paid tournaments: displays entry fee badge (`ENTRY FEE: ₹X`), confirmation dialog with fee, and triggers order reservation and `<YouPiCheckoutModal>`.
   - For free tournaments: preserves the 100% direct registration workflow.

---

## 3. Security & Verification Boundary Enforcement

| Scenario | System Enforcement | Verification Result |
| :--- | :--- | :--- |
| **Player Ownership Violation** | Player Bob attempts to query status or stream for Player Alice's order. | Proxy returns `403 FORBIDDEN_ORDER_ACCESS`. Unauthorized access blocked. |
| **Merchant Secret Exposure** | Network inspector examines client responses from `/api/payment/status` and `/api/payment/stream`. | Secrets (`merchant_secret`, `api_key`, `webhook_secret`) are 100% absent from client payloads. |
| **Premature Confirmation** | SMS / Gmail observer detects a payment credit and emits `payment_observed` / `pending_verification`. | Client UI displays amber **Verifying Settlement** banner. Green **Payment Confirmed** badge is strictly barred. |
| **Client Spoofing** | Compromised browser attempts to call `onPaymentConfirmed` directly. | Database RLS and registration tables require server-side settlement proof; client-side state cannot create participant rows. |
| **Duplicate Event Delivery** | SSE stream sends repeated `PROCESSING` or `MANUAL_REVIEW` events. | UI state handler is idempotent; prevents duplicate sound playback and re-renders. |
| **Reservation Expiry** | 15-minute reservation timer reaches 0 before payment is verified. | UI immediately transitions to **Reservation Expired**; releases slot hold and presents safe retry action. |

---

## 4. Test Verification Suite Results

### A. Phase 2 Verification Suite (`scripts/test-phase2-checkout-ui.ts`)
All 14 Phase 2 test specifications passed:

```
===============================================================
   YOUPI PG CHECKOUT UI (PHASE 2) - VERIFICATION SUITE
===============================================================

[PASS] Check #1 [Modal Lifecycle] Checkout opens with valid payment order: Order initialized with fee ₹250.00, orderId=po_test_order_001, expiry in 10 mins
[PASS] Check #2 [QR Code] QR code renders correctly with valid UPI URI: Valid dynamic UPI payload generated: pa=merchant@youpi, am=250.00, tr=po_test_order_001
[PASS] Check #3 [UPI Intent] UPI action deep link works where supported: Direct deep-link href conforms strictly to NPCI UPI URI specifications
[PASS] Check #4 [Security Boundary] Player ownership enforcement: 403 Forbidden on another player's order: Alice (owner) => 200 OK; Bob (attacker) => 403 FORBIDDEN_ORDER_ACCESS; Anon => 401 UNAUTHORIZED
[PASS] Check #5 [Security Audit] Merchant credentials never reach the browser: All merchant secrets, keys, and webhook secrets strictly redacted
[PASS] Check #6 [Real-Time SSE] SSE stream updates displayed status: Transitions verified: awaiting_payment -> payment_observed -> manual_review
[PASS] Check #7 [Fault Tolerance] Polling fallback works when SSE is disconnected: SSE disconnection seamlessly activates fallback polling backoff cycle
[PASS] Check #8 [Idempotency] Duplicate events do not trigger duplicate UI state shifts: 5 identical observer events resulted in exactly 1 state transition
[PASS] Check #9 [Verification Boundary] Pending verification never displays payment confirmed: Unsettled states display warning/amber badges; "Payment Confirmed" rendered strictly on confirmed status
[PASS] Check #10 [Verification Boundary] Observer events cannot trigger tournament enrollment: Observer states (payment_observed, pending_verification, manual_review) triggered 0 enrollments; confirmed triggered exactly 1
[PASS] Check #11 [Reservation Expiry] Expired reservations display correct expired state and remaining time = 0: Timer formatted: 00:00, Badge: Reservation Expired, Color: text-rose-500 font-extrabold
[PASS] Check #12 [Recovery & Resilience] Network interruption supports safe recovery: Network failure caught cleanly without dropping order; manual refresh recovered original order
[PASS] Check #13 [Free Tournaments] Free tournament registration remains 100% unchanged: isPaid=false; checkout modal never rendered; free registration action path preserved intact
[PASS] Check #14 [Layout & Accessibility] Responsive mobile & desktop layout contracts verified: ARIA modal dialog contract, responsive drawer/modal scaling, neon accents (#00e676), and keyboard a11y active

===============================================================
   PHASE 2 TEST SUMMARY: 14/14 PASSED (0 FAILED)
===============================================================
```

### B. Phase 1 & 1.1 Regression Verification
1. `scripts/test-phase1-reliability-and-security.ts`: **10 / 10 PASSED** (100%)
2. `scripts/test-youpi-payment-phase1.ts`: **12 / 12 PASSED** (100%)
3. `scripts/test-tournament-creation-and-registration.ts`: **12 / 12 PASSED** (100%)
4. `scripts/verify-rules-acceptance.ts`: **4 / 4 PASSED** (100%)
5. `npx tsc --noEmit`: **0 Errors** (Clean type check)

---

## 5. Next Steps — Phase 3 Readiness

Phase 2 is fully implemented and passes all automated and regression tests. In accordance with the project instructions:
- **No real-money transactions** have been executed.
- **No webhook listeners** or auto-enrollment listeners have been deployed prematurely.
- Implementation is parked awaiting user review and authorization before proceeding to Phase 3.
