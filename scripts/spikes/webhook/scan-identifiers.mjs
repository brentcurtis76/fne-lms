/**
 * Identifier scan — the check that Sol's R1 finding ③ says was missing.
 *
 * The PM's pre-review scan looked for CREDENTIAL VALUES (client secrets, tokens,
 * passcodes) and found none. That is a narrower bar than the synthetic-only
 * invariant: a real recording-file id, a real meeting UUID, a real Zoom user id
 * and a real `traceparent` are not credentials, and all four were sitting in
 * committed fixtures.
 *
 * So this scan works the other way round. It does not pattern-match for
 * secret-shaped strings; it reads the RAW CAPTURES (gitignored), enumerates every
 * provider-minted value in them by field, and then requires each one to have ZERO
 * occurrences in any git-tracked file. There is no judgement call about whether a
 * given value "looks sensitive" — if Zoom minted it and it appears in the repo,
 * that is a finding.
 *
 * Usage:
 *   node scripts/spikes/webhook/scan-identifiers.mjs            # human report
 *   node scripts/spikes/webhook/scan-identifiers.mjs --json     # machine output
 *
 * Exit code 1 on any hit, so it can gate a regeneration.
 */

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = process.cwd();
const CAPTURE = path.join(ROOT, 'scripts/spikes/webhook/captures/events.jsonl');
const asJson = process.argv.includes('--json');

if (!existsSync(CAPTURE)) {
  console.error(`no capture file at ${path.relative(ROOT, CAPTURE)} — nothing to scan against`);
  process.exit(2);
}

/**
 * Body fields whose values Zoom mints. Grouped by class so the report says WHICH
 * class of identifier leaked, which is what makes a finding actionable.
 *
 * `retained` marks values deliberately kept, with the reason. Only two classes
 * qualify, and neither identifies anything: wall-clock timestamps (the shape
 * evidence behind the §6.1 seconds-vs-milliseconds asymmetry) and Zoom's constant
 * service strings. Everything else must be rewritten.
 */
const IDENTIFIER_FIELDS = [
  { key: 'account_id', klass: 'zoom-account-id' },
  { key: 'host_id', klass: 'zoom-user-id' },
  { key: 'participant_user_id', klass: 'zoom-user-id' },
  { key: 'operator_id', klass: 'zoom-user-id' },
  { key: 'user_id', klass: 'zoom-numeric-user-id' },
  { key: 'uuid', klass: 'meeting-uuid' },
  { key: 'meeting_id', klass: 'meeting-uuid' },
  { key: 'participant_uuid', klass: 'participant-uuid' },
  { key: 'id', klass: 'object-id' },
  { key: 'host_email', klass: 'email' },
  { key: 'email', klass: 'email' },
  { key: 'registrant_id', klass: 'registrant-id' },
  { key: 'customer_key', klass: 'customer-key' },
  { key: 'public_ip', klass: 'ip' },
  { key: 'private_ip', klass: 'ip' },
  { key: 'ip_address', klass: 'ip' },
  { key: 'share_url', klass: 'recording-url' },
  { key: 'play_url', klass: 'recording-url' },
  { key: 'download_url', klass: 'recording-url' },
  { key: 'download_token', klass: 'download-token' },
  { key: 'password', klass: 'passcode' },
  { key: 'encrypted_password', klass: 'passcode' },
  { key: 'recording_play_passcode', klass: 'passcode' },
];

/** Header values Zoom mints per request. */
const IDENTIFIER_HEADERS = [
  { key: 'traceparent', klass: 'trace-id' },
  { key: 'x-zm-request-id', klass: 'request-id' },
  { key: 'x-zm-trackingid', klass: 'tracking-id' },
  { key: 'x-zm-signature', klass: 'signature' },
  { key: 'clientid', klass: 'credential' },
];

/** Values kept on purpose. Listed so "retained" is a declaration, not an omission. */
const RETAINED = [
  { klass: 'timestamp', why: 'wall-clock times of a synthetic meeting; the §6.1 seconds-vs-ms asymmetry is the evidence' },
  { klass: 'constant', why: "Zoom's fixed service strings (user-agent, zm-trace-upstream) identify nothing" },
  { klass: 'topic', why: 'the mandated synthetic topic "PRUEBA SPIKE — no unirse"' },
  { klass: 'display-name', why: 'synthetic by construction ("Anfitrion Spike", "Prueba Spike Uno")' },
];

/** Values too short or too common to scan for without drowning in false positives. */
function isScannable(value) {
  if (typeof value !== 'string') return false;
  if (value.length < 8) return false;
  // A bare date-time is a timestamp, not an identifier.
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return false;
  if (value === 'PRUEBA SPIKE — no unirse') return false;
  return true;
}

/** Recursively collects `{ field, klass, value }` for every identifier field present. */
function collect(node, out) {
  if (Array.isArray(node)) {
    for (const item of node) collect(item, out);
    return;
  }
  if (node === null || typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node)) {
    const field = IDENTIFIER_FIELDS.find((f) => f.key === key);
    if (field && isScannable(value)) {
      out.push({ field: key, klass: field.klass, value: String(value) });
    } else if (field && typeof value === 'number' && String(value).length >= 8) {
      out.push({ field: key, klass: field.klass, value: String(value) });
    }
    collect(value, out);
  }
}

const records = readFileSync(CAPTURE, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));

const found = [];
for (const record of records) {
  if (record.body?.raw) {
    try {
      collect(JSON.parse(record.body.raw), found);
    } catch {
      /* a body that will not parse cannot be walked; the raw grep below still covers it */
    }
  }
  for (const h of IDENTIFIER_HEADERS) {
    const value = record.headers?.[h.key];
    if (isScannable(value)) found.push({ field: h.key, klass: h.klass, value: String(value) });
  }
}

/**
 * Segments of a structured identifier, so a PARTIAL survival cannot pass a
 * full-value scan. The first v2 generator pass rewrote only the 8+ hex runs of
 * `x-zm-request-id` and left its three 4-char groups real; the full value differed,
 * so a value-only scan reported clean. Segments of 8+ characters are specific enough
 * that a coincidental match in unrelated source is not a realistic concern.
 */
function segmentsOf(value) {
  return (value.match(/[A-Za-z0-9]{8,}/g) ?? []).filter((seg) => {
    if (seg === value) return false;
    // Segment only what could BE an identifier. A run of letters with no digits is a
    // word, not an id — segmenting `download_url` yielded "download" and segmenting
    // the tracking-id prefix yielded "EventService", both of which then matched half
    // the repo and buried the four real hits in noise. Keep mixed alphanumerics and
    // pure hex; drop pure-alpha and pure-decimal runs.
    const hasDigit = /[0-9]/.test(seg);
    const hasLetter = /[A-Za-z]/.test(seg);
    if (/^[0-9a-fA-F]+$/.test(seg)) return true;
    return hasDigit && hasLetter;
  });
}

/**
 * Classes worth segmenting: structured, high-entropy, provider-minted. URLs and
 * email addresses are excluded — their segments are ordinary words.
 */
const SEGMENTABLE = new Set([
  'trace-id',
  'request-id',
  'tracking-id',
  'signature',
  'credential',
  'zoom-user-id',
  'zoom-account-id',
  'meeting-uuid',
  'participant-uuid',
  'object-id',
  'download-token',
  'passcode',
  'customer-key',
]);

for (const item of [...found]) {
  if (!SEGMENTABLE.has(item.klass)) continue;
  for (const seg of segmentsOf(item.value)) {
    found.push({ field: `${item.field}[segment]`, klass: item.klass, value: seg });
  }
}

/**
 * Declared exclusion, stated rather than hidden.
 *
 * `ZOOM_LICENSED_HOST_EMAIL` is FNE's PUBLISHED institutional contact address (the
 * value is not written here — this scanner would flag its own comment, and did). It is printed on their public website and appears
 * in 11 unrelated repo files (Footer, contact API, the public-site HTML, …) that
 * long predate this branch. It is not a leak and it is not this phase's to change;
 * what matters is that it does not appear in any Zoom-phase artifact, which the
 * partition below asserts separately.
 */
const PHASE_PATHS = [
  '__tests__/lib/zoom/',
  '__tests__/scripts/zoom',
  'lib/zoom/',
  'scripts/spikes/',
  'docs/planning/zoom',
  'pages/api/meet/',
  'pages/meet/',
  'PROJECT_STATE.md',
  'docs/planning/reviews/fase-2',
];
const inPhaseScope = (file) => PHASE_PATHS.some((prefix) => file.startsWith(prefix));

/** De-duplicate by value, keeping every field a value appeared under. */
const byValue = new Map();
for (const item of found) {
  const existing = byValue.get(item.value);
  if (existing) {
    existing.fields.add(item.field);
    existing.klasses.add(item.klass);
  } else {
    byValue.set(item.value, {
      value: item.value,
      fields: new Set([item.field]),
      klasses: new Set([item.klass]),
    });
  }
}

/** Every git-tracked file — the exact set that a merge would publish. */
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 })
  .toString('utf8')
  .split('\0')
  .filter(Boolean);

const hits = [];
/** Matches only outside this phase's files — reported, never a gate failure. */
const outOfScope = [];
for (const entry of byValue.values()) {
  // `git grep -F` over tracked files only: fixed-string, so base64 padding and
  // regex metacharacters in a UUID are matched literally.
  let out = '';
  try {
    out = execFileSync('git', ['grep', '-n', '-I', '-F', '--', entry.value], {
      cwd: ROOT,
      maxBuffer: 64 * 1024 * 1024,
    }).toString('utf8');
  } catch (err) {
    // git grep exits 1 with no output when there is no match — that is a pass.
    if (err.status !== 1) throw err;
  }
  const lines = out.split('\n').filter(Boolean);
  if (lines.length > 0) {
    const occurrences = lines.map((l) => l.split(':').slice(0, 2).join(':'));
    const phase = occurrences.filter((o) => inPhaseScope(o.split(':')[0]));
    const record = {
      value: entry.value,
      fields: [...entry.fields].sort(),
      classes: [...entry.klasses].sort(),
      occurrences,
      inPhaseScope: phase,
    };
    if (phase.length > 0) hits.push(record);
    else outOfScope.push(record);
  }
}

const summary = {
  captureRecords: records.length,
  trackedFilesScanned: tracked.length,
  distinctIdentifierValues: byValue.size,
  identifierClasses: [...new Set([...byValue.values()].flatMap((e) => [...e.klasses]))].sort(),
  retainedByDesign: RETAINED,
  hits,
  outOfPhaseScope: outOfScope,
};

if (asJson) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log('=== IDENTIFIER SCAN (real provider-minted values vs git-tracked files) ===');
  console.log(`capture records            : ${summary.captureRecords}`);
  console.log(`git-tracked files in scope : ${summary.trackedFilesScanned}`);
  console.log(`distinct real identifiers  : ${summary.distinctIdentifierValues}`);
  console.log(`classes covered            : ${summary.identifierClasses.join(', ')}`);
  console.log('\nretained by design (declared, non-identifying):');
  for (const r of RETAINED) console.log(`  - ${r.klass}: ${r.why}`);
  console.log(`\nHITS IN PHASE SCOPE: ${hits.length}`);
  for (const h of hits) {
    console.log(`  ${h.classes.join('/')} via ${h.fields.join(',')} — ${h.value.slice(0, 48)}${h.value.length > 48 ? '…' : ''}`);
    for (const o of h.inPhaseScope) console.log(`      ${o}`);
  }
  console.log(`\nmatches OUTSIDE phase scope (declared, not a gate): ${outOfScope.length}`);
  for (const h of outOfScope) {
    console.log(`  ${h.classes.join('/')} — ${h.value.slice(0, 48)} in ${h.occurrences.length} file(s), e.g. ${h.occurrences[0]}`);
  }
  console.log(
    hits.length === 0
      ? '\nPASS — zero real provider identifiers (or identifier segments) in any Zoom-phase file.'
      : '\nFAIL'
  );
}

process.exit(hits.length === 0 ? 0 : 1);
