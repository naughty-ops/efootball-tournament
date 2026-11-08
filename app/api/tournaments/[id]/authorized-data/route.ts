import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimitAsync, getClientIp, RATE_LIMIT_RULES, createRateLimitErrorResponse } from '@/lib/rateLimit';
import { verifySignedTournamentAccessToken, getTournamentCookieName } from '@/lib/security/tournamentAccessCookie';
import { getAuthorizedPrivateTournamentData } from '@/services/privateTournamentDataService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string }>;
}

const SECURITY_HEADERS = {
  'Cache-Control': 'private, no-store, must-revalidate',
  'Pragma': 'no-cache',
  'X-Content-Type-Options': 'nosniff',
};

/**
 * GET /api/tournaments/[id]/authorized-data
 *
 * Secure server-side data delivery for authorized private tournament visitors.
 * Enforces:
 * 1. Active Supabase user authentication session (anonymous users strictly rejected)
 * 2. Cryptographically signed access token bound to tournament ID and current password-state fingerprint
 * 3. Rejection and invalidation of stale tokens if password was rotated
 * 4. Dedicated 5-query parallel retrieval directly from PostgreSQL tables via admin client
 * 5. Strict omission of passwords and hashes
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const ip = getClientIp(request);
  const rateLimitResult = await checkRateLimitAsync(`auth_data_${ip}`, RATE_LIMIT_RULES.api);
  if (!rateLimitResult.success) {
    return createRateLimitErrorResponse(rateLimitResult);
  }

  try {
    const { id } = await context.params;

    if (!id || !UUID_REGEX.test(id)) {
      return NextResponse.json(
        { error: 'Invalid tournament identifier format.' },
        { status: 400, headers: SECURITY_HEADERS }
      );
    }

    // 1. Enforce verified Supabase user authentication (Task 3.A)
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    const cookieName = getTournamentCookieName(id);

    if (authErr || !user) {
      const unauthResponse = NextResponse.json(
        {
          error: 'Authentication required. Please sign in to access private tournament data.',
          isPrivateLocked: true,
          reason: 'UNAUTHENTICATED',
        },
        { status: 401, headers: SECURITY_HEADERS }
      );
      unauthResponse.cookies.set(cookieName, '', { maxAge: 0, path: '/' });
      return unauthResponse;
    }

    // 2. Fetch tournament privacy status and password hash via admin client
    const adminClient = createAdminClient();
    const { data: tourneyRecord, error: tourneyErr } = await (adminClient.from('tournaments') as any)
      .select('id, name, is_private, access_code_hash')
      .eq('id', id)
      .maybeSingle();

    if (tourneyErr || !tourneyRecord) {
      return NextResponse.json(
        { error: 'Tournament not found.' },
        { status: 404, headers: SECURITY_HEADERS }
      );
    }

    // If tournament is public, clients should query standard public APIs
    if (!tourneyRecord.is_private) {
      const publicResponse = NextResponse.json(
        { error: 'Tournament is public. Use public tournament services.' },
        { status: 400, headers: SECURITY_HEADERS }
      );
      // Clear private access cookie since tournament is no longer private
      publicResponse.cookies.set(cookieName, '', { maxAge: 0, path: '/' });
      return publicResponse;
    }

    // 3. Verify cryptographic access token with password-state fingerprint (Task 3.B)
    const accessCookie = request.cookies.get(cookieName)?.value;
    const verification = verifySignedTournamentAccessToken(
      accessCookie,
      id,
      tourneyRecord.access_code_hash
    );

    if (!verification.valid) {
      const unauthResponse = NextResponse.json(
        {
          error: 'Unauthorized: Valid private tournament authorization required.',
          isPrivateLocked: true,
          reason: verification.reason,
        },
        { status: 401, headers: SECURITY_HEADERS }
      );
      // Clear invalidated or expired cookie
      unauthResponse.cookies.set(cookieName, '', { maxAge: 0, path: '/' });
      return unauthResponse;
    }

    // 4. Retrieve complete private tournament data via dedicated 5-query parallel pipeline
    const authorizedData = await getAuthorizedPrivateTournamentData(id, adminClient);

    if (!authorizedData) {
      return NextResponse.json(
        { error: 'Failed to retrieve private tournament data.' },
        { status: 500, headers: SECURITY_HEADERS }
      );
    }

    return NextResponse.json(
      {
        success: true,
        ...authorizedData,
      },
      { headers: SECURITY_HEADERS }
    );
  } catch (err: unknown) {
    console.error('[Authorized Tournament Data] Server error:', err);
    return NextResponse.json(
      { error: 'Internal server error retrieving authorized tournament data.' },
      { status: 500, headers: SECURITY_HEADERS }
    );
  }
}
