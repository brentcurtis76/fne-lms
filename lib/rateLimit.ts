/**
 * Rate Limiting Middleware for API Routes
 *
 * Uses LRU cache to track request counts per IP address.
 * Provides different rate limits for auth vs general API endpoints.
 */

import { LRUCache } from 'lru-cache';
import type { NextApiRequest, NextApiResponse } from 'next';
import { logSecurityIncident } from './securityAuditLog';

// Rate limit configuration
interface RateLimitConfig {
  // Maximum number of requests allowed in the window
  limit: number;
  // Time window in milliseconds
  windowMs: number;
}

// Preset configurations
export const RATE_LIMITS = {
  // Stricter limit for authentication endpoints
  auth: {
    limit: 10,
    windowMs: 60 * 1000, // 10 requests per minute
  },
  // Standard API rate limit
  api: {
    limit: 30,
    windowMs: 60 * 1000, // 30 requests per minute
  },
  // Relaxed limit for read-only endpoints
  readonly: {
    limit: 60,
    windowMs: 60 * 1000, // 60 requests per minute
  },
  // Very strict limit for expensive operations
  expensive: {
    limit: 5,
    windowMs: 60 * 1000, // 5 requests per minute
  },
} as const;

// Token bucket entry
interface TokenBucket {
  count: number;
  resetTime: number;
}

// Create a cache for rate limiting tokens
// Key: IP address + endpoint
// Value: TokenBucket
const rateLimitCache = new LRUCache<string, TokenBucket>({
  max: 10000, // Maximum 10k unique IPs/endpoints
  ttl: 60 * 60 * 1000, // Entries expire after 1 hour
});

/**
 * Get the client's IP address from the request
 */
function getClientIp(req: NextApiRequest): string {
  // Check various headers that might contain the real IP
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // x-forwarded-for can contain multiple IPs, take the first one
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return ips.split(',')[0].trim();
  }

  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }

  // Fall back to socket remote address
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Check if a request should be rate limited
 *
 * M-2 FIX: Atomic read-modify-write to prevent race conditions.
 * The operation is now performed in a single logical step where
 * we read, compute the new state, and write atomically.
 */
function checkRateLimit(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const existing = rateLimitCache.get(key);

  // M-2 FIX: Compute new state atomically based on current state
  if (!existing || now > existing.resetTime) {
    // Create new bucket or reset expired one
    const newBucket: TokenBucket = {
      count: 1,
      resetTime: now + config.windowMs,
    };
    rateLimitCache.set(key, newBucket);
    return {
      allowed: true,
      remaining: config.limit - 1,
      resetTime: newBucket.resetTime,
    };
  }

  // M-2 FIX: Compute new count before any conditional logic
  const newCount = existing.count + 1;

  if (newCount > config.limit) {
    // Rate limit exceeded - don't increment, just reject
    return {
      allowed: false,
      remaining: 0,
      resetTime: existing.resetTime,
    };
  }

  // M-2 FIX: Create new bucket object (immutable update pattern)
  const updatedBucket: TokenBucket = {
    count: newCount,
    resetTime: existing.resetTime,
  };
  rateLimitCache.set(key, updatedBucket);

  return {
    allowed: true,
    remaining: config.limit - newCount,
    resetTime: existing.resetTime,
  };
}

/**
 * Rate limit middleware factory
 *
 * @param config - Rate limit configuration (use RATE_LIMITS presets)
 * @param identifier - Optional custom identifier for the endpoint
 */
export function rateLimit(
  config: RateLimitConfig = RATE_LIMITS.api,
  identifier?: string
) {
  return async function rateLimitMiddleware(
    req: NextApiRequest,
    res: NextApiResponse
  ): Promise<boolean> {
    const ip = getClientIp(req);
    const endpoint = identifier || req.url || 'unknown';
    const key = `${ip}:${endpoint}`;

    const result = checkRateLimit(key, config);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', config.limit);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000));

    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);
      res.setHeader('Retry-After', retryAfter);

      // Log security incident for rate limit exceeded
      logSecurityIncident('RATE_LIMIT_EXCEEDED', {
        req,
        details: {
          endpoint,
          limit: config.limit,
          windowMs: config.windowMs,
          retryAfter,
        },
      });

      res.status(429).json({
        error: 'Demasiadas solicitudes. Por favor, intente de nuevo más tarde.',
        retryAfter,
      });
      return false;
    }

    return true;
  };
}

/**
 * Higher-order function to wrap an API handler with rate limiting
 */
export function withRateLimit(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>,
  config: RateLimitConfig = RATE_LIMITS.api,
  identifier?: string
) {
  const rateLimitCheck = rateLimit(config, identifier);

  return async function rateLimitedHandler(
    req: NextApiRequest,
    res: NextApiResponse
  ) {
    const allowed = await rateLimitCheck(req, res);
    if (!allowed) {
      return; // Response already sent by rate limiter
    }
    return handler(req, res);
  };
}

/**
 * Apply rate limiting to specific methods only
 */
export function withMethodRateLimit(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>,
  methodLimits: Partial<Record<string, RateLimitConfig>>,
  defaultConfig: RateLimitConfig = RATE_LIMITS.api,
  identifier?: string
) {
  return async function methodRateLimitedHandler(
    req: NextApiRequest,
    res: NextApiResponse
  ) {
    const method = req.method?.toUpperCase() || 'GET';
    const config = methodLimits[method] || defaultConfig;
    const rateLimitCheck = rateLimit(config, identifier);

    const allowed = await rateLimitCheck(req, res);
    if (!allowed) {
      return;
    }
    return handler(req, res);
  };
}

export default {
  rateLimit,
  withRateLimit,
  withMethodRateLimit,
  RATE_LIMITS,
};
