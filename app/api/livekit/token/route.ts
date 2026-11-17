import { NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimitAsync, getClientIp, RATE_LIMIT_RULES, createRateLimitErrorResponse, buildRateLimitHeaders } from '@/lib/rateLimit';
import { getCanonicalMatchRoomName, getBroadcasterIdentity } from '@/lib/livekit/matchRoom';
import { verifySignedTournamentAccessToken, getTournamentCookieName } from '@/lib/security/tournamentAccessCookie';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SAFE_ROOM_REGEX = /^[a-zA-Z0-9_\-\.]{3,64}$/;

function getCookieFromRequest(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function getAllowedOrigin(request: Request): string | null {
  const origin = request.headers.get('origin');
  if (!origin) return null;

  let parsed: URL;
  try {
    parsed = new URL(origin.trim());
  } catch {
    return null;
  }

  // Only http and https protocols are valid web origins
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }

  const normalizedOrigin = parsed.origin.toLowerCase();

  // 1. Authoritative Canonical Production Domains
  const prodDomains = [
    'https://www.e-football.in',
    'https://e-football.in',
    'https://efootball-tournament-cyan.vercel.app',
  ];
  if (prodDomains.includes(normalizedOrigin)) return origin;

  // 2. Explicit Environment Site URL (if configured)
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    try {
      const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL).origin.toLowerCase();
      if (normalizedOrigin === siteUrl) return origin;
    } catch {}
  }

  // 3. Vercel System Deployment URL (if running on Vercel)
  if (process.env.VERCEL_URL) {
    try {
      const vercelOrigin = new URL(`https://${process.env.VERCEL_URL}`).origin.toLowerCase();
      if (normalizedOrigin === vercelOrigin) return origin;
    } catch {}
  }

  // 4. Server-Only Explicitly Trusted Origins (comma-separated)
  if (process.env.LIVEKIT_TRUSTED_ORIGINS) {
    const trustedOrigins = process.env.LIVEKIT_TRUSTED_ORIGINS.split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    for (const trusted of trustedOrigins) {
      try {
        const trustedOrigin = new URL(trusted).origin.toLowerCase();
        if (normalizedOrigin === trustedOrigin) return origin;
      } catch {}
    }
  }

  // 5. Authorized Project Vercel Preview Deployments ONLY
  // Strictly matches:
  // - https://efootball-tournament.vercel.app
  // - https://efootball-tournament-<preview-suffix>.vercel.app
  // Arbitrary third-party domains (e.g. attacker.vercel.app) are rejected.
  if (
    parsed.protocol === 'https:' &&
    /^efootball-tournament(-[a-z0-9_-]+)?\.vercel\.app$/.test(parsed.hostname)
  ) {
    return origin;
  }

  // 6. Local Development Origins (strictly rejected in production)
  if (process.env.NODE_ENV !== 'production') {
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return origin;
    }
  }

  return null;
}

function getCorsHeaders(request: Request, rateLimitHeaders?: Record<string, string>) {
  const allowedOrigin = getAllowedOrigin(request);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
    ...(rateLimitHeaders || {}),
  };

  if (allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = allowedOrigin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  return headers;
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && !getAllowedOrigin(request)) {
    return NextResponse.json(
      { error: 'Forbidden: Origin is not permitted.' },
      { status: 403, headers: getCorsHeaders(request) }
    );
  }
  return NextResponse.json({}, { headers: getCorsHeaders(request) });
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
 * - Anonymous callers: ONLY viewer permissions for public matches.
 * - Authenticated players: ONLY viewer permissions (restricted to authorized tournaments).
 * - Streamers / Moderators / Admins: Broadcaster permissions when assigned and authorized.
 * - Client-requested role is NEVER trusted blindly.
 * - Database-backed room validation for all tokens.
 */
async function handleTokenGeneration(request: Request, payload: TokenRequestPayload) {
  // 1. Strict Origin Validation: Block unauthorized origins from requesting LiveKit tokens
  const origin = request.headers.get('origin');
  if (origin && !getAllowedOrigin(request)) {
    return NextResponse.json(
      { error: 'Forbidden: Origin is not permitted to request LiveKit tokens.' },
      { status: 403, headers: getCorsHeaders(request) }
    );
  }

  // 2. Rate Limiting: Rate limit evaluated before performing database operations
  const ip = getClientIp(request);
  const rateLimitResult = await checkRateLimitAsync(`livekit_token_${ip}`, RATE_LIMIT_RULES.tokens);

  if (!rateLimitResult.success) {
    return createRateLimitErrorResponse(rateLimitResult);
  }

  const rateLimitHeaders = buildRateLimitHeaders(rateLimitResult);

  try {
    const rawRoom = (payload.room || '').trim();
    if (!rawRoom) {
      return NextResponse.json(
        { error: 'Missing room identifier parameter.' },
        { status: 400, headers: getCorsHeaders(request, rateLimitHeaders) }
      );
    }

    if (!SAFE_ROOM_REGEX.test(rawRoom)) {
      return NextResponse.json(
        { error: 'Invalid room identifier format. Only alphanumeric characters, dashes, and underscores allowed (3-64 chars).' },
        { status: 400, headers: getCorsHeaders(request, rateLimitHeaders) }
      );
    }

    // Evaluate caller privileges via verified Supabase session & RBAC
    const caller = await evaluateCallerRole();

    // Check if room is the designated platform test room
    const isDesignatedTestRoom = rawRoom === 'efootball-live-test';

    let matchRecord: {
      id: string;
      status: string;
      live_room_name: string | null;
      tournament_id: string | null;
      participant_a: string | null;
      participant_b: string | null;
    } | null = null;

    let isPrivateTournament = false;
    let tournamentAccessCodeHash: string | null = null;

    if (isDesignatedTestRoom) {
      // In production, strictly restrict test room to platform administrators
      if (process.env.NODE_ENV === 'production' && !caller.isAdmin) {
        return NextResponse.json(
          { error: 'Forbidden: Platform test room is restricted to administrators.' },
          { status: 403, headers: getCorsHeaders(request, rateLimitHeaders) }
        );
      }
    } else {
      // Match-Level Authoritative Room Validation:
      // Verify that the requested room belongs to a legitimate scheduled match
      const adminDb = createAdminClient();
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawRoom);

      let matchQuery = (adminDb.from('matches') as any)
        .select('id, status, live_room_name, tournament_id, participant_a, participant_b');

      if (isUUID) {
        matchQuery = matchQuery.or(`live_room_name.eq."${rawRoom}",id.eq."${rawRoom}"`);
      } else {
        matchQuery = matchQuery.eq('live_room_name', rawRoom);
      }

      const { data: foundMatch, error: matchErr } = await matchQuery.maybeSingle();

      if (matchErr) {
        console.warn('[LiveKit Token] Match room lookup warning:', matchErr);
      }

      if (!foundMatch) {
        return NextResponse.json(
          { error: `Room '${rawRoom}' not found or is not linked to any scheduled match.` },
          { status: 404, headers: getCorsHeaders(request, rateLimitHeaders) }
        );
      }

      const matchObj = foundMatch as {
        id: string;
        status: string;
        live_room_name: string | null;
        tournament_id: string | null;
        participant_a: string | null;
        participant_b: string | null;
      };
      matchRecord = matchObj;

      // Reject concluded matches
      if (
        matchObj.status === 'completed' ||
        matchObj.status === 'walkover' ||
        matchObj.status === 'cancelled'
      ) {
        return NextResponse.json(
          { error: `Forbidden: Match has already concluded (status: ${matchObj.status}). Room broadcasting and viewing is closed.` },
          { status: 403, headers: getCorsHeaders(request, rateLimitHeaders) }
        );
      }

      // Check tournament privacy status
      if (matchObj.tournament_id) {
        try {
          const { data: tourney } = await (adminDb.from('tournaments') as any)
            .select('id, is_private, access_code_hash')
            .eq('id', matchObj.tournament_id)
            .maybeSingle();

          if (tourney) {
            isPrivateTournament = Boolean(tourney.is_private);
            tournamentAccessCodeHash = tourney.access_code_hash || null;
          }
        } catch (tourneyErr) {
          console.warn('[LiveKit Token] Tournament privacy check error:', tourneyErr);
        }
      }
    }

    // Client requested role
    const requestedRole = (payload.role || 'viewer').toLowerCase().trim();

    let grantedRole: 'viewer' | 'broadcaster' | 'moderator' = 'viewer';
    let canPublish = false;
    let canPublishData = false;

    if (requestedRole === 'broadcaster') {
      if (!caller.isAuthenticated) {
        return NextResponse.json(
          { error: 'Unauthorized: Authentication required for broadcaster access.' },
          { status: 401, headers: getCorsHeaders(request, rateLimitHeaders) }
        );
      }

      if (caller.accountStatus !== 'active') {
        return NextResponse.json(
          { error: `Forbidden: Account is currently ${caller.accountStatus}. Broadcasting is disabled.` },
          { status: 403, headers: getCorsHeaders(request, rateLimitHeaders) }
        );
      }

      if (!caller.isStreamer) {
        return NextResponse.json(
          { error: 'Forbidden: Insufficient privileges. Normal players cannot broadcast.' },
          { status: 403, headers: getCorsHeaders(request, rateLimitHeaders) }
        );
      }

      // Match-Level Streamer Assignment Enforcement:
      // Streamers (who are not Admins) MUST be explicitly assigned to this match in public.match_streamer_assignments
      if (!caller.isAdmin && !caller.isSuperAdmin) {
        if (!matchRecord) {
          return NextResponse.json(
            { error: 'Forbidden: Streamers can only broadcast to verified active matches.' },
            { status: 403, headers: getCorsHeaders(request, rateLimitHeaders) }
          );
        }

        const adminDb = createAdminClient();
        try {
          const { data: assignment, error: assignErr } = await (adminDb
            .from('match_streamer_assignments') as any)
            .select('id')
            .eq('match_id', matchRecord.id)
            .eq('streamer_id', caller.userId)
            .maybeSingle();

          if (assignErr || !assignment) {
            return NextResponse.json(
              { error: 'Forbidden: You are not assigned to broadcast this match.' },
              { status: 403, headers: getCorsHeaders(request, rateLimitHeaders) }
            );
          }
        } catch (assignCheckErr) {
          console.warn('[LiveKit Token] Streamer assignment check error:', assignCheckErr);
          return NextResponse.json(
            { error: 'Forbidden: Unable to verify streamer match assignment.' },
            { status: 403, headers: getCorsHeaders(request, rateLimitHeaders) }
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
          { status: 401, headers: getCorsHeaders(request, rateLimitHeaders) }
        );
      }

      if (caller.accountStatus !== 'active') {
        return NextResponse.json(
          { error: `Forbidden: Account is currently ${caller.accountStatus}. Moderation is disabled.` },
          { status: 403, headers: getCorsHeaders(request, rateLimitHeaders) }
        );
      }

      if (!caller.isModerator) {
        return NextResponse.json(
          { error: 'Forbidden: Insufficient privileges for moderator access.' },
          { status: 403, headers: getCorsHeaders(request, rateLimitHeaders) }
        );
      }

      grantedRole = 'moderator';
      canPublish = false;
      canPublishData = true;
    } else {
      // Default to viewer for all users (including anonymous visitors & players)
      // Enforce private tournament access control:
      if (isPrivateTournament && matchRecord) {
        // 1. Anonymous viewers are strictly blocked from private tournament matches
        if (!caller.isAuthenticated || !caller.userId) {
          return NextResponse.json(
            { error: 'Unauthorized: Authentication required to view private tournament match.' },
            { status: 401, headers: getCorsHeaders(request, rateLimitHeaders) }
          );
        }

        // 2. Administrators are always authorized
        let isAuthorizedViewer = caller.isAdmin || caller.isSuperAdmin;

        // 3. Match participants are authorized
        if (!isAuthorizedViewer) {
          if (
            caller.userId === matchRecord.participant_a ||
            caller.userId === matchRecord.participant_b
          ) {
            isAuthorizedViewer = true;
          }
        }

        // 4. Tournament participants (in participants table) are authorized
        if (!isAuthorizedViewer && matchRecord.tournament_id) {
          try {
            const adminDb = createAdminClient();
            const { data: participantRecord } = await (adminDb.from('participants') as any)
              .select('id')
              .eq('tournament_id', matchRecord.tournament_id)
              .eq('user_id', caller.userId)
              .maybeSingle();

            if (participantRecord) {
              isAuthorizedViewer = true;
            }
          } catch (partErr) {
            console.warn('[LiveKit Token] Participant authorization check warning:', partErr);
          }
        }

        // 5. Cryptographically signed tournament access cookie verification
        if (!isAuthorizedViewer && matchRecord.tournament_id) {
          const cookieName = getTournamentCookieName(matchRecord.tournament_id);
          const cookieVal = getCookieFromRequest(request, cookieName);
          if (cookieVal) {
            const verification = verifySignedTournamentAccessToken(
              cookieVal,
              matchRecord.tournament_id,
              tournamentAccessCodeHash
            );
            if (verification.valid) {
              isAuthorizedViewer = true;
            }
          }
        }

        if (!isAuthorizedViewer) {
          return NextResponse.json(
            { error: 'Forbidden: You do not have access to view this private tournament match.' },
            { status: 403, headers: getCorsHeaders(request, rateLimitHeaders) }
          );
        }
      }

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

    // Validate LiveKit server credentials before minting token
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const wsUrl = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL;

    if (!apiKey || !apiSecret || !wsUrl) {
      return NextResponse.json(
        { error: 'LiveKit server configuration is incomplete.' },
        { status: 500, headers: getCorsHeaders(request, rateLimitHeaders) }
      );
    }

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
      { headers: getCorsHeaders(request, rateLimitHeaders) }
    );
  } catch (error: unknown) {
    console.error('Error generating LiveKit token:', error);
    const message =
      process.env.NODE_ENV === 'production'
        ? 'Failed to generate live streaming token.'
        : error instanceof Error
        ? error.message
        : 'Internal server error';
    return NextResponse.json(
      { error: message },
      { status: 500, headers: getCorsHeaders(request, rateLimitHeaders) }
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
