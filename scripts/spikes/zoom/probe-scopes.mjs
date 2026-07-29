/**
 * Probes every Zoom endpoint this spike (and phases Z1b/Z4/Z5/Z7) depends on,
 * and reports which ones the S2S app is actually scoped for. Read-only.
 *
 * Why this exists as its own script: a missing granular scope surfaces as HTTP
 * 400 with `code: 4711` and a message naming the exact scope. Discovering those
 * one at a time costs a round trip to Brent each time; this collects them all in
 * one pass so the Marketplace edit is a single visit.
 *
 * It also doubles as the G2 evidence trail (item 5): the endpoints that COULD
 * plausibly carry disclaimer-consent evidence are probed here by name, so the
 * dossier can cite what was actually tried rather than an assumption.
 *
 * Usage: node scripts/spikes/zoom/probe-scopes.mjs <meetingId> [meetingUuid]
 */

import { loadSpikeEnv, zoomApi, makeRedactor } from './lib.mjs';

const env = loadSpikeEnv(process.cwd());
const redact = makeRedactor(env);

const meetingId = process.argv[2];
const meetingUuid = process.argv[3];
const host = encodeURIComponent(env.ZOOM_LICENSED_HOST_EMAIL);

/** `purpose` explains why the phase needs it; `g2` marks consent-evidence candidates. */
const probes = [
  { name: 'GET /users/{host}', path: `/users/${host}`, purpose: 'host inventory / license tier (§9)' },
  { name: 'GET /users/{host}/settings', path: `/users/${host}/settings`, purpose: 'disclaimer + recording settings read-back (§12, G2)', g2: true },
  { name: 'GET /accounts/me/settings', path: '/accounts/me/settings', purpose: 'account-level disclaimer lock + auto-recording audit (§18 drift check, G1/G2)', g2: true },
  { name: 'GET /users (list)', path: '/users', query: { page_size: 1 }, purpose: 'host_sync job (§9)' },
  { name: 'GET /users/{host}/token?type=zak', path: `/users/${host}/token`, query: { type: 'zak' }, purpose: 'ZAK at start-click (§5)' },
  { name: 'GET /meetings/{id}', path: `/meetings/${meetingId}`, purpose: 'effective-settings read-back (§8)' },
  { name: 'GET /users/{host}/meetings', path: `/users/${host}/meetings`, query: { page_size: 1 }, purpose: 'reconcile (§9)' },
  { name: 'GET /meetings/{id}/recordings', path: `/meetings/${meetingId}/recordings`, purpose: 'recording claim (§12 stage 2)' },
  { name: 'GET /meetings/{id}/recordings?include_fields=download_access_token', path: `/meetings/${meetingId}/recordings`, query: { include_fields: 'download_access_token', ttl: 3600 }, purpose: 'token re-fetch path (§12 stage 2, §20)' },
  { name: 'GET /report/meetings/{id}/participants', path: `/report/meetings/${meetingId}/participants`, query: { page_size: 300 }, purpose: 'customerKey + attendance (§12/Z7); consent-field candidate', g2: true },
  { name: 'GET /report/meetings/{id}', path: `/report/meetings/${meetingId}`, purpose: 'meeting detail report (Z7); consent-field candidate', g2: true },
  { name: 'GET /metrics/meetings/{id}/participants', path: `/metrics/meetings/${meetingId}/participants`, query: { type: 'past', page_size: 100 }, purpose: 'Dashboard participants — richest identity payload; consent-field candidate', g2: true },
  { name: 'GET /report/activities', path: '/report/activities', query: { page_size: 5 }, purpose: 'sign-in/out activity — consent-event candidate', g2: true },
  { name: 'GET /accounts/me/recordings', path: '/accounts/me/recordings', query: { page_size: 1, from: '2026-07-01', to: '2026-07-29' }, purpose: 'account-wide recording list (retention job)' },
  { name: 'PATCH /live_meetings/{id}/events (recording control)', path: `/live_meetings/${meetingId}/events`, method: 'PATCH', body: { method: 'recording.stop' }, purpose: 'stop-and-confirm mechanism (§12 late decline, item 4)' },
];

if (meetingUuid) {
  probes.push({
    name: 'GET /past_meetings/{uuid}/participants',
    path: `/past_meetings/${encodeURIComponent(meetingUuid)}/participants`,
    query: { page_size: 300 },
    purpose: 'past-meeting participants (customerKey verdict, item 2)',
    g2: true,
  });
  probes.push({
    name: 'GET /past_meetings/{uuid}',
    path: `/past_meetings/${encodeURIComponent(meetingUuid)}`,
    purpose: 'past-meeting detail (Z7)',
  });
}

const results = [];
for (const probe of probes) {
  const res = await zoomApi(env, probe.method ?? 'GET', probe.path, {
    query: probe.query,
    body: probe.body,
  });
  const code = res.body?.code;
  const message = res.body?.message ?? '';
  const missingScope = code === 4711 ? message.match(/scopes:\[(.*?)\]/)?.[1] ?? message : null;
  results.push({
    name: probe.name,
    purpose: probe.purpose,
    g2: Boolean(probe.g2),
    status: res.status,
    code: code ?? null,
    missingScope,
    message: missingScope ? null : message || null,
  });
}

const scopeBlocked = results.filter((r) => r.missingScope);
const ok = results.filter((r) => r.status >= 200 && r.status < 300);
const otherFail = results.filter((r) => !r.missingScope && (r.status < 200 || r.status >= 300));

console.log('=== SCOPED OK ===');
for (const r of ok) console.log(`  ${r.status}  ${r.name}`);

console.log('\n=== BLOCKED ON A MISSING SCOPE (Brent adds these in Marketplace) ===');
if (scopeBlocked.length === 0) console.log('  (none)');
for (const r of scopeBlocked) {
  console.log(`  ${r.status}  ${r.name}`);
  console.log(`        needs: ${r.missingScope}`);
  console.log(`        why  : ${r.purpose}`);
}

console.log('\n=== NON-SCOPE FAILURES (expected for some: no live meeting, no recording yet) ===');
for (const r of otherFail) {
  console.log(`  ${r.status}  ${r.name}  ${r.code ? `code=${r.code}` : ''} ${r.message ?? ''}`);
}

// De-duplicated scope list, ready to paste into the Marketplace scope search.
const uniqueScopes = [
  ...new Set(
    scopeBlocked.flatMap((r) =>
      (r.missingScope ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.endsWith(':admin'))
    )
  ),
].sort();
console.log('\n=== UNIQUE ADMIN SCOPES TO ADD ===');
for (const s of uniqueScopes) console.log(`  ${s}`);

console.log(`\n${redact(JSON.stringify({ probed: results.length, ok: ok.length, scopeBlocked: scopeBlocked.length }))}`);
