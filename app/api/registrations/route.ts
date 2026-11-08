import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimitAsync, getClientIp, RATE_LIMIT_RULES, createRateLimitErrorResponse } from '@/lib/rateLimit';
import { selfRegisterTournament } from '@/services/playerDashboardService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const registerSchema = z.object({
  tournamentId: z.string().uuid({ message: 'Invalid tournament ID format.' }),
  rulesAccepted: z.boolean().optional(),
  accessCode: z.string().optional(),
});

/**
 * POST /api/registrations
 * 
 * Authenticated endpoint for tournament registration.
 * Clean, direct registration workflow validating:
 * - Authentication
 * - Active player profile
 * - Verified eFootball ID
 * - WhatsApp verification
 * - Rules acceptance
 * - Available tournament capacity
 * - Duplicate registration prevention
 */
export async function POST(request: NextRequest) {
  // 1. Rate limiting (distributed with fallback)
  const ip = getClientIp(request);
  const rateLimitResult = await checkRateLimitAsync(`registration_${ip}`, RATE_LIMIT_RULES.api);
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

    const { tournamentId, rulesAccepted, accessCode } = parseResult.data;

    // 4. Perform direct tournament registration
    const result = await selfRegisterTournament(supabase, user.id, tournamentId, {
      rulesAccepted: rulesAccepted ?? true,
      accessCode,
    });

    if (!result.success) {
      const msg = result.message || 'Registration failed.';
      const status = msg.includes('already registered') || msg.includes('full') ? 409 : 400;
      return NextResponse.json({ error: msg }, { status });
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      participantId: result.participantId,
      isPaid: result.isPaid,
      registrationId: result.registrationId,
      status: result.status,
      amountPaise: result.amountPaise,
      entryFeeINR: result.entryFeeINR,
      currency: result.currency,
    });
  } catch (error: unknown) {
    console.error('Registration API error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error during registration.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
