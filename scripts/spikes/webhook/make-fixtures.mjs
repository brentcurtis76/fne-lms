/**
 * Turns raw webhook captures into the redacted fixture library Z1b consumes.
 *
 * The capture file (`captures/events.jsonl`, gitignored) holds real payloads from
 * FNE's Zoom account: real account id, real host user id, real host email, real
 * meeting ids and UUIDs. None of that may enter the repo. This script rewrites
 * every identifier to a stable synthetic value while preserving the SHAPE that
 * Z1b's webhook route has to parse — field presence, types, formats, and the
 * ordering of keys as Zoom actually sent them.
 *
 * What is deliberately PRESERVED:
 *  - synthetic display names ("Prueba Spike Uno") — they were synthetic already
 *  - the exact header set Zoom delivered, with signature/timestamp values
 *    neutralised (their real values are meaningless once ids change, and a stale
 *    real signature in a fixture invites someone to "fix" a test by trusting it)
 *  - the raw body's byte-for-byte key ordering and spacing, because that is the
 *    whole reason the production route must verify over raw bytes
 *
 * Identifier mapping is deterministic (same input → same output) so fixtures are
 * stable across regenerations and diffs stay reviewable.
 *
 * Usage: node scripts/spikes/webhook/make-fixtures.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import path from 'node:path';

const ROOT = process.cwd();
const CAPTURE = path.join(ROOT, 'scripts/spikes/webhook/captures/events.jsonl');
const OUT_DIR = path.join(ROOT, '__tests__/lib/zoom/fixtures/webhooks');

if (!existsSync(CAPTURE)) {
  console.error(`no capture file at ${path.relative(ROOT, CAPTURE)} — run the receiver and validate the subscription first`);
  process.exit(1);
}

/** Stable synthetic stand-ins, allocated in first-seen order. */
const maps = { account: new Map(), user: new Map(), meeting: new Map(), uuid: new Map(), email: new Map() };
function alloc(kind, real, format) {
  const map = maps[kind];
  if (!map.has(real)) map.set(real, format(map.size + 1));
  return map.get(real);
}

const SYNTHETIC = {
  account: (n) => `AcctSynthetic${String(n).padStart(4, '0')}XXXXXX`,
  user: (n) => `UserSynthetic${String(n).padStart(4, '0')}XXXXXXX`,
  meeting: (n) => String(80000000000 + n),
  uuid: (n) => `${Buffer.from(`spikeuuid${String(n).padStart(6, '0')}`).toString('base64').slice(0, 22)}==`,
  email: (n) => `host${n}@example-synthetic.test`,
};

/**
 * Rewrites identifiers inside the RAW body string, so key order and whitespace
 * survive untouched. Value-level substitution only — never a re-serialization.
 */
function redactRawBody(raw) {
  let out = raw;

  // Opaque Zoom ids (base64url, ~22 chars). Every key that can carry one is
  // listed explicitly rather than relying on a generic sweep, because a missed key
  // ships a real identifier. `id` is included: on a `participant` object it is the
  // participant's Zoom USER id, not a meeting number — a real leak found by the
  // post-generation scan before these fixtures were ever committed.
  for (const key of ['account_id', 'host_id', 'operator_id', 'participant_user_id', 'user_id', 'id']) {
    out = out.replace(
      new RegExp(`"${key}":"([A-Za-z0-9_-]{20,24})"`, 'g'),
      (_m, id) => `"${key}":"${alloc(key === 'account_id' ? 'account' : 'user', id, key === 'account_id' ? SYNTHETIC.account : SYNTHETIC.user)}"`
    );
  }

  // Meeting numeric id, string or number form.
  out = out.replace(/"id":"(\d{9,11})"/g, (_m, id) => `"id":"${alloc('meeting', id, SYNTHETIC.meeting)}"`);
  out = out.replace(/"id":(\d{9,11})/g, (_m, id) => `"id":${alloc('meeting', id, SYNTHETIC.meeting)}`);

  // Meeting/recording UUIDs (base64 with padding, may contain / and +).
  out = out.replace(/"uuid":"([A-Za-z0-9+/=]{20,28})"/g, (_m, id) => `"uuid":"${alloc('uuid', id, SYNTHETIC.uuid)}"`);
  // Per-participant UUIDs are dashed-hex, a different shape entirely.
  out = out.replace(
    /"participant_uuid":"[0-9A-Fa-f-]{20,40}"/g,
    '"participant_uuid":"00000000-0000-4000-8000-000000000000"'
  );

  // Any email address, including the licensed host's.
  out = out.replace(/"([a-z_]*email)":"([^"]+@[^"]+)"/g, (_m, key, addr) => `"${key}":"${alloc('email', addr, SYNTHETIC.email)}"`);

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
  out = out.replace(/"([a-z_]*(?:token|passcode|secret|key))":"([A-Za-z0-9_\-+/=.]{24,})"/gi, '"$1":"synthetic-redacted-token"');

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
    if (record.headers[key] !== undefined) headers[key] = record.headers[key];
  }
  headers['x-zm-signature'] = signFixture(timestamp, redactedBody);
  headers['x-zm-request-timestamp'] = timestamp;
  if (headers['content-length']) headers['content-length'] = String(Buffer.byteLength(redactedBody));

  // Fail closed rather than shipping a credential: if any allowlisted value still
  // contains a secret, refuse to write the fixture at all.
  const headerBlob = JSON.stringify(headers);
  for (const secret of [process.env.ZOOM_S2S_CLIENT_ID, process.env.ZOOM_S2S_ACCOUNT_ID].filter(Boolean)) {
    if (headerBlob.includes(secret)) {
      throw new Error(`ABORT: a credential survived header allowlisting for ${event}`);
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

writeFileSync(
  path.join(OUT_DIR, 'index.json'),
  `${JSON.stringify({ generatedFrom: 'live Zoom captures, redacted', fixtureSecret: FIXTURE_SECRET, events: index }, null, 2)}\n`
);
console.log(`\n${index.length} fixture(s) written to ${path.relative(ROOT, OUT_DIR)}`);
if (index.length === 0) {
  console.log('(no non-CRC events captured yet — validate the subscription and run some meetings)');
}
