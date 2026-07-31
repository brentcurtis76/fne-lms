// @vitest-environment node
/**
 * S2S token provider contract (plan §17 blocking gate: "token single-flight").
 *
 * Every test here builds its own provider through `createZoomTokenProvider`, so the
 * process-wide singleton is never touched and no test can leak a memoized token into
 * the next one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createZoomTokenProvider,
  createSupabaseTokenCacheStore,
  TOKEN_REFRESH_MARGIN_SECONDS,
  type SchemaScopedClient,
  type ZoomTokenCacheStore,
} from '../../../lib/zoom/token';
import {
  ZoomAuthError,
  ZoomConfigError,
  ZoomRateLimitError,
  ZoomRetryableError,
} from '../../../lib/zoom/errors';

const ENV = {
  ZOOM_S2S_ACCOUNT_ID: 'AcctSynthetic0001XXXXXX',
  ZOOM_S2S_CLIENT_ID: 'S2sClientIdInvented1',
  ZOOM_S2S_CLIENT_SECRET: 'S2sClientSecretInvented00001',
} as unknown as NodeJS.ProcessEnv;

/** An in-memory stand-in for the single row. Records every call for assertions. */
function memoryStore(seed: Parameters<ZoomTokenCacheStore['write']>[0] | null = null) {
  const state = { row: seed, reads: 0, writes: 0 };
  const store: ZoomTokenCacheStore = {
    async read() {
      state.reads += 1;
      return state.row;
    },
    async write(grant) {
      state.writes += 1;
      state.row = grant;
    },
  };
  return { store, state };
}

/** A fetch that answers Zoom's OAuth endpoint with a fresh token each time. */
function tokenFetch(options: { lifetime?: number; prefix?: string } = {}) {
  let issued = 0;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    issued += 1;
    return new Response(
      JSON.stringify({
        access_token: `${options.prefix ?? 'token'}-${issued}`,
        token_type: 'bearer',
        scope: 'meeting:write:admin user:read:admin',
        ...(options.lifetime === undefined ? { expires_in: 3600 } : { expires_in: options.lifetime }),
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  });
  return { impl: impl as unknown as typeof fetch, calls, issuedCount: () => issued };
}

describe('createZoomTokenProvider — caching', () => {
  let clock = 1_800_000_000_000;
  beforeEach(() => {
    clock = 1_800_000_000_000;
  });

  it('mints once and reuses the in-process memo', async () => {
    const { store } = memoryStore();
    const fetchImpl = tokenFetch();
    const provider = createZoomTokenProvider({ store, fetchImpl: fetchImpl.impl, env: ENV, now: () => clock });

    expect(await provider.getToken()).toBe('token-1');
    expect(await provider.getToken()).toBe('token-1');
    expect(await provider.getToken()).toBe('token-1');
    expect(fetchImpl.issuedCount()).toBe(1);
  });

  it('adopts a still-fresh row from the DB cache instead of asking Zoom', async () => {
    const { store, state } = memoryStore({
      accessToken: 'from-database',
      expiresAtMs: clock + 3_600_000,
      tokenType: 'bearer',
      scope: 'meeting:write:admin',
    });
    const fetchImpl = tokenFetch();
    const provider = createZoomTokenProvider({ store, fetchImpl: fetchImpl.impl, env: ENV, now: () => clock });

    expect(await provider.getToken()).toBe('from-database');
    expect(fetchImpl.issuedCount()).toBe(0);
    expect(state.reads).toBe(1);
    // Adopting must not rewrite the row — that would be a pointless write storm.
    expect(state.writes).toBe(0);
  });

  it('ignores a DB row that is already inside the refresh margin', async () => {
    const { store } = memoryStore({
      // Alive, but only just — a caller could outlive it mid-request.
      accessToken: 'nearly-dead',
      expiresAtMs: clock + (TOKEN_REFRESH_MARGIN_SECONDS - 1) * 1000,
      tokenType: 'bearer',
      scope: '',
    });
    const fetchImpl = tokenFetch();
    const provider = createZoomTokenProvider({ store, fetchImpl: fetchImpl.impl, env: ENV, now: () => clock });

    expect(await provider.getToken()).toBe('token-1');
    expect(fetchImpl.issuedCount()).toBe(1);
  });

  it('refreshes once the memoized token crosses the margin, not when it expires', async () => {
    const { store } = memoryStore();
    const fetchImpl = tokenFetch({ lifetime: 3600 });
    const provider = createZoomTokenProvider({ store, fetchImpl: fetchImpl.impl, env: ENV, now: () => clock });

    expect(await provider.getToken()).toBe('token-1');

    // One second before the margin opens: still the same token.
    clock += (3600 - TOKEN_REFRESH_MARGIN_SECONDS - 1) * 1000;
    expect(await provider.getToken()).toBe('token-1');

    // Inside the margin: refreshed, while the old token is still technically valid.
    clock += 2000;
    expect(await provider.getToken()).toBe('token-2');
    expect(fetchImpl.issuedCount()).toBe(2);
  });

  it('persists the minted token to the cache row', async () => {
    const { store, state } = memoryStore();
    const fetchImpl = tokenFetch();
    const provider = createZoomTokenProvider({ store, fetchImpl: fetchImpl.impl, env: ENV, now: () => clock });

    await provider.getToken();
    expect(state.writes).toBe(1);
    expect(state.row).toMatchObject({ accessToken: 'token-1', scope: 'meeting:write:admin user:read:admin' });
    expect(state.row?.expiresAtMs).toBe(clock + 3_600_000);
  });

  it('defaults to a 3600 s lifetime when Zoom omits expires_in', async () => {
    const { store, state } = memoryStore();
    const impl = vi.fn(
      async () => new Response(JSON.stringify({ access_token: 'no-lifetime' }), { status: 200 })
    ) as unknown as typeof fetch;
    const provider = createZoomTokenProvider({ store, fetchImpl: impl, env: ENV, now: () => clock });

    await provider.getToken();
    expect(state.row?.expiresAtMs).toBe(clock + 3_600_000);
  });
});

describe('createZoomTokenProvider — single-flight', () => {
  it('collapses concurrent cold-start callers onto ONE grant', async () => {
    const { store, state } = memoryStore();
    let resolveGrant: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      resolveGrant = resolve;
    });
    let issued = 0;
    const impl = vi.fn(async () => {
      issued += 1;
      await gate;
      return new Response(JSON.stringify({ access_token: `token-${issued}`, expires_in: 3600 }), { status: 200 });
    }) as unknown as typeof fetch;

    const provider = createZoomTokenProvider({ store, fetchImpl: impl, env: ENV });

    const all = Promise.all(Array.from({ length: 8 }, () => provider.getToken()));
    // Let every caller reach the awaiting state before the grant resolves.
    await Promise.resolve();
    resolveGrant?.();
    const tokens = await all;

    expect(new Set(tokens)).toEqual(new Set(['token-1']));
    expect(issued).toBe(1);
    // The row is written once, not eight times.
    expect(state.writes).toBe(1);
  });

  it('starts a new grant after the in-flight one settles, not a queued duplicate', async () => {
    const { store } = memoryStore();
    const fetchImpl = tokenFetch();
    let clock = 1_800_000_000_000;
    const provider = createZoomTokenProvider({ store, fetchImpl: fetchImpl.impl, env: ENV, now: () => clock });

    await Promise.all([provider.getToken(), provider.getToken()]);
    expect(fetchImpl.issuedCount()).toBe(1);

    clock += 3_600_000; // token now expired
    await Promise.all([provider.getToken(), provider.getToken()]);
    expect(fetchImpl.issuedCount()).toBe(2);
  });

  it('does not wedge after a failed grant — the next caller retries', async () => {
    const { store } = memoryStore();
    let attempt = 0;
    const impl = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) throw new TypeError('socket hang up');
      return new Response(JSON.stringify({ access_token: 'recovered', expires_in: 3600 }), { status: 200 });
    }) as unknown as typeof fetch;
    const provider = createZoomTokenProvider({ store, fetchImpl: impl, env: ENV });

    await expect(provider.getToken()).rejects.toBeInstanceOf(ZoomRetryableError);
    expect(await provider.getToken()).toBe('recovered');
  });
});

describe('createZoomTokenProvider — forceRefresh (the 401 path)', () => {
  it('replaces the stale token', async () => {
    const { store } = memoryStore();
    const fetchImpl = tokenFetch();
    const provider = createZoomTokenProvider({ store, fetchImpl: fetchImpl.impl, env: ENV });

    const first = await provider.getToken();
    expect(first).toBe('token-1');
    expect(await provider.forceRefresh(first)).toBe('token-2');
    expect(await provider.getToken()).toBe('token-2');
  });

  it('never hands back the token the caller just proved dead, even from the DB row', async () => {
    // The exact shape of the "elder token invalidated by a peer's re-grant" case:
    // our memo and the row both hold the dead value.
    const { store } = memoryStore();
    const fetchImpl = tokenFetch();
    const provider = createZoomTokenProvider({ store, fetchImpl: fetchImpl.impl, env: ENV });

    const dead = await provider.getToken();
    const fresh = await provider.forceRefresh(dead);
    expect(fresh).not.toBe(dead);
  });

  it('adopts a peer-written row rather than minting a third token', async () => {
    const { store, state } = memoryStore();
    const fetchImpl = tokenFetch();
    const provider = createZoomTokenProvider({ store, fetchImpl: fetchImpl.impl, env: ENV });

    const dead = await provider.getToken();
    // Another instance rotated and won the last-writer-wins race on the row.
    state.row = {
      accessToken: 'peer-token',
      expiresAtMs: Date.now() + 3_600_000,
      tokenType: 'bearer',
      scope: '',
    };

    expect(await provider.forceRefresh(dead)).toBe('peer-token');
    // No extra Zoom grant: exactly the one from the initial getToken().
    expect(fetchImpl.issuedCount()).toBe(1);
  });

  it('collapses a burst of concurrent 401s onto a single grant', async () => {
    const { store } = memoryStore();
    const fetchImpl = tokenFetch();
    const provider = createZoomTokenProvider({ store, fetchImpl: fetchImpl.impl, env: ENV });

    const dead = await provider.getToken();
    const refreshed = await Promise.all(Array.from({ length: 6 }, () => provider.forceRefresh(dead)));

    expect(new Set(refreshed).size).toBe(1);
    expect(refreshed[0]).not.toBe(dead);
    // One initial grant + exactly one refresh grant.
    expect(fetchImpl.issuedCount()).toBe(2);
  });

  it('is a no-op when somebody already rotated past the stale token', async () => {
    const { store } = memoryStore();
    const fetchImpl = tokenFetch();
    const provider = createZoomTokenProvider({ store, fetchImpl: fetchImpl.impl, env: ENV });

    const dead = await provider.getToken();
    const rotated = await provider.forceRefresh(dead);

    // A second caller arrives late, still holding the old value.
    expect(await provider.forceRefresh(dead)).toBe(rotated);
    expect(fetchImpl.issuedCount()).toBe(2);
  });
});

describe('createZoomTokenProvider — error taxonomy', () => {
  const { store } = memoryStore();

  it('classifies a rejected grant as auth, not retryable', async () => {
    const impl = vi.fn(
      async () =>
        new Response(JSON.stringify({ reason: 'Invalid client_id or client_secret', error: 'invalid_client' }), {
          status: 401,
        })
    ) as unknown as typeof fetch;
    const provider = createZoomTokenProvider({ store: memoryStore().store, fetchImpl: impl, env: ENV });

    await expect(provider.getToken()).rejects.toMatchObject({
      kind: 'auth',
      status: 401,
    });
  });

  /**
   * The OAuth endpoint is rate-limited like any other Zoom endpoint. Folding its 429
   * into the auth branch — which is what `!response.ok` did before this case existed —
   * contradicts the taxonomy table in `errors.ts` (429 ⇒ `rate_limit`, caller may
   * retry after `retryAfterSeconds`) and routes a transient throttle to Z1b-3's auth
   * triage, where no amount of waiting is allowed to help.
   */
  it('classifies a 429 from the OAuth endpoint as rate_limit, NOT auth', async () => {
    const impl = vi.fn(
      async () =>
        new Response(JSON.stringify({ reason: 'Too Many Requests' }), {
          status: 429,
          headers: { 'retry-after': '17' },
        })
    ) as unknown as typeof fetch;
    const provider = createZoomTokenProvider({ store: memoryStore().store, fetchImpl: impl, env: ENV });

    const error = await provider.getToken().catch((e: Error) => e);
    expect(error).toBeInstanceOf(ZoomRateLimitError);
    expect(error).not.toBeInstanceOf(ZoomAuthError);
    expect(error).toMatchObject({ kind: 'rate_limit', status: 429, retryAfterSeconds: 17 });
  });

  it('classifies a 429 with no Retry-After as rate_limit with no wait hint', async () => {
    const impl = vi.fn(async () => new Response('', { status: 429 })) as unknown as typeof fetch;
    const provider = createZoomTokenProvider({ store: memoryStore().store, fetchImpl: impl, env: ENV });

    const error = await provider.getToken().catch((e: Error) => e);
    expect(error).toBeInstanceOf(ZoomRateLimitError);
    expect(error).toMatchObject({ kind: 'rate_limit', status: 429 });
    expect((error as ZoomRateLimitError).retryAfterSeconds).toBeUndefined();
  });

  it('parses an HTTP-date Retry-After against the provider clock', async () => {
    // RFC 9110 allows either form. Resolving the date against the injected `now`
    // seam — not wall time — is what keeps this assertion deterministic.
    const clock = 1_800_000_000_000;
    const impl = vi.fn(
      async () =>
        new Response('', {
          status: 429,
          headers: { 'retry-after': new Date(clock + 45_000).toUTCString() },
        })
    ) as unknown as typeof fetch;
    const provider = createZoomTokenProvider({
      store: memoryStore().store,
      fetchImpl: impl,
      env: ENV,
      now: () => clock,
    });

    await expect(provider.getToken()).rejects.toMatchObject({
      kind: 'rate_limit',
      status: 429,
      retryAfterSeconds: 45,
    });
  });

  it('classifies a Zoom 5xx as retryable — credentials are not implicated', async () => {
    const impl = vi.fn(async () => new Response('upstream boom', { status: 503 })) as unknown as typeof fetch;
    const provider = createZoomTokenProvider({ store: memoryStore().store, fetchImpl: impl, env: ENV });

    await expect(provider.getToken()).rejects.toMatchObject({ kind: 'retryable', status: 503 });
  });

  it('classifies a transport failure as retryable', async () => {
    const impl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const provider = createZoomTokenProvider({ store: memoryStore().store, fetchImpl: impl, env: ENV });

    await expect(provider.getToken()).rejects.toBeInstanceOf(ZoomRetryableError);
  });

  it('treats a 200 with no access_token as an auth failure', async () => {
    const impl = vi.fn(
      async () => new Response(JSON.stringify({ scope: 'meeting:write:admin' }), { status: 200 })
    ) as unknown as typeof fetch;
    const provider = createZoomTokenProvider({ store: memoryStore().store, fetchImpl: impl, env: ENV });

    await expect(provider.getToken()).rejects.toBeInstanceOf(ZoomAuthError);
  });

  it.each([
    ['ZOOM_S2S_ACCOUNT_ID', { ...ENV, ZOOM_S2S_ACCOUNT_ID: '' }],
    ['ZOOM_S2S_CLIENT_ID', { ...ENV, ZOOM_S2S_CLIENT_ID: '' }],
    ['ZOOM_S2S_CLIENT_SECRET', { ...ENV, ZOOM_S2S_CLIENT_SECRET: '' }],
  ])('reports missing %s as a config error naming only the variable', async (name, env) => {
    const provider = createZoomTokenProvider({
      store: memoryStore().store,
      fetchImpl: tokenFetch().impl,
      env: env as NodeJS.ProcessEnv,
    });

    await expect(provider.getToken()).rejects.toBeInstanceOf(ZoomConfigError);
    await expect(provider.getToken()).rejects.toThrow(name);
  });

  it('never puts the client secret in the request URL', async () => {
    const fetchImpl = tokenFetch();
    const provider = createZoomTokenProvider({
      store: memoryStore().store,
      fetchImpl: fetchImpl.impl,
      env: ENV,
    });

    await provider.getToken();
    const { url, init } = fetchImpl.calls[0];
    expect(url).not.toContain(ENV.ZOOM_S2S_CLIENT_SECRET as string);
    expect(url).toContain('grant_type=account_credentials');
    expect(url).toContain(`account_id=${ENV.ZOOM_S2S_ACCOUNT_ID}`);

    // Credentials travel as HTTP Basic, exactly as the spike idiom does.
    const auth = (init?.headers as Record<string, string>).Authorization;
    expect(auth.startsWith('Basic ')).toBe(true);
    expect(Buffer.from(auth.slice(6), 'base64').toString()).toBe(
      `${ENV.ZOOM_S2S_CLIENT_ID}:${ENV.ZOOM_S2S_CLIENT_SECRET}`
    );
  });

  it('an OAuth error message carries the reason but never the secret', async () => {
    const impl = vi.fn(
      async () => new Response(JSON.stringify({ reason: 'Invalid client_id or client_secret' }), { status: 400 })
    ) as unknown as typeof fetch;
    const provider = createZoomTokenProvider({ store: memoryStore().store, fetchImpl: impl, env: ENV });

    // `.catch` widens the result to `string | Error`; this call is asserted to reject,
    // so narrow to the rejection arm.
    const error = (await provider.getToken().catch((e: Error) => e)) as Error;
    expect(error.message).toContain('Invalid client_id or client_secret');
    expect(error.message).not.toContain(ENV.ZOOM_S2S_CLIENT_SECRET as string);
  });
});

describe('createSupabaseTokenCacheStore', () => {
  function fakeClient(result: { data: unknown; error: unknown }) {
    const upserts: Array<Record<string, unknown>> = [];
    const client = {
      from: () => ({
        select: () => ({ maybeSingle: async () => result }),
        upsert: async (values: Record<string, unknown>) => {
          upserts.push(values);
          return { error: null };
        },
      }),
    };
    return { client, upserts };
  }

  it('maps a row onto a grant', async () => {
    const expiresAt = new Date(1_800_003_600_000).toISOString();
    const { client } = fakeClient({
      data: { access_token: 'cached', token_type: 'bearer', scope: 'meeting:write:admin', expires_at: expiresAt },
      error: null,
    });
    const store = createSupabaseTokenCacheStore(client as unknown as SchemaScopedClient);

    expect(await store.read()).toEqual({
      accessToken: 'cached',
      expiresAtMs: 1_800_003_600_000,
      tokenType: 'bearer',
      scope: 'meeting:write:admin',
    });
  });

  it.each([
    ['a query error', { data: null, error: { message: 'permission denied' } }],
    ['an empty table', { data: null, error: null }],
    ['a row with no token', { data: { access_token: null, expires_at: null }, error: null }],
    [
      'an unparseable expiry',
      { data: { access_token: 't', token_type: 'bearer', scope: '', expires_at: 'not-a-date' }, error: null },
    ],
  ])('returns null on %s rather than throwing — the cache is an optimisation', async (_label, result) => {
    const { client } = fakeClient(result);
    const store = createSupabaseTokenCacheStore(client as unknown as SchemaScopedClient);
    expect(await store.read()).toBeNull();
  });

  it('upserts the single row with id = 1', async () => {
    const { client, upserts } = fakeClient({ data: null, error: null });
    const store = createSupabaseTokenCacheStore(client as unknown as SchemaScopedClient);

    await store.write({
      accessToken: 'written',
      expiresAtMs: 1_800_003_600_000,
      tokenType: 'bearer',
      scope: 'meeting:write:admin',
    });

    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({ id: 1, access_token: 'written', token_type: 'bearer' });
    expect(upserts[0].expires_at).toBe(new Date(1_800_003_600_000).toISOString());
  });
});
