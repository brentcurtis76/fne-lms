/**
 * Item 2 — customerKey round-trip PoC (results doc §6, feeds Z7's matching
 * hierarchy and the plan §15 DoD "customerKey verdict").
 *
 * The question this answers: when the platform joins a participant through the
 * Meeting SDK and passes a `customerKey`, does that key come back out of the
 * past-meeting participants report — and what identity fields accompany it for a
 * signed-out guest versus a signed-in Zoom user? Z7's attendance matching is
 * designed as customerKey → registrant → email → name, and every rung of that
 * hierarchy needs evidence rather than an assumption.
 *
 * Method: two Playwright Chromium contexts with fake media join the same spike
 * meeting as license-free guests (exactly the school-user case), each with a
 * distinct customerKey in UUID-sans-hyphens form (§4). The meeting is then ended
 * from the API and both report endpoints are polled.
 *
 * Usage: node scripts/spikes/zoom/customer-key-poc.mjs [--hold-seconds N]
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

const args = process.argv.slice(2);
const holdSeconds = Number(
  args.includes('--hold-seconds') ? args[args.indexOf('--hold-seconds') + 1] : 75
);

const meeting = JSON.parse(
  readFileSync(path.join(ROOT, 'scripts/spikes/zoom/out/meeting-customerkey.json'), 'utf8')
);

// Safety interlock before anything else touches this meeting.
await assertSpikeMeeting(env, meeting.id);
console.log(`meeting ${meeting.id} confirmed as a spike meeting ("${meeting.topic}")`);

/** §4 format: UUID with the hyphens stripped. */
const customerKey = () => randomUUID().replace(/-/g, '');

const participants = [
  { label: 'A', userName: 'Prueba Spike Uno', customerKey: customerKey() },
  { label: 'B', userName: 'Prueba Spike Dos', customerKey: customerKey() },
];

// ---------------------------------------------------------------------------
// Serve the harness over http://127.0.0.1 — the Web SDK requires a secure
// context, and localhost counts as one.
// ---------------------------------------------------------------------------
const harnessHtml = readFileSync(
  path.join(ROOT, 'scripts/spikes/zoom/sdk-harness/index.html'),
  'utf8'
);
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(harnessHtml);
});
await new Promise((resolve) => server.listen(4180, '127.0.0.1', resolve));
console.log('harness server on http://127.0.0.1:4180');

const browser = await chromium.launch({
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

const sessions = [];
for (const p of participants) {
  const context = await browser.newContext({
    permissions: ['camera', 'microphone'],
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  page.on('console', (msg) => {
    const text = msg.text();
    if (/error|fail|denied/i.test(text)) console.log(`  [${p.label}] console: ${text.slice(0, 200)}`);
  });

  const signature = signSdkJwt(env, { meetingNumber: meeting.id, role: 0 });
  const url = new URL('http://127.0.0.1:4180/');
  url.searchParams.set('mn', String(meeting.id));
  url.searchParams.set('pwd', meeting.password ?? '');
  url.searchParams.set('name', p.userName);
  url.searchParams.set('customerKey', p.customerKey);
  url.searchParams.set('signature', signature);
  url.searchParams.set('sdkKey', env.ZOOM_SDK_CLIENT_ID);

  console.log(`[${p.label}] joining as "${p.userName}" (customerKey ${p.customerKey.slice(0, 8)}…)`);
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  sessions.push({ ...p, context, page });
}

// Wait for each to reach a terminal state.
for (const s of sessions) {
  try {
    await s.page.waitForFunction(
      () => ['joined', 'error'].includes(window.__spike?.state),
      undefined,
      { timeout: 90_000 }
    );
  } catch {
    console.log(`[${s.label}] timed out before reaching a terminal state`);
  }
  const result = await s.page.evaluate(() => window.__spike);
  s.result = result;
  console.log(
    `[${s.label}] state=${result?.state} timeToJoinMs=${result?.timeToJoinMs ?? 'n/a'}${
      result?.error ? ` error=${String(result.error).slice(0, 400)}` : ''
    }`
  );
}

const anyJoined = sessions.some((s) => s.result?.state === 'joined');
if (!anyJoined) {
  console.log('\nNO PARTICIPANT JOINED — capturing SDK event trail for diagnosis:');
  for (const s of sessions) {
    console.log(`  [${s.label}]`, redact(JSON.stringify(s.result?.events ?? [], null, 2)));
  }
} else {
  console.log(`\nboth contexts settled; holding the meeting open ${holdSeconds}s`);
  await new Promise((r) => setTimeout(r, holdSeconds * 1000));
}

// Snapshot the LIVE participants view before ending — this is the only place a
// live meeting's identity fields can be observed.
const live = await zoomApi(env, 'GET', `/metrics/meetings/${meeting.id}/participants`, {
  query: { type: 'live', page_size: 100 },
});
console.log(`\nGET /metrics/.../participants?type=live -> ${live.status}`);

await browser.close();
server.close();

// End the meeting so the past-meeting report materialises.
const ended = await zoomApi(env, 'PUT', `/meetings/${meeting.id}/status`, {
  body: { action: 'end' },
});
console.log(`PUT /meetings/{id}/status action=end -> ${ended.status}`);

/**
 * Zoom's reports are eventually consistent — a just-ended meeting commonly 404s
 * for a minute or two. Poll rather than concluding "no data".
 */
async function pollReport(label, apiPath, query) {
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const res = await zoomApi(env, 'GET', apiPath, { query });
    if (res.status === 200) {
      console.log(`${label} -> 200 after ${attempt} attempt(s)`);
      return res;
    }
    if (attempt === 12) {
      console.log(`${label} -> ${res.status} after ${attempt} attempts (giving up)`);
      return res;
    }
    await new Promise((r) => setTimeout(r, 15_000));
  }
  return null;
}

const uuid = meeting.uuid;
const encodedUuid = encodeURIComponent(encodeURIComponent(uuid));

const pastParticipants = await pollReport(
  'GET /past_meetings/{uuid}/participants',
  `/past_meetings/${encodedUuid}/participants`,
  { page_size: 300 }
);
const reportParticipants = await pollReport(
  'GET /report/meetings/{uuid}/participants',
  `/report/meetings/${encodedUuid}/participants`,
  { page_size: 300, include_fields: 'registrant_id' }
);

const out = {
  capturedAt: new Date().toISOString(),
  meetingId: meeting.id,
  meetingUuid: uuid,
  sent: participants.map((p) => ({
    label: p.label,
    userName: p.userName,
    customerKey: p.customerKey,
  })),
  joinResults: sessions.map((s) => ({
    label: s.label,
    state: s.result?.state,
    timeToJoinMs: s.result?.timeToJoinMs,
    error: s.result?.error,
    events: s.result?.events,
  })),
  liveMetrics: { status: live.status, body: live.body },
  pastMeetingParticipants: { status: pastParticipants?.status, body: pastParticipants?.body },
  reportParticipants: { status: reportParticipants?.status, body: reportParticipants?.body },
};

mkdirSync(path.join(ROOT, 'scripts/spikes/zoom/out'), { recursive: true });
const file = path.join(ROOT, 'scripts/spikes/zoom/out/customer-key-result.json');
writeFileSync(file, JSON.stringify(out, null, 2));
console.log(`\nsaved ${path.relative(ROOT, file)} (gitignored)`);

// Print the verdict-shaped summary.
console.log('\n=== customerKey survival ===');
for (const source of ['pastMeetingParticipants', 'reportParticipants']) {
  const body = out[source].body;
  const rows = body?.participants ?? [];
  console.log(`\n-- ${source} (status ${out[source].status}, ${rows.length} row(s)) --`);
  for (const row of rows) {
    console.log(
      redact(
        JSON.stringify({
          name: row.name,
          user_email: row.user_email ?? row.email ?? null,
          customer_key: row.customer_key ?? null,
          participant_user_id: row.participant_user_id ?? null,
          participant_uuid: row.participant_uuid ?? null,
          id: row.id ?? null,
          user_id: row.user_id ?? null,
          registrant_id: row.registrant_id ?? null,
          status: row.status ?? null,
          duration: row.duration ?? null,
        })
      )
    );
  }
}
