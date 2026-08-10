/**
 * Server-to-Server OAuth token provider (plan §4 "Integration layer").
 *
 * Two caches, one grant path:
 *
 *  1. **In-process memo** — the hot path. A warm Vercel function reuses its token
 *     until the refresh margin, and never touches Postgres or Zoom.
 *  2. **`zoom_internal.zoom_token_cache`** — the cold path. A freshly-booted
 *     instance (or the cron worker, or a second region) reads the row before asking
 *     Zoom for a grant, so N instances do not each mint their own token.
 *
 * Only ONE grant may be in flight per process at a time (`ensureGrant`), so a burst
 * of concurrent callers on a cold instance produces one Zoom request, not one per
 * caller. That is the "single-flight" requirement in §4.
 *
 * ## The re-grant question, and why this design does not need the answer
 *
 * Zoom's account-credentials grant may or may not invalidate previously issued
 * tokens for the same app. **`docs/planning/zoom-spike-results.md` records no
 * evidence either way** — the spike's own provider (`scripts/spikes/zoom/lib.mjs:104`)
 * is a single-process memo that never had two grants racing, so the question never
 * arose and no observation exists to cite. The results doc's token coverage stops at
 * scope counts (§6.2 / §9.2 probes); there is no elder-token experiment in it.
 *
 * The design is therefore built to be correct under BOTH answers:
 *
 *  - **If elder tokens survive a re-grant**: two instances racing to write the row
 *    both hold working tokens. The row is last-writer-wins and the loser's write is
 *    simply overwritten — harmless, because the row is a warm-start hint, never the
 *    authority. Each process trusts its own memo.
 *  - **If a re-grant kills elder tokens**: the losing instance's memoized token starts
 *    returning 401. That is exactly the case `client.ts` handles — one forced refresh
 *    (`forceRefresh(staleToken)`) plus one retry, then a typed `ZoomAuthError`. The
 *    forced refresh re-reads the row first, so it usually adopts the winner's live
 *    token rather than minting a third one.
 *
 * Neither branch loses data or spins. Nothing here should be "simplified" by assuming
 * one of the two behaviours until somebody measures it against a live account.
 */
import { createClient } from '@supabase/supabase-js';
import {
  parseRetryAfter,
  ZoomAuthError,
  ZoomConfigError,
  ZoomRateLimitError,
  ZoomRetryableError,
} from './errors';

const ZOOM_OAUTH_URL = 'https://zoom.us/oauth/token';

/**
 * Refresh this far before the token actually expires.
 *
 * 120 s covers the two things that can make a "still valid" token fail in flight:
 * clock skew between our host and Zoom's issuer (webhook captures showed Zoom's
 * clock up to ~15 ms AHEAD of ours — small, but the sign proves the two clocks are
 * independent), and a long-running request that starts inside the window and lands
 * outside it (the recording transfer's `GET /recordings` calls are the slow ones).
 * Zoom's S2S tokens live 3600 s, so this spends ~3.3% of each token's life.
 */
export const TOKEN_REFRESH_MARGIN_SECONDS = 120;

/** Fallback lifetime when Zoom omits `expires_in` (documented as 3600). */
const DEFAULT_TOKEN_LIFETIME_SECONDS = 3600;

interface ZoomTokenGrant {
  accessToken: string;
  /** Epoch ms at which Zoom says the token dies (no margin subtracted). */
  expiresAtMs: number;
  tokenType: string;
  scope: string;
}

/**
 * Persistence seam for the single-row cache. Structural on purpose: the production
 * store speaks `serviceClient.schema('zoom_internal')`, and tests hand in a plain
 * object rather than standing up Postgres.
 */
export interface ZoomTokenCacheStore {
  read(): Promise<ZoomTokenGrant | null>;
  write(grant: ZoomTokenGrant): Promise<void>;
}

export interface ZoomTokenProviderDeps {
  store: ZoomTokenCacheStore;
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  /** Injectable clock (epoch ms) so freshness boundaries are testable. */
  now?: () => number;
}

/**
 * A caller's budget, honoured as a bound on ITS OWN WAIT and never on the grant.
 *
 * The grant is single-flight and shared (see the header): a burst of concurrent
 * callers rides one Zoom request. So a request-path caller with an 8 s budget may not
 * abort the fetch — a cron job that joined the same grant would fail with it. What it
 * may do is stop waiting, which is the property that bounds a request lifetime. The
 * grant then finishes for whoever else is on it, and its result still populates the
 * memo for the next caller.
 */
export interface ZoomTokenWait {
  signal?: AbortSignal;
}

/** Raised when a caller's budget expired before the grant it was waiting on landed. */
export const TOKEN_WAIT_ABANDONED_MESSAGE =
  'Zoom OAuth token wait abandoned: the caller’s budget expired before the grant landed.';

export interface ZoomTokenProvider {
  /** Cached token, refreshed transparently inside the margin. */
  getToken(wait?: ZoomTokenWait): Promise<string>;
  /**
   * Discard `staleToken` and obtain a different one. Returns immediately with the
   * current token if somebody already rotated past `staleToken` — that is what
   * collapses a burst of concurrent 401s onto a single grant.
   */
  forceRefresh(staleToken: string, wait?: ZoomTokenWait): Promise<string>;
}

// ---------------------------------------------------------------------------
// Supabase-backed store
// ---------------------------------------------------------------------------

/** Row shape of `zoom_internal.zoom_token_cache` (CHECK id = 1). */
interface TokenCacheRowIO {
  access_token: string | null;
  token_type: string | null;
  scope: string | null;
  expires_at: string | null;
}

/**
 * Minimal structural view of the supabase-js surface this store uses. The generated
 * `types/supabase.ts` predates `zoom_internal` entirely (see `lib/zoom/db-types.ts`),
 * so the schema-scoped client is typed here rather than pretending the generated
 * types cover it. This interface is the ONLY untyped boundary in the module.
 */
export interface SchemaScopedClient {
  from(table: string): {
    select(columns: string): {
      maybeSingle(): PromiseLike<{ data: TokenCacheRowIO | null; error: { message: string } | null }>;
    };
    upsert(
      values: Record<string, unknown>,
      options: { onConflict: string }
    ): PromiseLike<{ error: { message: string } | null }>;
  };
}

export function createSupabaseTokenCacheStore(client: SchemaScopedClient): ZoomTokenCacheStore {
  return {
    async read() {
      const { data, error } = await client
        .from('zoom_token_cache')
        .select('access_token, token_type, scope, expires_at')
        .maybeSingle();

      // A read failure is NOT fatal: the cache is an optimisation, and falling
      // through to a fresh grant is strictly better than failing the caller.
      if (error || !data?.access_token || !data.expires_at) return null;

      const expiresAtMs = Date.parse(data.expires_at);
      if (!Number.isFinite(expiresAtMs)) return null;

      return {
        accessToken: data.access_token,
        expiresAtMs,
        tokenType: data.token_type ?? 'bearer',
        scope: data.scope ?? '',
      };
    },

    async write(grant) {
      // Last-writer-wins by construction (single row, CHECK id = 1). See the module
      // header for why the race is harmless in both re-grant regimes.
      await client.from('zoom_token_cache').upsert(
        {
          id: 1,
          access_token: grant.accessToken,
          token_type: grant.tokenType,
          scope: grant.scope,
          expires_at: new Date(grant.expiresAtMs).toISOString(),
          fetched_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );
      // A write failure is swallowed for the same reason a read failure is: the
      // caller already has a working token, and the next process just mints its own.
    },
  };
}

/**
 * Lazily builds the service-role client. Not module-level, because importing this
 * file must never throw on a machine without Supabase env (the signer and verifier
 * live in the same directory and are used by tests that have no database).
 */
export function defaultTokenCacheStore(env: NodeJS.ProcessEnv = process.env): ZoomTokenCacheStore {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new ZoomConfigError(
      'Zoom token cache unavailable: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set.'
    );
  }
  const client = createClient(url, serviceKey, { auth: { persistSession: false } });
  // §6: `zoom_internal` is exposed in the Data API and denied by GRANTS, so only the
  // service-role key can address it. The cast is the one place the generated types
  // and the live schema are known to disagree.
  return createSupabaseTokenCacheStore(client.schema('zoom_internal') as unknown as SchemaScopedClient);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface S2SCredentials {
  accountId: string;
  clientId: string;
  clientSecret: string;
}

/** §14 secrets, server-only — never `NEXT_PUBLIC_*`. */
function readCredentials(env: NodeJS.ProcessEnv): S2SCredentials {
  const accountId = env.ZOOM_S2S_ACCOUNT_ID;
  const clientId = env.ZOOM_S2S_CLIENT_ID;
  const clientSecret = env.ZOOM_S2S_CLIENT_SECRET;
  // Names only — a message must never echo a value.
  const missing = [
    !accountId && 'ZOOM_S2S_ACCOUNT_ID',
    !clientId && 'ZOOM_S2S_CLIENT_ID',
    !clientSecret && 'ZOOM_S2S_CLIENT_SECRET',
  ].filter((name): name is string => typeof name === 'string');

  if (missing.length > 0) {
    throw new ZoomConfigError(`Zoom S2S credentials missing: ${missing.join(', ')}.`);
  }
  return {
    accountId: accountId as string,
    clientId: clientId as string,
    clientSecret: clientSecret as string,
  };
}

export function createZoomTokenProvider(deps: ZoomTokenProviderDeps): ZoomTokenProvider {
  const env = deps.env ?? process.env;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => Date.now());

  let memo: ZoomTokenGrant | null = null;
  let inFlight: Promise<ZoomTokenGrant> | null = null;

  const isUsable = (grant: ZoomTokenGrant): boolean =>
    grant.expiresAtMs - now() > TOKEN_REFRESH_MARGIN_SECONDS * 1000;

  /** The Zoom call itself. The spike idiom is `scripts/spikes/zoom/lib.mjs:104–121`. */
  async function grantFromZoom(): Promise<ZoomTokenGrant> {
    const { accountId, clientId, clientSecret } = readCredentials(env);
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const url = `${ZOOM_OAUTH_URL}?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`;

    let response: Response;
    try {
      response = await fetchImpl(url, { method: 'POST', headers: { Authorization: `Basic ${basic}` } });
    } catch (cause) {
      // Transport failure — the credentials are not implicated, so this is retryable
      // rather than an auth error. Misclassifying it would strand a job on triage.
      throw new ZoomRetryableError('Zoom OAuth token request failed at the transport layer.', {
        operation: 'POST /oauth/token',
        cause,
      });
    }

    const rawBody = await response.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
    } catch {
      parsed = {};
    }

    if (!response.ok) {
      // Zoom's OAuth errors are `{ reason, error }`, not the API's `{ code, message }`.
      const reason = typeof parsed.reason === 'string' ? parsed.reason : undefined;
      const oauthError = typeof parsed.error === 'string' ? parsed.error : undefined;
      const detail = reason ?? oauthError ?? 'no reason given';

      if (response.status >= 500) {
        throw new ZoomRetryableError(`Zoom OAuth token request failed: ${response.status} (${detail}).`, {
          status: response.status,
          operation: 'POST /oauth/token',
        });
      }
      if (response.status === 429) {
        // The OAuth endpoint throttles like any other. This is NOT an auth failure —
        // the credentials were never judged — so it must not land in the job layer's
        // auth triage, which is terminal. `errors.ts` says 429 ⇒ `rate_limit`, retry
        // after `retryAfterSeconds`, and that holds here too.
        throw new ZoomRateLimitError(`Zoom OAuth token request was rate limited: 429 (${detail}).`, {
          status: response.status,
          operation: 'POST /oauth/token',
          retryAfterSeconds: parseRetryAfter(response.headers.get('retry-after'), now()),
        });
      }
      throw new ZoomAuthError(`Zoom OAuth token request rejected: ${response.status} (${detail}).`, {
        status: response.status,
        operation: 'POST /oauth/token',
      });
    }

    const accessToken = parsed.access_token;
    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      throw new ZoomAuthError('Zoom OAuth response carried no access_token.', {
        status: response.status,
        operation: 'POST /oauth/token',
      });
    }

    const expiresIn =
      typeof parsed.expires_in === 'number' && Number.isFinite(parsed.expires_in)
        ? parsed.expires_in
        : DEFAULT_TOKEN_LIFETIME_SECONDS;

    return {
      accessToken,
      expiresAtMs: now() + expiresIn * 1000,
      tokenType: typeof parsed.token_type === 'string' ? parsed.token_type : 'bearer',
      scope: typeof parsed.scope === 'string' ? parsed.scope : '',
    };
  }

  /**
   * One grant attempt: re-check the memo, then the DB row, then ask Zoom.
   * `rejectToken` is the token a forced refresh has already proven dead — neither
   * cache may hand it back.
   */
  async function performGrant(rejectToken: string | undefined): Promise<ZoomTokenGrant> {
    // Another caller's grant may have landed while this one queued.
    if (memo && isUsable(memo) && memo.accessToken !== rejectToken) return memo;

    const cached = await deps.store.read();
    if (cached && isUsable(cached) && cached.accessToken !== rejectToken) {
      memo = cached;
      return cached;
    }

    const fresh = await grantFromZoom();
    memo = fresh;
    await deps.store.write(fresh);
    return fresh;
  }

  function ensureGrant(rejectToken?: string): Promise<ZoomTokenGrant> {
    // Single-flight: concurrent callers share one grant.
    //
    // A caller arriving with a `rejectToken` while an unrelated grant is already in
    // flight joins that grant rather than starting a second one. If that grant
    // happens to return the same dead token, the caller does NOT loop — `client.ts`
    // bounds recovery at one forced refresh plus one retry, and then surfaces a
    // typed ZoomAuthError. Bounded and observable beats a livelock.
    if (inFlight) return inFlight;
    const pending = performGrant(rejectToken).finally(() => {
      if (inFlight === pending) inFlight = null;
    });
    inFlight = pending;
    return pending;
  }

  /**
   * Wait for `grant`, or give up when the caller's budget expires — whichever comes
   * first. The grant itself is untouched either way; see `ZoomTokenWait`.
   */
  async function waitFor(grant: Promise<ZoomTokenGrant>, wait?: ZoomTokenWait): Promise<ZoomTokenGrant> {
    const signal = wait?.signal;
    if (!signal) return grant;
    if (signal.aborted) throw new ZoomRetryableError(TOKEN_WAIT_ABANDONED_MESSAGE, { operation: 'POST /oauth/token' });

    let onAbort = () => {};
    try {
      return await Promise.race([
        grant,
        new Promise<never>((_, reject) => {
          onAbort = () =>
            reject(
              new ZoomRetryableError(TOKEN_WAIT_ABANDONED_MESSAGE, { operation: 'POST /oauth/token' })
            );
          signal.addEventListener('abort', onAbort, { once: true });
        }),
      ]);
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  }

  // Declared as functions rather than object methods so a destructured
  // `const { forceRefresh } = provider` keeps working.
  async function getToken(wait?: ZoomTokenWait): Promise<string> {
    if (memo && isUsable(memo)) return memo.accessToken;
    return (await waitFor(ensureGrant(), wait)).accessToken;
  }

  async function forceRefresh(staleToken: string, wait?: ZoomTokenWait): Promise<string> {
    // Join whatever is already happening first. If somebody rotated past the dead
    // token while this caller was waiting on its 401, reuse their result — that is
    // what stops N simultaneous 401s from minting N tokens.
    const current = await getToken(wait);
    if (current !== staleToken) return current;

    if (memo?.accessToken === staleToken) memo = null;
    return (await waitFor(ensureGrant(staleToken), wait)).accessToken;
  }

  return { getToken, forceRefresh };
}

/**
 * Process-wide provider. The singleton is what makes single-flight meaningful in
 * production; tests build their own via `createZoomTokenProvider` and never touch it.
 */
let defaultProvider: ZoomTokenProvider | null = null;

export function getZoomTokenProvider(): ZoomTokenProvider {
  if (!defaultProvider) {
    defaultProvider = createZoomTokenProvider({ store: defaultTokenCacheStore() });
  }
  return defaultProvider;
}
