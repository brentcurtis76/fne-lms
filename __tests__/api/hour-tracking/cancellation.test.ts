// @vitest-environment node
/**
 * Unit tests for cancellation clause evaluation and cancel endpoint.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import { evaluateCancellationClause } from '../../../lib/services/hour-tracking';

// ============================================================
// Pure function tests — no mocking needed
// ============================================================

describe('evaluateCancellationClause — Clause 1 (Online / School / >= 48h)', () => {
  it('should return clause_1 for online school cancellation with >= 48h notice', () => {
    const result = evaluateCancellationClause('online', 'school', 72);
    expect(result.clause).toBe('clause_1');
    expect(result.ledger_status).toBe('devuelta');
    expect(result.consultant_paid).toBe(false);
    expect(result.rescheduling_deadline_days).toBe(30);
  });

  it('should return clause_1 for exactly 48h notice', () => {
    const result = evaluateCancellationClause('online', 'school', 48);
    expect(result.clause).toBe('clause_1');
    expect(result.ledger_status).toBe('devuelta');
  });
});

describe('evaluateCancellationClause — Clause 2 (Online / School / < 48h)', () => {
  it('should return clause_2 for online school cancellation with < 48h notice', () => {
    const result = evaluateCancellationClause('online', 'school', 24);
    expect(result.clause).toBe('clause_2');
    expect(result.ledger_status).toBe('penalizada');
    expect(result.consultant_paid).toBe(true);
    expect(result.rescheduling_deadline_days).toBeNull();
  });

  it('should return clause_2 for 0h notice (last-minute cancellation)', () => {
    const result = evaluateCancellationClause('online', 'school', 0);
    expect(result.clause).toBe('clause_2');
    expect(result.ledger_status).toBe('penalizada');
  });
});

describe('evaluateCancellationClause — Clause 3 (Presencial / School / >= 2 weeks)', () => {
  it('should return clause_3 for presencial school cancellation with >= 336h notice', () => {
    const result = evaluateCancellationClause('presencial', 'school', 400);
    expect(result.clause).toBe('clause_3');
    expect(result.ledger_status).toBe('devuelta');
    expect(result.consultant_paid).toBe(false);
    expect(result.rescheduling_deadline_days).toBe(30);
  });

  it('should return clause_3 for exactly 336h notice', () => {
    const result = evaluateCancellationClause('presencial', 'school', 336);
    expect(result.clause).toBe('clause_3');
    expect(result.ledger_status).toBe('devuelta');
  });
});

describe('evaluateCancellationClause — Clause 4 (Presencial / School / < 2 weeks)', () => {
  it('should return clause_4 for presencial school cancellation with < 336h notice', () => {
    const result = evaluateCancellationClause('presencial', 'school', 100);
    expect(result.clause).toBe('clause_4');
    expect(result.ledger_status).toBe('penalizada');
    expect(result.consultant_paid).toBe(true);
    expect(result.rescheduling_deadline_days).toBeNull();
  });

  it('should return clause_4 for hibrida with < 336h notice (hibrida treated as presencial)', () => {
    const result = evaluateCancellationClause('hibrida', 'school', 100);
    expect(result.clause).toBe('clause_4');
  });
});

describe('evaluateCancellationClause — Clause 5 (Force majeure)', () => {
  it('should return clause_5 for force_majeure regardless of modality', () => {
    const online = evaluateCancellationClause('online', 'force_majeure', 0);
    expect(online.clause).toBe('clause_5');
    expect(online.ledger_status).toBe('devuelta');
    expect(online.consultant_paid).toBe(false);

    const presencial = evaluateCancellationClause('presencial', 'force_majeure', 500);
    expect(presencial.clause).toBe('clause_5');
    expect(presencial.ledger_status).toBe('devuelta');
  });

  it('should allow rescheduling within 30 days for force_majeure', () => {
    const result = evaluateCancellationClause('online', 'force_majeure', 10);
    expect(result.rescheduling_deadline_days).toBe(30);
  });
});

describe('evaluateCancellationClause — Clause 6 (FNE)', () => {
  it('should return clause_6 for FNE cancellation regardless of modality or notice', () => {
    const online = evaluateCancellationClause('online', 'fne', 0);
    expect(online.clause).toBe('clause_6');
    expect(online.ledger_status).toBe('devuelta');
    expect(online.consultant_paid).toBe(false);

    const presencial = evaluateCancellationClause('presencial', 'fne', 1000);
    expect(presencial.clause).toBe('clause_6');
  });

  it('should allow rescheduling within 30 days for FNE cancellation', () => {
    const result = evaluateCancellationClause('presencial', 'fne', 0);
    expect(result.rescheduling_deadline_days).toBe(30);
  });
});

// ============================================================
// Cancel endpoint tests
// ============================================================

vi.mock('../../../lib/api-auth', () => ({
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

vi.mock('../../../lib/services/hour-tracking', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    executeCancellation: vi.fn(),
  };
});

describe('/api/sessions/[id]/cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 405 for non-POST requests', async () => {
    const handler = (await import('../../../pages/api/sessions/[id]/cancel')).default;
    const { req, res } = createMocks({
      method: 'GET',
      query: { id: '123e4567-e89b-12d3-a456-426614174000' },
    });

    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(405);
  });

  it('should return 400 for invalid session ID', async () => {
    const handler = (await import('../../../pages/api/sessions/[id]/cancel')).default;
    const { req, res } = createMocks({
      method: 'POST',
      query: { id: 'not-a-uuid' },
    });

    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(400);
  });

  it('should return 403 if user is not admin', async () => {
    const { checkIsAdmin } = await import('../../../lib/api-auth');
    (checkIsAdmin as any).mockResolvedValue({ isAdmin: false, user: null, error: null });

    const handler = (await import('../../../pages/api/sessions/[id]/cancel')).default;
    const { req, res } = createMocks({
      method: 'POST',
      query: { id: '123e4567-e89b-12d3-a456-426614174000' },
      body: { cancellation_reason: 'test' },
    });

    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(403);
  });

  it('should return 400 if cancellation_reason is missing', async () => {
    const { checkIsAdmin } = await import('../../../lib/api-auth');
    (checkIsAdmin as any).mockResolvedValue({
      isAdmin: true,
      user: { id: 'admin-1' },
      error: null,
    });

    const handler = (await import('../../../pages/api/sessions/[id]/cancel')).default;
    const { req, res } = createMocks({
      method: 'POST',
      query: { id: '123e4567-e89b-12d3-a456-426614174000' },
      body: {},
    });

    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('razon');
  });

  it('should cancel a legacy session (no hour tracking) successfully', async () => {
    const { checkIsAdmin, createServiceRoleClient } = await import('../../../lib/api-auth');
    (checkIsAdmin as any).mockResolvedValue({
      isAdmin: true,
      user: { id: 'admin-1' },
      error: null,
    });

    const mockUpdateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          status: 'cancelada',
          hour_type_key: null,
          contrato_id: null,
        },
        error: null,
      }),
    };

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'consultor_sessions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn()
              .mockResolvedValueOnce({
                data: {
                  id: '123e4567-e89b-12d3-a456-426614174000',
                  status: 'programada',
                  modality: 'online',
                  session_date: '2026-03-01',
                  start_time: '09:00:00',
                  end_time: '10:00:00',
                  hour_type_key: null,
                  contrato_id: null,
                },
                error: null,
              }),
            update: vi.fn().mockReturnThis(),
          };
        }
        return {
          ...mockUpdateChain,
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: 'cancel-1', status: 'cancelada' }, error: null }),
          update: vi.fn().mockReturnThis(),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }),
    };

    (createServiceRoleClient as any).mockReturnValue(mockClient);

    const handler = (await import('../../../pages/api/sessions/[id]/cancel')).default;
    const { req, res } = createMocks({
      method: 'POST',
      query: { id: '123e4567-e89b-12d3-a456-426614174000' },
      body: { cancellation_reason: 'Prueba de cancelación' },
    });

    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(200);
  });
});
