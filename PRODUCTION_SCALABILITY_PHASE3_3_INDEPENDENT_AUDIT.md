# Phase 3.3 Independent Production Security & Architecture Audit

**Platform:** eFootball Tournament Platform  
**Target Repository:** `naughty-ops/efootball-tournament`  
**Execution Environment:** Windows / Next.js 16.3.0 / React 19 / TypeScript 5.9 / Supabase PostgreSQL  
**Audit References:** `PRODUCTION_SCALABILITY_PHASE3_1_FINAL_AUDIT.md`, `PRODUCTION_SCALABILITY_PHASE3_2_REMEDIATION_REPORT.md`  
**Audit Mode:** STRICTLY READ-ONLY (No code modifications, no SQL executions, no migrations applied).  

---

## 1. Executive Summary & Verdict

This independent audit evaluated the implementation of Phase 3.2 remediation against the vulnerabilities identified in Phase 3.1.

### Key Audit Findings:
1. **Verified Cryptographic Cookie Security:** The unsigned cookie vulnerability (P0) was resolved. Authorization tokens in [`lib/security/tournamentAccessCookie.ts`](file:///d:/Project/lib/security/tournamentAccessCookie.ts) are cryptographically signed with HMAC-SHA256, bound to specific tournament IDs, timestamp-checked for expiry, and verified using `crypto.timingSafeEqual()`.
2. **Verified Credential Isolation:** `access_code_hash` is explicitly omitted from public queries in [`services/tournamentService.ts`](file:///d:/Project/services/tournamentService.ts) and stripped from RSC payloads via `sanitizeTournamentObject()` and `redactPrivateTournament()`.
3. **Verified Password Verification:** `bcryptjs` was installed and integrated into [`app/api/tournaments/[id]/verify-access/route.ts`](file:///d:/Project/app/api/tournaments/[id]/verify-access/route.ts) with `bcrypt.compare()`.
4. **CRITICAL ARCHITECTURAL GAP — Authorized Private Data Fetching (Blocker/P1):** While database RLS policies in [`20261108010000_match_streamer_assignments_and_private_data_protection.sql`](file:///d:/Project/supabase/migrations/20261108010000_match_streamer_assignments_and_private_data_protection.sql) successfully block unauthenticated PostgREST reads on private tournaments (`COALESCE(t.is_private, FALSE) = FALSE`), **authorized visitors who enter the correct access code cannot view the protected tournament data**. Because PostgreSQL cannot read HttpOnly browser cookies, and the client component [`PublicTournamentClientView.tsx`](file:///d:/Project/app/(public)/t/[tournamentId]/PublicTournamentClientView.tsx) fetches participants, matches, and brackets via client-side PostgREST calls (`getPublicParticipants`, `getPublicMatches`, `getPublicBracket`), PostgreSQL returns zero rows. An authorized visitor sees a blank tournament. There is no privileged server-side route or Server Action to bridge the verified cookie to private data.
5. **Streamer Assignment Architecture Verified, but Admin Management Missing (P2):** `public.match_streamer_assignments` and `/api/livekit/token` successfully enforce match-level streamer authorization. However, there are no admin Server Actions or dashboard UI to assign streamers, and token revocation is passive (persisting until the 2-hour JWT expiry).
6. **Migration History Reconciled:** The missing RBAC migrations were packaged into [`supabase/migrations/20261106000000_reconcile_database_enforced_admin_rbac.sql`](file:///d:/Project/supabase/migrations/20261106000000_reconcile_database_enforced_admin_rbac.sql).
7. **Test Evidence Classification:** The Phase 3.2 test suite relies heavily on static file text inspections (8 of 17 tests) and unit mocks. There are **zero** real PostgreSQL concurrency tests and **zero** route integration tests.

### Final Verdict: `BLOCKED — SECURITY OR MIGRATION ISSUES REMAIN`

---

## 2. Detailed Findings by Category

### 2.1 Private Tournament End-to-End Security

#### 2.1.1 Cryptographic Token Architecture (VERIFIED)
* **Implementation:** [`lib/security/tournamentAccessCookie.ts#L33-L121`](file:///d:/Project/lib/security/tournamentAccessCookie.ts#L33-L121)
* **Verification:**
  - Tokens use HMAC-SHA256 (`<tournamentId>.<exp>.<base64url_hmac_signature>`).
  - Validation splits the token into exactly 3 parts and checks `tokenId === expectedTournamentId`. Cross-tournament token reuse is strictly blocked (`CROSS_TOURNAMENT_TOKEN`).
  - Expiry is verified against `Math.floor(Date.now() / 1000) > exp` (`EXPIRED_TOKEN`).
  - Signatures are verified using `crypto.timingSafeEqual()` with length check to avoid buffer exceptions.
  - Forged and unsigned tokens are rejected.

#### 2.1.2 Signing Secret Fallback Analysis (P2 Security Concern)
* **Location:** [`lib/security/tournamentAccessCookie.ts#L17-L29`](file:///d:/Project/lib/security/tournamentAccessCookie.ts#L17-L29)
* **Analysis:**
  ```typescript
  const secret =
    process.env.ACCESS_TOKEN_SECRET ||
    process.env.SUPABASE_JWT_SECRET ||
    process.env.LIVEKIT_API_SECRET;
  ```
  Falling back to `SUPABASE_JWT_SECRET` or `LIVEKIT_API_SECRET` introduces **cross-protocol key reuse**. Re-using a JWT signing secret to generate custom HMAC cookies is a cryptographic risk. If an access cookie is ever compromised, the attack surface against the Supabase JWT secret expands.
* **Recommendation:** Make `ACCESS_TOKEN_SECRET` mandatory in production and disallow fallback to JWT/LiveKit secrets.

#### 2.1.3 Password Verification Compatibility (VERIFIED)
* **Location:** [`app/api/tournaments/[id]/verify-access/route.ts#L59-L78`](file:///d:/Project/app/api/tournaments/[id]/verify-access/route.ts#L59-L78)
* **Verification:**
  - Bcrypt hashes (`$2a$`, `$2b$`, `$2y$`, `$2$`) are compared using `await bcrypt.compare(rawAccessCode, storedHash)`.
  - Unsupported Argon2 hashes are rejected safely without crashing.
  - Plaintext fallback is evaluated via constant-time buffer comparison (`timingSafeStringEqual`).

#### 2.1.4 Credential Leakage in RSC Payloads (VERIFIED)
* **Location:** [`services/tournamentService.ts#L66-L75`](file:///d:/Project/services/tournamentService.ts#L66-L75) & [`services/publicTournamentService.ts#L68-L82`](file:///d:/Project/services/publicTournamentService.ts#L68-L82)
* **Verification:**
  - `SAFE_TOURNAMENT_PUBLIC_SELECT` explicitly omits `access_code_hash`.
  - `sanitizeTournamentObject` and `redactPrivateTournament` explicitly delete `access_code_hash` and `access_code`.
  - Next.js Flight/RSC serialized HTML payloads no longer contain password hashes.

#### 2.1.5 Lack of Admin UI / Actions for Private Tournament Configuration (P2)
* **Location:** [`app/actions/tournamentActions.ts#L53-L70`](file:///d:/Project/app/actions/tournamentActions.ts#L53-L70) & [`lib/validations/tournament.ts`](file:///d:/Project/lib/validations/tournament.ts)
* **Analysis:** `createTournamentAction` and `updateTournamentAction` do not accept `is_private` or `access_code`. The schema and forms do not expose fields to configure private tournaments. Private tournaments can currently only be created or marked private via direct database queries.

---

### 2.2 Database RLS and PostgREST Security

#### 2.2.1 PostgREST Private Data Isolation (VERIFIED)
* **Location:** [`supabase/migrations/20261108010000_match_streamer_assignments_and_private_data_protection.sql#L43-L138`](file:///d:/Project/supabase/migrations/20261108010000_match_streamer_assignments_and_private_data_protection.sql#L43-L138)
* **Verification:**
  - `public.tournament_participants_public`: `WHERE ... AND COALESCE(t.is_private, FALSE) = FALSE`. Anonymous and authenticated queries cannot retrieve participants of private tournaments.
  - `public.matches`: `matches_public_read` policy requires `COALESCE(t.is_private, FALSE) = FALSE OR public.is_admin() OR ...`.
  - `public.rounds` and `public.groups`: Restricted to `COALESCE(t.is_private, FALSE) = FALSE OR public.is_admin()`.
  - Unauthorized PostgREST direct access is blocked.

#### 2.2.2 Architectural Blocker: Authorized Visitor Data Delivery (BLOCKER / P1)
* **Location:** [`app/(public)/t/[tournamentId]/PublicTournamentClientView.tsx#L125-L198`](file:///d:/Project/app/(public)/t/[tournamentId]/PublicTournamentClientView.tsx#L125-L198) & [`services/publicTournamentService.ts#L112-L165`](file:///d:/Project/services/publicTournamentService.ts#L112-L165)
* **Analysis:**
  - The client view prompts the user for an access code.
  - `/api/tournaments/[id]/verify-access` verifies the password and sets an `httpOnly` cookie (`t_access_${id}`).
  - When unlocked, `PublicTournamentClientView` calls `getPublicParticipants(tournamentId)`, `getPublicGroupStage(tournamentId)`, `getPublicMatches(tournamentId)`, and `getPublicBracket(tournamentId)`.
  - These service functions execute client-side queries using `createClient()` from `@/lib/supabase/client` (anonymous PostgREST).
  - Because PostgreSQL RLS cannot read HttpOnly browser cookies, PostgREST enforces `COALESCE(t.is_private, FALSE) = FALSE`.
  - **Result:** PostgreSQL returns an empty set (`[]`) for all queries. An authorized user who successfully unlocks a private tournament sees 0 participants, 0 groups, 0 matches, and an empty bracket.
* **Required Fix:** Provide a server-side route or Server Action (e.g. `/api/tournaments/[id]/authorized-data`) that reads the signed cookie via `cookies()`, verifies it with `verifySignedTournamentAccessToken()`, queries the private tournament data using the privileged `createAdminClient()`, and returns the data to the client.

---

### 2.3 Match Streamer Assignment Security

#### 2.3.1 Assignment Architecture & Token Enforcement (VERIFIED)
* **Location:** [`app/api/livekit/token/route.ts#L249-L287`](file:///d:/Project/app/api/livekit/token/route.ts#L249-L287) & [`supabase/migrations/20261108010000_match_streamer_assignments_and_private_data_protection.sql#L10-L40`](file:///d:/Project/supabase/migrations/20261108010000_match_streamer_assignments_and_private_data_protection.sql#L10-L40)
* **Verification:**
  - Table `public.match_streamer_assignments` enforces `UNIQUE(match_id, streamer_id)` and foreign keys to `matches(id)` and `auth.users(id)`.
  - RLS strictly restricts INSERT/UPDATE/DELETE to `public.is_admin()`. Streamers have SELECT-only access on their own records (`streamer_id = auth.uid()`). Streamers cannot assign themselves.
  - In `/api/livekit/token`, streamers without admin privileges are verified against `match_streamer_assignments`. Unassigned streamers receive HTTP 403 Forbidden.
  - Suspended accounts receive HTTP 403 Forbidden (`caller.accountStatus !== 'active'`).
  - Normal players receive HTTP 403 Forbidden (`!caller.isStreamer`).

#### 2.3.2 Token Revocation Realities (P2 Documentation Finding)
* **Analysis:**
  - LiveKit tokens are self-contained JWTs issued with a 2-hour TTL.
  - If an administrator deletes a streamer's assignment in `match_streamer_assignments`, the streamer is immediately blocked from acquiring **new** tokens.
  - However, **already-issued tokens are not revoked in real time**. The streamer's active WebRTC broadcast session remains active on LiveKit Cloud until the JWT expires (up to 2 hours) or the match status transitions to `completed`.
  - Real-time eviction would require invoking LiveKit Cloud's Server API (`RoomServiceClient.removeParticipant`).

---

### 2.4 Registration and Payment Reservation Integrity

#### 2.4.1 Strict eFootball ID Normalization & Validation (VERIFIED)
* **Location:** [`supabase/migrations/20261108010000_match_streamer_assignments_and_private_data_protection.sql#L235-L263`](file:///d:/Project/supabase/migrations/20261108010000_match_streamer_assignments_and_private_data_protection.sql#L235-L263)
* **Verification:**
  - `v_raw_efootball_id := UPPER(TRIM(COALESCE(v_profile.efootball_id, '')));`
  - Display name fallback was completely removed.
  - Unhyphenated 13-character strings (`^[A-Z]{4}[0-9]{9}$`) are normalized into `ABCD-123-456-789`.
  - Regex validation strictly enforces `^[A-Z]{4}-[0-9]{3}-[0-9]{3}-[0-9]{3}$`.
  - The normalized value `v_normalized_efootball_id` is consistently used across all duplicate checks and insertions.

#### 2.4.2 Concurrency & Pending Reservation Collision Checks (VERIFIED)
* **Location:** Lines 340-379 of the migration:
  - Checks existing confirmed participants: `SELECT 1 FROM public.participants ... username = v_normalized_efootball_id`.
  - Checks other users' active pending registrations: `SELECT 1 FROM public.tournament_registrations WHERE tournament_id = p_tournament_id AND status IN ('pending_payment', 'payment_submitted', 'under_verification') AND LOWER(TRIM(efootball_id)) = LOWER(v_normalized_efootball_id) AND user_id != p_user_id`.
  - Capacity accounting: sums confirmed `participants` + pending reservations with `participant_id IS NULL`. Confirmed/approved participants are not double-counted. Rejected/cancelled reservations release capacity immediately.
  - Row locking: `SELECT ... FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;` serializes concurrent transactions.

---

### 2.5 Migration History and Database Reproducibility

#### 2.5.1 Migration Sequence & Foreign Key Analysis (VERIFIED)
* **Official Migration Order:**
  1. `20261106000000_reconcile_database_enforced_admin_rbac.sql`
  2. `20261107000000_manual_whatsapp_payment_system.sql`
  3. `20261108000000_high_traffic_optimization_and_atomic_registration.sql`
  4. `20261108010000_match_streamer_assignments_and_private_data_protection.sql`
* **Verification:**
  - In `20261106000000`, `admin_role` ENUM, `admin_users.role`, `is_admin()`, and `tournaments.is_private` are created.
  - `20261107000000` references `is_admin()`, which is now defined prior to execution.
  - `20261108010000` references `matches(id)` and `auth.users(id)` with valid foreign keys.
  - All index creations use `IF NOT EXISTS`.
  - Clean database reconstruction from `supabase/migrations/` is structurally sound.

---

### 2.6 Redis Rate Limiter and Realtime

#### 2.6.1 Redis Fail-Open Warning & Key Isolation (VERIFIED)
* **Location:** [`lib/rateLimit.ts#L106-L135`](file:///d:/Project/lib/rateLimit.ts#L106-L135)
* **Verification:**
  - Lua script executes `INCR`, `EXPIRE`, and `TTL` atomically.
  - When `UPSTASH_REDIS_REST_URL` or `UPSTASH_REDIS_REST_TOKEN` is missing, it emits: `[RateLimit Warning] UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN is not configured. Falling back to non-distributed process-local memory store. Multi-instance serverless deployments will NOT share rate limits.`
  - Callers namespace their keys (e.g. `access_code_${ip}`, `livekit_token_${ip}`).

#### 2.6.2 Realtime Monotonicity & NaN Protection (VERIFIED)
* **Location:** [`hooks/useRealtimeMatches.ts#L146-L157`](file:///d:/Project/hooks/useRealtimeMatches.ts#L146-L157)
* **Verification:**
  - Evaluates `const recordTs = new Date(newRecord.updated_at).getTime();`.
  - Explicitly guards: `if (Number.isFinite(recordTs) && recordTs > 0)`.
  - Malformed or missing timestamps do not overwrite `lastEventTimestamps` with `NaN`, preserving out-of-order rejection for subsequent valid frames.

---

### 2.7 Test Evidence Audit

Inspection of `scratch/test-remediation-phase3-2.ts` reveals the following actual test classifications:

| Test ID | Stated Scope | Actual Classification | Notes / Limitations |
| :--- | :--- | :--- | :--- |
| **TEST 1** | Forged Cookie Rejection | **Unit Test** | Tests `verifySignedTournamentAccessToken` against dummy forged strings. |
| **TEST 2** | Expired Cookie Rejection | **Unit Test** | Tests negative TTL token expiry logic. |
| **TEST 3** | Cross-Tournament Rejection | **Unit Test** | Tests tournament ID mismatch logic. |
| **TEST 4** | Valid Cookie Acceptance | **Unit Test** | Tests token issuance and verification round-trip. |
| **TEST 5** | Credential Leakage | **Unit Test** | Tests in-memory `sanitizeTournamentObject` and `redactPrivateTournament`. |
| **TEST 6** | Private PostgREST RLS | **Static File Inspection** | Reads migration file text for `AND COALESCE(t.is_private, FALSE) = FALSE`. **Does not test PostgreSQL.** |
| **TEST 7** | Public Data Preservation | **Static File Inspection** | Reads migration file text for `GRANT SELECT`. **Does not test PostgreSQL.** |
| **TEST 8** | Bcrypt Verification | **Unit Test** | Tests `bcrypt.compare` against `bcrypt.hash`. |
| **TEST 9** | Incorrect Password | **Unit Test** | Tests `bcrypt.compare` rejection. |
| **TEST 10** | Streamer Assignment | **Static File Inspection** | Reads `route.ts` text for `match_streamer_assignments`. **Does not test API.** |
| **TEST 11** | Unassigned Streamer 403 | **Static File Inspection** | Reads `route.ts` text for HTTP 403 error message string. |
| **TEST 12** | Suspended Account Check | **Static File Inspection** | Reads `route.ts` text for account status check. |
| **TEST 13** | Exact eFootball ID Regex | **Unit Test** | Tests `isValidEfootballId` and `normalizeEfootballId` helper functions. |
| **TEST 14** | Duplicate Pending ID | **Static File Inspection** | Reads migration SQL text for `EFOOTBALL_ID_RESERVED`. **Does not test PostgreSQL.** |
| **TEST 15** | Capacity Accounting | **Mocked Arithmetic Test** | Evaluates inline JS arithmetic `10 + 4`. **Does not test PostgreSQL concurrency.** |
| **TEST 16** | Redis Missing Warning | **Static File Inspection** | Reads `rateLimit.ts` text for `[RateLimit Warning]`. |
| **TEST 17** | NaN Timestamp Guard | **Static File Inspection** | Reads `useRealtimeMatches.ts` text for `Number.isFinite`. |

#### Summary of Test Suite Quality:
- **0** Real PostgreSQL database integration tests.
- **0** Real concurrent load tests.
- **0** Route integration tests.
- **8** Static source code text inspections.
- **8** Unit tests.
- **1** Mocked JS arithmetic test.

---

### 2.8 Performance & Capacity Readiness

| Metric / Layer | Evaluated Capacity | Status | Risk / Limitation |
| :--- | :--- | :--- | :--- |
| **Public Browsing (`/tournaments`)** | ~1,000 visitors | High | Cached via ISR (30s revalidation). Minimal Supabase query load. |
| **Private Page SSR (`/tournaments/[id]`)** | ~250 visitors | Medium | Reading `cookies()` opts into dynamic rendering (`ƒ Dynamic`). Each request hits Supabase. |
| **Realtime WebSockets (`/live`)** | 200–500 visitors | High Contention | Bound by Supabase Realtime concurrent socket limits (200 on Free, 500 on Pro). |
| **Registration Concurrency** | 16–32 slots / sec | Safe / Bottleneck | `SELECT ... FOR UPDATE` prevents race conditions, but queues concurrent transactions under high spike loads. |
| **LiveKit Token Generation** | 30 req/min per IP | Moderate | Protected by distributed rate limiting; token TTL prevents stampedes. |

---

## 3. Comprehensive Vulnerability Matrix

| Finding ID | Severity | Category | Description | Phase 3.3 Status |
| :--- | :--- | :--- | :--- | :--- |
| **3.3.1** | **BLOCKER (P1)** | Architecture | Authorized private tournament visitors cannot view participants, matches, or brackets because PostgreSQL RLS blocks client-side PostgREST calls. | **BLOCKER** |
| **3.3.2** | **Medium (P2)** | Security | `tournamentAccessCookie.ts` falls back to `SUPABASE_JWT_SECRET` (cross-protocol key reuse). `ACCESS_TOKEN_SECRET` should be mandatory. | **UNRESOLVED** |
| **3.3.3** | **Medium (P2)** | Feature | Admin UI and Server Actions lack inputs for `is_private` and `access_code`. | **UNRESOLVED** |
| **3.3.4** | **Medium (P2)** | Operational | Streamer assignment management UI is missing in `/admin`; token revocation is passive (persists up to 2h). | **UNRESOLVED** |
| **3.3.5** | **Low (P3)** | Testing | Test suite relies heavily on static text search rather than actual route or database integration tests. | **UNRESOLVED** |

---

## 4. Staging Prerequisites (Requirements to Unblock Staging Deployment)

To unblock the staging review, the following remediation must be executed:
1. **Implement Server-Side Protected Data Fetcher:**
   Create a secure Server Action or Route Handler (e.g., `getAuthorizedPrivateTournamentData(tournamentId)`) that reads the `t_access_${id}` cookie, verifies its HMAC signature with `verifySignedTournamentAccessToken()`, queries the private tournament data using `createAdminClient()`, and returns it to `PublicTournamentClientView.tsx`.
2. **Make `ACCESS_TOKEN_SECRET` Mandatory:**
   Disallow fallback to `SUPABASE_JWT_SECRET` or `LIVEKIT_API_SECRET` in production to prevent cross-protocol key compromise.
3. **Add Streamer Assignment Admin Actions:**
   Implement `assignStreamerToMatch(matchId, streamerId)` and `removeStreamerFromMatch(assignmentId)` in admin actions.

---

## 5. Final Verdict

# `BLOCKED — SECURITY OR MIGRATION ISSUES REMAIN`

*(Blocked by architectural gap 3.3.1: Authorized private tournament visitors are unable to view protected participants, matches, and brackets through client-side PostgREST queries due to database RLS isolation).*
