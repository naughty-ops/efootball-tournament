import { NextResponse } from 'next/server';
import { testSupabaseConnection } from '@/lib/supabase/test-connection';
import { checkRateLimit, getClientIp, RATE_LIMIT_RULES, createRateLimitErrorResponse, buildRateLimitHeaders } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Isolated Database Health Check Endpoint
 * Dedicated endpoint to test Supabase database connectivity without polluting light load-balancer health checks.
 */
export async function GET(request: Request) {
  const ip = getClientIp(request);
  const rateLimitResult = checkRateLimit(`health_db_${ip}`, RATE_LIMIT_RULES.tokens);

  if (!rateLimitResult.success) {
    return createRateLimitErrorResponse(rateLimitResult);
  }

  const testResult = await testSupabaseConnection();
  const status = testResult.success ? 200 : 500;

  return NextResponse.json(
    {
      status: testResult.success ? 'ok' : 'degraded',
      database: testResult,
      timestamp: new Date().toISOString(),
    },
    {
      status,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        ...buildRateLimitHeaders(rateLimitResult),
      },
    }
  );
}
