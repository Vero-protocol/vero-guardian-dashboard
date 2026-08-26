/**
 * In-memory rate limiter for Next.js App Router route handlers.
 *
 * Mirrors the conventions used by express-rate-limit in index.js:
 *   - 60-second sliding window (configurable)
 *   - In-memory store (Map), no external dependency
 *   - standardHeaders: RateLimit-Limit / RateLimit-Remaining / RateLimit-Reset
 *   - legacyHeaders: off (no X-RateLimit-* headers)
 *   - Response body: { error: 'Too many requests' }
 *
 * Usage:
 *   const limiter = createRateLimiter({ limit: 10 });
 *   const limited = await limiter(request);
 *   if (limited) return limited; // NextResponse with 429
 */

import { NextResponse } from 'next/server';

export interface RateLimiterOptions {
  /** Maximum requests allowed within the window. */
  limit: number;
  /** Window duration in milliseconds. Defaults to 60 000 (1 minute). */
  windowMs?: number;
}

interface HitRecord {
  count: number;
  /** Timestamp (ms) when this window resets. */
  resetAt: number;
}

/**
 * Extracts the best-effort client IP from a Request.
 *
 * In production Next.js deployments (Vercel, behind a proxy) the real client
 * IP arrives via the `x-forwarded-for` header; `request.ip` is not reliably
 * populated across all runtimes.  We take only the first (leftmost) value to
 * avoid IP-spoofing via a forged header chain.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // x-forwarded-for can be "client, proxy1, proxy2" — take the leftmost entry
    return forwarded.split(',')[0].trim();
  }
  // Fallback: unknown (still bucket together rather than skip limiting)
  return 'unknown';
}

/**
 * Creates a rate limiter function bound to its own in-memory store.
 * Each call to createRateLimiter produces an independent store, so
 * different routes do not share counters.
 */
export function createRateLimiter(options: RateLimiterOptions) {
  const { limit, windowMs = 60_000 } = options;
  const store = new Map<string, HitRecord>();

  return function rateLimiter(request: Request): NextResponse | null {
    const ip = getClientIp(request);
    const now = Date.now();

    let record = store.get(ip);

    // Start a fresh window if this is the first hit or the previous window expired
    if (!record || now >= record.resetAt) {
      record = { count: 1, resetAt: now + windowMs };
      store.set(ip, record);
    } else {
      record.count += 1;
    }

    const remaining = Math.max(0, limit - record.count);
    // Retry-After in whole seconds, matching RFC 7231
    const retryAfterSeconds = Math.ceil((record.resetAt - now) / 1000);

    const headers: Record<string, string> = {
      // Standard rate-limit headers (draft-ietf-httpapi-ratelimit-headers)
      'RateLimit-Limit': String(limit),
      'RateLimit-Remaining': String(remaining),
      'RateLimit-Reset': String(retryAfterSeconds),
    };

    if (record.count > limit) {
      headers['Retry-After'] = String(retryAfterSeconds);
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers },
      );
    }

    return null; // request is within limit — proceed normally
  };
}
