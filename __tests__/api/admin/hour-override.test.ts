// @vitest-environment node
/**
 * «Ajustar horas descontadas» — the §11 override route (Z7-4).
 *
 * The SECURITY boundary is the RPC (pgTAP 015 proves it inside Postgres); this
 * suite pins the route's own §11 obligations: consultor/school roles get 403,
 * an override without a reason is 400, zero-waiver is ACCEPTED, the RPC receives
 * the admin's own client call with the canonical payload_hash, and the RPC's
 * SQLSTATE taxonomy maps onto the HTTP statuses §11 names (tamper/409 etc.).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import type { NextApiRequest, NextApiResponse } from 'next';

const { mockCheckIsAdmin, mockCreateApiSupabaseClient } = vi.hoisted(() => ({
  mockCheckIsAdmin: vi.fn(),
  mockCreateApiSupabaseClient: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    checkIsAdmin: mockCheckIsAdmin,
    createApiSupabaseClient: mockCreateApiSupabaseClient,
  };
});

import handler, {
  overridePayloadHash,
} from '../../../pages/api/admin/sessions/[id]/hour-override';

const SESSION_ID = 'a7a7a7a7-0001-0000-0000-000000000001';
const ADMIN = { id: '11111111-1111-4111-8111-111111111111' };

function mockRpc(result: { data?: unknown; error?: { code?: string; message: string } | null }) {
  const rpc = vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null }));
  mockCreateApiSupabaseClient.mockResolvedValue({ rpc });
  return rpc;
}

async function invoke(body: Record<string, unknown>, method = 'POST') {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: method as 'POST',
    query: { id: SESSION_ID },
    body,
  });
  await handler(req, res);
  return res;
}

const VALID_APPLY = {
  new_minutes: 45,
  reason: 'Presencia parcial del consultor',
  reason_category: 'consultant_shortfall',
  request_id: 'req-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: ADMIN, error: null });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('/api/admin/sessions/[id]/hour-override — auth and method', () => {
  it('405s anything but POST', async () => {
    const res = await invoke(VALID_APPLY, 'GET');
    expect(res._getStatusCode()).toBe(405);
  });

  it('401s an unauthenticated caller', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: false, user: null, error: new Error('none') });
    const res = await invoke(VALID_APPLY);
    expect(res._getStatusCode()).toBe(401);
  });

  it('403s any authenticated non-admin — consultor and school roles alike (§11)', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: false, user: { id: 'someone' }, error: null });
    const res = await invoke(VALID_APPLY);
    expect(res._getStatusCode()).toBe(403);
    expect(mockCreateApiSupabaseClient).not.toHaveBeenCalled();
  });
});

describe('validation (§11)', () => {
  it('400s an override without a reason', async () => {
    const res = await invoke({ ...VALID_APPLY, reason: '   ' });
    expect(res._getStatusCode()).toBe(400);
  });

  it('400s an unknown reason_category', async () => {
    const res = await invoke({ ...VALID_APPLY, reason_category: 'inventada' });
    expect(res._getStatusCode()).toBe(400);
  });

  it('400s a missing request_id — idempotency is mandatory', async () => {
    const res = await invoke({ ...VALID_APPLY, request_id: '' });
    expect(res._getStatusCode()).toBe(400);
  });

  it('400s non-integer or negative minutes on an apply', async () => {
    expect((await invoke({ ...VALID_APPLY, new_minutes: 45.5 }))._getStatusCode()).toBe(400);
    expect((await invoke({ ...VALID_APPLY, new_minutes: -1 }))._getStatusCode()).toBe(400);
    expect((await invoke({ ...VALID_APPLY, new_minutes: '45' }))._getStatusCode()).toBe(400);
  });

  it('400s a reversal that also supplies minutes', async () => {
    const res = await invoke({
      ...VALID_APPLY,
      reverses_override_id: 'bbbbbbbb-0000-0000-0000-000000000001',
    });
    expect(res._getStatusCode()).toBe(400);
  });
});

describe('the RPC call — the admin\'s own client, the canonical hash', () => {
  it('hands the whole intent to apply_session_hour_override', async () => {
    const rpc = mockRpc({ data: { applied: true } });
    const res = await invoke(VALID_APPLY);

    expect(res._getStatusCode()).toBe(200);
    expect(rpc).toHaveBeenCalledWith('apply_session_hour_override', {
      p_session_id: SESSION_ID,
      p_new_minutes: 45,
      p_reason: 'Presencia parcial del consultor',
      p_reason_category: 'consultant_shortfall',
      p_request_id: 'req-1',
      p_payload_hash: overridePayloadHash({
        sessionId: SESSION_ID,
        newMinutes: 45,
        reason: 'Presencia parcial del consultor',
        reasonCategory: 'consultant_shortfall',
        reversesOverrideId: null,
      }),
      p_reverses_override_id: null,
    });
  });

  it('a ZERO waiver is a valid apply (§11 zero-waiver, "Sesión eximida")', async () => {
    const rpc = mockRpc({ data: { applied: true, new_minutes: 0 } });
    const res = await invoke({ ...VALID_APPLY, new_minutes: 0, request_id: 'req-waive' });

    expect(res._getStatusCode()).toBe(200);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_new_minutes: 0 });
  });

  it('a reversal passes the target id and NO minutes', async () => {
    const rpc = mockRpc({ data: { applied: true } });
    const res = await invoke({
      reason: 'Revertir el ajuste',
      reason_category: 'other',
      request_id: 'req-rev',
      reverses_override_id: 'bbbbbbbb-0000-0000-0000-000000000001',
    });

    expect(res._getStatusCode()).toBe(200);
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_new_minutes: null,
      p_reverses_override_id: 'bbbbbbbb-0000-0000-0000-000000000001',
    });
  });

  it('maps the RPC SQLSTATE taxonomy onto HTTP', async () => {
    for (const [code, status] of [
      ['P0400', 400],
      ['P0403', 403],
      ['P0404', 404],
      ['P0409', 409],
    ] as const) {
      mockRpc({ error: { code, message: `sqlstate ${code}` } });
      const res = await invoke({ ...VALID_APPLY, request_id: `req-${code}` });
      expect(res._getStatusCode()).toBe(status);
    }
  });

  it('an unrecognised RPC failure is a 500 that leaks nothing', async () => {
    mockRpc({ error: { code: '57014', message: 'statement timeout' } });
    const res = await invoke(VALID_APPLY);
    expect(res._getStatusCode()).toBe(500);
    expect(JSON.parse(res._getData())).toEqual({ error: 'Error interno' });
  });
});
