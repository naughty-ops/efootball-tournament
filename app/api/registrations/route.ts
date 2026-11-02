import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp, RATE_LIMIT_RULES, createRateLimitErrorResponse } from '@/lib/rateLimit';
import { selfRegisterTournament } from '@/services/playerDashboardService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const registerSchema = z.object({
  tournamentId: z.string().uuid({ message: 'Invalid tournament ID format.' }),
  rulesAccepted: z.boolean().optional(),
});

/**
 * POST /api/registrations
 * 
 * Authenticated endpoint for tournament self-registration.
 * Free, direct competitor registration with player verification and duplicate prevention.
 */
export async function POST(request: NextRequest) {
  // 1. Rate limiting
  const ip = getClientIp(request);
  const rateLimitResult = checkRateLimit(`registration_${ip}`, RATE_LIMIT_RULES.api);
  if (!rateLimitResult.success) {
    return createRateLimitErrorResponse(rateLimitResult);
  }

  try {
    // 2. Authenticate user session
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json(
        { error: 'Authentication required. Please sign in to register for tournaments.' },
        { status: 401 }
      );
    }

    // 3. Validate request body
    const body = await request.json().catch(() => ({}));
    const parseResult = registerSchema.safeParse(body);
    if (!parseResult.success) {
      const msg = parseResult.error.issues[0]?.message || 'Invalid request body.';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const { tournamentId, rulesAccepted } = parseResult.data;

    // 4. Perform self-registration
    const result = await selfRegisterTournament(supabase, user.id, tournamentId, {
      rulesAccepted: rulesAccepted ?? true,
    });

    if (!result.success) {
      const status = result.message.includes('already registered') || result.message.includes('full') ? 409 : 400;
      return NextResponse.json({ error: result.message }, { status });
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      participantId: result.participantId,
    });
  } catch (error: unknown) {
    console.error('Registration API error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error during registration.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
