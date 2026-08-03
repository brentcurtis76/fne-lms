// @vitest-environment node
/**
 * Phase B2 — Resend SDK compatibility contract (installed version: 3.5.0).
 *
 * These tests deliberately do NOT mock `resend`. They instantiate the real
 * `Resend` class and stub the transport (`globalThis.fetch`), so the SDK's own
 * request building, response deserialisation and error mapping run for real.
 * A future SDK upgrade that changes any locked shape breaks this suite loudly
 * instead of silently breaking the campaign drain (D-07) or List-Unsubscribe
 * compliance (D-08).
 *
 * Every assertion here is a contract B3/B4/B10 may rely on. See
 * `docs/plan/reviews/fase-b2-findings.md` for the prose version.
 */
import { Resend } from 'resend';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const API_KEY = 're_test_key_not_real';

type FetchCall = { url: string; init: RequestInit };

let calls: FetchCall[];
let originalFetch: typeof globalThis.fetch;

/** Install a transport that answers every request with `respond()`. */
function stubTransport(respond: () => Response | Promise<Response>): void {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return respond();
  }) as unknown as typeof globalThis.fetch;
}

/** Install a transport whose promise rejects, i.e. a network-level failure. */
function stubFailingTransport(error: Error): void {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    throw error;
  }) as unknown as typeof globalThis.fetch;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function sentBody(call: FetchCall): unknown {
  return JSON.parse(call.init.body as string);
}

function headerNames(call: FetchCall): string[] {
  const headers = call.init.headers;
  // The SDK builds a real `Headers`; a caller-supplied override arrives as the
  // plain object it was written as (see the footgun test below).
  const names =
    headers instanceof Headers ? [...headers.keys()] : Object.keys(headers as object);
  return names.sort();
}

function headerValue(call: FetchCall, name: string): string | null {
  const headers = call.init.headers;
  return headers instanceof Headers ? headers.get(name) : null;
}

const email = (to: string) => ({
  from: 'FNE <no-reply@nuevaeducacion.org>',
  to,
  subject: 'Novedades FNE',
  html: '<p>Hola</p>',
});

beforeEach(() => {
  calls = [];
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('resend 3.5.0 — installed version', () => {
  it('announces itself as the version these contracts were locked against', async () => {
    stubTransport(() => json({ data: [{ id: 'a' }] }));

    await new Resend(API_KEY).batch.send([email('uno@escuela.cl')]);

    // The SDK stamps its own version into the User-Agent, so this asserts the
    // version through the transport rather than trusting package.json.
    expect(headerValue(calls[0], 'user-agent')).toBe('resend-node:3.5.0');
  });
});

describe('batch.send — request shape', () => {
  it('POSTs the bare array to /emails/batch (no wrapper object)', async () => {
    stubTransport(() => json({ data: [{ id: 'a' }] }));

    await new Resend(API_KEY).batch.send([email('uno@escuela.cl')]);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.resend.com/emails/batch');
    expect(calls[0].init.method).toBe('POST');
    // The body is the array itself — NOT `{ emails: [...] }`.
    expect(Array.isArray(sentBody(calls[0]))).toBe(true);
    expect(sentBody(calls[0])).toEqual([email('uno@escuela.cl')]);
  });

  it('serialises per-email `headers`, so List-Unsubscribe can be per-recipient (D-08)', async () => {
    stubTransport(() => json({ data: [{ id: 'a' }, { id: 'b' }] }));

    await new Resend(API_KEY).batch.send([
      {
        ...email('uno@escuela.cl'),
        headers: {
          'List-Unsubscribe': '<https://nuevaeducacion.org/correos/baja?t=tok1>',
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      },
      {
        ...email('dos@escuela.cl'),
        headers: {
          'List-Unsubscribe': '<https://nuevaeducacion.org/correos/baja?t=tok2>',
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      },
    ]);

    const body = sentBody(calls[0]) as Array<{ headers: Record<string, string> }>;
    expect(body[0].headers['List-Unsubscribe']).toBe(
      '<https://nuevaeducacion.org/correos/baja?t=tok1>'
    );
    expect(body[1].headers['List-Unsubscribe']).toBe(
      '<https://nuevaeducacion.org/correos/baja?t=tok2>'
    );
    expect(body[0].headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  it('does not mutate caller payload objects when `html` is supplied', async () => {
    stubTransport(() => json({ data: [{ id: 'a' }] }));

    const payload = [email('uno@escuela.cl')];
    const snapshot = JSON.parse(JSON.stringify(payload));

    await new Resend(API_KEY).batch.send(payload);

    // `batch.create` rewrites `email.react` into `email.html` in place. With an
    // html-only payload nothing is touched, so the drain may keep the same
    // objects for its ledger write after the call returns.
    expect(payload).toEqual(snapshot);
  });

  it('sends exactly three headers and no Idempotency-Key', async () => {
    stubTransport(() => json({ data: [{ id: 'a' }] }));

    await new Resend(API_KEY).batch.send([email('uno@escuela.cl')]);

    expect(headerNames(calls[0])).toEqual(['authorization', 'content-type', 'user-agent']);
  });
});

describe('batch.send — response shape', () => {
  it('double-nests the ids under data.data, in request order', async () => {
    stubTransport(() => json({ data: [{ id: 'id-uno' }, { id: 'id-dos' }] }));

    const result = await new Resend(API_KEY).batch.send([
      email('uno@escuela.cl'),
      email('dos@escuela.cl'),
    ]);

    // The nesting D-07's ledger write depends on: result.data.data[i].id.
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ data: [{ id: 'id-uno' }, { id: 'id-dos' }] });
    expect(result.data?.data[0].id).toBe('id-uno');
    expect(result.data?.data[1].id).toBe('id-dos');
    // The SDK passes the parsed array straight through, so index alignment with
    // the request is preserved by the client. (That the *API* returns them in
    // request order is an API guarantee — see the findings file.)
    expect(result.data?.data).toHaveLength(2);
  });
});

describe('error handling is error-as-value, never thrown', () => {
  it('resolves an API error body verbatim (does not throw) on 4xx', async () => {
    stubTransport(() =>
      json({ statusCode: 422, name: 'validation_error', message: 'Invalid `to` field' }, 422)
    );

    const result = await new Resend(API_KEY).batch.send([email('uno@escuela.cl')]);

    expect(result.data).toBeNull();
    expect(result.error).toEqual({
      statusCode: 422,
      name: 'validation_error',
      message: 'Invalid `to` field',
    });
    // Reality vs types: `ErrorResponse` declares only { name, message }, but the
    // SDK returns whatever JSON the API sent — extra keys reach the caller.
    expect(Object.keys(result.error as object)).toContain('statusCode');
  });

  it('maps a non-JSON error body to application_error', async () => {
    stubTransport(() => new Response('<html>502 Bad Gateway</html>', { status: 502 }));

    const result = await new Resend(API_KEY).emails.send(email('uno@escuela.cl'));

    expect(result.data).toBeNull();
    expect(result.error?.name).toBe('application_error');
    expect(result.error?.message).toBe(
      'Internal server error. We are unable to process your request right now, please try again later.'
    );
  });

  it('maps a transport-level rejection to application_error instead of rejecting', async () => {
    stubFailingTransport(new TypeError('fetch failed'));

    const result = await new Resend(API_KEY).batch.send([email('uno@escuela.cl')]);

    expect(result.data).toBeNull();
    expect(result.error).toEqual({
      name: 'application_error',
      message: 'Unable to fetch data. The request could not be resolved.',
    });
  });

  it('maps an unparseable 200 body to application_error too', async () => {
    // A 200 whose body is not JSON fails inside `response.json()`, which the
    // SDK's outer catch reports as a transport failure — indistinguishable from
    // a network error, so the drain must treat both as "unknown outcome".
    stubTransport(() => new Response('OK', { status: 200 }));

    const result = await new Resend(API_KEY).emails.send(email('uno@escuela.cl'));

    expect(result.data).toBeNull();
    expect(result.error).toEqual({
      name: 'application_error',
      message: 'Unable to fetch data. The request could not be resolved.',
    });
  });

  it('throws only from the constructor, when no API key is available', () => {
    const original = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    try {
      expect(() => new Resend(undefined)).toThrow(/Missing API key/);
    } finally {
      if (original === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = original;
    }
  });
});

describe('idempotency — absent in 3.5.0', () => {
  it('ignores the documented `query` request option on POSTs', async () => {
    stubTransport(() => json({ data: [{ id: 'a' }] }));

    await new Resend(API_KEY).batch.send([email('uno@escuela.cl')], {
      query: { idempotency_key: 'campaign-1-batch-0' },
    });

    // `PostOptions.query` is spread into the fetch init, where `fetch` ignores
    // it: the URL carries no query string and nothing else changes. There is no
    // idempotency-key option in this version, typed or otherwise.
    expect(calls[0].url).toBe('https://api.resend.com/emails/batch');
    expect(calls[0].url).not.toContain('?');
    expect(headerNames(calls[0])).not.toContain('idempotency-key');
  });

  it('silently drops authentication if a caller supplies request headers', async () => {
    stubTransport(() => json({ data: [{ id: 'a' }] }));

    await new Resend(API_KEY).batch.send([email('uno@escuela.cl')], {
      // Not typed by `PostOptions`, but the SDK spreads request options over the
      // fetch init — including its own `headers`. This is the footgun to avoid
      // if anyone later tries to bolt an Idempotency-Key on by hand.
      headers: { 'Idempotency-Key': 'campaign-1-batch-0' },
    } as never);

    const names = headerNames(calls[0]);
    expect(names).toEqual(['Idempotency-Key']);
    expect(names).not.toContain('authorization');
  });
});
