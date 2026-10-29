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

  // Guard against open redirect attacks: only allow approved local relative paths
  const safeNext = (next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\'))
    ? next
    : null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    '';

  let response = NextResponse.redirect(new URL('/auth/login', request.url));

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Auth callback missing Supabase configuration.');
    return NextResponse.redirect(new URL('/auth/login?error=config_missing', request.url));
  }

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Flow A: PKCE code exchange
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user) {
      console.error('Code exchange failed:', error?.message);
      return NextResponse.redirect(new URL('/auth/login?error=verification_failed', request.url));
    }

    const user = data.user;

    // Check if recovery flow -> redirect to reset-password
    if (type === 'recovery' || safeNext?.includes('reset-password')) {
      const resetUrl = new URL('/auth/reset-password', request.url);
      response = NextResponse.redirect(resetUrl);
      return response;
    }

    // Post-verification notification workflow for new signup/email confirmation
    await handlePostVerification(user, supabase);

    const redirectUrl = new URL(safeNext || '/auth/login?verified=true', request.url);
    response = NextResponse.redirect(redirectUrl);
    return response;
  }

  // Flow B: Token hash verification (OTP / email token)
  if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (error || !data.user) {
      console.error('OTP verification failed:', error?.message);
      return NextResponse.redirect(new URL('/auth/login?error=verification_failed', request.url));
    }

    const user = data.user;

    if (type === 'recovery') {
      const resetUrl = new URL('/auth/reset-password', request.url);
      response = NextResponse.redirect(resetUrl);
      return response;
    }

    await handlePostVerification(user, supabase);

    const redirectUrl = new URL(safeNext || '/auth/login?verified=true', request.url);
    response = NextResponse.redirect(redirectUrl);
    return response;
  }

  // If neither code nor tokenHash was supplied
  return NextResponse.redirect(new URL('/auth/login?error=invalid_callback', request.url));
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
    // Non-blocking error handling: WhatsApp dispatch failure must never break email verification
    console.error('[AuthCallback] Non-blocking post-verification error:', err);
  }
}
