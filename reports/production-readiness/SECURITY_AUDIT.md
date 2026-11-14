# SECURITY AUDIT REPORT: Application, Database & Infrastructure Security
**Project:** eFootball Tournament Platform  
**Audit Target:** Production Environment (`efootball-tournament-cyan.vercel.app`)  
**Scope:** Authentication, Authorization (RBAC), Row-Level Security (RLS), Cryptography, API Security, Environment Variables  

---

## 1. Executive Summary

A comprehensive security review was conducted covering Supabase Auth, database RLS, server action authorization guards, cryptography, and network headers.
The core application demonstrates strong security fundamentals: server-authoritative role checks, AES-256-GCM encryption with authentication tags for financial data, and parameterized SQL queries preventing injection.
However, **1 Critical** and **4 High** severity security findings must be addressed to guarantee hardened production posture.

---

## 2. Findings Matrix

| Finding ID | Severity | Category | Description | Status |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | **CRITICAL** | Edge Security | Missing root `middleware.ts` — Security headers & edge rate limiting disabled | **CONFIRMED** |
| **SEC-02** | **CRITICAL** | Vulnerability | `next@16.3.0` RCE advisory (GHSA-673q-mjm6-r5xr) in `use cache` typed arrays | **CONFIRMED** |
| **SEC-03** | **HIGH** | Database RLS | 15 `SECURITY DEFINER` functions callable by `anon` role via REST RPC | **CONFIRMED** |
| **SEC-04** | **HIGH** | Database RLS | Security definer view `tournament_participants_public` bypasses caller RLS | **CONFIRMED** |
| **SEC-05** | **HIGH** | Database Auth | Leaked password protection disabled in Supabase Auth | **CONFIRMED** |
| **SEC-06** | **HIGH** | Rate Limiting | Rate limiting relies on volatile in-memory Map in serverless isolates | **CONFIRMED** |
| **SEC-07** | **MEDIUM** | Auth Logic | `TEST_AUTH_USER_EMAIL` test bypass branch present in `lib/auth/server.ts` | **CONFIRMED (Guarded)** |
| **SEC-08** | **MEDIUM** | Cryptography | Fallback to anon key in `admin.ts` when service key absent suppresses fatal alert | **CONFIRMED** |
| **SEC-09** | **LOW** | Policy Perf | 59 RLS policies re-evaluate `auth.uid()` per row (`auth_rls_initplan`) | **CONFIRMED** |
| **SEC-10** | **LOW** | Database Functions | 4 functions have mutable search path (`set_updated_at`, `_admin_role_rank`, etc.) | **CONFIRMED** |

---

## 3. Deep-Dive Findings & Evidence

### SEC-01: Missing Root `middleware.ts` — Edge Security Inactive
- **Location:** `D:\Project\middleware.ts` (Absent) vs `D:\Project\lib\supabase\proxy.ts`
- **Impact:** Next.js only executes middleware placed in the root directory (or `src/` if app is inside `src/`). Because `D:\Project\app` is in the root and there is no `D:\Project\middleware.ts`, Next.js **does not execute** `updateSession()` from `lib/supabase/proxy.ts`.
- **Consequences:**
  - `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy` headers are not applied globally to HTML document responses.
  - Edge rate limiting on `/login` and `/admin/*` via `checkRateLimit` is completely inactive.
  - Unauthenticated users reaching `/admin/*` are not intercepted at the edge; they hit the Server Component before being redirected.
- **Remediation:** Create a root `middleware.ts` that imports and re-exports `updateSession` from `@/lib/supabase/proxy`, with an explicit matcher configuration.

---

### SEC-02: Next.js Dependency Advisory (GHSA-673q-mjm6-r5xr)
- **Location:** `package.json` (`next`: `"16.3.0"`)
- **Impact:** npm audit identifies a critical security advisory in Next.js versions `>=16.0.0 <=16.4.0` related to unauthenticated Remote Code Execution in `use cache` functions returning typed arrays.
- **Analysis:** The platform currently does not use the experimental `use cache` directive with typed arrays. However, running a vulnerable core framework version in production fails compliance audits and poses latent risk.
- **Remediation:** Upgrade `next` to `>=16.4.6` or the latest stable patch.

---

### SEC-03: `anon` Execution of `SECURITY DEFINER` Functions
- **Location:** Supabase Database Schema (`pg_proc`, `pg_shdescription`)
- **Impact:** The Supabase Security Advisor flagged 15 functions with `anon_security_definer_function_executable`.
- **Affected Functions:**
  - `admin_approve_manual_registration`
  - `admin_reject_manual_registration`
  - `admin_set_under_verification`
  - `cancel_manual_registration`
  - `evaluate_overdue_matches`
  - `handle_new_user`
  - `is_admin`
  - `lock_tournament_financial_terms`
  - `record_player_checkin`
  - `request_match_walkover`
  - `start_player_match`
  - `submit_manual_payment`
  - `submit_match_screenshot_proof`
  - `submit_player_score`
  - `sync_missing_profiles`
- **Analysis:** In PostgreSQL, functions in `public` grant `EXECUTE` to `PUBLIC` by default unless explicitly revoked. Because these functions are `SECURITY DEFINER`, an anonymous client can invoke `/rest/v1/rpc/<function_name>` directly. Even though internal logic checks caller parameters or `auth.uid()`, administrative functions (`admin_approve_manual_registration`) should strictly revoke execute rights from `anon` and `public`:
  ```sql
  REVOKE EXECUTE ON FUNCTION public.admin_approve_manual_registration FROM anon, public;
  GRANT EXECUTE ON FUNCTION public.admin_approve_manual_registration TO authenticated, service_role;
  ```

---

### SEC-04: Security Definer View (`tournament_participants_public`)
- **Location:** View `public.tournament_participants_public`
- **Impact:** Defined with the `SECURITY DEFINER` property. Under PostgreSQL 15+, security definer views execute with the permissions of the view creator, bypassing the querying user's RLS policies.
- **Remediation:** Recreate the view using `WITH (security_invoker = true)` to ensure querying users cannot access records restricted by underlying participant RLS policies.

---

### SEC-05: Leaked Password Protection Disabled
- **Location:** Supabase Authentication Configuration
- **Impact:** Supabase Auth contains an automated check against HaveIBeenPwned.org to prevent users from selecting known compromised passwords. This feature is currently disabled in the project settings.
- **Remediation:** Enable "Leaked Password Protection" in the Supabase Dashboard under Authentication -> Password Security.

---

### SEC-06: Distributed Rate Limiting Missing in Serverless Edge
- **Location:** `lib/rateLimit.ts`
- **Impact:** The in-memory map `memoryStore` resides in the memory of individual serverless isolates. Under concurrent load, requests are load-balanced across multiple Vercel lambda instances, each maintaining a separate counter.
- **Remediation:** Configure `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in production environment variables to activate atomic global rate limiting via Upstash Redis.

---

### SEC-07: Test Auth Bypass Branch in Server Auth
- **Location:** `lib/auth/server.ts` (lines 118–127)
- **Code:**
  ```ts
  if (process.env.NODE_ENV !== 'production' && process.env.TEST_AUTH_USER_EMAIL !== undefined) {
    // Allows setting synthetic user id and admin role via environment variables
  }
  ```
- **Analysis:** The branch is protected by `process.env.NODE_ENV !== 'production'`. In standard Vercel deployments, `NODE_ENV` is automatically set to `'production'`, rendering this branch inert. However, defense-in-depth best practice dictates removing test authentication mocks from production compilation units or strictly isolating them in test harnesses.

---

## 4. Cryptographic Review

| Asset / Flow | Mechanism | Implementation Status | Verdict |
| :--- | :--- | :--- | :--- |
| **Bank Account Numbers** | AES-256-GCM | `lib/wallet/crypto.ts` with 96-bit random IV and authTag | **STRONG / SECURE** |
| **Account Number Display** | Last-4 Masking | `maskAccountNumber` outputs `XXXX XXXX 1234` | **SECURE** |
| **Tournament Access Codes** | SHA-256 Hash | Hashed before persistence; constant-time comparison | **SECURE** |
| **LiveKit Streaming Tokens** | JWT with short TTL | Generated server-side; strict RBAC validation | **SECURE** |
| **Cloudinary Proof Uploads** | Signed Upload Params | Server action signs params with `apiSecret` | **SECURE** |
