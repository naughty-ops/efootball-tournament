# PRODUCTION SCALABILITY & HIGH-TRAFFIC OPTIMIZATION
# PHASE 3.5 — INDEPENDENT PRODUCTION SECURITY AUDIT

**Project:** eFootball Tournament Platform  
**Repository:** `naughty-ops/efootball-tournament` (`D:\Project`)  
**Environment:** Next.js 16.3.0 App Router, React 19, TypeScript 5, Supabase PostgreSQL, LiveKit Cloud  
**Audit Reference:** Phase 3.3 Independent Audit and Phase 3.4 Implementation Reports  
**Audit Mode:** STRICTLY READ-ONLY (No code modified, no DDL executed, no migrations applied)  
**Date:** November 8, 2026  

---

## EXECUTIVE VERDICT

### **BLOCKED — SECURITY OR MIGRATION ISSUES REMAIN**

**Primary Blocker Summary:**
1. **P0 Functional & Authorization Blocker:** The Phase 3.3 blocker is **NOT fully resolved in practice**. The database view `tournament_participants_public` has an explicit SQL WHERE clause: `AND COALESCE(t.is_private, FALSE) = FALSE`. When `/api/tournaments/[id]/authorized-data` queries this view via `createAdminClient()`, PostgreSQL returns zero rows (`[]`). Because the calling code checks `!res.data` (which is `false` for an empty array `[]`), the code **never falls back to querying `participants`**. As a result, authorized users who unlock private tournaments still receive 0 participants, 0 group standings, and brackets with null participant names.
2. **P0 Security Fail-Open Vulnerability:** In `app/actions/tournamentActions.ts`, when PostgreSQL returns error `42703` (undefined column `is_private`), the fallback deletes `is_private` and `access_code_hash` and **silently creates/updates the tournament as public** instead of failing.
3. **P0 Migration Inconsistency:** The referenced migration `20261108073000_phase3_scalability_and_security.sql` **does not exist** in `supabase/migrations/`.
4. **P1 Broadcaster Eviction Room Name Mismatch:** When `matches.live_room_name` is null, token issuance authorizes room `<matchId>`, but streamer unassignment attempts eviction from `match-<matchId>`. Active broadcasters are never evicted.
5. **P1 Cookie Invalidation Failure:** Access tokens are signed only over `(tournamentId, exp)` without binding to the tournament's `access_code_hash`. Changing the password does not invalidate previously issued 7-day cookies.
6. **P1 Query Amplification:** A single invocation of `/api/tournaments/[id]/authorized-data` executes 15 to 20 database queries, redundantly querying the tournament 4 times, participants 5 times, and matches 3 times.

---

## 1. VERIFIED FIXES IN PHASE 3.4

The following remediations from Phase 3.4 were verified as correctly implemented:

1. **Dedicated Signing Secret Isolation:**
   - [`lib/security/tournamentAccessCookie.ts`](file:///d:/Project/lib/security/tournamentAccessCookie.ts#L21-L31): `getSigningSecret()` strictly requires `process.env.ACCESS_TOKEN_SECRET` with $\ge 32$ characters entropy. Cross-protocol fallbacks to `SUPABASE_JWT_SECRET` and `LIVEKIT_API_SECRET` have been completely removed.
2. **Admin Password Hashing:**
   - [`app/actions/tournamentActions.ts`](file:///d:/Project/app/actions/tournamentActions.ts#L48-L56): Plaintext access codes are hashed using `bcrypt.hash(validData.access_code.trim(), 10)` before persistence.
   - Plaintext access codes and `access_code_hash` are excluded from API select returns and action payloads.
3. **Streamer Match-Level Token Enforcement:**
   - [`app/api/livekit/token/route.ts`](file:///d:/Project/app/api/livekit/token/route.ts#L255-L284): Broadcasters must be authenticated, have active accounts, and have an explicit assignment record in `match_streamer_assignments` unless they are super admins. Fails closed with 403 Forbidden.
4. **Atomic Registration RPC Preserved:**
   - [`supabase/migrations/20261108010000_match_streamer_assignments_and_private_data_protection.sql`](file:///d:/Project/supabase/migrations/20261108010000_match_streamer_assignments_and_private_data_protection.sql#L149-L380): Strict eFootball ID validation, capacity locking via `SELECT ... FOR UPDATE`, duplicate prevention, and WhatsApp payment registration requests remain intact.

---

## 2. REMAINING VULNERABILITIES & CODE DEFECTS

### Finding 1: Private Participants Return Empty Due to View Filter & Truthy Array Check (P0)
- **Severity:** P0 Blocker
- **Files:**
  - [`services/publicTournamentService.ts#L113-L124`](file:///d:/Project/services/publicTournamentService.ts#L113-L124)
  - [`services/tournamentService.ts#L371-L378`](file:///d:/Project/services/tournamentService.ts#L371-L378)
  - [`services/groupService.ts#L151-L161`](file:///d:/Project/services/groupService.ts#L151-L161)
  - [`services/bracketService.ts#L95-L105`](file:///d:/Project/services/bracketService.ts#L95-L105)
  - [`services/matchService.ts#L70-L78`](file:///d:/Project/services/matchService.ts#L70-L78)
- **Mechanism:**
  1. The SQL view `tournament_participants_public` explicitly defines:
     ```sql
     WHERE t.status IN ('registration', 'ongoing', 'completed')
       AND p.status IN ('active', 'eliminated')
       AND COALESCE(t.is_private, FALSE) = FALSE;
     ```
  2. Because `is_private = true`, any query to `tournament_participants_public` returns `data: []` (empty array) and `error: null`.
  3. In TypeScript, `viewData` / `res.data` is an empty array `[]`. Because `Boolean([]) === true`, the condition `!res.data` evaluates to `false`.
  4. The fallback query to `supabase.from('participants')` is **never executed**.
  5. Authorized data endpoint returns 0 participants, 0 groups, and null player names on brackets.

### Finding 2: Security Fail-Open on Missing Migration (P0)
- **Severity:** P0 Critical Security
- **Files:**
  - [`app/actions/tournamentActions.ts#L89-L100`](file:///d:/Project/app/actions/tournamentActions.ts#L89-L100)
  - [`app/actions/tournamentActions.ts#L301-L313`](file:///d:/Project/app/actions/tournamentActions.ts#L301-L313)
- **Mechanism:**
  When PostgreSQL returns code `42703` (column `is_private` undefined), `createTournamentAction` and `updateTournamentAction` execute:
  ```typescript
  if (error && (error as any).code === '42703') {
    const fallbackPayload = { ...insertPayload };
    delete fallbackPayload.is_private;
    delete fallbackPayload.access_code_hash;
    ...
  }
  ```
  This creates or leaves the tournament as **PUBLIC**. If an admin configures a confidential or private paid tournament, it is published to the public tournament lobby without error or warning.

### Finding 3: Non-Existent Migration File Reference (P0)
- **Severity:** P0 Operational / Migration Safety
- **File:** `supabase/migrations/20261108073000_phase3_scalability_and_security.sql`
- **Mechanism:**
  The file `20261108073000_phase3_scalability_and_security.sql` does not exist on disk. The actual migration containing the match streamer assignments and private data protection is `supabase/migrations/20261108010000_match_streamer_assignments_and_private_data_protection.sql`. Any deployment pipeline targeting `20261108073000` will fail.

### Finding 4: Access Tokens Do Not Invalidate on Password Change (P1)
- **Severity:** P1 Security
- **Files:**
  - [`lib/security/tournamentAccessCookie.ts#L37-L54`](file:///d:/Project/lib/security/tournamentAccessCookie.ts#L37-L54)
  - [`app/api/tournaments/[id]/authorized-data/route.ts#L50-L63`](file:///d:/Project/app/api/tournaments/[id]/authorized-data/route.ts#L50-L63)
- **Mechanism:**
  Tokens are signed solely over `"${tournamentId}.${exp}"`. If an admin changes a compromised access code, existing tokens continue to be accepted for their full 7-day TTL because they contain no password hash fingerprint or password timestamp.

### Finding 5: Broadcaster Eviction Room Name Mismatch & Masked Errors (P1)
- **Severity:** P1 Functional / Realtime Security
- **Files:**
  - [`app/actions/streamerActions.ts#L291-L310`](file:///d:/Project/app/actions/streamerActions.ts#L291-L310)
  - [`app/api/livekit/token/route.ts#L218-L230`](file:///d:/Project/app/api/livekit/token/route.ts#L218-L230)
- **Mechanism:**
  1. If `match.live_room_name` is null, `streamerActions.ts` attempts to evict from room `match-${matchId}`.
  2. However, `app/api/livekit/token/route.ts` only resolves matches where `rawRoom == live_room_name` OR `rawRoom == id`. Broadcasters join room `<matchId>`.
  3. LiveKit `removeParticipant` is called against non-existent room `match-${matchId}`.
  4. The resulting error is caught by `catch (evictErr)` and discarded, returning `success: true` while the broadcaster remains actively streaming.

### Finding 6: Query Amplification on Authorized Data Endpoint (P1)
- **Severity:** P1 Performance & High-Traffic Stability
- **File:** [`app/api/tournaments/[id]/authorized-data/route.ts#L85-L91`](file:///d:/Project/app/api/tournaments/[id]/authorized-data/route.ts#L85-L91)
- **Mechanism:**
  Calling `getTournamentById`, `getPublicParticipants`, `getTournamentStageInfo`, `getTournamentGroups`, `getTournamentBracket`, and `getMatchesByTournament` simultaneously triggers redundant database roundtrips:
  - `tournaments` queried **4 times**.
  - `participants` / `tournament_participants_public` queried **5 times**.
  - `rounds` queried **3 times**.
  - `matches` queried **3 times**.
  A single visitor request generates up to 20 database queries.

---

## 3. FILE AND LINE REFERENCES

| Vulnerability / Item | File | Line Numbers |
|---|---|---|
| View Filter + Truthy Array Bug | `services/publicTournamentService.ts` | [L113-L124](file:///d:/Project/services/publicTournamentService.ts#L113-L124) |
| View Filter + Truthy Array Bug | `services/tournamentService.ts` | [L374-L378](file:///d:/Project/services/tournamentService.ts#L374-L378) |
| View Filter + Truthy Array Bug | `services/groupService.ts` | [L151-L161](file:///d:/Project/services/groupService.ts#L151-L161) |
| View Filter + Truthy Array Bug | `services/bracketService.ts` | [L95-L105](file:///d:/Project/services/bracketService.ts#L95-L105) |
| View Filter + Truthy Array Bug | `services/matchService.ts` | [L70-L78](file:///d:/Project/services/matchService.ts#L70-L78) |
| Security Fail-Open (Create) | `app/actions/tournamentActions.ts` | [L89-L100](file:///d:/Project/app/actions/tournamentActions.ts#L89-L100) |
| Security Fail-Open (Update) | `app/actions/tournamentActions.ts` | [L301-L313](file:///d:/Project/app/actions/tournamentActions.ts#L301-L313) |
| Missing Migration `20261108073000` | `supabase/migrations/` | Missing |
| Token Password Invalidation | `lib/security/tournamentAccessCookie.ts` | [L47-L53](file:///d:/Project/lib/security/tournamentAccessCookie.ts#L47-L53) |
| LiveKit Room Name Mismatch | `app/actions/streamerActions.ts` | [L291-L300](file:///d:/Project/app/actions/streamerActions.ts#L291-L300) |
| Masked LiveKit Eviction Errors | `app/actions/streamerActions.ts` | [L305-L310](file:///d:/Project/app/actions/streamerActions.ts#L305-L310) |
| Query Amplification in API | `app/api/tournaments/[id]/authorized-data/route.ts` | [L85-L91](file:///d:/Project/app/api/tournaments/[id]/authorized-data/route.ts#L85-L91) |

---

## 4. MIGRATION CONSISTENCY & CLEAN REPLAY REPORT

### Migration Sequence Audit
The migrations in `supabase/migrations/` follow a chronological sequence through:
1. `20261106000000_reconcile_database_enforced_admin_rbac.sql`
2. `20261107000000_manual_whatsapp_payment_system.sql`
3. `20261108000000_high_traffic_optimization_and_atomic_registration.sql`
4. `20261108010000_match_streamer_assignments_and_private_data_protection.sql`

### Discrepancy Findings
1. **Migration 20261108073000 Does Not Exist:** Referenced repeatedly in previous prompt instructions and reports, but never committed to the filesystem.
2. **View Conflict with Privileged Data Delivery:**
   Migration `20261108010000` line 70 defines `tournament_participants_public` with:
   `WHERE ... AND COALESCE(t.is_private, FALSE) = FALSE`.
   This view definition is incompatible with the TypeScript services when called on behalf of authorized private visitors.
3. **Replay Feasibility:** Clean database replay of the official files (`20260807000000` through `20261108010000`) is syntactically valid, but application queries for private tournament participants fail at runtime.

---

## 5. SERVICE-ROLE SECURITY ANALYSIS

1. **Server-Side Isolation:**
   - `createAdminClient()` is located in [`lib/supabase/server.ts`](file:///d:/Project/lib/supabase/server.ts#L53-L73). It references `SUPABASE_SERVICE_ROLE_KEY` (no `NEXT_PUBLIC_` prefix) and is never bundled into client chunks.
2. **Usage Scope:**
   - Used in `/api/tournaments/[id]/authorized-data/route.ts` only after HMAC signature verification.
   - Used in `playerDashboardService.ts` for opponent contact retrieval.
3. **Parameter Tampering Risk:**
   - Low. All privileged queries pass `id` validated via UUID regex.
4. **Information Exposure:**
   - Handled properly in `authorized-data/route.ts`: `access_code_hash` and `access_code` are deleted before returning the tournament object.

---

## 6. PRIVATE TOURNAMENT END-TO-END AUTHORIZATION SCENARIOS

| Scenario | Tested Endpoint / Component | Expected Behavior | Actual Observed Behavior | Result |
|---|---|---|---|:---:|
| **Anonymous visitor (no cookie)** | `GET /api/tournaments/[id]/authorized-data` | 401 Unauthorized | Returns `401` with `{ reason: 'MISSING_COOKIE' }` | **PASS** |
| **Authenticated visitor (no cookie)** | `GET /api/tournaments/[id]/authorized-data` | 401 Unauthorized | Returns `401` with `{ reason: 'MISSING_COOKIE' }` | **PASS** |
| **Visitor with tampered cookie** | `GET /api/tournaments/[id]/authorized-data` | 401 Unauthorized | Returns `401` with `{ reason: 'INVALID_SIGNATURE' }` | **PASS** |
| **Visitor with expired cookie** | `GET /api/tournaments/[id]/authorized-data` | 401 Unauthorized | Returns `401` with `{ reason: 'EXPIRED_TOKEN' }` | **PASS** |
| **Visitor with cookie from Tourney B** | `GET /api/tournaments/[id]/authorized-data` | 401 Unauthorized | Returns `401` with `{ reason: 'CROSS_TOURNAMENT_TOKEN' }` | **PASS** |
| **Visitor with valid cookie on Public Tourney** | `GET /api/tournaments/[id]/authorized-data` | 400 Bad Request | Returns `400` ("Tournament is public") | **PASS** |
| **Visitor with valid cookie on Private Tourney** | `GET /api/tournaments/[id]/authorized-data` | 200 with full data | Returns `200`, but **participants is `[]`** due to view filter | **FAIL** |
| **Visitor with valid cookie on Nonexistent Tourney** | `GET /api/tournaments/[id]/authorized-data` | 404 Not Found | Returns `404` ("Tournament not found") | **PASS** |
| **Old cookie after Admin updates password** | `GET /api/tournaments/[id]/authorized-data` | 401 Unauthorized | **Accepts old cookie**; token has no password binding | **FAIL** |

---

## 7. LIVEKIT AUTHORIZATION & EVICTION ANALYSIS

1. **Publishing Authorization:**
   - Normal players: Granted `viewer` role; `canPublish: false`, `canPublishData: false`.
   - Suspended accounts: Stripped of all elevated roles; `grantedRole = 'viewer'`.
   - Streamers: Must have an assignment in `match_streamer_assignments` for the specific match; rejected with 403 Forbidden otherwise.
2. **Eviction Mechanics:**
   - Broadcaster identity is `broadcaster-${streamerId.substring(0, 8)}`.
   - Eviction targets room `match?.live_room_name || 'match-' + matchId`.
   - Because `live_room_name` is null on unconfigured matches, token endpoint uses `<matchId>` while eviction targets `match-<matchId>`. **Eviction targets wrong room.**
   - LiveKit SDK errors during eviction are suppressed without surfacing to the caller.

---

## 8. REGISTRATION & PAYMENT INTEGRITY ANALYSIS

1. **Atomic Registration RPC:**
   - Database function `register_player_for_tournament` enforces strict eFootball ID canonical format (`^[A-Z]{4}-[0-9]{3}-[0-9]{3}-[0-9]{3}$`).
   - Uses `SELECT ... FOR UPDATE` to lock the tournament row and count participants plus active pending reservations.
2. **Private Tournament Registration:**
   - Enforces `p_access_code` verification against `access_code_hash` using `extensions.crypt()`.
3. **Manual WhatsApp Payment Workflow:**
   - Paid tournaments generate a reservation with `status = 'pending_payment'`.
   - No payment gateways (Razorpay, Cashfree, YouPI) are active or referenced in user flows.

---

## 9. TEST EVIDENCE CLASSIFICATION

All 16 assertions executed in `scratch/test-remediation-phase3-4.ts` were inspected:

| Assertion | Type | Description |
|---|:---:|---|
| 1. Token header.payload.sig structure | **Unit** | In-memory string split |
| 2. Valid token signature validation | **Unit** | In-memory HMAC calculation |
| 3. Cross-tournament token rejection | **Unit** | In-memory string comparison |
| 4. Tampered payload rejection | **Unit** | In-memory HMAC verification |
| 5. Expired token rejection | **Unit** | In-memory timestamp comparison |
| 6. Secret entropy $\ge 32$ chars | **Unit** | In-memory string length check |
| 7. Fails when secret too short | **Unit** | In-memory exception handling |
| 8. Fails when secret missing | **Unit** | In-memory exception handling |
| 9. Rejects Supabase/LiveKit fallbacks | **Unit** | Environment variable inspection |
| 10. `tournamentSchema` accepts `is_private` | **Unit** | Zod schema parse in memory |
| 11. Parsed data retains `is_private` | **Unit** | In-memory object assertion |
| 12. Parsed data retains `access_code` | **Unit** | In-memory object assertion |
| 13. bcrypt matches correct password | **Unit** | In-memory bcrypt comparison |
| 14. bcrypt rejects wrong password | **Unit** | In-memory bcrypt comparison |
| 15. Streamer identity template | **Unit** | In-memory string template check |
| 16. Cookie name format | **Unit** | In-memory string template check |

**Critical Integration Testing Gaps:**
- **Route Integration:** 0 tests. `/api/tournaments/[id]/authorized-data` was never invoked via HTTP.
- **Database Integration:** 0 tests. PostgreSQL queries and RLS policies were never executed against a real database.
- **Concurrency / Load:** 0 tests. Registration row-locking was never subjected to concurrent requests.

---

## 10. STAGING PREREQUISITES & REMEDIATION STEPS

Before staging migration review can be approved, the following items must be resolved:

1. **Fix Private Participant Querying:**
   In `services/publicTournamentService.ts`, `tournamentService.ts`, `groupService.ts`, `bracketService.ts`, and `matchService.ts`:
   When `customClient` is passed (or when querying for private tournaments), query `participants` directly with public column projection (`id, tournament_id, username, seed_number, status`), OR fix the check from `if (error || !data)` to `if (error || !data || data.length === 0)` so it falls back to `participants`.
2. **Eliminate Fail-Open Migration Fallbacks:**
   In `app/actions/tournamentActions.ts`, if `validData.is_private` is true and code `42703` occurs, the action **must return an error** (`"Private tournaments cannot be created until database migrations are applied"`). It must never strip privacy fields and create a public tournament.
3. **Align LiveKit Eviction Room Name:**
   In `app/actions/streamerActions.ts`, ensure `roomName = match?.live_room_name || matchId`, exactly matching `app/api/livekit/token/route.ts`. Surface eviction errors if LiveKit API calls fail.
4. **Bind Access Tokens to Password State:**
   Include a hash fragment or update timestamp of `access_code_hash` in the HMAC signature payload (`${tournamentId}.${exp}.${hashPrefix}`) so changing the password immediately invalidates previous cookies.
5. **Consolidate Authorized Data Queries:**
   Refactor `/api/tournaments/[id]/authorized-data` to query `tournaments`, `participants`, `groups`, `rounds`, and `matches` once each, constructing the response without redundant nested service queries.
