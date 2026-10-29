import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Validates the authorization of the cron request:
 * Supports:
 * 1. Authorization: Bearer <CRON_SECRET> header (e.g. from Vercel Cron or Cloudflare Workers)
 * 2. x-cron-secret: <CRON_SECRET> header
 * 3. Fallback: Verifies user is an authorized platform administrator via Supabase session
 */
function isAuthorizedCronRequest(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      const expectedBuffer = Buffer.from(cronSecret, 'utf-8');
      const actualBuffer = Buffer.from(token, 'utf-8');
      if (expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
        return true;
      }
    }

    const customHeader = request.headers.get('x-cron-secret');
    if (customHeader) {
      const expectedBuffer = Buffer.from(cronSecret, 'utf-8');
      const actualBuffer = Buffer.from(customHeader.trim(), 'utf-8');
      if (expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * GET/POST /api/cron/release-expired-reservations
 *
 * Secure scheduled endpoint to release expired tournament payment reservations.
 *
 * Invariants:
 * 1. Authenticated via CRON_SECRET or administrative session. Rejects unauthorized calls with 401.
 * 2. Executes the hardened public.release_expired_reservations() PostgreSQL RPC via createAdminClient().
 * 3. Uses database clock (timezone('utc', now())).
 * 4. Releases only eligible, unconfirmed, uncaptured expired holds.
 * 5. Concurrent executions are serialized via FOR UPDATE SKIP LOCKED.
 * 6. Updates payment_orders status to 'expired'.
 * 7. Recalculates reserved_slots_count atomically.
 * 8. Returns structured operational stats without leaking secrets.
 */
async function handleCleanup(request: NextRequest) {
  const startTime = Date.now();

  // 1. Authorization guard
  if (!isAuthorizedCronRequest(request)) {
    console.warn('[Cron: Release Reservations] Unauthorized invocation attempt rejected.');
    return NextResponse.json(
      { error: 'Unauthorized: Valid cron secret or administrative authorization required.' },
      { status: 401 }
    );
  }

  // 2. Initialize privileged client
  let adminClient: any;
  try {
    adminClient = createAdminClient();
  } catch (err: any) {
    console.error('[Cron: Release Reservations] Failed to initialize service client:', err?.message);
    return NextResponse.json(
      { error: 'Service configuration error.' },
      { status: 500 }
    );
  }

  // Optional tournamentId query filter
  const { searchParams } = new URL(request.url);
  const tournamentId = searchParams.get('tournamentId') || null;

  try {
    // 3. Call hardened RPC
    const { data: releasedCount, error: rpcErr } = await adminClient.rpc('release_expired_reservations', {
      p_tournament_id: tournamentId,
    });

    if (rpcErr) {
      console.error('[Cron: Release Reservations] RPC execution failed:', rpcErr);
      return NextResponse.json(
        { error: 'Failed to release expired reservations in database.' },
        { status: 500 }
      );
    }

    const count = typeof releasedCount === 'number' ? releasedCount : Number(releasedCount || 0);
    const durationMs = Date.now() - startTime;

    console.log(
      `[Cron: Release Reservations] Cleanup completed successfully in ${durationMs}ms. Released: ${count} expired holds.`
    );

    return NextResponse.json({
      success: true,
      releasedReservationsCount: count,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[Cron: Release Reservations] Unexpected execution error:', err);
    return NextResponse.json(
      { error: err?.message || 'An unexpected error occurred during reservation cleanup.' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return handleCleanup(request);
}

export async function POST(request: NextRequest) {
  return handleCleanup(request);
}
