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

  // IMPORTANT: Use getUser() for verified cryptographic server-side validation
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 2. Guard /admin/* routes:
  if (pathname.startsWith('/admin')) {
    // If not authenticated, redirect to /login
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }

    // If authenticated but email is NOT ye.agrajj@gmail.com, strictly deny access
    if (!isAllowlistedAdmin(user.email)) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      url.searchParams.set('error', 'admin_unauthorized');
      return NextResponse.redirect(url);
    }
  }

  // 3. Guard /login route:
  if (pathname === '/login' && user) {
    const url = request.nextUrl.clone();
    if (isAllowlistedAdmin(user.email)) {
      url.pathname = '/admin/dashboard';
    } else {
      url.pathname = '/dashboard';
    }
    return NextResponse.redirect(url);
  }

  // 4. Guard /auth/login route:
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
