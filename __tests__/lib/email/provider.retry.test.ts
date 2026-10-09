// @vitest-environment node
/**
 * The provider's `Retry-After` on an ambiguous keyed answer, through the real
 * `deliverOutboundEmail`. The keyed path's `fetch` and the unkeyed path's SDK are
 * the only stand-ins: no network, no real provider. Synthetic values only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sdkSend } = vi.hoisted(() => ({ sdkSend: vi.fn() }));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sdkSend };
  },
}));

import { deliverOutboundEmail, MAX_RETRY_AFTER_SECONDS, parseRetryAfter, type EmailTransport } from '../../../lib/email/provider';
import type { OutboundEmailAuthorization } from '../../../lib/email/outbound-policy';

const ALLOW: OutboundEmailAuthorization = { kind: 'allow', scope: 'client', schoolId: 11 };
const MESSAGE = { to: 'destinataria.sintetica@ejemplo.invalid', subject: 'Asunto', html: '<p>Hola</p>', headers: { 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } };
const KEY = 'notif-digest-synthetic-key';
const NOW = Date.parse('2026-10-08T12:00:00Z');

let fetchMock: ReturnType<typeof vi.fn>;
const answer = (status: number, headers: Record<string, string> = {}, body: unknown = { message: 'texto del proveedor' }) =>
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status, headers }));
const keyed = () => deliverOutboundEmail({ authorization: ALLOW, message: MESSAGE, idempotencyKey: KEY });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubEnv('RESEND_API_KEY', 're_synthetic_key');
  vi.stubEnv('EMAIL_FROM_ADDRESS', '');
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('parseRetryAfter', () => {
  it.each([
    ['delay-seconds', '120', 120],
    ['zero', '0', 0],
    ['leading zeros', '007', 7],
    ['an HTTP-date 90 s ahead', 'Thu, 08 Oct 2026 12:01:30 GMT', 90],
    ['an HTTP-date in the past', 'Thu, 08 Oct 2026 11:00:00 GMT', 0],
    ['a delay above a day, clamped', '999999', MAX_RETRY_AFTER_SECONDS],
    ['an HTTP-date two days ahead, clamped', 'Sat, 10 Oct 2026 12:00:00 GMT', MAX_RETRY_AFTER_SECONDS],
  ])('accepts %s', (_name, value, seconds) => {
    expect(parseRetryAfter(value, NOW)).toBe(seconds);
  });

  it('rounds a date less than a second ahead up to a whole second', () => {
    expect(parseRetryAfter('Thu, 08 Oct 2026 12:00:01 GMT', NOW + 500)).toBe(1);
  });

  it.each([
    ['a negative delay', '-5'],
    ['a fraction', '1.5'],
    ['an exponent', '1e3'],
    ['Infinity', 'Infinity'],
    ['NaN', 'NaN'],
    ['a delay too long to be finite', '9'.repeat(400)],
    ['surrounding spaces', ' 120 '],
    ['an empty value', ''],
    ['a CR/LF injection', '120\r\nX-Injected: 1'],
    ['a NUL', '12\u0000'],
    ['words', 'mañana'],
    ['an RFC 850 date', 'Thursday, 08-Oct-26 12:01:30 GMT'],
    ['an impossible date', 'Thu, 99 Oct 2026 12:01:30 GMT'],
    ['a date in another zone', 'Thu, 08 Oct 2026 12:01:30 +0000'],
    ['a number instead of text', 120],
    ['null', null],
    ['undefined', undefined],
  ])('rejects %s', (_name, value) => {
    expect(parseRetryAfter(value, NOW)).toBeUndefined();
  });

  // Each weekday is the one of the date Date.parse rolls the value into, so only the calendar check can refuse it.
  it.each([
    ['29 Feb in a common year', 'Sun, 29 Feb 2026 12:00:00 GMT', '2026-02-28T12:00:00Z'],
    ['30 Feb', 'Mon, 30 Feb 2026 12:00:00 GMT', '2026-02-28T12:00:00Z'],
    ['31 Feb', 'Tue, 31 Feb 2026 12:00:00 GMT', '2026-02-28T12:00:00Z'],
    ['29 Feb in a century that is not a leap year', 'Mon, 29 Feb 2100 12:00:00 GMT', '2100-02-28T12:00:00Z'],
    ['31 Apr', 'Fri, 31 Apr 2026 12:00:00 GMT', '2026-04-30T12:00:00Z'],
    ['31 Jun', 'Wed, 31 Jun 2026 12:00:00 GMT', '2026-06-30T12:00:00Z'],
    ['31 Sep', 'Thu, 31 Sep 2026 12:00:00 GMT', '2026-09-30T12:00:00Z'],
    ['31 Nov', 'Tue, 31 Nov 2026 12:00:00 GMT', '2026-11-30T12:00:00Z'],
    ['hour 24', 'Fri, 08 Oct 2026 24:00:00 GMT', '2026-10-08T12:00:00Z'],
    ['second 60', 'Thu, 08 Oct 2026 12:00:60 GMT', '2026-10-08T11:59:00Z'],
    ['a leap second', 'Thu, 08 Oct 2026 23:59:60 GMT', '2026-10-08T12:00:00Z'],
    ['a weekday that does not match the date', 'Mon, 08 Oct 2026 12:10:00 GMT', '2026-10-08T12:00:00Z'],
  ])('rejects %s, a date Date.parse would accept', (_name, value, now) => {
    expect(Number.isFinite(Date.parse(value))).toBe(true);
    expect(parseRetryAfter(value, Date.parse(now))).toBeUndefined();
  });

  it.each([
    ['day 00', 'Sun, 00 Mar 2026 12:00:00 GMT'],
    ['day 32', 'Sat, 32 Jan 2026 12:00:00 GMT'],
    ['hour 25', 'Thu, 08 Oct 2026 25:00:00 GMT'],
    ['minute 60', 'Thu, 08 Oct 2026 12:60:00 GMT'],
    ['minute 99', 'Thu, 08 Oct 2026 12:99:00 GMT'],
    ['second 99', 'Thu, 08 Oct 2026 12:00:99 GMT'],
    ['year 0026', 'Thu, 08 Oct 0026 12:00:00 GMT'],
  ])('rejects %s', (_name, value) => {
    expect(parseRetryAfter(value, NOW)).toBeUndefined();
  });

  it.each([
    ['29 Feb in a leap year', 'Tue, 29 Feb 2028 00:00:00 GMT', '2028-02-28T12:00:00Z', 43200],
    ['29 Feb 2000, a leap century, in the past', 'Tue, 29 Feb 2000 12:00:00 GMT', '2026-10-08T12:00:00Z', 0],
    ['28 Feb in a common year', 'Sat, 28 Feb 2026 23:59:59 GMT', '2026-02-28T12:00:00Z', 43199],
    ['1 Mar after a common February', 'Sun, 01 Mar 2026 00:00:00 GMT', '2026-02-28T12:00:00Z', 43200],
    ['31 Jan', 'Sat, 31 Jan 2026 00:00:00 GMT', '2026-01-30T12:00:00Z', 43200],
    ['30 Apr', 'Thu, 30 Apr 2026 12:00:00 GMT', '2026-04-30T11:00:00Z', 3600],
    ['31 Dec at 23:59:59', 'Thu, 31 Dec 2026 23:59:59 GMT', '2026-12-31T23:00:00Z', 3599],
    ['midnight', 'Fri, 09 Oct 2026 00:00:00 GMT', '2026-10-08T23:00:00Z', 3600],
  ])('accepts %s', (_name, value, now, seconds) => {
    expect(parseRetryAfter(value, Date.parse(now))).toBe(seconds);
  });
});

describe('keyed send through fetch: the Retry-After of an ambiguous answer is kept', () => {
  it('429 with delay-seconds: transport_error with the wait, same body and key as sent', async () => {
    answer(429, { 'Retry-After': '120' });

    expect(await keyed()).toEqual({ status: 'transport_error', detail: 'transient provider failure', retryAfterSeconds: 120 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers['Idempotency-Key']).toBe(KEY);
    expect(JSON.parse(init.body)).toEqual({ ...MESSAGE, from: 'Genera <notificaciones@nuevaeducacion.org>' });
  });

  it('503 with an HTTP-date: the seconds until that date', async () => {
    answer(503, { 'Retry-After': 'Thu, 08 Oct 2026 12:05:00 GMT' });
    expect(await keyed()).toEqual({ status: 'transport_error', detail: 'transient provider failure', retryAfterSeconds: 300 });
  });

  it.each([
    ['no Retry-After', {}],
    ['a malformed one', { 'Retry-After': 'pronto' }],
    ['a negative one', { 'Retry-After': '-30' }],
  ])('503 with %s: transport_error without a wait', async (_name, headers) => {
    answer(503, headers);
    expect(await keyed()).toEqual({ status: 'transport_error', detail: 'transient provider failure' });
  });

  it('503 with 30 Feb, which Date.parse rolls into March: no wait at all', async () => {
    vi.setSystemTime(Date.parse('2026-02-28T12:00:00Z'));
    answer(503, { 'Retry-After': 'Mon, 30 Feb 2026 12:00:00 GMT' });
    expect(await keyed()).toEqual({ status: 'transport_error', detail: 'transient provider failure' });
  });

  it('503 with 29 Feb of a leap year: the seconds until that date', async () => {
    vi.setSystemTime(Date.parse('2028-02-28T12:00:00Z'));
    answer(503, { 'Retry-After': 'Tue, 29 Feb 2028 00:00:00 GMT' });
    expect(await keyed()).toEqual({ status: 'transport_error', detail: 'transient provider failure', retryAfterSeconds: 43200 });
  });

  it('the provider text never sets the wait or the detail', async () => {
    answer(429, {}, { message: 'Retry-After: 9999 destinataria.sintetica@ejemplo.invalid' });
    expect(await keyed()).toEqual({ status: 'transport_error', detail: 'transient provider failure' });
  });

  it('409 with a Retry-After stays a definite conflict: no wait, no ambiguity', async () => {
    answer(409, { 'Retry-After': '60' });
    expect(await keyed()).toEqual({ status: 'provider_rejected', detail: 'texto del proveedor', conflict: true });
  });

  it('another 4xx with a Retry-After stays a definite refusal', async () => {
    answer(422, { 'Retry-After': '60' });
    expect(await keyed()).toEqual({ status: 'provider_rejected', detail: 'texto del proveedor' });
  });

  it('accepted and thrown answers are unchanged', async () => {
    answer(200, { 'Retry-After': '60' }, { id: 'provider-message-1' });
    expect(await keyed()).toEqual({ status: 'provider_accepted', providerMessageId: 'provider-message-1' });
    fetchMock.mockRejectedValueOnce(new Error('socket hang up'));
    expect(await keyed()).toEqual({ status: 'transport_error', detail: 'socket hang up' });
  });
});

describe('an injected transport passes through the same boundary', () => {
  const transport = (statusCode: number, retryAfter?: string | null): EmailTransport =>
    vi.fn(async () => ({ data: null, error: { message: 'ocupado', statusCode, retryAfter } }));

  it.each([
    ['valid delay-seconds', 429, '30', { retryAfterSeconds: 30 }],
    ['a valid HTTP-date', 500, 'Thu, 08 Oct 2026 12:00:45 GMT', { retryAfterSeconds: 45 }],
    ['a value above a day', 503, '100000', { retryAfterSeconds: MAX_RETRY_AFTER_SECONDS }],
    ['an invalid value', 429, '-1', {}],
    ['a control character', 429, '30\n', {}],
    ['31 Nov, which Date.parse rolls into December', 503, 'Tue, 31 Nov 2026 12:00:00 GMT', {}],
    ['hour 24, which Date.parse rolls into the next day', 503, 'Fri, 08 Oct 2026 24:00:00 GMT', {}],
    ['the last valid second of the day', 503, 'Thu, 08 Oct 2026 23:59:59 GMT', { retryAfterSeconds: 43199 }],
    ['null', 503, null, {}],
  ])('keyed, %s', async (_name, status, retryAfter, extra) => {
    const result = await deliverOutboundEmail({ authorization: ALLOW, message: MESSAGE, idempotencyKey: KEY, transport: transport(status, retryAfter) });
    expect(result).toEqual({ status: 'transport_error', detail: 'ocupado', ...extra });
  });

  it('keyed 409 with a Retry-After is a conflict without a wait', async () => {
    const result = await deliverOutboundEmail({ authorization: ALLOW, message: MESSAGE, idempotencyKey: KEY, transport: transport(409, '30') });
    expect(result).toEqual({ status: 'provider_rejected', detail: 'ocupado', conflict: true });
  });

  it('unkeyed, a 429 with a Retry-After keeps the plain refusal it always had', async () => {
    const result = await deliverOutboundEmail({ authorization: ALLOW, message: MESSAGE, transport: transport(429, '30') });
    expect(result).toEqual({ status: 'provider_rejected', detail: 'ocupado' });
  });
});

describe('unchanged around it', () => {
  it('the unkeyed send still goes through the SDK and never reads a status or a wait', async () => {
    sdkSend.mockResolvedValueOnce({ data: null, error: { message: 'limitado', statusCode: 429, retryAfter: '30' } });
    expect(await deliverOutboundEmail({ authorization: ALLOW, message: MESSAGE })).toEqual({ status: 'provider_rejected', detail: 'limitado' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['a QA tenant', { kind: 'suppressed_qa', schoolId: 257, reason: 'qa_tenant' }, {}, { status: 'suppressed_qa' }],
    ['a refused tenant', { kind: 'refuse', reason: 'invalid_school' }, {}, { status: 'refused', detail: 'invalid_school' }],
    ['an invalid sender', ALLOW, { EMAIL_FROM_ADDRESS: 'no es un remitente' }, { status: 'not_configured', detail: 'invalid_sender' }],
    ['no provider key', ALLOW, { RESEND_API_KEY: '' }, { status: 'not_configured' }],
  ])('%s: answered before any provider call', async (_name, authorization, env, expected) => {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    const result = await deliverOutboundEmail({ authorization: authorization as OutboundEmailAuthorization, message: MESSAGE, idempotencyKey: KEY });
    expect(result).toEqual(expected);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sdkSend).not.toHaveBeenCalled();
  });
});
