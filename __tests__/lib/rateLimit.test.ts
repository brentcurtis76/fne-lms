/**
 * Unit tests for lib/rateLimit.ts
 * Tests rate limiting middleware functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import { rateLimit, withRateLimit, withMethodRateLimit, RATE_LIMITS } from '../../lib/rateLimit';

// Mock request/response objects
function createMockRequest(overrides: Partial<NextApiRequest> = {}): NextApiRequest {
  return {
    headers: {},
    socket: { remoteAddress: '192.168.1.100' },
    url: '/api/test',
    method: 'GET',
    ...overrides,
  } as NextApiRequest;
}

function createMockResponse(): NextApiResponse & { _status: number; _json: any; _headers: Record<string, any> } {
  const res = {
    _status: 200,
    _json: null,
    _headers: {} as Record<string, any>,
    status(code: number) {
      this._status = code;
      return this;
    },
    json(data: any) {
      this._json = data;
      return this;
    },
    setHeader(key: string, value: any) {
      this._headers[key] = value;
      return this;
    },
  };
  return res as any;
}

describe('RATE_LIMITS configurations', () => {
  it('should have auth configuration', () => {
    expect(RATE_LIMITS.auth).toEqual({
      limit: 10,
      windowMs: 60 * 1000,
    });
  });

  it('should have api configuration', () => {
    expect(RATE_LIMITS.api).toEqual({
      limit: 30,
      windowMs: 60 * 1000,
    });
  });

  it('should have readonly configuration', () => {
    expect(RATE_LIMITS.readonly).toEqual({
      limit: 60,
      windowMs: 60 * 1000,
    });
  });

  it('should have expensive configuration', () => {
    expect(RATE_LIMITS.expensive).toEqual({
      limit: 5,
      windowMs: 60 * 1000,
    });
  });
});

describe('rateLimit middleware', () => {
  beforeEach(() => {
    // Reset rate limit cache between tests
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should allow requests under the limit', async () => {
    const rateLimitCheck = rateLimit({ limit: 5, windowMs: 60000 }, 'test-endpoint');
    const req = createMockRequest();
    const res = createMockResponse();

    const result = await rateLimitCheck(req, res);
    expect(result).toBe(true);
  });

  it('should set rate limit headers', async () => {
    const rateLimitCheck = rateLimit({ limit: 5, windowMs: 60000 }, 'test-headers');
    const req = createMockRequest();
    const res = createMockResponse();

    await rateLimitCheck(req, res);

    expect(res._headers['X-RateLimit-Limit']).toBe(5);
    expect(res._headers['X-RateLimit-Remaining']).toBe(4);
    expect(res._headers['X-RateLimit-Reset']).toBeDefined();
  });

  it('should block requests over the limit', async () => {
    const rateLimitCheck = rateLimit({ limit: 2, windowMs: 60000 }, 'test-block');
    const req = createMockRequest({ headers: { 'x-forwarded-for': '10.0.0.1' } });
    const res = createMockResponse();

    // First two requests should pass
    expect(await rateLimitCheck(req, res)).toBe(true);
    expect(await rateLimitCheck(req, createMockResponse())).toBe(true);

    // Third request should be blocked
    const res3 = createMockResponse();
    expect(await rateLimitCheck(req, res3)).toBe(false);
    expect(res3._status).toBe(429);
    expect(res3._json.error).toContain('Demasiadas solicitudes');
  });

  it('should reset after window expires', async () => {
    const rateLimitCheck = rateLimit({ limit: 2, windowMs: 60000 }, 'test-reset');
    const req = createMockRequest({ headers: { 'x-forwarded-for': '10.0.0.2' } });

    // Use up the limit
    await rateLimitCheck(req, createMockResponse());
    await rateLimitCheck(req, createMockResponse());

    // Should be blocked
    const res1 = createMockResponse();
    expect(await rateLimitCheck(req, res1)).toBe(false);

    // Advance time past window
    vi.advanceTimersByTime(61000);

    // Should be allowed again
    const res2 = createMockResponse();
    expect(await rateLimitCheck(req, res2)).toBe(true);
  });

  it('should track different IPs separately', async () => {
    const rateLimitCheck = rateLimit({ limit: 1, windowMs: 60000 }, 'test-ips');

    const req1 = createMockRequest({ headers: { 'x-forwarded-for': '10.0.0.10' } });
    const req2 = createMockRequest({ headers: { 'x-forwarded-for': '10.0.0.11' } });

    // First IP - first request passes
    expect(await rateLimitCheck(req1, createMockResponse())).toBe(true);
    // First IP - second request blocked
    expect(await rateLimitCheck(req1, createMockResponse())).toBe(false);

    // Second IP - first request should still pass
    expect(await rateLimitCheck(req2, createMockResponse())).toBe(true);
  });

  it('should track different endpoints separately', async () => {
    const rateLimitCheck1 = rateLimit({ limit: 1, windowMs: 60000 }, 'endpoint-1');
    const rateLimitCheck2 = rateLimit({ limit: 1, windowMs: 60000 }, 'endpoint-2');

    const req = createMockRequest({ headers: { 'x-forwarded-for': '10.0.0.20' } });

    // Endpoint 1 - first request passes
    expect(await rateLimitCheck1(req, createMockResponse())).toBe(true);
    // Endpoint 1 - second request blocked
    expect(await rateLimitCheck1(req, createMockResponse())).toBe(false);

    // Endpoint 2 - first request should still pass (different endpoint)
    expect(await rateLimitCheck2(req, createMockResponse())).toBe(true);
  });
});

describe('IP extraction', () => {
  it('should use x-forwarded-for header when present', async () => {
    const rateLimitCheck = rateLimit({ limit: 1, windowMs: 60000 }, 'ip-test-1');
    const req = createMockRequest({
      headers: { 'x-forwarded-for': '203.0.113.50, 198.51.100.178' },
    });
    const res = createMockResponse();

    await rateLimitCheck(req, res);

    // First request passes
    expect(res._status).toBe(200);
  });

  it('should use x-real-ip header as fallback', async () => {
    const rateLimitCheck = rateLimit({ limit: 1, windowMs: 60000 }, 'ip-test-2');
    const req = createMockRequest({
      headers: { 'x-real-ip': '203.0.113.51' },
    });
    const res = createMockResponse();

    await rateLimitCheck(req, res);

    expect(res._status).toBe(200);
  });

  it('should use socket remoteAddress as last fallback', async () => {
    const rateLimitCheck = rateLimit({ limit: 1, windowMs: 60000 }, 'ip-test-3');
    const req = createMockRequest({
      headers: {},
      socket: { remoteAddress: '203.0.113.52' },
    });
    const res = createMockResponse();

    await rateLimitCheck(req, res);

    expect(res._status).toBe(200);
  });
});

describe('withRateLimit HOF', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should call handler when under limit', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const wrappedHandler = withRateLimit(handler, { limit: 5, windowMs: 60000 }, 'hof-test');

    const req = createMockRequest({ headers: { 'x-forwarded-for': '10.0.0.30' } });
    const res = createMockResponse();

    await wrappedHandler(req, res);

    expect(handler).toHaveBeenCalledWith(req, res);
  });

  it('should not call handler when over limit', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const wrappedHandler = withRateLimit(handler, { limit: 1, windowMs: 60000 }, 'hof-test-2');

    const req = createMockRequest({ headers: { 'x-forwarded-for': '10.0.0.31' } });

    // First request - handler called
    await wrappedHandler(req, createMockResponse());
    expect(handler).toHaveBeenCalledTimes(1);

    // Second request - handler NOT called
    const res2 = createMockResponse();
    await wrappedHandler(req, res2);
    expect(handler).toHaveBeenCalledTimes(1); // Still 1
    expect(res2._status).toBe(429);
  });
});

describe('withMethodRateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should apply different limits per method', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const wrappedHandler = withMethodRateLimit(
      handler,
      {
        GET: { limit: 10, windowMs: 60000 },
        POST: { limit: 2, windowMs: 60000 },
      },
      { limit: 5, windowMs: 60000 },
      'method-test'
    );

    const getReq = createMockRequest({ method: 'GET', headers: { 'x-forwarded-for': '10.0.0.40' } });
    const postReq = createMockRequest({ method: 'POST', headers: { 'x-forwarded-for': '10.0.0.41' } });

    // POST has limit of 2
    await wrappedHandler(postReq, createMockResponse());
    await wrappedHandler(postReq, createMockResponse());
    const postRes3 = createMockResponse();
    await wrappedHandler(postReq, postRes3);
    expect(postRes3._status).toBe(429);

    // GET has limit of 10, should still work
    const getRes = createMockResponse();
    await wrappedHandler(getReq, getRes);
    expect(getRes._status).toBe(200);
  });

  it('should use default limit for unspecified methods', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const wrappedHandler = withMethodRateLimit(
      handler,
      { POST: { limit: 2, windowMs: 60000 } },
      { limit: 5, windowMs: 60000 }, // Default
      'method-test-2'
    );

    const req = createMockRequest({ method: 'PUT', headers: { 'x-forwarded-for': '10.0.0.42' } });

    // PUT should use default limit of 5
    for (let i = 0; i < 5; i++) {
      await wrappedHandler(req, createMockResponse());
    }

    const res = createMockResponse();
    await wrappedHandler(req, res);
    expect(res._status).toBe(429);
  });
});

describe('Rate limit response format', () => {
  it('should return Spanish error message', async () => {
    const rateLimitCheck = rateLimit({ limit: 1, windowMs: 60000 }, 'spanish-test');
    const req = createMockRequest({ headers: { 'x-forwarded-for': '10.0.0.50' } });

    await rateLimitCheck(req, createMockResponse());
    const res = createMockResponse();
    await rateLimitCheck(req, res);

    expect(res._json.error).toBe('Demasiadas solicitudes. Por favor, intente de nuevo más tarde.');
  });

  it('should include retryAfter in response', async () => {
    const rateLimitCheck = rateLimit({ limit: 1, windowMs: 60000 }, 'retry-test');
    const req = createMockRequest({ headers: { 'x-forwarded-for': '10.0.0.51' } });

    await rateLimitCheck(req, createMockResponse());
    const res = createMockResponse();
    await rateLimitCheck(req, res);

    expect(res._json.retryAfter).toBeDefined();
    expect(typeof res._json.retryAfter).toBe('number');
    expect(res._headers['Retry-After']).toBeDefined();
  });
});
