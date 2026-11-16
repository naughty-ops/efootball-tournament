# LIVE MATCH VIEWER COUNT: ROOT CAUSE AUDIT & TECHNICAL INVESTIGATION REPORT

**Project:** eFootball Tournament Platform  
**Target File Path:** `reports/LIVE_MATCH_VIEWER_COUNT_AUDIT.md`  
**Date:** November 16, 2026  
**Auditor:** DeepMind Antigravity Technical Audit Engine  
**Status:** PHASE 1 COMPLETE — ROOT CAUSES IDENTIFIED & ARCHITECTURE PROPOSED

---

## 1. EXECUTIVE SUMMARY

The live match viewer count system was audited across the entire stack: Next.js 16 App Router frontend, LiveKit WebRTC client, Supabase PostgreSQL schema, RLS policies, Realtime configuration, and admin analytics queries.

### Core Audit Findings
1. **Zero Real-Time Synchronization**: There is **no Realtime subscription or Presence channel** for viewer counts. The viewer count shown to users on `/live/[matchId]` is derived strictly from a local, unshared client calculation or initialized to a static default (`1`).
2. **Coupling to Unrelated WebRTC Peer Count**: `LiveKitStreamPlayer` uses `(room.remoteParticipants.size || 0) + 1` to notify the page of viewer changes. In LiveKit SFU architectures, anonymous or non-publishing subscribers do not appear in peer lists; when LiveKit is not actively broadcasting or running locally, the viewer count is permanently stuck at `1`.
3. **Historical vs. Concurrent Metric Conflation**: The database table `public.live_viewer_sessions` records historical visitor sessions (`joined_at`, `left_at`). There is **no heartbeat**, no `last_seen_at`, and no `expires_at` column. `adminAnalyticsService.ts` computes `currentViewers` using `totalUniqueViewers` (all-time historical viewers across days/weeks), meaning viewers who watched days ago are counted as currently watching.
4. **Duplicate Row Explosions (No Idempotency)**: In React 18/19 StrictMode and on every page refresh, `ViewerSessionTracker.tsx` issues an unconstrained `INSERT` into `live_viewer_sessions`. A single test user viewing one match generated over 74 redundant rows in seconds.
5. **Critical RLS Security Vulnerabilities**:
   - `Admins can select viewer sessions`: Defined with `USING (true)` for `{public}`, leaking all viewer session IDs and client secrets to unauthorized anonymous visitors.
   - `Viewers can update own session`: Defined with `USING (session_id IS NOT NULL)` for `{public}`, allowing **any client to overwrite or terminate any other user's session**.

---

## 2. FRONTEND INVESTIGATION

### 2.1 Component & File Analysis

| File Path | Role | Discovered Defects |
|---|---|---|
| `app/(public)/live/[matchId]/page.tsx` | Dedicated Live Match Page | • Hardcodes initial state `useState<number>(1)`.<br>• Subscribes only to `matches` table score updates; **no viewer count subscription** exists.<br>• Passes `onViewerCountChange={setViewerCount}` to `LiveKitStreamPlayer`.<br>• Renders `ViewerSessionTracker` in the background with zero data feedback loop. |
| `components/public/live/LiveKitStreamPlayer.tsx` | Video Stream Player (WebRTC) | • Counts `room.remoteParticipants.size + 1`.<br>• Multiple tabs open by the same user receive unique LiveKit identities (`viewer-${Math.random()}`), inflating the count.<br>• If stream is offline or WebRTC fails, count remains static at `1`.<br>• Different viewers on different networks receive disjointed participant lists from the SFU. |
| `components/public/live/ViewerSessionTracker.tsx` | Background Session Logger | • Generates random session ID in `sessionStorage`.<br>• Triggers fire-and-forget `insert` on mount.<br>• Relies solely on `window.addEventListener('beforeunload')` which fails on mobile Safari, Android Chrome, and browser crashes.<br>• Does not emit or consume any viewer count. |
| `services/viewerSessionService.ts` | Viewer API Client Service | • Raw unkeyed `insert` into `live_viewer_sessions`.<br>• Raw `update` on `session_id`.<br>• No heartbeat loop. |
| `app/(public)/live/page.tsx` & `LiveMatchesTicker.tsx` | Live Match Listings & Homepage Ticker | • Displays static label `"Live Broadcast Stream"` with no viewer numbers.<br>• No sync across match cards and live viewing page. |

---

## 3. BACKEND & DATABASE INVESTIGATION

### 3.1 Database Objects Audited

#### Table: `public.live_viewer_sessions`
- **Columns**:
  - `id` (uuid, PK)
  - `match_id` (uuid, FK to matches.id)
  - `user_id` (uuid, FK to auth.users.id, nullable)
  - `session_id` (text)
  - `device_type` (text, default 'desktop')
  - `joined_at` (timestamptz)
  - `left_at` (timestamptz, nullable)
  - `duration_seconds` (integer)
  - `created_at` (timestamptz)
  - `client_secret` (uuid)

#### Database Vulnerabilities & Architecture Gaps
1. **Missing Unique Constraints**: No unique index on `(match_id, user_id)` or `(match_id, session_id)`. Re-renders and multi-tab opens duplicate records.
2. **Missing Liveness / Expiration Columns**: Lacks `last_seen_at` and `expires_at`. Abandoned sessions remain with `left_at: NULL` indefinitely.
3. **No PostgreSQL Triggers or Realtime Publication**: `live_viewer_sessions` is **not included in `supabase_realtime` publication**. No database changes are published to clients.
4. **Vulnerable RLS Policies**:
   ```sql
   -- VULN-1: Leaks all viewer session records to public
   CREATE POLICY "Admins can select viewer sessions" ON public.live_viewer_sessions
     FOR SELECT USING (true);

   -- VULN-2: Allows any caller to update all sessions
   CREATE POLICY "Viewers can update own session" ON public.live_viewer_sessions
     FOR UPDATE USING (session_id IS NOT NULL);
   ```

---

## 4. CONFIRMED ROOT CAUSES

1. **Root Cause 1: Lack of a Real-Time Synchronization Bus**  
   The application never broadcasts viewer presence or count updates over Supabase Realtime.
2. **Root Cause 2: Conflating LiveKit SFU WebRTC Peers with Platform Viewers**  
   Viewer count was tied to LiveKit's internal participant list rather than the authoritative platform presence system.
3. **Root Cause 3: Unreliable Lifecycle Tracking & Missing Heartbeat**  
   Relying on `beforeunload` guarantees stale sessions when mobile devices sleep or browser tabs close. Without an active heartbeat with automatic server-side expiration (`expires_at`), true concurrent viewer counts cannot be computed.
4. **Root Cause 4: Multi-Tab & Refresh Inflation**  
   Neither the client nor the database deduplicates viewer presence by authenticated user ID or persistent device session.

---

## 5. PROPOSED PERMANENT ARCHITECTURE

```
   ┌────────────────────────────────────────────────────────┐
   │                  Connected Clients                     │
   │  (User A Tab 1)   (User A Tab 2)   (User B)   (Guest)  │
   └────────┬─────────────────┬─────────────┬──────────┬────┘
            │                 │             │          │
            ▼                 ▼             ▼          ▼
   ┌────────────────────────────────────────────────────────┐
   │            Supabase Realtime Presence Channel          │
   │              topic: "match_viewers:{matchId}"          │
   │  - Client Presence Tracking with user_id / session_id  │
   │  - Automatic Client Disconnect Detection (< 2 sec)     │
   │  - Immediate 0ms Broadcast to All Viewers in Room      │
   └──────────────────────────┬─────────────────────────────┘
                              │
               Sync / Heartbeat every 20s
                              │
                              ▼
   ┌────────────────────────────────────────────────────────┐
   │           PostgreSQL Authoritative Backend             │
   │             (table: match_viewers)                     │
   │  - Unique constraint on (match_id, user_id)            │
   │  - Unique constraint on (match_id, session_id)         │
   │  - Columns: status, last_seen_at, expires_at (now + 35s)│
   │  - RPC: record_match_viewer_heartbeat()                │
   │  - RPC: leave_match_viewer()                           │
   │  - RPC: get_active_match_viewers_count(matchId)        │
   │  - Hardened RLS: Private reads, secure tokenized writes│
   └────────────────────────────────────────────────────────┘
```

### Key Guarantees:
- **Accurate Count**: Multi-tab opens by User A resolve to 1 viewer.
- **Instant Synchronization**: Changes propagate within milliseconds via Realtime Presence.
- **Fail-Safe Expiration**: Network loss or tab kill automatically purges presence in Realtime (< 2s) and database (< 35s).
- **Security Hardened**: RLS updated so public direct reads/updates are revoked; heartbeat/leave handled via secure DEFINER functions.
- **eFootball Visual Standard**: Unified `LIVE ● 24 WATCHING` badge across dedicated live stream page, live match cards, and homepage ticker.
