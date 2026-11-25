// @vitest-environment node
/**
 * L6 and L7: `/api/admin/correos/vista-previa`, through GENERA's real host, outbound policy and
 * `deliverOutboundEmail`. The only stand-ins: the admin check (`lib/api-auth`), the database client, and the
 * provider SDK (a fake that records what it was asked to send). Invented people; no network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';
import type { NextApiRequest, NextApiResponse } from 'next';

const { sdkSend, auth } = vi.hoisted(() => ({
  sdkSend: vi.fn(),
  auth: {
    checkIsAdmin: vi.fn(),
    getForcedPasswordChangeVerdict: vi.fn(),
    client: null as any,
  },
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sdkSend };
  },
}));

vi.mock('../../lib/api-auth', () => ({
  checkIsAdmin: auth.checkIsAdmin,
  getForcedPasswordChangeVerdict: auth.getForcedPasswordChangeVerdict,
  createServiceRoleClient: () => auth.client,
}));

import handler from '../../pages/api/admin/correos/vista-previa';

const ADMIN = { id: 'admin-sintetico-1', email: 'admin.sintetico@example.test' };
const DOCENTE = { id: 'docente-sintetico-1', email: 'docente.sintetica@example.test' };
const OTHER = 'otra.persona@correos-prueba.invalid';

/** A database stand-in for the outbound policy: the user's schools and each school's tenant kind. */
function tenantClient(options: { profileSchoolId?: number | null; roleSchoolIds?: number[]; schools?: any[]; failProfile?: boolean } = {}) {
  const { profileSchoolId = null, roleSchoolIds = [], schools = [], failProfile = false } = options;
  return {
    from(table: string) {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () =>
                failProfile ? { data: null, error: { message: 'lookup failed' } } : { data: { school_id: profileSchoolId }, error: null },
            }),
          }),
        };
      }
      if (table === 'user_roles') {
        const result = { data: roleSchoolIds.map((school_id) => ({ school_id })), error: null };
        const chain: any = { select: () => chain, eq: () => chain, not: async () => result };
        return chain;
      }
      if (table === 'schools') {
        return {
          select: () => ({
            eq: (_column: string, id: number) => ({
              maybeSingle: async () => ({ data: schools.find((school) => school.id === id) ?? null, error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

function signedInAs(user: { id: string; email: string } | null, isAdmin: boolean) {
  auth.checkIsAdmin.mockResolvedValue({ user, isAdmin, error: null });
}

async function call(method: string, body?: unknown) {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: method as any,
    url: '/api/admin/correos/vista-previa',
    headers: { 'content-type': 'application/json' },
    body: body as any,
  });
  await handler(req, res);
  const raw = res._getData();
  return { status: res._getStatusCode(), raw: typeof raw === 'string' ? raw : JSON.stringify(raw), json: res._getJSONData?.() };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://genera.example.test');
  vi.stubEnv('RESEND_API_KEY', 're_sintetica_falsa');
  vi.stubEnv('EMAIL_FROM_ADDRESS', '');
  vi.stubEnv('E2E_MAIL_OUTBOX', '');
  auth.getForcedPasswordChangeVerdict.mockResolvedValue('allowed');
  auth.client = tenantClient();
  sdkSend.mockResolvedValue({ data: { id: 'mensaje-falso-1' }, error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** A refusal must hold no email content. */
function expectNoEmailContent(raw: string) {
  expect(raw).not.toMatch(/<html|<!DOCTYPE|Novedades de este mes|fne-logo|PRUEBA/i);
}

describe('L6: who gets in', () => {
  it('a visitor gets 401 and no email content', async () => {
    signedInAs(null, false);
    for (const method of ['GET', 'POST']) {
      const result = await call(method);
      expect(result.status).toBe(401);
      expectNoEmailContent(result.raw);
    }
  });

  it('a non-admin gets 403 and no email content', async () => {
    signedInAs(DOCENTE, false);
    for (const method of ['GET', 'POST']) {
      const result = await call(method);
      expect(result.status).toBe(403);
      expectNoEmailContent(result.raw);
    }
  });

  it('an admin who must change their password first gets 403', async () => {
    signedInAs(ADMIN, true);
    auth.getForcedPasswordChangeVerdict.mockResolvedValue('must_change');
    const result = await call('GET');
    expect(result.status).toBe(403);
    expectNoEmailContent(result.raw);
  });

  it('an admin gets the sample in GENERA brand', async () => {
    signedInAs(ADMIN, true);
    const result = await call('GET');
    expect(result.status).toBe(200);
    expect(result.json.subject).toBe('Novedades de este mes');
    expect(result.json.html).toContain('https://genera.example.test/logos/fne-logo-bw.png');
    expect(result.json.html).toContain('#fbbf24');
    expect(result.json.html).toContain('Fundación Nueva Educación');
    expect(result.json.html).toContain('https://genera.example.test/images/collaborative-photo.png');
    expect(result.json.text).toContain('Ver las actividades');
    expect(sdkSend).not.toHaveBeenCalled();
  });

  it('any other method gets 405 and sends nothing', async () => {
    signedInAs(ADMIN, true);
    for (const method of ['PUT', 'DELETE', 'PATCH']) {
      const result = await call(method);
      expect(result.status).toBe(405);
    }
    expect(sdkSend).not.toHaveBeenCalled();
  });
});

describe('L7: send me a test', () => {
  it("hands exactly one message to the mail service, to the admin's own address, subject [PRUEBA], today's sender", async () => {
    signedInAs(ADMIN, true);
    const result = await call('POST');
    expect(result.status).toBe(200);
    expect(result.json).toEqual({ status: 'sent', to: ADMIN.email });
    expect(sdkSend).toHaveBeenCalledTimes(1);
    const message = sdkSend.mock.calls[0][0];
    expect(message.to).toBe(ADMIN.email);
    expect(message.subject.startsWith('[PRUEBA] ')).toBe(true);
    // Today's sender (resolveSender's default), not the brand's campaign sender.
    expect(message.from).toBe('Genera <notificaciones@nuevaeducacion.org>');
    expect(message.from).not.toContain('boletin');
    expect(message.html).toContain('fne-logo-bw.png');
    expect(typeof message.text).toBe('string');
    expect(message).not.toHaveProperty('cc');
    expect(message).not.toHaveProperty('bcc');
  });

  it('asks the outbound policy first (a failed lookup refuses and sends nothing)', async () => {
    signedInAs(ADMIN, true);
    auth.client = tenantClient({ failProfile: true });
    const result = await call('POST');
    expect(result.status).toBe(422);
    expect(result.json).toEqual({ status: 'not_sent', reason: 'user_lookup_failed' });
    expect(sdkSend).not.toHaveBeenCalled();
  });

  it('a body naming another address still sends only to the admin', async () => {
    signedInAs(ADMIN, true);
    const result = await call('POST', {
      to: OTHER,
      email: OTHER,
      recipient: OTHER,
      recipients: [OTHER],
      cc: OTHER,
      bcc: [OTHER],
      address: OTHER,
    });
    expect(result.status).toBe(200);
    expect(sdkSend).toHaveBeenCalledTimes(1);
    const message = sdkSend.mock.calls[0][0];
    expect(message.to).toBe(ADMIN.email);
    expect(JSON.stringify(message)).not.toContain(OTHER);
  });

  it('a visitor and a non-admin send nothing', async () => {
    signedInAs(null, false);
    expect((await call('POST', { to: OTHER })).status).toBe(401);
    signedInAs(DOCENTE, false);
    expect((await call('POST', { to: OTHER })).status).toBe(403);
    expect(sdkSend).not.toHaveBeenCalled();
  });

  it('an admin tied to a QA school sends nothing (suppressed, not a real send)', async () => {
    signedInAs(ADMIN, true);
    auth.client = tenantClient({
      profileSchoolId: null,
      roleSchoolIds: [257],
      schools: [{ id: 257, tenant_kind: 'qa', internal_zoom_testing_enabled: false }],
    });
    const result = await call('POST');
    expect(result.status).toBe(422);
    expect(result.json).toEqual({ status: 'not_sent', reason: 'suppressed_qa' });
    expect(sdkSend).not.toHaveBeenCalled();
  });

  it('reports "not configured" and sends nothing when the mail service is not configured', async () => {
    signedInAs(ADMIN, true);
    vi.stubEnv('RESEND_API_KEY', '');
    const result = await call('POST');
    expect(result.status).toBe(503);
    expect(result.json).toEqual({ status: 'not_configured' });
    expect(sdkSend).not.toHaveBeenCalled();
  });

  it('reports "not configured" and sends nothing when the sender is invalid', async () => {
    signedInAs(ADMIN, true);
    vi.stubEnv('EMAIL_FROM_ADDRESS', 'no es un remitente');
    const result = await call('POST');
    expect(result.status).toBe(503);
    expect(sdkSend).not.toHaveBeenCalled();
  });

  it('a provider refusal is reported as not sent', async () => {
    signedInAs(ADMIN, true);
    sdkSend.mockResolvedValue({ data: null, error: { message: 'rechazado', statusCode: 422 } });
    const result = await call('POST');
    expect(result.status).toBe(422);
    expect(result.json.status).toBe('not_sent');
    expect(sdkSend).toHaveBeenCalledTimes(1);
  });
});
