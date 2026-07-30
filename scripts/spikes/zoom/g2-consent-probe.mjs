/**
 * Item 5 — Gate G2: is the in-client recording-disclaimer consent event
 * retrievable? (results doc §9)
 *
 * §12 defines G2 as "verify consent events are retrievable via API or scheduled
 * portal export". G1 already FAILED (FNE is on Pro; disclaimer-text customization
 * and consent reporting need Business/Education/API/Enterprise with ≥100 licenses,
 * KB0068402), so §12's link-out backstop stays closed regardless of this result.
 * The point of this script is therefore NOT to change the outcome — it is to make
 * the verdict CITABLE: an enumerated list of what was actually requested and what
 * Zoom actually answered, so the dossier states a measured fact instead of an
 * inference from the pricing page.
 *
 * Every endpoint that could plausibly carry per-participant consent evidence is
 * probed by name against a meeting where a disclaimer WAS displayed and clicked.
 *
 * Usage: node scripts/spikes/zoom/g2-consent-probe.mjs <meetingId> <meetingUuid>
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { loadSpikeEnv, zoomApi, makeRedactor } from './lib.mjs';

const ROOT = process.cwd();
const env = loadSpikeEnv(ROOT);
const redact = makeRedactor(env);

const meetingId = process.argv[2];
const meetingUuid = process.argv[3];
const enc = meetingUuid ? encodeURIComponent(encodeURIComponent(meetingUuid)) : null;
const host = encodeURIComponent(env.ZOOM_LICENSED_HOST_EMAIL);

/**
 * Words that would indicate consent evidence if they appeared ANYWHERE in a
 * response body. Searched case-insensitively over the raw JSON so a nested or
 * undocumented field cannot be missed by only checking known key names.
 */
const CONSENT_MARKERS = [
  'consent',
  'consentimiento',
  'disclaimer',
  'agree',
  'acknowledg',
  'acceptance',
  'accepted_at',
  'recording_consent',
];

/**
 * A marker hit is NOT evidence on its own, and conflating the two would have made
 * this probe report a false PASS: the settings endpoints legitimately contain the
 * words "consent" and "disclaimer" as CONFIGURATION field names
 * (`recording_disclaimer`, `ask_participants_to_consent_disclaimer`). Knowing the
 * feature is switched on says nothing about whether a given person clicked it.
 *
 * G2 asks for retrievable per-participant consent EVENTS. That requires a marker
 * to appear on a record that identifies a person — so evidence is only counted
 * when a marker lands inside a participant-shaped row.
 */
function findParticipantConsentEvidence(body) {
  const rows = body?.participants ?? body?.activity_logs ?? body?.users ?? null;
  if (!Array.isArray(rows)) return { rowsInspected: 0, markersOnRows: [] };
  const markersOnRows = new Set();
  for (const row of rows) {
    const raw = JSON.stringify(row).toLowerCase();
    for (const m of CONSENT_MARKERS) if (raw.includes(m)) markersOnRows.add(m);
  }
  return { rowsInspected: rows.length, markersOnRows: [...markersOnRows] };
}

const attempts = [
  {
    name: 'GET /report/meetings/{uuid}/participants',
    why: 'the participants report — where customer_key does survive, so the natural place for a consent flag',
    path: enc && `/report/meetings/${enc}/participants`,
    query: { page_size: 300, include_fields: 'registrant_id' },
  },
  {
    name: 'GET /metrics/meetings/{uuid}/participants (Dashboard)',
    why: 'the richest per-participant identity payload Zoom exposes',
    path: enc && `/metrics/meetings/${enc}/participants`,
    query: { type: 'past', page_size: 100 },
  },
  {
    name: 'GET /metrics/meetings/{uuid}/participants?include_fields=registrant_id',
    why: 'same, asking explicitly for extra fields',
    path: enc && `/metrics/meetings/${enc}/participants`,
    query: { type: 'past', page_size: 100, include_fields: 'registrant_id' },
  },
  {
    name: 'GET /metrics/meetings/{uuid}',
    why: 'meeting-level dashboard record',
    path: enc && `/metrics/meetings/${enc}`,
    query: { type: 'past' },
  },
  {
    name: 'GET /report/meetings/{uuid}',
    why: 'meeting-level report record',
    path: enc && `/report/meetings/${enc}`,
  },
  {
    name: 'GET /past_meetings/{uuid}/participants',
    why: 'the non-report participants list — different field set from /report',
    path: enc && `/past_meetings/${enc}/participants`,
    query: { page_size: 300 },
  },
  {
    name: 'GET /meetings/{uuid}/recordings',
    why: 'the recording object itself — a consent marker could ride on the artifact',
    path: enc && `/meetings/${enc}/recordings`,
  },
  {
    name: 'GET /report/activities',
    why: 'account activity log — the only Zoom surface that records discrete user ACTIONS',
    path: '/report/activities',
    query: { from: '2026-07-29', to: '2026-07-30', page_size: 300 },
  },
  {
    name: 'GET /users/{host}/settings (recording section)',
    why: 'confirms the disclaimer WAS on, and whether any consent-reporting toggle exists to enable',
    path: `/users/${host}/settings`,
  },
  {
    name: 'GET /accounts/me/settings (recording section)',
    why: 'account-level disclaimer lock + any consent-reporting entitlement flag',
    path: '/accounts/me/settings',
  },
  {
    name: 'GET /report/cloud_recording',
    why: 'cloud-recording usage report — checked for a per-participant consent column',
    path: '/report/cloud_recording',
    query: { from: '2026-07-29', to: '2026-07-30' },
  },
  {
    name: 'GET /archive_files (archiving API)',
    why: "Zoom's archiving product is the one place consent-adjacent metadata is documented; checked for entitlement",
    path: '/archive_files',
    query: { from: '2026-07-29', to: '2026-07-30', page_size: 30 },
  },
  {
    name: 'GET /meetings/{id}/recordings/analytics_details',
    why: 'recording analytics — per-viewer records; checked for consent rows',
    path: meetingId && `/meetings/${meetingId}/recordings/analytics_details`,
    query: { from: '2026-07-29', to: '2026-07-30', type: 'by_view' },
  },
];

const findings = [];

for (const attempt of attempts) {
  if (!attempt.path) {
    findings.push({ ...attempt, skipped: 'no meeting id/uuid supplied' });
    continue;
  }
  // Method is a hard-coded literal, not `attempt.method`: this probe is read-only,
  // and dynamic-method dispatch is exactly how probe-scopes.mjs hid a
  // state-changing PATCH inside a table of reads (Sol R1 ②). The static interlock
  // test rejects any zoomApi call whose method it cannot read.
  const res = await zoomApi(env, 'GET', attempt.path, { query: attempt.query });
  const raw = JSON.stringify(res.body ?? {});
  const markersAnywhere = CONSENT_MARKERS.filter((m) => raw.toLowerCase().includes(m));
  const evidence = findParticipantConsentEvidence(res.body);
  const missingScope =
    res.body?.code === 4711 ? res.body.message?.match(/scopes:\[(.*?)\]/)?.[1] ?? res.body.message : null;
  // Zoom error messages can echo the account id — never print one unredacted.
  const message = missingScope ? null : res.body?.message ? redact(res.body.message) : null;

  findings.push({
    name: attempt.name,
    why: attempt.why,
    status: res.status,
    missingScope,
    zoomCode: res.body?.code ?? null,
    zoomMessage: message,
    markersAnywhereInBody: markersAnywhere,
    participantRowsInspected: evidence.rowsInspected,
    consentMarkersOnParticipantRows: evidence.markersOnRows,
    bodyKeys: res.status === 200 && res.body ? Object.keys(res.body).slice(0, 25) : [],
  });

  const verdict = missingScope
    ? `SCOPE-BLOCKED (${missingScope})`
    : res.status !== 200
      ? `HTTP ${res.status}${message ? ` — ${message}` : ''}`
      : evidence.markersOnRows.length > 0
        ? `200 — CONSENT EVIDENCE ON PARTICIPANT ROWS: ${evidence.markersOnRows.join(', ')}`
        : evidence.rowsInspected > 0
          ? `200 — ${evidence.rowsInspected} participant row(s), NO consent field on any of them`
          : markersAnywhere.length > 0
            ? `200 — no participant rows; marker words present only as CONFIG field names (${markersAnywhere.join(', ')}) — not evidence`
            : '200 — no participant rows, no consent field';
  console.log(`${attempt.name}\n    ${verdict}`);
}

// Surface the recording-settings picture explicitly: G2 hinges on whether a
// consent-reporting capability exists to be turned on at all.
const settings = findings.find((f) => f.name.includes('/users/{host}/settings'));
if (settings?.status === 200) {
  const res = await zoomApi(env, 'GET', `/users/${host}/settings`);
  const rec = res.body?.recording ?? {};
  console.log('\n=== recording settings actually in force ===');
  console.log(
    redact(
      JSON.stringify(
        {
          recording_disclaimer: rec.recording_disclaimer,
          ask_participants_to_consent_disclaimer: rec.ask_participants_to_consent_disclaimer,
          ask_host_to_confirm_disclaimer: rec.ask_host_to_confirm_disclaimer,
          cloud_recording: rec.cloud_recording,
          auto_recording: rec.auto_recording,
          recording_audio_transcript: rec.recording_audio_transcript,
        },
        null,
        2
      )
    )
  );
}

const anyEvidence = findings.some(
  (f) => f.status === 200 && f.consentMarkersOnParticipantRows?.length > 0
);
const scopeBlocked = findings.filter((f) => f.missingScope);

console.log('\n=== G2 SUMMARY ===');
console.log(`endpoints probed          : ${findings.filter((f) => !f.skipped).length}`);
console.log(`answered 200              : ${findings.filter((f) => f.status === 200).length}`);
console.log(`scope-blocked             : ${scopeBlocked.length}`);
console.log(`participant rows inspected : ${findings.reduce((n, f) => n + (f.participantRowsInspected ?? 0), 0)}`);
console.log(`per-participant CONSENT evidence: ${anyEvidence ? 'YES' : 'NO'}`);
const configOnly = findings.filter(
  (f) => f.status === 200 && (f.markersAnywhereInBody ?? []).length > 0 && !(f.consentMarkersOnParticipantRows ?? []).length
);
if (configOnly.length > 0) {
  console.log('\nmarker words present but as CONFIGURATION only (NOT evidence):');
  for (const f of configOnly) console.log(`  ${f.name} -> ${f.markersAnywhereInBody.join(', ')}`);
}
const entitlementBlocked = findings.filter((f) => !f.missingScope && f.status === 400 && /only available for|Not available for this account/i.test(f.zoomMessage ?? ''));
if (entitlementBlocked.length > 0) {
  console.log('\nENTITLEMENT-blocked (not a scope problem — the tier cannot use these at all):');
  for (const f of entitlementBlocked) console.log(`  ${f.name} -> ${f.zoomMessage}`);
}
if (scopeBlocked.length > 0) {
  console.log('\nscope-blocked endpoints (verdict is provisional until these are granted):');
  for (const f of scopeBlocked) console.log(`  ${f.name} -> ${f.missingScope}`);
}

mkdirSync(path.join(ROOT, 'scripts/spikes/zoom/out'), { recursive: true });
writeFileSync(
  path.join(ROOT, 'scripts/spikes/zoom/out/g2-result.json'),
  JSON.stringify(
    { capturedAt: new Date().toISOString(), meetingId, meetingUuid, findings, anyEvidence },
    null,
    2
  )
);
console.log('\nsaved scripts/spikes/zoom/out/g2-result.json (gitignored)');
