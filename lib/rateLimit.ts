import { NextResponse, type NextRequest } from 'next/server';

export interface RateLimitRule {
  limit: number;
  windowSeconds: number;
}

// Default rate limits per endpoint category
export const RATE_LIMIT_RULES: Record<string, RateLimitRule> = {
  auth: { limit: 10, windowSeconds: 60 },         // 10 requests / min for login/auth
  tokens: { limit: 30, windowSeconds: 60 },       // 30 requests / min for LiveKit token generation
  predictions: { limit: 20, windowSeconds: 60 },  // 20 requests / min for prediction submissions
  admin: { limit: 60, windowSeconds: 60 },        // 60 requests / min for admin APIs
  api: { limit: 120, windowSeconds: 60 },         // 120 requests / min for general APIs
  health: { limit: 300, windowSeconds: 60 },      // 300 requests / min for health checks
};

// In-memory sliding window cache per node
const memoryStore = new Map<string, { count: number; resetTime: number }>();

// Periodic memory cleanup every 60 seconds
if (typeof setInterval !== 'undefined') {
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, val] of memoryStore.entries()) {
      if (now > val.resetTime) {
        memoryStore.delete(key);
      }
    }
  }, 60000);
  if (cleanupTimer.unref) cleanupTimer.unref();
}

/**
 * Extracts client IP from incoming request headers
 */
export function getClientIp(request: NextRequest | Request): string {
  const headers = request.headers;
  const cfIp = headers.get('cf-connecting-ip');
  if (cfIp) return cfIp.trim();

  const vercelIp = headers.get('x-vercel-forwarded-for');
  if (vercelIp) return vercelIp.split(',')[0].trim();

  const xForwardedFor = headers.get('x-forwarded-for');
  if (xForwardedFor) return xForwardedFor.split(',')[0].trim();

  const xRealIp = headers.get('x-real-ip');
  if (xRealIp) return xRealIp.trim();

  return '127.0.0.1';
}

/**
 * Checks rate limit for a given key and rule
 */
export function checkRateLimit(
  key: string,
  rule: RateLimitRule
): {
  success: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
} {
  const now = Date.now();
  const windowMs = rule.windowSeconds * 1000;
  const record = memoryStore.get(key);

  if (!record || now > record.resetTime) {
    memoryStore.set(key, {
      count: 1,
      resetTime: now + windowMs,
    });
    return {
      success: true,
      limit: rule.limit,
      remaining: rule.limit - 1,
      resetSeconds: rule.windowSeconds,
    };
  }

  record.count += 1;
  const resetSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
  const remaining = Math.max(0, rule.limit - record.count);

  if (record.count > rule.limit) {
    return {
      success: false,
      limit: rule.limit,
      remaining: 0,
      resetSeconds,
    };
  }

  return {
    success: true,
    limit: rule.limit,
    remaining,
    resetSeconds,
  };
}

/**
 * Generates standard rate limit headers
 */
export function buildRateLimitHeaders(result: {
  limit: number;
  remaining: number;
  resetSeconds: number;
}): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(result.resetSeconds),
  };
}

/**
 * Helper to build 429 Too Many Requests response
 */
export function createRateLimitErrorResponse(result: {
  limit: number;
  remaining: number;
  resetSeconds: number;
}): NextResponse {
  const headers = {
    ...buildRateLimitHeaders(result),
    'Retry-After': String(result.resetSeconds),
    'Content-Type': 'application/json',
  };

  return NextResponse.json(
    {
      error: 'Too many requests. Please slow down and try again.',
      retryAfterSeconds: result.resetSeconds,
    },
    {
      status: 429,
      headers,
    }
  );
}
