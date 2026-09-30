// @vitest-environment node
/**
 * N3-05 unsubscribe tokens and links. Everything is synthetic: the secret, the
 * user ids and the origin exist only here.
 */
import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyUnsubscribe,
  buildDigestUnsubscribeLinks,
  createUnsubscribeToken,
  isUnsubscribeTokenShape,
  preferenceVersionForLink,
  unsubscribeHeaders,
  unsubscribePageUrl,
  verifyUnsubscribeToken,
  type UnsubscribeScope,
  type VerifiedUnsubscribe,
} from '../../../lib/email/notification-unsubscribe';
import { sendNotificationEmail } from '../../../lib/email/notifications';

const SECRET = 'synthetic-unsubscribe-secret-0123456789abcdef';
const DOMAIN = 'genera/notification-unsubscribe/v1';
const U = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const BASE_URL = 'https://genera.test';
const NOW = Date.UTC(2026, 8, 30, 12);
const DAY = 86400_000;
const EXPIRES = NOW / 1000 + 60 * 86400;
const COURSES: UnsubscribeScope = { category: 'courses', prefVersion: 7 };

/** A token signed here, with any secret, domain, code and payload: what a forger or another purpose would produce. */
function forge(payload: unknown, { code = 'c', secret = SECRET, domain = DOMAIN, signedCode = code } = {}): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const mac = createHmac('sha256', secret).update(`${domain}\n${signedCode}\n${body}`).digest('base64url');
  return `${code}.${body}.${mac}`;
}
const payloadOf = (token: string) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
/** The same token with another payload and its original signature. */
function withPayload(token: string, change: (payload: any) => void): string {
  const [code, , mac] = token.split('.');
  const payload = payloadOf(token);
  change(payload);
  return `${code}.${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')}.${mac}`;
}
const tokenOf = (url: string) => new URL(url).searchParams.get('t') as string;

let logs: Array<ReturnType<typeof vi.spyOn>>;

beforeEach(() => {
  vi.stubEnv('NOTIFICATION_UNSUBSCRIBE_SECRET', SECRET);
  vi.stubEnv('NEXT_PUBLIC_BASE_URL', BASE_URL);
  logs = ['log', 'error', 'warn', 'info'].map((level) => vi.spyOn(console, level as 'log').mockImplementation(() => undefined));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('D2 — a token is accepted only as it was signed', () => {
  it('a category token verifies to its user, category and version, until it expires', () => {
    const token = createUnsubscribeToken('category', U, [COURSES], NOW) as string;

    expect(isUnsubscribeTokenShape(token)).toBe(true);
    expect(payloadOf(token)).toEqual([U, EXPIRES, [['courses', 7]]]);
    expect(verifyUnsubscribeToken(token, NOW)).toEqual({ ok: true, kind: 'category', userId: U, scopes: [COURSES] });
    expect(verifyUnsubscribeToken(token, NOW + 60 * DAY - 1000)).toMatchObject({ ok: true });
    expect(verifyUnsubscribeToken(token, NOW + 60 * DAY)).toEqual({ ok: false, reason: 'expired' });
    expect(verifyUnsubscribeToken(token, NOW + 61 * DAY)).toEqual({ ok: false, reason: 'expired' });
  });

  it.each([
    ['another user', (p: any) => { p[0] = OTHER; }],
    ['another category', (p: any) => { p[2][0][0] = 'sessions'; }],
    ['another version', (p: any) => { p[2][0][1] = 8; }],
    ['a later expiry', (p: any) => { p[1] += 86400; }],
    ['an added category', (p: any) => { p[2].push(['sessions', 1]); }],
  ])('tampered with %s: invalid', (_name, change) => {
    const token = createUnsubscribeToken('category', U, [COURSES], NOW) as string;
    expect(verifyUnsubscribeToken(withPayload(token, change), NOW)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('a changed signature is invalid, including one that differs only in unused bits', () => {
    const token = createUnsubscribeToken('category', U, [COURSES], NOW) as string;
    const [code, body, mac] = token.split('.');
    const flipped = `${mac.slice(0, 10)}${mac[10] === 'A' ? 'B' : 'A'}${mac.slice(11)}`;
    // The last character carries two unused bits: the next alphabet letter decodes to the same 32 bytes.
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const sameBytes = `${mac.slice(0, -1)}${alphabet[alphabet.indexOf(mac.slice(-1)) ^ 1]}`;
    expect(Buffer.from(sameBytes, 'base64url').equals(Buffer.from(mac, 'base64url'))).toBe(true);

    for (const bad of [flipped, sameBytes]) {
      expect(verifyUnsubscribeToken(`${code}.${body}.${bad}`, NOW)).toEqual({ ok: false, reason: 'invalid' });
    }
  });

  it.each([
    ['a category token relabelled as a digest token', (t: string) => `d${t.slice(1)}`],
    ['a digest token relabelled as a category token', () => `c${(createUnsubscribeToken('digest', U, [COURSES], NOW) as string).slice(1)}`],
    ['the same payload signed for another purpose of this secret', () => forge([U, EXPIRES, [['courses', 7]]], { domain: 'genera/notification-email-snapshot/v1' })],
    ['the same payload signed without the purpose', () => forge([U, EXPIRES, [['courses', 7]]], { signedCode: '' })],
    ['the same payload signed with another secret', () => forge([U, EXPIRES, [['courses', 7]]], { secret: 'another-synthetic-secret-0123456789abcdef' })],
  ])('wrong purpose — %s: invalid', (_name, make) => {
    const token = createUnsubscribeToken('category', U, [COURSES], NOW) as string;
    expect(forge([U, EXPIRES, [['courses', 7]]])).toBe(token);
    expect(verifyUnsubscribeToken(make(token), NOW)).toEqual({ ok: false, reason: 'invalid' });
  });

  it.each([
    ['not a list', { u: U }, 'c'],
    ['a category token with two categories', [U, EXPIRES, [['courses', 7], ['sessions', 1]]], 'c'],
    ['no category', [U, EXPIRES, []], 'd'],
    ['nine categories', [U, EXPIRES, Array.from({ length: 9 }, () => ['courses', 1])], 'd'],
    ['a repeated category', [U, EXPIRES, [['courses', 1], ['courses', 2]]], 'd'],
    ['an unknown category', [U, EXPIRES, [['marketing', 1]]], 'c'],
    ['an inherited property name as category', [U, EXPIRES, [['constructor', 1]]], 'c'],
    ['a negative version', [U, EXPIRES, [['courses', -1]]], 'c'],
    ['version 0, which no preference row has', [U, EXPIRES, [['courses', 0]]], 'c'],
    ['version 0 among the categories of a digest', [U, EXPIRES, [['courses', 7], ['community', 0]]], 'd'],
    ['a fractional version', [U, EXPIRES, [['courses', 1.5]]], 'c'],
    ['a text version', [U, EXPIRES, [['courses', '7']]], 'c'],
    ['a user that is not a UUID', ['not-a-user-id-but-long-enough-to-pass', EXPIRES, [['courses', 7]]], 'c'],
    ['no expiry', [U, null, [['courses', 7]]], 'c'],
    ['an extra field', [U, EXPIRES, [['courses', 7]], 'extra'], 'c'],
  ])('correctly signed but %s: invalid', (_name, payload, code) => {
    expect(verifyUnsubscribeToken(forge(payload, { code }), NOW)).toEqual({ ok: false, reason: 'invalid' });
  });

  it.each([
    ['undefined', undefined],
    ['a list', ['c.a.b']],
    ['empty', ''],
    ['two parts', 'c.abc'],
    ['an unknown purpose code', `x.${'a'.repeat(60)}.${'b'.repeat(43)}`],
    ['a short signature', `c.${'a'.repeat(60)}.${'b'.repeat(42)}`],
    ['characters outside the alphabet', `c.${'a'.repeat(59)}+.${'b'.repeat(43)}`],
    ['an oversized body', `c.${'a'.repeat(601)}.${'b'.repeat(43)}`],
  ])('malformed — %s: refused by shape alone', (_name, token) => {
    expect(isUnsubscribeTokenShape(token)).toBe(false);
    expect(verifyUnsubscribeToken(token, NOW)).toEqual({ ok: false, reason: 'malformed' });
  });

  it.each([['unset', undefined], ['empty', ''], ['shorter than 32 characters', 'too-short-synthetic-secret']])(
    'secret %s: nothing is signed and nothing verifies',
    (_name, secret) => {
      const token = createUnsubscribeToken('category', U, [COURSES], NOW) as string;
      if (secret === undefined) delete process.env.NOTIFICATION_UNSUBSCRIBE_SECRET;
      else vi.stubEnv('NOTIFICATION_UNSUBSCRIBE_SECRET', secret);

      expect(createUnsubscribeToken('category', U, [COURSES], NOW)).toBeNull();
      expect(buildDigestUnsubscribeLinks(U, [COURSES], NOW)).toBeNull();
      expect(verifyUnsubscribeToken(token, NOW)).toEqual({ ok: false, reason: 'not_configured' });
    }
  );

  it.each([
    ['a user that is not a UUID', 'category', 'someone', [COURSES]],
    ['two categories in a category token', 'category', U, [COURSES, { category: 'sessions', prefVersion: 1 }]],
    ['no category', 'digest', U, []],
    ['a repeated category', 'digest', U, [COURSES, COURSES]],
    ['an unknown category', 'category', U, [{ category: 'marketing', prefVersion: 1 }]],
    ['a version that is not a whole number', 'category', U, [{ category: 'courses', prefVersion: null }]],
    ['version 0, which no preference row has', 'category', U, [{ category: 'courses', prefVersion: 0 }]],
    ['version 0 among the categories of a digest', 'digest', U, [COURSES, { category: 'community', prefVersion: 0 }]],
  ])('%s is never signed', (_name, kind, userId, scopes) => {
    expect(createUnsubscribeToken(kind as 'category', userId, scopes as UnsubscribeScope[], NOW)).toBeNull();
  });

  it('no refusal logs anything', () => {
    const token = createUnsubscribeToken('category', U, [COURSES], NOW) as string;
    verifyUnsubscribeToken(withPayload(token, (p) => { p[0] = OTHER; }), NOW);
    verifyUnsubscribeToken(token, NOW + 61 * DAY);
    verifyUnsubscribeToken('not a token', NOW);
    expect(logs.flatMap((spy) => spy.mock.calls)).toEqual([]);
  });

  it('the synchronous sender needs no unsubscribe secret and sends as before, without the headers', async () => {
    delete process.env.NOTIFICATION_UNSUBSCRIBE_SECRET;
    delete process.env.NOTIFICATION_OUTBOX_DELIVERY;
    vi.stubEnv('EMAIL_FROM_ADDRESS', '');
    const tables: Record<string, Array<Record<string, unknown>>> = {
      profiles: [{ id: U, email: 'destinataria.sintetica@ejemplo.invalid', school_id: null }],
    };
    const client = {
      from(table: string) {
        const filters: Array<(row: Record<string, unknown>) => boolean> = [];
        const found = () => (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
        const builder: any = {
          select: () => builder,
          eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), builder),
          not: (column: string) => (filters.push((row) => row[column] !== null && row[column] !== undefined), builder),
          maybeSingle: async () => ({ data: found()[0] ?? null, error: null }),
          then: (resolve: any, reject: any) => Promise.resolve({ data: found(), error: null }).then(resolve, reject),
        };
        return builder;
      },
    };
    const transport = vi.fn(async () => ({ data: { id: 'provider-message-1' }, error: null }));

    const result = await sendNotificationEmail(client as never, { userId: U, title: 'Aviso sintético', relatedUrl: '/dashboard' }, transport);

    expect(result).toEqual({ sent: true, status: 'provider_accepted', providerMessageId: 'provider-message-1' });
    expect(transport).toHaveBeenCalledTimes(1);
    expect((transport.mock.calls[0] as unknown[])[0]).not.toHaveProperty('headers');
  });
});

describe('D4 — links and headers', () => {
  it('the headers carry the one-click URL of the API route; the page URL is the confirmation page', () => {
    const token = createUnsubscribeToken('category', U, [COURSES], NOW) as string;

    expect(unsubscribeHeaders(token)).toEqual({
      'List-Unsubscribe': `<${BASE_URL}/api/notifications/unsubscribe?t=${token}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
    expect(unsubscribePageUrl(token)).toBe(`${BASE_URL}/notificaciones/baja?t=${token}`);
    expect(encodeURIComponent(token)).toBe(token);
  });

  it('a digest gets one header link for all its categories and a distinct body link per category', () => {
    const scopes: UnsubscribeScope[] = [COURSES, { category: 'community', prefVersion: 4 }, { category: 'assignments', prefVersion: 12 }];

    const links = buildDigestUnsubscribeLinks(U, scopes, NOW);

    expect(links?.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    const headerUrl = links!.headers['List-Unsubscribe'].slice(1, -1);
    expect(headerUrl.startsWith(`${BASE_URL}/api/notifications/unsubscribe?t=d.`)).toBe(true);
    expect(verifyUnsubscribeToken(tokenOf(headerUrl), NOW)).toEqual({ ok: true, kind: 'digest', userId: U, scopes });

    expect(links!.categoryLinks.map(({ category, label }) => [category, label])).toEqual([
      ['courses', 'Cursos y aprendizaje'], ['community', 'Comunidad y menciones'], ['assignments', 'Tareas y evaluaciones'],
    ]);
    expect(new Set(links!.categoryLinks.map((link) => link.url)).size).toBe(3);
    links!.categoryLinks.forEach((link, index) => {
      expect(link.url.startsWith(`${BASE_URL}/notificaciones/baja?t=c.`)).toBe(true);
      expect(verifyUnsubscribeToken(tokenOf(link.url), NOW)).toEqual({ ok: true, kind: 'category', userId: U, scopes: [scopes[index]] });
    });
  });

  it.each([
    ['no category', []],
    ['a repeated category', [COURSES, COURSES]],
    ['nine entries', Array.from({ length: 9 }, () => COURSES)],
    ['a category at version 0', [COURSES, { category: 'community', prefVersion: 0 }]],
  ])('a digest with %s gets no links at all', (_name, scopes) => {
    expect(buildDigestUnsubscribeLinks(U, scopes, NOW)).toBeNull();
  });
});

describe('D1 — applying a verified token', () => {
  const verified: VerifiedUnsubscribe = {
    ok: true, kind: 'digest', userId: U, scopes: [COURSES, { category: 'community', prefVersion: 4 }],
  };
  const clientAnswering = (answer: unknown) => ({ rpc: vi.fn(async () => answer) });

  it('one RPC call carries the user, the categories and their versions, and its outcomes come back per category', async () => {
    const client = clientAnswering({
      data: [{ category: 'community', outcome: 'stale', cancelled: 0 }, { category: 'courses', outcome: 'unsubscribed', cancelled: 2 }],
      error: null,
    });

    expect(await applyUnsubscribe(client as never, verified)).toEqual([
      { category: 'courses', outcome: 'unsubscribed' }, { category: 'community', outcome: 'stale' },
    ]);
    expect(client.rpc.mock.calls).toEqual([
      ['apply_notification_unsubscribe', { p_user_id: U, p_categories: ['courses', 'community'], p_versions: [7, 4] }],
    ]);
  });

  it.each([
    ['an error', { data: null, error: { message: `synthetic failure naming ${U}` } }],
    ['no rows', { data: [], error: null }],
    ['a row missing', { data: [{ category: 'courses', outcome: 'unsubscribed' }], error: null }],
    ['another category', { data: [{ category: 'courses', outcome: 'unsubscribed' }, { category: 'sessions', outcome: 'unsubscribed' }], error: null }],
    ['an unknown outcome', { data: [{ category: 'courses', outcome: 'unsubscribed' }, { category: 'community', outcome: 'done' }], error: null }],
    ['something that is not a list', { data: true, error: null }],
  ])('the database answers with %s: null, and nothing is logged', async (_name, answer) => {
    expect(await applyUnsubscribe(clientAnswering(answer) as never, verified)).toBeNull();
    expect(logs.flatMap((spy) => spy.mock.calls)).toEqual([]);
  });
});

describe('D3 — a link is signed for an existing preference row', () => {
  const TABLE = 'user_notification_category_prefs';
  /** The preference table as the database keeps it: ON CONFLICT DO NOTHING, the mode default and the version trigger. */
  function prefsClient(rows: Array<Record<string, unknown>>, failing: 'upsert' | 'select' | null = null) {
    const calls: unknown[][] = [];
    const failure = { data: null, error: { message: `synthetic failure naming ${U}` } };
    const client = {
      from(table: string) {
        const filters: Record<string, unknown> = {};
        const builder: any = {
          upsert: async (value: Record<string, unknown>, options: unknown) => {
            calls.push(['upsert', table, value, options]);
            if (failing === 'upsert') return failure;
            if (!rows.some((row) => row.user_id === value.user_id && row.category === value.category)) {
              rows.push({ email_mode: 'default', pref_version: 31, ...value });
            }
            return { data: null, error: null };
          },
          select: (columns: string) => (calls.push(['select', table, columns]), builder),
          eq: (column: string, value: unknown) => ((filters[column] = value), builder),
          maybeSingle: async () =>
            failing === 'select'
              ? failure
              : { data: rows.find((row) => Object.entries(filters).every(([column, value]) => row[column] === value)) ?? null, error: null },
        };
        return builder;
      },
    };
    return { client: client as never, calls };
  }

  it('a recipient with no row gets one in default mode, and its version is the one to sign', async () => {
    const rows = [{ user_id: OTHER, category: 'courses', email_mode: 'immediate', pref_version: 9 }];
    const { client, calls } = prefsClient(rows);

    expect(await preferenceVersionForLink(client, U, 'courses')).toBe(31);

    expect(rows).toEqual([
      { user_id: OTHER, category: 'courses', email_mode: 'immediate', pref_version: 9 },
      { user_id: U, category: 'courses', email_mode: 'default', pref_version: 31 },
    ]);
    expect(calls).toEqual([
      ['upsert', TABLE, { user_id: U, category: 'courses' }, { onConflict: 'user_id,category', ignoreDuplicates: true }],
      ['select', TABLE, 'pref_version'],
    ]);
  });

  it('an existing row keeps its mode and version', async () => {
    const rows = [{ user_id: U, category: 'courses', email_mode: 'immediate', pref_version: 7 }];

    expect(await preferenceVersionForLink(prefsClient(rows).client, U, 'courses')).toBe(7);
    expect(rows).toEqual([{ user_id: U, category: 'courses', email_mode: 'immediate', pref_version: 7 }]);
  });

  it.each([
    ['the row cannot be written', [], 'upsert'],
    ['the row cannot be read', [], 'select'],
    ['the stored version is 0', [{ user_id: U, category: 'courses', email_mode: 'default', pref_version: 0 }], null],
    ['the stored version is not a number', [{ user_id: U, category: 'courses', email_mode: 'default', pref_version: '7' }], null],
    ['the stored version is missing', [{ user_id: U, category: 'courses', email_mode: 'default' }], null],
  ] as Array<[string, Array<Record<string, unknown>>, 'upsert' | 'select' | null]>)('%s: no version, and nothing is logged', async (_name, rows, failing) => {
    expect(await preferenceVersionForLink(prefsClient(rows, failing).client, U, 'courses')).toBeNull();
    expect(logs.flatMap((spy) => spy.mock.calls)).toEqual([]);
  });

  it('without a signing secret no row is written: there is no link to sign', async () => {
    delete process.env.NOTIFICATION_UNSUBSCRIBE_SECRET;
    const { client, calls } = prefsClient([]);

    expect(await preferenceVersionForLink(client, U, 'courses')).toBeNull();
    expect(calls).toEqual([]);
  });
});
