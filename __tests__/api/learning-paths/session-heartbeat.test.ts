// @vitest-environment node
/**
 * R3-01 (2026-09-07) — POST /api/learning-paths/session/heartbeat: a heartbeat
 * extends the creditable interval of an open session, so update_session_heartbeat
 * now requires CURRENT assignment authority (42501 otherwise). The route answers
 * that refusal as a 403 denial — never a 500 — and writes nothing itself. The
 * database half is proved by pgTAP 074 §2.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

const DOCENTE = '44444444-4444-4444-8444-444444444444';
const SESSION = '77777777-7777-4777-8777-777777777777';

const { mockGetApiUser, mockCreateApiSupabaseClient, mockRpc, mockFrom } = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateApiSupabaseClient: vi.fn(),
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, getApiUser: mockGetApiUser, createApiSupabaseClient: mockCreateApiSupabaseClient };
});

import handler from '../../../pages/api/learning-paths/session/heartbeat';

function sessionRow(row: Record<string, unknown> | null) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq']) chain[m] = () => chain;
  chain.single = async () => ({ data: row, error: row ? null : { message: 'not found' } });
  return chain;
}

async function post(body: Record<string, unknown>) {
  const { req, res } = createMocks({ method: 'POST', body });
  await handler(req as never, res as never);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mockGetApiUser.mockResolvedValue({ user: { id: DOCENTE }, error: null });
  mockCreateApiSupabaseClient.mockResolvedValue({ rpc: mockRpc, from: mockFrom });
  mockFrom.mockImplementation(() => sessionRow({ id: SESSION, user_id: DOCENTE, session_end: null }));
  mockRpc.mockResolvedValue({ data: true, error: null });
});
afterEach(() => vi.restoreAllMocks());

describe('POST /api/learning-paths/session/heartbeat', () => {
  it('a valid assignee heartbeat goes through the RPC and is 200', async () => {
    const res = await post({ sessionId: SESSION });
    expect(res._getStatusCode()).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('update_session_heartbeat', { p_session_id: SESSION });
  });

  it('R3-01: lost assignment authority (42501) is a 403 denial, not a 500', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'User is not assigned to this learning path' } });
    const res = await post({ sessionId: SESSION });
    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().error).toMatch(/do not have access/);
  });

  it('any other RPC error is 500', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'internal' } });
    expect((await post({ sessionId: SESSION }))._getStatusCode()).toBe(500);
  });

  it('an ended session is 400 before any RPC', async () => {
    mockFrom.mockImplementation(() => sessionRow({ id: SESSION, user_id: DOCENTE, session_end: '2026-01-01T00:00:00Z' }));
    expect((await post({ sessionId: SESSION }))._getStatusCode()).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('a missing session is 404 before any RPC', async () => {
    mockFrom.mockImplementation(() => sessionRow(null));
    expect((await post({ sessionId: SESSION }))._getStatusCode()).toBe(404);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('unauthenticated is 401', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: new Error('no session') });
    expect((await post({ sessionId: SESSION }))._getStatusCode()).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
