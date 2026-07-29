/**
 * Item 4 — recording start/stop control verification (results doc §8; feeds the
 * §12 consent gating and the late-decline flow that Z4/Z5 build).
 *
 * Part (a) — the enablement PATCH, read-back confirmed.
 *   §12 requires that recording is "enabled (single PATCH, response read back and
 *   confirmed) only once every expected participant has an `accepted` row". That
 *   wording only means something if we know what the PATCH actually returns, so
 *   this measures: the provisioned value, the PATCH's status and body, and the
 *   effective value on a subsequent GET. If the PATCH returns no body, read-back
 *   is not a belt-and-braces nicety — it is the ONLY confirmation available, and
 *   the plan's insistence on it is load-bearing.
 *
 * Part (b) — the stop mechanism (run with --stop against a LIVE recording).
 *   §12 leaves open "Zoom live-meeting control API vs facilitator SDK action +
 *   webhook confirmation". This exercises the Live Meeting Controls API
 *   (PATCH /live_meetings/{id}/events, scope meeting:update:in_meeting_controls)
 *   and reports exactly what it answers, so the late-decline design rests on a
 *   measured mechanism.
 *
 * Usage:
 *   node scripts/spikes/zoom/recording-control.mjs                # part (a)
 *   node scripts/spikes/zoom/recording-control.mjs --stop <mId>   # part (b)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { loadSpikeEnv, zoomApi, makeRedactor, assertSpikeMeeting } from './lib.mjs';

const ROOT = process.cwd();
const env = loadSpikeEnv(ROOT);
const redact = makeRedactor(env);
const args = process.argv.slice(2);

/** Reads back only the fields the consent gate cares about. */
async function readEffective(meetingId) {
  const res = await zoomApi(env, 'GET', `/meetings/${meetingId}`);
  return {
    status: res.status,
    auto_recording: res.body?.settings?.auto_recording ?? null,
    meetingStatus: res.body?.status ?? null,
  };
}

if (args.includes('--stop')) {
  // ------------------------------------------------------------------ part (b)
  const meetingId = args[args.indexOf('--stop') + 1];
  await assertSpikeMeeting(env, meetingId);
  console.log(`meeting ${meetingId} confirmed as a spike meeting`);

  for (const method of ['recording.stop', 'recording.pause', 'recording.resume', 'recording.start']) {
    const res = await zoomApi(env, 'PATCH', `/live_meetings/${meetingId}/events`, {
      body: { method },
    });
    console.log(`PATCH /live_meetings/{id}/events {method:"${method}"} -> ${res.status}`);
    if (res.body) console.log(`   body: ${redact(JSON.stringify(res.body))}`);
    // Only probe further methods if the first one told us something useful.
    if (method === 'recording.stop' && res.status >= 200 && res.status < 300) break;
  }
  process.exit(0);
}

// -------------------------------------------------------------------- part (a)
const meetingFile = path.join(ROOT, 'scripts/spikes/zoom/out/meeting-control.json');
let meeting;
try {
  meeting = JSON.parse(readFileSync(meetingFile, 'utf8'));
} catch {
  console.error('Create the control meeting first:');
  console.error('  node scripts/spikes/zoom/create-meeting.mjs --minutes 30 --label control');
  process.exit(1);
}

await assertSpikeMeeting(env, meeting.id);
console.log(`meeting ${meeting.id} confirmed as a spike meeting ("${meeting.topic}")\n`);

const trail = [];

// 1. Provisioned state — must be 'none' per §8.
const provisioned = await readEffective(meeting.id);
console.log(`1. provisioned effective auto_recording = ${JSON.stringify(provisioned.auto_recording)}`);
console.log(`   (§8 invariant: MUST be "none" — recording is never enabled at provision)`);
trail.push({ step: 'provisioned', ...provisioned });

// 2. The consent-gated enablement PATCH.
const patch = await zoomApi(env, 'PATCH', `/meetings/${meeting.id}`, {
  body: { settings: { auto_recording: 'cloud' } },
});
const patchBodyShape =
  patch.body === null ? 'EMPTY (no body)' : `${typeof patch.body}: ${JSON.stringify(patch.body).slice(0, 200)}`;
console.log(`\n2. PATCH /meetings/{id} settings.auto_recording="cloud" -> ${patch.status}`);
console.log(`   response body: ${patchBodyShape}`);
console.log(`   content-type : ${patch.headers['content-type'] ?? '(none)'}`);
trail.push({ step: 'patch', status: patch.status, bodyShape: patchBodyShape });

// 3. Read-back — the actual confirmation.
const afterEnable = await readEffective(meeting.id);
console.log(`\n3. read-back effective auto_recording = ${JSON.stringify(afterEnable.auto_recording)}`);
console.log(
  `   confirmed: ${afterEnable.auto_recording === 'cloud' ? 'YES — enablement took effect' : 'NO — settings drift or capability refusal'}`
);
trail.push({ step: 'readback-after-enable', ...afterEnable });

// 4. And back off again — the decline path must be able to reverse it.
const patchOff = await zoomApi(env, 'PATCH', `/meetings/${meeting.id}`, {
  body: { settings: { auto_recording: 'none' } },
});
const afterDisable = await readEffective(meeting.id);
console.log(`\n4. PATCH back to "none" -> ${patchOff.status}; read-back = ${JSON.stringify(afterDisable.auto_recording)}`);
trail.push({ step: 'readback-after-disable', patchStatus: patchOff.status, ...afterDisable });

// 5. Does Zoom accept a nonsense value, or reject it? Determines whether the
//    read-back can ever disagree with what we asked for.
const patchBogus = await zoomApi(env, 'PATCH', `/meetings/${meeting.id}`, {
  body: { settings: { auto_recording: 'not_a_real_value' } },
});
const afterBogus = await readEffective(meeting.id);
console.log(
  `\n5. PATCH with an invalid value -> ${patchBogus.status}; read-back = ${JSON.stringify(afterBogus.auto_recording)}`
);
if (patchBogus.body) console.log(`   body: ${redact(JSON.stringify(patchBogus.body)).slice(0, 200)}`);
trail.push({ step: 'invalid-value', patchStatus: patchBogus.status, ...afterBogus });

mkdirSync(path.join(ROOT, 'scripts/spikes/zoom/out'), { recursive: true });
writeFileSync(
  path.join(ROOT, 'scripts/spikes/zoom/out/recording-control-result.json'),
  JSON.stringify({ capturedAt: new Date().toISOString(), meetingId: meeting.id, trail }, null, 2)
);
console.log('\nsaved scripts/spikes/zoom/out/recording-control-result.json (gitignored)');
