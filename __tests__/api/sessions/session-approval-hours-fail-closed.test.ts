// @vitest-environment node
/** Z7-R5.1 — approval must never write through an unavailable financial dependency. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_A = '55555555-5555-4555-8555-555555555551';
const SESSION_B = '55555555-5555-4555-8555-555555555552';
const CONTRACT_ID = '77777777-7777-4777-8777-777777777777';
const GENERIC_ERROR = 'No se pudo verificar la disponibilidad de horas.';

const {
  mockCheckIsAdmin,
  mockCreateServiceRoleClient,
  mockValidateFacilitatorIntegrity,
  mockEnqueue,
  mockNotify,
} = vi.hoisted(() => ({
  mockCheckIsAdmin: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockValidateFacilitatorIntegrity: vi.fn(),
  mockEnqueue: vi.fn(),
  mockNotify: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal() as Record<string, unknown>),
  checkIsAdmin: mockCheckIsAdmin,
  createServiceRoleClient: mockCreateServiceRoleClient,
}));

vi.mock('../../../lib/utils/facilitator-validation', () => ({
  validateFacilitatorIntegrity: mockValidateFacilitatorIntegrity,
}));

vi.mock('../../../lib/zoom/provisioning-intent', () => ({
  enqueueSessionProvision: mockEnqueue,
}));

vi.mock('../../../lib/services/session-lifecycle-notifications', () => ({
  notifySessionLifecycle: mockNotify,
}));

import singleHandler from '../../../pages/api/sessions/[id]/approve';
import bulkHandler from '../../../pages/api/sessions/bulk-approve';

type RpcResult = { data: unknown; error: null | { message: string } };

interface State {
  sessions: Array<Record<string, unknown>>;
  rpcResults: RpcResult[];
  ledgerInserts: Array<Record<string, unknown>>;
  sessionUpdates: Array<Record<string, unknown>>;
}

function trackedSession(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    school_id: 77,
    status: 'borrador',
    session_date: '2026-08-20',
    start_time: '09:00:00',
    end_time: '10:00:00',
    scheduled_duration_minutes: 60,
    hour_type_key: 'asesoria_tecnica_presencial',
    contrato_id: CONTRACT_ID,
    modality: 'presencial',
    is_zoom_managed: false,
    ...overrides,
  };
}

function thenable(result: () => unknown) {
  const api: any = {
    select: vi.fn(() => api),
    eq: vi.fn(() => api),
    in: vi.fn(() => api),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result())),
  };
  return api;
}

function createClient(state: State) {
  let rpcIndex = 0;
  return {
    rpc: vi.fn(async () => state.rpcResults[rpcIndex++] ?? { data: [], error: null }),
    from: vi.fn((table: string) => {
      if (table === 'consultor_sessions') {
        let updatePayload: Record<string, unknown> | null = null;
        const api: any = thenable(() => {
          if (updatePayload) {
            const updated = state.sessions.map((row) => ({ ...row, ...updatePayload }));
            state.sessionUpdates.push(...updated);
            return { data: updated, error: null };
          }
          return { data: state.sessions.map((row) => ({ ...row })), error: null };
        });
        api.update = vi.fn((payload: Record<string, unknown>) => {
          updatePayload = payload;
          return api;
        });
        api.single = vi.fn(async () => {
          if (updatePayload) {
            const updated = { ...state.sessions[0], ...updatePayload };
            state.sessionUpdates.push(updated);
            return { data: updated, error: null };
          }
          return { data: { ...state.sessions[0] }, error: null };
        });
        return api;
      }
      if (table === 'session_facilitators') {
        return thenable(() => ({ data: [], error: null }));
      }
      if (table === 'hour_types') {
        const api: any = thenable(() => ({ data: null, error: null }));
        api.single = vi.fn(async () => ({ data: { id: 'hour-type-1' }, error: null }));
        return api;
      }
      if (table === 'contract_hour_allocations') {
        const api: any = thenable(() => ({ data: null, error: null }));
        api.single = vi.fn(async () => ({
          data: {
            id: 'allocation-1',
            contrato_id: CONTRACT_ID,
            hour_type_id: 'hour-type-1',
            allocated_hours: 10,
          },
          error: null,
        }));
        return api;
      }
      if (table === 'contract_hours_ledger') {
        const api: any = thenable(() => ({ data: null, error: null }));
        api.insert = vi.fn((payload: Record<string, unknown>) => {
          state.ledgerInserts.push(payload);
          return api;
        });
        api.single = vi.fn(async () => ({
          data: { id: `ledger-${state.ledgerInserts.length}` },
          error: null,
        }));
        return api;
      }
      if (table === 'session_activity_log') {
        return { insert: vi.fn(async () => ({ data: null, error: null })) };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

function bucket(availableHours: number): RpcResult {
  return {
    data: [{
      hour_type_key: 'asesoria_tecnica_presencial',
      available_hours: availableHours,
      allocated_hours: 10,
      reserved_hours: 0,
      consumed_hours: 0,
    }],
    error: null,
  };
}

function state(sessions: Array<Record<string, unknown>>, rpcResults: RpcResult[]): State {
  return { sessions, rpcResults, ledgerInserts: [], sessionUpdates: [] };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_ID }, error: null });
  mockValidateFacilitatorIntegrity.mockResolvedValue({ valid: true, errors: [] });
  mockEnqueue.mockResolvedValue(undefined);
  mockNotify.mockResolvedValue(undefined);
});

describe('session approval financial availability', () => {
  it('single approval returns generic 500 with no ledger/session mutation on RPC failure', async () => {
    const current = state([trackedSession(SESSION_A)], [
      { data: null, error: { message: 'synthetic database detail' } },
    ]);
    mockCreateServiceRoleClient.mockReturnValue(createClient(current));
    const { req, res } = createMocks({ method: 'POST', query: { id: SESSION_A } });

    await singleHandler(req as any, res as any);

    expect(current.ledgerInserts).toEqual([]);
    expect(current.sessionUpdates).toEqual([]);
    expect(res._getStatusCode()).toBe(500);
    expect(JSON.parse(res._getData())).toEqual({ error: GENERIC_ERROR });
    expect(res._getData()).not.toContain('synthetic database detail');
  });

  it('bulk preflights every session, so a later RPC failure leaves zero earlier inserts', async () => {
    const current = state(
      [trackedSession(SESSION_A), trackedSession(SESSION_B)],
      [bucket(10), { data: null, error: { message: 'synthetic second dependency failure' } }]
    );
    mockCreateServiceRoleClient.mockReturnValue(createClient(current));
    const { req, res } = createMocks({
      method: 'POST',
      body: { session_ids: [SESSION_A, SESSION_B] },
    });

    await bulkHandler(req as any, res as any);

    expect(current.ledgerInserts).toEqual([]);
    expect(current.sessionUpdates).toEqual([]);
    expect(res._getStatusCode()).toBe(500);
    expect(JSON.parse(res._getData())).toEqual({ error: GENERIC_ERROR });
  });

  it('single valid under-budget approval still reserves and updates', async () => {
    const current = state([trackedSession(SESSION_A)], [bucket(10)]);
    mockCreateServiceRoleClient.mockReturnValue(createClient(current));
    const { req, res } = createMocks({ method: 'POST', query: { id: SESSION_A } });

    await singleHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(current.ledgerInserts).toHaveLength(1);
    expect(current.ledgerInserts[0].is_over_budget).toBe(false);
    expect(current.sessionUpdates).toHaveLength(1);
  });

  it('bulk preserves over-budget reservation and valid legacy-empty approval semantics', async () => {
    const current = state(
      [trackedSession(SESSION_A, { scheduled_duration_minutes: 120 }), trackedSession(SESSION_B, {
        hour_type_key: null,
        contrato_id: null,
      })],
      [bucket(0.5)]
    );
    mockCreateServiceRoleClient.mockReturnValue(createClient(current));
    const { req, res } = createMocks({
      method: 'POST',
      body: { session_ids: [SESSION_A, SESSION_B] },
    });

    await bulkHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(current.ledgerInserts).toHaveLength(1);
    expect(current.ledgerInserts[0]).toMatchObject({
      session_id: SESSION_A,
      is_over_budget: true,
    });
    expect(current.sessionUpdates).toHaveLength(2);
  });

  it('bulk debits a shared preflight balance before classifying later reservations', async () => {
    const current = state(
      [trackedSession(SESSION_A), trackedSession(SESSION_B)],
      [bucket(1.5), bucket(1.5)]
    );
    mockCreateServiceRoleClient.mockReturnValue(createClient(current));
    const { req, res } = createMocks({
      method: 'POST',
      body: { session_ids: [SESSION_A, SESSION_B] },
    });

    await bulkHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(current.ledgerInserts.map((row) => row.is_over_budget)).toEqual([false, true]);
    expect(current.sessionUpdates).toHaveLength(2);
  });
});
