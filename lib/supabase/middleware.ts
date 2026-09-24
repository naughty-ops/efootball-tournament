import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { checkRateLimit, getClientIp, RATE_LIMIT_RULES, createRateLimitErrorResponse, buildRateLimitHeaders } from '@/lib/rateLimit';

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const ip = getClientIp(request);

  // 1. Rate Limit Checks for sensitive routes
  if (pathname === '/login') {
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

  // IMPORTANT: Avoid using getSession(), use getUser() for security
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 2. Guard /admin/* routes: redirect to /login if unauthenticated
  if (pathname.startsWith('/admin') && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // 3. Guard /login route: redirect to /admin/dashboard if already authenticated
  if (pathname === '/login' && user) {
    const url = request.nextUrl.clone();
    url.pathname = '/admin/dashboard';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
