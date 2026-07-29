// @vitest-environment node
/**
 * ATTENDEE disclosure for the .ics endpoints (Z1a-4 / T3).
 *
 * Chunk 2 moved DESCRIPTION / LOCATION / URL onto platform links but left the
 * ATTENDEE channel alone: `ical-generator` serializes facilitators as
 * `ATTENDEE;…;CN="Nombre":MAILTO:persona@colegio.cl`, so every caller entitled
 * to download a calendar received the facilitators' personal e-mail addresses
 * inside a plain-text file that then travels outside the platform.
 *
 * Assertions run against the FULL serialized .ics body, per endpoint, and also
 * re-assert the chunk-2 property (no raw meeting link) so the two cannot drift.
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
const OTHER_SCHOOL_ID = 9;
const GC_ID = '77777777-7777-4777-8777-777777777777';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const CONSULTOR_ID = '22222222-2222-4222-8222-222222222222';
const GC_MEMBER_ID = '33333333-3333-4333-8333-333333333333';
const FACILITATOR_ID = '88888888-8888-4888-8888-888888888888';

const FACILITATOR_EMAIL = 'facilitadora@test.local';
const RAW_MEETING_LINK = 'https://meet.google.com/raw-abc-def';

const facilitatorEmbed = [
  {
    id: 'sf-1',
    session_id: SESSION_ID,
    user_id: FACILITATOR_ID,
    profiles: {
      first_name: 'Fabiola',
      last_name: 'Facilitadora',
      email: FACILITATOR_EMAIL,
    },
  },
];

const sessionRow = {
  id: SESSION_ID,
  title: 'Sesion Sintetica',
  description: 'Descripcion',
  objectives: 'Objetivos',
  session_date: '2026-03-15',
  start_time: '09:00:00',
  end_time: '10:00:00',
  location: null,
  meeting_link: RAW_MEETING_LINK,
  status: 'programada',
  school_id: SCHOOL_ID,
  growth_community_id: GC_ID,
  is_active: true,
  schools: { name: 'Escuela Test' },
  growth_communities: { name: 'Comunidad Test' },
  session_facilitators: facilitatorEmbed,
};

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

const ADMIN_ROLES = [
  { role_type: 'admin', school_id: null, community_id: null, is_active: true },
];
const SCOPED_CONSULTOR_ROLES = [
  { role_type: 'consultor', school_id: SCHOOL_ID, community_id: null, is_active: true },
];
const GC_MEMBER_ROLES = [
  { role_type: 'lider_comunidad', school_id: SCHOOL_ID, community_id: GC_ID, is_active: true },
];
const FACILITATOR_ROLES = [
  { role_type: 'docente', school_id: SCHOOL_ID, community_id: GC_ID, is_active: true },
];

function setRoles(roles: Record<string, unknown>[], highestRole: string) {
  mockGetUserRoles.mockResolvedValue(roles);
  mockGetHighestRole.mockReturnValue(highestRole);
}

/** Unfold RFC 5545 line folding so substring assertions are meaningful. */
const unfold = (ics: string) => ics.replace(/\r\n /g, '');

async function runSingle(userId: string) {
  mockGetApiUser.mockResolvedValue({ user: { id: userId }, error: null });
  mockCreateServiceRoleClient.mockReturnValue(
    buildClient({
      consultor_sessions: { data: sessionRow },
      session_facilitators: { data: facilitatorEmbed },
    })
  );

  const { req, res } = createMocks({ method: 'GET', query: { id: SESSION_ID } });
  await singleHandler(req as any, res as any);
  return res;
}

async function runBatch(userId: string) {
  mockGetApiUser.mockResolvedValue({ user: { id: userId }, error: null });
  mockCreateServiceRoleClient.mockReturnValue(
    buildClient({ consultor_sessions: { data: [sessionRow] } })
  );

  const { req, res } = createMocks({ method: 'GET', query: {} });
  await batchHandler(req as any, res as any);
  return res;
}

async function runSeries(isAdmin: boolean) {
  mockCheckIsAdmin.mockResolvedValue({
    isAdmin,
    user: isAdmin ? { id: ADMIN_ID } : null,
    error: null,
  });
  mockCreateServiceRoleClient.mockReturnValue(
    buildClient({ consultor_sessions: { data: [sessionRow] } })
  );

  const { req, res } = createMocks({ method: 'GET', query: { groupId: GROUP_ID } });
  await seriesHandler(req as any, res as any);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/sessions/[id]/ical — ATTENDEE disclosure', () => {
  it('a GC member gets an .ics with no facilitator e-mail and no ATTENDEE', async () => {
    setRoles(GC_MEMBER_ROLES, 'lider_comunidad');
    const res = await runSingle(GC_MEMBER_ID);

    expect(res._getStatusCode()).toBe(200);
    const ics = unfold(res._getData());

    expect(ics).not.toContain(FACILITATOR_EMAIL);
    expect(ics).not.toContain('ATTENDEE');
    // chunk-2 property still holds
    expect(ics).not.toContain(RAW_MEETING_LINK);
    // the calendar itself is intact
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain(`/meet/session/${SESSION_ID}`);
  });

  it('an admin keeps the ATTENDEE entries', async () => {
    setRoles(ADMIN_ROLES, 'admin');
    const res = await runSingle(ADMIN_ID);

    expect(res._getStatusCode()).toBe(200);
    const ics = unfold(res._getData());

    expect(ics).toContain('ATTENDEE');
    expect(ics).toContain(FACILITATOR_EMAIL);
    // …but still never the raw meeting link
    expect(ics).not.toContain(RAW_MEETING_LINK);
  });

  it('a school-scoped consultor keeps the ATTENDEE entries', async () => {
    setRoles(SCOPED_CONSULTOR_ROLES, 'consultor');
    const res = await runSingle(CONSULTOR_ID);

    expect(res._getStatusCode()).toBe(200);
    expect(unfold(res._getData())).toContain(FACILITATOR_EMAIL);
  });

  it("the session's own facilitator keeps the ATTENDEE entries", async () => {
    setRoles(FACILITATOR_ROLES, 'docente');
    const res = await runSingle(FACILITATOR_ID);

    expect(res._getStatusCode()).toBe(200);
    expect(unfold(res._getData())).toContain(FACILITATOR_EMAIL);
  });

  it('a consultor scoped to another school is denied outright', async () => {
    setRoles(
      [{ role_type: 'consultor', school_id: OTHER_SCHOOL_ID, community_id: null, is_active: true }],
      'consultor'
    );
    const res = await runSingle(CONSULTOR_ID);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getData()).not.toContain(FACILITATOR_EMAIL);
  });

  it('a GC member whose role is is_active=false is denied', async () => {
    setRoles([{ ...GC_MEMBER_ROLES[0], is_active: false }], 'lider_comunidad');
    const res = await runSingle(GC_MEMBER_ID);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getData()).not.toContain(FACILITATOR_EMAIL);
  });
});

describe('GET /api/sessions/ical (batch) — ATTENDEE disclosure', () => {
  it('a GC member gets an .ics with no facilitator e-mail and no ATTENDEE', async () => {
    setRoles(GC_MEMBER_ROLES, 'lider_comunidad');
    const res = await runBatch(GC_MEMBER_ID);

    expect(res._getStatusCode()).toBe(200);
    const ics = unfold(res._getData());

    expect(ics).not.toContain(FACILITATOR_EMAIL);
    expect(ics).not.toContain('ATTENDEE');
    expect(ics).not.toContain(RAW_MEETING_LINK);
    expect(ics).toContain('BEGIN:VEVENT');
  });

  it('an admin keeps the ATTENDEE entries', async () => {
    setRoles(ADMIN_ROLES, 'admin');
    const res = await runBatch(ADMIN_ID);

    expect(res._getStatusCode()).toBe(200);
    const ics = unfold(res._getData());
    expect(ics).toContain('ATTENDEE');
    expect(ics).toContain(FACILITATOR_EMAIL);
  });

  it('a GC member who facilitates the row keeps that row’s ATTENDEE entries', async () => {
    // Per-row entitlement: the same caller can be a plain member of one
    // session and a facilitator of the next.
    setRoles(FACILITATOR_ROLES, 'docente');
    const res = await runBatch(FACILITATOR_ID);

    expect(res._getStatusCode()).toBe(200);
    expect(unfold(res._getData())).toContain(FACILITATOR_EMAIL);
  });

  it('a school-scoped consultor keeps the ATTENDEE entries', async () => {
    setRoles(SCOPED_CONSULTOR_ROLES, 'consultor');
    const res = await runBatch(CONSULTOR_ID);

    expect(res._getStatusCode()).toBe(200);
    expect(unfold(res._getData())).toContain(FACILITATOR_EMAIL);
  });
});

describe('GET /api/sessions/series/[groupId]/ical — ATTENDEE disclosure', () => {
  it('admin (the only allowed caller) keeps the ATTENDEE entries', async () => {
    const res = await runSeries(true);

    expect(res._getStatusCode()).toBe(200);
    const ics = unfold(res._getData());
    expect(ics).toContain('ATTENDEE');
    expect(ics).toContain(FACILITATOR_EMAIL);
    expect(ics).not.toContain(RAW_MEETING_LINK);
  });

  it('a non-admin is denied before any calendar is built', async () => {
    const res = await runSeries(false);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getData()).not.toContain(FACILITATOR_EMAIL);
  });
});
