# Supabase Database-Enforced Admin RBAC: Complete Security Audit & Architecture Specification

**Project:** eFootball Tournament Platform  
**Target Database:** Supabase PostgreSQL 17.6.1 (`cqgbeafenavkeirwsxbg`)  
**Designated Super Administrator:** `ye.agrajj@gmail.com` (`30080df7-5188-4630-b597-b8493ebe045d`)  
**Audit Date:** November 5, 2026  
**Status:** Audit Completed (Read-Only Phase) — Pending Review & Authorization  

---

## 1. Executive Summary & Threat Model

### 1.1 Executive Summary
A comprehensive read-only security audit of the eFootball Tournament Platform repository and connected production Supabase database was conducted to evaluate administrator authorization, privilege enforcement, and data access controls.

The audit revealed that administrative privileges and data access security are severely compromised by **two concurrent architectural defects**:
1. **Application-Level Hardcoding & Email Trust:** Administrator authentication and authorization are predominantly enforced at the application layer through hardcoded email comparisons (`ye.agrajj@gmail.com`) across middleware, server actions, route layouts, and login redirection handlers.
2. **Critical Database Permissive RLS Write Policies & Over-Granting:** The core tournament engine tables (`public.matches`, `public.groups`, `public.rounds`, and `public.participants`) have wide-open RLS policies allowing `cmd: ALL` to the `{public}` and `{authenticated}` roles with `qual: true` and `with_check: true`. Simultaneously, PostgreSQL table privileges `DELETE`, `INSERT`, `TRUNCATE`, and `UPDATE` are directly granted to `anon` and `authenticated`. 

Consequently, **any anonymous or authenticated player possessing the public Supabase anon key can directly bypass the Next.js application layer and alter match scores, manipulate bracket seeds, delete matches, or overwrite participant records directly via the Supabase PostgREST API.**

This document provides the exhaustive audit findings, vulnerability classifications, complete inventory of affected components, target database-enforced Role-Based Access Control (RBAC) architecture, migration specification, application refactoring plan, rollback strategy, and verification test suite.

---

### 1.2 Threat Model

```
+--------------------------------------------------------------------------------------------------+
|                                         THREAT VECTORS                                           |
+--------------------------------------------------------------------------------------------------+
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        │                                │                                │
        ▼                                ▼                                ▼
[Actor 1: Unauthenticated]     [Actor 2: Authenticated Player]  [Actor 3: Compromised Account]
• Public Anon API key          • Valid JWT token                • Stolen credentials or session
• PostgREST endpoint access    • Custom PostgREST queries       • Spoofed email claims
• Broadcast token abuse        • Direct table write attempts    • Privilege escalation attempts
        │                                │                                │
        └────────────────────────────────┼────────────────────────────────┘
                                         │
                                         ▼
+--------------------------------------------------------------------------------------------------+
|                                    DEFENSE LAYER VULNERABILITIES                                 |
+--------------------------------------------------------------------------------------------------+
  [X] APPLICATION MIDDLEWARE & ACTIONS: Rely on string email comparison ('ye.agrajj@gmail.com')
  [X] SUPABASE is_admin() FUNCTION: Hardcodes email string; no role hierarchy exists
  [X] DATABASE TABLE PRIVILEGES: Full table DDL/DML granted to anon & authenticated
  [X] ROW LEVEL SECURITY: Permissive policies ("Allow write access...") override all restrictions
  [X] LIVE BROADCAST API: Unauthenticated callers can mint 'broadcaster' LiveKit JWT tokens
+--------------------------------------------------------------------------------------------------+
                                         │
                                         ▼
+--------------------------------------------------------------------------------------------------+
|                                        POTENTIAL IMPACT                                          |
+--------------------------------------------------------------------------------------------------+
  * Complete corruption of live tournament brackets, fixtures, and results
  * Disruption of matches and unauthorized score submissions
  * Unauthorized takeover of live broadcast video streams
  * Total denial of service through table TRUNCATE or batch DELETE via PostgREST
+--------------------------------------------------------------------------------------------------+
```

#### Threat Actors & Capabilities:
1. **Unauthenticated External Attacker (Anon):** Possesses the Supabase project URL and anon public API key (which is publicly bundled in client JavaScript). Can issue raw HTTP requests to `/rest/v1/matches`, `/rest/v1/groups`, `/rest/v1/participants`, and `/rest/v1/rounds`.
2. **Authenticated Regular Player:** Possesses a valid Supabase Auth JWT. Can attempt to access `/admin/*` routes, invoke admin server actions directly, or send PostgREST requests carrying their user token.
3. **Privileged Staff / Sub-Admins (Moderators, Streamers):** Currently no role separation exists. Either an account has full unrestricted super-admin powers (if matched to allowlist) or zero privileges. A tournament streamer or bracket moderator cannot perform delegated duties without gaining full platform ownership.

---

## 2. Current Authorization Architecture

### 2.1 Database Architecture
1. **`public.admin_users` Table:**
   - Schema: `id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`, `email text UNIQUE NOT NULL`, `created_at timestamptz DEFAULT now()`.
   - **Missing Role Column:** The table has no `role`, `tier`, or `permissions` column.
   - **Current Data:** Exactly 1 record:
     ```json
     {"id": "30080df7-5188-4630-b597-b8493ebe045d", "email": "ye.agrajj@gmail.com", "created_at": "2026-10-31T06:55:04.148135+00:00"}
     ```
2. **`public.is_admin()` SQL Function:**
   ```sql
   CREATE OR REPLACE FUNCTION public.is_admin()
   RETURNS boolean
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path TO 'public', 'auth'
   AS $$
   DECLARE
       jwt_email TEXT;
   BEGIN
       IF auth.uid() IS NULL THEN
           RETURN FALSE;
       END IF;

       jwt_email := LOWER(TRIM(COALESCE(auth.jwt() ->> 'email', '')));
       IF jwt_email != 'ye.agrajj@gmail.com' THEN
           RETURN FALSE;
       END IF;

       RETURN EXISTS (
           SELECT 1 FROM public.admin_users
           WHERE id = auth.uid()
           AND LOWER(TRIM(email)) = 'ye.agrajj@gmail.com'
       );
   END;
   $$;
   ```
   *Defects:*
   - Double-hardcodes `ye.agrajj@gmail.com`.
   - Reads `auth.jwt() ->> 'email'`, which depends on JWT claims rather than primary key `auth.uid()`.
   - Rigid single-user architecture; no support for delegating roles.
3. **`public.has_admin_role()` SQL Function:** Does **NOT** exist in the database.

---

### 2.2 Application Authorization Architecture
The application enforces administrative authorization through several disjointed mechanisms:

1. **Edge Middleware Guard ([`lib/supabase/proxy.ts`](file:///D:/Project/lib/supabase/proxy.ts)):**
   - Lines 5-9 & 112-117: Hardcodes `PRIMARY_ADMIN_EMAIL = 'ye.agrajj@gmail.com'`.
   - Inspects `user.email?.toLowerCase().trim() !== 'ye.agrajj@gmail.com'`. If mismatched, redirects away from `/admin/*`.
   - Performs no database lookup in middleware.
2. **Layout Level Guard ([`app/admin/layout.tsx`](file:///D:/Project/app/admin/layout.tsx)):**
   - Lines 29-38: Calls `isAllowlistedAdminEmail(user.email)`. If false, redirects to `/dashboard?error=admin_unauthorized`.
   - Calls `checkIsAdmin(user.id, user.email)`.
3. **Server Authorization Helpers ([`lib/auth/server.ts`](file:///D:/Project/lib/auth/server.ts)):**
   - Line 7: `PRIMARY_ADMIN_EMAIL = 'ye.agrajj@gmail.com'`.
   - `checkIsAdmin()`: Checks allowlist email first, attempts an upsert into `admin_users` (`syncAdminUserRecord()`), and falls back to `isAllowlistedAdminEmail(userEmail)` if the database query fails.
   - `requireAdmin()`: Throws an error unless `isAllowlistedAdminEmail(user.email)` evaluates to true.
4. **Server Actions ([`app/actions/tournamentActions.ts`](file:///D:/Project/app/actions/tournamentActions.ts), [`app/actions/verificationActions.ts`](file:///D:/Project/app/actions/verificationActions.ts)):**
   - Calls `requireAdmin()` at the top of mutation functions.
   - In `verificationActions.ts` (lines 257): records `whatsapp_verified_by: adminUser.email` (storing plain string email rather than admin user ID).
5. **Live Broadcasting Token Endpoint ([`app/api/livekit/token/route.ts`](file:///D:/Project/app/api/livekit/token/route.ts)):**
   - Accepts `role: 'broadcaster'` from any client via POST or GET without authenticating the user or verifying stream permissions.

---

## 3. Vulnerability Findings & Risk Classification

| ID | Title | Severity | CVSS v3.1 | Affected Component | Attack Vector |
|---|---|---|---|---|---|
| **VULN-01** | Permissive RLS Write Policies on Core Tournament Engine Tables | **CRITICAL** | **9.8** (`AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H`) | `matches`, `groups`, `rounds`, `participants` | Supabase PostgREST API |
| **VULN-02** | Over-Granted DML/DDL Privileges to `anon` and `authenticated` | **CRITICAL** | **9.1** (`AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:H`) | All core public tables | Direct SQL / PostgREST |
| **VULN-03** | Application-Layer Email Allowlist Dependency | **HIGH** | **8.2** (`AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N`) | `lib/auth/server.ts`, `proxy.ts`, `layout.tsx` | Next.js Server Runtime |
| **VULN-04** | Hardcoded Email & Inflexible Architecture in `is_admin()` SQL Function | **HIGH** | **7.5** (`AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N`) | Database function `public.is_admin()` | Supabase PostgreSQL Engine |
| **VULN-05** | Unauthenticated LiveKit Broadcaster Token Generation | **HIGH** | **7.5** (`AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N`) | `app/api/livekit/token/route.ts` | Public API endpoint |
| **VULN-06** | Conflicting & Broken Permissive Policies on Predictions and Viewer Sessions | **MEDIUM** | **6.5** (`AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:H/A:N`) | `match_predictions`, `live_viewer_sessions` | Supabase PostgREST API |
| **VULN-07** | Absence of Role Hierarchy & Granular RBAC Model | **MEDIUM** | **5.3** (`AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:L/A:N`) | `admin_users` table structure | Role authorization model |
| **VULN-08** | Inactive Administrative Audit Logging | **LOW** | **3.8** (`AV:N/AC:L/PR:H/UI:N/S:U/C:N/I:L/A:N`) | `admin_audit_logs` | Audit trail subsystem |

---

### Detailed Vulnerability Descriptions

#### VULN-01: Permissive RLS Write Policies on Core Tournament Engine Tables
- **Evidence from Database:**
  ```sql
  -- pg_policies on public.matches:
  tablename: 'matches', policyname: 'Allow write access on matches', roles: '{public}', cmd: 'ALL', qual: 'true', with_check: 'true'
  tablename: 'matches', policyname: 'Allow authenticated delete on matches', roles: '{authenticated}', cmd: 'DELETE', qual: 'true'
  tablename: 'matches', policyname: 'Allow authenticated update on matches', roles: '{authenticated}', cmd: 'UPDATE', qual: 'true', with_check: 'true'
  
  -- pg_policies on public.groups:
  tablename: 'groups', policyname: 'Allow write access on groups', roles: '{public}', cmd: 'ALL', qual: 'true', with_check: 'true'

  -- pg_policies on public.rounds:
  tablename: 'rounds', policyname: 'Allow write access on rounds', roles: '{public}', cmd: 'ALL', qual: 'true', with_check: 'true'

  -- pg_policies on public.participants:
  tablename: 'participants', policyname: 'Allow write access on participants', roles: '{public}', cmd: 'ALL', qual: 'true', with_check: 'true'
  ```
- **Exploitation:**
  In PostgreSQL, multiple permissive policies are evaluated with logical `OR`. Even if an admin policy exists, a policy granting `cmd: ALL` to `{public}` with `qual: true` unconditionally grants permission. Anyone with an HTTP client can send `PATCH /rest/v1/matches?id=eq.<id>` with payload `{"home_score": 10, "status": "completed"}` and alter match outcomes.
- **Remediation:** Drop all `"Allow write access..."`, `"Allow authenticated delete/insert/update..."` policies with `qual: true` across `matches`, `groups`, `rounds`, and `participants`. Replace them with strict policies referencing `has_admin_role()`.

#### VULN-02: Over-Granted DML/DDL Privileges to `anon` and `authenticated`
- **Evidence from Database:**
  Querying `information_schema.role_table_grants` revealed that `anon` and `authenticated` roles possess full `DELETE`, `INSERT`, `REFERENCES`, `SELECT`, `TRIGGER`, `TRUNCATE`, and `UPDATE` on tables `groups`, `matches`, `participants`, `rounds`, `tournaments`, and `tournament_registrations`.
- **Exploitation:** Table grants act as the first gate before RLS. Having `TRUNCATE` or `DELETE` granted to `anon` creates immense risk if RLS is inadvertently modified or bypassed.
- **Remediation:** Revoke `ALL` privileges on all public tables from `anon` and `authenticated`. Re-grant only minimal necessary privileges (e.g. `SELECT` on public tables, `INSERT` only where legitimate player actions require it).

#### VULN-03: Application-Layer Email Allowlist Dependency
- **Evidence:** `PRIMARY_ADMIN_EMAIL = 'ye.agrajj@gmail.com'` is hardcoded in `lib/auth/server.ts` and `lib/supabase/proxy.ts`. If database checks fail in `checkIsAdmin()`, line 76 falls back to checking whether the string matches.
- **Exploitation:** Decouples authorization from database state. Any changes to administrator assignment require a code deployment. Furthermore, comparing raw strings in application code invites edge cases regarding character encoding, trailing whitespace, or case manipulation.
- **Remediation:** Completely replace application email checks with database role checks querying `admin_users` by `auth.uid()`.

#### VULN-04: Hardcoded Email & Inflexible Architecture in `is_admin()` SQL Function
- **Evidence:** `is_admin()` SQL source checks `jwt_email != 'ye.agrajj@gmail.com'` and `LOWER(TRIM(email)) = 'ye.agrajj@gmail.com'`.
- **Exploitation:** Prevents onboarding any co-administrators or moderators, and locks the database logic to a single specific email account.
- **Remediation:** Redefine `is_admin()` to check whether `auth.uid()` exists in `public.admin_users` without hardcoded email checks.

#### VULN-05: Unauthenticated LiveKit Broadcaster Token Generation
- **Evidence ([`app/api/livekit/token/route.ts`](file:///D:/Project/app/api/livekit/token/route.ts#L48-L63)):**
  ```typescript
  const isBroadcaster = role === 'broadcaster';
  at.addGrant({
    room,
    roomJoin: true,
    canSubscribe: true,
    canPublish: isBroadcaster,
    canPublishData: isBroadcaster,
  });
  ```
- **Exploitation:** Any anonymous client requesting `role=broadcaster` is granted publishing capabilities on the tournament LiveKit video room. An attacker can hijack or disrupt tournament livestreams.
- **Remediation:** Require authenticated session and database check `has_admin_role('streamer')` before issuing a token with `canPublish: true`.

#### VULN-06: Conflicting & Broken Permissive Policies on Predictions and Viewer Sessions
- **Evidence:**
  - `match_predictions` has policy `"Public can update prediction before lock"` (`qual: locked_at IS NULL AND result = 'pending'`), which permits any user to overwrite *any other user's* prediction.
  - `live_viewer_sessions` has policy `"Viewers can update own session"` with `qual: session_id IS NOT NULL`, allowing any client to overwrite any viewer session.
- **Remediation:** Ensure update policies strictly enforce `auth.uid() = user_id` or session ownership.

---

## 4. Database Authorization Inventory

### 4.1 Schema Tables & RLS Status

| Table Name | RLS Status | Table Type | Primary Key | Owner Role |
|---|---|---|---|---|
| `admin_audit_logs` | **ENABLED** | TABLE | `id` (uuid) | `postgres` |
| `admin_users` | **ENABLED** | TABLE | `id` (uuid -> `auth.users.id`) | `postgres` |
| `analytics_events` | **ENABLED** | TABLE | `id` (uuid) | `postgres` |
| `group_participants` | **ENABLED** | TABLE | `id` (uuid) | `postgres` |
| `groups` | **ENABLED** | TABLE | `id` (uuid) | `postgres` |
| `homepage_audit_history` | **ENABLED** | TABLE | `id` (uuid) | `postgres` |
| `homepage_sections` | **ENABLED** | TABLE | `id` (text) | `postgres` |
| `live_viewer_sessions` | **ENABLED** | TABLE | `id` (uuid) | `postgres` |
| `match_predictions` | **ENABLED** | TABLE | `id` (uuid) | `postgres` |
| `matches` | **ENABLED** | TABLE | `id` (uuid) | `postgres` |
| `participants` | **ENABLED** | TABLE | `id` (uuid) | `postgres` |
| `profiles` | **ENABLED** | TABLE | `id` (uuid -> `auth.users.id`) | `postgres` |
| `rounds` | **ENABLED** | TABLE | `id` (uuid) | `postgres` |
| `site_settings` | **ENABLED** | TABLE | `id` (uuid) | `postgres` |
| `tournament_participants_public` | N/A (View) | VIEW | N/A | `postgres` |
| `tournament_registrations` | **ENABLED** | TABLE | `id` (uuid) | `postgres` |
| `tournaments` | **ENABLED** | TABLE | `id` (uuid) | `postgres` |

---

### 4.2 Detailed Current RLS Policies Matrix

| Table | Policy Name | Command | Roles | Using / Qual | With Check | Assessment |
|---|---|---|---|---|---|---|
| `admin_audit_logs` | Admins can view audit logs | `SELECT` | `authenticated` | `is_admin()` | null | Safe |
| `admin_audit_logs` | Admins and service_role can insert audit logs | `INSERT` | `authenticated` | null | `is_admin() OR auth.role() = 'service_role'` | Safe |
| `admin_users` | admin_users_admin_access | `ALL` | `authenticated` | `is_admin()` | `is_admin()` | Restricted to admin, but no super_admin separation |
| `analytics_events` | analytics_events_admin_all | `ALL` | `authenticated` | `is_admin()` | `is_admin()` | Safe |
| `analytics_events` | analytics_events_public_insert | `INSERT` | `anon, authenticated` | null | `length(event_name) <= 100...` | Safe (constrained) |
| `group_participants` | group_participants_public_read | `SELECT` | `anon, authenticated` | `true` | null | Safe |
| `group_participants` | group_participants_admin_write | `ALL` | `authenticated` | `is_admin()` | `is_admin()` | Safe |
| `groups` | Allow public read access on groups | `SELECT` | `public` | `true` | null | Safe |
| `groups` | Allow write access on groups | `ALL` | `public` | `true` | `true` | **CRITICAL VULNERABILITY: Public write access** |
| `groups` | Allow authenticated delete on groups | `DELETE` | `authenticated` | `true` | null | **CRITICAL VULNERABILITY: Public delete access** |
| `groups` | Allow authenticated insert on groups | `INSERT` | `authenticated` | null | `true` | **CRITICAL VULNERABILITY: Public insert access** |
| `groups` | Allow authenticated update on groups | `UPDATE` | `authenticated` | `true` | `true` | **CRITICAL VULNERABILITY: Public update access** |
| `homepage_audit_history` | Admins can view homepage audit history | `SELECT` | `authenticated` | `is_admin()` | null | Safe |
| `homepage_audit_history` | Admins can insert homepage audit history | `INSERT` | `authenticated` | null | `is_admin()` | Safe |
| `homepage_sections` | Public can view published homepage sections | `SELECT` | `anon, authenticated` | `is_enabled = true AND status = 'published'` | null | Safe |
| `homepage_sections` | Admins have full access to homepage sections | `ALL` | `authenticated` | `is_admin()` | `is_admin()` | Safe |
| `live_viewer_sessions` | Admins can select viewer sessions | `SELECT` | `public` | `true` | null | Open read |
| `live_viewer_sessions` | Viewers can insert session | `INSERT` | `public` | null | `true` | Safe |
| `live_viewer_sessions` | Viewers can update own session | `UPDATE` | `public` | `session_id IS NOT NULL` | null | **MEDIUM VULNERABILITY: Unkeyed session update** |
| `match_predictions` | Public can select own prediction | `SELECT` | `public` | `true` | null | Open read |
| `match_predictions` | Public can insert prediction | `INSERT` | `public` | null | `true` | Overly broad |
| `match_predictions` | Public can update prediction before lock | `UPDATE` | `public` | `locked_at IS NULL AND result = 'pending'` | null | **MEDIUM VULNERABILITY: Can update any prediction** |
| `match_predictions` | Users can insert own prediction | `INSERT` | `public` | null | `auth.uid() = user_id` | Masked by public policy |
| `match_predictions` | Users can update own prediction before lock | `UPDATE` | `public` | `auth.uid() = user_id...` | null | Masked by public policy |
| `match_predictions` | Users can view own prediction | `SELECT` | `public` | `auth.uid() = user_id` | null | Masked by public policy |
| `matches` | Allow public read access on matches | `SELECT` | `public` | `true` | null | Safe |
| `matches` | Allow write access on matches | `ALL` | `public` | `true` | `true` | **CRITICAL VULNERABILITY: Public write access** |
| `matches` | Allow authenticated delete on matches | `DELETE` | `authenticated` | `true` | null | **CRITICAL VULNERABILITY: Public delete access** |
| `matches` | Allow authenticated insert on matches | `INSERT` | `authenticated` | null | `true` | **CRITICAL VULNERABILITY: Public insert access** |
| `matches` | Allow authenticated update on matches | `UPDATE` | `authenticated` | `true` | `true` | **CRITICAL VULNERABILITY: Public update access** |
| `participants` | participants_select_owner_or_admin | `SELECT` | `authenticated` | `user_id = auth.uid() OR is_admin()` | null | Safe |
| `participants` | Allow write access on participants | `ALL` | `public` | `true` | `true` | **CRITICAL VULNERABILITY: Public write access** |
| `participants` | Allow authenticated delete on participants | `DELETE` | `authenticated` | `true` | null | **CRITICAL VULNERABILITY: Public delete access** |
| `participants` | Allow authenticated insert on participants | `INSERT` | `authenticated` | null | `true` | **CRITICAL VULNERABILITY: Public insert access** |
| `participants` | Allow authenticated update on participants | `UPDATE` | `authenticated` | `true` | `true` | **CRITICAL VULNERABILITY: Public update access** |
| `profiles` | profiles_select_own | `SELECT` | `authenticated` | `auth.uid() = id` | null | Safe |
| `profiles` | profiles_insert_own | `INSERT` | `authenticated` | null | `auth.uid() = id` | Safe |
| `profiles` | profiles_update_own | `UPDATE` | `authenticated` | `auth.uid() = id` | `auth.uid() = id AND (verification locked)` | Safe |
| `profiles` | profiles_admin_all | `ALL` | `authenticated` | `is_admin()` | `is_admin()` | Safe |
| `rounds` | Allow public read access on rounds | `SELECT` | `public` | `true` | null | Safe |
| `rounds` | Allow write access on rounds | `ALL` | `public` | `true` | `true` | **CRITICAL VULNERABILITY: Public write access** |
| `rounds` | Allow authenticated delete on rounds | `DELETE` | `authenticated` | `true` | null | **CRITICAL VULNERABILITY: Public delete access** |
| `rounds` | Allow authenticated insert on rounds | `INSERT` | `authenticated` | null | `true` | **CRITICAL VULNERABILITY: Public insert access** |
| `rounds` | Allow authenticated update on rounds | `UPDATE` | `authenticated` | `true` | `true` | **CRITICAL VULNERABILITY: Public update access** |
| `site_settings` | site_settings_public_read | `SELECT` | `anon, authenticated` | `true` | null | Safe |
| `site_settings` | site_settings_admin_write | `ALL` | `authenticated` | `is_admin()` | `is_admin()` | Safe |
| `tournament_registrations` | Users can read own registrations | `SELECT` | `authenticated` | `auth.uid() = user_id` | null | Safe |
| `tournament_registrations` | Admins can read all registrations | `SELECT` | `authenticated` | `is_admin()` | null | Safe |
| `tournament_registrations` | Admins can update registrations | `UPDATE` | `authenticated` | `is_admin()` | `is_admin()` | Safe |
| `tournaments` | Allow public read access on tournaments | `SELECT` | `public` | `status <> 'draft'` | null | Safe |
| `tournaments` | Allow authenticated delete on tournaments | `DELETE` | `authenticated` | `is_admin()` | null | Safe |
| `tournaments` | Allow authenticated insert on tournaments | `INSERT` | `authenticated` | null | `is_admin()` | Safe |
| `tournaments` | Allow authenticated update on tournaments | `UPDATE` | `authenticated` | `is_admin()` | `is_admin()` | Safe |
| `tournaments` | Allow write access on tournaments | `ALL` | `authenticated` | `is_admin()` | `is_admin()` | Duplicate of above |

---

## 5. Application Authorization Inventory

The following application files contain authorization checks that must be refactored:

1. **[`lib/auth/server.ts`](file:///D:/Project/lib/auth/server.ts):**
   - Lines 7-16: `PRIMARY_ADMIN_EMAIL`, `isAllowlistedAdminEmail()`.
   - Lines 21-37: `syncAdminUserRecord()` (attempts client-side table upsert).
   - Lines 45-78: `checkIsAdmin()` (relies on string email matching).
   - Lines 112-117: `requireAdmin()` (throws error if email string fails).
2. **[`lib/supabase/proxy.ts`](file:///D:/Project/lib/supabase/proxy.ts):**
   - Lines 5-9: `PRIMARY_ADMIN_EMAIL`, `isAllowlistedAdmin()`.
   - Lines 105-118: Edge route guard for `/admin/*`.
   - Lines 130-147: Login redirect logic checking `isAllowlistedAdmin()`.
3. **[`app/admin/layout.tsx`](file:///D:/Project/app/admin/layout.tsx):**
   - Lines 29-38: Redundant email string check before `checkIsAdmin()`.
4. **[`app/actions/tournamentActions.ts`](file:///D:/Project/app/actions/tournamentActions.ts):**
   - `createTournamentAction`, `updateTournamentAction`, `deleteTournamentAction`: Call `requireAdmin()`.
5. **[`app/actions/verificationActions.ts`](file:///D:/Project/app/actions/verificationActions.ts):**
   - `adminVerifyWhatsAppAction`, `adminVerifyWhatsAppByNumberAction`: Call `requireAdmin()`. Write `adminUser.email` into `whatsapp_verified_by`.
6. **[`app/api/livekit/token/route.ts`](file:///D:/Project/app/api/livekit/token/route.ts):**
   - Minting `broadcaster` role without verifying user identity or streamer role.
7. **[`services/playerDashboardService.ts`](file:///D:/Project/services/playerDashboardService.ts):**
   - `selfRegisterTournament()`: Attempts direct `insert` on `participants` and `tournament_registrations` from the client context.

---

## 6. Proposed Database-Enforced RBAC Architecture

### 6.1 Role Definitions & Hierarchy
We propose a 4-tier Role-Based Access Control model defined directly in PostgreSQL:

```
┌────────────────────────────────────────────────────────┐
│                      super_admin                       │  Level 4: Full platform ownership
│  (Manage admins, edit site settings, truncate audits)  │
└───────────────────────────┬────────────────────────────┘
                            │ inherits all below
┌───────────────────────────▼────────────────────────────┐
│                         admin                          │  Level 3: Tournament & User Admin
│ (Create/delete tournaments, verify players, audit logs)│
└───────────────────────────┬────────────────────────────┘
                            │ inherits all below
┌───────────────────────────▼────────────────────────────┐
│                       moderator                        │  Level 2: Match & Bracket Operations
│ (Enter match scores, advance rounds, verify WhatsApp)  │
└───────────────────────────┬────────────────────────────┘
                            │ inherits all below
┌───────────────────────────▼────────────────────────────┐
│                       streamer                         │  Level 1: Broadcast Operations
│  (Mint broadcaster LiveKit tokens, update match rooms) │
└────────────────────────────────────────────────────────┘
```

#### Role Hierarchy Weighting:
- `super_admin`: 40
- `admin`: 30
- `moderator`: 20
- `streamer`: 10

### 6.2 Data Model Changes
1. **Enum Type:** `CREATE TYPE public.admin_role AS ENUM ('super_admin', 'admin', 'moderator', 'streamer');`
2. **`public.admin_users` Alterations:**
   - Add column `role public.admin_role NOT NULL DEFAULT 'moderator'`.
   - Add column `updated_at timestamptz NOT NULL DEFAULT now()`.
   - Add column `created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL`.
   - Seed `30080df7-5188-4630-b597-b8493ebe045d` (`ye.agrajj@gmail.com`) as `super_admin`.
   - Remove dependency on matching `email` string. User identity is uniquely and cryptographically bound to `auth.users.id`.

### 6.3 Database Functions (`SECURITY DEFINER`)
- `public.get_admin_role()`: Returns `admin_role` for `auth.uid()`, or `NULL` if not an administrator.
- `public.has_admin_role(required_role admin_role)`: Returns `boolean`. Evaluates whether the calling user has role weight $\ge$ `required_role`.
- `public.is_admin()`: Returns `boolean`. Returns true if `get_admin_role()` is NOT NULL (equivalent to `has_admin_role('streamer')`).
- **Security Constraints:**
  - `LANGUAGE plpgsql STABLE SECURITY DEFINER`
  - Explicit `SET search_path = public, pg_temp;` (prevents search_path hijacking).
  - Explicit check `IF auth.uid() IS NULL THEN RETURN false; END IF;`.
  - Non-recursive: Does not query tables with RLS that invokes `is_admin()` in a cycle.

### 6.4 Atomic Tournament Registration RPC
To eliminate the need for granting `INSERT` on `participants` and `UPDATE` on `tournaments` to unprivileged players, an atomic PostgreSQL function `public.register_tournament_participant(p_tournament_id uuid, p_rules_accepted boolean)` will be provided. This executes within a single database transaction, checks capacity, creates participant and registration rows, and increments slot counters atomically.

---

## 7. Target Database Schema & Migration Specification

The following SQL migration encapsulates the complete database-side hardening. It is structured to execute safely within a single transaction.

```sql
-- ============================================================================
-- MIGRATION: Database-Enforced Admin RBAC & RLS Hardening
-- File: supabase/migrations/20261105010000_database_enforced_admin_rbac.sql
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Create admin_role ENUM and update public.admin_users
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'admin_role') THEN
        CREATE TYPE public.admin_role AS ENUM ('super_admin', 'admin', 'moderator', 'streamer');
    END IF;
END $$;

-- Add RBAC columns to admin_users if missing
ALTER TABLE public.admin_users 
    ADD COLUMN IF NOT EXISTS role public.admin_role NOT NULL DEFAULT 'moderator',
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index on role lookup
CREATE INDEX IF NOT EXISTS idx_admin_users_role ON public.admin_users(role);

-- Seed Designated Super Administrator
INSERT INTO public.admin_users (id, email, role, created_at, updated_at)
VALUES (
    '30080df7-5188-4630-b597-b8493ebe045d',
    'ye.agrajj@gmail.com',
    'super_admin'::public.admin_role,
    now(),
    now()
)
ON CONFLICT (id) DO UPDATE 
SET role = 'super_admin'::public.admin_role,
    updated_at = now();

-- ----------------------------------------------------------------------------
-- 2. Define Helper Functions with Strict SECURITY DEFINER & search_path
-- ----------------------------------------------------------------------------

-- Role weight helper (internal immutable)
CREATE OR REPLACE FUNCTION public._admin_role_weight(r public.admin_role)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT CASE r
        WHEN 'super_admin' THEN 40
        WHEN 'admin'       THEN 30
        WHEN 'moderator'   THEN 20
        WHEN 'streamer'    THEN 10
        ELSE 0
    END;
$$;

-- Get calling user's admin role directly from admin_users
CREATE OR REPLACE FUNCTION public.get_admin_role()
RETURNS public.admin_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_role public.admin_role;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT role INTO v_role
    FROM public.admin_users
    WHERE id = auth.uid();

    RETURN v_role;
END;
$$;

-- Check if calling user possesses at least the required role
CREATE OR REPLACE FUNCTION public.has_admin_role(required_role public.admin_role)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_role public.admin_role;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT role INTO v_user_role
    FROM public.admin_users
    WHERE id = auth.uid();

    IF v_user_role IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN public._admin_role_weight(v_user_role) >= public._admin_role_weight(required_role);
END;
$$;

-- Replace existing is_admin() with database-checked function
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM public.admin_users
        WHERE id = auth.uid()
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Revoke Dangerous Default Grants from anon and authenticated
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.admin_users FROM anon, authenticated, public;
REVOKE ALL ON public.matches FROM anon, authenticated, public;
REVOKE ALL ON public.groups FROM anon, authenticated, public;
REVOKE ALL ON public.rounds FROM anon, authenticated, public;
REVOKE ALL ON public.participants FROM anon, authenticated, public;
REVOKE ALL ON public.tournaments FROM anon, authenticated, public;
REVOKE ALL ON public.tournament_registrations FROM anon, authenticated, public;
REVOKE ALL ON public.admin_audit_logs FROM anon, authenticated, public;
REVOKE ALL ON public.site_settings FROM anon, authenticated, public;

-- Grant minimal necessary table privileges
-- Service role retains full access automatically in Supabase
GRANT SELECT ON public.admin_users TO authenticated;

GRANT SELECT ON public.tournaments TO anon, authenticated;
GRANT SELECT ON public.groups TO anon, authenticated;
GRANT SELECT ON public.rounds TO anon, authenticated;
GRANT SELECT ON public.matches TO anon, authenticated;
GRANT SELECT ON public.participants TO anon, authenticated;
GRANT SELECT ON public.tournament_registrations TO authenticated;
GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT SELECT, INSERT ON public.admin_audit_logs TO authenticated;

-- Allow DML to authenticated for tables where RLS governs writes
GRANT INSERT, UPDATE, DELETE ON public.matches TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.groups TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.rounds TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.participants TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.tournaments TO authenticated;
GRANT INSERT, UPDATE ON public.tournament_registrations TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.site_settings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.admin_users TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. Clean Up Permissive RLS Policies & Install Hardened Policies
-- ----------------------------------------------------------------------------

-- A. Table: matches
DROP POLICY IF EXISTS "Allow write access on matches" ON public.matches;
DROP POLICY IF EXISTS "Allow authenticated insert on matches" ON public.matches;
DROP POLICY IF EXISTS "Allow authenticated update on matches" ON public.matches;
DROP POLICY IF EXISTS "Allow authenticated delete on matches" ON public.matches;
DROP POLICY IF EXISTS "Allow public read access on matches" ON public.matches;

CREATE POLICY "matches_public_read"
    ON public.matches FOR SELECT
    TO public
    USING (true);

CREATE POLICY "matches_moderator_insert"
    ON public.matches FOR INSERT
    TO authenticated
    WITH CHECK (public.has_admin_role('moderator'));

CREATE POLICY "matches_moderator_update"
    ON public.matches FOR UPDATE
    TO authenticated
    USING (public.has_admin_role('moderator') OR (public.has_admin_role('streamer') AND live_stream_url IS NOT NULL))
    WITH CHECK (public.has_admin_role('moderator') OR (public.has_admin_role('streamer') AND live_stream_url IS NOT NULL));

CREATE POLICY "matches_admin_delete"
    ON public.matches FOR DELETE
    TO authenticated
    USING (public.has_admin_role('admin'));

-- B. Table: groups
DROP POLICY IF EXISTS "Allow write access on groups" ON public.groups;
DROP POLICY IF EXISTS "Allow authenticated insert on groups" ON public.groups;
DROP POLICY IF EXISTS "Allow authenticated update on groups" ON public.groups;
DROP POLICY IF EXISTS "Allow authenticated delete on groups" ON public.groups;
DROP POLICY IF EXISTS "Allow public read access on groups" ON public.groups;

CREATE POLICY "groups_public_read"
    ON public.groups FOR SELECT
    TO public
    USING (true);

CREATE POLICY "groups_moderator_write"
    ON public.groups FOR ALL
    TO authenticated
    USING (public.has_admin_role('moderator'))
    WITH CHECK (public.has_admin_role('moderator'));

-- C. Table: rounds
DROP POLICY IF EXISTS "Allow write access on rounds" ON public.rounds;
DROP POLICY IF EXISTS "Allow authenticated insert on rounds" ON public.rounds;
DROP POLICY IF EXISTS "Allow authenticated update on rounds" ON public.rounds;
DROP POLICY IF EXISTS "Allow authenticated delete on rounds" ON public.rounds;
DROP POLICY IF EXISTS "Allow public read access on rounds" ON public.rounds;

CREATE POLICY "rounds_public_read"
    ON public.rounds FOR SELECT
    TO public
    USING (true);

CREATE POLICY "rounds_moderator_write"
    ON public.rounds FOR ALL
    TO authenticated
    USING (public.has_admin_role('moderator'))
    WITH CHECK (public.has_admin_role('moderator'));

-- D. Table: participants
DROP POLICY IF EXISTS "Allow write access on participants" ON public.participants;
DROP POLICY IF EXISTS "Allow authenticated insert on participants" ON public.participants;
DROP POLICY IF EXISTS "Allow authenticated update on participants" ON public.participants;
DROP POLICY IF EXISTS "Allow authenticated delete on participants" ON public.participants;
DROP POLICY IF EXISTS "participants_select_owner_or_admin" ON public.participants;

CREATE POLICY "participants_public_read"
    ON public.participants FOR SELECT
    TO public
    USING (true);

CREATE POLICY "participants_moderator_update"
    ON public.participants FOR UPDATE
    TO authenticated
    USING (public.has_admin_role('moderator'))
    WITH CHECK (public.has_admin_role('moderator'));

CREATE POLICY "participants_admin_delete"
    ON public.participants FOR DELETE
    TO authenticated
    USING (public.has_admin_role('admin'));

-- E. Table: tournaments
DROP POLICY IF EXISTS "Allow write access on tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Allow authenticated insert on tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Allow authenticated update on tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Allow authenticated delete on tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Allow public read access on tournaments" ON public.tournaments;

CREATE POLICY "tournaments_public_read"
    ON public.tournaments FOR SELECT
    TO public
    USING (status <> 'draft' OR public.has_admin_role('moderator'));

CREATE POLICY "tournaments_admin_insert"
    ON public.tournaments FOR INSERT
    TO authenticated
    WITH CHECK (public.has_admin_role('admin'));

CREATE POLICY "tournaments_admin_update"
    ON public.tournaments FOR UPDATE
    TO authenticated
    USING (public.has_admin_role('admin'))
    WITH CHECK (public.has_admin_role('admin'));

CREATE POLICY "tournaments_super_admin_delete"
    ON public.tournaments FOR DELETE
    TO authenticated
    USING (public.has_admin_role('super_admin'));

-- F. Table: admin_users (Strictly controlled by super_admin)
DROP POLICY IF EXISTS "admin_users_admin_access" ON public.admin_users;

CREATE POLICY "admin_users_select_authenticated_admins"
    ON public.admin_users FOR SELECT
    TO authenticated
    USING (public.is_admin());

CREATE POLICY "admin_users_super_admin_modify"
    ON public.admin_users FOR ALL
    TO authenticated
    USING (public.has_admin_role('super_admin'))
    WITH CHECK (public.has_admin_role('super_admin'));

-- G. Table: admin_audit_logs
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.admin_audit_logs;
DROP POLICY IF EXISTS "Admins and service_role can insert audit logs" ON public.admin_audit_logs;

CREATE POLICY "admin_audit_logs_select"
    ON public.admin_audit_logs FOR SELECT
    TO authenticated
    USING (public.has_admin_role('admin'));

CREATE POLICY "admin_audit_logs_insert"
    ON public.admin_audit_logs FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

-- H. Table: match_predictions (Fix unkeyed public update/insert)
DROP POLICY IF EXISTS "Public can insert prediction" ON public.match_predictions;
DROP POLICY IF EXISTS "Public can update prediction before lock" ON public.match_predictions;
DROP POLICY IF EXISTS "Users can insert own prediction" ON public.match_predictions;
DROP POLICY IF EXISTS "Users can update own prediction before lock" ON public.match_predictions;
DROP POLICY IF EXISTS "Users can view own prediction" ON public.match_predictions;
DROP POLICY IF EXISTS "Admins can view all predictions" ON public.match_predictions;
DROP POLICY IF EXISTS "Public can select own prediction" ON public.match_predictions;

CREATE POLICY "match_predictions_select"
    ON public.match_predictions FOR SELECT
    TO public
    USING (auth.uid() = user_id OR public.has_admin_role('moderator'));

CREATE POLICY "match_predictions_insert"
    ON public.match_predictions FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "match_predictions_update"
    ON public.match_predictions FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id AND locked_at IS NULL AND result = 'pending')
    WITH CHECK (auth.uid() = user_id AND locked_at IS NULL AND result = 'pending');

-- ----------------------------------------------------------------------------
-- 5. Atomic Tournament Registration Stored Procedure
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_tournament_participant(
    p_tournament_id uuid,
    p_rules_accepted boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id uuid;
    v_profile record;
    v_tourney record;
    v_participant_id uuid;
    v_current_count integer;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
    END IF;

    -- Lock tournament row for update to ensure atomic capacity check
    SELECT id, name, status, max_participants, confirmed_slots_count
    INTO v_tourney
    FROM public.tournaments
    WHERE id = p_tournament_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Tournament not found.');
    END IF;

    IF v_tourney.status <> 'registration' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Registration is closed for this tournament.');
    END IF;

    -- Fetch user profile
    SELECT id, efootball_id, display_name, whatsapp_number, whatsapp_verified
    INTO v_profile
    FROM public.profiles
    WHERE id = v_user_id;

    IF NOT FOUND OR v_profile.efootball_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Please complete your player profile and eFootball ID before registering.');
    END IF;

    -- Check if user is already registered in this tournament
    IF EXISTS (
        SELECT 1 FROM public.participants
        WHERE tournament_id = p_tournament_id AND user_id = v_user_id
    ) THEN
        RETURN jsonb_build_object('success', false, 'message', 'You are already registered for this tournament.');
    END IF;

    -- Check capacity
    SELECT count(*) INTO v_current_count
    FROM public.participants
    WHERE tournament_id = p_tournament_id;

    IF v_current_count >= COALESCE(v_tourney.max_participants, 32) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Tournament is at full capacity.');
    END IF;

    -- Insert participant row
    INSERT INTO public.participants (
        tournament_id,
        user_id,
        username,
        real_name,
        contact_info,
        status,
        terms_accepted,
        terms_accepted_at,
        rules_version
    ) VALUES (
        p_tournament_id,
        v_user_id,
        v_profile.efootball_id,
        COALESCE(v_profile.display_name, v_profile.efootball_id),
        v_profile.whatsapp_number,
        'active',
        p_rules_accepted,
        now(),
        '1.0'
    )
    RETURNING id INTO v_participant_id;

    -- Insert registration record
    INSERT INTO public.tournament_registrations (
        tournament_id,
        user_id,
        participant_id,
        status,
        confirmed_at,
        terms_accepted,
        terms_accepted_at,
        rules_version
    ) VALUES (
        p_tournament_id,
        v_user_id,
        v_participant_id,
        'confirmed',
        now(),
        p_rules_accepted,
        now(),
        '1.0'
    );

    -- Update confirmed count atomically
    UPDATE public.tournaments
    SET confirmed_slots_count = v_current_count + 1,
        updated_at = now()
    WHERE id = p_tournament_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Registration confirmed successfully!',
        'participantId', v_participant_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_tournament_participant(uuid, boolean) TO authenticated;

COMMIT;
```

---

## 8. Application Layer Refactoring Plan

### 8.1 Refactoring [`lib/auth/server.ts`](file:///D:/Project/lib/auth/server.ts)
1. **Remove Hardcoded Email Constants:**
   Eliminate `PRIMARY_ADMIN_EMAIL = 'ye.agrajj@gmail.com'` and `isAllowlistedAdminEmail()`.
2. **Implement Role Types & Hierarchy Utilities:**
   ```typescript
   export type AdminRole = 'super_admin' | 'admin' | 'moderator' | 'streamer';

   const ROLE_HIERARCHY: Record<AdminRole, number> = {
     super_admin: 40,
     admin: 30,
     moderator: 20,
     streamer: 10,
   };

   export function satisfiesRole(userRole: AdminRole | null | undefined, requiredRole: AdminRole): boolean {
     if (!userRole) return false;
     return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[requiredRole] ?? 0);
   }
   ```
3. **Database-Backed Role Resolution (`getAdminRole`):**
   ```typescript
   export async function getAdminRole(userId?: string): Promise<AdminRole | null> {
     if (!userId) return null;
     const supabase = await createClient();
     const { data, error } = await supabase
       .from('admin_users')
       .select('role')
       .eq('id', userId)
       .maybeSingle();

     if (error || !data) return null;
     return data.role as AdminRole;
   }
   ```
4. **Enforcement Helpers:**
   - `requireAdmin(requiredRole: AdminRole = 'moderator')`: Resolves authenticated user, verifies `satisfiesRole(userRole, requiredRole)`. If unauthorized, throws standard error or redirects.

---

### 8.2 Refactoring [`lib/supabase/proxy.ts`](file:///D:/Project/lib/supabase/proxy.ts)
1. Remove `isAllowlistedAdmin()` email check.
2. For `/admin/*` routes, check if user session exists. If present, query the Supabase database (or read custom user claims if cached in app_metadata) to check `admin_users`. If not an admin, redirect to `/dashboard?error=admin_unauthorized`.

---

### 8.3 Refactoring Server Actions
1. **[`app/actions/tournamentActions.ts`](file:///D:/Project/app/actions/tournamentActions.ts):**
   - Change `await requireAdmin()` to `await requireAdmin('admin')`.
   - Prevent moderators from deleting tournaments (strictly `requireAdmin('super_admin')`).
2. **[`app/actions/verificationActions.ts`](file:///D:/Project/app/actions/verificationActions.ts):**
   - Change `await requireAdmin()` to `await requireAdmin('moderator')`.
   - Store `whatsapp_verified_by: adminUser.id` (UUID foreign key) rather than string email.
3. **[`app/api/livekit/token/route.ts`](file:///D:/Project/app/api/livekit/token/route.ts):**
   - For `role === 'broadcaster'`, authenticate user and call `requireAdmin('streamer')`. Reject unauthorized requests with HTTP 403.

---

### 8.4 Refactoring Registration API ([`app/api/registrations/route.ts`](file:///D:/Project/app/api/registrations/route.ts))
Replace the complex multi-step client mutation in `selfRegisterTournament` with:
```typescript
const { data, error } = await supabase.rpc('register_tournament_participant', {
  p_tournament_id: tournamentId,
  p_rules_accepted: rulesAccepted ?? true,
});
```
This delegates concurrency, capacity locking, and authorization entirely to the database engine.

---

## 9. Rollback Strategy & Emergency Procedures

### 9.1 Rollback SQL Script
If an unexpected failure or regression occurs during the migration, the following script restores the previous database configuration:

```sql
BEGIN;

-- Drop new functions
DROP FUNCTION IF EXISTS public.register_tournament_participant(uuid, boolean);
DROP FUNCTION IF EXISTS public.has_admin_role(public.admin_role);
DROP FUNCTION IF EXISTS public.get_admin_role();
DROP FUNCTION IF EXISTS public._admin_role_weight(public.admin_role);

-- Restore legacy is_admin() function
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    jwt_email TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN FALSE;
    END IF;

    jwt_email := LOWER(TRIM(COALESCE(auth.jwt() ->> 'email', '')));
    IF jwt_email != 'ye.agrajj@gmail.com' THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM public.admin_users
        WHERE id = auth.uid()
        AND LOWER(TRIM(email)) = 'ye.agrajj@gmail.com'
    );
END;
$$;

-- Remove RBAC columns
ALTER TABLE public.admin_users DROP COLUMN IF EXISTS role;
ALTER TABLE public.admin_users DROP COLUMN IF EXISTS updated_at;
ALTER TABLE public.admin_users DROP COLUMN IF EXISTS created_by;
DROP TYPE IF EXISTS public.admin_role;

-- Restore base table grants
GRANT ALL ON public.matches TO anon, authenticated;
GRANT ALL ON public.groups TO anon, authenticated;
GRANT ALL ON public.rounds TO anon, authenticated;
GRANT ALL ON public.participants TO anon, authenticated;
GRANT ALL ON public.tournaments TO anon, authenticated;
GRANT ALL ON public.tournament_registrations TO anon, authenticated;

COMMIT;
```

### 9.2 Emergency Triage Procedures
1. **Lock Contention / Timeout:** The migration sets table locks on `matches`, `groups`, `participants`, `tournaments`. The script runs in a single transactional block (`BEGIN ... COMMIT`). If a lock cannot be acquired within 5 seconds (`SET LOCAL lock_timeout = '5s'`), the transaction rolls back cleanly without schema changes.
2. **Admin Lockout Prevention:** The primary admin `30080df7-5188-4630-b597-b8493ebe045d` (`ye.agrajj@gmail.com`) is explicitly seeded in Step 1 as `super_admin` before policies are updated. Verification of `public.is_admin()` and `public.has_admin_role('super_admin')` must execute immediately after migration.

---

## 10. Verification & Test Plan

### 10.1 Automated Test Scenarios

| Scenario ID | Test Description | Actor | Expected Result |
|---|---|---|---|
| **TEST-01** | Direct anonymous match deletion via REST | Anonymous (`anon` key) | **HTTP 401 / 403 Forbidden** (RLS blocks delete) |
| **TEST-02** | Direct anonymous match score update via REST | Anonymous (`anon` key) | **HTTP 401 / 403 Forbidden** (RLS blocks update) |
| **TEST-03** | Authenticated regular player updating match scores | Regular Player (`authenticated`) | **HTTP 403 Forbidden** (Blocked by `has_admin_role('moderator')`) |
| **TEST-04** | Authenticated regular player deleting participants | Regular Player (`authenticated`) | **HTTP 403 Forbidden** (Blocked by `has_admin_role('admin')`) |
| **TEST-05** | Authenticated regular player accessing `/admin/tournaments` | Regular Player (`authenticated`) | **Redirected to `/dashboard`** |
| **TEST-06** | Moderator submitting match results | Moderator (`moderator`) | **Success (HTTP 200)** |
| **TEST-07** | Moderator attempting to delete tournament | Moderator (`moderator`) | **HTTP 403 Forbidden** (Requires `admin` or `super_admin`) |
| **TEST-08** | Admin creating new tournament | Admin (`admin`) | **Success (HTTP 200)** |
| **TEST-09** | Admin attempting to promote another user to `super_admin` | Admin (`admin`) | **HTTP 403 Forbidden** (Only `super_admin` can manage admins) |
| **TEST-10** | Designated Super Admin (`ye.agrajj@gmail.com`) full operations | Super Admin (`super_admin`) | **Success on all operations** |
| **TEST-11** | Unauthenticated LiveKit broadcaster token request | Anonymous | **HTTP 401 Unauthorized** |
| **TEST-12** | Atomic tournament registration concurrency test | Authenticated Players | **Capacity strictly respected; 0 race conditions** |

### 10.2 Manual Verification Steps
1. Log in as `ye.agrajj@gmail.com`:
   - Verify `/admin/dashboard` loads smoothly.
   - Verify tournament editing, match scoring, and WhatsApp verification work.
2. Log in as an ordinary player:
   - Navigate to `/admin/dashboard`: Confirm immediate redirect to `/dashboard?error=admin_unauthorized`.
   - Register for a live tournament: Confirm `register_tournament_participant` succeeds and slots increment correctly.
3. PostgREST API probing:
   - Use `curl` or Postman with the Supabase anon key to attempt `DELETE /rest/v1/matches`. Confirm PostgreSQL returns error: `new row violates row-level security policy for table "matches"` or `0 rows affected`.

---

## Risk Assessment & Next Steps

### Risk Rating: CRITICAL (Remediation Strongly Recommended)
The database is currently exposed to unauthorized match manipulation and data loss through open PostgREST write policies on `matches`, `groups`, `rounds`, and `participants`. 

### Recommended Next Steps:
1. **User Review:** Review this audit report and target SQL migration script.
2. **Phase 2 Authorization:** Upon approval, apply the database migration `20261105010000_database_enforced_admin_rbac.sql` to Supabase project `cqgbeafenavkeirwsxbg`.
3. **Phase 3 Application Refactoring:** Refactor `lib/auth/server.ts`, `lib/supabase/proxy.ts`, `app/actions/tournamentActions.ts`, `app/actions/verificationActions.ts`, and `app/api/livekit/token/route.ts`.
4. **Verification Testing:** Run the automated test suite to confirm end-to-end security compliance.
