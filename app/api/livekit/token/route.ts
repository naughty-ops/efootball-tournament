import { NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_LIVEKIT_URL = 'wss://efootball-tournament-pic0fkvb.livekit.cloud';
const DEFAULT_API_KEY = 'API57Y48Vmbn4nm';
const DEFAULT_API_SECRET = 'rkpn1ViaYdplx5TZzAc0NTlSQeSZimM7YYYMrghaY7C';

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
    const room = body.room || 'efootball-live-test';
    const identity = body.identity || `user-${Math.random().toString(36).substring(2, 9)}`;
    const role = body.role || 'viewer';

    const apiKey = process.env.LIVEKIT_API_KEY || DEFAULT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET || DEFAULT_API_SECRET;
    const wsUrl = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL || DEFAULT_LIVEKIT_URL;

    const isBroadcaster = role === 'broadcaster';

    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      name: identity,
      ttl: '4h',
    });

    at.addGrant({
      room,
      roomJoin: true,
      canSubscribe: true,
      canPublish: isBroadcaster,
      canPublishData: isBroadcaster,
    });

    const token = await at.toJwt();

    return NextResponse.json(
      {
        token,
        url: wsUrl,
        room,
        identity,
      },
      { headers: getCorsHeaders() }
    );
  } catch (error: unknown) {
    console.error('Error generating LiveKit token:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500, headers: getCorsHeaders() });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const room = searchParams.get('room') || 'efootball-live-test';
    const identity = searchParams.get('identity') || `user-${Math.random().toString(36).substring(2, 9)}`;
    const role = searchParams.get('role') || 'viewer';

    const apiKey = process.env.LIVEKIT_API_KEY || DEFAULT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET || DEFAULT_API_SECRET;
    const wsUrl = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL || DEFAULT_LIVEKIT_URL;

    const isBroadcaster = role === 'broadcaster';

    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      name: identity,
      ttl: '4h',
    });

    at.addGrant({
      room,
      roomJoin: true,
      canSubscribe: true,
      canPublish: isBroadcaster,
      canPublishData: isBroadcaster,
    });

    const token = await at.toJwt();

    return NextResponse.json(
      {
        token,
        url: wsUrl,
        room,
        identity,
      },
      { headers: getCorsHeaders() }
    );
  } catch (error: unknown) {
    console.error('Error generating LiveKit token:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500, headers: getCorsHeaders() });
  }
}
