import { NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: getCorsHeaders() });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawRoom = body.room || 'efootball-live-test';
    const rawIdentity = body.identity || `user-${Math.random().toString(36).substring(2, 9)}`;
    const role = body.role || 'viewer';

    const sanitizedRoom = String(rawRoom).replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 64) || 'efootball-live-test';
    const sanitizedIdentity = String(rawIdentity).replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 64) || `user-${Math.random().toString(36).substring(2, 9)}`;

    const apiKey = process.env.LIVEKIT_API_KEY || 'API57Y48Vmbn4nm';
    const apiSecret = process.env.LIVEKIT_API_SECRET || 'rkpn1ViaYdplx5TZzAc0NTlSQeSZimM7YYYMrghaY7C';
    const wsUrl = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL || 'wss://efootball-tournament-pic0fkvb.livekit.cloud';

    // Broadcaster role is allowed ONLY when broadcaster secret header or environment key matches
    const broadcasterSecretHeader = request.headers.get('x-broadcaster-secret');
    const isAuthorizedBroadcaster = role === 'broadcaster' && (
      Boolean(process.env.BROADCASTER_SECRET) && broadcasterSecretHeader === process.env.BROADCASTER_SECRET
    );

    const at = new AccessToken(apiKey, apiSecret, {
      identity: sanitizedIdentity,
      name: sanitizedIdentity,
      ttl: '4h',
    });

    at.addGrant({
      room: sanitizedRoom,
      roomJoin: true,
      canSubscribe: true,
      canPublish: isAuthorizedBroadcaster,
      canPublishData: isAuthorizedBroadcaster,
    });

    const token = await at.toJwt();

    return NextResponse.json(
      {
        token,
        url: wsUrl,
        room: sanitizedRoom,
        identity: sanitizedIdentity,
      },
      { headers: getCorsHeaders() }
    );
  } catch (error: unknown) {
    console.error('Error generating LiveKit token:', error);
    return NextResponse.json({ error: 'Failed to generate token.' }, { status: 500, headers: getCorsHeaders() });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawRoom = searchParams.get('room') || 'efootball-live-test';
    const rawIdentity = searchParams.get('identity') || `user-${Math.random().toString(36).substring(2, 9)}`;

    const sanitizedRoom = String(rawRoom).replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 64) || 'efootball-live-test';
    const sanitizedIdentity = String(rawIdentity).replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 64) || `user-${Math.random().toString(36).substring(2, 9)}`;

    const apiKey = process.env.LIVEKIT_API_KEY || 'API57Y48Vmbn4nm';
    const apiSecret = process.env.LIVEKIT_API_SECRET || 'rkpn1ViaYdplx5TZzAc0NTlSQeSZimM7YYYMrghaY7C';
    const wsUrl = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL || 'wss://efootball-tournament-pic0fkvb.livekit.cloud';

    const at = new AccessToken(apiKey, apiSecret, {
      identity: sanitizedIdentity,
      name: sanitizedIdentity,
      ttl: '4h',
    });

    at.addGrant({
      room: sanitizedRoom,
      roomJoin: true,
      canSubscribe: true,
      canPublish: false,
      canPublishData: false,
    });

    const token = await at.toJwt();

    return NextResponse.json(
      {
        token,
        url: wsUrl,
        room: sanitizedRoom,
        identity: sanitizedIdentity,
      },
      { headers: getCorsHeaders() }
    );
  } catch (error: unknown) {
    console.error('Error generating LiveKit token:', error);
    return NextResponse.json({ error: 'Failed to generate token.' }, { status: 500, headers: getCorsHeaders() });
  }
}
