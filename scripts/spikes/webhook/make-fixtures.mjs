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

  // account_id / host_id / user_id style opaque Zoom ids (22-char base64url).
  out = out.replace(/"account_id":"([A-Za-z0-9_-]{20,24})"/g, (_m, id) => `"account_id":"${alloc('account', id, SYNTHETIC.account)}"`);
  out = out.replace(/"host_id":"([A-Za-z0-9_-]{20,24})"/g, (_m, id) => `"host_id":"${alloc('user', id, SYNTHETIC.user)}"`);
  out = out.replace(/"operator_id":"([A-Za-z0-9_-]{20,24})"/g, (_m, id) => `"operator_id":"${alloc('user', id, SYNTHETIC.user)}"`);
  out = out.replace(/"participant_user_id":"([A-Za-z0-9_-]{20,24})"/g, (_m, id) => `"participant_user_id":"${alloc('user', id, SYNTHETIC.user)}"`);

  // Meeting numeric id, string or number form.
  out = out.replace(/"id":"(\d{9,11})"/g, (_m, id) => `"id":"${alloc('meeting', id, SYNTHETIC.meeting)}"`);
  out = out.replace(/"id":(\d{9,11})/g, (_m, id) => `"id":${alloc('meeting', id, SYNTHETIC.meeting)}`);

  // Meeting/recording UUIDs (base64 with padding, may contain / and +).
  out = out.replace(/"uuid":"([A-Za-z0-9+/=]{20,28})"/g, (_m, id) => `"uuid":"${alloc('uuid', id, SYNTHETIC.uuid)}"`);

  // Any email address, including the licensed host's.
  out = out.replace(/"([a-z_]*email)":"([^"]+@[^"]+)"/g, (_m, key, addr) => `"${key}":"${alloc('email', addr, SYNTHETIC.email)}"`);

  // Download tokens and any JWT-shaped value.
  out = out.replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, 'synthetic.jwt.token');
  out = out.replace(/"download_token":"[^"]*"/g, '"download_token":"synthetic-download-token"');

  // Passcodes and share URLs carry live-meeting access.
  out = out.replace(/"(password|h323_password|pstn_password|encrypted_password)":"[^"]*"/g, '"$1":"000000"');
  out = out.replace(/https:\/\/[a-z0-9]+\.zoom\.us\/[^"]*/g, 'https://example-synthetic.test/redacted');

  return out;
}

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
  // Fixed timestamp so regenerating does not churn the diff.
  const timestamp = '1753900000000';
  const headers = { ...record.headers };
  delete headers.authorization;
  headers['x-zm-signature'] = signFixture(timestamp, redactedBody);
  headers['x-zm-request-timestamp'] = timestamp;
  if (headers.host) headers.host = 'example-synthetic.test';
  if (headers['content-length']) headers['content-length'] = String(Buffer.byteLength(redactedBody));

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
