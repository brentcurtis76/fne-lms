/**
 * Creates one spike meeting under the licensed host. Spike-only.
 *
 * Every meeting this spike creates is named `PRUEBA SPIKE — no unirse` — the
 * safety interlock in `lib.mjs` (`assertSpikeMeeting`) refuses to issue a
 * destructive call against anything whose topic does not start with
 * "PRUEBA SPIKE", so the naming convention is load-bearing, not cosmetic.
 *
 * Provisioning mirrors the plan's rules, not Zoom's defaults:
 *  - `auto_recording:'none'` ALWAYS (§8/§12: recording is never enabled at
 *    provision; it is turned on later only by the consent-gated PATCH)
 *  - Chile wall-clock + `timezone:'America/Santiago'` (§10 — never UTC-converted
 *    client-side)
 *  - `waiting_room:false`; `join_before_host` per the surface being modelled
 *
 * Usage:
 *   node scripts/spikes/zoom/create-meeting.mjs [--jbh] [--minutes N] [--label TEXT]
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { loadSpikeEnv, zoomApi, makeRedactor, SPIKE_MEETING_TOPIC } from './lib.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};

const env = loadSpikeEnv(process.cwd());
const redact = makeRedactor(env);

const joinBeforeHost = flag('--jbh');
const durationMinutes = Number(value('--minutes', '30'));
const label = value('--label', 'generic');

/**
 * Chile wall-clock, a couple of minutes out. Zoom is told the wall-clock plus
 * the zone name — we never send a UTC instant (§10).
 */
function chileWallClockInMinutes(minutes) {
  const target = new Date(Date.now() + minutes * 60_000);
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(target);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}

const body = {
  topic: SPIKE_MEETING_TOPIC,
  agenda: `Z0B-2 spike (${label}) — contenido sintético, no unirse.`,
  type: 2,
  start_time: chileWallClockInMinutes(2),
  timezone: 'America/Santiago',
  duration: durationMinutes,
  settings: {
    // §8/§12 invariant: provisioning NEVER enables recording.
    auto_recording: 'none',
    join_before_host: joinBeforeHost,
    waiting_room: false,
    // §5: never "authenticated users only" — it would block license-free SDK guests.
    meeting_authentication: false,
    approval_type: 2, // no registration
    host_video: false,
    participant_video: false,
    mute_upon_entry: true,
  },
};

// interlock-exempt(create): the ONLY non-GET Zoom request in this spike that does
// not route through `destructiveZoomCall`, and the only one that cannot. The
// interlock proves a meeting's topic before mutating it; there is no meeting here
// yet — this call is what creates it, and it creates it WITH the `PRUEBA SPIKE`
// topic that every later interlock check depends on. It touches no existing Zoom
// state. The exemption is pinned by name in
// `__tests__/scripts/zoom-spike-interlock.test.ts`, so a second one cannot be
// added without the test going red.
const res = await zoomApi(env, 'POST', `/users/${encodeURIComponent(env.ZOOM_LICENSED_HOST_EMAIL)}/meetings`, {
  body,
});

if (res.status !== 201) {
  console.error(`CREATE FAILED ${res.status}`);
  console.error(redact(res.body));
  process.exit(1);
}

const m = res.body;

// The effective-settings read-back the plan requires: Zoom reflects effective
// values here on capability/settings mismatch, so this is where settings drift
// (e.g. an account forcing recording on) would show up.
const effective = m.settings ?? {};

const out = {
  label,
  createdAt: new Date().toISOString(),
  id: m.id,
  uuid: m.uuid,
  topic: m.topic,
  status: m.status,
  start_time: m.start_time,
  timezone: m.timezone,
  duration: m.duration,
  host_id: m.host_id,
  host_email: m.host_email,
  password: m.password,
  encrypted_password: m.encrypted_password,
  join_url: m.join_url,
  effective: {
    auto_recording: effective.auto_recording,
    join_before_host: effective.join_before_host,
    waiting_room: effective.waiting_room,
    meeting_authentication: effective.meeting_authentication,
    approval_type: effective.approval_type,
  },
};

mkdirSync(path.join(process.cwd(), 'scripts/spikes/zoom/out'), { recursive: true });
const file = path.join(process.cwd(), 'scripts/spikes/zoom/out', `meeting-${label}.json`);
writeFileSync(file, JSON.stringify(out, null, 2));

console.log(`created meeting ${out.id} (${label})`);
console.log(`  topic            : ${out.topic}`);
console.log(`  start_time       : ${out.start_time} ${out.timezone}`);
console.log(`  effective        : ${JSON.stringify(out.effective)}`);
console.log(`  auto_recording   : ${out.effective.auto_recording}  <- must be "none" at provision`);
console.log(`  passcode present : ${Boolean(out.password)}`);
console.log(`  saved            : ${path.relative(process.cwd(), file)} (gitignored)`);
