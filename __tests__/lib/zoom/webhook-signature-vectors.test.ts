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
  /**
   * `x-zm-request-timestamp` is epoch **SECONDS** (10 digits). MEASURED against
   * real deliveries from a validated subscription — 8 requests across
   * `endpoint.url_validation`, `meeting.started`, `meeting.participant_joined`,
   * `recording.started` and `recording.stopped`, all 10-digit, all with sub-second
   * to ~1 s real skew (results §6.1).
   *
   * This spike initially assumed milliseconds and was wrong. The trap is a genuine
   * unit asymmetry in Zoom's own payloads: `event_ts` INSIDE the body is epoch
   * MILLISECONDS (13 digits), so a single request carries both units. Treating the
   * header as milliseconds makes every request look ~56 years stale, which a
   * naive freshness check would either reject outright or, if the comparison is
   * signed and unguarded, silently accept. Both cases are locked below.
   */
  const FRESHNESS_WINDOW_SECONDS = 5 * 60;

  /** Takes the header verbatim, as a production verifier would receive it. */
  function isFresh(timestampHeader: string, nowMs: number): boolean {
    const sentSeconds = Number(timestampHeader);
    if (!Number.isFinite(sentSeconds)) return false;
    const nowSeconds = Math.floor(nowMs / 1000);
    return Math.abs(nowSeconds - sentSeconds) <= FRESHNESS_WINDOW_SECONDS;
  }

  /** A real captured header value and its arrival instant (results §6.1). */
  const REAL_HEADER = '1785368934';
  const REAL_ARRIVAL_MS = 1785368935026;

  it('the header is epoch SECONDS — 10 digits, not 13', () => {
    expect(REAL_HEADER).toHaveLength(10);
    expect(Number(REAL_HEADER) * 1000).toBeLessThan(REAL_ARRIVAL_MS + 60_000);
  });

  it('accepts a real captured delivery (observed skew ~1 s)', () => {
    expect(isFresh(REAL_HEADER, REAL_ARRIVAL_MS)).toBe(true);
    expect(REAL_ARRIVAL_MS - Number(REAL_HEADER) * 1000).toBeLessThan(5_000);
  });

  it('a millisecond interpretation of the header would be ~56 years off', () => {
    // Guards the mistake itself, so nobody reintroduces it.
    const wrongSkewMs = REAL_ARRIVAL_MS - Number(REAL_HEADER);
    expect(wrongSkewMs / 1000 / 60 / 60 / 24 / 365).toBeGreaterThan(50);
  });

  it('body event_ts is MILLISECONDS while the header is SECONDS', () => {
    // The asymmetry that caused the original error. Both from the same real payload.
    const bodyEventTs = 1785368934817;
    expect(String(bodyEventTs)).toHaveLength(13);
    expect(String(REAL_HEADER)).toHaveLength(10);
    expect(Math.abs(Math.floor(bodyEventTs / 1000) - Number(REAL_HEADER))).toBeLessThanOrEqual(1);
  });

  it('accepts a timestamp inside the window', () => {
    const nowMs = 1785368935026;
    expect(isFresh(String(Math.floor(nowMs / 1000) - 30), nowMs)).toBe(true);
  });

  it('rejects a stale timestamp', () => {
    const nowMs = 1785368935026;
    expect(isFresh(String(Math.floor(nowMs / 1000) - 10 * 60), nowMs)).toBe(false);
  });

  it('rejects a future timestamp beyond the window', () => {
    const nowMs = 1785368935026;
    expect(isFresh(String(Math.floor(nowMs / 1000) + 10 * 60), nowMs)).toBe(false);
  });

  it('rejects a non-numeric timestamp rather than coercing it', () => {
    expect(isFresh('not-a-number', 1785368935026)).toBe(false);
    expect(isFresh('', 1785368935026)).toBe(false);
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

    it(`${file}: carries no real Zoom identifiers, credentials or tokens`, () => {
      const raw = readFileSync(path.join(dir, file), 'utf8');

      // The licensed host address and any live zoom.us URL must never ship.
      expect(raw).not.toContain('nuevaeducacion.org');
      expect(raw).not.toMatch(/https:\/\/[a-z0-9]+\.zoom\.us\//);
      expect(raw).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./);

      // Zoom sends the S2S Client ID in a `clientid` REQUEST HEADER. A denylist
      // that stripped only `authorization` let it into a generated fixture; headers
      // are now allowlisted, and this locks that in.
      expect(Object.keys(JSON.parse(raw).headers)).not.toContain('clientid');

      // Tunnel-specific headers describe this spike's plumbing, not Zoom's request,
      // and would misinform a reader about the real header set.
      const headerKeys = Object.keys(JSON.parse(raw).headers);
      expect(headerKeys.filter((k) => k.startsWith('cf-'))).toHaveLength(0);
      expect(headerKeys).not.toContain('x-forwarded-for');

      /**
       * The defect class that leaked twice during generation: an opaque credential
       * under a field name the redactor had not been taught. `recording_play_passcode`
       * (~98 chars, grants playback of the real recording) is the concrete instance.
       * Any long high-entropy value under a token-ish key fails here.
       */
      const suspicious = raw.match(/"[a-z_]*(?:token|passcode|secret|key)":"([A-Za-z0-9_\-+/=.]{24,})"/gi) ?? [];
      const notPlaceholders = suspicious
        .filter((m) => !/synthetic|redacted|fixture-secret/i.test(m))
        // customer_key ships a shape-preserving 32-hex synthetic on purpose — the
        // customerKey round trip is this spike's headline verdict and a placeholder
        // would delete the evidence. Covered by its own assertion below.
        .filter((m) => !m.startsWith('"customer_key"'));
      expect(notPlaceholders).toEqual([]);
    });

    /**
     * Sol R1 finding ③: the assertion above claimed "no real identifiers" while
     * checking a handful of credential shapes. Four whole classes were unexamined
     * and all four were leaking — `traceparent`, `x-zm-request-id`,
     * `x-zm-trackingid` in every fixture, the numeric `user_id` in two, and the
     * meeting UUID plus six recording-file ids in `recording-completed.json`.
     *
     * So the claim is now made field by field. Every rewritten class is ENUMERATED
     * below with the property that identifies a synthetic value, and any field
     * present in the fixture must satisfy its class's predicate. A class nobody
     * checked is the whole failure mode, so an unrecognised identifier-ish field
     * fails too (`unclassified`, last case).
     */
    it(`${file}: every provider-minted field class is synthetic, enumerated`, () => {
      const fixture = JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as {
        headers: Record<string, string>;
        rawBody: string;
      };
      const body = JSON.parse(fixture.rawBody) as unknown;

      /** Collects `[jsonPath, key, value]` for every scalar in the payload. */
      const scalars: Array<{ path: string; key: string; value: string | number }> = [];
      const walk = (node: unknown, at: string) => {
        if (Array.isArray(node)) {
          node.forEach((item, i) => walk(item, `${at}[${i}]`));
          return;
        }
        if (node === null || typeof node !== 'object') return;
        for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
          if (typeof value === 'string' || typeof value === 'number') {
            scalars.push({ path: `${at}.${key}`, key, value });
          } else {
            walk(value, `${at}.${key}`);
          }
        }
      };
      walk(body, '$');
      expect(scalars.length).toBeGreaterThan(5);

      /**
       * `synthetic` returns true only for a value that could not be Zoom's. Each
       * predicate keys on a property the generator guarantees, not on "looks fake".
       */
      const CLASSES: Array<{
        klass: string;
        matches: (key: string, value: string | number, at: string) => boolean;
        synthetic: (value: string) => boolean;
        why: string;
      }> = [
        {
          klass: 'zoom-account-id',
          matches: (key) => key === 'account_id',
          synthetic: (v) => v.startsWith('Acct'),
          why: 'generator prefixes synthetic account ids with Acct',
        },
        {
          klass: 'zoom-user-id',
          matches: (key, value, at) =>
            ['host_id', 'participant_user_id', 'operator_id'].includes(key) ||
            (key === 'id' && at.includes('.participant.')),
          synthetic: (v) => v === '' || v.startsWith('User'),
          why: 'generator prefixes synthetic user ids with User (empty string is Zoom’s own value for a guest)',
        },
        {
          klass: 'zoom-numeric-user-id',
          matches: (key) => key === 'user_id',
          // Real ones observed were 167xxxxx; the synthetic map derives from a hash.
          synthetic: (v) => /^\d{8}$/.test(v) && !v.startsWith('167'),
          why: 'synthetic numeric ids are hash-derived and cannot fall in the observed real 167xxxxx block',
        },
        {
          klass: 'meeting-uuid',
          matches: (key) => key === 'uuid' || key === 'meeting_id',
          // The synthetic uuid carries '+' at index 2 and '/' at index 16 by design.
          synthetic: (v) => v.length === 24 && v[2] === '+' && v[16] === '/' && v.endsWith('=='),
          why: 'synthetic meeting UUIDs are minted with + at index 2 and / at index 16, preserving the double-encoding exemplar',
        },
        {
          klass: 'recording-file-id',
          matches: (key, _value, at) => key === 'id' && at.includes('.recording_files['),
          synthetic: (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/.test(v),
          why: 'synthetic recording-file ids are minted with the v4 version/variant nibbles (4 and 8) that the captured real ids did not all carry',
        },
        {
          klass: 'participant-uuid',
          matches: (key) => key === 'participant_uuid',
          synthetic: (v) => /^[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}$/.test(v),
          why: 'shape-preserved uppercase dashed hex, mapped per participant',
        },
        {
          klass: 'customer-key',
          matches: (key) => key === 'customer_key',
          synthetic: (v) => /^[0-9a-f]{32}$/.test(v),
          why: '§4 format preserved (UUID sans hyphens) so the round-trip verdict stays legible',
        },
        {
          klass: 'email',
          matches: (key) => key.endsWith('email'),
          synthetic: (v) => v === '' || v.endsWith('@example-synthetic.test'),
          why: 'reserved .test TLD, which can never resolve',
        },
        {
          klass: 'ip',
          matches: (key) => ['public_ip', 'private_ip', 'ip_address'].includes(key),
          synthetic: (v) => v.startsWith('203.0.113.'),
          why: 'RFC 5737 documentation range',
        },
        {
          klass: 'recording-url',
          matches: (key) => key.endsWith('_url'),
          synthetic: (v) => v.startsWith('https://example-synthetic.test/'),
          why: 'reserved .test TLD; no live playback or download target',
        },
        {
          klass: 'token-or-passcode',
          matches: (key) => /(?:token|passcode|password)$/.test(key),
          synthetic: (v) => v === '' || /^(?:synthetic|000000)/.test(v),
          why: 'placeholder — these grant live access and no shape needs preserving',
        },
        {
          klass: 'registrant-id',
          matches: (key) => key === 'registrant_id',
          synthetic: (v) => v === '' || /^[0-9a-f]{8,}$/.test(v),
          why: 'no registration was used, so Zoom sends an empty string; a populated one would be hash-derived hex',
        },
        {
          // Zoom-authored prose, not an identifier — but asserted rather than
          // exempted, because a free-text field is exactly where a name or address
          // could turn up in some future event type.
          klass: 'zoom-prose',
          matches: (key) => key === 'leave_reason',
          synthetic: (v) => !v.includes('@') && !/[A-Za-z0-9_-]{20,}/.test(v),
          why: 'must carry no address and no opaque identifier-length token',
        },
        {
          klass: 'meeting-number',
          matches: (key, _value, at) => key === 'id' && !at.includes('.participant.') && !at.includes('.recording_files['),
          synthetic: (v) => /^8\d{10}$/.test(v),
          why: 'synthetic meeting numbers are minted in the 8xxxxxxxxxx range from a hash',
        },
      ];

      /** Fields that are neither identifiers nor secrets, declared by name. */
      const NON_IDENTIFYING = new Set([
        'event',
        'event_ts',
        'topic',
        'type',
        'duration',
        'timezone',
        'start_time',
        'end_time',
        'join_time',
        'leave_time',
        'recording_start',
        'recording_end',
        'user_name',
        'name',
        'status',
        'file_type',
        'file_extension',
        'file_size',
        'total_size',
        'recording_count',
        'recording_type',
      ]);

      const failures: string[] = [];
      const covered = new Set<string>();

      for (const { path: at, key, value } of scalars) {
        if (NON_IDENTIFYING.has(key)) continue;
        const klass = CLASSES.find((c) => c.matches(key, value, at));
        if (!klass) {
          failures.push(`unclassified identifier-ish field ${at} = ${JSON.stringify(value)}`);
          continue;
        }
        covered.add(klass.klass);
        if (!klass.synthetic(String(value))) {
          failures.push(`${at} (${klass.klass}) is not synthetic: ${JSON.stringify(value)} — ${klass.why}`);
        }
      }

      // Header classes, the ones that shipped real in every v1 fixture.
      const HEADER_CLASSES: Array<{ key: string; synthetic: (v: string) => boolean }> = [
        // Structure preserved; the value is hash-derived.
        { key: 'traceparent', synthetic: (v) => /^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/.test(v) },
        { key: 'x-zm-request-id', synthetic: (v) => /^[0-9a-f]{8}(_[0-9a-f]{4}){3}_[0-9a-f]{12}$/.test(v) },
        { key: 'x-zm-trackingid', synthetic: (v) => v.length > 0 },
      ];
      for (const { key, synthetic } of HEADER_CLASSES) {
        const value = fixture.headers[key];
        if (value === undefined) continue;
        covered.add(key);
        if (!synthetic(value)) failures.push(`header ${key} fails its shape check: ${value}`);
      }

      expect(failures).toEqual([]);
      // Guard against the check passing because it examined nothing.
      expect(covered.size).toBeGreaterThanOrEqual(6);
    });
  }

  /**
   * Cross-fixture coherence. The mapping is `sha256(salt||real)`-derived precisely
   * so that a synthetic id means the same thing everywhere — a per-file counter
   * would have produced seven unrelated meetings and quietly destroyed every join
   * Z1b will need to test against.
   */
  it('keeps identifiers joinable across fixtures', () => {
    if (files.length < 2) return;
    const load = (f: string) =>
      JSON.parse(JSON.parse(readFileSync(path.join(dir, f), 'utf8')).rawBody) as {
        payload: { account_id: string; object: Record<string, unknown> };
      };

    const uuids = new Set<string>();
    const accounts = new Set<string>();
    const meetingIds = new Set<string>();
    for (const f of files) {
      const body = load(f);
      accounts.add(body.payload.account_id);
      if (typeof body.payload.object.uuid === 'string') uuids.add(body.payload.object.uuid);
      if (body.payload.object.id !== undefined) meetingIds.add(String(body.payload.object.id));
    }

    // All seven events came from ONE meeting on ONE account, and the fixtures must
    // still say so.
    expect(accounts.size).toBe(1);
    expect(uuids.size).toBe(1);
    expect(meetingIds.size).toBe(1);

    // recording.completed's files must point at that same meeting via `meeting_id`,
    // which is the field v1 left real precisely because nothing checked this.
    const completed = files.find((f) => f.includes('recording-completed'));
    if (completed) {
      const object = load(completed).payload.object as {
        uuid: string;
        recording_files: Array<{ id: string; meeting_id: string }>;
      };
      expect(object.recording_files.length).toBeGreaterThan(1);
      for (const rf of object.recording_files) {
        expect(rf.meeting_id).toBe(object.uuid);
      }
      // Distinct files, not one id repeated.
      expect(new Set(object.recording_files.map((f) => f.id)).size).toBe(object.recording_files.length);
    }
  });

  it('preserves the / and + double-encoding exemplar §6 depends on', () => {
    if (files.length === 0) return;
    const body = JSON.parse(
      JSON.parse(readFileSync(path.join(dir, files[0]), 'utf8')).rawBody
    ) as { payload: { object: { uuid?: string } } };
    const uuid = body.payload.object.uuid;
    if (!uuid) return;

    // Zoom's real UUID contained both, which is the entire reason the production
    // client must double-encode. A synthetic UUID without them would retire the
    // exemplar and leave the encoding rule untested.
    expect(uuid).toContain('+');
    expect(uuid).toContain('/');
    expect(encodeURIComponent(encodeURIComponent(uuid))).not.toContain('/');
    expect(encodeURIComponent(encodeURIComponent(uuid))).not.toContain('+');
  });
});
