import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { checkRateLimit, getClientIp, RATE_LIMIT_RULES, createRateLimitErrorResponse } from '@/lib/rateLimit';

const PRIMARY_ADMIN_EMAIL = 'ye.agrajj@gmail.com';

function isAllowlistedAdmin(email?: string | null): boolean {
  if (!email || typeof email !== 'string') return false;
  return email.trim().toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase();
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const ip = getClientIp(request);

  // 1. Rate Limit Checks for sensitive routes
  if (pathname === '/login' || pathname === '/auth/login') {
    const rateLimit = checkRateLimit(`login_${ip}`, RATE_LIMIT_RULES.auth);
    if (!rateLimit.success) {
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
  supabaseResponse.headers.set('X-Frame-Options', 'DENY');
  supabaseResponse.headers.set('X-Content-Type-Options', 'nosniff');
  supabaseResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

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

  // Fast redirect for protected routes when no candidate session cookie exists
  if (!hasAuthCookie && (isAdminRoute || isDashboardRoute)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
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
      return NextResponse.redirect(url);
    }

    let isUserAdmin = isAllowlistedAdmin(user.email);
    if (!isUserAdmin && user.id) {
      try {
        const { data: adminRecord } = await (supabase.from('admin_users') as any)
          .select('role')
          .eq('id', user.id)
          .maybeSingle();
        if (adminRecord && adminRecord.role) {
          isUserAdmin = true;
        }
      } catch {
        // Fallback
      }
    }

    if (!isUserAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      url.searchParams.set('error', 'admin_unauthorized');
      return NextResponse.redirect(url);
    }
  }

  // 3. Guard /dashboard/* routes:
  if (isDashboardRoute) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
  }

  // Helper to determine if authenticated user has admin role
  async function checkUserIsAdmin(uid: string, uEmail?: string | null): Promise<boolean> {
    if (isAllowlistedAdmin(uEmail)) return true;
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

  // 4. Guard /login route:
  if (pathname === '/login' && user) {
    const url = request.nextUrl.clone();
    const isUserAdmin = await checkUserIsAdmin(user.id, user.email);
    if (isUserAdmin) {
      url.pathname = '/admin/dashboard';
    } else {
      url.pathname = '/dashboard';
    }
    return NextResponse.redirect(url);
  }

  // 5. Guard /auth/login route:
  if (pathname === '/auth/login' && user) {
    const url = request.nextUrl.clone();
    const isUserAdmin = await checkUserIsAdmin(user.id, user.email);
    if (isUserAdmin) {
      url.pathname = '/admin/dashboard';
    } else {
      url.pathname = '/dashboard';
    }
    return NextResponse.redirect(url);
  }
  if (pathname === '/auth/login' && user) {
    const url = request.nextUrl.clone();
    if (isAllowlistedAdmin(user.email)) {
      url.pathname = '/admin/dashboard';
    } else {
      const nextParam = request.nextUrl.searchParams.get('next');
      if (nextParam && !nextParam.startsWith('/admin') && nextParam.startsWith('/')) {
        url.pathname = nextParam;
        url.search = '';
      } else {
        url.pathname = '/dashboard';
      }
    }
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
