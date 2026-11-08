# Phase 2 — Independent Production Scalability & Security Review

**Project:** eFootball Tournament Platform  
**Repository:** `naughty-ops/efootball-tournament`  
**Production URL:** `https://efootball-tournament-cyan.vercel.app`  
**Supabase Project:** `cqgbeafenavkeirwsxbg`  
**Review Scope:** Independent Architecture & Security Audit of Phase 1 Scalability Implementations  
**Mode:** Strictly Read-Only (0 source modifications, 0 database writes, 0 migration deployments)  
**Date:** 2026-11-08  

---

## 1. Executive Verdict: **APPROVE WITH CONDITIONS (Staging Blocked Pending P0 Fixes)**

Phase 1 achieved significant architectural improvements by stopping anonymous LiveKit broadcasting, eliminating unique WebSocket topic explosion, deduplicating Server Component database fetches via React `cache()`, and drafting an atomic registration stored procedure.

However, an adversarial, line-by-line security and scalability audit revealed **2 Critical (P0) security vulnerabilities** and **2 High-Risk (P1) architectural defects** that must be rectified before applying changes to staging:

1. **[P0] Private Tournament Data Leak via Public Edge ISR:** While `robots: noindex` was added to metadata in `app/(public)/tournaments/[id]/page.tsx`, the page body unconditionally passes the full tournament object (`initialTournament`) into `PublicTournamentClientView.tsx` with `export const revalidate = 30`. Next.js and Vercel CDN render and cache private tournament details in public edge cache, leaking private tournament data to unauthorized visitors.
2. **[P0] Unscoped Streamer Room Assignment:** In `app/api/livekit/token/route.ts`, any user with the `streamer` role can request broadcaster permissions for *any arbitrary room string*, allowing a streamer assigned to Match A to hijack or overwrite the broadcast stream of Match B.
3. **[P1] Capacity Bypass for Paid Tournaments in Stored Procedure:** In `supabase/migrations/20261108000000_high_traffic_optimization_and_atomic_registration.sql`, capacity checking counts rows only in `public.participants`. For paid tournaments, slots are reserved in `tournament_registrations` with status `pending_payment` without creating a `participants` row, allowing unlimited over-subscription beyond `max_participants`.
4. **[P1] Missing Reconnection Recovery in Realtime Multiplexer:** In `hooks/useRealtimeMatches.ts`, the `SUBSCRIBED` status transition notifies connection state but omitted the authoritative resync trigger present in legacy code, meaning clients recovering from network dropouts or tab freezes will display stale scores until a subsequent event fires.

---

## 2. LiveKit Authorization Review

### 2.1 File Inspection: `app/api/livekit/token/route.ts` & `app/api/live/token/route.ts`
- `app/api/live/token/route.ts` re-exports `{ GET, POST, OPTIONS }` directly from `livekit/token/route.ts`. Both endpoints enforce identical authorization logic.
- Caller identity is derived cryptographically from `@/lib/supabase/server` (`supabase.auth.getUser()`).
- Anonymous requests for `broadcaster` or `moderator` are rejected with **401 Unauthorized**.
- Authenticated players requesting `broadcaster` are rejected with **403 Forbidden**.

### 2.2 Security Findings & Gaps
1. **Unscoped Room Publishing [Confirmed Vulnerability - P0]:**
   - At line 179 of `app/api/livekit/token/route.ts`, when `caller.isStreamer` is true, the route grants `canPublish: true` to whatever `rawRoom` was sent by the client.
   - It does not verify that `rawRoom` is associated with an active match in `public.matches WHERE live_room_name = rawRoom`.
   - It does not verify that the streamer is the designated broadcaster for that match.
2. **Account Suspension Bypass in Profile [Potential Vulnerability - P1]:**
   - At lines 75-82, role evaluation queries `admin_users`, but does not inspect `profiles.account_status` (`active`, `suspended`, `disabled`).
   - If a moderator or streamer is suspended in `profiles`, their `admin_users` record remains active unless manually removed, permitting suspended administrators to mint tokens.
3. **Token TTL Duration [Performance Concern - P2]:**
   - At line 219, tokens are minted with `ttl: '4h'`. For ephemeral viewer tokens, a 1-hour to 2-hour TTL with silent refresh is safer to minimize token replay windows.

### 2.3 LiveKit Authorization Test Matrix

| Scenario | Auth State | Role in `admin_users` | Profile Status | Requested Role | Granted Role | `canPublish` | `canPublishData` | HTTP Status | Expected vs Actual |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Anonymous Viewer** | None | None | N/A | `viewer` | `viewer` | `false` | `false` | `200 OK` | ✅ MATCH |
| **Anonymous Forgery** | None | None | N/A | `broadcaster` | None | N/A | N/A | `401 Unauthorized` | ✅ MATCH |
| **Normal Player** | Authenticated | None | Active | `broadcaster` | None | N/A | N/A | `403 Forbidden` | ✅ MATCH |
| **Normal Player Viewer** | Authenticated | None | Active | `viewer` | `viewer` | `false` | `false` | `200 OK` | ✅ MATCH |
| **Streamer (Assigned)** | Authenticated | `streamer` | Active | `broadcaster` | `broadcaster` | `true` | `true` | `200 OK` | ✅ MATCH |
| **Streamer (Unassigned Room)** | Authenticated | `streamer` | Active | `broadcaster` | `broadcaster` | `true` | `true` | `200 OK` | ⚠️ **FAIL** (Unscoped) |
| **Moderator** | Authenticated | `moderator` | Active | `moderator` | `moderator` | `false` | `true` | `200 OK` | ✅ MATCH |
| **Admin** | Authenticated | `admin` | Active | `broadcaster` | `broadcaster` | `true` | `true` | `200 OK` | ✅ MATCH |
| **Super Admin** | Authenticated | `super_admin` | Active | `broadcaster` | `broadcaster` | `true` | `true` | `200 OK` | ✅ MATCH |
| **Suspended Admin** | Authenticated | `admin` | `suspended` | `broadcaster` | `broadcaster` | `true` | `true` | `200 OK` | ⚠️ **FAIL** (Suspension ignored)|
| **Invalid Room Regex** | Any | Any | Any | Any | None | N/A | N/A | `400 Bad Request` | ✅ MATCH |

---

## 3. Realtime Architecture Review

### 3.1 File Inspection: `hooks/useRealtimeMatches.ts` & Consumers
- Module-scoped `sharedChannelRegistry` manages active channel handles using canonical topics: `rt:m:${matchId}`, `rt:t:${tournamentId}`, and `rt:all`.
- Reference counting increments when additional components in the same tab subscribe to the same topic and decrements on unmount.
- When `refCount <= 0`, `supabase.removeChannel(entry.channel)` is executed and the entry is removed from the registry.

### 3.2 Architectural Clarification & Unsupported Claim Correction
- **Unsupported Phase 1 Claim:** The Phase 1 implementation report claimed "1 Shared Canonical Topic/Page" implying a global cross-visitor subscription.
- **Clarification:** Reference counting operates **strictly within a single browser tab**. Separate visitors continue to establish individual WebSocket connections to Supabase Phoenix. However, because topics are now canonical (`rt:all` instead of `matches-realtime-all-${instanceId}`), the Phoenix cluster multicasts broadcast messages efficiently across a single topic instead of managing 1,000 separate topics.

### 3.3 Database Queries Triggered per Event Type

```
+-----------------------------------------------------------------------------------------------------------------+
| REALTIME EVENT QUERY FAN-OUT TRACE                                                                              |
+--------------------------------------+--------------------------------------+-----------------------------------+
| Realtime Event Received              | Component Action                     | Database Queries Executed         |
+--------------------------------------+--------------------------------------+-----------------------------------+
| Match score update (status: 'live')  | In-memory state patch                | 0 queries (Completely eliminated) |
| Match status -> 'completed'          | PublicTournamentClientView refresh   | 3 to 6 queries (stages, rounds)   |
| Match status -> 'live' (first start) | PublicNav & LiveTicker refresh       | 1 query (getPublicLiveMatches)    |
| Tournament status update             | TournamentsClientList fetchData      | 1 query (getPublicTournaments)    |
| Unrelated tournament match update    | TournamentsClientList filters out    | 0 queries (Filtered)              |
+--------------------------------------+--------------------------------------+-----------------------------------+
```

### 3.4 Findings & Gaps in Realtime
1. **Missed Reconnection Resync [Potential Vulnerability - P1]:**
   - In `hooks/useRealtimeMatches.ts`, `notifyStatusChange('connected')` does not trigger an authoritative re-fetch when transitioning from reconnecting back to connected. If scores changed during network interruption, stale data remains until the next event.
2. **Out-of-Order Timestamp Verification [Performance Concern - P2]:**
   - At line 141, deduplication checks `lastEventSignatures.has(eventSig)`. If an older packet arrives delayed over the network after a newer packet, the older packet will still be applied. Adding `commit_timestamp` comparison or monotonicity checks prevents backward clock drift.

---

## 4. Private Tournament Cache Security

### 4.1 File Inspection: `app/(public)/tournaments/[id]/page.tsx` & `app/(public)/t/[tournamentId]/page.tsx`

```
┌────────────────────────────────────────────────────────────────────────┐
│ CRITICAL DATA LEAK VECTOR IN PRIVATE TOURNAMENTS                       │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Admin creates private tournament (is_private = true)                │
│ 2. Unauthorized visitor visits /tournaments/[id]                       │
│ 3. generateMetadata sets <meta name="robots" content="noindex">        │
│ 4. Page component renders <PublicTournamentClientView initialTournament>│
│ 5. export const revalidate = 30 instructs Vercel CDN to cache HTML     │
│ 6. Full tournament details are permanently served from Edge Cache!     │
└────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Security Analysis by Visitor Category

| Visitor Scenario | Cache Level | Metadata Exposed | HTML Rendered | Assessment |
| :--- | :--- | :--- | :--- | :--- |
| **Public Tournament Visitor** | Edge CDN (30s) | Full Public Title & Description | Public Details & Brackets | ✅ SECURE & OPTIMIZED |
| **Private Tournament (Unauthorized)** | Edge CDN (30s) | Obfuscated Title, `noindex` | **Full Private Tournament Body** | ❌ **CRITICAL LEAK (P0)** |
| **Private Tournament (Password Req)** | Edge CDN (30s) | Obfuscated Title, `noindex` | **Full Private Tournament Body** | ❌ **CRITICAL LEAK (P0)** |
| **Private Tournament (Authenticated)** | Edge CDN (30s) | Obfuscated Title, `noindex` | Full Body (Served from CDN) | ⚠️ Mixed Cache Conflict |

### 4.3 Mandatory Remediation (P0)
- `robots: noindex` is an indexing suggestion for search crawlers, **NOT an access control mechanism**.
- If `tournament.is_private === true`:
  - The page MUST NOT return the tournament data in static Server Component props.
  - The page MUST set response headers: `Cache-Control: private, no-cache, no-store, must-revalidate`.
  - The client view must enforce access code validation before requesting tournament fixtures or participants.

---

## 5. Atomic Registration SQL Review

### 5.1 File Inspection: `supabase/migrations/20261108000000_high_traffic_optimization_and_atomic_registration.sql`

```sql
CREATE OR REPLACE FUNCTION public.register_player_for_tournament(
    p_tournament_id UUID,
    p_user_id UUID,
    p_rules_accepted BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
```

### 5.2 Verification Checklist & Findings

| Requirement | Implementation Assessment | Status |
| :--- | :--- | :--- |
| **Identity Derivation from `auth.uid()`** | Validates `v_caller_id := auth.uid()`. Rejects if NULL. Rejects if `v_caller_id != p_user_id AND NOT is_admin()`. | ✅ PASS |
| **Client User ID Tampering** | Enforced at line 174: unauthorized callers cannot register another player. | ✅ PASS |
| **SECURITY DEFINER & Search Path** | `SECURITY DEFINER SET search_path = public, auth, pg_temp`. Prevents search_path hijacking. | ✅ PASS |
| **Explicit EXECUTE Grants** | Lines 431-433 REVOKE from PUBLIC; GRANT to `authenticated` and `service_role`. `anon` cannot execute. | ✅ PASS |
| **Capacity Lock (`SELECT ... FOR UPDATE`)** | Locks tournament row at line 236 to prevent race conditions. | ✅ PASS |
| **Paid Tournament Capacity Accounting** | **DEFECT:** Counts only `public.participants` (line 255). Does not count `tournament_registrations` with `pending_payment` or `under_verification`. | ❌ **FAIL (P1)** |
| **Duplicate Registration Prevention** | Checks existing `participants` row and `tournament_registrations` active status. | ✅ PASS |
| **WhatsApp Verification Enforcement** | Validates `whatsapp_verified = true OR whatsapp_verification_status = 'verified'` (lines 213-219). | ✅ PASS |
| **eFootball ID Uniqueness & Format** | Checks case-insensitive collision in `participants`. However, falls back to `display_name` without format regex check. | ⚠️ **MEDIUM (P2)** |
| **Rules Acceptance Enforcement** | Rejects registration if `p_rules_accepted` is false (lines 183-189). | ✅ PASS |
| **Atomic Insertion Consistency** | Free tournaments insert `participants` and `tournament_registrations` within single transaction. | ✅ PASS |

### 5.3 Concurrency Test Plan for Staging

```
k6 Concurrency Test Scenario: "50-Player Capacity Rush"
- Tournament Capacity: 16 players
- Concurrent Virtual Users: 50 players submitting simultaneously within 500ms
- Target: POST /api/registrations (calling register_player_for_tournament)
- Verification Assertions:
  1. Exactly 16 requests return 200/201 (success: true).
  2. Exactly 34 requests return 409 Conflict (code: CAPACITY_FULL).
  3. EXACTLY 16 rows exist in public.participants.
  4. ZERO deadlocks reported in PostgreSQL logs.
```

---

## 6. Distributed Rate Limiting Review

### 6.1 File Inspection: `lib/rateLimit.ts`
- `checkRateLimitAsync` targets Upstash Redis via native HTTPS `pipeline`.
- Pipeline batch: `['INCR', key]`, `['EXPIRE', key, window, 'NX']`, `['TTL', key]`.
- Fail-open policy: If Redis is down, network fails, or timeout (800ms) triggers, falls back to `checkRateLimit` (process memory).

### 6.2 Atomicity & Race Condition Analysis
- **Pipeline vs Atomic Script:**
  - Redis executes pipeline commands sequentially on the connection, but commands from other connections can interleave between `INCR` and `EXPIRE` unless run inside a Lua script or `MULTI`/`EXEC`.
  - In edge cases where a process crashes or network cuts immediately after `INCR`, the key can theoretically exist with no expiration.
  - **Recommended Atomic Fix:** Replace the 3-command pipeline with an atomic Lua script (`EVAL`):
    ```lua
    local current = redis.call('INCR', KEYS[1])
    if current == 1 then
        redis.call('EXPIRE', KEYS[1], ARGV[1])
    end
    return {current, redis.call('TTL', KEYS[1])}
    ```
- **Fail-Open Policy Validation:**
  - Falling back to in-memory ensures high availability.
  - Process-local memory store must be acknowledged: under multi-container Vercel traffic, rate limits apply per container when Redis is offline.

---

## 7. Database Index Reconciliation

Comparing the 11 unindexed foreign keys identified by the database advisor against the prepared migration:

| Foreign Key Relationship | Column | Present in Migration? | Index Name |
| :--- | :--- | :--- | :--- |
| `tournaments.champion_id` $\rightarrow$ `participants.id` | `champion_id` | ✅ **YES** | `idx_tournaments_champion_id` |
| `tournaments.runner_up_id` $\rightarrow$ `participants.id` | `runner_up_id` | ✅ **YES** | `idx_tournaments_runner_up_id` |
| `tournament_registrations.participant_id` $\rightarrow$ `participants.id` | `participant_id` | ✅ **YES** | `idx_tournament_registrations_participant_id` |
| `tournament_registrations.verified_by` $\rightarrow$ `profiles.id` | `verified_by` | ✅ **YES** | `idx_tournament_registrations_verified_by` |
| `profiles.suspended_by` $\rightarrow$ `profiles.id` | `suspended_by` | ✅ **YES** | `idx_profiles_suspended_by` |
| `homepage_sections.published_by` $\rightarrow$ `profiles.id` | `published_by` | ✅ **YES** | `idx_homepage_sections_published_by` |
| `homepage_sections.updated_by` $\rightarrow$ `profiles.id` | `updated_by` | ✅ **YES** | `idx_homepage_sections_updated_by` |
| `homepage_audit_history.performed_by` $\rightarrow$ `profiles.id` | `performed_by` | ✅ **YES** | `idx_homepage_audit_history_performed_by` |
| `restream_jobs.source_id` $\rightarrow$ `restream_sources.id` | `source_id` | ❌ **MISSING** | *(Omitted from migration)* |
| `restream_jobs.youtube_account_id` $\rightarrow$ `youtube_accounts.id` | `youtube_account_id` | ❌ **MISSING** | *(Omitted from migration)* |
| `restream_logs.user_id` $\rightarrow$ `profiles.id` | `user_id` | ❌ **MISSING** | *(Omitted from migration)* |

### Findings:
1. 8 out of 11 foreign keys are indexed.
2. The 3 restream-related foreign keys (`restream_jobs`, `restream_logs`) were omitted because their base tables were created outside standard migration files. They must be wrapped in `IF EXISTS` blocks in the migration.
3. **Table Lock Prevention:** In production PostgreSQL, `CREATE INDEX CONCURRENTLY` should be used to avoid write locks during index generation.

---

## 8. Prioritized Remediation Plan

### Priority P0 — Critical (Must Fix Before Staging Deployment)
1. **Fix Private Tournament Data Leakage:**
   - In `app/(public)/tournaments/[id]/page.tsx` and `app/(public)/t/[tournamentId]/page.tsx`, check `if ((tournament as any).is_private)`:
   - Do NOT pass full tournament details or brackets to the client when unauthorized.
   - Set `Cache-Control: private, no-store, must-revalidate` for private tournaments to prevent CDN edge caching.
2. **Enforce Match-Level Streamer Room Binding:**
   - In `app/api/livekit/token/route.ts`, verify that `rawRoom` matches an active match in `public.matches WHERE live_room_name = rawRoom`.
   - Ensure the authenticated user is authorized for that specific match before issuing `canPublish: true`.

### Priority P1 — High (Required for Correctness & Data Integrity)
3. **Account for Reserved Slots in Atomic Registration RPC:**
   - Update `register_player_for_tournament` to calculate effective occupied capacity as:
     `v_current_count := (SELECT COUNT(*) FROM participants WHERE tournament_id = p_tournament_id) + (SELECT COUNT(*) FROM tournament_registrations WHERE tournament_id = p_tournament_id AND status IN ('pending_payment', 'under_verification', 'payment_submitted'));`
4. **Restore Realtime Reconnection Resync:**
   - In `hooks/useRealtimeMatches.ts`, trigger a debounced resync callback whenever connection transitions from `reconnecting` to `connected`.
5. **Check `profiles.account_status` in LiveKit Route:**
   - Verify caller's profile is `active` before granting broadcaster/moderator tokens.

### Priority P2 — Medium (Optimization & Hardening)
6. **Include Missing Restream Indexes:** Add `IF EXISTS` index creation for `restream_jobs` and `restream_logs`.
7. **Atomic Redis Lua Scripting:** Replace the 3-command Upstash pipeline with an atomic Lua script.
8. **Shorten LiveKit Viewer Token TTL:** Reduce viewer TTL from `4h` to `1h` or `2h`.

---

## 9. Staging Readiness Checklist

- [ ] Private tournament edge-caching vulnerability remediated (P0).
- [ ] Match-level streamer room assignment check implemented (P0).
- [ ] Paid tournament reservation capacity counted in stored procedure (P1).
- [ ] Realtime reconnection resynchronization verified (P1).
- [ ] Missing restream foreign key indexes added to migration (P2).
- [ ] Pre-migration database snapshot created on Supabase.
- [ ] Concurrency test script verified on staging branch.

---

## 10. Conclusion: Staging Decision

**Is the current migration safe to apply to staging right now?**  
**NO.** 

The migration `20261108000000_high_traffic_optimization_and_atomic_registration.sql` currently counts only `public.participants`, which causes paid tournaments to over-subscribe under concurrent load. Furthermore, deploying Phase 1 to staging with the current `app/(public)/tournaments/[id]/page.tsx` will cache private tournament content on Vercel's Edge CDN.

Once the **P0** and **P1** corrections documented above are updated in code and SQL, the migration will be fully hardened and ready for staging deployment and load testing.
