// @vitest-environment node
/** R4.2 regressions for GET /api/contracts/[id]/hours/ledger. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

const CONSULTANT_ID = '550e8400-e29b-41d4-a716-446655440001';
const CONTRACT_ID = '550e8400-e29b-41d4-a716-446655440002';
const ALLOCATION_ID = '550e8400-e29b-41d4-a716-446655440003';
const SESSION_ID = '550e8400-e29b-41d4-a716-446655440004';

const { mockGetApiUser, mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
}));

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: mockGetApiUser,
  checkIsAdmin: vi.fn(),
  createServiceRoleClient: mockCreateServiceRoleClient,
  sendAuthError: vi.fn(
    (res: { status: (code: number) => { json: (data: unknown) => void } }, message: string, status: number) => {
      res.status(status).json({ error: message });
    }
  ),
  sendApiResponse: vi.fn(
    (res: { status: (code: number) => { json: (data: unknown) => void } }, data: unknown, status = 200) => {
      res.status(status).json({ data });
    }
  ),
  logApiRequest: vi.fn(),
  handleMethodNotAllowed: vi.fn(),
}));

vi.mock('../../../utils/roleUtils', () => ({
  getUserRoles: vi.fn(async () => [{ role: 'consultor' }]),
  getHighestRole: vi.fn(() => 'consultor'),
}));

import handler from '../../../pages/api/contracts/[id]/hours/ledger/index';

function allocationQuery() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: [{ id: ALLOCATION_ID }], error: null }),
  };
}

function facilitatorQuery(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue(result),
  };
}

function ledgerQuery(result: { data: unknown; error: unknown; count: number | null }) {
  return {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue(result),
  };
}

function request() {
  return createMocks({
    method: 'GET',
    query: { id: CONTRACT_ID, page: '1', page_size: '50' },
  });
}

describe('GET contract hours ledger — consultant scope fails closed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetApiUser.mockResolvedValue({ user: { id: CONSULTANT_ID }, error: null });
  });

  it('[Z7-R4.2] facilitator lookup failure returns generic 500 before any ledger query', async () => {
    const from = vi.fn((table: string) => {
      if (table === 'contract_hour_allocations') return allocationQuery();
      if (table === 'session_facilitators') {
        return facilitatorQuery({ data: null, error: new Error('synthetic scope outage') });
      }
      throw new Error(`ledger query must not be constructed after scope failure: ${table}`);
    });
    mockCreateServiceRoleClient.mockReturnValue({ from });
    const { req, res } = request();

    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toEqual({ error: 'Error al obtener libro de horas' });
    expect(res._getData()).not.toContain('ledger');
    expect(from).not.toHaveBeenCalledWith('contract_hours_ledger');
  });

  it('[Z7-R4.2] successful zero-row scope remains a legitimate empty 200', async () => {
    const from = vi.fn((table: string) => {
      if (table === 'contract_hour_allocations') return allocationQuery();
      if (table === 'session_facilitators') {
        return facilitatorQuery({ data: [], error: null });
      }
      throw new Error(`empty consultant scope must not query ledger: ${table}`);
    });
    mockCreateServiceRoleClient.mockReturnValue({ from });
    const { req, res } = request();

    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      data: { ledger: [], total: 0, page: 1, page_size: 50 },
    });
    expect(from).not.toHaveBeenCalledWith('contract_hours_ledger');
  });

  it('[Z7-R4.2] successful consultant scope constrains the ledger to facilitated sessions', async () => {
    const ledger = ledgerQuery({
      data: [{ id: 'synthetic-ledger-row', session_id: SESSION_ID, hours: 1 }],
      error: null,
      count: 1,
    });
    const from = vi.fn((table: string) => {
      if (table === 'contract_hour_allocations') return allocationQuery();
      if (table === 'session_facilitators') {
        return facilitatorQuery({ data: [{ session_id: SESSION_ID }], error: null });
      }
      if (table === 'contract_hours_ledger') return ledger;
      throw new Error(`unexpected table: ${table}`);
    });
    mockCreateServiceRoleClient.mockReturnValue({ from });
    const { req, res } = request();

    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toMatchObject({
      data: { total: 1, ledger: [{ session_id: SESSION_ID }] },
    });
    expect(ledger.not).toHaveBeenCalledWith('session_id', 'is', null);
    expect(ledger.in).toHaveBeenCalledWith('session_id', [SESSION_ID]);
  });
});
