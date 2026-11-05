# RBAC Permission & Authorization Matrix (Final Hardened)

**Project:** eFootball Tournament Platform  
**Target Schema:** Supabase PostgreSQL 17.6.1 (`cqgbeafenavkeirwsxbg`)  
**Designated Super Administrator:** `ye.agrajj@gmail.com` (`30080df7-5188-4630-b597-b8493ebe045d`)  
**Version:** 3.0 (Post-Third-Pass Review)  

---

## 1. Role Definitions & Structural Boundaries

```
┌────────────────────────────────────────────────────────┐
│                      super_admin                       │  Level 4: Platform Owner
│ (Assign staff roles, delete tournaments, edit configs) │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│                         admin                          │  Level 3: Tournament Manager
│ (Create/edit tournaments, verify payments, audit logs) │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│                       moderator                        │  Level 2: Match Operations
│  (Enter match scores, advance rounds, verify WhatsApp) │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│                       streamer                         │  Level 1: Live Broadcasts
│   (Assign live stream room, mint broadcaster tokens)   │
└────────────────────────────────────────────────────────┘
```

### Core Security Mandates:
1. **Procedural Isolation for Streamers:** Streamers have **ZERO** direct UPDATE privileges on `public.matches`. They can ONLY call `public.update_match_live_room()`, which updates solely `live_room_name`.
2. **Unguessable Secret Protection for Viewer Sessions:** Anonymous users cannot query `live_viewer_sessions`. Session heartbeats require matching `client_secret` via `public.record_viewer_pulse()`.
3. **No Direct Staff Capacity Bypass:** A database trigger (`trg_enforce_participant_capacity`) blocks any direct `INSERT` on `public.participants` once capacity is reached.
4. **Paid Slot Reservations:** Paid registrations generate temporary 30-minute reservations that count against tournament capacity to prevent overbooking before admin approval.
5. **No Self-Promotion:** Only `super_admin` can manage `public.admin_users`.

---

## 2. Exhaustive Database Privilege Matrix

| Table / Object | Anon | Authenticated (Player) | Streamer | Moderator | Admin | Super Admin | Service Role |
|---|---|---|---|---|---|---|---|
| **`admin_users`** | None | Own row (SELECT) | Own row (SELECT) | Own row (SELECT) | Read All (SELECT) | **Full (ALL)** | Full (ALL) |
| **`admin_audit_logs`** | None | None | Insert own | Insert own | Read + Insert | **Full (Read/Insert)** | Full (ALL) |
| **`tournaments`** | Read (non-draft) | Read (non-draft) | Read (all) | Read (all) | Read, Insert, Update | **Full (incl. DELETE)** | Full (ALL) |
| **`participants`** | None (Use view) | Own record (SELECT) | View only | Read, Insert, Update | Read, Insert, Update, Delete | **Full (ALL)** | Full (ALL) |
| **`tournament_participants_public`** (View) | **SELECT** | **SELECT** | **SELECT** | **SELECT** | **SELECT** | **SELECT** | Full (ALL) |
| **`tournament_registrations`** | None | Own records (SELECT) | Own records | Own records | Read, Update (approve payments) | **Full (incl. DELETE)** | Full (ALL) |
| **`matches`** | **SELECT** | **SELECT** | SELECT only (No direct UPDATE) | Read, Insert, Update Scores | Read, Insert, Update, Delete | **Full (ALL)** | Full (ALL) |
| **`groups`** | **SELECT** | **SELECT** | SELECT | Read, Insert, Update, Delete | Read, Insert, Update, Delete | **Full (ALL)** | Full (ALL) |
| **`rounds`** | **SELECT** | **SELECT** | SELECT | Read, Insert, Update, Delete | Read, Insert, Update, Delete | **Full (ALL)** | Full (ALL) |
| **`knockout_bracket_drafts`** | None | None | None | Read, Insert, Update | Read, Insert, Update | **Full (ALL)** | Full (ALL) |
| **`knockout_bracket_logs`** | None | None | None | Read, Insert | Read, Insert | **Full (ALL)** | Full (ALL) |
| **`profiles`** | None | Own profile (SELECT, UPDATE) | Own profile | Read All, Verify WhatsApp | Read All, Update, Suspend | **Full (ALL)** | Full (ALL) |
| **`match_predictions`** | **SELECT** | Own (INSERT, UPDATE before lock) | Same as player | Same as player | Read All, Void | **Full (ALL)** | Full (ALL) |
| **`live_viewer_sessions`** | None (RPC only) | Own (SELECT) | Own (SELECT) | Read All | Read All | **Full (ALL)** | Full (ALL) |
| **`site_settings`** | **SELECT** | **SELECT** | **SELECT** | **SELECT** | **SELECT** | **Full (Update)** | Full (ALL) |
| **`homepage_sections`** | Read (published) | Read (published) | Read (published) | Read (published) | Read, Insert, Update | **Full (ALL)** | Full (ALL) |
| **`homepage_audit_history`** | None | None | None | Read | Read, Insert | **Full (ALL)** | Full (ALL) |
| **`analytics_events`** | **INSERT** | **INSERT** | **INSERT** | Read All | Read All | **Full (ALL)** | Full (ALL) |

---

## 3. Dedicated Database Functions & Execution Grants

| Stored Procedure / Function | Description | Security Definer? | Search Path | anon | authenticated | service_role |
|---|---|---|---|---|---|---|
| `public._admin_role_rank(admin_role)` | Internal role rank calculator | No (Immutable) | pg_catalog | Denied | Denied (Internal) | Allowed |
| `public.get_admin_role()` | Fetch calling user's admin role | Yes | pg_catalog, public, pg_temp | Denied | **Allowed** | Allowed |
| `public.has_admin_role(admin_role)` | Evaluate calling user's role rank | Yes | pg_catalog, public, pg_temp | Denied | **Allowed** | Allowed |
| `public.is_admin()` | Boolean check if user has any staff role | Yes | pg_catalog, public, pg_temp | Denied | **Allowed** | Allowed |
| `public.update_match_live_room(uuid, text)` | Restricted room update for streamers | Yes | pg_catalog, public, pg_temp | Denied | **Allowed (Staff)** | Allowed |
| `public.record_viewer_pulse(...)` | Authenticated pulse / heartbeat with secret | Yes | pg_catalog, public, pg_temp | **Allowed** | **Allowed** | Allowed |
| `public.register_tournament_participant(...)` | Atomic registration with capacity & access code | Yes | pg_catalog, public, pg_temp | Denied | **Allowed (Player)** | Allowed |

---

## 4. Application Routes & Server Actions Permission Mapping

| Action / Route | Target Handler | Required Role | Failure Behavior |
|---|---|---|---|
| Match Live Room Assignment | `public.update_match_live_room` RPC | `streamer` | Returns `{ success: false, code: 'FORBIDDEN' }` |
| Match Score Update | `services/matchService.ts` | `moderator` | Blocked by RLS (0 rows affected) |
| WhatsApp Verification | `adminVerifyWhatsAppAction` | `moderator` | Returns `{ success: false, message: 'Unauthorized' }` |
| Create Tournament | `createTournamentAction` | `admin` | Throws HTTP 403 / Error |
| Edit Tournament Settings | `updateTournamentAction` | `admin` | Throws HTTP 403 / Error |
| Confirm Paid Registration | `adminConfirmPaidRegistrationAction`| `admin` | Returns `{ success: false, message: 'Unauthorized' }` |
| Delete Tournament | `deleteTournamentAction` | `super_admin` | Throws HTTP 403 / Error |
| Staff Role Management | Direct `admin_users` mutations | `super_admin` | Blocked by RLS (0 rows affected) |
| Broadcaster LiveKit Token | `/api/livekit/token` (`role=broadcaster`) | `streamer` | HTTP 403 Forbidden |
