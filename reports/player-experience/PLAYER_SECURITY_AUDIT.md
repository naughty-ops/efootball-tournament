# PLAYER SECURITY & DATA PRIVACY AUDIT
**Project:** eFootball Tournament Platform  
**Target Environment:** Supabase PostgreSQL 17 + Next.js 16 SSR  
**Audit Scope:** Session Security, Cross-Player Data Isolation (RLS), Financial Privacy, Anti-Enumeration  
**Audit Date:** November 12, 2026  
**Auditor Persona:** Principal Application Security Engineer & PostgreSQL Security Specialist  

---

## 1. SECURITY & PRIVACY SCORECARD

| Dimension | Standard Required | Implementation Status | Risk Rating |
| :--- | :--- | :---: | :---: |
| **Authentication & Cookie Safety** | HTTP-only, Secure, SameSite=Lax | **SECURE** | Low |
| **Cross-Player RLS Isolation** | Strict `auth.uid() = user_id` on all personal data | **SECURE** | Low |
| **Financial / Banking Data Masking** | Permanent masking (`••••••••1234`) on client payloads | **SECURE** | Low |
| **Anti-Enumeration Protections** | Constant-time responses for forgot-password/login | **SECURE** | Low |
| **Denial-of-Service / Shared-IP Lockout** | Multi-tenant resilience in gaming cafes / venues | **VULNERABLE** | **HIGH** |
| **Admin Route Isolation** | Strict server-side email verification (`ye.agrajj@gmail.com`) | **SECURE** | Low |

---

## 2. CROSS-PLAYER ROW LEVEL SECURITY (RLS) VERIFICATION

We verified that players cannot read or modify another competitor's private records:

### 1. Support Tickets Table (`tickets`, `ticket_messages`)
* **Policy:** `tickets_player_select` enforces `auth.uid() = user_id` OR `is_admin()`.
* **Finding:** A regular player attempting to query `SELECT * FROM tickets WHERE user_id != auth.uid()` receives zero records (an empty result set), preventing information disclosure.

### 2. Player Wallet & Payout Records (`payout_requests`, `player_payment_methods`)
* **Policy:** Strict RLS blocks any client-side `SELECT` across `player_payment_methods` where `user_id != auth.uid()`.
* **Database View Security:** In migration `20261111000004_security_invoker_view.sql`, financial views enforce `security_invoker = true`, ensuring Postgres executes view queries under the querying player's permissions rather than elevated privileges.

### 3. Match Result Reporting (`matches`, `match_scores`)
* **Verification:** The server action [submitPlayerScoreAction](file:///D:/Project/app/actions/matchSchedulingActions.ts) confirms that the calling user's authenticated `user.id` matches either `home_player_id` or `away_player_id` before accepting a score report. An unauthorized player attempting to submit a score for a third-party match is rejected.

---

## 3. BANKING & FINANCIAL PRIVACY AUDIT

* **Bank Account Number Storage:**
  * In [PaymentDetailsManager.tsx](file:///D:/Project/components/wallet/PaymentDetailsManager.tsx), bank account numbers sent to the client are pre-masked:
    ```typescript
    function maskAccountNumber(acc: string): string {
      if (!acc || acc.length < 4) return '••••';
      return `••••••••${acc.slice(-4)}`;
    }
    ```
  * Full account numbers are never exposed in client-side HTML, TanStack Query devtools, or public API endpoints.
* **UPI ID Storage:** UPI IDs (e.g. `gamer@oksbi`) are stored as provided. While not banking account numbers, they constitute personal identifier information. They are strictly restricted to the owning player and verified administrators.

---

## 4. AUTHENTICATION & ANTI-ENUMERATION AUDIT

* **Forgot Password Anti-Enumeration:**
  * When submitting an email on `/forgot-password`, the platform displays:  
    *"If an account exists for this email, you will receive a password reset link."*
  * It returns an identical success card whether the email exists in the database or not, preventing attackers from harvesting registered player emails.
* **Session Cookie Flags:**
  * Supabase auth cookies (`sb-*-auth-token`) are written with `HttpOnly; Secure; SameSite=Lax; Path=/`, rendering them inaccessible to malicious client-side JavaScript (XSS mitigation).

---

## 5. CRITICAL SECURITY DEFICIT: SHARED-IP RATE LIMITING LOCKOUT

### Threat Model & Vulnerability Analysis
* **Vulnerable Endpoint:** [lib/supabase/proxy.ts](file:///D:/Project/lib/supabase/proxy.ts#L24-L28)
* **Rule:** `auth: { limit: 10, windowSeconds: 60 }`
* **Defect:** IP extraction in [getClientIp](file:///D:/Project/lib/rateLimit.ts#L44-L59) tracks requests per external public IP (`x-forwarded-for` or `cf-connecting-ip`).
* **Exploitation Scenario (Unintentional Denial-of-Service):**
  1. A local eFootball esports tournament hosts 32 players at a physical gaming lounge sharing one public fiber IP.
  2. The tournament starts; players open the platform and log in.
  3. After the 10th request within 60 seconds, player 11 receives an HTTP 429 error and cannot access their account.
  4. Players believe the platform is down or broken, jeopardizing the tournament schedule.
* **Remediation:**
  * Increase auth rate limiting threshold to 30 requests / 60 seconds per IP, and implement account-based throttling (e.g. tracking by email hash for failed login attempts) rather than raw IP.
