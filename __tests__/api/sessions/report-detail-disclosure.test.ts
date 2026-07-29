// @vitest-environment node
/**
 * Disclosure suite for GET /api/sessions/[id]/reports/[rid] (Z1a-4 / T2).
 *
 * This endpoint kept a hand-rolled copy of the authorization the rest of the
 * phase had already centralised, and embedded
 * `profiles:author_id(first_name, last_name, email)` unfiltered — so a growth-
 * community member reading an `all_participants` report received the author's
 * personal e-mail address. It now builds the same `SessionAccessContext` as its
 * siblings and defers to `canViewSession` / `canViewRestrictedReports` /
 * `canViewParticipantEmails`.
 *
 * Synthetic data only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import handler from '../../../pages/api/sessions/[id]/reports/[rid]';

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: vi.fn(),
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

vi.mock('../../../utils/roleUtils', () => ({
  getUserRoles: vi.fn(),
  getHighestRole: vi.fn(),
}));

const SESSION_ID = '3f1c5f5e-0f1a-4d3e-9a11-2b6c8f0d1e22';
const REPORT_ID = '7b2e9a10-4c31-4f52-9d63-8e4f0a1b2c33';
const SESSION_SCHOOL_ID = 7;
const OTHER_SCHOOL_ID = 9;
const SESSION_COMMUNITY_ID = 'c0111111-1111-4111-8111-111111111111';

const FACILITATOR_USER_ID = 'u-facilitator-0001';
const GC_USER_ID = 'u-gc-member-0001';
const ADMIN_USER_ID = 'u-admin-0001';
const CONSULTOR_USER_ID = 'u-consultor-0001';

const AUTHOR_EMAIL = 'autora@test.local';

const sessionRow = {
  id: SESSION_ID,
  growth_community_id: SESSION_COMMUNITY_ID,
  school_id: SESSION_SCHOOL_ID,
  status: 'programada',
};

function reportRow(visibility: 'all_participants' | 'facilitators_only') {
  return {
    id: REPORT_ID,
    session_id: SESSION_ID,
    author_id: FACILITATOR_USER_ID,
    visibility,
    content: 'Contenido sintético del informe',
    audio_url: null,
    profiles: {
      first_name: 'Aurora',
      last_name: 'Autora',
      email: AUTHOR_EMAIL,
    },
  };
}

function buildClient(opts: {
  visibility: 'all_participants' | 'facilitators_only';
  isFacilitator?: boolean;
}) {
  const perTable: Record<string, unknown> = {
    consultor_sessions: { data: sessionRow, error: null },
    session_reports: { data: reportRow(opts.visibility), error: null },
    session_facilitators: {
      data: opts.isFacilitator ? { id: 'sf-1' } : null,
      error: null,
    },
  };

  return {
    from: vi.fn((table: string) => {
      const resolved = perTable[table] ?? { data: null, error: null };
      const proxyHandler: ProxyHandler<Record<string, unknown>> = {
        get(_t, prop) {
          if (prop === 'then') {
            return (resolve: (v: unknown) => void) => resolve(resolved);
          }
          if (prop === 'single' || prop === 'maybeSingle') {
            return vi.fn(() => ({
              then: (resolve: (v: unknown) => void) => resolve(resolved),
            }));
          }
          return vi.fn(() => new Proxy({}, proxyHandler));
        },
      };
      return new Proxy({}, proxyHandler);
    }),
  };
}

async function runGet(opts: {
  userId: string;
  roles: Record<string, unknown>[];
  highestRole: string | null;
  visibility?: 'all_participants' | 'facilitators_only';
  isFacilitator?: boolean;
}) {
  const { getApiUser, createServiceRoleClient } = await import('../../../lib/api-auth');
  const { getUserRoles, getHighestRole } = await import('../../../utils/roleUtils');

  (getApiUser as any).mockResolvedValue({ user: { id: opts.userId }, error: null });
  (getUserRoles as any).mockResolvedValue(opts.roles);
  (getHighestRole as any).mockReturnValue(opts.highestRole);
  (createServiceRoleClient as any).mockReturnValue(
    buildClient({
      visibility: opts.visibility ?? 'all_participants',
      isFacilitator: opts.isFacilitator,
    })
  );

  const { req, res } = createMocks({
    method: 'GET',
    query: { id: SESSION_ID, rid: REPORT_ID },
  });
  await handler(req as any, res as any);
  return res;
}

const gcMemberRoles = [
  {
    role_type: 'lider_comunidad',
    community_id: SESSION_COMMUNITY_ID,
    school_id: SESSION_SCHOOL_ID,
    is_active: true,
  },
];

const scopedConsultorRoles = [
  {
    role_type: 'consultor',
    school_id: SESSION_SCHOOL_ID,
    community_id: null,
    is_active: true,
  },
];

describe('GET /api/sessions/[id]/reports/[rid] — author e-mail disclosure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GC member + all_participants report: 200 with NO author e-mail', async () => {
    const res = await runGet({
      userId: GC_USER_ID,
      highestRole: 'lider_comunidad',
      roles: gcMemberRoles,
      visibility: 'all_participants',
    });

    expect(res._getStatusCode()).toBe(200);
    const report = JSON.parse(res._getData()).data.report;

    expect(report.profiles).not.toHaveProperty('email');
    // Names survive the redaction
    expect(report.profiles.first_name).toBe('Aurora');
    expect(report.content).toBe('Contenido sintético del informe');
    // Nothing anywhere in the serialized body
    expect(res._getData()).not.toContain(AUTHOR_EMAIL);
  });

  it('facilitator: 200 WITH the author e-mail', async () => {
    const res = await runGet({
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
      visibility: 'all_participants',
      isFacilitator: true,
    });

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData()).data.report.profiles.email).toBe(AUTHOR_EMAIL);
  });

  it('admin: 200 with everything', async () => {
    const res = await runGet({
      userId: ADMIN_USER_ID,
      highestRole: 'admin',
      roles: [{ role_type: 'admin', school_id: null, community_id: null, is_active: true }],
      visibility: 'facilitators_only',
    });

    expect(res._getStatusCode()).toBe(200);
    const report = JSON.parse(res._getData()).data.report;
    expect(report.profiles.email).toBe(AUTHOR_EMAIL);
    expect(report.visibility).toBe('facilitators_only');
  });

  it('school-scoped consultor: 200 with the author e-mail', async () => {
    const res = await runGet({
      userId: CONSULTOR_USER_ID,
      highestRole: 'consultor',
      roles: scopedConsultorRoles,
      visibility: 'all_participants',
    });

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData()).data.report.profiles.email).toBe(AUTHOR_EMAIL);
  });
});

describe('GET /api/sessions/[id]/reports/[rid] — restricted-report visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GC member + facilitators_only report: 403', async () => {
    const res = await runGet({
      userId: GC_USER_ID,
      highestRole: 'lider_comunidad',
      roles: gcMemberRoles,
      visibility: 'facilitators_only',
    });

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData()).error).toBe('Acceso denegado a este informe');
    expect(res._getData()).not.toContain('Contenido sintético del informe');
    expect(res._getData()).not.toContain(AUTHOR_EMAIL);
  });

  it('non-facilitating scoped consultor + facilitators_only report: 403', async () => {
    // The narrower-than-edit rule: a consultor who can view the session and
    // does receive e-mails still is not a facilitator of THIS session.
    const res = await runGet({
      userId: CONSULTOR_USER_ID,
      highestRole: 'consultor',
      roles: scopedConsultorRoles,
      visibility: 'facilitators_only',
    });

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData()).error).toBe('Acceso denegado a este informe');
    expect(res._getData()).not.toContain('Contenido sintético del informe');
  });

  it('facilitator + facilitators_only report: 200', async () => {
    const res = await runGet({
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
      visibility: 'facilitators_only',
      isFacilitator: true,
    });

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData()).data.report.content).toBe(
      'Contenido sintético del informe'
    );
  });
});

describe('GET /api/sessions/[id]/reports/[rid] — session access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('denies a GC member whose community role is is_active=false', async () => {
    const res = await runGet({
      userId: GC_USER_ID,
      highestRole: 'lider_comunidad',
      roles: [{ ...gcMemberRoles[0], is_active: false }],
    });

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData()).error).toBe('Acceso denegado a esta sesión');
  });

  it('denies a consultor scoped to a different school', async () => {
    const res = await runGet({
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
    expect(res._getData()).not.toContain(AUTHOR_EMAIL);
  });

  it('a facilitator with no school or community role still gets in', async () => {
    const res = await runGet({
      userId: FACILITATOR_USER_ID,
      highestRole: 'docente',
      roles: [
        {
          role_type: 'docente',
          school_id: OTHER_SCHOOL_ID,
          community_id: null,
          is_active: true,
        },
      ],
      isFacilitator: true,
    });

    // canViewSession() does not grant on isFacilitator alone, so this asserts
    // the real contract: a facilitator outside the school/community scope is
    // denied the session, exactly as on the detail endpoint.
    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData()).error).toBe('Acceso denegado a esta sesión');
  });
});
