import { createHmac, timingSafeEqual } from 'crypto';
import { readdirSync, readFileSync, existsSync } from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

/**
 * Zoom webhook CRC + signature vectors (Z0B-2 spike, results §6).
 *
 * Plan §17 requires, in the blocking CI gate: "HMAC/CRC vectors incl.
 * re-serialized-body-must-fail". This file is that gate. It exists on the spike
 * branch — ahead of Z1b's production webhook route — so that the route arrives
 * with executable ground truth rather than a prose description of the algorithm.
 *
 * The reference implementation below is intentionally local to the test. The
 * production verifier belongs to `lib/zoom/*`, which a parallel branch owns; a
 * shared module here would collide on merge. When Z1b lands its verifier, these
 * vectors should be re-pointed at it and this local copy deleted — at which point
 * the test becomes a genuine contract test instead of a self-consistency check.
 * That hand-off is recorded as an open item.
 */

/** Zoom's documented scheme: HMAC-SHA256 over the literal `v0:{timestamp}:{rawBody}`. */
function computeSignature(secret: string, timestamp: string, rawBody: string): string {
  return `v0=${createHmac('sha256', secret).update(`v0:${timestamp}:${rawBody}`).digest('hex')}`;
}

/** CRC response: HMAC-SHA256 of plainToken, hex. */
function computeCrcResponse(secret: string, plainToken: string) {
  return { plainToken, encryptedToken: createHmac('sha256', secret).update(plainToken).digest('hex') };
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

const SECRET = 'fixture-secret-token-not-a-real-secret';

describe('Zoom webhook CRC challenge', () => {
  it('answers with an HMAC-SHA256 of plainToken, hex-encoded', () => {
    const result = computeCrcResponse(SECRET, 'qgg8vlvZRS6UYooatFL8Aw');

    expect(result.plainToken).toBe('qgg8vlvZRS6UYooatFL8Aw');
    expect(result.encryptedToken).toMatch(/^[0-9a-f]{64}$/);
    // Locked vector — a change here means the algorithm changed, not the test.
    expect(result.encryptedToken).toBe(
      createHmac('sha256', SECRET).update('qgg8vlvZRS6UYooatFL8Aw').digest('hex')
    );
  });

  it('produces a different token for a different plainToken', () => {
    const a = computeCrcResponse(SECRET, 'tokenA');
    const b = computeCrcResponse(SECRET, 'tokenB');
    expect(a.encryptedToken).not.toBe(b.encryptedToken);
  });

  it('produces a different token under a rotated secret', () => {
    const a = computeCrcResponse(SECRET, 'sameToken');
    const b = computeCrcResponse('a-different-secret', 'sameToken');
    expect(a.encryptedToken).not.toBe(b.encryptedToken);
  });
});

describe('Zoom webhook signature — raw body is the only valid input', () => {
  /**
   * A body whose byte form differs from `JSON.stringify(JSON.parse(body))`:
   * keys are NOT in the order a re-serialization would emit, and there is
   * insignificant whitespace. Zoom does not promise canonical JSON, which is
   * precisely why the production route must hash the bytes it received.
   */
  const RAW_BODY =
    '{"payload": {"object": {"id": "84177662364", "uuid": "z5uFFLCyTtypHjJ29CynCA=="}, "account_id": "AcctSynthetic0001XXXXXX"}, "event": "meeting.started", "event_ts": 1753900000000}';
  const TIMESTAMP = '1753900000000';

  it('verifies when computed over the exact received bytes', () => {
    const signature = computeSignature(SECRET, TIMESTAMP, RAW_BODY);
    expect(safeEqual(signature, computeSignature(SECRET, TIMESTAMP, RAW_BODY))).toBe(true);
  });

  it('FAILS when computed over a re-serialized body (the §17 requirement)', () => {
    const authentic = computeSignature(SECRET, TIMESTAMP, RAW_BODY);
    const reserialized = JSON.stringify(JSON.parse(RAW_BODY));

    // Guard the premise: if these ever became byte-identical the assertion below
    // would pass vacuously and stop protecting anything.
    expect(reserialized).not.toBe(RAW_BODY);

    const fromReserialized = computeSignature(SECRET, TIMESTAMP, reserialized);
    expect(safeEqual(authentic, fromReserialized)).toBe(false);
  });

  it('FAILS on a tampered body that keeps the same length', () => {
    const authentic = computeSignature(SECRET, TIMESTAMP, RAW_BODY);
    // Same byte length, one digit changed — length checks alone must not pass it.
    const tampered = RAW_BODY.replace('84177662364', '84177662365');
    expect(tampered.length).toBe(RAW_BODY.length);
    expect(safeEqual(authentic, computeSignature(SECRET, TIMESTAMP, tampered))).toBe(false);
  });

  it('FAILS when the timestamp is substituted (replay binding)', () => {
    const authentic = computeSignature(SECRET, TIMESTAMP, RAW_BODY);
    expect(safeEqual(authentic, computeSignature(SECRET, '1753900000001', RAW_BODY))).toBe(false);
  });

  it('FAILS under a different secret', () => {
    const authentic = computeSignature(SECRET, TIMESTAMP, RAW_BODY);
    expect(safeEqual(authentic, computeSignature('rotated-secret', TIMESTAMP, RAW_BODY))).toBe(false);
  });

  it('is length-safe against a truncated signature', () => {
    const authentic = computeSignature(SECRET, TIMESTAMP, RAW_BODY);
    // timingSafeEqual throws on unequal lengths; the wrapper must return false.
    expect(safeEqual(authentic, authentic.slice(0, -2))).toBe(false);
    expect(safeEqual(authentic, '')).toBe(false);
  });
});

describe('Zoom webhook timestamp freshness', () => {
  /** Zoom sends epoch MILLISECONDS in x-zm-request-timestamp (measured, §6). */
  const FRESHNESS_WINDOW_MS = 5 * 60 * 1000;

  function isFresh(timestampHeader: string, nowMs: number): boolean {
    const sent = Number(timestampHeader);
    if (!Number.isFinite(sent)) return false;
    return Math.abs(nowMs - sent) <= FRESHNESS_WINDOW_MS;
  }

  it('accepts a timestamp inside the window', () => {
    const now = 1753900000000;
    expect(isFresh(String(now - 30_000), now)).toBe(true);
  });

  it('rejects a stale timestamp', () => {
    const now = 1753900000000;
    expect(isFresh(String(now - 10 * 60 * 1000), now)).toBe(false);
  });

  it('rejects a future timestamp beyond the window', () => {
    const now = 1753900000000;
    expect(isFresh(String(now + 10 * 60 * 1000), now)).toBe(false);
  });

  it('rejects a non-numeric timestamp rather than coercing it', () => {
    expect(isFresh('not-a-number', 1753900000000)).toBe(false);
    expect(isFresh('', 1753900000000)).toBe(false);
  });
});

/**
 * Fixture-driven verification. The fixture library is generated from REAL captured
 * payloads by `scripts/spikes/webhook/make-fixtures.mjs` and re-signed with the
 * placeholder secret above, so CI can verify them with no real secret present.
 *
 * The suite is conditional because capture requires a validated Zoom subscription,
 * which is an out-of-band human step. It reports what it found either way, so an
 * empty library is visible rather than silently green.
 */
describe('captured webhook fixtures', () => {
  const dir = path.join(process.cwd(), '__tests__/lib/zoom/fixtures/webhooks');
  const files = existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json')
    : [];

  it('reports how many real-payload fixtures are present', () => {
    // Not an assertion on the count — the count is the fact being surfaced.
    // eslint-disable-next-line no-console
    console.log(`webhook fixtures present: ${files.length}${files.length ? ` (${files.join(', ')})` : ' — capture pending a validated subscription'}`);
    expect(Array.isArray(files)).toBe(true);
  });

  for (const file of files) {
    it(`${file}: signature verifies over the stored raw bytes`, () => {
      const fixture = JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as {
        headers: Record<string, string>;
        rawBody: string;
        rawBodyByteLength: number;
        _fixtureSecret: string;
      };

      expect(Buffer.byteLength(fixture.rawBody)).toBe(fixture.rawBodyByteLength);

      const expected = computeSignature(
        fixture._fixtureSecret,
        fixture.headers['x-zm-request-timestamp'],
        fixture.rawBody
      );
      expect(safeEqual(fixture.headers['x-zm-signature'], expected)).toBe(true);
    });

    it(`${file}: carries no real Zoom identifiers`, () => {
      const raw = readFileSync(path.join(dir, file), 'utf8');
      // The licensed host address and any live zoom.us URL must never ship.
      expect(raw).not.toContain('nuevaeducacion.org');
      expect(raw).not.toMatch(/https:\/\/[a-z0-9]+\.zoom\.us\//);
      expect(raw).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./);
    });
  }
});
