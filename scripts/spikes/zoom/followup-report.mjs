/**
 * Re-reads a finished spike meeting after Zoom's reports have settled.
 *
 * The customerKey PoC polls immediately after ending the meeting, which catches
 * rows still marked `status: "in_meeting"`. Zoom's reporting is eventually
 * consistent, so the FINAL row shape (leave_time, terminal status) is only
 * visible on a later read — and the difference between those two reads is itself
 * something Z7's reconcile job has to tolerate.
 *
 * Usage: node scripts/spikes/zoom/followup-report.mjs <meetingId> <meetingUuid>
 */

import { loadSpikeEnv, zoomApi, makeRedactor } from './lib.mjs';

const env = loadSpikeEnv(process.cwd());
const redact = makeRedactor(env);

const meetingId = process.argv[2];
const meetingUuid = process.argv[3];

// Zoom UUIDs are base64 and may contain `/` or start with `/`; those MUST be
// double-encoded. Ones without are safe either way — we double-encode uniformly
// because the production client cannot branch on the value it was handed.
const encodedUuid = encodeURIComponent(encodeURIComponent(meetingUuid));

const calls = [
  { label: 'GET /meetings/{id} (live state)', method: 'GET', path: `/meetings/${meetingId}` },
  { label: 'PUT /meetings/{id}/status action=end', method: 'PUT', path: `/meetings/${meetingId}/status`, body: { action: 'end' } },
  { label: 'GET /past_meetings/{uuid}', method: 'GET', path: `/past_meetings/${encodedUuid}` },
  { label: 'GET /past_meetings/{uuid}/participants', method: 'GET', path: `/past_meetings/${encodedUuid}/participants`, query: { page_size: 300 } },
  { label: 'GET /report/meetings/{uuid}/participants', method: 'GET', path: `/report/meetings/${encodedUuid}/participants`, query: { page_size: 300, include_fields: 'registrant_id' } },
  { label: 'GET /report/meetings/{uuid}', method: 'GET', path: `/report/meetings/${encodedUuid}` },
];

for (const call of calls) {
  const res = await zoomApi(env, call.method, call.path, { query: call.query, body: call.body });
  console.log(`\n=== ${call.label} -> ${res.status} ===`);
  if (res.status === 200 || res.status === 204) {
    const body = res.body ?? {};
    if (Array.isArray(body.participants)) {
      for (const row of body.participants) {
        console.log(redact(JSON.stringify(row)));
      }
    } else {
      // Trim the noisy settings blob on meeting detail reads.
      const { settings, ...rest } = body;
      console.log(redact(JSON.stringify(rest, null, 2)).slice(0, 1400));
    }
  } else {
    console.log(redact(JSON.stringify(res.body)));
  }
}
