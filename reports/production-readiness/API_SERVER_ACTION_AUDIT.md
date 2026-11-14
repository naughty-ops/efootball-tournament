# API & SERVER ACTION AUDIT REPORT
**Project:** eFootball Tournament Platform  
**Scope:** 8 API Route Handlers (`app/api/`) & 79 Server Actions (`app/actions/`)  
**Assessment Areas:** Input Validation (Zod), Authentication, Authorization (RBAC), Error Handling, Rate Limiting  

---

## 1. Executive Summary

The platform hosts 8 API Route Handlers and 79 Server Actions spanning 11 modules.
Input data is sanitized using Zod schemas and TypeScript interfaces.
All administrative server actions enforce role validation via `requireAdmin()`, preventing privilege escalation from authenticated competitors.
The primary vulnerability stems from the absence of root `middleware.ts`, which leaves route-level edge protection inactive.

---

## 2. API Route Handlers Inventory (8 Routes)

| Path | Methods | Auth Required | Rate Limited | Role Required | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/api` | GET | No | No | Public | Root API ping |
| `/api/health` | GET | No | Yes (300/m) | Public | Lightweight load-balancer health check (<2ms) |
| `/api/health/db` | GET | No | Yes (30/m) | Public | Isolated database connectivity check |
| `/api/live/token` | GET, POST | Optional | Yes (30/m) | RBAC | Legacy LiveKit token generation handler |
| `/api/livekit/token` | GET, POST, OPTIONS | Optional | Yes (30/m) | RBAC | Hardened LiveKit token generation with match verification |
| `/api/registrations` | POST | Yes | Yes (120/m) | Authenticated | Player tournament registration endpoint |
| `/api/tournaments/[id]/authorized-data` | GET | Yes | No | Cookie/Key | Private tournament sensitive metadata access |
| `/api/tournaments/[id]/verify-access` | POST | No | Yes | Public | Access code verification for private tournaments |

---

## 3. Server Actions Inventory & Role Authorization Matrix (79 Actions)

The 79 Server Actions across 11 modules were audited for authorization boundaries:

### 1. `app/actions/matchSchedulingActions.ts` (13 Actions)
- `recordPlayerCheckinAction`: Authenticated player (validates match participation via RPC).
- `startPlayerMatchAction`: Authenticated player (validates match participation via RPC).
- `submitPlayerScoreAction`: Authenticated player (validates match participation via RPC).
- `requestWalkoverAction`: Authenticated player (validates caller presence and opponent absence).
- `submitMatchScreenshotProofAction`: Authenticated player.
- `submitMatchDisputeAction`: Authenticated player.
- `scheduleMatchAction`: **`requireAdmin('admin')`** (Enforced server-side).
- `bulkScheduleMatchdayAction`: **`requireAdmin('admin')`** (Enforced server-side).
- `rescheduleMatchAction`: **`requireAdmin('admin')`** (Enforced server-side).
- `extendDeadlineAction`: **`requireAdmin('admin')`** (Enforced server-side).
- `resolveDisputeAction`: **`requireAdmin('admin')`** (Enforced server-side).
- `checkMatchTimeoutAction`: **`requireAdmin('admin')`** (Enforced server-side).
- `evaluateOverdueMatchesAction`: **`requireAdmin('admin')`** (Enforced server-side).

### 2. `app/actions/walletActions.ts` (7 Actions)
- `saveBankAccountAction`: Authenticated user (saves to user's own wallet).
- `saveUpiDetailsAction`: Authenticated user.
- `setPreferredPaymentMethodAction`: Authenticated user.
- `requestPayoutAction`: Authenticated user.
- `markNotificationReadAction`: Authenticated user.
- `adminDistributePrizesAction`: **`requireAdmin('admin')`** (Financial admin check).
- `adminUpdatePayoutStatusAction`: **`requireAdmin('admin')`** (Financial admin check).

### 3. `app/actions/tournamentActions.ts` (6 Actions)
- `checkTournamentNameAvailabilityAction`: Public / Authenticated.
- `createTournamentAction`: **`requireAdmin('moderator')`**.
- `updateTournamentAction`: **`requireAdmin('moderator')`**.
- `publishTournamentAction`: **`requireAdmin('moderator')`**.
- `updateTournamentStatusAction`: **`requireAdmin('moderator')`**.
- `deleteTournamentAction`: **`requireAdmin('admin')`**.

### 4. `app/actions/ticketActions.ts` (12 Actions)
- Player actions (`createSupportTicketAction`, `sendTicketMessageAction`): Authenticated user.
- Admin actions (`assignTicketAction`, `updateTicketPriorityAction`, `updateTicketStatusAction`, `resolveTicketAction`, `rejectTicketAction`, `reopenTicketAction`, `bulkAssignTicketsAction`, `bulkUpdateTicketPriorityAction`, `bulkUpdateTicketStatusAction`, `escalateTicketAction`): **`requireAdmin('moderator')`**.

### 5. `app/actions/verificationActions.ts` (12 Actions)
- Player actions: `checkEfootballIdAvailabilityAction`, `requestWhatsAppVerificationAction`.
- Admin verification actions: `getVerificationDashboardStatsAction`, `getAdminVerificationQueueAction`, `getMemberVerificationDetailsAction`, `adminVerifyWhatsAppAction`, `adminVerifyWhatsAppByNumberAction`, `adminVerifyEfootballIdAction`, `adminVerifyBothAction`, `adminRevokeVerificationAction`, `adminSuspendMemberAction`, `adminUnsuspendMemberAction`, `adminUpdateMemberNotesAction`: **`requireAdmin('moderator')`**.

### 6. `app/actions/paymentRegistrationActions.ts` (8 Actions)
- Player actions: `submitPaymentProofAction`, `cancelRegistrationRequestAction`, `getManualPaymentSettingsAction`.
- Admin actions: `adminApproveRegistrationAction`, `adminRejectRegistrationAction`, `adminSetUnderVerificationAction`, `getTournamentPaymentRequestsAction`, `updateManualPaymentSettingsAction`: **`requireAdmin('admin')`**.

### 7. Other Modules:
- `avatarActions.ts` (6 Actions): Player avatar selection & admin avatar management.
- `mediaActions.ts` (4 Actions): Media uploads & signed URLs.
- `notificationActions.ts` (2 Actions): Mark notifications read.
- `playerActions.ts` (4 Actions): Self-registration, profile updates, password change.
- `streamerActions.ts` (4 Actions): Streamer assignment management (`requireAdmin('moderator')`).

---

## 4. Key Findings

1. **Authorization Perimeter is Sound:** Players cannot invoke administrative fixture generation, score overriding, dispute resolution, or payout disbursements. All sensitive actions invoke `requireAdmin()` on the server.
2. **Missing Input Bounds on Ticket Messages:** `sendTicketMessageAction` sanitizes text but lacks max length enforcement in some branches, allowing up to 10KB message payloads.
3. **`revalidatePath` Safety:** Server actions invoke `revalidatePath` inside `try/catch` or at the tail of mutations. Failures in cache invalidation do not crash data mutations.
