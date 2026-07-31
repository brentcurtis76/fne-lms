// @vitest-environment node
/**
 * Production webhook verifier (plan §17 blocking gate: "HMAC/CRC vectors").
 *
 * The committed 41-vector suite in `webhook-signature-vectors.test.ts` already runs
 * its bodies, tampering cases and 7-fixture library through this module. This file
 * covers what that suite does not: the full `verifyZoomWebhook` decision path, the
 * PRODUCTION freshness default (600 s, versus the 300 s that suite pins), the
 * measured 304 s retry interval, and fail-on-old proofs for the two rules that would
 * be invisible if broken.
 */
import { createHash, createHmac } from 'crypto';
import { describe, it, expect } from 'vitest';
import {
  computeWebhookCrcResponse,
  computeWebhookSignature,
  isWebhookTimestampFresh,
  parseWebhookTimestampSeconds,
  readWebhookSecret,
  safeCompare,
  verifyZoomWebhook,
  webhookDedupeKey,
  WEBHOOK_EVENT_TS_UNIT,
  WEBHOOK_REQUEST_TIMESTAMP_UNIT,
  WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS,
  WEBHOOK_URL_VALIDATION_EVENT,
} from '../../../lib/zoom/verifier';
import { ZoomConfigError } from '../../../lib/zoom/errors';

const SECRET = 'fixture-secret-token-not-a-real-secret';

/** A real captured header value and its arrival instant (results §6.1). */
const REAL_HEADER = '1785368934';
const REAL_ARRIVAL_MS = 1785368935026;

/** Non-canonical on purpose: key order and spacing a re-serialization would change. */
const RAW_BODY =
  '{"payload": {"object": {"id": "84177662364", "uuid": "Fk+SyntheticUuid/0001=="}, "account_id": "AcctSynthetic0001XXXXXX"}, "event": "meeting.started", "event_ts": 1785368934817}';

function signedRequest(overrides: Partial<Parameters<typeof verifyZoomWebhook>[0]> = {}) {
  const timestampHeader = overrides.timestampHeader ?? REAL_HEADER;
  const rawBody = overrides.rawBody ?? RAW_BODY;
  return {
    secret: SECRET,
    rawBody,
    timestampHeader,
    signatureHeader: computeWebhookSignature(SECRET, String(timestampHeader), rawBody),
    nowMs: REAL_ARRIVAL_MS,
    ...overrides,
  };
}

describe('verifyZoomWebhook — accept path', () => {
  it('accepts a well-formed delivery and returns the dedupe key', () => {
    const result = verifyZoomWebhook(signedRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.timestampSeconds).toBe(Number(REAL_HEADER));
    expect(result.dedupeKey).toBe(createHash('sha256').update(RAW_BODY).digest('hex'));
  });

  it('verifies a Buffer body over its actual bytes', () => {
    // The route must read the raw bytes with the body parser disabled; a Buffer is
    // what it will actually hold.
    const buffer = Buffer.from(RAW_BODY, 'utf8');
    const result = verifyZoomWebhook({
      secret: SECRET,
      rawBody: buffer,
      timestampHeader: REAL_HEADER,
      signatureHeader: computeWebhookSignature(SECRET, REAL_HEADER, buffer),
      nowMs: REAL_ARRIVAL_MS,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.dedupeKey).toBe(webhookDedupeKey(RAW_BODY));
  });

  it('tolerates a header arriving as an array, as Node can hand it back', () => {
    const result = verifyZoomWebhook(
      signedRequest({
        timestampHeader: [REAL_HEADER],
        signatureHeader: [computeWebhookSignature(SECRET, REAL_HEADER, RAW_BODY)],
      })
    );
    expect(result.ok).toBe(true);
  });
});

describe('verifyZoomWebhook — rejection reasons are distinguishable', () => {
  it.each([
    ['missing_signature', { signatureHeader: undefined }],
    ['missing_timestamp', { timestampHeader: undefined }],
  ])('reports %s', (reason, overrides) => {
    const result = verifyZoomWebhook(signedRequest(overrides));
    expect(result).toEqual({ ok: false, reason });
  });

  it('reports malformed_timestamp rather than falling through to the window', () => {
    // Distinguishing these matters: §18 monitors signature failures as "possible
    // secret rotation", and a malformed header is not that.
    for (const header of ['not-a-number', '  ', '17853689.34', '-1785368934', '1785368934abc']) {
      const result = verifyZoomWebhook(signedRequest({ timestampHeader: header }));
      expect(result).toEqual({ ok: false, reason: 'malformed_timestamp' });
    }
  });

  it('treats an empty header as missing, not malformed — it carries no value at all', () => {
    expect(verifyZoomWebhook(signedRequest({ timestampHeader: '' }))).toEqual({
      ok: false,
      reason: 'missing_timestamp',
    });
    expect(verifyZoomWebhook(signedRequest({ signatureHeader: '' }))).toEqual({
      ok: false,
      reason: 'missing_signature',
    });
  });

  it('reports stale_timestamp before spending a MAC on it', () => {
    const result = verifyZoomWebhook(
      signedRequest({ nowMs: REAL_ARRIVAL_MS + (WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS + 60) * 1000 })
    );
    expect(result).toEqual({ ok: false, reason: 'stale_timestamp' });
  });

  it('reports signature_mismatch for a tampered body', () => {
    const authentic = computeWebhookSignature(SECRET, REAL_HEADER, RAW_BODY);
    const result = verifyZoomWebhook({
      secret: SECRET,
      rawBody: RAW_BODY.replace('84177662364', '84177662365'),
      timestampHeader: REAL_HEADER,
      signatureHeader: authentic,
      nowMs: REAL_ARRIVAL_MS,
    });
    expect(result).toEqual({ ok: false, reason: 'signature_mismatch' });
  });

  it('reports signature_mismatch under a rotated secret', () => {
    const result = verifyZoomWebhook(signedRequest({ secret: 'a-rotated-secret' }));
    expect(result).toEqual({ ok: false, reason: 'signature_mismatch' });
  });

  it('does not throw on a truncated signature — the timingSafeEqual length trap', () => {
    const authentic = computeWebhookSignature(SECRET, REAL_HEADER, RAW_BODY);
    for (const bad of [authentic.slice(0, -2), '', 'v0=', authentic + 'ff']) {
      expect(() => verifyZoomWebhook(signedRequest({ signatureHeader: bad || undefined }))).not.toThrow();
    }
  });

  it('signs the timestamp header VERBATIM, not the parsed number', () => {
    // A leading zero parses to the same number but is different bytes, so the MAC
    // must be computed over the string Zoom actually sent.
    const padded = `0${REAL_HEADER}`;
    expect(parseWebhookTimestampSeconds(padded)).toBe(Number(REAL_HEADER));
    expect(computeWebhookSignature(SECRET, padded, RAW_BODY)).not.toBe(
      computeWebhookSignature(SECRET, REAL_HEADER, RAW_BODY)
    );
  });
});

describe('freshness window — the production default is 600 s', () => {
  const nowMs = REAL_ARRIVAL_MS;
  const nowSeconds = Math.floor(nowMs / 1000);
  const at = (offsetSeconds: number) => String(nowSeconds + offsetSeconds);

  it('is 600 seconds', () => {
    expect(WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS).toBe(600);
  });

  it('accepts the single retry interval anyone has actually measured (304 s)', () => {
    // Results §6.1.1: both deliberately-500'd deliveries were retried at 304 s.
    // Zoom RE-SIGNS, so a real retry presents a fresh timestamp and this is not the
    // case that exercises the window — it is the case that would break if Zoom ever
    // replayed the original header instead. 600 s clears it either way.
    expect(isWebhookTimestampFresh(at(-304), nowMs)).toBe(true);
    expect(isWebhookTimestampFresh(at(304), nowMs)).toBe(true);
  });

  it('a 300 s window would sit FOUR SECONDS below that retry — the reason for 600', () => {
    // Fail-on-old proof for the widening. If this ever starts passing, the evidence
    // the choice rests on has changed and the header comment needs revisiting.
    expect(isWebhookTimestampFresh(at(-304), nowMs, 300)).toBe(false);
    expect(isWebhookTimestampFresh(at(-304), nowMs, 600)).toBe(true);
  });

  it('accepts a retry carrying its own fresh timestamp — the observed behaviour', () => {
    // Results §6.1.1: across a retry the timestamp DIFFERS (re-signed), so the skew
    // the window sees is sub-second even 5 minutes after the original delivery.
    const retryArrivalMs = nowMs + 304_000;
    const retryHeader = String(Math.floor(retryArrivalMs / 1000));
    expect(isWebhookTimestampFresh(retryHeader, retryArrivalMs)).toBe(true);
  });

  it('accepts at exactly the boundary and rejects one second past it', () => {
    expect(isWebhookTimestampFresh(at(-600), nowMs)).toBe(true);
    expect(isWebhookTimestampFresh(at(-601), nowMs)).toBe(false);
    expect(isWebhookTimestampFresh(at(600), nowMs)).toBe(true);
    expect(isWebhookTimestampFresh(at(601), nowMs)).toBe(false);
  });

  it('is absolute, because Zoom’s clock was measured AHEAD of ours', () => {
    // meeting.ended arrived with −15 ms skew (results §6.1). A one-sided "how old is
    // this" comparison would have rejected a perfectly good delivery.
    const aheadMs = nowMs - 15;
    expect(isWebhookTimestampFresh(String(nowSeconds), aheadMs)).toBe(true);
  });

  it('accepts the real captured delivery at its real arrival instant', () => {
    expect(isWebhookTimestampFresh(REAL_HEADER, REAL_ARRIVAL_MS)).toBe(true);
  });

  it('rejects a non-numeric or empty header rather than coercing it', () => {
    // Number('') is 0, which is finite — a permissive parse would rely on the window.
    expect(isWebhookTimestampFresh('', nowMs)).toBe(false);
    expect(isWebhookTimestampFresh('not-a-number', nowMs)).toBe(false);
    expect(isWebhookTimestampFresh(undefined, nowMs)).toBe(false);
    expect(isWebhookTimestampFresh(null, nowMs)).toBe(false);
  });
});

describe('the units trap — one request carries both', () => {
  it('declares the header as seconds and event_ts as milliseconds', () => {
    expect(WEBHOOK_REQUEST_TIMESTAMP_UNIT).toBe('seconds');
    expect(WEBHOOK_EVENT_TS_UNIT).toBe('milliseconds');
  });

  it('a millisecond reading of the header is ~56 years off and gets rejected', () => {
    const bodyEventTs = 1785368934817; // 13 digits, from the same real payload
    expect(String(bodyEventTs)).toHaveLength(13);
    expect(REAL_HEADER).toHaveLength(10);

    // Feeding the body's millisecond value in as the header must not verify fresh.
    expect(isWebhookTimestampFresh(String(bodyEventTs), REAL_ARRIVAL_MS)).toBe(false);
    // …and the two really do describe the same instant, one second apart at most.
    expect(Math.abs(Math.floor(bodyEventTs / 1000) - Number(REAL_HEADER))).toBeLessThanOrEqual(1);
  });
});

describe('webhookDedupeKey — body alone, and why', () => {
  const RETRY_TIMESTAMP = '1785369990';
  const ORIGINAL_TIMESTAMP = '1785369686';

  it('is sha256 of the raw body', () => {
    expect(webhookDedupeKey(RAW_BODY)).toBe(createHash('sha256').update(RAW_BODY).digest('hex'));
  });

  it('collides across a retry, which is the entire point', () => {
    // Measured (results §6.1.1): the body is byte-identical across a retry while the
    // timestamp and signature both change.
    expect(webhookDedupeKey(RAW_BODY)).toBe(webhookDedupeKey(RAW_BODY));
  });

  it('FAIL-ON-OLD: folding the timestamp in would double-process every retry', () => {
    // The defect this rule exists to prevent, demonstrated rather than described.
    const foldedOriginal = createHash('sha256').update(`v0:${ORIGINAL_TIMESTAMP}:${RAW_BODY}`).digest('hex');
    const foldedRetry = createHash('sha256').update(`v0:${RETRY_TIMESTAMP}:${RAW_BODY}`).digest('hex');

    expect(foldedOriginal).not.toBe(foldedRetry); // would NOT dedupe → double-processed
    expect(webhookDedupeKey(RAW_BODY)).toBe(webhookDedupeKey(RAW_BODY)); // body-only DOES
  });

  it('FAIL-ON-OLD: folding the signature in would do the same', () => {
    const sigOriginal = computeWebhookSignature(SECRET, ORIGINAL_TIMESTAMP, RAW_BODY);
    const sigRetry = computeWebhookSignature(SECRET, RETRY_TIMESTAMP, RAW_BODY);
    expect(sigOriginal).not.toBe(sigRetry);

    const folded = (sig: string) => createHash('sha256').update(`${sig}:${RAW_BODY}`).digest('hex');
    expect(folded(sigOriginal)).not.toBe(folded(sigRetry));
  });

  it('still distinguishes two genuinely different events', () => {
    // The 4 ms apart / different bodies case the spike initially misread as a retry.
    const other = RAW_BODY.replace('meeting.started', 'meeting.ended');
    expect(webhookDedupeKey(RAW_BODY)).not.toBe(webhookDedupeKey(other));
  });

  it('hashes bytes, so a Buffer and its string form agree', () => {
    expect(webhookDedupeKey(Buffer.from(RAW_BODY, 'utf8'))).toBe(webhookDedupeKey(RAW_BODY));
  });
});

describe('CRC responder', () => {
  it('answers HMAC-SHA256(plainToken, secret) in hex', () => {
    const result = computeWebhookCrcResponse(SECRET, 'qgg8vlvZRS6UYooatFL8Aw');
    expect(result.plainToken).toBe('qgg8vlvZRS6UYooatFL8Aw');
    expect(result.encryptedToken).toMatch(/^[0-9a-f]{64}$/);
    expect(result.encryptedToken).toBe(
      createHmac('sha256', SECRET).update('qgg8vlvZRS6UYooatFL8Aw').digest('hex')
    );
  });

  it('names the validation event Zoom re-sends every 72 h', () => {
    expect(WEBHOOK_URL_VALIDATION_EVENT).toBe('endpoint.url_validation');
  });
});

describe('safeCompare', () => {
  it('is true only for identical strings', () => {
    expect(safeCompare('abc', 'abc')).toBe(true);
    expect(safeCompare('abc', 'abd')).toBe(false);
  });

  it('returns false rather than throwing on a length mismatch', () => {
    expect(() => safeCompare('abc', 'ab')).not.toThrow();
    expect(safeCompare('abc', 'ab')).toBe(false);
    expect(safeCompare('', 'a')).toBe(false);
  });
});

describe('readWebhookSecret', () => {
  it('reads ZOOM_WEBHOOK_SECRET_TOKEN', () => {
    expect(readWebhookSecret({ ZOOM_WEBHOOK_SECRET_TOKEN: 'value' } as unknown as NodeJS.ProcessEnv)).toBe('value');
  });

  it('throws a config error naming the variable, never a value', () => {
    expect(() => readWebhookSecret({} as NodeJS.ProcessEnv)).toThrow(ZoomConfigError);
    expect(() => readWebhookSecret({} as NodeJS.ProcessEnv)).toThrow('ZOOM_WEBHOOK_SECRET_TOKEN');
  });

  it('rejects an empty value as absent', () => {
    expect(() => readWebhookSecret({ ZOOM_WEBHOOK_SECRET_TOKEN: '' } as unknown as NodeJS.ProcessEnv)).toThrow(
      ZoomConfigError
    );
  });
});
