/**
 * Zoom REST client over `fetch` (plan §4: "REST client (typed errors, 429
 * `Retry-After`, read-back of effective settings)").
 *
 * Three behaviours in here are not general HTTP-client conveniences; they are
 * consequences of things the Z0B-2 spike measured against the live account.
 *
 * ## 1. Read-back is an operation, not a nicety
 *
 * A meeting-settings `PATCH` answers **204 with an empty body**. Zoom reports
 * nothing about what it stored, and an invalid enum is **silently coerced** rather
 * than rejected — `auto_recording` coerces to `'none'`, which is the fail-safe
 * direction but is still a value nobody asked for. So the PATCH's status code is
 * evidence that Zoom accepted the bytes and evidence of nothing else. The only
 * confirmation that exists is a subsequent `GET`. `patchWithReadBack()` makes that
 * pairing the default shape rather than something each caller remembers to do.
 *
 * ## 2. `recording_disclaimer` is not usable as a drift signal
 *
 * Ledger §9.4 (routed into this chunk as a PLAN DEFECT): the Settings API reports
 * `recording_disclaimer: false` while the disclaimer demonstrably renders and
 * requires a click from each participant. §12/§18's settings-drift audit therefore
 * **cannot** key on that field. It must key on the `auto_recording` read-back, which
 * the spike confirmed is accurate. `UNVERIFIABLE_SETTINGS_FIELDS` encodes this in
 * the API: those keys are excluded from the drift set and reported separately, so a
 * consumer cannot accidentally build an alert on a field Zoom lies about.
 *
 * ## 3. POSTs are never retried automatically, and every error says whether it landed
 *
 * Retrying `POST /users/{id}/meetings` after an ambiguous failure creates a second
 * meeting. Idempotency for non-idempotent verbs lives in the Z1b-3 job layer, which
 * owns dedupe keys and stage checkpoints; it does not live in a transport retry
 * loop. GET/PUT/PATCH/DELETE are safe to repeat and do get bounded backoff.
 *
 * Not retrying is only half of it: the job layer still has to know whether the request
 * it just gave up on may have executed. So every `ZoomError` this client throws carries
 * `outcome` (`'not_executed' | 'ambiguous'`), set HERE rather than reconstructed by
 * callers from status codes. A definite pre-create rejection is "a status arrived and
 * it was < 500"; a transport throw, a 5xx and an unreadable 2xx body are all ambiguous,
 * and the last of those is why the rule cannot simply be a status comparison (Sol F4).
 *
 * The one exception is a 401, which is handled separately from the backoff loop: a
 * 401 means the request was rejected at the auth boundary and never executed, so
 * replaying it after a forced token refresh cannot double-apply. Without that,
 * every S2S token rotation would fail an in-flight provision.
 */
import {
  isZoomError,
  parseRetryAfter,
  ZoomAuthError,
  ZoomNonRetryableError,
  ZoomRateLimitError,
  ZoomRetryableError,
  type ZoomErrorContext,
} from './errors';
import { getZoomTokenProvider, type ZoomTokenProvider } from './token';

export * from './errors';

export const ZOOM_API_BASE_URL = 'https://api.zoom.us/v2';

/** Verbs that may be replayed unchanged. `POST` is deliberately absent. */
const IDEMPOTENT_METHODS = new Set(['GET', 'PUT', 'PATCH', 'DELETE']);

/**
 * Settings keys whose read-back value carries no information (see the header).
 * A drift alert keyed on one of these fires constantly and means nothing.
 */
export const UNVERIFIABLE_SETTINGS_FIELDS: readonly string[] = ['recording_disclaimer'];

export type ZoomHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type ZoomQuery = Record<string, string | number | boolean | undefined | null>;

export interface ZoomRequestOptions {
  method: ZoomHttpMethod;
  /** Path below `/v2`, already encoded. Meeting UUIDs need DOUBLE encoding. */
  path: string;
  query?: ZoomQuery;
  body?: unknown;
  /**
   * Override the verb-derived retry judgment. Set `false` on a PUT/PATCH that is
   * not actually replay-safe; setting `true` on a POST is a deliberate, reviewed
   * decision and belongs to the caller, not to this module.
   */
  idempotent?: boolean;
}

export interface ZoomResponse<T> {
  status: number;
  /** `null` on 204 and on any empty body — a settings PATCH always lands here. */
  data: T | null;
  /** `x-zm-request-id`, echoed so a job's `last_error` can reference a Zoom ticket. */
  requestId?: string;
}

export interface ZoomSettingsDrift {
  key: string;
  requested: unknown;
  effective: unknown;
}

export interface ZoomReadBack<T> {
  /** Status of the PATCH. 204/empty — see the header: this proves acceptance only. */
  patchStatus: number;
  /** What the follow-up GET says Zoom actually stored. The real answer. */
  effective: T;
  /** True when every verifiable requested key came back with the requested value. */
  matches: boolean;
  /** Requested keys whose read-back disagrees. This is the settings-drift signal. */
  drift: ZoomSettingsDrift[];
  /**
   * Requested keys that were skipped because Zoom does not report them accurately
   * (`UNVERIFIABLE_SETTINGS_FIELDS`). Never treat an entry here as confirmed.
   */
  unverifiable: string[];
}

export interface ZoomClientDeps {
  tokenProvider?: ZoomTokenProvider;
  fetchImpl?: typeof fetch;
  /** Injected so backoff is instant in tests and real in production. */
  sleep?: (ms: number) => Promise<void>;
  baseUrl?: string;
  /** Total attempts for a retryable failure on an idempotent verb. */
  maxAttempts?: number;
  /** First backoff step; doubles per attempt up to `maxBackoffMs`. */
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  /**
   * Longest `Retry-After` this client will wait out inline. Beyond it the 429 is
   * surfaced so the job layer can reschedule instead of holding a function warm.
   */
  maxRetryAfterSeconds?: number;
}

export interface ZoomClient {
  request<T>(options: ZoomRequestOptions): Promise<ZoomResponse<T>>;
  get<T>(path: string, query?: ZoomQuery): Promise<ZoomResponse<T>>;
  post<T>(path: string, body?: unknown): Promise<ZoomResponse<T>>;
  patch<T>(path: string, body?: unknown): Promise<ZoomResponse<T>>;
  put<T>(path: string, body?: unknown): Promise<ZoomResponse<T>>;
  del<T>(path: string, query?: ZoomQuery): Promise<ZoomResponse<T>>;
  /**
   * PATCH then GET, because the PATCH cannot confirm itself. `requested` is the flat
   * set of key→value expectations; every one of its keys is compared against the
   * read-back.
   *
   * Zoom nests meeting settings, so the two `options` hooks exist: `patchBody` sends
   * `{settings: requested}` while `select` points the comparison at
   * `response.settings`. Without them the comparison would diff the whole settings
   * object — and Zoom returns dozens of keys nobody sent, so every call would report
   * drift.
   */
  patchWithReadBack<T extends Record<string, unknown>>(
    patchPath: string,
    requested: Record<string, unknown>,
    readBackPath: string,
    options?: {
      readBackQuery?: ZoomQuery;
      /** Body to PATCH, when it differs from `requested`. Defaults to `requested`. */
      patchBody?: Record<string, unknown>;
      /** Picks the object `requested` is compared against. Defaults to the whole body. */
      select?: (data: T) => Record<string, unknown> | undefined;
    }
  ): Promise<ZoomReadBack<T>>;
}

// ---------------------------------------------------------------------------
// Response handling
// ---------------------------------------------------------------------------

interface ParsedFailure {
  message: string;
  zoomCode?: number;
}

function parseFailureBody(raw: string): ParsedFailure {
  if (!raw) return { message: 'empty response body' };
  try {
    const parsed = JSON.parse(raw) as { message?: unknown; code?: unknown };
    const message = typeof parsed.message === 'string' ? parsed.message : raw.slice(0, 200);
    const zoomCode = typeof parsed.code === 'number' ? parsed.code : undefined;
    return { message, zoomCode };
  } catch {
    // Zoom occasionally answers HTML from an edge tier. Truncate — an error string
    // ends up in `zoom_jobs.last_error`, and a full page there helps nobody.
    return { message: raw.slice(0, 200) };
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export function createZoomClient(deps: ZoomClientDeps = {}): ZoomClient {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const baseUrl = deps.baseUrl ?? ZOOM_API_BASE_URL;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const maxAttempts = deps.maxAttempts ?? 3;
  const baseBackoffMs = deps.baseBackoffMs ?? 500;
  const maxBackoffMs = deps.maxBackoffMs ?? 8000;
  const maxRetryAfterSeconds = deps.maxRetryAfterSeconds ?? 60;
  const tokens = deps.tokenProvider ?? getZoomTokenProvider();

  /**
   * Deterministic, not jittered. The worker fleet is a per-minute cron plus a
   * handful of request-path calls, so the thundering herd that jitter defends
   * against does not exist here — and a deterministic schedule is assertable.
   */
  function backoffFor(attempt: number): number {
    return Math.min(baseBackoffMs * 2 ** (attempt - 1), maxBackoffMs);
  }

  function buildUrl(path: string, query?: ZoomQuery): string {
    const url = new URL(`${baseUrl}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  /**
   * One wire attempt. Never retries — it either returns a response or throws the
   * classified error, and `request` owns every decision about repeating it.
   */
  async function attempt<T>(options: ZoomRequestOptions, accessToken: string): Promise<ZoomResponse<T>> {
    // Query strings can carry a `download_access_token`; the operation label used in
    // errors and logs is the path only.
    const operation = `${options.method} ${options.path}`;
    let response: Response;

    try {
      response = await fetchImpl(buildUrl(options.path, options.query), {
        method: options.method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
    } catch (cause) {
      // AMBIGUOUS, explicitly: `fetch` rejects for a connection that was never made AND
      // for one that sent every byte and lost the response. There is no status to
      // derive it from, and guessing "not executed" is the guess that creates a second
      // meeting (Sol F4).
      throw new ZoomRetryableError(`Zoom request failed at the transport layer: ${operation}.`, {
        operation,
        outcome: 'ambiguous',
        cause,
      });
    }

    const requestId = response.headers.get('x-zm-request-id') ?? undefined;
    const context: ZoomErrorContext = { status: response.status, operation, requestId };

    if (response.ok) {
      const raw = await response.text();
      // 204 and empty 200s both land here. A settings PATCH is always this case —
      // which is the whole reason `patchWithReadBack` exists.
      let data: T | null = null;
      if (raw) {
        try {
          data = JSON.parse(raw) as T;
        } catch (cause) {
          // A 2xx we cannot read. The status says Zoom accepted and acted on the
          // request; the body says we have no idea what it produced. AMBIGUOUS, and
          // the status-derived default would have said `not_executed`.
          throw new ZoomRetryableError(`Zoom returned unparseable JSON for ${operation}.`, {
            ...context,
            outcome: 'ambiguous',
            cause,
          });
        }
      }
      return { status: response.status, data, requestId };
    }

    const { message, zoomCode } = parseFailureBody(await response.text());
    const failureContext: ZoomErrorContext = { ...context, zoomCode };

    if (response.status === 401) {
      throw new ZoomAuthError(`Zoom rejected credentials on ${operation}: ${message}.`, failureContext);
    }
    if (response.status === 429) {
      throw new ZoomRateLimitError(`Zoom rate limit on ${operation}: ${message}.`, {
        ...failureContext,
        retryAfterSeconds: parseRetryAfter(response.headers.get('retry-after'), Date.now()),
      });
    }
    if (response.status >= 500) {
      throw new ZoomRetryableError(`Zoom server error on ${operation}: ${message}.`, failureContext);
    }
    throw new ZoomNonRetryableError(
      `Zoom rejected ${operation} with ${response.status}: ${message}.`,
      failureContext
    );
  }

  async function request<T>(options: ZoomRequestOptions): Promise<ZoomResponse<T>> {
    const idempotent = options.idempotent ?? IDEMPOTENT_METHODS.has(options.method);
    // The auth retry is separate from — and does not consume — the backoff budget.
    // A 401 never executed, so replaying it is safe even for a POST.
    let authRetryUsed = false;
    let attemptNumber = 0;

    for (;;) {
      attemptNumber += 1;
      const accessToken = await tokens.getToken();

      try {
        return await attempt<T>(options, accessToken);
      } catch (caught) {
        // A non-Zoom throw is a bug in this module, not a transport condition.
        if (!isZoomError(caught)) throw caught;
        const error = caught;

        if (error.kind === 'auth') {
          if (authRetryUsed) throw error;
          authRetryUsed = true;
          attemptNumber -= 1; // does not count against the retryable budget
          await tokens.forceRefresh(accessToken);
          continue;
        }

        // Everything below here would repeat a request that may have executed.
        if (!idempotent) throw error;
        if (error.kind === 'non_retryable') throw error;
        if (attemptNumber >= maxAttempts) throw error;

        if (error.kind === 'rate_limit') {
          const retryAfter = error.retryAfterSeconds;
          // Honour Zoom's own number when it gave one; refuse to hold a function
          // warm for a long one and let the job layer reschedule instead.
          if (retryAfter !== undefined && retryAfter > maxRetryAfterSeconds) throw error;
          await sleep(retryAfter !== undefined ? retryAfter * 1000 : backoffFor(attemptNumber));
          continue;
        }

        await sleep(backoffFor(attemptNumber));
      }
    }
  }

  async function patchWithReadBack<T extends Record<string, unknown>>(
    patchPath: string,
    requested: Record<string, unknown>,
    readBackPath: string,
    options: {
      readBackQuery?: ZoomQuery;
      patchBody?: Record<string, unknown>;
      select?: (data: T) => Record<string, unknown> | undefined;
    } = {}
  ): Promise<ZoomReadBack<T>> {
    const patched = await request<never>({
      method: 'PATCH',
      path: patchPath,
      body: options.patchBody ?? requested,
    });

    const read = await request<T>({ method: 'GET', path: readBackPath, query: options.readBackQuery });
    if (read.data === null) {
      throw new ZoomRetryableError(`Read-back of ${patchPath} returned no body — the PATCH is unconfirmed.`, {
        status: read.status,
        operation: `GET ${readBackPath}`,
        requestId: read.requestId,
      });
    }

    const compared = (options.select ? options.select(read.data) : read.data) ?? {};
    const drift: ZoomSettingsDrift[] = [];
    const unverifiable: string[] = [];

    for (const [key, value] of Object.entries(requested)) {
      if (UNVERIFIABLE_SETTINGS_FIELDS.includes(key)) {
        unverifiable.push(key);
        continue;
      }
      const effective = compared[key];
      // Structural compare: some settings values are objects (e.g. `approval_type`
      // groups), and a reference compare would report drift on every one of them.
      if (JSON.stringify(effective) !== JSON.stringify(value)) {
        drift.push({ key, requested: value, effective });
      }
    }

    return {
      patchStatus: patched.status,
      effective: read.data,
      matches: drift.length === 0,
      drift,
      unverifiable,
    };
  }

  return {
    request,
    get: (path, query) => request({ method: 'GET', path, query }),
    post: (path, body) => request({ method: 'POST', path, body }),
    patch: (path, body) => request({ method: 'PATCH', path, body }),
    put: (path, body) => request({ method: 'PUT', path, body }),
    del: (path, query) => request({ method: 'DELETE', path, query }),
    patchWithReadBack,
  };
}

/**
 * Zoom meeting UUIDs can contain `/` and `+` (the spike's real UUID carried both),
 * and Zoom's own documentation requires DOUBLE URL-encoding when one appears in a
 * path segment. Single-encoding produces a 404 that looks like a missing meeting.
 */
export function encodeMeetingUuid(uuid: string): string {
  return encodeURIComponent(encodeURIComponent(uuid));
}
