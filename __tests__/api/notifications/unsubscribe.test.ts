// @vitest-environment node
/**
 * N3-05 — the public unsubscribe endpoint. The token code is the real one; only
 * the database client is a stand-in that records the RPC it is asked for. The
 * database side of the same rows is proven by pgTAP 102.
 */
import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockCreateServiceRoleClient } = vi.hoisted(() => ({ mockCreateServiceRoleClient: vi.fn() }));

vi.mock('../../../lib/api-auth', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  createServiceRoleClient: mockCreateServiceRoleClient,
}));

import handler from '../../../pages/api/notifications/unsubscribe';
import { createUnsubscribeToken, type UnsubscribeScope } from '../../../lib/email/notification-unsubscribe';

const SECRET = 'synthetic-unsubscribe-secret-0123456789abcdef';
const U = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const DAY = 86400_000;
const COURSES: UnsubscribeScope = { category: 'courses', prefVersion: 7 };
const URLENCODED = { 'content-type': 'application/x-www-form-urlencoded' };
const ONE_CLICK = { 'List-Unsubscribe': 'One-Click' };
const BOUNDARY = '----synthetic-boundary';
const multipart = (...parts: Array<[string, string]>) =>
  `${parts.map(([name, value]) => `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`).join('')}--${BOUNDARY}--\r\n`;
const MULTIPART = { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` };

const categoryToken = (scope: UnsubscribeScope = COURSES, now = Date.now()) => createUnsubscribeToken('category', U, [scope], now) as string;

/** A database that answers the unsubscribe RPC with `outcomes`, in category order as the real function does. */
function database(outcomes: Record<string, string>) {
  const rpc = vi.fn(async (_name: string, args: { p_categories: string[] }) => ({
    data: [...args.p_categories].sort().map((category) => ({ category, outcome: outcomes[category], cancelled: 0 })),
    error: null,
  }));
  mockCreateServiceRoleClient.mockReturnValue({ rpc });
  return rpc;
}

async function invoke(options: { method?: string; t?: unknown; body?: unknown; headers?: Record<string, string> }) {
  const { req, res } = createMocks({
    method: (options.method ?? 'POST') as 'POST',
    query: options.t === undefined ? {} : { t: options.t },
    body: options.body as never,
    headers: options.headers ?? URLENCODED,
  });
  await handler(req as never, res as never);
  return res;
}
const oneClick = (t: unknown) => invoke({ t, body: ONE_CLICK });

/** Nothing reached the database, and neither the answer nor a log line repeats the token. */
function expectRefusedSilently(res: Awaited<ReturnType<typeof invoke>>, token: unknown) {
  expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  const printed = `${res._getData()} ${JSON.stringify(res._getHeaders())} ${JSON.stringify((console.error as any).mock.calls)}`;
  if (typeof token === 'string' && token) expect(printed).not.toContain(token);
  expect(printed).not.toContain(U);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NOTIFICATION_UNSUBSCRIBE_SECRET', SECRET);
  vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://genera.test');
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('D1 — a valid one-click POST', () => {
  it.each([
    ['urlencoded', URLENCODED, ONE_CLICK],
    ['urlencoded with a charset', { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' }, ONE_CLICK],
    ['multipart/form-data', MULTIPART, multipart(['List-Unsubscribe', 'One-Click'])],
  ])('%s, no session or cookie: one RPC for the signed user, category and version; 200', async (_name, headers, body) => {
    const rpc = database({ courses: 'unsubscribed' });
    const token = categoryToken();

    const res = await invoke({ t: token, body, headers });

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ ok: true, categories: [{ category: 'courses', outcome: 'unsubscribed' }] });
    expect(rpc.mock.calls).toEqual([['apply_notification_unsubscribe', { p_user_id: U, p_categories: ['courses'], p_versions: [7] }]]);
    expect(res.getHeader('Cache-Control')).toBe('no-store');
    expect(res.getHeader('Referrer-Policy')).toBe('no-referrer');
    expect(res._getData()).not.toContain(token);
  });

  it('a replay the database reports as already off is a success, with the same single RPC', async () => {
    const rpc = database({ courses: 'already_off' });

    const res = await oneClick(categoryToken());

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ ok: true, categories: [{ category: 'courses', outcome: 'already_off' }] });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('a token older than a later choice is answered 409 and says so', async () => {
    database({ courses: 'stale' });

    const res = await oneClick(categoryToken());

    expect(res._getStatusCode()).toBe(409);
    expect(res._getJSONData()).toEqual({ ok: false, categories: [{ category: 'courses', outcome: 'stale' }] });
  });

  it('a digest token applies all its categories in one RPC and reports each', async () => {
    const scopes: UnsubscribeScope[] = [COURSES, { category: 'community', prefVersion: 4 }, { category: 'assignments', prefVersion: 3 }];
    const rpc = database({ courses: 'unsubscribed', community: 'stale', assignments: 'already_off' });

    const res = await oneClick(createUnsubscribeToken('digest', U, scopes));

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      ok: true,
      categories: [
        { category: 'courses', outcome: 'unsubscribed' },
        { category: 'community', outcome: 'stale' },
        { category: 'assignments', outcome: 'already_off' },
      ],
    });
    expect(rpc.mock.calls).toEqual([
      ['apply_notification_unsubscribe', { p_user_id: U, p_categories: ['courses', 'community', 'assignments'], p_versions: [7, 4, 3] }],
    ]);
  });
});

describe('D2 — everything else fails closed, before the database', () => {
  const swapPayload = (token: string, change: (payload: any) => void) => {
    const [code, body, mac] = token.split('.');
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    change(payload);
    return `${code}.${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')}.${mac}`;
  };

  it.each([
    ['another user', (t: string) => swapPayload(t, (p) => { p[0] = OTHER; })],
    ['another category', (t: string) => swapPayload(t, (p) => { p[2][0][0] = 'sessions'; })],
    ['another version', (t: string) => swapPayload(t, (p) => { p[2][0][1] = 8; })],
    ['a later expiry', (t: string) => swapPayload(t, (p) => { p[1] += 86400; })],
    ['another purpose', (t: string) => `d${t.slice(1)}`],
    ['a cut signature', (t: string) => t.slice(0, -1)],
    ['no token', () => undefined],
    ['two tokens', (t: string) => [t, t]],
    ['text that is not a token', () => 'not-a-token'],
  ])('a token with %s: 400, no database client', async (_name, change) => {
    const token = change(categoryToken());

    const res = await oneClick(token);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'Enlace no válido' });
    expectRefusedSilently(res, token);
  });

  it.each([
    ['a category token', 'c', [['courses', 0]]],
    ['a digest token with one category', 'd', [['courses', 7], ['community', 0]]],
  ])('%s signed with this secret for version 0, which no preference row has: 400, no database client', async (_name, code, pairs) => {
    const signed = (scopes: unknown) => {
      const body = Buffer.from(JSON.stringify([U, Math.floor(Date.now() / 1000) + DAY / 1000, scopes]), 'utf8').toString('base64url');
      return `${code}.${body}.${createHmac('sha256', SECRET).update(`genera/notification-unsubscribe/v1\n${code}\n${body}`).digest('base64url')}`;
    };
    // The same signer is accepted for a version a row can have.
    database({ courses: 'unsubscribed' });
    expect((await oneClick(signed([['courses', 7]])))._getStatusCode()).toBe(200);
    mockCreateServiceRoleClient.mockClear();
    const token = signed(pairs);

    const res = await oneClick(token);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'Enlace no válido' });
    expectRefusedSilently(res, token);
  });

  it('an expired token: 410, no database client', async () => {
    const token = categoryToken(COURSES, Date.now() - 60 * DAY - 1000);

    const res = await oneClick(token);

    expect(res._getStatusCode()).toBe(410);
    expectRefusedSilently(res, token);
  });

  it.each([['unset', undefined], ['too short', 'too-short-synthetic-secret']])(
    'signing secret %s: 503, no database client',
    async (_name, secret) => {
      const token = categoryToken();
      if (secret === undefined) delete process.env.NOTIFICATION_UNSUBSCRIBE_SECRET;
      else vi.stubEnv('NOTIFICATION_UNSUBSCRIBE_SECRET', secret);

      const res = await oneClick(token);

      expect(res._getStatusCode()).toBe(503);
      expectRefusedSilently(res, token);
    }
  );

  it.each(['PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])('%s: 405, no database client, even with a valid token', async (method) => {
    const token = categoryToken();

    const res = await invoke({ method, t: token, body: ONE_CLICK });

    expect(res._getStatusCode()).toBe(405);
    expect(res.getHeader('Allow')).toBe('GET, POST');
    expectRefusedSilently(res, token);
  });

  it.each([
    ['no body', URLENCODED, undefined],
    ['an empty form', URLENCODED, {}],
    ['another value', URLENCODED, { 'List-Unsubscribe': 'one-click' }],
    ['an extra field', URLENCODED, { 'List-Unsubscribe': 'One-Click', category: 'sessions' }],
    ['a repeated field', URLENCODED, { 'List-Unsubscribe': ['One-Click', 'One-Click'] }],
    ['another field name', URLENCODED, { unsubscribe: 'One-Click' }],
    ['a JSON body', { 'content-type': 'application/json' }, ONE_CLICK],
    ['no content type', {}, ONE_CLICK],
    ['the form value sent as text', { 'content-type': 'text/plain' }, 'List-Unsubscribe=One-Click'],
    ['multipart with another value', MULTIPART, multipart(['List-Unsubscribe', 'Two-Click'])],
    ['multipart with an extra part', MULTIPART, multipart(['List-Unsubscribe', 'One-Click'], ['category', 'sessions'])],
    ['multipart with a repeated part', MULTIPART, multipart(['List-Unsubscribe', 'One-Click'], ['List-Unsubscribe', 'One-Click'])],
    ['multipart with another field name', MULTIPART, multipart(['unsubscribe', 'One-Click'])],
  ])('a POST with %s: 400, no database client, even with a valid token', async (_name, headers, body) => {
    const token = categoryToken();

    const res = await invoke({ t: token, body, headers });

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'Solicitud no válida' });
    expectRefusedSilently(res, token);
  });

  it.each([
    ['the database reports an error', () => mockCreateServiceRoleClient.mockReturnValue({ rpc: vi.fn(async () => ({ data: null, error: { message: `synthetic failure naming ${U}` } })) })],
    ['the database answers something else', () => mockCreateServiceRoleClient.mockReturnValue({ rpc: vi.fn(async () => ({ data: [], error: null })) })],
    ['the call throws', () => mockCreateServiceRoleClient.mockReturnValue({ rpc: vi.fn(async () => { throw new Error(`synthetic failure naming ${U}`); }) })],
    ['no client can be created', () => mockCreateServiceRoleClient.mockImplementation(() => { throw new Error('Server configuration error'); })],
  ])('%s: 500, and neither the answer nor the log names the token or the user', async (_name, arrange) => {
    arrange();
    const token = categoryToken();

    const res = await oneClick(token);

    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toEqual({ error: 'Error interno del servidor' });
    const printed = `${res._getData()} ${JSON.stringify((console.error as any).mock.calls)}`;
    expect(printed).not.toContain(token);
    expect(printed).not.toContain(U);
    expect(printed).not.toContain('synthetic failure');
  });
});

describe('D5 — GET changes nothing', () => {
  it('a GET with a token goes to the confirmation page with that token, without a database client', async () => {
    const token = categoryToken();

    const res = await invoke({ method: 'GET', t: token, headers: {} });

    expect(res._getStatusCode()).toBe(303);
    expect(res._getRedirectUrl()).toBe(`/notificaciones/baja?t=${token}`);
    expect(res.getHeader('Cache-Control')).toBe('no-store');
    expect(res.getHeader('Referrer-Policy')).toBe('no-referrer');
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it.each([
    ['no token', undefined],
    ['text that is not a token', 'https://example.invalid/?x=<script>'],
    ['two tokens', ['c.a.b', 'c.a.b']],
  ])('a GET with %s goes to the page without echoing it', async (_name, t) => {
    const res = await invoke({ method: 'GET', t, headers: {} });

    expect(res._getStatusCode()).toBe(303);
    expect(res._getRedirectUrl()).toBe('/notificaciones/baja');
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('a GET carrying the one-click body is still only a redirect', async () => {
    const res = await invoke({ method: 'GET', t: categoryToken(), body: ONE_CLICK });

    expect(res._getStatusCode()).toBe(303);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  /** The page's read: `GET ?info=1`. */
  const info = (t: unknown, body?: unknown) => {
    const { req, res } = createMocks({ method: 'GET', query: { info: '1', ...(t === undefined ? {} : { t }) }, body: body as never, headers: URLENCODED });
    return (handler(req as never, res as never) as Promise<unknown>).then(() => res);
  };

  it('info for a category token names its category, without a database client', async () => {
    const token = categoryToken();

    const res = await info(token);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ digest: false, categories: [{ id: 'courses', label: 'Cursos y aprendizaje' }] });
    expect(res.getHeader('Cache-Control')).toBe('no-store');
    expect(res.getHeader('Referrer-Policy')).toBe('no-referrer');
    expectRefusedSilently(res, token);
  });

  it('info for a digest token names every category, even with the one-click body attached: still no database client', async () => {
    const token = createUnsubscribeToken('digest', U, [COURSES, { category: 'community', prefVersion: 4 }]) as string;

    const res = await info(token, ONE_CLICK);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      digest: true,
      categories: [{ id: 'courses', label: 'Cursos y aprendizaje' }, { id: 'community', label: 'Comunidad y menciones' }],
    });
    expectRefusedSilently(res, token);
  });

  it.each([
    ['a tampered token', () => `${categoryToken().slice(0, -2)}${categoryToken().endsWith('AA') ? 'BB' : 'AA'}`, 400],
    ['another purpose', () => `d${categoryToken().slice(1)}`, 400],
    ['no token', () => undefined, 400],
    ['an expired token', () => categoryToken(COURSES, Date.now() - 60 * DAY - 1000), 410],
  ])('info for %s: refused like the POST, no database client', async (_name, make, status) => {
    const token = make();

    const res = await info(token);

    expect(res._getStatusCode()).toBe(status);
    expectRefusedSilently(res, token);
  });

  it('info with no signing secret: 503, no database client', async () => {
    const token = categoryToken();
    delete process.env.NOTIFICATION_UNSUBSCRIBE_SECRET;

    const res = await info(token);

    expect(res._getStatusCode()).toBe(503);
    expectRefusedSilently(res, token);
  });
});
