// @vitest-environment node
/**
 * Disclosure / IDOR suite for the session payload endpoints (Z1a / WP-0).
 *
 * Guards three properties of GET /api/sessions/[id] and GET /api/sessions:
 *   1. Authorization goes through canViewSession() — only ACTIVE role rows grant
 *      access, and community/school scope is honoured (no IDOR).
 *   2. `facilitators_only` reports never reach a caller who is not an admin or
 *      a facilitator of that session.
 *   3. Profile e-mails (facilitators, attendees, uploaders) reach only admins,
 *      school-scoped consultors and the session's own facilitators.
 *   4. The raw `meeting_link` reaches that same set and nobody else; the
 *      `meeting_transcript` reaches only admins and facilitators; every caller
 *      gets `has_meeting` + `join_path` instead (Z1a-2).
 *
 * Synthetic data only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import detailHandler from '../../../pages/api/sessions/[id]/index';
import listHandler from '../../../pages/api/sessions/index';

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: vi.fn(),
  createServiceRoleClient: vi.fn(),
  checkIsAdmin: vi.fn(),
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

vi.mock('../../../utils/roleUtils', () => ({
  getUserRoles: vi.fn(),
  getHighestRole: vi.fn(),
}));

const SESSION_ID = '3f1c5f5e-0f1a-4d3e-9a11-2b6c8f0d1e22';
const SESSION_SCHOOL_ID = 7;
const OTHER_SCHOOL_ID = 9;
const SESSION_COMMUNITY_ID = 'c0111111-1111-4111-8111-111111111111';
const OTHER_COMMUNITY_ID = 'c0222222-2222-4222-8222-222222222222';

const FACILITATOR_USER_ID = 'u-facilitator-0001';
const GC_USER_ID = 'u-gc-member-0001';
const ADMIN_USER_ID = 'u-admin-0001';
const CONSULTOR_USER_ID = 'u-consultor-0001';

const MEETING_LINK = 'https://meet.example.test/abc-def';
const MEETING_TRANSCRIPT = 'Transcripción cruda de la sesión';

const FACILITATOR_EMAIL = 'facilitador@test.local';
const ATTENDEE_EMAIL = 'asistente@test.local';
const UPLOADER_EMAIL = 'subio@test.local';

const sessionRow = {
  id: SESSION_ID,
  title: 'Sesión sintética',
  school_id: SESSION_SCHOOL_ID,
  growth_community_id: SESSION_COMMUNITY_ID,
  status: 'programada',
  is_active: true,
  session_date: '2026-03-10',
  start_time: '09:00:00',
  meeting_link: MEETING_LINK,
  meeting_transcript: MEETING_TRANSCRIPT,
  schools: { name: 'Colegio Sintético' },
  growth_communities: { name: 'Comunidad Sintética' },
};

const facilitatorRows = [
  {
    id: 'sf-1',
    session_id: SESSION_ID,
    user_id: FACILITATOR_USER_ID,
    is_lead: true,
    profiles: {
      id: FACILITATOR_USER_ID,
      first_name: 'Fabiola',
      last_name: 'Facilitadora',
      email: FACILITATOR_EMAIL,
    },
  },
];

const attendeeRows = [
  {
    id: 'sa-1',
    session_id: SESSION_ID,
    user_id: 'u-attendee-0001',
    attended: null,
    profiles: {
      id: 'u-attendee-0001',
      first_name: 'Ana',
      last_name: 'Asistente',
      email: ATTENDEE_EMAIL,
    },
  },
];

const reportRows = [
  {
    id: 'rep-public',
    session_id: SESSION_ID,
    author_id: FACILITATOR_USER_ID,
    report_type: 'session_report',
    visibility: 'all_participants',
    content: 'Informe visible para participantes',
  },
  {
    id: 'rep-private',
    session_id: SESSION_ID,
    author_id: FACILITATOR_USER_ID,
    report_type: 'planning_notes',
    visibility: 'facilitators_only',
    content: 'Notas internas de facilitadores',
  },
];

const materialRows = [
  {
    id: 'mat-1',
    session_id: SESSION_ID,
    file_name: 'guia.pdf',
    visibility: 'all_participants',
    profiles: { first_name: 'Ulises', last_name: 'Uploader', email: UPLOADER_EMAIL },
  },
];

interface DetailFixture {
  session?: unknown;
  sessionError?: unknown;
  isFacilitator?: boolean;
}

/**
 * Minimal chainable stub for the detail GET. `consultor_sessions` and
 * `session_facilitators` are queried twice (access check + relation fetch), so
 * results are keyed by table and by call index.
 */
function buildDetailClient(fixture: DetailFixture = {}) {
  const perTable: Record<string, unknown[]> = {
    consultor_sessions: [
      fixture.sessionError
        ? { data: null, error: fixture.sessionError }
        : { data: fixture.session ?? sessionRow, error: null },
    ],
    session_facilitators: [
      { data: fixture.isFacilitator ? { id: 'sf-1' } : null, error: null },
      { data: facilitatorRows, error: null },
    ],
    session_attendees: [{ data: attendeeRows, error: null }],
    session_reports: [{ data: reportRows, error: null }],
    session_materials: [{ data: materialRows, error: null }],
    session_communications: [{ data: [], error: null }],
    session_activity_log: [{ data: null, error: null }],
    session_edit_requests: [{ data: [], error: null }],
  };

  const counters: Record<string, number> = {};

  return {
    from: vi.fn((table: string) => {
      const idx = counters[table] ?? 0;
      counters[table] = idx + 1;
      const results = perTable[table] ?? [];
      const resolved = (results[Math.min(idx, results.length - 1)] as unknown) ?? {
        data: null,
        error: null,
      };

      const handler: ProxyHandler<Record<string, unknown>> = {
        get(_t, prop) {
          if (prop === 'then') {
            return (resolve: (v: unknown) => void) => resolve(resolved);
          }
          if (prop === 'single' || prop === 'maybeSingle') {
            return vi.fn(() => ({
              then: (resolve: (v: unknown) => void) => resolve(resolved),
            }));
          }
          return vi.fn(() => new Proxy({}, handler));
        },
      };
      return new Proxy({}, handler);
    }),
  };
}

async function runDetail(opts: {
  userId: string;
  roles: Record<string, unknown>[];
  highestRole: string | null;
  fixture?: DetailFixture;
}) {
  const { getApiUser, createServiceRoleClient } = await import('../../../lib/api-auth');
  const { getUserRoles, getHighestRole } = await import('../../../utils/roleUtils');

  (getApiUser as any).mockResolvedValue({ user: { id: opts.userId }, error: null });
  (getUserRoles as any).mockResolvedValue(opts.roles);
  (getHighestRole as any).mockReturnValue(opts.highestRole);
  (createServiceRoleClient as any).mockReturnValue(buildDetailClient(opts.fixture));

  const { req, res } = createMocks({ method: 'GET', query: { id: SESSION_ID } });
  await detailHandler(req as any, res as any);
  return res;
}

const payloadOf = (res: any) => JSON.parse(res._getData()).data.session;
const serialize = (res: any) => res._getData();

describe('GET /api/sessions/[id] — access control (is_active + scope)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('denies a GC member whose community role is is_active=false', async () => {
    const res = await runDetail({
      userId: GC_USER_ID,
      highestRole: 'lider_comunidad',
      roles: [
        {
          role_type: 'lider_comunidad',
          community_id: SESSION_COMMUNITY_ID,
          school_id: SESSION_SCHOOL_ID,
          is_active: false,
        },
      ],
    });

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData()).error).toBe('Acceso denegado a esta sesión');
  });

  it('denies an active GC member of a different community', async () => {
    const res = await runDetail({
      userId: GC_USER_ID,
      highestRole: 'lider_comunidad',
      roles: [
        {
          role_type: 'lider_comunidad',
          community_id: OTHER_COMMUNITY_ID,
          school_id: OTHER_SCHOOL_ID,
          is_active: true,
        },
      ],
    });

    expect(res._getStatusCode()).toBe(403);
  });

  it('denies a consultor scoped to a different school', async () => {
    const res = await runDetail({
      userId: CONSULTOR_USER_ID,
      highestRole: 'consultor',
      roles: [
        {
          role_type: 'consultor',
          school_id: OTHER_SCHOOL_ID,
          community_id: null,
          is_active: true,
        },
      ],
    });

    expect(res._getStatusCode()).toBe(403);
  });

  it('denies a consultor whose school-scoped role has been revoked', async () => {
    const res = await runDetail({
      userId: CONSULTOR_USER_ID,
      highestRole: 'consultor',
      roles: [
        {
          role_type: 'consultor',
          school_id: SESSION_SCHOOL_ID,
          community_id: null,
          is_active: false,
        },
      ],
    });

    expect(res._getStatusCode()).toBe(403);
  });

  it('returns 404 (not 403) when the session does not exist', async () => {
    const res = await runDetail({
      userId: ADMIN_USER_ID,
      highestRole: 'admin',
      roles: [{ role_type: 'admin', school_id: null, community_id: null, is_active: true }],
      fixture: { sessionError: { message: 'not found' } },
    });

    expect(res._getStatusCode()).toBe(404);
  });
});

describe('GET /api/sessions/[id] — payload disclosure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('active GC member of the session community: 200 with no private report and no e-mails', async () => {
    const res = await runDetail({
      userId: GC_USER_ID,
      highestRole: 'lider_comunidad',
      roles: [
        {
          role_type: 'lider_comunidad',
          community_id: SESSION_COMMUNITY_ID,
          school_id: SESSION_SCHOOL_ID,
          is_active: true,
        },
      ],
    });

    expect(res._getStatusCode()).toBe(200);
    const session = payloadOf(res);

    expect(session.reports.map((r: any) => r.id)).toEqual(['rep-public']);
    expect(session.reports.every((r: any) => r.visibility === 'all_participants')).toBe(true);

    expect(session.facilitators[0].profiles).not.toHaveProperty('email');
    expect(session.attendees[0].profiles).not.toHaveProperty('email');
    expect(session.materials[0].profiles).not.toHaveProperty('email');

    // Names survive the redaction
    expect(session.facilitators[0].profiles.first_name).toBe('Fabiola');
    expect(session.attendees[0].profiles.last_name).toBe('Asistente');

    // Nothing anywhere in the serialized body
    const body = serialize(res);
    expect(body).not.toContain(FACILITATOR_EMAIL);
    expect(body).not.toContain(ATTENDEE_EMAIL);
    expect(body).not.toContain(UPLOADER_EMAIL);
    expect(body).not.toContain('Notas internas de facilitadores');
  });

  it('a GC leader (who CAN edit) still does not receive facilitators_only reports', async () => {
    const res = await runDetail({
      userId: GC_USER_ID,
      highestRole: 'lider_comunidad',
      roles: [
        {
          role_type: 'lider_comunidad',
          community_id: SESSION_COMMUNITY_ID,
          school_id: SESSION_SCHOOL_ID,
          is_active: true,
        },
      ],
    });

    const session = payloadOf(res);
    expect(session.reports).toHaveLength(1);
    expect(session.reports[0].visibility).toBe('all_participants');
  });

  it('facilitator of the session: 200 with all reports and e-mails', async () => {
    const res = await runDetail({
      userId: FACILITATOR_USER_ID,
      highestRole: 'consultor',
      roles: [
        {
          role_type: 'consultor',
          school_id: SESSION_SCHOOL_ID,
          community_id: null,
          is_active: true,
        },
      ],
      fixture: { isFacilitator: true },
    });

    expect(res._getStatusCode()).toBe(200);
    const session = payloadOf(res);
    expect(session.reports.map((r: any) => r.id)).toEqual(['rep-public', 'rep-private']);
    expect(session.facilitators[0].profiles.email).toBe(FACILITATOR_EMAIL);
    expect(session.attendees[0].profiles.email).toBe(ATTENDEE_EMAIL);
  });

  it('a facilitator with no school-scoped role still gets the full payload', async () => {
    const res = await runDetail({
      userId: FACILITATOR_USER_ID,
      highestRole: 'docente',
      roles: [
        {
          role_type: 'docente',
          school_id: SESSION_SCHOOL_ID,
          community_id: SESSION_COMMUNITY_ID,
          is_active: true,
        },
      ],
      fixture: { isFacilitator: true },
    });

    expect(res._getStatusCode()).toBe(200);
    const session = payloadOf(res);
    expect(session.reports).toHaveLength(2);
    expect(session.attendees[0].profiles.email).toBe(ATTENDEE_EMAIL);
  });

  it('admin: 200 with everything', async () => {
    const res = await runDetail({
      userId: ADMIN_USER_ID,
      highestRole: 'admin',
      roles: [{ role_type: 'admin', school_id: null, community_id: null, is_active: true }],
    });

    expect(res._getStatusCode()).toBe(200);
    const session = payloadOf(res);
    expect(session.reports).toHaveLength(2);
    expect(session.facilitators[0].profiles.email).toBe(FACILITATOR_EMAIL);
    expect(session.attendees[0].profiles.email).toBe(ATTENDEE_EMAIL);
    expect(session.materials[0].profiles.email).toBe(UPLOADER_EMAIL);
  });

  it('school-scoped consultor for that school: 200 with e-mails', async () => {
    const res = await runDetail({
      userId: CONSULTOR_USER_ID,
      highestRole: 'consultor',
      roles: [
        {
          role_type: 'consultor',
          school_id: SESSION_SCHOOL_ID,
          community_id: null,
          is_active: true,
        },
      ],
    });

    expect(res._getStatusCode()).toBe(200);
    const session = payloadOf(res);
    expect(session.facilitators[0].profiles.email).toBe(FACILITATOR_EMAIL);
    expect(session.attendees[0].profiles.email).toBe(ATTENDEE_EMAIL);
    // Read-only viewer, not a facilitator → still no facilitators_only report
    expect(session.reports.map((r: any) => r.id)).toEqual(['rep-public']);
  });
});

describe('GET /api/sessions/[id] — meeting link + transcript disclosure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const gcMemberRoles = [
    {
      role_type: 'lider_comunidad',
      community_id: SESSION_COMMUNITY_ID,
      school_id: SESSION_SCHOOL_ID,
      is_active: true,
    },
  ];

  it('a GC member gets neither link nor transcript, but does get has_meeting/join_path', async () => {
    const res = await runDetail({
      userId: GC_USER_ID,
      highestRole: 'lider_comunidad',
      roles: gcMemberRoles,
    });

    expect(res._getStatusCode()).toBe(200);
    const session = payloadOf(res);

    expect(session).not.toHaveProperty('meeting_link');
    expect(session).not.toHaveProperty('meeting_transcript');
    expect(session.has_meeting).toBe(true);
    expect(session.join_path).toBe(`/meet/session/${SESSION_ID}`);

    const body = serialize(res);
    expect(body).not.toContain(MEETING_LINK);
    expect(body).not.toContain(MEETING_TRANSCRIPT);
  });

  it('a facilitator keeps both raw fields AND gets has_meeting/join_path', async () => {
    const res = await runDetail({
      userId: FACILITATOR_USER_ID,
      highestRole: 'consultor',
      roles: [
        {
          role_type: 'consultor',
          school_id: SESSION_SCHOOL_ID,
          community_id: null,
          is_active: true,
        },
      ],
      fixture: { isFacilitator: true },
    });

    const session = payloadOf(res);
    expect(session.meeting_link).toBe(MEETING_LINK);
    expect(session.meeting_transcript).toBe(MEETING_TRANSCRIPT);
    expect(session.has_meeting).toBe(true);
    expect(session.join_path).toBe(`/meet/session/${SESSION_ID}`);
  });

  it('an admin keeps both raw fields AND gets has_meeting/join_path', async () => {
    const res = await runDetail({
      userId: ADMIN_USER_ID,
      highestRole: 'admin',
      roles: [{ role_type: 'admin', school_id: null, community_id: null, is_active: true }],
    });

    const session = payloadOf(res);
    expect(session.meeting_link).toBe(MEETING_LINK);
    expect(session.meeting_transcript).toBe(MEETING_TRANSCRIPT);
    expect(session.join_path).toBe(`/meet/session/${SESSION_ID}`);
  });

  it('a non-facilitating school consultor keeps the link but loses the transcript', async () => {
    const res = await runDetail({
      userId: CONSULTOR_USER_ID,
      highestRole: 'consultor',
      roles: [
        {
          role_type: 'consultor',
          school_id: SESSION_SCHOOL_ID,
          community_id: null,
          is_active: true,
        },
      ],
    });

    const session = payloadOf(res);
    expect(session.meeting_link).toBe(MEETING_LINK);
    expect(session).not.toHaveProperty('meeting_transcript');
    expect(serialize(res)).not.toContain(MEETING_TRANSCRIPT);
  });

  it('reports has_meeting=false / join_path=null for a session without a link', async () => {
    const res = await runDetail({
      userId: GC_USER_ID,
      highestRole: 'lider_comunidad',
      roles: gcMemberRoles,
      fixture: {
        session: { ...sessionRow, meeting_link: null, meeting_transcript: null },
      },
    });

    const session = payloadOf(res);
    expect(session.has_meeting).toBe(false);
    expect(session.join_path).toBeNull();
  });
});

// ------------------------------------------------------------------
// List GET
// ------------------------------------------------------------------

const listRow = {
  id: SESSION_ID,
  title: 'Sesión sintética',
  school_id: SESSION_SCHOOL_ID,
  growth_community_id: SESSION_COMMUNITY_ID,
  status: 'programada',
  meeting_link: MEETING_LINK,
  meeting_transcript: MEETING_TRANSCRIPT,
  session_facilitators: [
    {
      user_id: FACILITATOR_USER_ID,
      profiles: {
        first_name: 'Fabiola',
        last_name: 'Facilitadora',
        email: FACILITATOR_EMAIL,
      },
    },
  ],
  schools: { name: 'Colegio Sintético' },
  growth_communities: { name: 'Comunidad Sintética' },
};

function buildListClient(rows: unknown[]) {
  const resolved = { data: rows, error: null, count: rows.length };
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_t, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) => resolve(resolved);
      }
      return vi.fn(() => new Proxy({}, handler));
    },
  };
  return { from: vi.fn(() => new Proxy({}, handler)) };
}

async function runList(opts: {
  userId: string;
  roles: Record<string, unknown>[];
  highestRole: string | null;
  rows?: unknown[];
}) {
  const { getApiUser, createServiceRoleClient } = await import('../../../lib/api-auth');
  const { getUserRoles, getHighestRole } = await import('../../../utils/roleUtils');

  (getApiUser as any).mockResolvedValue({ user: { id: opts.userId }, error: null });
  (getUserRoles as any).mockResolvedValue(opts.roles);
  (getHighestRole as any).mockReturnValue(opts.highestRole);
  (createServiceRoleClient as any).mockReturnValue(buildListClient(opts.rows ?? [listRow]));

  const { req, res } = createMocks({ method: 'GET', query: {} });
  await listHandler(req as any, res as any);
  return res;
}

describe('GET /api/sessions — list payload disclosure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('a non-privileged GC member receives no facilitator e-mails', async () => {
    const res = await runList({
      userId: GC_USER_ID,
      highestRole: 'lider_comunidad',
      roles: [
        {
          role_type: 'lider_comunidad',
          community_id: SESSION_COMMUNITY_ID,
          school_id: SESSION_SCHOOL_ID,
          is_active: true,
        },
      ],
    });

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData()).data;
    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0].session_facilitators[0].profiles).not.toHaveProperty('email');
    expect(data.sessions[0].session_facilitators[0].profiles.first_name).toBe('Fabiola');
    expect(res._getData()).not.toContain(FACILITATOR_EMAIL);
  });

  it('a GC member keeps e-mails on rows where they are themselves a facilitator', async () => {
    const res = await runList({
      userId: FACILITATOR_USER_ID,
      highestRole: 'docente',
      roles: [
        {
          role_type: 'docente',
          community_id: SESSION_COMMUNITY_ID,
          school_id: SESSION_SCHOOL_ID,
          is_active: true,
        },
      ],
    });

    const data = JSON.parse(res._getData()).data;
    expect(data.sessions[0].session_facilitators[0].profiles.email).toBe(FACILITATOR_EMAIL);
  });

  it('admin keeps facilitator e-mails', async () => {
    const res = await runList({
      userId: ADMIN_USER_ID,
      highestRole: 'admin',
      roles: [{ role_type: 'admin', school_id: null, community_id: null, is_active: true }],
    });

    const data = JSON.parse(res._getData()).data;
    expect(data.sessions[0].session_facilitators[0].profiles.email).toBe(FACILITATOR_EMAIL);
  });

  it('a non-privileged GC member gets no meeting_link/transcript, only has_meeting + join_path', async () => {
    const res = await runList({
      userId: GC_USER_ID,
      highestRole: 'lider_comunidad',
      roles: [
        {
          role_type: 'lider_comunidad',
          community_id: SESSION_COMMUNITY_ID,
          school_id: SESSION_SCHOOL_ID,
          is_active: true,
        },
      ],
    });

    const row = JSON.parse(res._getData()).data.sessions[0];
    expect(row).not.toHaveProperty('meeting_link');
    expect(row).not.toHaveProperty('meeting_transcript');
    expect(row.has_meeting).toBe(true);
    expect(row.join_path).toBe(`/meet/session/${SESSION_ID}`);
    expect(res._getData()).not.toContain(MEETING_LINK);
    expect(res._getData()).not.toContain(MEETING_TRANSCRIPT);
  });

  it('admin keeps the raw meeting fields on list rows and still gets join_path', async () => {
    const res = await runList({
      userId: ADMIN_USER_ID,
      highestRole: 'admin',
      roles: [{ role_type: 'admin', school_id: null, community_id: null, is_active: true }],
    });

    const row = JSON.parse(res._getData()).data.sessions[0];
    expect(row.meeting_link).toBe(MEETING_LINK);
    expect(row.meeting_transcript).toBe(MEETING_TRANSCRIPT);
    expect(row.join_path).toBe(`/meet/session/${SESSION_ID}`);
  });

  it('school-scoped consultor keeps facilitator e-mails for their school', async () => {
    const res = await runList({
      userId: CONSULTOR_USER_ID,
      highestRole: 'consultor',
      roles: [
        {
          role_type: 'consultor',
          school_id: SESSION_SCHOOL_ID,
          community_id: null,
          is_active: true,
        },
      ],
    });

    const data = JSON.parse(res._getData()).data;
    expect(data.sessions[0].session_facilitators[0].profiles.email).toBe(FACILITATOR_EMAIL);
  });
});
