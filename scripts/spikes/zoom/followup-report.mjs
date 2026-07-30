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

import { loadSpikeEnv, zoomApi, destructiveZoomCall, makeRedactor } from './lib.mjs';

const env = loadSpikeEnv(process.cwd());
const redact = makeRedactor(env);

const meetingId = process.argv[2];
const meetingUuid = process.argv[3];

if (!meetingId) {
  console.error('Usage: node scripts/spikes/zoom/followup-report.mjs <meetingId> <meetingUuid>');
  process.exit(1);
}

// Zoom UUIDs are base64 and may contain `/` or start with `/`; those MUST be
// double-encoded. Ones without are safe either way — we double-encode uniformly
// because the production client cannot branch on the value it was handed.
const encodedUuid = encodeURIComponent(encodeURIComponent(meetingUuid));

function report(label, res) {
  console.log(`\n=== ${label} -> ${res.status} ===`);
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

// The live-state read comes first so the log shows what the meeting looked like
// before this script touched it.
report('GET /meetings/{id} (live state)', await zoomApi(env, 'GET', `/meetings/${meetingId}`));

// The one mutation in this script: ending the meeting so the past-meeting report
// materialises. It used to sit in the same table as the reads and go out through
// the generic dispatcher with no interlock at all (Sol R1 ②). Now it re-reads and
// proves the meeting's topic immediately before the PUT.
report(
  'PUT /meetings/{id}/status action=end',
  await destructiveZoomCall(env, meetingId, 'PUT', `/meetings/${meetingId}/status`, {
    body: { action: 'end' },
  })
);

const reads = [
  { label: 'GET /past_meetings/{uuid}', path: `/past_meetings/${encodedUuid}` },
  { label: 'GET /past_meetings/{uuid}/participants', path: `/past_meetings/${encodedUuid}/participants`, query: { page_size: 300 } },
  { label: 'GET /report/meetings/{uuid}/participants', path: `/report/meetings/${encodedUuid}/participants`, query: { page_size: 300, include_fields: 'registrant_id' } },
  { label: 'GET /report/meetings/{uuid}', path: `/report/meetings/${encodedUuid}` },
];

for (const call of reads) {
  report(call.label, await zoomApi(env, 'GET', call.path, { query: call.query }));
}
