/**
 * Item 4(b) — the stop-and-confirm mechanism (results doc §8).
 *
 * §12's late-decline path says: "join credentials are HELD; the platform signals
 * the facilitator to stop the recording and issues the credentials only after the
 * stop is CONFIRMED (recording-stopped webhook / recording status read-back)". The
 * plan explicitly left the mechanism open — "Zoom live-meeting control API vs
 * facilitator SDK action + webhook confirmation" — for this spike to settle.
 *
 * Two questions, both answered by measurement:
 *   1. Can the platform stop a running cloud recording SERVER-SIDE, with no
 *      facilitator action? (Live Meeting Controls: PATCH /live_meetings/{id}/events)
 *   2. Is there any READ-BACK of live recording state, or is the webhook the only
 *      possible confirmation? This decides whether the late-decline flow can be
 *      built on polling at all, or whether it is webhook-dependent by necessity.
 *
 * Usage: node scripts/spikes/zoom/stop-confirm.mjs
 */

import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { chromium } from 'playwright';
import { loadSpikeEnv, zoomApi, signSdkJwt, makeRedactor, assertSpikeMeeting } from './lib.mjs';

const ROOT = process.cwd();
const env = loadSpikeEnv(ROOT);
const redact = makeRedactor(env);

const meeting = JSON.parse(
  readFileSync(path.join(ROOT, 'scripts/spikes/zoom/out/meeting-stopctl.json'), 'utf8')
);
await assertSpikeMeeting(env, meeting.id);
console.log(`meeting ${meeting.id} confirmed as a spike meeting`);

// Enable recording (consent-gated PATCH), read-back confirmed.
await zoomApi(env, 'PATCH', `/meetings/${meeting.id}`, { body: { settings: { auto_recording: 'cloud' } } });
const effective = (await zoomApi(env, 'GET', `/meetings/${meeting.id}`)).body?.settings?.auto_recording;
console.log(`recording enabled; read-back effective = ${JSON.stringify(effective)}`);
if (effective !== 'cloud') process.exit(1);

const zak = (
  await zoomApi(env, 'GET', `/users/${encodeURIComponent(env.ZOOM_LICENSED_HOST_EMAIL)}/token`, {
    query: { type: 'zak' },
  })
).body?.token;

const harnessHtml = readFileSync(path.join(ROOT, 'scripts/spikes/zoom/sdk-harness/index.html'), 'utf8');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(harnessHtml);
});
await new Promise((r) => server.listen(4182, '127.0.0.1', r));

const browser = await chromium.launch({
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});

async function join({ userName, role, withZak }) {
  const context = await browser.newContext({ permissions: ['camera', 'microphone'] });
  const page = await context.newPage();
  const url = new URL('http://127.0.0.1:4182/');
  url.searchParams.set('mn', String(meeting.id));
  url.searchParams.set('pwd', meeting.password ?? '');
  url.searchParams.set('name', userName);
  url.searchParams.set('customerKey', randomUUID().replace(/-/g, ''));
  url.searchParams.set('signature', signSdkJwt(env, { meetingNumber: meeting.id, role }));
  url.searchParams.set('sdkKey', env.ZOOM_SDK_CLIENT_ID);
  if (withZak) url.searchParams.set('zak', zak);
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  return page;
}

/** Clicks whatever consent control the disclaimer offers, in either language. */
async function acceptDisclaimer(page, label) {
  const patterns = /continuar|aceptar|de acuerdo|lo tengo|got it|i agree|continue|entiendo/i;
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    const buttons = page.locator('button:visible');
    const count = await buttons.count();
    for (let i = 0; i < count; i += 1) {
      const text = ((await buttons.nth(i).textContent()) ?? '').trim();
      if (text && patterns.test(text)) {
        await buttons.nth(i).click({ timeout: 4000 }).catch(() => {});
        console.log(`  [${label}] consent clicked: "${text}"`);
        return text;
      }
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  return null;
}

const hostPage = await join({ userName: 'Anfitrion Spike', role: 1, withZak: true });
await acceptDisclaimer(hostPage, 'HOST');
await new Promise((r) => setTimeout(r, 6000));
const guestPage = await join({ userName: 'Invitada Spike', role: 0, withZak: false });
await acceptDisclaimer(guestPage, 'GUEST');
await new Promise((r) => setTimeout(r, 4000));
await acceptDisclaimer(guestPage, 'GUEST/post-join');

const hostState = await hostPage.evaluate(() => window.__spike?.state);
const guestState = await guestPage.evaluate(() => window.__spike?.state);
console.log(`host=${hostState} guest=${guestState}`);

console.log('\nrecording for 60s before attempting a server-side stop…');
await new Promise((r) => setTimeout(r, 60_000));

const trail = [];

// Q2 first: is there ANY read-back of live recording state?
console.log('\n=== Q2: read-back of live recording state ===');
const readbackProbes = [
  { name: 'GET /meetings/{id} (status field)', path: `/meetings/${meeting.id}` },
  { name: 'GET /live_meetings/{id}', path: `/live_meetings/${meeting.id}` },
  { name: 'GET /live_meetings/{id}/events', path: `/live_meetings/${meeting.id}/events` },
  { name: 'GET /metrics/meetings/{id} (live)', path: `/metrics/meetings/${meeting.id}`, query: { type: 'live' } },
];
for (const probe of readbackProbes) {
  const res = await zoomApi(env, 'GET', probe.path, { query: probe.query });
  const recordingHint = JSON.stringify(res.body ?? {}).toLowerCase().includes('record');
  console.log(`  ${probe.name} -> ${res.status}${res.status === 200 ? ` (mentions "record": ${recordingHint})` : ` ${res.body?.message ?? ''}`}`);
  trail.push({ phase: 'readback-probe', name: probe.name, status: res.status, mentionsRecord: recordingHint, message: res.body?.message ?? null });
}

// Q1: the server-side stop.
console.log('\n=== Q1: server-side stop via Live Meeting Controls ===');
await assertSpikeMeeting(env, meeting.id);
const stop = await zoomApi(env, 'PATCH', `/live_meetings/${meeting.id}/events`, {
  body: { method: 'recording.stop' },
});
console.log(`  PATCH /live_meetings/{id}/events {method:"recording.stop"} -> ${stop.status}`);
if (stop.body) console.log(`    body: ${redact(JSON.stringify(stop.body))}`);
trail.push({ phase: 'stop', status: stop.status, body: stop.body });

await new Promise((r) => setTimeout(r, 15_000));

// Can it be restarted? Relevant because a withdrawn-then-reinstated consent, or a
// mistaken stop, needs a defined recovery.
const start = await zoomApi(env, 'PATCH', `/live_meetings/${meeting.id}/events`, {
  body: { method: 'recording.start' },
});
console.log(`  PATCH … {method:"recording.start"} -> ${start.status}`);
if (start.body) console.log(`    body: ${redact(JSON.stringify(start.body))}`);
trail.push({ phase: 'restart', status: start.status, body: start.body });

await new Promise((r) => setTimeout(r, 10_000));
const stop2 = await zoomApi(env, 'PATCH', `/live_meetings/${meeting.id}/events`, {
  body: { method: 'recording.stop' },
});
console.log(`  PATCH … {method:"recording.stop"} again -> ${stop2.status}`);
trail.push({ phase: 'stop-again', status: stop2.status, body: stop2.body });

const liveUuid = (await zoomApi(env, 'GET', `/meetings/${meeting.id}`)).body?.uuid;

await browser.close();
server.close();

mkdirSync(path.join(ROOT, 'scripts/spikes/zoom/out'), { recursive: true });
writeFileSync(
  path.join(ROOT, 'scripts/spikes/zoom/out/stop-confirm-result.json'),
  JSON.stringify({ capturedAt: new Date().toISOString(), meetingId: meeting.id, liveUuid, hostState, guestState, trail }, null, 2)
);
console.log(`\nsaved scripts/spikes/zoom/out/stop-confirm-result.json (gitignored)`);
console.log(`meeting ${meeting.id} · uuid ${liveUuid}`);
