import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIp, RATE_LIMIT_RULES, createRateLimitErrorResponse, buildRateLimitHeaders } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Lightweight Load-Balancer Health Check Endpoint
 * Highly performant: Returns instant status < 2ms without querying Supabase DB
 */
export async function GET(request: Request) {
  const ip = getClientIp(request);
  const rateLimitResult = checkRateLimit(`health_${ip}`, RATE_LIMIT_RULES.health);

  if (!rateLimitResult.success) {
    return createRateLimitErrorResponse(rateLimitResult);
  }

  const healthData = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || 'production',
    service: 'efootball-tournament-platform',
    version: '1.0.0',
  };

  return NextResponse.json(healthData, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Health-Check': 'passed',
      ...buildRateLimitHeaders(rateLimitResult),
    },
  });
}
