import { NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimitAsync, getClientIp, RATE_LIMIT_RULES, createRateLimitErrorResponse, buildRateLimitHeaders } from '@/lib/rateLimit';
import { getCanonicalMatchRoomName, getBroadcasterIdentity } from '@/lib/livekit/matchRoom';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SAFE_ROOM_REGEX = /^[a-zA-Z0-9_\-\.]{3,64}$/;

function getCorsHeaders(rateLimitHeaders?: Record<string, string>) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    ...(rateLimitHeaders || {}),
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: getCorsHeaders() });
}

interface TokenRequestPayload {
  room?: string;
  identity?: string;
  role?: string;
  matchId?: string;
}

type UserAdminRole = 'super_admin' | 'admin' | 'moderator' | 'streamer' | null;

interface EvaluatedUser {
  isAuthenticated: boolean;
  userId: string | null;
  email: string | null;
  adminRole: UserAdminRole;
  accountStatus: 'active' | 'suspended' | 'disabled';
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isModerator: boolean;
  isStreamer: boolean;
}

/**
 * Validates session and evaluates database-enforced admin RBAC for the caller.
 * Verifies profiles.account_status: suspended/disabled accounts are strictly stripped of all elevated roles.
 */
async function evaluateCallerRole(): Promise<EvaluatedUser> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        isAuthenticated: false,
        userId: null,
        email: null,
        adminRole: null,
        accountStatus: 'active',
        isSuperAdmin: false,
        isAdmin: false,
        isModerator: false,
        isStreamer: false,
      };
    }

    const email = (user.email || '').trim().toLowerCase();

    // Query profiles table for account_status (suspended/disabled protection)
    let accountStatus: 'active' | 'suspended' | 'disabled' = 'active';
    try {
      const { data: prof } = await (supabase.from('profiles') as any)
        .select('account_status')
        .eq('id', user.id)
        .maybeSingle();

      if (prof?.account_status) {
        accountStatus = prof.account_status;
      }
    } catch (profErr) {
      console.warn('[LiveKit Token] Profile status query warning:', profErr);
    }

    const isSuspendedOrDisabled = accountStatus === 'suspended' || accountStatus === 'disabled';

    // Query admin_users table for assigned RBAC role
    let assignedRole: UserAdminRole = null;
    try {
      const { data: adminRecord } = await (supabase.from('admin_users') as any)
        .select('id, role')
        .eq('id', user.id)
        .maybeSingle();

      if (adminRecord && adminRecord.role) {
        assignedRole = adminRecord.role as UserAdminRole;
      }
    } catch (dbErr) {
      console.warn('[LiveKit Token] Failed querying admin_users:', dbErr);
    }

    // Suspended or disabled users lose ALL elevated permissions immediately
    const isSuperAdmin = !isSuspendedOrDisabled && assignedRole === 'super_admin';
    const isAdmin = !isSuspendedOrDisabled && (isSuperAdmin || assignedRole === 'admin');
    const isModerator = !isSuspendedOrDisabled && (isAdmin || assignedRole === 'moderator');
    const isStreamer = !isSuspendedOrDisabled && (isModerator || assignedRole === 'streamer');

    return {
      isAuthenticated: true,
      userId: user.id,
      email,
      adminRole: isSuspendedOrDisabled ? null : assignedRole,
      accountStatus,
      isSuperAdmin,
      isAdmin,
      isModerator,
      isStreamer,
    };
  } catch (err) {
    console.error('[LiveKit Token] Caller role evaluation error:', err);
    return {
      isAuthenticated: false,
      userId: null,
      email: null,
      adminRole: null,
      accountStatus: 'active',
      isSuperAdmin: false,
      isAdmin: false,
      isModerator: false,
      isStreamer: false,
    };
  }
}

/**
 * Core LiveKit token generation handler.
 * Strictly verifies permissions:
 * - Anonymous callers: ONLY viewer permissions.
 * - Authenticated players: ONLY viewer permissions.
 * - Streamers / Moderators / Admins: Broadcaster permissions when authorized.
 * - Client-requested role is NEVER trusted blindly.
 */
async function handleTokenGeneration(request: Request, payload: TokenRequestPayload) {
  const ip = getClientIp(request);
  const rateLimitResult = await checkRateLimitAsync(`livekit_token_${ip}`, RATE_LIMIT_RULES.tokens);

  if (!rateLimitResult.success) {
    return createRateLimitErrorResponse(rateLimitResult);
  }

  const rateLimitHeaders = buildRateLimitHeaders(rateLimitResult);

  try {
    const rawRoom = (payload.room || 'efootball-live-test').trim();
    if (!SAFE_ROOM_REGEX.test(rawRoom)) {
      return NextResponse.json(
        { error: 'Invalid room identifier format. Only alphanumeric characters, dashes, and underscores allowed (3-64 chars).' },
        { status: 400, headers: getCorsHeaders(rateLimitHeaders) }
      );
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const wsUrl = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL;

    if (!apiKey || !apiSecret || !wsUrl) {
      return NextResponse.json(
        { error: 'LiveKit server configuration is incomplete.' },
        { status: 500, headers: getCorsHeaders(rateLimitHeaders) }
      );
    }

    // Evaluate caller privileges via verified Supabase session & RBAC
    const caller = await evaluateCallerRole();

    // Client requested role
    const requestedRole = (payload.role || 'viewer').toLowerCase().trim();

    // Enforce authorization policy:
    // Check if room is the designated test room for verified Admins
    const isDesignatedTestRoom = rawRoom === 'efootball-live-test' && caller.isAdmin;

    // Only streamers, moderators, and admins with ACTIVE accounts can acquire broadcaster permissions.
    let grantedRole: 'viewer' | 'broadcaster' | 'moderator' = 'viewer';
    let canPublish = false;
    let canPublishData = false;
    let matchRecord: { id: string; status: string; live_room_name: string | null } | null = null;

    if (requestedRole === 'broadcaster') {
      if (!caller.isAuthenticated) {
        return NextResponse.json(
          { error: 'Unauthorized: Authentication required for broadcaster access.' },
          { status: 401, headers: getCorsHeaders(rateLimitHeaders) }
        );
      }

      if (caller.accountStatus !== 'active') {
        return NextResponse.json(
          { error: `Forbidden: Account is currently ${caller.accountStatus}. Broadcasting is disabled.` },
          { status: 403, headers: getCorsHeaders(rateLimitHeaders) }
        );
      }

      if (!caller.isStreamer) {
        return NextResponse.json(
          { error: 'Forbidden: Insufficient privileges. Normal players cannot broadcast.' },
          { status: 403, headers: getCorsHeaders(rateLimitHeaders) }
        );
      }

      // Match-Level Authoritative Room Validation:
      // Broadcasters must publish to a verified active match room
      const supabase = await createClient();
      let isVerifiedMatchRoom = false;

      try {
        const { data, error: matchErr } = await (supabase.from('matches') as any)
          .select('id, status, live_room_name')
          .or(`live_room_name.eq."${rawRoom}",id.eq."${rawRoom}"`)
          .maybeSingle();

        if (!matchErr && data) {
          const foundMatch = data as { id: string; status: string; live_room_name: string | null };
          matchRecord = foundMatch;
          if (foundMatch.status === 'completed' || foundMatch.status === 'walkover' || foundMatch.status === 'cancelled') {
            return NextResponse.json(
              { error: `Forbidden: Match has already concluded (status: ${foundMatch.status}). Room broadcasting is closed.` },
              { status: 403, headers: getCorsHeaders(rateLimitHeaders) }
            );
          }
          isVerifiedMatchRoom = true;
        }
      } catch (dbErr) {
        console.warn('[LiveKit Token] Match room verification warning:', dbErr);
      }

      // Allow designated platform test room only for verified Admins
      if (!isVerifiedMatchRoom && !isDesignatedTestRoom) {
        return NextResponse.json(
          { error: `Forbidden: Room '${rawRoom}' is not linked to any active scheduled match.` },
          { status: 403, headers: getCorsHeaders(rateLimitHeaders) }
        );
      }

      // Match-Level Streamer Assignment Enforcement:
      // Streamers (who are not Admins) MUST be explicitly assigned to this match in public.match_streamer_assignments
      if (!caller.isAdmin && !caller.isSuperAdmin) {
        if (!isVerifiedMatchRoom || !matchRecord) {
          return NextResponse.json(
            { error: 'Forbidden: Streamers can only broadcast to verified active matches.' },
            { status: 403, headers: getCorsHeaders(rateLimitHeaders) }
          );
        }

        try {
          const { data: assignment, error: assignErr } = await (supabase
            .from('match_streamer_assignments') as any)
            .select('id')
            .eq('match_id', matchRecord.id)
            .eq('streamer_id', caller.userId)
            .maybeSingle();

          if (assignErr || !assignment) {
            return NextResponse.json(
              { error: 'Forbidden: You are not assigned to broadcast this match.' },
              { status: 403, headers: getCorsHeaders(rateLimitHeaders) }
            );
          }
        } catch (assignCheckErr) {
          console.warn('[LiveKit Token] Streamer assignment check error:', assignCheckErr);
          return NextResponse.json(
            { error: 'Forbidden: Unable to verify streamer match assignment.' },
            { status: 403, headers: getCorsHeaders(rateLimitHeaders) }
          );
        }
      }

      grantedRole = 'broadcaster';
      canPublish = true;
      canPublishData = true;
    } else if (requestedRole === 'moderator') {
      if (!caller.isAuthenticated) {
        return NextResponse.json(
          { error: 'Unauthorized: Authentication required for moderator access.' },
          { status: 401, headers: getCorsHeaders(rateLimitHeaders) }
        );
      }

      if (caller.accountStatus !== 'active') {
        return NextResponse.json(
          { error: `Forbidden: Account is currently ${caller.accountStatus}. Moderation is disabled.` },
          { status: 403, headers: getCorsHeaders(rateLimitHeaders) }
        );
      }

      if (!caller.isModerator) {
        return NextResponse.json(
          { error: 'Forbidden: Insufficient privileges for moderator access.' },
          { status: 403, headers: getCorsHeaders(rateLimitHeaders) }
        );
      }

      grantedRole = 'moderator';
      canPublish = false;
      canPublishData = true;
    } else {
      // Default to viewer for all users (including anonymous visitors & players)
      grantedRole = 'viewer';
      canPublish = false;
      canPublishData = false;
    }

    // Determine deterministic and safe identity
    let identity: string;
    if (grantedRole === 'broadcaster' && caller.userId) {
      identity = getBroadcasterIdentity(caller.userId);
    } else if (caller.isAuthenticated && caller.userId) {
      identity = `${grantedRole}-${caller.userId.substring(0, 8)}`;
    } else {
      const sanitizedRequestedId = (payload.identity || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
      identity = sanitizedRequestedId || `viewer-${Math.random().toString(36).substring(2, 9)}`;
    }

    // Resolve canonical room for token grant
    const targetRoom = isDesignatedTestRoom
      ? rawRoom
      : matchRecord
      ? getCanonicalMatchRoomName(matchRecord)
      : rawRoom;

    // Set appropriate token TTL: 1 hour for viewers (minimizing replay window), 2 hours for broadcasters
    const tokenTtl = grantedRole === 'broadcaster' ? '2h' : '1h';

    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      name: identity,
      ttl: tokenTtl,
    });

    at.addGrant({
      room: targetRoom,
      roomJoin: true,
      canSubscribe: true,
      canPublish,
      canPublishData,
    });

    const token = await at.toJwt();

    return NextResponse.json(
      {
        token,
        url: wsUrl,
        room: targetRoom,
        identity,
        role: grantedRole,
      },
      { headers: getCorsHeaders(rateLimitHeaders) }
    );
  } catch (error: unknown) {
    console.error('Error generating LiveKit token:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: message },
      { status: 500, headers: getCorsHeaders(rateLimitHeaders) }
    );
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return handleTokenGeneration(request, body);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const payload: TokenRequestPayload = {
    room: searchParams.get('room') || undefined,
    identity: searchParams.get('identity') || undefined,
    role: searchParams.get('role') || undefined,
    matchId: searchParams.get('matchId') || undefined,
  };
  return handleTokenGeneration(request, payload);
}
