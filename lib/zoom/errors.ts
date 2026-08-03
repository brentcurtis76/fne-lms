/**
 * Typed error taxonomy for the Zoom integration layer (plan §17: "client retry
 * taxonomy" in the blocking CI gate).
 *
 * This is a leaf module on purpose. `client.ts` owns the taxonomy conceptually and
 * re-exports every symbol here, but `token.ts` must also be able to throw
 * `ZoomAuthError`, and defining the classes in `client.ts` would make
 * token → client → token a cycle. Nothing in this file imports anything.
 *
 * The four kinds map exactly onto what a caller is allowed to do:
 *
 * | kind           | HTTP                    | Caller may retry?                       |
 * |----------------|-------------------------|-----------------------------------------|
 * | `auth`         | 401 (after one refresh) | No — credentials or scopes are wrong.   |
 * | `rate_limit`   | 429                     | Yes, after `retryAfterSeconds`.         |
 * | `retryable`    | 5xx, network failure    | Yes, with bounded backoff.              |
 * | `non_retryable`| 4xx other than 401/429  | No — the request itself is wrong.       |
 *
 * **Message discipline**: these errors are logged and stored in
 * `zoom_internal.zoom_jobs.last_error`, so they carry status codes, Zoom's numeric
 * error code and Zoom's own message — never a request header, never a bearer token,
 * never the S2S client secret. Callers construct them through the helpers below
 * rather than interpolating a whole response.
 */

export type ZoomErrorKind = 'auth' | 'rate_limit' | 'retryable' | 'non_retryable';

/**
 * Did the request REACH the provider? Orthogonal to `kind`, and the only question that
 * matters for a non-idempotent verb (Sol F4).
 *
 * | outcome        | means                              | caller may assume            |
 * |----------------|------------------------------------|------------------------------|
 * | `not_executed` | Zoom answered, and answered <500   | nothing was created          |
 * | `ambiguous`    | transport threw, 5xx, or an        | the request MAY have landed  |
 * |                | unreadable 2xx body                |                              |
 *
 * `kind` cannot answer it: a 429 and a socket reset are both retryable-ish, but only
 * one of them is a definite pre-create rejection. Callers must not re-derive this from
 * status codes — that archaeology is exactly what this field exists to delete.
 */
export type ZoomRequestOutcome = 'not_executed' | 'ambiguous';

export interface ZoomErrorContext {
  /** HTTP status, when the failure came from a response rather than the socket. */
  status?: number;
  /** Zoom's numeric `code` field (e.g. 4711 = missing scope, 3001 = not found). */
  zoomCode?: number;
  /** `x-zm-request-id` / `x-zm-trackingid`, echoed for Zoom support tickets. */
  requestId?: string;
  /** `METHOD /path` — never the query string, which can carry a download token. */
  operation?: string;
  /** Parsed from `Retry-After` on a 429. */
  retryAfterSeconds?: number;
  /**
   * Overrides the status-derived default below. The client sets it explicitly for the
   * two cases a status code cannot express: a transport throw (no status at all, but
   * the bytes may well have gone out) and an unreadable 2xx body (a success status
   * over a response we cannot use).
   */
  outcome?: ZoomRequestOutcome;
  cause?: unknown;
}

export class ZoomError extends Error {
  readonly kind: ZoomErrorKind;
  readonly status?: number;
  readonly zoomCode?: number;
  readonly requestId?: string;
  readonly operation?: string;
  readonly retryAfterSeconds?: number;
  /** Always defined — see `deriveOutcome` for the default. */
  readonly outcome: ZoomRequestOutcome;

  constructor(kind: ZoomErrorKind, message: string, context: ZoomErrorContext = {}) {
    super(message, context.cause === undefined ? undefined : { cause: context.cause });
    this.name = new.target.name;
    this.kind = kind;
    this.status = context.status;
    this.zoomCode = context.zoomCode;
    this.requestId = context.requestId;
    this.operation = context.operation;
    this.retryAfterSeconds = context.retryAfterSeconds;
    this.outcome = deriveOutcome(context);
  }
}

/**
 * A status ≥ 500 means Zoom's edge answered for a backend that may or may not have run
 * the write — ambiguous. A status < 500 means Zoom itself answered and refused, so
 * nothing was created. NO status means the error was raised locally (a config error, a
 * handler's own taxonomy) and never went near the wire — `not_executed`; the client
 * passes `outcome` explicitly for the one local throw that is genuinely ambiguous, the
 * transport failure.
 */
function deriveOutcome(context: ZoomErrorContext): ZoomRequestOutcome {
  if (context.outcome !== undefined) return context.outcome;
  return context.status !== undefined && context.status >= 500 ? 'ambiguous' : 'not_executed';
}

/**
 * Credentials rejected. Thrown by the token provider when the OAuth grant itself
 * fails, and by the client when a 401 survives one forced refresh and one retry.
 */
export class ZoomAuthError extends ZoomError {
  constructor(message: string, context: ZoomErrorContext = {}) {
    super('auth', message, context);
  }
}

/** 429. `retryAfterSeconds` is Zoom's own `Retry-After` when it sent one. */
export class ZoomRateLimitError extends ZoomError {
  constructor(message: string, context: ZoomErrorContext = {}) {
    super('rate_limit', message, context);
  }
}

/** 5xx or a transport failure — the request may succeed unchanged later. */
export class ZoomRetryableError extends ZoomError {
  constructor(message: string, context: ZoomErrorContext = {}) {
    super('retryable', message, context);
  }
}

/** 4xx other than 401/429 — retrying the identical request cannot help. */
export class ZoomNonRetryableError extends ZoomError {
  constructor(message: string, context: ZoomErrorContext = {}) {
    super('non_retryable', message, context);
  }
}

/**
 * Misconfiguration (missing env). Deliberately `non_retryable`: a job that hits
 * this must go to triage, not spin against a variable no backoff will create.
 */
export class ZoomConfigError extends ZoomNonRetryableError {}

/**
 * A 2xx this integration cannot use: Zoom accepted and acted on the request, and the
 * response does not tell us what it produced. TWO bodies land here — empty, and valid
 * JSON that fails the caller's shape check.
 *
 * A third unusable 2xx exists and does NOT land here (Sol R3 ③): unparseable JSON is
 * raised in `client.ts` as a `ZoomRetryableError`, also carrying `outcome: 'ambiguous'`
 * explicitly. All three mean the same thing on a non-idempotent verb — the write MAY
 * have landed — so the OUTCOME is unified; the CLASS is not, and this comment used to
 * claim otherwise. The asymmetry is deliberate: that path is generic client machinery
 * shared with GET and PATCH, where `retryable` is the correct kind.
 *
 * The class exists so `outcome: 'ambiguous'` is an INVARIANT rather than something
 * every call site has to remember to pass. Sol R2 ① found the gap this closes: a
 * schema-invalid 201 flowed through as a success, and a success that cannot be read is
 * indistinguishable, from here, from one that never happened.
 *
 * `non_retryable` because retrying a create is precisely the second write this class
 * exists to prevent; `outcome` — not `kind` — is what the provisioner branches on.
 */
export class ZoomUnusableSuccessError extends ZoomNonRetryableError {
  constructor(message: string, context: Omit<ZoomErrorContext, 'outcome'> = {}) {
    super(message, { ...context, outcome: 'ambiguous' });
  }
}

/** Kinds a bounded-backoff loop is allowed to repeat. Auth and 4xx are not. */
export function isRetryableKind(kind: ZoomErrorKind): boolean {
  return kind === 'rate_limit' || kind === 'retryable';
}

export function isZoomError(error: unknown): error is ZoomError {
  return error instanceof ZoomError;
}

/**
 * `Retry-After` is either delta-seconds or an HTTP-date (RFC 9110). Zoom sends
 * seconds, but parsing both costs three lines and removes a failure mode.
 *
 * This lives in the leaf module for the same reason the error classes do: BOTH
 * `client.ts` (API 429s) and `token.ts` (OAuth 429s) have to populate
 * `retryAfterSeconds`, and `token.ts` importing `client.ts` would close the
 * token → client → token cycle. `client.ts` re-exports it with the rest of this
 * file, so its public surface is unchanged.
 */
export function parseRetryAfter(header: string | null, nowMs: number): number | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const asDate = Date.parse(trimmed);
  if (!Number.isFinite(asDate)) return undefined;
  return Math.max(0, Math.ceil((asDate - nowMs) / 1000));
}
