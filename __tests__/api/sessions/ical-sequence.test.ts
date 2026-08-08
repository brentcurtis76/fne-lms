// @vitest-environment node
/**
 * SEQUENCE on every .ics surface (Z2-4b).
 *
 * A participant may hold an event that arrived from any of the three
 * endpoints. RFC 5545 §3.8.7.4 has the client keep whichever revision of a UID
 * carried the highest SEQUENCE, so a surface that omits it hands the client a
 * revision-zero copy that outranks nothing and is never replaced — which is
 * worse than no fix at all. These assertions therefore run per endpoint,
 * against the full serialized .ics body, not against the generator directly.
 *
 * Synthetic data only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const {
  mockGetApiUser,
  mockCreateServiceRoleClient,
  mockCheckIsAdmin,
  mockGetUserRoles,
  mockGetHighestRole,
} = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockCheckIsAdmin: vi.fn(),
  mockGetUserRoles: vi.fn(),
  mockGetHighestRole: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getApiUser: mockGetApiUser,
    createServiceRoleClient: mockCreateServiceRoleClient,
    checkIsAdmin: mockCheckIsAdmin,
  };
});

vi.mock('../../../utils/roleUtils', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getUserRoles: mockGetUserRoles,
    getHighestRole: mockGetHighestRole,
  };
});

import singleHandler from '../../../pages/api/sessions/[id]/ical';
import batchHandler from '../../../pages/api/sessions/ical';
import seriesHandler from '../../../pages/api/sessions/series/[groupId]/ical';

const SESSION_ID = '44444444-4444-4444-8444-444444444444';
const GROUP_ID = '66666666-6666-4666-8666-666666666666';
const SCHOOL_ID = 1;
const GC_ID = '77777777-7777-4777-8777-777777777777';
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';

const CREATED_AT = '2026-05-01T10:00:00.000Z';
/** 3600 s after creation — the session was rescheduled an hour later. */
const UPDATED_AT = '2026-05-01T11:00:00.000Z';
const EXPECTED_SEQUENCE = 3600;

/** A later revision still, used for the cancellation comparison. */
const CANCELLED_UPDATED_AT = '2026-05-01T12:00:00.000Z';
const EXPECTED_CANCELLED_SEQUENCE = 7200;

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    title: 'Sesion Sintetica',
    description: 'Descripcion',
    objectives: 'Objetivos',
    session_date: '2026-06-15',
    start_time: '09:00:00',
    end_time: '10:00:00',
    location: null,
    meeting_link: null,
    status: 'programada',
    school_id: SCHOOL_ID,
    growth_community_id: GC_ID,
    is_active: true,
    created_at: CREATED_AT,
    updated_at: UPDATED_AT,
    schools: { name: 'Escuela Test' },
    growth_communities: { name: 'Comunidad Test' },
    session_facilitators: [],
    ...overrides,
  };
}

/** Table-keyed chainable Supabase stub. */
function buildClient(perTable: Record<string, { data: unknown; error?: unknown }>) {
  return {
    from: vi.fn((table: string) => {
      const resolved = perTable[table] ?? { data: null, error: null };
      const value = { data: resolved.data ?? null, error: resolved.error ?? null };

      const handler: ProxyHandler<Record<string, unknown>> = {
        get(_t, prop) {
          if (prop === 'then') {
            return (resolve: (v: unknown) => void) => resolve(value);
          }
          if (prop === 'single' || prop === 'maybeSingle') {
            return vi.fn(() => ({
              then: (resolve: (v: unknown) => void) => resolve(value),
            }));
          }
          return vi.fn(() => new Proxy({}, handler));
        },
      };
      return new Proxy({}, handler);
    }),
  };
}

const ADMIN_ROLES = [{ role_type: 'admin', school_id: null, community_id: null, is_active: true }];

function setAdmin() {
  mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_ID }, error: null });
  mockGetUserRoles.mockResolvedValue(ADMIN_ROLES);
  mockGetHighestRole.mockReturnValue('admin');
  mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_ID }, error: null });
}

const unfold = (ics: string) => ics.replace(/\r\n /g, '');

/** Pull SEQUENCE out of the serialized calendar; null when absent. */
function readSequence(ics: string): number | null {
  const match = unfold(ics).match(/^SEQUENCE:(-?\d+)$/m);
  return match ? Number(match[1]) : null;
}

async function runSingle(row: Record<string, unknown>) {
  mockCreateServiceRoleClient.mockReturnValue(
    buildClient({ consultor_sessions: { data: row }, session_facilitators: { data: [] } })
  );
  const { req, res } = createMocks({ method: 'GET', query: { id: SESSION_ID } });
  await singleHandler(req as never, res as never);
  return res;
}

async function runBatch(row: Record<string, unknown>) {
  mockCreateServiceRoleClient.mockReturnValue(
    buildClient({ consultor_sessions: { data: [row] } })
  );
  const { req, res } = createMocks({ method: 'GET', query: {} });
  await batchHandler(req as never, res as never);
  return res;
}

async function runSeries(row: Record<string, unknown>) {
  mockCreateServiceRoleClient.mockReturnValue(
    buildClient({ consultor_sessions: { data: [row] } })
  );
  const { req, res } = createMocks({ method: 'GET', query: { groupId: GROUP_ID } });
  await seriesHandler(req as never, res as never);
  return res;
}

const SURFACES: Array<[string, (row: Record<string, unknown>) => Promise<{
  _getStatusCode(): number;
  _getData(): string;
}>]> = [
  ['GET /api/sessions/[id]/ical', runSingle as never],
  ['GET /api/sessions/ical (batch)', runBatch as never],
  ['GET /api/sessions/series/[groupId]/ical', runSeries as never],
];

beforeEach(() => {
  vi.clearAllMocks();
  setAdmin();
});

describe.each(SURFACES)('%s — SEQUENCE', (_name, run) => {
  it('emits the revision derived from the row timestamps', async () => {
    const res = await run(makeRow());

    expect(res._getStatusCode()).toBe(200);
    expect(readSequence(res._getData())).toBe(EXPECTED_SEQUENCE);
    expect(unfold(res._getData())).toContain(`UID:${SESSION_ID}@genera.fne.cl`);
  });

  it('emits SEQUENCE:0 for a session that was never updated', async () => {
    const res = await run(makeRow({ updated_at: CREATED_AT }));

    expect(res._getStatusCode()).toBe(200);
    expect(readSequence(res._getData())).toBe(0);
  });

  it('raises SEQUENCE on cancellation, alongside STATUS:CANCELLED', async () => {
    const res = await run(
      makeRow({ status: 'cancelada', updated_at: CANCELLED_UPDATED_AT })
    );

    expect(res._getStatusCode()).toBe(200);
    expect(unfold(res._getData())).toContain('STATUS:CANCELLED');
    expect(readSequence(res._getData())).toBe(EXPECTED_CANCELLED_SEQUENCE);
    expect(EXPECTED_CANCELLED_SEQUENCE).toBeGreaterThan(EXPECTED_SEQUENCE);
  });
});

describe('SEQUENCE is consistent across the three surfaces', () => {
  it('the same session exported from every endpoint carries the same UID and SEQUENCE', async () => {
    // A revision that bumps on one surface and not another is worse than none:
    // the client keeps whichever copy it saw with the highest SEQUENCE.
    const row = makeRow();

    const bodies: string[] = [];
    for (const [, run] of SURFACES) {
      const res = await run(row);
      expect(res._getStatusCode()).toBe(200);
      bodies.push(res._getData());
      vi.clearAllMocks();
      setAdmin();
    }

    const sequences = bodies.map(readSequence);
    const uids = bodies.map((b) => unfold(b).match(/^UID:(.+)$/m)?.[1]);

    expect(sequences).toEqual([EXPECTED_SEQUENCE, EXPECTED_SEQUENCE, EXPECTED_SEQUENCE]);
    expect(new Set(uids).size).toBe(1);
  });
});
