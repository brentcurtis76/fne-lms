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
  cause?: unknown;
}

export class ZoomError extends Error {
  readonly kind: ZoomErrorKind;
  readonly status?: number;
  readonly zoomCode?: number;
  readonly requestId?: string;
  readonly operation?: string;
  readonly retryAfterSeconds?: number;

  constructor(kind: ZoomErrorKind, message: string, context: ZoomErrorContext = {}) {
    super(message, context.cause === undefined ? undefined : { cause: context.cause });
    this.name = new.target.name;
    this.kind = kind;
    this.status = context.status;
    this.zoomCode = context.zoomCode;
    this.requestId = context.requestId;
    this.operation = context.operation;
    this.retryAfterSeconds = context.retryAfterSeconds;
  }
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

/** Kinds a bounded-backoff loop is allowed to repeat. Auth and 4xx are not. */
export function isRetryableKind(kind: ZoomErrorKind): boolean {
  return kind === 'rate_limit' || kind === 'retryable';
}

export function isZoomError(error: unknown): error is ZoomError {
  return error instanceof ZoomError;
}
