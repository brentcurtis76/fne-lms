// @vitest-environment node
/**
 * Unit tests for FX rate caching and endpoint behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import { getLatestFxRate } from '../../../lib/services/hour-tracking';

// ============================================================
// getLatestFxRate — direct service function tests (no module mock)
// ============================================================

describe('getLatestFxRate — cache is fresh', () => {
  it('should return cached rate without fetching from API when < 1 hour old', async () => {
    const freshTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago
    const mockClient = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            rate: 1050.5,
            fetched_at: freshTimestamp,
            source: 'https://api.exchangerate-api.com',
          },
          error: null,
        }),
      })),
    } as any;

    const result = await getLatestFxRate(mockClient);
    expect(result.rate_clp_per_eur).toBe(1050.5);
    expect(result.is_stale).toBe(false);
  });
});

describe('getLatestFxRate — cache is stale', () => {
  it('should return stale cached rate with is_stale=true when API is unreachable', async () => {
    const staleTimestamp = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'fx_rates') {
          return {
            select: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                rate: 1050.5,
                fetched_at: staleTimestamp,
                source: 'https://api.exchangerate-api.com',
              },
              error: null,
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
    } as any;

    // Mock fetch to simulate network failure
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const result = await getLatestFxRate(mockClient);
    expect(result.rate_clp_per_eur).toBe(1050.5);
    expect(result.is_stale).toBe(true);

    vi.unstubAllGlobals();
  });
});

describe('getLatestFxRate — no cache at all', () => {
  it('should return error when no cache and API is unreachable', async () => {
    const mockClient = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      })),
    } as any;

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const result = await getLatestFxRate(mockClient);
    expect(result.rate_clp_per_eur).toBe(0);
    expect(result.is_stale).toBe(true);
    expect(result.error).toBeTruthy();

    vi.unstubAllGlobals();
  });
});

// ============================================================
// /api/fx-rates/latest endpoint tests
// Using real getLatestFxRate with mock Supabase client
// ============================================================

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: vi.fn(),
  checkIsAdmin: vi.fn(),
  createServiceRoleClient: vi.fn(),
  sendAuthError: vi.fn((res, message, status) => {
    res.status(status).json({ error: message });
  }),
  sendApiResponse: vi.fn((res, data, status = 200) => {
    res.status(status).json({ data });
  }),
  logApiRequest: vi.fn(),
  handleMethodNotAllowed: vi.fn((res) => {
    res.status(405).json({ error: 'Method not allowed' });
  }),
}));

describe('/api/fx-rates/latest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 405 for non-GET requests', async () => {
    const handler = (await import('../../../pages/api/fx-rates/latest')).default;
    const { req, res } = createMocks({ method: 'POST' });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(405);
  });

  it('should return 401 if not authenticated', async () => {
    const { getApiUser } = await import('../../../lib/api-auth');
    (getApiUser as any).mockResolvedValue({ user: null, error: new Error('Not authenticated') });

    const handler = (await import('../../../pages/api/fx-rates/latest')).default;
    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(401);
  });

  it('should return FX rate for authenticated user with fresh cache', async () => {
    const { getApiUser, createServiceRoleClient } = await import('../../../lib/api-auth');

    const freshTimestamp = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 min ago
    const mockClient = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            rate: 1050.5,
            fetched_at: freshTimestamp,
            source: 'https://api.exchangerate-api.com',
          },
          error: null,
        }),
      })),
    } as any;

    (getApiUser as any).mockResolvedValue({ user: { id: 'user-1' }, error: null });
    (createServiceRoleClient as any).mockReturnValue(mockClient);

    const handler = (await import('../../../pages/api/fx-rates/latest')).default;
    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.data.rate_clp_per_eur).toBe(1050.5);
    expect(data.data.is_stale).toBe(false);
  });
});

describe('/api/fx-rates/refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 405 for non-POST requests', async () => {
    const handler = (await import('../../../pages/api/fx-rates/refresh')).default;
    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(405);
  });

  it('should return 403 for non-admin users', async () => {
    const { checkIsAdmin } = await import('../../../lib/api-auth');
    (checkIsAdmin as any).mockResolvedValue({ isAdmin: false, user: null, error: null });

    const handler = (await import('../../../pages/api/fx-rates/refresh')).default;
    const { req, res } = createMocks({ method: 'POST' });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(403);
  });

  it('should fetch fresh rate for admin user (mocked external API)', async () => {
    const { checkIsAdmin, createServiceRoleClient } = await import('../../../lib/api-auth');

    const mockClient = {
      from: vi.fn(() => ({
        insert: vi.fn().mockResolvedValue({ error: null }),
      })),
    } as any;

    (checkIsAdmin as any).mockResolvedValue({ isAdmin: true, user: { id: 'admin-1' }, error: null });
    (createServiceRoleClient as any).mockReturnValue(mockClient);

    // Mock the external API call
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        base: 'EUR',
        rates: { CLP: 1055.0 },
        date: '2026-02-24',
      }),
    }));

    const handler = (await import('../../../pages/api/fx-rates/refresh')).default;
    const { req, res } = createMocks({ method: 'POST' });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.data.rate_clp_per_eur).toBe(1055.0);

    vi.unstubAllGlobals();
  });
});
