import { NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const room = body.room || 'efootball-live-test';
    const identity = body.identity || `user-${Math.random().toString(36).substring(2, 9)}`;
    const role = body.role || 'viewer'; // 'viewer' or 'broadcaster'

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const wsUrl = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL || 'wss://efootball-tournament-pic0fkvb.livekit.cloud';

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { error: 'LiveKit API Key or API Secret missing from server environment.' },
        { status: 500 }
      );
    }

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

    return NextResponse.json({
      token,
      url: wsUrl,
      room,
      identity,
    });
  } catch (error: unknown) {
    console.error('Error generating LiveKit token:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const room = searchParams.get('room') || 'efootball-live-test';
  const identity = searchParams.get('identity') || `user-${Math.random().toString(36).substring(2, 9)}`;
  const role = searchParams.get('role') || 'viewer';

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const wsUrl = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL || 'wss://efootball-tournament-pic0fkvb.livekit.cloud';

  if (!apiKey || !apiSecret) {
    return NextResponse.json(
      { error: 'LiveKit API Key or API Secret missing from server environment.' },
      { status: 500 }
    );
  }

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

  return NextResponse.json({
    token,
    url: wsUrl,
    room,
    identity,
  });
}
