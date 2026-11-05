import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { EmailOtpType, SupabaseClient, User } from '@supabase/supabase-js';
import { sendAdminRegistrationNotification } from '@/services/whatsappNotificationService';
import type { Database } from '@/types/database';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type') as EmailOtpType | null;
  const next = requestUrl.searchParams.get('next');

  // Supabase error parameters (e.g. expired link, access denied)
  const incomingError = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');

  // Guard against open redirect attacks: only allow approved local relative paths
  const safeNext =
    next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\')
      ? next
      : null;

  // Handle incoming Supabase error redirects directly
  if (incomingError) {
    console.warn(`[AuthCallback] Received auth error from Supabase: ${incomingError} (${errorDescription})`);
    const isExpired =
      incomingError === 'access_denied' ||
      (errorDescription && errorDescription.toLowerCase().includes('expired'));
    const targetError = isExpired ? 'expired_link' : 'verification_failed';
    return NextResponse.redirect(new URL(`/auth/login?error=${targetError}`, request.url), 303);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    '';

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[AuthCallback] Missing Supabase configuration.');
    return NextResponse.redirect(new URL('/auth/login?error=config_missing', request.url), 303);
  }

  // Collect cookies to ensure none are dropped across redirects
  const cookieMap = new Map<string, { name: string; value: string; options: any }>();

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach((c) => cookieMap.set(c.name, c));
      },
    },
  });

  // Helper: Creates a redirect response that reliably attaches all session cookies
  function createRedirectResponse(destinationUrl: URL | string) {
    const res = NextResponse.redirect(destinationUrl, 303);
    cookieMap.forEach(({ name, value, options }) => {
      res.cookies.set(name, value, options);
    });
    return res;
  }

  // Flow A: PKCE authorization code exchange
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user) {
      console.error('[AuthCallback] PKCE code exchange failed:', error?.message);
      return NextResponse.redirect(new URL('/auth/login?error=verification_failed', request.url), 303);
    }

    const user = data.user;

    // Password recovery flow -> redirect to reset password page with active session cookies
    if (type === 'recovery' || safeNext?.includes('reset-password')) {
      return createRedirectResponse(new URL('/auth/reset-password', request.url));
    }

    // Post-verification notification workflow for new signup/email confirmation
    await handlePostVerification(user, supabase);

    const redirectUrl = new URL(safeNext || '/auth/login?verified=true', request.url);
    return createRedirectResponse(redirectUrl);
  }

  // Flow B: Token hash verification (email OTP / token_hash)
  if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (error || !data.user) {
      console.error('[AuthCallback] Token hash verification failed:', error?.message);
      return NextResponse.redirect(new URL('/auth/login?error=verification_failed', request.url), 303);
    }

    const user = data.user;

    if (type === 'recovery') {
      return createRedirectResponse(new URL('/auth/reset-password', request.url));
    }

    await handlePostVerification(user, supabase);

    const redirectUrl = new URL(safeNext || '/auth/login?verified=true', request.url);
    return createRedirectResponse(redirectUrl);
  }

  // Flow C: Neither code nor token_hash in query params.
  // When Supabase uses implicit/hash grant, tokens reside in the URL hash fragment
  // (e.g. /auth/callback#access_token=...&type=recovery), which the browser never sends
  // in HTTP headers. We serve a client-side bridge that extracts the hash and forwards it
  // directly to /auth/reset-password so the client session is preserved.
  const htmlBridge = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Verifying Session - eFootball Tournament</title>
  <style>
    body {
      background-color: #08088F;
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      padding: 16px;
      box-sizing: border-box;
    }
    .card {
      text-align: center;
      background: #1818D4;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 28px;
      padding: 32px 24px;
      max-width: 380px;
      width: 100%;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
    }
    .spinner {
      width: 36px;
      height: 36px;
      border: 3px solid rgba(255, 255, 255, 0.2);
      border-top-color: #FFFF00;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 16px;
    }
    .title {
      font-size: 14px;
      font-weight: 800;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: #FFFF00;
      margin-bottom: 6px;
    }
    .subtitle {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.7);
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <div class="title">Authenticating Session</div>
    <div class="subtitle">Please wait while your credentials are verified...</div>
  </div>
  <script>
    (function() {
      try {
        var hash = window.location.hash || '';
        var search = window.location.search || '';
        var params = new URLSearchParams(search);
        var next = params.get('next');

        if (hash && (hash.indexOf('access_token') !== -1 || hash.indexOf('type=recovery') !== -1)) {
          // Recovery or token hash present: forward directly to reset password page with full hash
          var target = (next && next.indexOf('reset-password') !== -1) ? next : '/auth/reset-password';
          window.location.replace(target + hash);
          return;
        }

        if (hash && hash.indexOf('error') !== -1) {
          window.location.replace('/auth/login?error=expired_link');
          return;
        }

        // No hash and no query code
        window.location.replace('/auth/login?error=invalid_callback');
      } catch (e) {
        window.location.replace('/auth/login?error=invalid_callback');
      }
    })();
  </script>
</body>
</html>`;

  return new NextResponse(htmlBridge, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}

// In-memory set to prevent duplicate WhatsApp notification dispatch within identical session/retries
const processedUsers = new Set<string>();

async function handlePostVerification(user: User, supabase: SupabaseClient<Database>) {
  try {
    const userId = user.id;
    if (processedUsers.has(userId)) {
      return;
    }
    processedUsers.add(userId);

    // Fetch user profile data to construct the notification
    let fullName = user.user_metadata?.full_name || user.user_metadata?.name || '';
    let efootballId = user.user_metadata?.efootball_id || '';
    let whatsappNumber = user.user_metadata?.whatsapp_number || '';

    // If metadata was empty, check public.profiles
    if (!fullName || !efootballId) {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      const profile = data as Database['public']['Tables']['profiles']['Row'] | null;

      if (profile) {
        fullName = fullName || profile.display_name;
        efootballId = efootballId || profile.efootball_id;
        whatsappNumber = whatsappNumber || profile.whatsapp_number;
      }
    }

    await sendAdminRegistrationNotification({
      fullName: fullName || 'New Player',
      verifiedEmail: user.email || '',
      efootballId: efootballId || 'Not provided',
      whatsappNumber: whatsappNumber || 'Not provided',
      userId,
    });
  } catch (err) {
    console.error('[AuthCallback] Non-blocking post-verification error:', err);
  }
}
