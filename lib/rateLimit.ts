import { NextResponse, type NextRequest } from 'next/server';

export interface RateLimitRule {
  limit: number;
  windowSeconds: number;
}

// Default rate limits per endpoint category
export const RATE_LIMIT_RULES: Record<string, RateLimitRule> = {
  auth: { limit: 15, windowSeconds: 60 },         // 15 requests / min for auth mutations/attempts
  authPageNav: { limit: 120, windowSeconds: 60 }, // 120 requests / min for browsing auth pages on shared IPs
  authAccount: { limit: 5, windowSeconds: 60 },   // 5 attempts / min targeting same account
  tokens: { limit: 30, windowSeconds: 60 },       // 30 requests / min for LiveKit token generation
  predictions: { limit: 20, windowSeconds: 60 },  // 20 requests / min for prediction submissions
  admin: { limit: 300, windowSeconds: 60 },       // 300 requests / min for admin operations and testing
  api: { limit: 120, windowSeconds: 60 },         // 120 requests / min for general APIs
  health: { limit: 300, windowSeconds: 60 },      // 300 requests / min for health checks
};

/**
 * Detects whether an incoming request is an automated Next.js prefetch or speculative load.
 * Prefetches must never consume authentication or security quotas.
 */
export function isPrefetchRequest(request: NextRequest | Request): boolean {
  const headers = request.headers;
  const purpose = headers.get('purpose');
  const secPurpose = headers.get('sec-purpose');
  const nextRouterPrefetch = headers.get('next-router-prefetch');
  const xNextjsData = headers.get('x-nextjs-data');
  const xMiddlewarePrefetch = headers.get('x-middleware-prefetch');
  return (
    purpose === 'prefetch' ||
    secPurpose === 'prefetch' ||
    nextRouterPrefetch === '1' ||
    xNextjsData !== null ||
    xMiddlewarePrefetch === '1'
  );
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

// In-memory sliding window cache per serverless isolate
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
 * Synchronous in-memory rate limit check (used by middleware or sync callers).
 */
export function checkRateLimit(
  key: string,
  rule: RateLimitRule
): RateLimitResult {
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

let hasWarnedMissingRedis = false;

/**
 * Distributed rate limiter with Upstash Redis REST support and transparent in-memory fallback.
 * Uses atomic INCR with EXPIRE pipeline over native HTTPS.
 * - If UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are present, rates are tracked globally
 *   across all serverless isolates.
 * - If absent, it emits a server-side warning and falls back to process-local in-memory tracking.
 * - Policy: Fail-open to local in-memory store if Redis is unavailable or times out (>800ms) to maintain uptime.
 */
export async function checkRateLimitAsync(
  key: string,
  rule: RateLimitRule
): Promise<RateLimitResult> {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  // If Upstash Redis is not configured, warn and use non-distributed process-memory store
  if (!redisUrl || !redisToken) {
    if (!hasWarnedMissingRedis) {
      console.warn(
        '[RateLimit Warning] UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN is not configured. ' +
        'Falling back to non-distributed process-local memory store. Multi-instance serverless deployments will NOT share rate limits.'
      );
      hasWarnedMissingRedis = true;
    }
    return checkRateLimit(key, rule);
  }

  try {
    const prefixedKey = `ratelimit:${key}`;
    // Truly atomic rate-limiting via Redis Lua script (EVAL)
    // Guarantees INCR and EXPIRE are executed atomically in a single Redis engine step.
    const redisEndpoint = redisUrl.replace(/\/$/, '');
    const luaScript = `
      local current = redis.call('INCR', KEYS[1])
      if tonumber(current) == 1 then
        redis.call('EXPIRE', KEYS[1], ARGV[1])
      end
      local ttl = redis.call('TTL', KEYS[1])
      return {current, ttl}
    `;

    const res = await fetch(redisEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${redisToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['EVAL', luaScript, '1', prefixedKey, String(rule.windowSeconds)]),
      // 800ms abort signal ensures external network latency never blocks user requests
      signal: AbortSignal.timeout(800),
    });

    if (!res.ok) {
      console.warn('[Distributed RateLimit] Upstash Redis returned HTTP status:', res.status);
      return checkRateLimit(key, rule);
    }

    const json = await res.json();
    const resultArr = Array.isArray(json?.result) ? json.result : [1, rule.windowSeconds];
    const count = Number(resultArr[0]) || 1;
    const ttlRaw = Number(resultArr[1]);
    const ttl = ttlRaw > 0 ? ttlRaw : rule.windowSeconds;

    const remaining = Math.max(0, rule.limit - count);
    const success = count <= rule.limit;

    return {
      success,
      limit: rule.limit,
      remaining,
      resetSeconds: ttl,
    };
  } catch (err) {
    console.warn('[Distributed RateLimit] Failed contacting Redis; falling back to process memory store:', err);
    return checkRateLimit(key, rule);
  }
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
