# Production Scalability & Security Audit — Phase 3.1 Final Review

**Platform:** eFootball Tournament Platform  
**Target Repository:** `naughty-ops/efootball-tournament`  
**Execution Environment:** Windows / Next.js 16.3.0 / React 19 / TypeScript 5.9 / Supabase PostgreSQL  
**Audit Scope:** Independent, read-only verification of Phase 3 remediation claims against actual source code, SQL migrations, database schema, and test suite.  
**Mode:** Strictly READ-ONLY (No code edits, no SQL executions, no migrations applied).  

---

## 1. Executive Summary & Verdict

This audit conducted an independent, evidence-based verification of every claim made in `PRODUCTION_SCALABILITY_PHASE3_REMEDIATION_REPORT.md`.

While several improvements were made in Phase 3 (such as scalar subquery optimizations for RLS, LiveKit anonymous token restrictions, and atomic reservation accounting logic), multiple critical vulnerabilities remain unaddressed or were introduced during remediation. Most notably, **match-level streamer assignments cannot be enforced because no streamer assignment column exists in the schema**, **private tournament access cookies can be trivially forged by any visitor**, and **access code hashes are exposed directly in client HTML payloads**.

### Final Verdict: `BLOCKED — SECURITY FIXES REQUIRED`

---

## 2. Detailed Findings by Category

### 2.1 Private Tournament Security

#### Finding 2.1.1: Unsigned Cookie Forgery Bypasses Lock Screen (Critical - P0)
* **Location:** [`app/(public)/tournaments/[id]/page.tsx#L77-L78`](file:///d:/Project/app/(public)/tournaments/[id]/page.tsx#L77-L78) & [`app/(public)/t/[tournamentId]/page.tsx#L81-L82`](file:///d:/Project/app/(public)/t/[tournamentId]/page.tsx#L81-L82)
* **Evidence:**
  ```typescript
  const accessCookie = cookieStore.get(`t_access_${id}`)?.value;
  const isAuthorized = Boolean(accessCookie && accessCookie.length > 8);
  ```
* **Analysis:** The access cookie issued by `/api/tournaments/[id]/verify-access` is an unsigned plain string (`granted_${Date.now()}_...`). The Server Components verify authorization purely by testing `accessCookie.length > 8`. Any anonymous visitor can open the browser console and execute:
  ```javascript
  document.cookie = "t_access_<tournamentId>=123456789; path=/";
  ```
  Upon refreshing, `isAuthorized` evaluates to `true`, completely bypassing the private tournament lock screen and rendering unredacted tournament data without knowing the access code.

#### Finding 2.1.2: Access Code Hash Leaked in Client HTML Payload (Critical - P0)
* **Location:** [`services/tournamentService.ts#L118-L123`](file:///d:/Project/services/tournamentService.ts#L118-L123) & [`services/publicTournamentService.ts#L70-L80`](file:///d:/Project/services/publicTournamentService.ts#L70-L80)
* **Evidence:**
  In `services/tournamentService.ts`:
  ```typescript
  .select('*, participants:participants!participants_tournament_id_fkey(count), ...')
  ```
  In `services/publicTournamentService.ts`:
  ```typescript
  export function redactPrivateTournament(tourney: TournamentWithStats): TournamentWithStats {
    return {
      ...tourney,
      is_private: true,
      description: null,
      ...
    };
  }
  ```
* **Analysis:** `getTournamentById` selects `*` from `public.tournaments`, fetching `access_code_hash`. `redactPrivateTournament()` uses object spread (`...tourney`) without stripping `access_code_hash`. When passed as `initialTournament` to `PublicTournamentClientView`, Next.js serializes all props into inline `<script>` tags (Flight data / RSC payload). The hashed (or plaintext) access code is exposed in the page source of locked private tournaments.

#### Finding 2.1.3: Data Exfiltration via Alternative Public APIs & Views (Critical - P0)
* **Location:** [`supabase/migrations/20261101030000_production_security_and_drift_remediation.sql#L187-L201`](file:///d:/Project/supabase/migrations/20261101030000_production_security_and_drift_remediation.sql#L187-L201) & [`supabase/migrations/20260807000000_create_efootball_tables.sql#L130`](file:///d:/Project/supabase/migrations/20260807000000_create_efootball_tables.sql#L130)
* **Evidence:**
  - View `public.tournament_participants_public` is defined `WITH (security_invoker = false)` and granted to `anon` and `authenticated`:
    ```sql
    WHERE t.status IN ('registration', 'ongoing', 'completed')
      AND p.status IN ('active', 'eliminated');
    ```
    There is no `AND t.is_private = false` filter.
  - Table `public.matches` policy:
    ```sql
    CREATE POLICY "Allow public read access on matches" ON public.matches FOR SELECT USING (true);
    ```
  - Table `public.rounds` policy:
    ```sql
    CREATE POLICY "Allow public read access on rounds" ON public.rounds FOR SELECT USING (true);
    ```
* **Analysis:** Even with client-side gating in `PublicTournamentClientView`, any unauthorized user can issue direct queries via Supabase client or PostgREST (`/rest/v1/tournament_participants_public?tournament_id=eq.<id>` and `/rest/v1/matches?tournament_id=eq.<id>`) using the public anonymous key to retrieve all participants, match fixtures, and scores of private tournaments.

#### Finding 2.1.4: Broken Bcrypt Hash Comparison in Access Verification API (High - P1)
* **Location:** [`app/api/tournaments/[id]/verify-access/route.ts#L59-L69`](file:///d:/Project/app/api/tournaments/[id]/verify-access/route.ts#L59-L69)
* **Evidence:**
  ```typescript
  if (storedHash.startsWith('$2') || storedHash.startsWith('$argon2')) {
    try {
      isMatch = storedHash === rawAccessCode;
    } catch {
      isMatch = false;
    }
  } else {
    isMatch = storedHash === rawAccessCode;
  }
  ```
* **Analysis:** When `storedHash` starts with `$2` (standard bcrypt), the code performs a raw string equality check (`storedHash === rawAccessCode`) instead of calling `bcrypt.compare()`. Any private tournament with a hashed access code in the database will perpetually reject valid access codes with HTTP 401.

---

### 2.2 LiveKit Authorization

#### Finding 2.2.1: Lack of Match-Level Streamer Assignment Column (BLOCKER)
* **Location:** [`app/api/livekit/token/route.ts#L222-L235`](file:///d:/Project/app/api/livekit/token/route.ts#L222-L235) & Schema Inspection (`public.matches`)
* **Evidence:**
  The user instructions explicitly state:
  > *"Do not invent streamer assignment tables or columns. If the schema cannot establish match-level streamer assignment, mark this as a BLOCKER."*
  
  Inspection of all database migrations confirms:
  - `public.matches` contains: `id, round_id, tournament_id, participant_a, participant_b, score_a, score_b, winner_id, status, match_order, stage, extra_time, penalty_shootout, live_room_name, ...`
  - There is **no** `streamer_id`, `assigned_streamer_id`, or join table `match_streamers`.
  - In `app/api/livekit/token/route.ts`:
    ```typescript
    const { data: matchRecord, error: matchErr } = await (supabase.from('matches') as any)
      .select('id, status, live_room_name')
      .eq('live_room_name', rawRoom)
      .maybeSingle();
    ```
* **Analysis:** The API only checks if `rawRoom` matches *any* active match's `live_room_name`. It does not and cannot verify that the calling streamer is assigned to that specific match. Consequently, **any authenticated user with a `streamer` role can publish video and audio to ANY active match room across the entire platform**. This violates the requirement that streamers publish only to explicitly assigned matches and constitutes a **BLOCKER**.

#### Verified LiveKit Protections
* Anonymous visitors cannot acquire broadcaster or moderator tokens; they are strictly restricted to `viewer` permissions (lines 194-200, 279-283).
* Normal players (non-streamer, non-admin) cannot broadcast (lines 209-214: returns HTTP 403 Forbidden).
* Suspended, banned, and disabled accounts are immediately stripped of publishing privileges via `profiles.account_status` inspection (lines 202-207: returns HTTP 403 Forbidden).
* Admin test room (`efootball-live-test`) is restricted to verified `admin` or `super_admin` roles (lines 240-248).
* Viewer tokens expire in 1 hour; broadcaster tokens in 2 hours (line 295).

---

### 2.3 Registration Concurrency and Payment Reservations

#### Finding 2.3.1: Loose eFootball ID Regex & Fallback in Database Function (Medium - P2)
* **Location:** [`supabase/migrations/20261108000000_high_traffic_optimization_and_atomic_registration.sql#L237-L251`](file:///d:/Project/supabase/migrations/20261108000000_high_traffic_optimization_and_atomic_registration.sql#L237-L251)
* **Evidence:**
  In SQL migration:
  ```sql
  v_normalized_efootball_id := TRIM(COALESCE(v_profile.efootball_id, v_profile.display_name, ''));
  ...
  IF v_normalized_efootball_id !~ '^[a-zA-Z0-9_\-\.]{3,30}$' THEN
  ```
  In TypeScript standard validation [`lib/validations/efootball.ts#L23`](file:///d:/Project/lib/validations/efootball.ts#L23):
  ```typescript
  export const EFOOTBALL_ID_REGEX = /^[A-Z]{4}-[0-9]{3}-[0-9]{3}-[0-9]{3}$/;
  ```
* **Analysis:** The database function accepts arbitrary strings (3-30 characters) and falls back to `v_profile.display_name` if `efootball_id` is missing. This allows non-standard eFootball IDs to be committed directly into `participants` and `tournament_registrations`.

#### Finding 2.3.2: Pending Reservation eFootball ID Collisions (Medium - P2)
* **Location:** [`supabase/migrations/20261108000000_high_traffic_optimization_and_atomic_registration.sql#L342-L352`](file:///d:/Project/supabase/migrations/20261108000000_high_traffic_optimization_and_atomic_registration.sql#L342-L352)
* **Evidence:**
  ```sql
  IF EXISTS (
      SELECT 1 FROM public.participants
      WHERE tournament_id = p_tournament_id
      AND LOWER(TRIM(username)) = LOWER(v_normalized_efootball_id)
  ) THEN
  ```
* **Analysis:** The check only scans `public.participants`. It does not check `tournament_registrations` for pending reservations. Two different user accounts can submit pending WhatsApp payment requests for the identical eFootball ID concurrently.

#### Verified Concurrency Protections
* Row locking is implemented via `SELECT ... FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;` (line 259), serializing concurrent registration transactions.
* Total capacity sums confirmed participants (`public.participants`) and pending unconfirmed reservations (`status IN ('pending_payment', 'payment_submitted', 'under_verification') AND participant_id IS NULL`), preventing slot oversubscription.
* Once a registration is confirmed or approved with a non-null `participant_id`, it is excluded from the pending reservation count, preventing double-counting.
* Rejected, cancelled, or expired reservations release capacity immediately because they are omitted from the active reservation status filter.
* Function enforces `v_caller_id := auth.uid();` and restricts proxy registration to verified admins (lines 176-195).
* Function defines `SET search_path = public, auth, pg_temp;` and revokes execution from `PUBLIC`.

---

### 2.4 Distributed Redis Rate Limiting

#### Finding 2.4.1: Silent Fallback Masks Missing Distributed Rate Limit Protection (Medium - P2)
* **Location:** [`lib/rateLimit.ts#L120-L122`](file:///d:/Project/lib/rateLimit.ts#L120-L122)
* **Evidence:**
  ```typescript
  if (!redisUrl || !redisToken) {
    return checkRateLimit(key, rule);
  }
  ```
* **Analysis:** If `UPSTASH_REDIS_REST_URL` or `UPSTASH_REDIS_REST_TOKEN` is unset or omitted in staging or production, the function silently invokes the process in-memory `checkRateLimit` without emitting a log warning. In a serverless environment with multiple concurrent lambda instances, this creates a false sense of distributed rate limiting while allowing traffic to exceed configured limits across isolates.

#### Verified Rate Limiter Protections
* The Lua script executed via Upstash `EVAL` (`INCR` + conditional `EXPIRE` + `TTL`) is executed atomically within Redis.
* Rate limit keys are prefixed with `ratelimit:` and TTL is set to `rule.windowSeconds`.
* Network timeouts are enforced via an 800ms `AbortSignal.timeout(800)`.

---

### 2.5 Realtime Reliability

#### Finding 2.5.1: Malformed Timestamp Permanently Disables Out-of-Order Protection (Low - P3)
* **Location:** [`hooks/useRealtimeMatches.ts#L146-L154`](file:///d:/Project/hooks/useRealtimeMatches.ts#L146-L154)
* **Evidence:**
  ```typescript
  if (payload.table === 'matches' && newRecord.id && newRecord.updated_at) {
    const recordTs = new Date(newRecord.updated_at).getTime();
    const lastTs = currentEntry.lastEventTimestamps.get(newRecord.id);
    if (lastTs && recordTs < lastTs) {
      return;
    }
    currentEntry.lastEventTimestamps.set(newRecord.id, recordTs);
  }
  ```
* **Analysis:** If `newRecord.updated_at` is invalid, `recordTs` evaluates to `NaN`. Calling `lastEventTimestamps.set(newRecord.id, NaN)` causes all subsequent comparisons (`recordTs < NaN`) to evaluate to `false`, permanently disabling out-of-order event rejection for that match until the page is reloaded.

#### Verified Realtime Behaviors
* Reconnection resynchronization is verified: `hasConnectedOnce` tracks socket status; upon transitioning back to `SUBSCRIBED` after an error or disconnect, it triggers a debounced resynchronization.
* Initial channel subscription does not trigger redundant refetches.
* Reference counting (`refCount`) properly manages channel lifecycles and unregisters Supabase channels when all subscribers unmount.
* Architecture acknowledgment: `sharedChannelRegistry` operates purely within a single browser tab's JavaScript runtime; separate tabs and distinct visitors maintain independent WebSocket connections to Supabase.

---

### 2.6 Migration Review

#### Finding 2.6.1: Critical Migration Drift / Uncommitted Schema Dependencies (High - P1)
* **Location:** `20261105010000_database_enforced_admin_rbac_REVISED.sql` (Root directory) vs `supabase/migrations/`
* **Evidence:**
  - `tournaments.is_private` and `tournaments.access_code_hash` were defined in `20261105010000_database_enforced_admin_rbac_REVISED.sql`, which is stored in the repository root, **not** in `supabase/migrations/`.
  - Migration `supabase/migrations/20261108000000_high_traffic_optimization_and_atomic_registration.sql` line 255 directly queries `is_private` and `access_code_hash`.
* **Analysis:** Running Supabase migration tooling (`supabase db reset` or `supabase migration up`) against a clean database will fail because the columns `is_private` and `access_code_hash` do not exist in the official `supabase/migrations/` directory history.

---

### 2.7 Test Evidence Audit

Inspection of `scratch/test-remediation-phase3.ts` reveals the following actual classification of tests:

| Test ID | Described Category | Actual Classification | Verdict / Reality |
| :--- | :--- | :--- | :--- |
| **TEST 1.1** | Private Data Isolation | Static Object Inspection | Tests in-memory `redactPrivateTournament` function only. |
| **TEST 1.2** | Access Verification | Mocked Unit Test | Verifies HTTP 400 when request body is empty `{}`. |
| **TEST 2.1** | LiveKit Viewer Token | Integration Test | Calls local route handler; verifies viewer JWT generation. |
| **TEST 2.2** | LiveKit Forgery Block | Integration Test | Calls local route handler; verifies 401 when unauthenticated. |
| **TEST 2.3** | LiveKit Invalid Room | Integration Test | Calls local route handler; verifies 400 on invalid room regex. |
| **TEST 3.1** | Rate Limiter Atomicity | Local Unit Test | Tested local in-memory fallback store (no Redis in local env). |
| **TEST 4.1** | Concurrency Simulation | **Mocked In-Memory Counter** | **NOT a database test.** A pure JavaScript loop (`for i=0..50; pendingReservations++`) testing JS arithmetic. Did not execute SQL or test PostgreSQL locks. |
| **TEST 5.1** | Realtime Monotonicity | **Mocked In-Memory Map** | **NOT a realtime test.** Evaluated an inline JS helper function (`timestamps.set()`). Did not test Supabase WebSockets or network reconnections. |

#### Critical Missing Tests
1. Real concurrent PostgreSQL test executing `register_player_for_tournament` with parallel transactions.
2. Signed cookie tampering test (currently fails because arbitrary unsigned cookies are accepted).
3. Test verifying `tournament_participants_public` view excludes private tournaments.
4. Streamer authorization test attempting to stream to an unassigned match.
5. LiveKit token expiration and client renewal integration test.

---

## 3. Comprehensive Summary of Findings

| Finding ID | Severity | Category | Description | Status |
| :--- | :--- | :--- | :--- | :--- |
| **2.1.1** | **Critical (P0)** | Security | Unsigned `t_access_${id}` cookie allows trivial lock-screen bypass via `length > 8` check. | **UNRESOLVED** |
| **2.1.2** | **Critical (P0)** | Privacy | `access_code_hash` leaked in Client Component props / Flight HTML payload. | **UNRESOLVED** |
| **2.1.3** | **Critical (P0)** | Security | `tournament_participants_public`, `matches`, and `rounds` readable via PostgREST for private tournaments. | **UNRESOLVED** |
| **2.1.4** | **High (P1)** | Functionality | Bcrypt hash verified with `===` in `verify-access/route.ts`, breaking hashed passwords. | **UNRESOLVED** |
| **2.2.1** | **BLOCKER** | Architecture | Schema lacks match-level streamer assignment column; any streamer can broadcast to any match. | **BLOCKER** |
| **2.6.1** | **High (P1)** | Migration | Root migration `20261105010000...` not integrated into `supabase/migrations/`; breaks clean builds. | **UNRESOLVED** |
| **2.3.1** | **Medium (P2)** | Integrity | Loose eFootball ID regex and `display_name` fallback in SQL RPC. | **UNRESOLVED** |
| **2.3.2** | **Medium (P2)** | Integrity | Pending registrations do not check eFootball ID collision against other pending reservations. | **UNRESOLVED** |
| **2.4.1** | **Medium (P2)** | Reliability | Missing Upstash env vars silently fall back to non-distributed memory store without warning. | **UNRESOLVED** |
| **2.5.1** | **Low (P3)** | Reliability | `NaN` timestamp from malformed date disables realtime monotonicity guard for match. | **UNRESOLVED** |

---

## 4. Staging Prerequisites (Action Items Required Prior to Deployment)

1. **Schema Migration for Streamer Assignment:**
   Add `assigned_streamer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL` to `public.matches`, and update `app/api/livekit/token/route.ts` to enforce `matchRecord.assigned_streamer_id === caller.userId`.
2. **Cryptographic Cookie Signing:**
   Sign `t_access_${id}` with an HMAC-SHA256 signature using `process.env.AUTH_SECRET` or verify against a database session table.
3. **Strip Access Code Hash from Queries & Payloads:**
   Exclude `access_code_hash` from `getTournamentById` / `getPublicTournament` and ensure `redactPrivateTournament` strips all credentials.
4. **Fix Bcrypt Verification:**
   Replace `storedHash === rawAccessCode` with `await bcrypt.compare(rawAccessCode, storedHash)` in `verify-access/route.ts`.
5. **Protect Private Data in PostgreSQL RLS & Views:**
   Add `AND t.is_private = false` to `tournament_participants_public` and restrict `matches`, `rounds`, and `groups` RLS policies for private tournaments.
6. **Reconcile Root Migrations into `supabase/migrations/`:**
   Move all schema definitions from `20261105010000_database_enforced_admin_rbac_REVISED.sql` into standard versioned migration files in `supabase/migrations/`.

---

## 5. Final Verdict

# `BLOCKED — SECURITY FIXES REQUIRED`
