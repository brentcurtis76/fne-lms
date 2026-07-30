/**
 * Turns raw webhook captures into the redacted fixture library Z1b consumes.
 *
 * The capture file (`captures/events.jsonl`, gitignored) holds real payloads from
 * FNE's Zoom account: real account id, real host user id, real host email, real
 * meeting ids and UUIDs, real recording-file ids, real per-request tracing
 * headers. **None of that may enter the repo.** This script rewrites every
 * provider-minted identifier to a stable synthetic value while preserving the
 * SHAPE that Z1b's webhook route has to parse — field presence, types, formats,
 * and the ordering of keys as Zoom actually sent them.
 *
 * ## What v2 fixed (Sol R1 finding ③)
 *
 * v1 rewrote a NARROW field set and shipped seven fixtures that still carried, per
 * `scan-identifiers.mjs` at `aabfeec`: real `traceparent` / `x-zm-request-id` /
 * `x-zm-trackingid` in all 7; the real numeric Zoom `user_id` in 2; the real
 * meeting UUID and all 6 real recording-file ids in `recording-completed.json`.
 * None of those is a credential, which is exactly why a credential-shaped scan
 * passed them — and why the scan now enumerates by FIELD instead.
 *
 * Every class Zoom mints is now synthesized:
 *
 * | class | fields | shape preserved |
 * |---|---|---|
 * | account id            | `account_id`                                   | 22-char base64url |
 * | Zoom user id          | `host_id`, `participant_user_id`, `operator_id`, participant `id` | 22-char base64url |
 * | numeric user id       | `user_id`                                      | 8-digit decimal |
 * | meeting number        | `id` (meeting object)                          | 11-digit decimal, string AND number form |
 * | meeting UUID          | `uuid`, `meeting_id`                           | base64 + `==`, **containing `/` and `+`** |
 * | recording-file id     | `recording_files[].id`                         | dashed lowercase hex UUID |
 * | participant UUID      | `participant_uuid`                             | dashed UPPERCASE hex UUID, distinct per person |
 * | customer key          | `customer_key`                                 | 32 lowercase hex (UUID sans hyphens, §4) |
 * | email                 | `host_email`, `*email`                         | addressable form at a reserved test domain |
 * | IP                    | `public_ip`, `private_ip`, `ip_address`         | RFC 5737 documentation address |
 * | recording URLs        | `share_url`, `play_url`, `download_url`        | https URL at a reserved test domain |
 * | tokens / passcodes    | `download_token`, `*password`, `recording_play_passcode`, JWT-shaped | opaque placeholder |
 * | trace / request ids   | `traceparent`, `x-zm-request-id`, `x-zm-trackingid` | exact structure, hex runs resynthesized |
 *
 * The meeting UUID deliberately CONTAINS `/` and `+`. Zoom's real one did, and
 * that is the whole reason §6 requires double-encoding it into a URL path — a
 * synthetic UUID without those characters would silently retire the exemplar that
 * makes the encoding rule testable.
 *
 * ## What is deliberately RETAINED, and why
 *
 *  - **synthetic display names** ("Anfitrion Spike", "Prueba Spike Uno") — the
 *    spike never used a real person's name
 *  - **the mandated topic** `PRUEBA SPIKE — no unirse`
 *  - **wall-clock timestamps** (`start_time`, `join_time`, `event_ts`, …). These
 *    identify nobody: they are the clock times of a synthetic meeting on a deleted
 *    recording. They are also load-bearing evidence — `event_ts` in
 *    MILLISECONDS against `x-zm-request-timestamp` in SECONDS is the unit
 *    asymmetry §6.1 records, and normalising it away would hand Z1b a fixture that
 *    disagrees with reality.
 *  - **Zoom's constant service strings** (`user-agent`, `zm-trace-upstream`) —
 *    the same for every account.
 *  - **the raw body's byte-for-byte key ordering and spacing**, because that is
 *    the whole reason the production route must verify over raw bytes.
 *  - **signature / timestamp headers are RECOMPUTED**, not preserved: their real
 *    values are meaningless once ids change, and a stale real signature in a
 *    fixture invites someone to "fix" a test by trusting it.
 *
 * ## Determinism
 *
 * Mapping is `sha256(salt || realValue)`-derived, so the same real id always
 * yields the same synthetic id — independent of capture order and stable across
 * regenerations. That is what keeps cross-fixture joins coherent: the meeting UUID
 * in `recording-completed.json` still equals the one in `meeting-started.json`,
 * the six recording-file ids still belong to one meeting, and a retry pair still
 * carries one request id. v1's first-seen-order counter was deterministic only
 * within a single run.
 *
 * Verify with: `node scripts/spikes/webhook/scan-identifiers.mjs`
 *
 * Usage: node scripts/spikes/webhook/make-fixtures.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash, createHmac } from 'node:crypto';
import path from 'node:path';

const ROOT = process.cwd();
const CAPTURE = path.join(ROOT, 'scripts/spikes/webhook/captures/events.jsonl');
const OUT_DIR = path.join(ROOT, '__tests__/lib/zoom/fixtures/webhooks');

if (!existsSync(CAPTURE)) {
  console.error(`no capture file at ${path.relative(ROOT, CAPTURE)} — run the receiver and validate the subscription first`);
  process.exit(1);
}

/**
 * Fixed salt so the mapping is reproducible by anyone re-running this script
 * against the same captures. It is not a secret — its only job is to make the
 * synthetic values obviously not-a-hash-of-nothing while staying derivable.
 */
const SALT = 'genera-z0b2-fixture-map-v2';

/** Hex digest of a real value, so `real → synthetic` never depends on order. */
function digest(kind, real) {
  return createHash('sha256').update(`${SALT}:${kind}:${real}`).digest('hex');
}

/** Decimal digits derived from the digest, `len` long, never leading-zero. */
function synthDigits(kind, real, len) {
  const h = digest(kind, real);
  let out = '';
  for (let i = 0; out.length < len; i += 1) {
    out += String(parseInt(h[i % h.length], 16) % 10);
  }
  if (out[0] === '0') out = `1${out.slice(1)}`;
  return out;
}

/** base64url-ish token of `len` chars — the shape Zoom's opaque ids take. */
function synthB64Url(kind, real, len) {
  const raw = Buffer.from(digest(kind, real), 'hex')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return raw.slice(0, len);
}

/**
 * Every distinct real value seen, per class, so the run can report what it
 * rewrote. Purely for the log and the `_synthesized` manifest — the mapping
 * itself is stateless.
 */
const seen = new Map();
function noteMapping(kind, real, synthetic) {
  if (!seen.has(kind)) seen.set(kind, new Map());
  seen.get(kind).set(real, synthetic);
  return synthetic;
}

const SYNTHETIC = {
  /** 22-char base64url, like Zoom's account and user ids. */
  account: (real) => noteMapping('account', real, `Acct${synthB64Url('account', real, 18)}`),
  user: (real) => noteMapping('user', real, `User${synthB64Url('user', real, 18)}`),
  /** 8-digit decimal — the per-occurrence numeric participant id. */
  numericUser: (real) => noteMapping('numericUser', real, synthDigits('numericUser', real, 8)),
  /** 11-digit meeting number. */
  meeting: (real) => noteMapping('meeting', real, `8${synthDigits('meeting', real, 10)}`),
  /**
   * Meeting/occurrence UUID: base64 with `==` padding, and deliberately carrying
   * BOTH `+` and `/`. Zoom's real value did, which is the entire basis of §6's
   * double-encoding rule — a synthetic value without them would quietly delete the
   * exemplar the encoding test depends on.
   */
  uuid: (real) => {
    const body = Buffer.from(digest('uuid', real), 'hex')
      .toString('base64')
      .replace(/=+$/, '')
      .slice(0, 22)
      .split('');
    body[2] = '+';
    body[16] = '/';
    return noteMapping('uuid', real, `${body.join('')}==`);
  },
  /** Recording-file id: dashed lowercase hex UUID (v4-shaped). */
  recordingFile: (real) => {
    const h = digest('recordingFile', real);
    const v4 = `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
    return noteMapping('recordingFile', real, v4);
  },
  /**
   * Participant UUID: dashed UPPERCASE hex, per Zoom's own casing. Mapped per real
   * value rather than replaced with one constant — v1 collapsed every participant
   * onto `00000000-0000-4000-8000-000000000000`, which destroyed the distinctness
   * that makes a two-participant fixture worth anything.
   */
  participantUuid: (real) => {
    const h = digest('participantUuid', real).toUpperCase();
    const v = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
    return noteMapping('participantUuid', real, v);
  },
  /** customerKey — §4 format: UUID with the hyphens stripped, 32 lowercase hex. */
  customerKey: (real) => noteMapping('customerKey', real, digest('customerKey', real).slice(0, 32)),
  /** `example-synthetic.test` is a reserved-TLD name that can never resolve. */
  email: (real) => noteMapping('email', real, `host-${synthDigits('email', real, 4)}@example-synthetic.test`),
  /** W3C traceparent: version-traceid(32)-spanid(16)-flags. */
  traceparent: (real) => {
    const m = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/.exec(real);
    if (!m) return noteMapping('traceparent', real, `00-${digest('trace', real).slice(0, 32)}-${digest('span', real).slice(0, 16)}-01`);
    const h = digest('traceparent', real);
    return noteMapping('traceparent', real, `${m[1]}-${h.slice(0, 32)}-${h.slice(32, 48)}-${m[4]}`);
  },
  /**
   * Any header value that is structure + hex runs (`x-zm-request-id`,
   * `x-zm-trackingid`). Rewrites each hex-or-dashed-hex run of 8+ chars in place,
   * preserving length, case and every separator, so Z1b still sees the real
   * format.
   */
  hexRuns: (kind, real) =>
    noteMapping(
      kind,
      real,
      // Threshold 4, not 8. `x-zm-request-id` has the shape
      // `<8hex>_<4hex>_<4hex>_<4hex>_<12hex>`. An 8+ threshold rewrote the two
      // long groups and left the three 4-char ones REAL, so a full-value scan passed
      // while three real segments shipped. Structure survives regardless: the literal
      // tokens in these headers (`v`, `clid`, `us02`, `rid`, `WEB`, `EventService`)
      // all contain a non-hex character, so none of them can match.
      real.replace(/[0-9A-Fa-f][0-9A-Fa-f-]{3,}/g, (run) => {
        const h = digest(`${kind}:run`, `${real}:${run}`);
        let i = 0;
        // Per position, preserve the CHARACTER CLASS as well as the case: a digit
        // stays a digit, an uppercase hex letter stays an uppercase hex letter. Zoom
        // writes `x-zm-trackingid` in upper case and `x-zm-request-id` in lower, and
        // a fixture that garbles that misinforms anyone who later parses it.
        return run.replace(/[0-9A-Fa-f]/g, (ch) => {
          const nibble = parseInt(h[i % h.length], 16);
          i += 1;
          if (/[0-9]/.test(ch)) return String(nibble % 10);
          const letter = 'abcdef'[nibble % 6];
          return /[A-F]/.test(ch) ? letter.toUpperCase() : letter;
        });
      })
    ),
};

/**
 * Rewrites identifiers inside the RAW body string, so key order and whitespace
 * survive untouched. Value-level substitution only — never a re-serialization.
 */
function redactRawBody(raw) {
  let out = raw;

  // Recording-file ids FIRST, before the generic `"id"` rules: they are dashed hex
  // UUIDs, a shape the base64url rule below cannot match and the numeric rules
  // cannot either, which is precisely how all six of them shipped in v1.
  out = out.replace(
    /"id":"([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})"/g,
    (_m, id) => `"id":"${SYNTHETIC.recordingFile(id)}"`
  );

  // Opaque Zoom ids (base64url, ~22 chars). Every key that can carry one is
  // listed explicitly rather than relying on a generic sweep, because a missed key
  // ships a real identifier. `id` is included: on a `participant` object it is the
  // participant's Zoom USER id, not a meeting number — a real leak found by the
  // post-generation scan before these fixtures were ever committed.
  for (const key of ['account_id', 'host_id', 'operator_id', 'participant_user_id', 'user_id', 'id']) {
    out = out.replace(
      new RegExp(`"${key}":"([A-Za-z0-9_-]{20,24})"`, 'g'),
      (_m, id) =>
        `"${key}":"${key === 'account_id' ? SYNTHETIC.account(id) : SYNTHETIC.user(id)}"`
    );
  }

  // The NUMERIC participant id. Zoom mints it per occurrence (results §6: it is
  // never a matching key), and v1 had no rule for it at all — 8 digits sits under
  // the 9-digit floor the meeting-number rules use.
  out = out.replace(/"user_id":"(\d{6,12})"/g, (_m, id) => `"user_id":"${SYNTHETIC.numericUser(id)}"`);
  out = out.replace(/"user_id":(\d{6,12})/g, (_m, id) => `"user_id":${SYNTHETIC.numericUser(id)}`);

  // Meeting numeric id, string or number form.
  out = out.replace(/"id":"(\d{9,11})"/g, (_m, id) => `"id":"${SYNTHETIC.meeting(id)}"`);
  out = out.replace(/"id":(\d{9,11})/g, (_m, id) => `"id":${SYNTHETIC.meeting(id)}`);

  // Meeting/occurrence UUID (base64 with padding, may contain / and +). Under BOTH
  // key names: inside `recording_files[]` the same value arrives as `meeting_id`,
  // which v1 did not rewrite — so the real UUID shipped in recording-completed.json
  // even though the `uuid` field beside it was clean. Same map for both, so the
  // file→meeting join in the fixture stays true.
  for (const key of ['uuid', 'meeting_id']) {
    out = out.replace(
      new RegExp(`"${key}":"([A-Za-z0-9+/=]{20,28})"`, 'g'),
      (_m, id) => `"${key}":"${SYNTHETIC.uuid(id)}"`
    );
  }

  // Per-participant UUIDs are dashed-hex, a different shape entirely — mapped per
  // value so two participants stay two people.
  out = out.replace(
    /"participant_uuid":"([0-9A-Fa-f-]{20,40})"/g,
    (_m, id) => `"participant_uuid":"${SYNTHETIC.participantUuid(id)}"`
  );

  // customerKey is OURS, not Zoom's, and already synthetic — but it is mapped
  // anyway so nothing ties a fixture to a specific live session, and mapped BEFORE
  // the token catch-all below, which would otherwise flatten it to a placeholder
  // and destroy the round-trip shape that is this spike's headline verdict.
  out = out.replace(
    /"customer_key":"([0-9a-fA-F]{16,64})"/g,
    (_m, id) => `"customer_key":"${SYNTHETIC.customerKey(id)}"`
  );

  // Any email address, including the licensed host's.
  out = out.replace(/"([a-z_]*email)":"([^"]+@[^"]+)"/g, (_m, key, addr) => `"${key}":"${SYNTHETIC.email(addr)}"`);

  // IP addresses — the participant's public IP is personal data under Ley 21.719,
  // and Zoom's egress IPs are infrastructure detail a fixture has no need for.
  out = out.replace(/"(public_ip|private_ip|ip_address)":"[^"]*"/g, '"$1":"203.0.113.1"');

  // Download tokens and any JWT-shaped value.
  out = out.replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, 'synthetic.jwt.token');
  out = out.replace(/"download_token":"[^"]*"/g, '"download_token":"synthetic-download-token"');

  // Passcodes and share URLs carry live access.
  out = out.replace(/"(password|h323_password|pstn_password|encrypted_password)":"[^"]*"/g, '"$1":"000000"');
  // `recording_play_passcode` is a ~98-char opaque token that grants PLAYBACK of the
  // real recording — a live credential, and one the shorter `password` pattern above
  // does not match. Found leaking by the post-generation scan.
  out = out.replace(/"(recording_play_passcode)":"[^"]*"/g, '"$1":"synthetic-play-passcode"');
  out = out.replace(/https:\/\/[a-z0-9]+\.zoom\.us\/[^"]*/g, 'https://example-synthetic.test/redacted');

  /**
   * Backstop for the class of defect the two scans caught: any remaining long
   * opaque high-entropy string is treated as a probable token. This runs LAST so
   * every named rule above wins, and it exists because guessing Zoom's field names
   * correctly is exactly what failed twice.
   */
  // `customer_key` is excluded by name: it is handled above with a shape-preserving
  // synthetic, and this catch-all would otherwise flatten that 32-hex value straight
  // back to a placeholder — the synthetic matches the catch-all's own pattern. That
  // is not hypothetical; it is what the first v2 run produced.
  out = out.replace(
    /"((?!customer_key")[a-z_]*(?:token|passcode|secret|key))":"([A-Za-z0-9_\-+/=.]{24,})"/gi,
    '"$1":"synthetic-redacted-token"'
  );

  return out;
}

/**
 * Headers are ALLOWLISTED, not denylisted.
 *
 * Two reasons, both found empirically rather than anticipated:
 *
 * 1. **Zoom sends a `clientid` header carrying the S2S Client ID** — a credential.
 *    A denylist that stripped only `authorization` let it straight into a fixture.
 *    An allowlist fails closed: a header nobody has vetted simply does not ship.
 *
 * 2. The capture arrives through a cloudflared tunnel, so `cf-*`, `cdn-loop`,
 *    `x-forwarded-*` and `host` describe THIS spike's plumbing, not Zoom's request.
 *    Shipping them would misinform Z1b about the real header set and bake a
 *    dev-only topology into a fixture.
 */
const HEADER_ALLOWLIST = [
  'content-type',
  'content-length',
  'user-agent',
  'traceparent',
  'x-zm-request-id',
  'x-zm-request-timestamp',
  'x-zm-signature',
  'x-zm-trackingid',
  'zm-trace-upstream',
];

/**
 * Allowlisting decided WHICH headers ship. It said nothing about their values, and
 * that gap is Sol R1 ③: `traceparent`, `x-zm-request-id` and `x-zm-trackingid` are
 * minted per request by Zoom's infrastructure and shipped verbatim in all seven v1
 * fixtures. They are not credentials — they are live provider identifiers, which is
 * the bar the synthetic-only invariant actually sets.
 *
 * Each is rewritten preserving its exact structure, because Z1b may one day parse
 * or log these and a fixture that lies about the format is worse than no fixture.
 * `user-agent` and `zm-trace-upstream` are Zoom constants and pass through.
 */
const HEADER_SYNTHESIZERS = {
  traceparent: (value) => SYNTHETIC.traceparent(value),
  'x-zm-request-id': (value) => SYNTHETIC.hexRuns('requestId', value),
  'x-zm-trackingid': (value) => SYNTHETIC.hexRuns('trackingId', value),
};

const HEADER_ALLOWLIST_NOTE =
  'Header values for x-zm-signature / x-zm-request-timestamp are replaced with recomputed values over the REDACTED body using the placeholder secret below, so the fixtures are self-consistent and verifiable in CI without any real secret.';

/** Placeholder secret the fixtures are signed with. Public by design. */
const FIXTURE_SECRET = 'fixture-secret-token-not-a-real-secret';

function signFixture(timestamp, body) {
  return `v0=${createHmac('sha256', FIXTURE_SECRET).update(`v0:${timestamp}:${body}`).digest('hex')}`;
}

const lines = readFileSync(CAPTURE, 'utf8').trim().split('\n').filter(Boolean);
const records = lines.map((l) => JSON.parse(l));

// One fixture per distinct event type; keep the FIRST occurrence of each.
const byEvent = new Map();
for (const record of records) {
  const event = record.event;
  if (!event || event === 'endpoint.url_validation') continue;
  if (!byEvent.has(event)) byEvent.set(event, record);
}

mkdirSync(OUT_DIR, { recursive: true });

const index = [];
for (const [event, record] of byEvent) {
  const redactedBody = redactRawBody(record.body.raw);
  // Fixed so regenerating does not churn the diff, and 10-digit because
  // `x-zm-request-timestamp` is epoch SECONDS — measured, not assumed (results
  // §6.1). A 13-digit millisecond value here would hand Z1b a fixture that
  // disagrees with reality about the unit.
  const timestamp = '1785368934';
  const headers = {};
  for (const key of HEADER_ALLOWLIST) {
    if (record.headers[key] === undefined) continue;
    const synthesize = HEADER_SYNTHESIZERS[key];
    if (!synthesize) {
      headers[key] = record.headers[key];
      continue;
    }
    const real = record.headers[key];
    const synthetic = synthesize(real);
    // Fail closed on PARTIAL survival, the defect the 8-char threshold caused: every
    // hex run of 4+ in the real value must be absent from the synthetic one.
    for (const run of real.match(/[0-9A-Fa-f]{4,}/g) ?? []) {
      if (synthetic.includes(run)) {
        throw new Error(`ABORT: real ${key} segment "${run}" survived synthesis for ${event}`);
      }
    }
    headers[key] = synthetic;
  }
  headers['x-zm-signature'] = signFixture(timestamp, redactedBody);
  headers['x-zm-request-timestamp'] = timestamp;
  if (headers['content-length']) headers['content-length'] = String(Buffer.byteLength(redactedBody));

  // Fail closed rather than shipping a credential OR an identifier: if any value
  // that must never appear survives, refuse to write the fixture at all. The env
  // list grew in v2 — `ZOOM_LICENSED_HOST_EMAIL` was checked nowhere, so the only
  // thing standing between the host's address and a fixture was one regex.
  const blob = JSON.stringify(headers) + redactedBody;
  const forbidden = [
    ['ZOOM_S2S_CLIENT_ID', process.env.ZOOM_S2S_CLIENT_ID],
    ['ZOOM_S2S_CLIENT_SECRET', process.env.ZOOM_S2S_CLIENT_SECRET],
    ['ZOOM_S2S_ACCOUNT_ID', process.env.ZOOM_S2S_ACCOUNT_ID],
    ['ZOOM_SDK_CLIENT_ID', process.env.ZOOM_SDK_CLIENT_ID],
    ['ZOOM_SDK_CLIENT_SECRET', process.env.ZOOM_SDK_CLIENT_SECRET],
    ['ZOOM_WEBHOOK_SECRET_TOKEN', process.env.ZOOM_WEBHOOK_SECRET_TOKEN],
    ['ZOOM_LICENSED_HOST_EMAIL', process.env.ZOOM_LICENSED_HOST_EMAIL],
  ].filter(([, value]) => Boolean(value));
  for (const [name, value] of forbidden) {
    if (blob.includes(value)) {
      throw new Error(`ABORT: ${name} survived redaction for ${event} — fixture NOT written`);
    }
  }

  const fixture = {
    _note: `Redacted capture of a REAL Zoom ${event} webhook (Z0B-2 spike). ${HEADER_ALLOWLIST_NOTE}`,
    _fixtureSecret: FIXTURE_SECRET,
    event,
    headers,
    /** RAW body as a string. Z1b must verify over exactly these bytes. */
    rawBody: redactedBody,
    rawBodyByteLength: Buffer.byteLength(redactedBody),
    /**
     * Whether Zoom's real bytes were byte-identical to
     * JSON.stringify(JSON.parse(body)). Recorded from the live capture — this is
     * the empirical basis of the "verify over the raw body" rule.
     */
    zoomBodyWasByteIdenticalToReserialization: record.body.byteIdenticalToReserialization,
    observedSkewMs: record.verification.skewMs,
  };

  const file = path.join(OUT_DIR, `${event.replace(/\./g, '-')}.json`);
  writeFileSync(file, `${JSON.stringify(fixture, null, 2)}\n`);
  index.push({ event, file: path.basename(file), bytes: fixture.rawBodyByteLength });
  console.log(`wrote ${path.relative(ROOT, file)} (${fixture.rawBodyByteLength} B)`);
}

/**
 * The manifest records WHAT was synthesized, by class and count — never the real
 * values, only how many distinct ones each class had. A reviewer can compare this
 * against `scan-identifiers.mjs`'s class list and see that nothing was skipped,
 * which is the check v1 had no way to express.
 */
const synthesized = {};
for (const [kind, map] of [...seen.entries()].sort()) {
  synthesized[kind] = { distinctRealValues: map.size, exampleSynthetic: [...map.values()][0] };
}

writeFileSync(
  path.join(OUT_DIR, 'index.json'),
  `${JSON.stringify(
    {
      generatedFrom: 'live Zoom captures, every provider-minted identifier synthesized',
      fixtureSecret: FIXTURE_SECRET,
      synthesizedClasses: synthesized,
      retainedByDesign: [
        'wall-clock timestamps (synthetic meeting; event_ts-ms vs header-seconds is §6.1 evidence)',
        'synthetic display names and the PRUEBA SPIKE topic',
        "Zoom's constant service strings (user-agent, zm-trace-upstream)",
      ],
      events: index,
    },
    null,
    2
  )}\n`
);
console.log(`\n${index.length} fixture(s) written to ${path.relative(ROOT, OUT_DIR)}`);
console.log('synthesized identifier classes:');
for (const [kind, info] of Object.entries(synthesized)) {
  console.log(`  ${kind.padEnd(18)} ${String(info.distinctRealValues).padStart(3)} distinct real value(s)`);
}
console.log('\nnow run: node scripts/spikes/webhook/scan-identifiers.mjs');
if (index.length === 0) {
  console.log('(no non-CRC events captured yet — validate the subscription and run some meetings)');
}
