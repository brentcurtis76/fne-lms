/**
 * Zoom webhook verification primitives (plan §4: "webhook verifier (HMAC over raw
 * body + timestamp freshness + CRC responder)").
 *
 * The route that consumes these is Z1b-3's. This module is only the cryptography and
 * the three rules the Z0B-2 spike measured against live traffic, each of which is a
 * trap that a reasonable implementation walks straight into.
 *
 * ## 1. The raw body, not a re-serialization
 *
 * The signed string is `v0:{x-zm-request-timestamp}:{raw body}` and the raw body
 * means the bytes that arrived. Zoom promises nothing about JSON formatting, so
 * `JSON.stringify(JSON.parse(body))` is not the same input even when it happens to
 * be byte-identical — and results §6.1 records that for **every** real payload the
 * spike captured, it *was* byte-identical. A verifier that re-serialized would
 * therefore have passed every live test and still been wrong. Only a constructed
 * vector catches it, which is why the committed 41-vector suite runs against this
 * file. Callers must read the body with the framework's body parser DISABLED.
 *
 * ## 2. The dedupe key is `sha256(raw body)` and nothing else
 *
 * Measured (results §6.1.1): across a retry, `x-zm-request-id` and the raw body are
 * **identical**, while `x-zm-request-timestamp` and `x-zm-signature` both **differ**
 * — Zoom re-signs rather than replaying the original header. So a dedupe key that
 * folded in the timestamp or the signature (for example, hashing the whole signed
 * string) would fail to collide and would **double-process every retried event**.
 * `webhookDedupeKey()` takes the body alone. Do not "improve" it.
 *
 * ## 3. The header is SECONDS; `event_ts` in the body is MILLISECONDS
 *
 * One request carries both units (results §6.1). `x-zm-request-timestamp` is 10
 * digits; `payload.object`-adjacent `event_ts` is 13. Reading the header as
 * milliseconds makes every request look ~56 years stale. `WEBHOOK_EVENT_TS_UNIT`
 * and `WEBHOOK_REQUEST_TIMESTAMP_UNIT` exist so the asymmetry is stated in code.
 *
 * ## Freshness window — 600 s, absolute, and here is why
 *
 * **Evidence** (results §6.1 and §6.1.1, both from the validated live subscription):
 *
 *  - Ordinary skew is **sub-second to ~1 s** across 8 captured deliveries.
 *  - `meeting.ended` arrived with skew **−15 ms** — Zoom's clock marginally AHEAD of
 *    ours. The comparison must therefore be **absolute**, not "how old is this".
 *  - Two deliberately-500'd deliveries were retried, both at **304 s ≈ 5.1 min**, and
 *    the retry table records that the retry carries a **fresh** timestamp and a
 *    **re-computed** signature.
 *
 * Because Zoom re-signs, a retry's own skew is sub-second and *any* window accepts
 * it. That makes the window look free to set arbitrarily tight — and results §6.1.1
 * says so explicitly: the desired behaviour "holds only because of the re-signing,
 * not because the window is generous."
 *
 * 600 s is chosen so the rule survives that assumption being wrong. The single
 * observed retry interval is 304 s. A 300 s window sits **four seconds** below it,
 * so if Zoom ever replayed the original header instead of re-signing, every
 * first-retry would be rejected — and §18 records that six consecutive failures
 * disable the subscription. 600 s clears the only retry interval anyone has actually
 * measured, under either behaviour.
 *
 * The cost of widening is close to zero: freshness is **not** the replay control
 * here. `zoom_webhook_events.dedupe_key` UNIQUE is, and it absorbs a replayed body
 * whether it arrives after 1 second or 10 minutes. Freshness only bounds how long a
 * captured request stays presentable, and a captured request is one Zoom already
 * delivered and the ledger already holds.
 *
 * The window is symmetric because the evidence demands an absolute comparison. A
 * tighter future-side bound would be defensible on its own, but a future-dated
 * request still has to carry a signature only Zoom can produce, so the extra knob
 * buys little and would fork the committed vectors' single-window contract.
 */
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { ZoomConfigError } from './errors';

/** `x-zm-request-timestamp` — epoch SECONDS (10 digits). MEASURED, not assumed. */
export const WEBHOOK_REQUEST_TIMESTAMP_UNIT = 'seconds' as const;

/** Body `event_ts` — epoch MILLISECONDS (13 digits). The other half of the trap. */
export const WEBHOOK_EVENT_TS_UNIT = 'milliseconds' as const;

/** See the module header for the derivation. Absolute, symmetric, in seconds. */
export const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 600;

/** The event Zoom sends to validate (and re-validate, every 72 h) an endpoint. */
export const WEBHOOK_URL_VALIDATION_EVENT = 'endpoint.url_validation';

export type WebhookRejectionReason =
  | 'missing_signature'
  | 'missing_timestamp'
  | 'malformed_timestamp'
  | 'stale_timestamp'
  | 'signature_mismatch';

export type WebhookVerification =
  | {
      ok: true;
      /** `sha256(raw body)` — the idempotency key. Body only. See the header. */
      dedupeKey: string;
      /** The header value, parsed as epoch seconds. */
      timestampSeconds: number;
    }
  | { ok: false; reason: WebhookRejectionReason };

export interface WebhookVerificationInput {
  secret: string;
  /**
   * The bytes as received. A `Buffer` is preferred; a `string` is accepted because
   * Zoom sends UTF-8 JSON, for which the round trip is lossless.
   */
  rawBody: string | Buffer;
  signatureHeader: string | string[] | undefined | null;
  timestampHeader: string | string[] | undefined | null;
  nowMs?: number;
  /** Defaults to `WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS`. */
  toleranceSeconds?: number;
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function toBuffer(rawBody: string | Buffer): Buffer {
  return Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
}

/** Node lower-cases incoming header names but can hand back an array. */
function singleHeader(value: string | string[] | undefined | null): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

/**
 * Length-checked constant-time compare. `timingSafeEqual` THROWS on unequal
 * lengths, so a truncated signature would crash the route rather than being
 * rejected — the trap the committed vectors call "the timingSafeEqual length trap".
 */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * `v0=` + HMAC-SHA256 over the literal `v0:{timestamp}:{rawBody}`, hex.
 * Built as bytes so a `Buffer` body is signed over its actual bytes.
 */
export function computeWebhookSignature(
  secret: string,
  timestampHeader: string,
  rawBody: string | Buffer
): string {
  const signed = Buffer.concat([Buffer.from(`v0:${timestampHeader}:`, 'utf8'), toBuffer(rawBody)]);
  return `v0=${createHmac('sha256', secret).update(signed).digest('hex')}`;
}

/** CRC challenge response: `encryptedToken = HMAC-SHA256(plainToken, secret)`, hex. */
export function computeWebhookCrcResponse(
  secret: string,
  plainToken: string
): { plainToken: string; encryptedToken: string } {
  return {
    plainToken,
    encryptedToken: createHmac('sha256', secret).update(plainToken).digest('hex'),
  };
}

/**
 * The idempotency key: `sha256(raw body)`, hex. **Body alone.** Folding in the
 * timestamp or the signature double-processes every Zoom retry — see the header.
 */
export function webhookDedupeKey(rawBody: string | Buffer): string {
  return createHash('sha256').update(toBuffer(rawBody)).digest('hex');
}

/**
 * Parses `x-zm-request-timestamp` as epoch seconds. Strict digits: `Number('')` is
 * `0`, which is finite, so a permissive parse would let an empty header through the
 * type check and rely on the window to catch it.
 */
export function parseWebhookTimestampSeconds(header: string | undefined | null): number | null {
  if (typeof header !== 'string' || !/^\d+$/.test(header.trim())) return null;
  const seconds = Number(header.trim());
  return Number.isSafeInteger(seconds) ? seconds : null;
}

/**
 * Absolute freshness. Absolute because Zoom's clock was measured marginally AHEAD
 * of ours (−15 ms skew on `meeting.ended`), so a one-sided "how old" comparison
 * would reject a perfectly good delivery.
 */
export function isWebhookTimestampFresh(
  header: string | undefined | null,
  nowMs: number,
  toleranceSeconds: number = WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS
): boolean {
  const sentSeconds = parseWebhookTimestampSeconds(header);
  if (sentSeconds === null) return false;
  const nowSeconds = Math.floor(nowMs / 1000);
  return Math.abs(nowSeconds - sentSeconds) <= toleranceSeconds;
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/**
 * Full verification: headers present → timestamp parseable → timestamp fresh →
 * signature matches the raw bytes.
 *
 * Freshness is checked BEFORE the MAC on purpose. Both are cheap, but a stale
 * request is rejected for the reason it is actually stale, which is what makes the
 * "webhook signature failures" monitor in §18 mean "possible secret rotation"
 * rather than "somebody replayed something".
 */
export function verifyZoomWebhook(input: WebhookVerificationInput): WebhookVerification {
  const signatureHeader = singleHeader(input.signatureHeader);
  const timestampHeader = singleHeader(input.timestampHeader);

  if (!signatureHeader) return { ok: false, reason: 'missing_signature' };
  if (!timestampHeader) return { ok: false, reason: 'missing_timestamp' };

  const timestampSeconds = parseWebhookTimestampSeconds(timestampHeader);
  if (timestampSeconds === null) return { ok: false, reason: 'malformed_timestamp' };

  const nowMs = input.nowMs ?? Date.now();
  const tolerance = input.toleranceSeconds ?? WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS;
  if (!isWebhookTimestampFresh(timestampHeader, nowMs, tolerance)) {
    return { ok: false, reason: 'stale_timestamp' };
  }

  // The header is signed verbatim, so the MAC is computed over the string Zoom sent
  // and not over the parsed number — leading zeros or spacing would change the MAC.
  const expected = computeWebhookSignature(input.secret, timestampHeader, input.rawBody);
  if (!safeCompare(signatureHeader, expected)) {
    return { ok: false, reason: 'signature_mismatch' };
  }

  return { ok: true, dedupeKey: webhookDedupeKey(input.rawBody), timestampSeconds };
}

/** §14 secret, server-only. Never `NEXT_PUBLIC_*`. */
export function readWebhookSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.ZOOM_WEBHOOK_SECRET_TOKEN;
  if (!secret) {
    throw new ZoomConfigError('Zoom webhook secret missing: ZOOM_WEBHOOK_SECRET_TOKEN is not set.');
  }
  return secret;
}
