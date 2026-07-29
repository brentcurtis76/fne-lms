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

const attempts = [
  {
    name: 'GET /report/meetings/{uuid}/participants',
    why: 'the participants report — where customer_key does survive, so the natural place for a consent flag',
    method: 'GET',
    path: enc && `/report/meetings/${enc}/participants`,
    query: { page_size: 300, include_fields: 'registrant_id' },
  },
  {
    name: 'GET /metrics/meetings/{uuid}/participants (Dashboard)',
    why: 'the richest per-participant identity payload Zoom exposes',
    method: 'GET',
    path: enc && `/metrics/meetings/${enc}/participants`,
    query: { type: 'past', page_size: 100 },
  },
  {
    name: 'GET /metrics/meetings/{uuid}/participants?include_fields=registrant_id',
    why: 'same, asking explicitly for extra fields',
    method: 'GET',
    path: enc && `/metrics/meetings/${enc}/participants`,
    query: { type: 'past', page_size: 100, include_fields: 'registrant_id' },
  },
  {
    name: 'GET /metrics/meetings/{uuid}',
    why: 'meeting-level dashboard record',
    method: 'GET',
    path: enc && `/metrics/meetings/${enc}`,
    query: { type: 'past' },
  },
  {
    name: 'GET /report/meetings/{uuid}',
    why: 'meeting-level report record',
    method: 'GET',
    path: enc && `/report/meetings/${enc}`,
  },
  {
    name: 'GET /past_meetings/{uuid}/participants',
    why: 'the non-report participants list — different field set from /report',
    method: 'GET',
    path: enc && `/past_meetings/${enc}/participants`,
    query: { page_size: 300 },
  },
  {
    name: 'GET /meetings/{uuid}/recordings',
    why: 'the recording object itself — a consent marker could ride on the artifact',
    method: 'GET',
    path: enc && `/meetings/${enc}/recordings`,
  },
  {
    name: 'GET /report/activities',
    why: 'account activity log — the only Zoom surface that records discrete user ACTIONS',
    method: 'GET',
    path: '/report/activities',
    query: { from: '2026-07-29', to: '2026-07-30', page_size: 300 },
  },
  {
    name: 'GET /users/{host}/settings (recording section)',
    why: 'confirms the disclaimer WAS on, and whether any consent-reporting toggle exists to enable',
    method: 'GET',
    path: `/users/${host}/settings`,
  },
  {
    name: 'GET /accounts/me/settings (recording section)',
    why: 'account-level disclaimer lock + any consent-reporting entitlement flag',
    method: 'GET',
    path: '/accounts/me/settings',
  },
  {
    name: 'GET /report/cloud_recording',
    why: 'cloud-recording usage report — checked for a per-participant consent column',
    method: 'GET',
    path: '/report/cloud_recording',
    query: { from: '2026-07-29', to: '2026-07-30' },
  },
  {
    name: 'GET /archive_files (archiving API)',
    why: "Zoom's archiving product is the one place consent-adjacent metadata is documented; checked for entitlement",
    method: 'GET',
    path: '/archive_files',
    query: { from: '2026-07-29', to: '2026-07-30', page_size: 30 },
  },
  {
    name: 'GET /meetings/{id}/recordings/analytics_details',
    why: 'recording analytics — per-viewer records; checked for consent rows',
    method: 'GET',
    path: meetingId && `/meetings/${meetingId}/recordings/analytics_details`,
    query: { from: '2026-07-29', to: '2026-07-30' },
  },
];

const findings = [];

for (const attempt of attempts) {
  if (!attempt.path) {
    findings.push({ ...attempt, skipped: 'no meeting id/uuid supplied' });
    continue;
  }
  const res = await zoomApi(env, attempt.method, attempt.path, { query: attempt.query });
  const raw = JSON.stringify(res.body ?? {});
  const markersFound = CONSENT_MARKERS.filter((m) => raw.toLowerCase().includes(m));
  const missingScope =
    res.body?.code === 4711 ? res.body.message?.match(/scopes:\[(.*?)\]/)?.[1] ?? res.body.message : null;

  findings.push({
    name: attempt.name,
    why: attempt.why,
    status: res.status,
    missingScope,
    zoomCode: res.body?.code ?? null,
    zoomMessage: missingScope ? null : (res.body?.message ?? null),
    consentMarkersFound: markersFound,
    bodyKeys: res.status === 200 && res.body ? Object.keys(res.body).slice(0, 25) : [],
  });

  const verdict = missingScope
    ? `SCOPE-BLOCKED (${missingScope})`
    : res.status !== 200
      ? `HTTP ${res.status}${res.body?.message ? ` — ${res.body.message}` : ''}`
      : markersFound.length > 0
        ? `200 — CONSENT MARKERS PRESENT: ${markersFound.join(', ')}`
        : '200 — no consent field anywhere in the payload';
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

const anyEvidence = findings.some((f) => f.status === 200 && f.consentMarkersFound.length > 0);
const scopeBlocked = findings.filter((f) => f.missingScope);

console.log('\n=== G2 SUMMARY ===');
console.log(`endpoints probed          : ${findings.filter((f) => !f.skipped).length}`);
console.log(`answered 200              : ${findings.filter((f) => f.status === 200).length}`);
console.log(`scope-blocked             : ${scopeBlocked.length}`);
console.log(`any consent evidence found: ${anyEvidence ? 'YES' : 'NO'}`);
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
