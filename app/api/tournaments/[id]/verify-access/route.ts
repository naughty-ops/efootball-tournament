import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimitAsync, getClientIp, RATE_LIMIT_RULES, createRateLimitErrorResponse } from '@/lib/rateLimit';
import { createSignedTournamentAccessToken, getTournamentCookieName } from '@/lib/security/tournamentAccessCookie';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Compares two strings using constant-time comparison to prevent timing attacks.
 */
function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * POST /api/tournaments/[id]/verify-access
 * Verifies access code for private tournaments.
 * If verified, issues a cryptographically signed, HTTP-only authorization cookie.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const ip = getClientIp(request);
  const rateLimitResult = await checkRateLimitAsync(`access_code_${ip}`, RATE_LIMIT_RULES.auth);
  if (!rateLimitResult.success) {
    return createRateLimitErrorResponse(rateLimitResult);
  }

  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const rawAccessCode = (body.accessCode || '').trim();

    if (!rawAccessCode) {
      return NextResponse.json(
        { error: 'Access code is required for private tournament entry.' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Enforce authenticated Supabase user session (Task 3.A)
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json(
        { error: 'Authentication required. Please sign in to unlock private tournaments.' },
        { status: 401 }
      );
    }

    const { data: tourney, error } = await (supabase.from('tournaments') as any)
      .select('id, name, is_private, access_code_hash')
      .eq('id', id)
      .maybeSingle();

    if (error || !tourney) {
      return NextResponse.json({ error: 'Tournament not found.' }, { status: 404 });
    }

    if (!tourney.is_private) {
      return NextResponse.json({ success: true, message: 'Tournament is public.' });
    }

    // Verify access code against stored hash
    const storedHash = (tourney.access_code_hash || '').trim();
    let isMatch = false;

    if (!storedHash) {
      // If marked private but no password set, permit entry
      isMatch = true;
    } else if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$') || storedHash.startsWith('$2$')) {
      // Standard Bcrypt password verification
      try {
        isMatch = await bcrypt.compare(rawAccessCode, storedHash);
      } catch (bcryptErr) {
        console.error('[Verify Access] Bcrypt comparison error:', bcryptErr);
        isMatch = false;
      }
    } else if (storedHash.startsWith('$argon2')) {
      // Argon2 unsupported in current runtime environment; reject safely without crashing
      console.warn('[Verify Access] Unsupported Argon2 hash encountered for tournament:', id);
      isMatch = false;
    } else {
      // Fallback for plaintext credentials stored in dev environments
      isMatch = timingSafeStringEqual(storedHash, rawAccessCode);
    }

    const cookieName = getTournamentCookieName(id);

    if (!isMatch) {
      const errorResponse = NextResponse.json(
        { error: 'Invalid access code. Please verify your credentials and try again.' },
        { status: 401 }
      );
      errorResponse.cookies.set(cookieName, '', { maxAge: 0, path: '/' });
      return errorResponse;
    }

    // Issue cryptographically signed tournament access token with password-state fingerprint
    let signedToken: string;
    try {
      signedToken = createSignedTournamentAccessToken(id, tourney.access_code_hash);
    } catch (tokenErr) {
      console.error('[Verify Access] Token generation error:', tokenErr);
      return NextResponse.json(
        { error: 'Unable to issue secure authorization token. Signing secret configuration issue.' },
        { status: 500 }
      );
    }

    const response = NextResponse.json(
      {
        success: true,
        message: 'Access granted.',
        tournamentId: id,
      },
      {
        headers: {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        },
      }
    );

    response.cookies.set(cookieName, signedToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 86400 * 7, // 7 days
    });

    return response;
  } catch (err: unknown) {
    console.error('[Verify Access] Error:', err);
    return NextResponse.json({ error: 'Internal server error verifying access.' }, { status: 500 });
  }
}
