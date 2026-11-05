# Complete Architecture & Security Audit: Forgot Password & Password Recovery

**Target Application:** eFootball Tournament Platform  
**Stack:** Next.js 16 App Router, React 19, TypeScript 5, Supabase Auth (`@supabase/ssr`), PostgreSQL 17  
**Date of Audit:** 2026-11-05  
**Supabase Production Project:** `cqgbeafenavkeirwsxbg` (`https://cqgbeafenavkeirwsxbg.supabase.co`)  
**Production Site URL:** `https://efootball-tournament-cyan.vercel.app`

---

## 1. Executive Summary

A comprehensive, end-to-end audit of the authentication and password recovery subsystem was conducted across the Next.js App Router codebase, Supabase SSR clients, Next.js Edge proxy middleware, and the production Supabase project configuration.

The audit uncovered **three critical structural flaws** and **four usability/security defects** that completely broke the password reset flow in production:
1. **Critical: Cookie Loss on Next.js 16 Redirects**: In `app/auth/callback/route.ts`, when `supabase.auth.exchangeCodeForSession(code)` succeeds, session cookies are attached to the initial `NextResponse` object. However, the route handler subsequently instantiated a fresh `NextResponse.redirect()` object, which **dropped all session cookies**, causing the user to arrive at `/auth/reset-password` without an active session.
2. **Critical: Hash Fragment Rejection in Server Route Handler**: When Supabase Auth verifies email recovery links via `/auth/v1/verify`, it redirects the user's browser with tokens in the URL hash fragment (`/auth/callback?next=/auth/reset-password#access_token=...&refresh_token=...&type=recovery`). Because HTTP browsers never send hash fragments to server-side route handlers, the server handler received `code: null` and `token_hash: null`. The handler immediately responded with an HTTP 307 redirect to `/auth/login?error=invalid_callback`, killing the client before JavaScript could read the hash or establish the recovery session.
3. **Critical: Premature Failure Check in `/auth/reset-password`**: The reset page checked `supabase.auth.getUser()` once synchronously on initial mount without subscribing to `supabase.auth.onAuthStateChange`. As a result, hash-based recovery sessions and async cookie hydration were discarded, immediately displaying "Password reset link is invalid or has expired."
4. **Session Leakage & Auto-Redirect on Password Update**: After updating their password, users were redirected to `/auth/login?reset=success` without terminating the temporary recovery session. Because `proxy.ts` and `app/auth/login/page.tsx` intercept active sessions and redirect to `/dashboard`, users were prevented from logging in with their new credentials.
5. **Missing Password Strength Indicator**: `/auth/reset-password` only had a plain text label `Min. 12 characters` with no live visual indicator or strength evaluation.
6. **Email Enumeration & Rate Limit Exposure**: `/forgot-password` raw-rendered API error messages instead of displaying a unified, non-enumerating confirmation screen and friendly rate-limit countdown.
7. **Localhost Redirect URL Mismatch**: Supabase project configuration exact-matches `http://localhost:3000/auth/callback`, but rejects query-parameterized variations (`http://localhost:3000/auth/callback?type=recovery&next=/auth/reset-password`), falling back to the production Site URL.

---

## 2. Component-by-Component Inspection

### 2.1. Requesting Recovery: `/forgot-password` (`app/forgot-password/page.tsx`)
- **Current Behavior:**
  - Uses `react-hook-form` with `zodResolver(forgotPasswordSchema)`.
  - Derives `origin` from `window.location.origin` and constructs:
    ```typescript
    const redirectTo = `${origin}/auth/callback?type=recovery&next=/auth/reset-password`;
    ```
  - Calls `supabase.auth.resetPasswordForEmail(data.email.trim(), { redirectTo })`.
  - On error, executes `setErrorMessage(error.message)`.
- **Defects Identified:**
  - **Account Enumeration**: Exposing raw errors (e.g., if Supabase returns user-not-found or invalid credentials) reveals whether an email is registered.
  - **Rate Limit (429) Handling**: When a user submits requests too quickly (Supabase enforces 1 email/minute/user), the error is `AuthApiError: For security purposes, you can only request this after 59 seconds (status: 429, code: 'over_email_send_rate_limit')`. The UI displays a harsh error string instead of an informative countdown timer.
  - **No Duplicate Request Debouncing**: While `isSubmitting` blocks form clicks, there is no cooldown disable on the button if the user tries again immediately after seeing the rate-limit message.

### 2.2. Callback Processing: `/auth/callback` (`app/auth/callback/route.ts`)
- **Current Implementation:**
  ```typescript
  export async function GET(request: NextRequest) {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get('code');
    const tokenHash = requestUrl.searchParams.get('token_hash');
    const type = requestUrl.searchParams.get('type') as EmailOtpType | null;
    const next = requestUrl.searchParams.get('next');
    ...
    let response = NextResponse.redirect(new URL('/auth/login', request.url));
    ...
    const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    });

    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      ...
      if (type === 'recovery' || safeNext?.includes('reset-password')) {
        const resetUrl = new URL('/auth/reset-password', request.url);
        response = NextResponse.redirect(resetUrl); // <-- DROPS ALL COOKIES!
        return response;
      }
      ...
    }
  ```
- **Defects Identified:**
  - **Dropped Cookies**: Reassigning `response = NextResponse.redirect(resetUrl)` creates a new `NextResponse` instance without the cookies set in `setAll`. The user arrives at `/auth/reset-password` without session cookies.
  - **Fatal Hash Fragment Blindness**: When Supabase redirects with `#access_token=...&type=recovery`, the server receives no search parameters. The code reaches line 98 (`return NextResponse.redirect('/auth/login?error=invalid_callback')`), sending an immediate HTTP 307 redirect. The browser never renders client-side JS to parse the hash fragment.
  - **Error Query Parameter Ignored**: If Supabase redirects with `?error=access_denied&error_description=Email+link+is+invalid+or+has+expired`, the route handler ignores the parameters and redirects to `/auth/login?error=invalid_callback`.

### 2.3. Resetting Password: `/auth/reset-password` (`app/auth/reset-password/page.tsx`)
- **Current Implementation:**
  ```typescript
  useEffect(() => {
    async function verifyRecoverySession() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setErrorMessage('Password reset link is invalid or has expired. Please request a new recovery link.');
        }
      } catch (err) {
        setErrorMessage('Failed to verify password recovery session.');
      } finally {
        setIsCheckingSession(false);
      }
    }
    verifyRecoverySession();
  }, []);
  ```
- **Defects Identified:**
  - **Static / Single-Shot Check**: Only calls `getUser()` once on mount. Does not listen to `supabase.auth.onAuthStateChange((event, session) => ...)` for the `PASSWORD_RECOVERY` event or allow time for `@supabase/ssr` browser client to parse URL hash tokens.
  - **No Password Strength Meter**: Missing requirement 6 ("Password strength indicator").
  - **Post-Update Session Leak**:
    ```typescript
    const { error } = await supabase.auth.updateUser({ password: data.password });
    if (!error) {
      setSuccess(true);
      setTimeout(() => { router.push('/auth/login?reset=success'); }, 2500);
    }
    ```
    `supabase.auth.signOut()` was not called after the password update. The user arrived at `/auth/login` with an active session, triggering `proxy.ts` and `app/auth/login/page.tsx` to automatically redirect them to `/dashboard` before they could test logging in with their new password.

### 2.4. Next.js Edge Proxy (`proxy.ts` & `lib/supabase/proxy.ts`)
- **Current Behavior:**
  - Fast-path cookie check: verifies presence of `sb-*-auth-token`.
  - On `/auth/login`, if an active session is detected, automatically redirects to `/admin/dashboard` or `/dashboard`.
  - Does NOT block `/auth/reset-password` or `/auth/callback`, which is correct.
  - However, because `/auth/login` redirects active users, redirecting a user to `/auth/login?reset=success` without first signing them out causes an unintended loop into `/dashboard`.

---

## 3. Supabase Project Configuration Audit

| Setting | Expected | Live Config (`cqgbeafenavkeirwsxbg`) | Status / Risk |
| :--- | :--- | :--- | :--- |
| **Site URL** | Production domain | `https://efootball-tournament-cyan.vercel.app` | Verified correct |
| **Redirect Allowlist** | `https://efootball-tournament-cyan.vercel.app/**`<br>`http://localhost:3000/**` | `https://efootball-tournament-cyan.vercel.app/**` is present.<br>`http://localhost:3000/auth/callback` is present. | `http://localhost:3000` with query parameters fails exact match. |
| **Email Enumeration Protection** | Enabled | Enabled (queries return `{ data: {}, error: null }` for non-existent emails). | Verified functional |
| **Email Rate Limit** | 60 seconds | 60-second cooldown per user (`over_email_send_rate_limit`, status 429). | Active & verified |
| **Email Delivery** | Active | Confirmed via live test: `recovery_sent_at` updated in `auth.users`. | Verified operational |
| **Recovery Email Format** | Token / Hash / Code | Supabase issues verify link redirecting with hash tokens `#access_token=...&type=recovery` or code. | Requires dual-layer client/server support |

---

## 4. Root Cause Summary Matrix

| Failure Symptom | Direct Root Cause |
| :--- | :--- |
| User clicks recovery link, lands on `/auth/login?error=invalid_callback` | Supabase redirects with `#access_token=...` hash. Server route handler `/auth/callback/route.ts` receives no query params and immediately redirects to login before browser JS can execute. |
| User lands on `/auth/reset-password` and sees "Password reset link is invalid or has expired" | Even with PKCE code, `app/auth/callback/route.ts` creates a new `NextResponse.redirect()` object, discarding the session cookies set by `exchangeCodeForSession(code)`. |
| User updates password, but cannot log in on `/auth/login` | Recovery session was not signed out after `updateUser()`. `/auth/login` auto-redirects authenticated users to `/dashboard`. |
| User requests reset twice and gets raw JSON error | `app/forgot-password/page.tsx` displayed raw `error.message` without 60s cooldown handling or enumeration shielding. |
| Reset page lacks password guidance | Missing live password strength meter (length, uppercase, lowercase, number, symbol feedback). |

---

## 5. Architectural Solution & Fix Blueprint

To ensure 100% production reliability across both PKCE code exchanges and hash fragment redirects:

1. **Dual-Mode `/auth/callback`**:
   - If `code` or `token_hash` query params exist: The route handler performs the exchange using a cookie-preserving helper `createRedirectResponse(url)` that attaches all session cookies to the redirect response.
   - If `code` and `token_hash` are absent: Instead of immediately redirecting to login, render a lightweight, instant client-side HTML bridge that inspects `window.location.hash`. If `#access_token=...&type=recovery` is detected, the bridge calls `supabase.auth.setSession(...)` and forwards to `/auth/reset-password`. If no tokens are present, it redirects to `/auth/login?error=invalid_callback`.
2. **Resilient `/auth/reset-password` Session Hydration**:
   - Subscribe to `supabase.auth.onAuthStateChange` (`PASSWORD_RECOVERY` and `SIGNED_IN`).
   - If hash fragments exist on the URL, let `@supabase/ssr` process them.
   - Add a live Password Strength Meter with real-time requirements (12+ chars, uppercase, lowercase, number, symbol).
   - On successful `updateUser({ password })`, call `await supabase.auth.signOut()` before navigating to `/auth/login?reset=success`.
3. **Hardened `/forgot-password` Page**:
   - Shield against email enumeration: always show success message if email format is valid.
   - Detect 429 rate limit errors (`over_email_send_rate_limit`) and display a friendly countdown timer.
   - Prevent duplicate button clicks with debouncing.
