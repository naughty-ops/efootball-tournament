import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
  checkRateLimit,
  getClientIp,
  RATE_LIMIT_RULES,
  createRateLimitErrorResponse,
  isPrefetchRequest,
} from '@/lib/rateLimit';

function applySecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return res;
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const ip = getClientIp(request);

  // 1. Rate Limit Checks for sensitive routes
  // Next.js speculative prefetches must NEVER consume security or login quotas
  if (isPrefetchRequest(request)) {
    // Proceed without incrementing rate limits on speculative prefetches
  } else if (pathname === '/login' || pathname === '/auth/login') {
    // Distinguish ordinary page navigation (GET) from mutation/submission (POST)
    const isMutation = request.method === 'POST';
    const rule = isMutation ? RATE_LIMIT_RULES.auth : RATE_LIMIT_RULES.authPageNav;
    const rateLimit = checkRateLimit(`login_${isMutation ? 'attempt' : 'nav'}_${ip}`, rule);
    if (!rateLimit.success) {
      // If browser navigation, redirect with user-friendly error params instead of raw JSON
      if (!isMutation && request.headers.get('accept')?.includes('text/html')) {
        const errorUrl = request.nextUrl.clone();
        errorUrl.searchParams.set('error', 'rate_limited');
        errorUrl.searchParams.set('retry_after', String(rateLimit.resetSeconds));
        const res = NextResponse.redirect(errorUrl);
        res.headers.set('Retry-After', String(rateLimit.resetSeconds));
        return applySecurityHeaders(res);
      }
      return createRateLimitErrorResponse(rateLimit);
    }
  } else if (pathname.startsWith('/admin')) {
    const rateLimit = checkRateLimit(`admin_${ip}`, RATE_LIMIT_RULES.admin);
    if (!rateLimit.success) {
      return createRateLimitErrorResponse(rateLimit);
    }
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  // Apply Security Headers
  applySecurityHeaders(supabaseResponse);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    '';

  // If environment variables are not set yet, skip redirection to prevent breaking build/dev
  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('your-project-id')) {
    return supabaseResponse;
  }

  // Check if candidate Supabase auth cookies exist
  const allCookies = request.cookies.getAll();
  const hasAuthCookie = allCookies.some(
    (c) => c.name.startsWith('sb-') && (c.name.includes('-auth-token') || c.name.endsWith('-token'))
  );

  const isAdminRoute = pathname.startsWith('/admin');
  const isDashboardRoute = pathname.startsWith('/dashboard');
  const isAuthPage = pathname === '/login' || pathname === '/auth/login';

  // Optimization: For public routes, if there is no auth cookie at all,
  // there is no session to validate or refresh. Return immediately with security headers.
  if (!hasAuthCookie && !isAdminRoute && !isDashboardRoute && !isAuthPage) {
    return supabaseResponse;
  }

  // Fast redirect for protected routes when no candidate session cookie exists:
  // - Admin routes -> /login (Admin Portal)
  // - Player dashboard routes -> /auth/login (Player Portal)
  if (!hasAuthCookie) {
    if (isAdminRoute) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('next', pathname);
      return applySecurityHeaders(NextResponse.redirect(url));
    }
    if (isDashboardRoute) {
      const url = request.nextUrl.clone();
      url.pathname = '/auth/login';
      url.searchParams.set('next', pathname);
      return applySecurityHeaders(NextResponse.redirect(url));
    }
  }

  // If on login page with no auth cookie, user is definitely not logged in
  if (!hasAuthCookie && isAuthPage) {
    return supabaseResponse;
  }

  // Candidate session cookie exists (or edge case requiring cryptographic validation):
  // Instantiate server client and execute full server-side verification.
  // NEVER authenticate or authorize based on cookie presence alone.
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        applySecurityHeaders(supabaseResponse);
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Cryptographically verify session against Supabase Auth
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 2. Guard /admin/* routes:
  if (isAdminRoute) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('next', pathname);
      return applySecurityHeaders(NextResponse.redirect(url));
    }

    let isUserAdmin = false;
    if (user.id) {
      try {
        const { data: adminRecord } = await (supabase.from('admin_users') as any)
          .select('role')
          .eq('id', user.id)
          .maybeSingle();
        if (adminRecord && adminRecord.role) {
          isUserAdmin = true;
        }
      } catch {
        isUserAdmin = false;
      }
    }

    if (!isUserAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      url.searchParams.set('error', 'admin_unauthorized');
      return applySecurityHeaders(NextResponse.redirect(url));
    }
  }

  // 3. Guard /dashboard/* routes:
  if (isDashboardRoute) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = '/auth/login';
      url.searchParams.set('next', pathname);
      return applySecurityHeaders(NextResponse.redirect(url));
    }
  }

  // Helper to determine if authenticated user has database admin role
  async function checkUserIsAdmin(uid: string): Promise<boolean> {
    try {
      const { data: adminRecord } = await (supabase.from('admin_users') as any)
        .select('role')
        .eq('id', uid)
        .maybeSingle();
      return !!(adminRecord && adminRecord.role);
    } catch {
      return false;
    }
  }

  // 4. Guard /login and /auth/login routes when user is already authenticated:
  if ((pathname === '/login' || pathname === '/auth/login') && user) {
    const url = request.nextUrl.clone();
    const isUserAdmin = await checkUserIsAdmin(user.id);
    if (isUserAdmin) {
      url.pathname = '/admin/dashboard';
      url.search = '';
    } else {
      const nextParam = request.nextUrl.searchParams.get('next');
      if (nextParam && !nextParam.startsWith('/admin') && nextParam.startsWith('/')) {
        url.pathname = nextParam;
        url.search = '';
      } else {
        url.pathname = '/dashboard';
        url.search = '';
      }
    }
    return applySecurityHeaders(NextResponse.redirect(url));
  }

  return supabaseResponse;
}
