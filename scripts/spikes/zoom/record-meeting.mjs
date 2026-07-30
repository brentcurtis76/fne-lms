/**
 * Drives a real recorded spike meeting so the recording round trip (item 3),
 * gate G2 (item 5) and the stop-and-confirm mechanism (item 4b) have something
 * to work against. Spike-only; all content is synthetic (Chromium's fake media
 * device supplies a test pattern and a tone — real bytes, no real audio).
 *
 * Shape of the run, deliberately mirroring the plan's consent sequence:
 *   1. meeting is provisioned with auto_recording:'none' (§8)
 *   2. recording is enabled by the consent-gated PATCH, read-back confirmed (§12)
 *   3. a LICENSED HOST joins via SDK with role:1 + ZAK — cloud recording requires
 *      a Licensed host actually present (§20), so a guest-only meeting cannot
 *      produce a recording no matter what auto_recording says
 *   4. a guest joins role:0 — this is the participant whose disclaimer click is
 *      the G2 evidence we then try to retrieve
 *   5. both hold the meeting open, then leave
 *
 * The recording disclaimer is ON and locked at account level, so the SDK shows a
 * consent dialog. Whatever it renders is captured (text + the control that was
 * clicked) — that capture IS the G2 input: we know a human-equivalent click
 * happened, so the question becomes purely whether Zoom will hand that fact back.
 *
 * Usage: node scripts/spikes/zoom/record-meeting.mjs --minutes 6
 */

import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { chromium } from 'playwright';
import {
  loadSpikeEnv,
  zoomApi,
  destructiveZoomCall,
  signSdkJwt,
  makeRedactor,
  assertSpikeMeeting,
} from './lib.mjs';

const ROOT = process.cwd();
const env = loadSpikeEnv(ROOT);
const redact = makeRedactor(env);
const args = process.argv.slice(2);
const holdMinutes = Number(args.includes('--minutes') ? args[args.indexOf('--minutes') + 1] : 6);

const meeting = JSON.parse(
  readFileSync(path.join(ROOT, 'scripts/spikes/zoom/out/meeting-recording.json'), 'utf8')
);
// Fail fast on a mis-staged meeting file. NOT the interlock — the mutation below
// carries its own, immediately before the request.
await assertSpikeMeeting(env, meeting.id);
console.log(`meeting ${meeting.id} confirmed as a spike meeting ("${meeting.topic}")`);

// --- Step 2: consent-gated enablement, read-back confirmed (§12) -------------
const patch = await destructiveZoomCall(env, meeting.id, 'PATCH', `/meetings/${meeting.id}`, {
  body: { settings: { auto_recording: 'cloud' } },
});
const readBack = await zoomApi(env, 'GET', `/meetings/${meeting.id}`);
const effective = readBack.body?.settings?.auto_recording;
console.log(`enablement PATCH -> ${patch.status}; read-back effective auto_recording = ${JSON.stringify(effective)}`);
if (effective !== 'cloud') {
  console.error('ABORT: read-back did not confirm cloud recording; refusing to proceed.');
  process.exit(1);
}

// --- ZAK for the host join (§5: fetched at start-click, never persisted) -----
const zakRes = await zoomApi(env, 'GET', `/users/${encodeURIComponent(env.ZOOM_LICENSED_HOST_EMAIL)}/token`, {
  query: { type: 'zak' },
});
if (zakRes.status !== 200 || !zakRes.body?.token) {
  console.error(`ABORT: could not fetch ZAK (${zakRes.status}) ${redact(JSON.stringify(zakRes.body))}`);
  process.exit(1);
}
const zak = zakRes.body.token;
console.log('ZAK acquired (not persisted, not logged)');

// --- Harness server ----------------------------------------------------------
const harnessHtml = readFileSync(path.join(ROOT, 'scripts/spikes/zoom/sdk-harness/index.html'), 'utf8');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(harnessHtml);
});
await new Promise((resolve) => server.listen(4181, '127.0.0.1', resolve));

const browser = await chromium.launch({
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

const roles = [
  { label: 'HOST', userName: 'Anfitrion Spike', role: 1, zak, customerKey: randomUUID().replace(/-/g, '') },
  { label: 'GUEST', userName: 'Invitada Spike', role: 0, zak: null, customerKey: randomUUID().replace(/-/g, '') },
];

/**
 * Finds and clicks the recording-consent dialog. The disclaimer is locked ON at
 * account level, so it appears for every participant; a participant who does not
 * click it never enters the meeting. The dialog text is captured verbatim because
 * §12 distinguishes the STANDARD disclaimer (evidences `recording` only) from a
 * CUSTOM one (all three scopes) — and on Pro, custom text is not entitled (G1).
 */
async function acceptDisclaimer(page, label) {
  const patterns = /continuar|aceptar|de acuerdo|got it|i agree|continue|entiendo/i;
  const deadline = Date.now() + 45_000;
  const seen = [];
  while (Date.now() < deadline) {
    const dialogs = await page.evaluate(() => {
      const texts = [];
      for (const el of document.querySelectorAll('[role="dialog"], .zm-modal, .zmu-dialog')) {
        const t = el.innerText?.trim();
        if (t) texts.push(t.slice(0, 800));
      }
      return texts;
    });
    for (const d of dialogs) if (!seen.includes(d)) seen.push(d);

    const buttons = page.locator('button:visible');
    const count = await buttons.count();
    for (let i = 0; i < count; i += 1) {
      const button = buttons.nth(i);
      const text = ((await button.textContent()) ?? '').trim();
      if (text && patterns.test(text)) {
        await button.click({ timeout: 5000 }).catch(() => {});
        console.log(`  [${label}] clicked consent control: "${text}"`);
        return { clicked: text, dialogs: seen };
      }
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return { clicked: null, dialogs: seen };
}

const sessions = [];
for (const r of roles) {
  const context = await browser.newContext({ permissions: ['camera', 'microphone'] });
  const page = await context.newPage();
  const signature = signSdkJwt(env, { meetingNumber: meeting.id, role: r.role });
  const url = new URL('http://127.0.0.1:4181/');
  url.searchParams.set('mn', String(meeting.id));
  url.searchParams.set('pwd', meeting.password ?? '');
  url.searchParams.set('name', r.userName);
  url.searchParams.set('customerKey', r.customerKey);
  url.searchParams.set('signature', signature);
  url.searchParams.set('sdkKey', env.ZOOM_SDK_CLIENT_ID);
  if (r.zak) url.searchParams.set('zak', r.zak);

  console.log(`[${r.label}] joining as "${r.userName}" role=${r.role}`);
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  sessions.push({ ...r, context, page });
  // The host must be in first so the meeting actually starts and recording engages.
  if (r.role === 1) await new Promise((res) => setTimeout(res, 8000));
}

// Consent dialogs, then wait for terminal join state.
for (const s of sessions) {
  s.consent = await acceptDisclaimer(s.page, s.label);
  try {
    await s.page.waitForFunction(() => ['joined', 'error'].includes(window.__spike?.state), undefined, {
      timeout: 60_000,
    });
  } catch {
    /* fall through — the state snapshot below records whatever happened */
  }
  s.result = await s.page.evaluate(() => window.__spike);
  console.log(
    `[${s.label}] state=${s.result?.state} timeToJoinMs=${s.result?.timeToJoinMs ?? 'n/a'}${
      s.result?.error ? ` error=${String(s.result.error).slice(0, 300)}` : ''
    }`
  );
}

// Some SDK builds raise the disclaimer only once recording actually starts, i.e.
// after join — so sweep once more now that everyone is in.
for (const s of sessions) {
  if (!s.consent.clicked) {
    const second = await acceptDisclaimer(s.page, `${s.label}/post-join`);
    if (second.clicked || second.dialogs.length > 0) s.consent = second;
  }
}

console.log(`\nholding the meeting open ${holdMinutes} min to accumulate recording bytes…`);
await new Promise((r) => setTimeout(r, holdMinutes * 60_000));

const liveState = await zoomApi(env, 'GET', `/meetings/${meeting.id}`);
console.log(`meeting status during call: ${liveState.body?.status}`);
const liveUuid = liveState.body?.uuid;

await browser.close();
server.close();

const out = {
  capturedAt: new Date().toISOString(),
  meetingId: meeting.id,
  uuidAtCreate: meeting.uuid,
  uuidDuringCall: liveUuid,
  enablement: { patchStatus: patch.status, effectiveAfterReadBack: effective },
  participants: sessions.map((s) => ({
    label: s.label,
    userName: s.userName,
    role: s.role,
    customerKey: s.customerKey,
    joinState: s.result?.state,
    timeToJoinMs: s.result?.timeToJoinMs,
    error: s.result?.error,
    consentClicked: s.consent.clicked,
    consentDialogsSeen: s.consent.dialogs,
    events: s.result?.events,
  })),
};
mkdirSync(path.join(ROOT, 'scripts/spikes/zoom/out'), { recursive: true });
writeFileSync(
  path.join(ROOT, 'scripts/spikes/zoom/out/record-meeting-result.json'),
  JSON.stringify(out, null, 2)
);

console.log('\n=== consent dialog capture (G2 input) ===');
for (const s of sessions) {
  console.log(`[${s.label}] clicked: ${JSON.stringify(s.consent.clicked)}`);
  for (const d of s.consent.dialogs) console.log(`  dialog text: ${JSON.stringify(d.slice(0, 400))}`);
}
console.log('\nsaved scripts/spikes/zoom/out/record-meeting-result.json (gitignored)');
console.log(`meeting id ${meeting.id} · uuid during call ${liveUuid}`);
