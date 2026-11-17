// @vitest-environment node
// F7d (GES-1.3, E2): the Telegram link code follows the expense filing rule —
// an active admin, consultor or community_manager; expense_report_access no
// longer counts.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockGetApiUser, mockCreateServiceRoleClient, mockCreateLinkCode, mockHasAdminPrivileges } = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockCreateLinkCode: vi.fn(),
  mockHasAdminPrivileges: vi.fn()
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, getApiUser: mockGetApiUser, createServiceRoleClient: mockCreateServiceRoleClient };
});

vi.mock('../../../utils/roleUtils', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, hasAdminPrivileges: mockHasAdminPrivileges };
});

vi.mock('../../../lib/bots/store', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    BotStore: vi.fn().mockImplementation(() => ({ createLinkCode: mockCreateLinkCode }))
  };
});

import handler from '../../../pages/api/bots/link-code';

const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

/** Chainable thenable fake: one answer per table, and every call recorded. */
function buildClient(results: Record<string, unknown>) {
  const calls: Array<{ table: string; op: string; args: unknown[] }> = [];
  return {
    calls,
    client: {
      from: vi.fn((table: string) => {
        const resolved = { data: results[table] ?? null, error: null };
        const handler: ProxyHandler<Record<string, unknown>> = {
          get(_t, prop) {
            if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(resolved);
            if (prop === 'maybeSingle' || prop === 'single') return () => Promise.resolve(resolved);
            return (...args: unknown[]) => {
              calls.push({ table, op: String(prop), args });
              return new Proxy({}, handler);
            };
          }
        };
        return new Proxy({}, handler);
      })
    }
  };
}

async function post() {
  const { req, res } = createMocks({ method: 'POST' });
  await handler(req as never, res as never);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetApiUser.mockResolvedValue({ user: { id: USER_ID }, error: null });
  mockHasAdminPrivileges.mockResolvedValue(false);
  mockCreateLinkCode.mockResolvedValue('123456');
});

describe('POST /api/bots/link-code', () => {
  it('gives a consultor with no expense_report_access row a code', async () => {
    const { client } = buildClient({ user_roles: [{ role_type: 'consultor' }], expense_report_access: null });
    mockCreateServiceRoleClient.mockReturnValue(client);
    const res = await post();
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toMatchObject({ code: '123456', expiresInMinutes: 15 });
  });

  it('refuses a docente WITH an expense_report_access row', async () => {
    const { client, calls } = buildClient({ user_roles: [{ role_type: 'docente' }], expense_report_access: { can_submit: true } });
    mockCreateServiceRoleClient.mockReturnValue(client);
    const res = await post();
    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({ error: 'No tienes acceso a rendición de gastos' });
    expect(mockCreateLinkCode).not.toHaveBeenCalled();
    expect(calls.some((c) => c.table === 'expense_report_access')).toBe(false);
  });

  it('gives an admin a code, as before', async () => {
    mockHasAdminPrivileges.mockResolvedValue(true);
    const { client } = buildClient({ user_roles: [{ role_type: 'admin' }], expense_report_access: null });
    mockCreateServiceRoleClient.mockReturnValue(client);
    const res = await post();
    expect(res._getStatusCode()).toBe(200);
  });

  it('reads only the ACTIVE role rows of the signed-in person', async () => {
    const { client, calls } = buildClient({ user_roles: [{ role_type: 'community_manager' }] });
    mockCreateServiceRoleClient.mockReturnValue(client);
    const res = await post();
    expect(res._getStatusCode()).toBe(200);
    const roleCalls = calls.filter((c) => c.table === 'user_roles');
    expect(roleCalls).toContainEqual({ table: 'user_roles', op: 'eq', args: ['user_id', USER_ID] });
    expect(roleCalls).toContainEqual({ table: 'user_roles', op: 'eq', args: ['is_active', true] });
  });

  it('refuses a person with no role at all', async () => {
    const { client } = buildClient({ user_roles: [] });
    mockCreateServiceRoleClient.mockReturnValue(client);
    const res = await post();
    expect(res._getStatusCode()).toBe(403);
  });

  it('still refuses a visitor', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: new Error('no session') });
    const res = await post();
    expect(res._getStatusCode()).toBe(401);
  });
});
