// @vitest-environment node
// Phase E1 — Offline concurrency stress harness for /api/sessions/[id] PUT.
// Fires 50 parallel PUTs with jittered mock latency; exactly one should win,
// the rest must return 409 SESSION_CONFLICT, and exactly one activity_log
// row must be produced. No real Supabase is hit.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import handler from '../../pages/api/sessions/[id]/index';

vi.mock('../../lib/api-auth', () => ({
  getApiUser: vi.fn(),
  createServiceRoleClient: vi.fn(),
  sendAuthError: vi.fn((res, message, status, details) => {
    res.status(status).json({ error: message, details });
  }),
  sendApiResponse: vi.fn((res, data, status = 200) => {
    res.status(status).json({ data });
  }),
  logApiRequest: vi.fn(),
  handleMethodNotAllowed: vi.fn((res) => {
    res.status(405).json({ error: 'Method not allowed' });
  }),
}));

vi.mock('../../utils/roleUtils', () => ({
  getUserRoles: vi.fn(),
  getHighestRole: vi.fn(),
}));

const SESSION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const INITIAL_UPDATED_AT = '2026-04-16T10:00:00.000Z';
const PARALLELISM = 50;

type MockState = {
  row: Record<string, any> | null;
  activityLog: Array<Record<string, any>>;
  writeSerial: number;
};

// A toy mutex so only one update can be "committing" at a time — this models
// Postgres row-level locking on consultor_sessions during an UPDATE.
class AsyncMutex {
  private locked = false;
  private queue: Array<() => void> = [];

  async acquire(): Promise<() => void> {
    if (!this.locked) {
      this.locked = true;
      return () => this.release();
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.locked = true;
    return () => this.release();
  }

  private release() {
    this.locked = false;
    const next = this.queue.shift();
    if (next) next();
  }
}

function jitter(): Promise<void> {
  // 10–200 ms mimics real-world network / Supabase latency under load.
  const ms = 10 + Math.floor(Math.random() * 191);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createMockClient(state: MockState, mutex: AsyncMutex) {
  const sessionsBuilder = () => {
    let op: 'select' | 'update' = 'select';
    let updatePayload: Record<string, any> | null = null;
    const filters: Record<string, any> = {};

    const finalize = async (mode: 'single' | 'maybeSingle') => {
      if (op === 'select') {
        await jitter();
        if (state.row && state.row.id === filters.id) {
          return { data: { ...state.row }, error: null };
        }
        if (mode === 'maybeSingle') {
          return { data: null, error: null };
        }
        return { data: null, error: { message: 'Not found' } };
      }

      // op === 'update' — acquire the mutex so reads + writes don't interleave
      await jitter();
      const release = await mutex.acquire();
      try {
        const idMatch = state.row && state.row.id === filters.id;
        const guardPresent = Object.prototype.hasOwnProperty.call(filters, 'updated_at');
        const guardMatch = !guardPresent || state.row?.updated_at === filters.updated_at;

        if (idMatch && guardMatch && updatePayload) {
          state.writeSerial += 1;
          state.row = {
            ...state.row,
            ...updatePayload,
            updated_at: `2026-04-16T10:00:${String(state.writeSerial).padStart(2, '0')}.500Z`,
          };
          return { data: { ...state.row }, error: null };
        }

        if (mode === 'maybeSingle') {
          return { data: null, error: null };
        }
        return { data: null, error: { message: 'No rows' } };
      } finally {
        release();
      }
    };

    const api: any = {
      select: vi.fn(() => api),
      update: vi.fn((payload: Record<string, any>) => {
        op = 'update';
        updatePayload = payload;
        return api;
      }),
      eq: vi.fn((col: string, val: any) => {
        filters[col] = val;
        return api;
      }),
      single: vi.fn(() => finalize('single')),
      maybeSingle: vi.fn(() => finalize('maybeSingle')),
    };
    return api;
  };

  const activityBuilder = () => ({
    insert: vi.fn((entry: Record<string, any>) => {
      state.activityLog.push(entry);
      return Promise.resolve({ data: [entry], error: null });
    }),
  });

  return {
    from: vi.fn((table: string) => {
      if (table === 'consultor_sessions') return sessionsBuilder();
      if (table === 'session_activity_log') return activityBuilder();
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

function buildPutReqRes(title: string, guard: string) {
  return createMocks({
    method: 'PUT',
    query: { id: SESSION_ID },
    headers: { 'content-type': 'application/json' },
    body: {
      title,
      if_updated_at: guard,
    },
  });
}

describe('stress: 50 parallel PUTs with optimistic lock', () => {
  let state: MockState;
  let mutex: AsyncMutex;

  beforeEach(async () => {
    vi.clearAllMocks();

    state = {
      row: {
        id: SESSION_ID,
        title: 'Original',
        description: 'seed',
        objectives: 'seed',
        updated_at: INITIAL_UPDATED_AT,
        is_active: true,
      },
      activityLog: [],
      writeSerial: 0,
    };
    mutex = new AsyncMutex();

    const { getApiUser, createServiceRoleClient } = await import('../../lib/api-auth');
    (getApiUser as any).mockResolvedValue({ user: { id: 'stress-admin' }, error: null });
    (createServiceRoleClient as any).mockImplementation(() => createMockClient(state, mutex));

    const { getUserRoles, getHighestRole } = await import('../../utils/roleUtils');
    (getUserRoles as any).mockResolvedValue([
      { role_type: 'admin', is_active: true, school_id: null, community_id: null },
    ]);
    (getHighestRole as any).mockReturnValue('admin');
  });

  it(`${PARALLELISM} concurrent PUTs with same guard → exactly 1 wins, ${PARALLELISM - 1} return 409; activity_log has exactly 1 'edited' entry`, async () => {
    const requests = Array.from({ length: PARALLELISM }, (_, i) =>
      buildPutReqRes(`Racer ${i}`, INITIAL_UPDATED_AT)
    );

    // Run all handlers in parallel; none should throw.
    const settled = await Promise.allSettled(
      requests.map(({ req, res }) => handler(req as any, res as any))
    );

    for (const result of settled) {
      expect(result.status).toBe('fulfilled');
    }

    const statuses = requests.map(({ res }) => res._getStatusCode());
    const wins = statuses.filter((s) => s === 200);
    const conflicts = statuses.filter((s) => s === 409);

    expect(wins).toHaveLength(1);
    expect(conflicts).toHaveLength(PARALLELISM - 1);

    // Exactly one persisted write and one activity_log entry for the winner.
    expect(state.writeSerial).toBe(1);
    const editedEntries = state.activityLog.filter((e) => e.action === 'edited');
    expect(editedEntries).toHaveLength(1);

    // Every 409 must carry the contract the UI relies on.
    for (const { res } of requests) {
      if (res._getStatusCode() === 409) {
        const body = JSON.parse(res._getData());
        expect(body.code).toBe('SESSION_CONFLICT');
        expect(body.current).toMatchObject({ id: SESSION_ID });
      }
    }
  }, 20000);
});
