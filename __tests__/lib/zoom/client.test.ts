// @vitest-environment node
/**
 * REST client contract (plan §17 blocking gate: "client retry taxonomy").
 *
 * The interesting assertions are the ones about what the client REFUSES to do:
 * it must not replay a POST, must not treat a 4xx as transient, and must not
 * report a settings PATCH as confirmed on the strength of its own 204.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  createZoomClient,
  encodeMeetingUuid,
  parseRetryAfter,
  UNVERIFIABLE_SETTINGS_FIELDS,
  type ZoomClientDeps,
} from '../../../lib/zoom/client';
import {
  ZoomAuthError,
  ZoomNonRetryableError,
  ZoomRateLimitError,
  ZoomRetryableError,
} from '../../../lib/zoom/errors';
import type { ZoomTokenProvider } from '../../../lib/zoom/token';

/** A token provider that hands out `token-1`, `token-2`, … on each refresh. */
function fakeTokens() {
  let generation = 1;
  const refreshes: string[] = [];
  const provider: ZoomTokenProvider = {
    async getToken() {
      return `token-${generation}`;
    },
    async forceRefresh(stale) {
      refreshes.push(stale);
      generation += 1;
      return `token-${generation}`;
    },
  };
  return { provider, refreshes, generation: () => generation };
}

interface Reply {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
  /** Throw instead of answering — models a socket failure. */
  throws?: boolean;
}

function scriptedFetch(replies: Reply[]) {
  const calls: Array<{ url: string; method: string; headers: Record<string, string>; body?: string }> = [];
  let index = 0;
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const reply = replies[Math.min(index, replies.length - 1)];
    index += 1;
    calls.push({
      url: String(url),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body as string | undefined,
    });
    if (reply.throws) throw new TypeError('fetch failed');
    const payload = reply.body === undefined ? '' : JSON.stringify(reply.body);
    return new Response(payload || null, { status: reply.status, headers: reply.headers });
  });
  return { impl: impl as unknown as typeof fetch, calls, count: () => index };
}

/** Builds a client with instant backoff and a recording sleep spy. */
function build(replies: Reply[], overrides: Partial<ZoomClientDeps> = {}) {
  const tokens = fakeTokens();
  const fetcher = scriptedFetch(replies);
  const slept: number[] = [];
  const client = createZoomClient({
    tokenProvider: tokens.provider,
    fetchImpl: fetcher.impl,
    sleep: async (ms) => {
      slept.push(ms);
    },
    ...overrides,
  });
  return { client, tokens, fetcher, slept };
}

describe('createZoomClient — happy path', () => {
  it('sends a bearer token and parses the JSON body', async () => {
    const { client, fetcher } = build([
      { status: 200, body: { id: 84177662364, topic: 'Sesión sintética' }, headers: { 'x-zm-request-id': 'req-1' } },
    ]);

    const response = await client.get<{ id: number; topic: string }>('/meetings/84177662364');

    expect(response.status).toBe(200);
    expect(response.data).toEqual({ id: 84177662364, topic: 'Sesión sintética' });
    expect(response.requestId).toBe('req-1');
    expect(fetcher.calls[0].headers.Authorization).toBe('Bearer token-1');
    expect(fetcher.calls[0].url).toBe('https://api.zoom.us/v2/meetings/84177662364');
  });

  it('returns null data for a 204 — the settings-PATCH shape', async () => {
    const { client } = build([{ status: 204 }]);
    const response = await client.patch('/meetings/84177662364', { auto_recording: 'none' });

    expect(response.status).toBe(204);
    expect(response.data).toBeNull();
  });

  it('appends query params and drops undefined/null', async () => {
    const { client, fetcher } = build([{ status: 200, body: {} }]);
    await client.get('/users', { status: 'active', page_size: 300, role_id: undefined, next_page_token: null });

    const url = new URL(fetcher.calls[0].url);
    expect(url.searchParams.get('status')).toBe('active');
    expect(url.searchParams.get('page_size')).toBe('300');
    expect(url.searchParams.has('role_id')).toBe(false);
    expect(url.searchParams.has('next_page_token')).toBe(false);
  });

  it('serialises a JSON body and sets the content type', async () => {
    const { client, fetcher } = build([{ status: 201, body: { id: 1 } }]);
    await client.post('/users/me/meetings', { topic: 'Sesión', timezone: 'America/Santiago' });

    expect(fetcher.calls[0].headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(fetcher.calls[0].body as string)).toEqual({
      topic: 'Sesión',
      timezone: 'America/Santiago',
    });
  });
});

describe('createZoomClient — 401 handling', () => {
  it('forces one refresh and replays the request', async () => {
    const { client, tokens, fetcher } = build([
      { status: 401, body: { code: 124, message: 'Invalid access token' } },
      { status: 200, body: { ok: true } },
    ]);

    const response = await client.get<{ ok: boolean }>('/users/me');

    expect(response.data).toEqual({ ok: true });
    expect(tokens.refreshes).toEqual(['token-1']);
    expect(fetcher.calls[0].headers.Authorization).toBe('Bearer token-1');
    expect(fetcher.calls[1].headers.Authorization).toBe('Bearer token-2');
  });

  it('replays a POST too — a 401 never executed, so this cannot double-create', async () => {
    const { client, fetcher } = build([
      { status: 401, body: { code: 124, message: 'Invalid access token' } },
      { status: 201, body: { id: 84177662364 } },
    ]);

    const response = await client.post<{ id: number }>('/users/host-1/meetings', { topic: 'Sesión' });

    expect(response.status).toBe(201);
    expect(fetcher.count()).toBe(2);
  });

  it('surfaces a typed auth error when the refresh does not help', async () => {
    const { client, tokens, fetcher } = build([{ status: 401, body: { code: 124, message: 'Invalid access token' } }]);

    await expect(client.get('/users/me')).rejects.toBeInstanceOf(ZoomAuthError);
    // Exactly one forced refresh and exactly two wire attempts — no loop.
    expect(tokens.refreshes).toHaveLength(1);
    expect(fetcher.count()).toBe(2);
  });

  it('does not spend the retryable budget on the auth replay', async () => {
    // 401 → refresh → 500 → backoff → 500 → backoff → 500 → give up.
    // maxAttempts is 3, so the 401 must not have consumed one of them.
    const { client, fetcher } = build([
      { status: 401, body: { message: 'Invalid access token' } },
      { status: 500, body: { message: 'boom' } },
      { status: 500, body: { message: 'boom' } },
      { status: 500, body: { message: 'boom' } },
    ]);

    await expect(client.get('/users/me')).rejects.toBeInstanceOf(ZoomRetryableError);
    expect(fetcher.count()).toBe(4);
  });
});

describe('createZoomClient — retry taxonomy', () => {
  it('retries a 5xx on an idempotent verb with doubling backoff', async () => {
    const { client, slept, fetcher } = build([
      { status: 500, body: { message: 'boom' } },
      { status: 502, body: { message: 'boom' } },
      { status: 200, body: { ok: true } },
    ]);

    await expect(client.get('/users/me')).resolves.toMatchObject({ status: 200 });
    expect(fetcher.count()).toBe(3);
    expect(slept).toEqual([500, 1000]);
  });

  it('caps the backoff', async () => {
    const { client, slept } = build([{ status: 500, body: { message: 'boom' } }], {
      maxAttempts: 6,
      baseBackoffMs: 1000,
      maxBackoffMs: 3000,
    });

    await expect(client.get('/users/me')).rejects.toBeInstanceOf(ZoomRetryableError);
    expect(slept).toEqual([1000, 2000, 3000, 3000, 3000]);
  });

  it('retries a transport failure', async () => {
    const { client, fetcher } = build([{ status: 0, throws: true }, { status: 200, body: { ok: true } }]);
    await expect(client.get('/users/me')).resolves.toMatchObject({ status: 200 });
    expect(fetcher.count()).toBe(2);
  });

  it('gives up after maxAttempts and surfaces the retryable error', async () => {
    const { client, fetcher } = build([{ status: 503, body: { message: 'unavailable' } }]);
    await expect(client.get('/users/me')).rejects.toMatchObject({ kind: 'retryable', status: 503 });
    expect(fetcher.count()).toBe(3);
  });

  it.each([
    [400, 'Bad Request'],
    [403, 'Forbidden'],
    [404, 'Meeting does not exist'],
    [409, 'Conflict'],
  ])('never retries a %i — the request itself is wrong', async (status, message) => {
    const { client, fetcher, slept } = build([{ status, body: { code: 3001, message } }]);

    await expect(client.get('/meetings/84177662364')).rejects.toBeInstanceOf(ZoomNonRetryableError);
    expect(fetcher.count()).toBe(1);
    expect(slept).toEqual([]);
  });

  it('carries Zoom’s numeric code through onto the error', async () => {
    const { client } = build([{ status: 400, body: { code: 4711, message: 'Invalid scope' } }]);
    await expect(client.get('/users')).rejects.toMatchObject({ kind: 'non_retryable', zoomCode: 4711 });
  });
});

describe('createZoomClient — POST is never replayed automatically', () => {
  it('throws a 5xx straight through rather than creating a second meeting', async () => {
    const { client, fetcher, slept } = build([{ status: 500, body: { message: 'boom' } }]);

    await expect(client.post('/users/host-1/meetings', { topic: 'Sesión' })).rejects.toBeInstanceOf(
      ZoomRetryableError
    );
    // One attempt. Idempotency for POST lives in the Z1b-3 job layer.
    expect(fetcher.count()).toBe(1);
    expect(slept).toEqual([]);
  });

  it('throws a 429 straight through as well', async () => {
    const { client, fetcher } = build([
      { status: 429, body: { message: 'Too many requests' }, headers: { 'retry-after': '2' } },
    ]);

    await expect(client.post('/users/host-1/meetings', {})).rejects.toMatchObject({
      kind: 'rate_limit',
      retryAfterSeconds: 2,
    });
    expect(fetcher.count()).toBe(1);
  });

  it('honours an explicit idempotent override, because that is the caller’s call', async () => {
    const { client, fetcher } = build([{ status: 500, body: { message: 'boom' } }, { status: 200, body: { ok: 1 } }]);

    await expect(
      client.request({ method: 'POST', path: '/users/host-1/meetings/status', body: {}, idempotent: true })
    ).resolves.toMatchObject({ status: 200 });
    expect(fetcher.count()).toBe(2);
  });
});

describe('createZoomClient — 429 Retry-After', () => {
  it('waits exactly as long as Zoom asked', async () => {
    const { client, slept } = build([
      { status: 429, body: { message: 'rate limited' }, headers: { 'retry-after': '3' } },
      { status: 200, body: { ok: true } },
    ]);

    await expect(client.get('/users')).resolves.toMatchObject({ status: 200 });
    expect(slept).toEqual([3000]);
  });

  it('falls back to backoff when Zoom sends no Retry-After', async () => {
    const { client, slept } = build([{ status: 429, body: { message: 'rate limited' } }, { status: 200, body: {} }]);

    await expect(client.get('/users')).resolves.toMatchObject({ status: 200 });
    expect(slept).toEqual([500]);
  });

  it('refuses to hold the function warm for a long Retry-After', async () => {
    const { client, slept } = build(
      [{ status: 429, body: { message: 'rate limited' }, headers: { 'retry-after': '600' } }],
      { maxRetryAfterSeconds: 60 }
    );

    await expect(client.get('/users')).rejects.toMatchObject({ kind: 'rate_limit', retryAfterSeconds: 600 });
    expect(slept).toEqual([]);
  });

  it.each([
    ['delta seconds', '30', 30],
    ['zero', '0', 0],
    ['garbage', 'soon', undefined],
    ['absent', null, undefined],
  ])('parseRetryAfter handles %s', (_label, header, expected) => {
    expect(parseRetryAfter(header, 1_800_000_000_000)).toBe(expected);
  });

  it('parseRetryAfter accepts an HTTP-date', () => {
    const nowMs = 1_800_000_000_000;
    const httpDate = new Date(nowMs + 45_000).toUTCString();
    expect(parseRetryAfter(httpDate, nowMs)).toBe(45);
  });

  it('parseRetryAfter never returns a negative wait for a past date', () => {
    const nowMs = 1_800_000_000_000;
    expect(parseRetryAfter(new Date(nowMs - 60_000).toUTCString(), nowMs)).toBe(0);
  });
});

describe('patchWithReadBack — the only confirmation that exists', () => {
  // The same path for both, because that is the real shape: there is no
  // `/meetings/{id}/settings` endpoint. Settings ride on the meeting PATCH and are
  // read back off the meeting GET (spike-verified, results §8.3).
  const SETTINGS_PATH = '/meetings/84177662364';
  const READ_PATH = '/meetings/84177662364';

  it('reports a match when the read-back agrees with what was sent', async () => {
    const { client } = build([
      { status: 204 },
      { status: 200, body: { auto_recording: 'cloud', join_before_host: false } },
    ]);

    const result = await client.patchWithReadBack(SETTINGS_PATH, { auto_recording: 'cloud' }, READ_PATH);

    expect(result.patchStatus).toBe(204);
    expect(result.matches).toBe(true);
    expect(result.drift).toEqual([]);
    expect(result.effective).toMatchObject({ auto_recording: 'cloud' });
  });

  it('catches the silent enum coercion the spike measured', async () => {
    // Zoom answers 204 to an invalid `auto_recording` and stores 'none'. Without the
    // read-back the caller would believe cloud recording was enabled.
    const { client } = build([{ status: 204 }, { status: 200, body: { auto_recording: 'none' } }]);

    const result = await client.patchWithReadBack(SETTINGS_PATH, { auto_recording: 'cloud' }, READ_PATH);

    expect(result.patchStatus).toBe(204);
    expect(result.matches).toBe(false);
    expect(result.drift).toEqual([{ key: 'auto_recording', requested: 'cloud', effective: 'none' }]);
  });

  it('never keys drift on recording_disclaimer (ledger §9.4 plan defect)', async () => {
    // Zoom reports this field as false while the disclaimer demonstrably renders and
    // requires a click. A drift alert built on it would fire forever and mean nothing.
    const { client } = build([
      { status: 204 },
      { status: 200, body: { recording_disclaimer: false, auto_recording: 'none' } },
    ]);

    const result = await client.patchWithReadBack(
      SETTINGS_PATH,
      { recording_disclaimer: true, auto_recording: 'none' },
      READ_PATH
    );

    expect(result.drift).toEqual([]);
    expect(result.matches).toBe(true);
    expect(result.unverifiable).toEqual(['recording_disclaimer']);
    expect(UNVERIFIABLE_SETTINGS_FIELDS).toContain('recording_disclaimer');
  });

  it('compares structurally, so an object-valued setting does not read as drift', async () => {
    const { client } = build([
      { status: 204 },
      { status: 200, body: { breakout_room: { enable: true, rooms: [{ name: 'A' }] } } },
    ]);

    const result = await client.patchWithReadBack(
      SETTINGS_PATH,
      { breakout_room: { enable: true, rooms: [{ name: 'A' }] } },
      READ_PATH
    );
    expect(result.matches).toBe(true);
  });

  it('treats an empty read-back as unconfirmed rather than as success', async () => {
    const { client } = build([{ status: 204 }, { status: 204 }]);

    await expect(
      client.patchWithReadBack(SETTINGS_PATH, { auto_recording: 'none' }, READ_PATH)
    ).rejects.toBeInstanceOf(ZoomRetryableError);
  });

  it('reads back through the retry loop — a flaky GET does not lose the confirmation', async () => {
    const { client, fetcher } = build([
      { status: 204 },
      { status: 503, body: { message: 'unavailable' } },
      { status: 200, body: { auto_recording: 'none' } },
    ]);

    const result = await client.patchWithReadBack(SETTINGS_PATH, { auto_recording: 'none' }, READ_PATH);
    expect(result.matches).toBe(true);
    expect(fetcher.count()).toBe(3);
  });
});

describe('secret and identifier containment', () => {
  it('never puts the bearer token or the query string in an error message', async () => {
    const { client } = build([{ status: 400, body: { code: 300, message: 'Invalid meeting id' } }]);

    // `.catch` widens the result to `ZoomResponse | Error`; this call is asserted to
    // reject, so narrow to the rejection arm.
    const error = (await client
      .get('/meetings/84177662364/recordings', { download_access_token: 'a-live-download-token', ttl: 3600 })
      .catch((e: Error) => e)) as Error;

    expect(error.message).not.toContain('token-1');
    expect(error.message).not.toContain('a-live-download-token');
    // The operation label is the path only, for exactly this reason.
    expect(error.message).toContain('GET /meetings/84177662364/recordings');
  });

  it('truncates a non-JSON error body rather than storing a whole HTML page', async () => {
    const html = `<html>${'x'.repeat(5000)}</html>`;
    const impl = vi.fn(async () => new Response(html, { status: 502 })) as unknown as typeof fetch;
    const client = createZoomClient({
      tokenProvider: fakeTokens().provider,
      fetchImpl: impl,
      sleep: async () => {},
      maxAttempts: 1,
    });

    const error = (await client.get('/users/me').catch((e: Error) => e)) as Error;
    expect(error.message.length).toBeLessThan(400);
  });
});

describe('encodeMeetingUuid', () => {
  it('double-encodes, because a real UUID carries / and +', () => {
    // Shape-preserving synthetic. Deliberately NOT built by re-inserting `+`/`/`
    // into a redacted capture value — that would reconstruct the real (inert,
    // deleted) spike meeting UUID, which the standing identifier rule forbids
    // regardless of whether the meeting still exists.
    const uuid = 'Fk+SyntheticUuid/0001==';
    const encoded = encodeMeetingUuid(uuid);

    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('+');
    expect(decodeURIComponent(decodeURIComponent(encoded))).toBe(uuid);
  });

  it('single-encoding would leave a path separator behind', () => {
    // Guards the premise: this is why the double encode exists at all.
    expect(encodeURIComponent('Fk+SyntheticUuid/0001==')).toContain('%2F');
    expect(encodeMeetingUuid('Fk+SyntheticUuid/0001==')).toContain('%252F');
  });
});

// ---------------------------------------------------------------------------
// Sol F4 — did the request reach Zoom?
// ---------------------------------------------------------------------------

/**
 * `outcome` is the field a caller of a NON-IDEMPOTENT verb has to branch on, and the
 * whole point of it living here is that no caller re-derives it from a status code.
 * DEFINITE = a status arrived and it was < 500. Everything else may have landed.
 */
describe('ZoomClient — request outcome classification', () => {
  it('labels a transport throw ambiguous — no status, but the bytes may have gone out', async () => {
    const { client } = build([{ status: 0, throws: true }], { maxAttempts: 1 });
    const error = await client.post('/users/x/meetings', {}).catch((caught) => caught);
    expect(error).toMatchObject({ kind: 'retryable', outcome: 'ambiguous' });
    expect(error.status).toBeUndefined();
  });

  it('labels a 5xx ambiguous — the edge answered for a backend that may have run', async () => {
    const { client } = build([{ status: 503, body: { message: 'upstream' } }], { maxAttempts: 1 });
    const error = await client.post('/users/x/meetings', {}).catch((caught) => caught);
    expect(error).toMatchObject({ kind: 'retryable', status: 503, outcome: 'ambiguous' });
  });

  it('labels an unreadable 2xx body ambiguous, even though the status is a success', async () => {
    // A 201 whose body is not JSON: Zoom acted, and we cannot tell on what. This is the
    // case a plain `status < 500` rule gets WRONG, which is why the client sets the
    // field instead of leaving callers to compare status codes.
    const fetcher = vi.fn(async () => new Response('<html>gateway</html>', { status: 201 }));
    const client = createZoomClient({
      tokenProvider: fakeTokens().provider,
      fetchImpl: fetcher as unknown as typeof fetch,
      maxAttempts: 1,
    });

    const error = await client.post('/users/x/meetings', {}).catch((caught) => caught);
    expect(error).toMatchObject({ kind: 'retryable', status: 201, outcome: 'ambiguous' });
  });

  it('labels 4xx and 429 not_executed — Zoom answered without creating', async () => {
    const rejected = build([{ status: 400, body: { message: 'bad topic' } }], { maxAttempts: 1 });
    await expect(rejected.client.post('/users/x/meetings', {})).rejects.toMatchObject({
      kind: 'non_retryable',
      outcome: 'not_executed',
    });

    const throttled = build([{ status: 429, headers: { 'retry-after': '600' } }], {
      maxAttempts: 1,
    });
    await expect(throttled.client.post('/users/x/meetings', {})).rejects.toMatchObject({
      kind: 'rate_limit',
      outcome: 'not_executed',
    });
  });

  it('labels a locally raised error not_executed — it never went near the wire', () => {
    expect(new ZoomNonRetryableError('config missing').outcome).toBe('not_executed');
  });
});
